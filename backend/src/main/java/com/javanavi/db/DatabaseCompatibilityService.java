package com.javanavi.db;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.javanavi.connections.SavedConnectionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.i18n.LocalizedException;
import com.javanavi.jobs.JobProgressSink;
import com.javanavi.model.ApplyChangesResultDto;
import com.javanavi.model.ChangeSetDto;
import com.javanavi.model.ColumnDefinitionDto;
import com.javanavi.model.ColumnDefinitionWithTableDto;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.ConnectionPoolStatusDto;
import com.javanavi.model.ConnectionTestResultDto;
import com.javanavi.model.DatabaseOperationResultDto;
import com.javanavi.model.ForeignKeyDefinitionDto;
import com.javanavi.model.IndexDefinitionDto;
import com.javanavi.model.QueryRequestDto;
import com.javanavi.model.QueryResultDto;
import com.javanavi.model.ResultSetDataDto;
import com.javanavi.model.TableSummaryDto;
import com.javanavi.model.TableRenameDto;
import com.javanavi.model.TriggerDefinitionDto;
import com.javanavi.model.UpdateRowDto;
import com.javanavi.mongodb.MongoCompatibilityService;
import com.javanavi.security.SecretRedactor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class DatabaseCompatibilityService {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Pattern DOLLAR_QUOTE_START = Pattern.compile("\\$[A-Za-z_][A-Za-z0-9_]*\\$|\\$\\$");

    private final DemoDatabaseService demoDatabaseService;
    private final JdbcConnectionFactory jdbcConnectionFactory;
    private final JdbcConnectionPoolRegistry jdbcConnectionPoolRegistry;
    private final SavedConnectionService savedConnectionService;
    private final MongoCompatibilityService mongoCompatibilityService;
    private final I18nMessages messages;
    private final Map<String, RunningQuery> runningQueries = new ConcurrentHashMap<>();

    public DatabaseCompatibilityService(
            DemoDatabaseService demoDatabaseService,
            JdbcConnectionFactory jdbcConnectionFactory
    ) {
        this(demoDatabaseService, jdbcConnectionFactory, new JdbcConnectionPoolRegistry(jdbcConnectionFactory), null, null, new I18nMessages());
    }

    @Autowired
    public DatabaseCompatibilityService(
            DemoDatabaseService demoDatabaseService,
            JdbcConnectionFactory jdbcConnectionFactory,
            JdbcConnectionPoolRegistry jdbcConnectionPoolRegistry,
            SavedConnectionService savedConnectionService,
            MongoCompatibilityService mongoCompatibilityService,
            I18nMessages messages
    ) {
        this.demoDatabaseService = demoDatabaseService;
        this.jdbcConnectionFactory = jdbcConnectionFactory;
        this.jdbcConnectionPoolRegistry = jdbcConnectionPoolRegistry;
        this.savedConnectionService = savedConnectionService;
        this.mongoCompatibilityService = mongoCompatibilityService;
        this.messages = messages;
    }

    public ConnectionTestResultDto testConnection(ConnectionConfigDto config) {
        String unsupportedTunnel = unsupportedNetworkTunnelMessage(config);
        if (unsupportedTunnel != null) {
            return new ConnectionTestResultDto(
                    config == null ? null : config.id(),
                    config == null ? "unknown" : config.driverType(),
                    false,
                    unsupportedTunnel
            );
        }
        if (isMongo(config)) {
            return requireMongoCompatibilityService().testConnection(resolveSavedConnectionSecret(config));
        }
        if (jdbcConnectionFactory.isDemo(config)) {
            return requireDemoDatabaseService().testConnection(config);
        }
        if (!jdbcConnectionFactory.isSupportedExternalDriver(config)) {
            return new ConnectionTestResultDto(
                    config == null ? null : config.id(),
                    config == null ? "unknown" : config.driverType(),
                    false,
                    messages.message("connection.compatProfiles")
            );
        }
        try {
            ConnectionConfigDto resolvedConfig = resolveSavedConnectionSecret(config);
            ConnectionPoolStatusDto status = jdbcConnectionPoolRegistry.openPool(resolvedConfig);
            return new ConnectionTestResultDto(
                    status.connectionId(),
                    status.driverType(),
                    true,
                    messages.message("common.connectionSucceeded")
            );
        } catch (SQLException | IllegalArgumentException error) {
            return new ConnectionTestResultDto(
                    config.id(),
                    jdbcConnectionFactory.normalizeDriver(config),
                    false,
                    SecretRedactor.redact(error.getMessage())
            );
        }
    }

    public ConnectionTestResultDto testSshConnection(ConnectionConfigDto config) {
        try {
            ConnectionConfigDto resolvedConfig = resolveSavedConnectionSecret(config);
            jdbcConnectionFactory.networkTunnelService().testSshConnection(resolvedConfig);
            return new ConnectionTestResultDto(
                    resolvedConfig == null ? null : resolvedConfig.id(),
                    "ssh",
                    true,
                    messages.message("common.connectionSucceeded")
            );
        } catch (IllegalArgumentException error) {
            return new ConnectionTestResultDto(
                    config == null ? null : config.id(),
                    "ssh",
                    false,
                    SecretRedactor.redact(error.getMessage())
            );
        }
    }

    public ConnectionPoolStatusDto openConnectionPool(ConnectionConfigDto config) {
        String unsupportedTunnel = unsupportedNetworkTunnelMessage(config);
        if (unsupportedTunnel != null) {
            throw new IllegalArgumentException(unsupportedTunnel);
        }
        if (isMongo(config)) {
            ConnectionConfigDto resolved = resolveSavedConnectionSecret(config);
            ConnectionTestResultDto result = requireMongoCompatibilityService().testConnection(resolved);
            if (!result.connected()) {
                throw new IllegalArgumentException(result.message());
            }
            Instant now = Instant.now();
            return new ConnectionPoolStatusDto(
                    firstText(resolved == null ? null : resolved.id(), "mongodb-" + UUID.randomUUID()),
                    "mongodb",
                    false,
                    0,
                    0,
                    0,
                    0,
                    now,
                    now
            );
        }
        if (jdbcConnectionFactory.isDemo(config)) {
            ConnectionTestResultDto result = requireDemoDatabaseService().testConnection(config);
            return new ConnectionPoolStatusDto(
                    result.connectionId(),
                    result.driverType(),
                    false,
                    0,
                    0,
                    0,
                    0,
                    Instant.now(),
                    Instant.now()
            );
        }
        return withRedactedSqlErrors(() -> jdbcConnectionPoolRegistry.openPool(resolveSavedConnectionSecret(config)));
    }

    public boolean closeConnectionPool(String connectionId) {
        return jdbcConnectionPoolRegistry.closePool(connectionId);
    }

    public List<ConnectionPoolStatusDto> connectionPoolStatuses() {
        return jdbcConnectionPoolRegistry.statuses();
    }

    public List<String> listDatabases(ConnectionConfigDto config) {
        rejectUnsupportedNetworkTunnel(config);
        if (isMongo(config)) {
            return requireMongoCompatibilityService().listDatabases(resolveSavedConnectionSecret(config));
        }
        return withRedactedSqlErrors(() -> withConnection(config, connection -> listDatabasesOnConnection(connection, config)));
    }

    public List<TableSummaryDto> listTables(ConnectionConfigDto config, String requestedDatabase) {
        rejectUnsupportedNetworkTunnel(config);
        if (isMongo(config)) {
            return requireMongoCompatibilityService().listTables(resolveSavedConnectionSecret(config), requestedDatabase);
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> listTablesOnConnection(connection, config, requestedDatabase, true)));
    }

    public List<TableSummaryDto> listSchemaObjects(ConnectionConfigDto config, String requestedDatabase) {
        if (isMongo(config)) {
            return requireMongoCompatibilityService().listTables(resolveSavedConnectionSecret(config), requestedDatabase);
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> listTablesOnConnection(connection, config, requestedDatabase, false)));
    }

    public List<ColumnDefinitionDto> listColumns(ConnectionConfigDto config, String requestedDatabase, String tableName) {
        if (isMongo(config)) {
            return requireMongoCompatibilityService().listColumns(resolveSavedConnectionSecret(config), requestedDatabase, tableName);
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> listColumnsOnConnection(connection, config, requestedDatabase, tableName)));
    }

    public List<ColumnDefinitionWithTableDto> listAllColumns(ConnectionConfigDto config, String requestedDatabase) {
        if (isMongo(config)) {
            return requireMongoCompatibilityService().listAllColumns();
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> listAllColumnsOnConnection(connection, config, requestedDatabase)));
    }

    public List<IndexDefinitionDto> listIndexes(ConnectionConfigDto config, String requestedDatabase, String tableName) {
        if (isMongo(config)) {
            return requireMongoCompatibilityService().listIndexes(resolveSavedConnectionSecret(config), requestedDatabase, tableName);
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> listIndexesOnConnection(connection, config, requestedDatabase, tableName)));
    }

    public List<ForeignKeyDefinitionDto> listForeignKeys(ConnectionConfigDto config, String requestedDatabase, String tableName) {
        if (isMongo(config)) {
            return requireMongoCompatibilityService().listForeignKeys();
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> listForeignKeysOnConnection(connection, config, requestedDatabase, tableName)));
    }

    public List<TriggerDefinitionDto> listTriggers(ConnectionConfigDto config, String requestedDatabase, String tableName) {
        if (isMongo(config)) {
            return requireMongoCompatibilityService().listTriggers();
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> listTriggersOnConnection(connection, config, requestedDatabase, tableName)));
    }

    public String showCreateTable(ConnectionConfigDto config, String requestedDatabase, String tableName) {
        if (isMongo(config)) {
            return requireMongoCompatibilityService().showCreateTable(requestedDatabase, tableName);
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> showCreateTableOnConnection(connection, config, requestedDatabase, tableName)));
    }

    public List<String> showCreateTables(ConnectionConfigDto config, String requestedDatabase, List<String> tableNames) {
        List<String> names = normalizedTableNames(tableNames);
        if (isMongo(config)) {
            return names.stream()
                    .map(name -> requireMongoCompatibilityService().showCreateTable(requestedDatabase, name))
                    .toList();
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> {
            List<String> ddls = new ArrayList<>();
            for (String name : names) {
                ddls.add(showCreateTableOnConnection(connection, config, requestedDatabase, name));
            }
            return ddls;
        }));
    }

    public QueryResultDto execute(QueryRequestDto request) {
        rejectUnsupportedNetworkTunnel(request == null ? null : request.connection());
        String queryId = normalizedQueryId(request.queryId());
        if (isMongo(request.connection())) {
            return requireMongoCompatibilityService().execute(
                    resolveSavedConnectionSecret(connectionWithRequestedDatabase(request.connection(), request.database())),
                    request.database(),
                    request.sql(),
                    request.normalizedPage(),
                    request.normalizedPageSize(),
                    queryId
            );
        }
        RunningQuery running = registerQuery(queryId);
        ConnectionConfigDto connectionConfig = connectionWithRequestedDatabase(request.connection(), request.database());
        try {
            return withRedactedSqlErrors(() -> withDatabaseConnection(connectionConfig, request.database(), connection -> executeSingleOnConnection(connection, request, queryId, running)));
        } finally {
            runningQueries.remove(queryId, running);
        }
    }

    public List<ResultSetDataDto> executeMulti(QueryRequestDto request) {
        rejectUnsupportedNetworkTunnel(request == null ? null : request.connection());
        if (isMongo(request.connection())) {
            return requireMongoCompatibilityService().executeMulti(
                    resolveSavedConnectionSecret(connectionWithRequestedDatabase(request.connection(), request.database())),
                    request.database(),
                    request.sql()
            );
        }
        String queryId = normalizedQueryId(request.queryId());
        RunningQuery running = registerQuery(queryId);
        ConnectionConfigDto connectionConfig = connectionWithRequestedDatabase(request.connection(), request.database());
        try {
            return withRedactedSqlErrors(() -> withDatabaseConnection(connectionConfig, request.database(), connection -> executeMultiOnConnection(connection, request, running)));
        } finally {
            runningQueries.remove(queryId, running);
        }
    }

    public List<ResultSetDataDto> executeMultiWithProgress(QueryRequestDto request, JobProgressSink progress) {
        rejectUnsupportedNetworkTunnel(request == null ? null : request.connection());
        JobProgressSink sink = progress == null ? JobProgressSink.NOOP : progress;
        if (isMongo(request.connection())) {
            sink.progress(0, 1, "MongoDB", "Executing SQL file");
            List<ResultSetDataDto> result = requireMongoCompatibilityService().executeMulti(
                    resolveSavedConnectionSecret(connectionWithRequestedDatabase(request.connection(), request.database())),
                    request.database(),
                    request.sql()
            );
            sink.progress(1, 1, "MongoDB", messages.message("common.operationSucceeded"));
            return result;
        }
        String queryId = normalizedQueryId(request.queryId());
        RunningQuery running = registerQuery(queryId);
        ConnectionConfigDto connectionConfig = connectionWithRequestedDatabase(request.connection(), request.database());
        try {
            return withRedactedSqlErrors(() -> withDatabaseConnection(connectionConfig, request.database(), connection -> executeMultiWithProgressOnConnection(connection, request, running, sink)));
        } finally {
            runningQueries.remove(queryId, running);
        }
    }

    public boolean cancelQuery(String queryId) {
        String id = requireText(queryId, "queryId");
        RunningQuery running = runningQueries.remove(id);
        if (running == null) {
            return false;
        }
        return running.cancel();
    }

    public ApplyChangesResultDto applyChanges(ConnectionConfigDto config, String requestedDatabase, String tableName, ChangeSetDto changes) {
        if (isMongo(config)) {
            return requireMongoCompatibilityService().applyChanges(resolveSavedConnectionSecret(config), requestedDatabase, tableName, changes);
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> applyChangesOnConnection(connection, config, requestedDatabase, tableName, changes)));
    }

    public DatabaseOperationResultDto clearTables(ConnectionConfigDto config, String requestedDatabase, List<String> tableNames, boolean truncate) {
        return withRedactedSqlErrors(() -> withConnection(config, connection -> clearTablesOnConnection(connection, config, requestedDatabase, tableNames, truncate)));
    }

    public DatabaseOperationResultDto createDatabase(ConnectionConfigDto config, String databaseName) {
        return withRedactedSqlErrors(() -> {
            ConnectionConfigDto runConfig = databaseDdlConnectionConfig(config, "create-database", databaseName);
            return withConnection(runConfig, connection -> executeDatabaseDdl(connection, config, "create-database", databaseName, null, null));
        });
    }

    public DatabaseOperationResultDto dropDatabase(ConnectionConfigDto config, String databaseName) {
        return withRedactedSqlErrors(() -> {
            ConnectionConfigDto runConfig = databaseDdlConnectionConfig(config, "drop-database", databaseName);
            return withConnection(runConfig, connection -> executeDatabaseDdl(connection, config, "drop-database", databaseName, null, null));
        });
    }

    public DatabaseOperationResultDto renameDatabase(ConnectionConfigDto config, String oldName, String newName) {
        return withRedactedSqlErrors(() -> {
            ConnectionConfigDto runConfig = databaseDdlConnectionConfig(config, "rename-database", oldName);
            return withConnection(runConfig, connection -> executeDatabaseDdl(connection, config, "rename-database", oldName, newName, null));
        });
    }

    public DatabaseOperationResultDto dropTable(ConnectionConfigDto config, String requestedDatabase, String tableName) {
        return withRedactedSqlErrors(() -> withConnection(config, connection -> executeDatabaseDdl(connection, config, "drop-table", tableName, null, requestedDatabase)));
    }

    public DatabaseOperationResultDto dropTables(ConnectionConfigDto config, String requestedDatabase, List<String> tableNames) {
        return withRedactedSqlErrors(() -> withConnection(config, connection -> dropTablesOnConnection(connection, config, requestedDatabase, tableNames)));
    }

    public DatabaseOperationResultDto dropView(ConnectionConfigDto config, String requestedDatabase, String viewName) {
        return withRedactedSqlErrors(() -> withConnection(config, connection -> executeDatabaseDdl(connection, config, "drop-view", viewName, null, requestedDatabase)));
    }

    public DatabaseOperationResultDto dropFunction(ConnectionConfigDto config, String requestedDatabase, String functionName) {
        return withRedactedSqlErrors(() -> withConnection(config, connection -> executeDatabaseDdl(connection, config, "drop-function", functionName, null, requestedDatabase)));
    }

    public DatabaseOperationResultDto renameTable(ConnectionConfigDto config, String requestedDatabase, String tableName, String newName) {
        return withRedactedSqlErrors(() -> withConnection(config, connection -> executeDatabaseDdl(connection, config, "rename-table", tableName, newName, requestedDatabase)));
    }

    public DatabaseOperationResultDto renameTables(ConnectionConfigDto config, String requestedDatabase, List<TableRenameDto> renames) {
        return withRedactedSqlErrors(() -> withConnection(config, connection -> renameTablesOnConnection(connection, config, requestedDatabase, renames)));
    }

    public DatabaseOperationResultDto copyTables(ConnectionConfigDto config, String requestedDatabase, List<String> tableNames, String targetPrefix, String targetSuffix, boolean includeData) {
        return copyTablesWithProgress(config, requestedDatabase, tableNames, targetPrefix, targetSuffix, includeData, JobProgressSink.NOOP);
    }

    public DatabaseOperationResultDto copyTablesWithProgress(
            ConnectionConfigDto config,
            String requestedDatabase,
            List<String> tableNames,
            String targetPrefix,
            String targetSuffix,
            boolean includeData,
            JobProgressSink progress
    ) {
        JobProgressSink sink = progress == null ? JobProgressSink.NOOP : progress;
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> copyTablesOnConnection(
                connection,
                config,
                requestedDatabase,
                tableNames,
                targetPrefix,
                targetSuffix,
                includeData,
                sink
        )));
    }

    public DatabaseOperationResultDto renameView(ConnectionConfigDto config, String requestedDatabase, String viewName, String newName) {
        return withRedactedSqlErrors(() -> withConnection(config, connection -> executeDatabaseDdl(connection, config, "rename-view", viewName, newName, requestedDatabase)));
    }

    public Map<String, Object> executeDdlStatements(ConnectionConfigDto config, String requestedDatabase, List<String> statements) {
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection -> {
            List<String> executed = new ArrayList<>();
            try (Statement statement = connection.createStatement()) {
                for (int index = 0; index < statements.size(); index++) {
                    String sql = String.valueOf(statements.get(index)).trim();
                    if (sql.isBlank()) {
                        continue;
                    }
                    statement.execute(sql);
                    executed.add(sql);
                }
            }
            return Map.of("success", true, "executed", executed.size(), "statements", executed);
        }));
    }


    public Map<String, Object> createTableLike(ConnectionConfigDto sourceConfig, String sourceDatabase, ConnectionConfigDto targetConfig, String targetDatabase, String tableName) {
        if (isMongo(sourceConfig) || isMongo(targetConfig)) {
            throw new IllegalArgumentException("Data sync table creation only supports relational JDBC databases.");
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(targetConfig, targetDatabase, connection ->
                createTableLikeOnConnection(connection, sourceConfig, sourceDatabase, targetConfig, targetDatabase, tableName)));
    }

    public Map<String, Object> addMissingColumns(ConnectionConfigDto sourceConfig, String sourceDatabase, ConnectionConfigDto targetConfig, String targetDatabase, String tableName) {
        if (isMongo(sourceConfig) || isMongo(targetConfig)) {
            throw new IllegalArgumentException("Data sync column migration only supports relational JDBC databases.");
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(targetConfig, targetDatabase, connection ->
                addMissingColumnsOnConnection(connection, sourceConfig, sourceDatabase, targetConfig, targetDatabase, tableName)));
    }

    public Map<String, Object> createCompatibleIndexes(ConnectionConfigDto sourceConfig, String sourceDatabase, ConnectionConfigDto targetConfig, String targetDatabase, String tableName) {
        if (isMongo(sourceConfig) || isMongo(targetConfig)) {
            throw new IllegalArgumentException("Data sync index migration only supports relational JDBC databases.");
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(targetConfig, targetDatabase, connection ->
                createCompatibleIndexesOnConnection(connection, sourceConfig, sourceDatabase, targetConfig, targetDatabase, tableName)));
    }

    public ApplyChangesResultDto replaceTableData(ConnectionConfigDto config, String requestedDatabase, String tableName, List<Map<String, Object>> rows) {
        if (isMongo(config)) {
            throw new IllegalArgumentException("Full overwrite data sync only supports relational JDBC databases.");
        }
        return withRedactedSqlErrors(() -> withDatabaseConnection(config, requestedDatabase, connection ->
                replaceTableDataOnConnection(connection, config, requestedDatabase, tableName, rows)));
    }


    private Map<String, Object> createTableLikeOnConnection(
            Connection targetConnection,
            ConnectionConfigDto sourceConfig,
            String sourceDatabase,
            ConnectionConfigDto targetConfig,
            String targetDatabase,
            String tableName
    ) throws SQLException {
        String targetDriver = jdbcConnectionFactory.normalizeDriver(targetConfig);
        TableRef targetRef = tableRef(targetConfig, targetDatabase, tableName);
        if (tableExists(targetConnection, targetRef)) {
            return Map.of("created", false, "table", tableName, "statements", List.of());
        }
        List<ColumnDefinitionDto> sourceColumns = listColumns(sourceConfig, sourceDatabase, tableName);
        if (sourceColumns.isEmpty()) {
            throw new IllegalArgumentException("Source table has no readable columns: " + tableName);
        }
        String sql = createTableSql(targetDriver, targetRef, sourceColumns);
        try (Statement statement = targetConnection.createStatement()) {
            statement.execute(sql);
        }
        return Map.of("created", true, "table", tableName, "statements", List.of(sql));
    }

    private Map<String, Object> addMissingColumnsOnConnection(
            Connection targetConnection,
            ConnectionConfigDto sourceConfig,
            String sourceDatabase,
            ConnectionConfigDto targetConfig,
            String targetDatabase,
            String tableName
    ) throws SQLException {
        String targetDriver = jdbcConnectionFactory.normalizeDriver(targetConfig);
        TableRef targetRef = tableRef(targetConfig, targetDatabase, tableName);
        List<ColumnDefinitionDto> sourceColumns = listColumns(sourceConfig, sourceDatabase, tableName);
        List<ColumnDefinitionDto> targetColumns = readColumns(targetConnection, targetRef, columnKeys(targetConnection, targetRef));
        Map<String, ColumnDefinitionDto> targetByName = byLowerName(targetColumns, ColumnDefinitionDto::name);
        List<String> statements = new ArrayList<>();
        for (ColumnDefinitionDto sourceColumn : sourceColumns) {
            if (targetByName.containsKey(normalizeName(sourceColumn.name()))) {
                continue;
            }
            statements.add("ALTER TABLE " + tableSqlName(targetDriver, targetRef) + " ADD COLUMN " + columnDefinitionSql(targetDriver, sourceColumn) + ";");
        }
        executeStatements(targetConnection, statements);
        return Map.of("added", statements.size(), "table", tableName, "statements", statements);
    }

    private Map<String, Object> createCompatibleIndexesOnConnection(
            Connection targetConnection,
            ConnectionConfigDto sourceConfig,
            String sourceDatabase,
            ConnectionConfigDto targetConfig,
            String targetDatabase,
            String tableName
    ) throws SQLException {
        String targetDriver = jdbcConnectionFactory.normalizeDriver(targetConfig);
        TableRef targetRef = tableRef(targetConfig, targetDatabase, tableName);
        List<IndexDefinitionDto> sourceIndexes = listIndexes(sourceConfig, sourceDatabase, tableName);
        List<IndexDefinitionDto> targetIndexes = readIndexes(targetConnection, targetRef);
        Map<String, List<IndexDefinitionDto>> targetGroups = groupIndexes(targetIndexes);
        List<String> statements = new ArrayList<>();
        int skipped = 0;
        for (List<IndexDefinitionDto> group : groupIndexes(sourceIndexes).values()) {
            if (group.isEmpty() || targetGroups.containsKey(normalizeName(group.get(0).name())) || isPrimaryIndex(group.get(0))) {
                skipped++;
                continue;
            }
            if (!isCompatibleIndexGroup(group)) {
                skipped++;
                continue;
            }
            statements.add(createIndexSql(targetDriver, targetRef, group) + ";");
        }
        executeStatements(targetConnection, statements);
        return Map.of("created", statements.size(), "skipped", skipped, "table", tableName, "statements", statements);
    }

    private ApplyChangesResultDto replaceTableDataOnConnection(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            String tableName,
            List<Map<String, Object>> rows
    ) throws SQLException {
        TableRef ref = tableRef(config, requestedDatabase, tableName);
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        String tableSql = tableSqlName(driver, ref);
        boolean previousAutoCommit = connection.getAutoCommit();
        int inserted = 0;
        int deleted = 0;
        connection.setAutoCommit(false);
        try {
            try (Statement statement = connection.createStatement()) {
                deleted = Math.max(statement.executeUpdate("DELETE FROM " + tableSql), 0);
            }
            for (Map<String, Object> row : nullSafeRows(rows)) {
                Map<String, Object> values = nullSafeMap(row);
                if (values.isEmpty()) {
                    continue;
                }
                String columns = quotedColumns(driver, values.keySet());
                String placeholders = String.join(", ", values.keySet().stream().map(ignored -> "?").toList());
                try (PreparedStatement statement = connection.prepareStatement("INSERT INTO " + tableSql + " (" + columns + ") VALUES (" + placeholders + ")")) {
                    bindValues(statement, values.values());
                    inserted += Math.max(statement.executeUpdate(), 0);
                }
            }
            connection.commit();
            return new ApplyChangesResultDto(inserted, 0, deleted, inserted + deleted);
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    private boolean tableExists(Connection connection, TableRef ref) throws SQLException {
        if (isDuckDbConnection(connection)) {
            String sql = "select count(*) from information_schema.tables where table_name = ? and table_schema not in ('information_schema', 'pg_catalog')";
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, ref.table());
                try (ResultSet rs = statement.executeQuery()) {
                    return rs.next() && rs.getInt(1) > 0;
                }
            }
        }
        try (ResultSet rs = connection.getMetaData().getTables(ref.catalog(), ref.schema(), ref.table(), new String[]{"TABLE"})) {
            return rs.next();
        }
    }

    private static String createTableSql(String driver, TableRef ref, List<ColumnDefinitionDto> sourceColumns) {
        List<String> definitions = new ArrayList<>();
        List<String> primaryKeys = new ArrayList<>();
        for (ColumnDefinitionDto column : sourceColumns) {
            definitions.add("  " + columnDefinitionSql(driver, column));
            if (isPrimaryColumn(column)) {
                primaryKeys.add(quoteIdentifier(driver, column.name()));
            }
        }
        if (!primaryKeys.isEmpty()) {
            definitions.add("  PRIMARY KEY (" + String.join(", ", primaryKeys) + ")");
        }
        return "CREATE TABLE " + tableSqlName(driver, ref) + " (\n" + String.join(",\n", definitions) + "\n)";
    }

    private static String columnDefinitionSql(String driver, ColumnDefinitionDto column) {
        List<String> parts = new ArrayList<>();
        parts.add(quoteIdentifier(driver, column.name()));
        parts.add(typeForTarget(driver, column.type()));
        if (!nullToEmpty(column.defaultValue()).isBlank()) {
            parts.add("DEFAULT " + defaultLiteral(column.defaultValue()));
        }
        if ("NO".equalsIgnoreCase(nullToEmpty(column.nullable()))) {
            parts.add("NOT NULL");
        }
        if ("mysql".equals(driver) && "auto_increment".equalsIgnoreCase(nullToEmpty(column.extra()).trim())) {
            parts.add("AUTO_INCREMENT");
        }
        return String.join(" ", parts);
    }

    private static String typeForTarget(String driver, String rawType) {
        String type = firstText(rawType, "VARCHAR(255)");
        String lower = type.toLowerCase(Locale.ROOT).trim();
        if ("postgresql".equals(driver)) {
            if (lower.contains("tinyint") || lower.contains("mediumint")) return "INTEGER";
            if (lower.contains("datetime")) return "TIMESTAMP";
            if (lower.contains("longtext") || lower.contains("mediumtext")) return "TEXT";
            if (lower.contains("double")) return "DOUBLE PRECISION";
        }
        if ("mysql".equals(driver)) {
            if (lower.equals("text") || lower.equals("character varying")) return "VARCHAR(255)";
            if (lower.equals("boolean")) return "BOOLEAN";
        }
        return type;
    }

    private static String defaultLiteral(String value) {
        String text = nullToEmpty(value).trim();
        if (text.isBlank()) {
            return "";
        }
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.startsWith("'") || lower.matches("-?\\d+(\\.\\d+)?") || "null".equals(lower) || lower.startsWith("current_timestamp") || lower.endsWith("()")) {
            return text;
        }
        return "'" + text.replace("'", "''") + "'";
    }

    private static String createIndexSql(String driver, TableRef ref, List<IndexDefinitionDto> indexes) {
        List<IndexDefinitionDto> sorted = indexes.stream().sorted(Comparator.comparingInt(IndexDefinitionDto::seqInIndex)).toList();
        String columns = sorted.stream().map(IndexDefinitionDto::columnName).map(name -> quoteIdentifier(driver, name)).collect(Collectors.joining(", "));
        boolean unique = sorted.get(0).nonUnique() == 0;
        return (unique ? "CREATE UNIQUE INDEX " : "CREATE INDEX ")
                + quoteIdentifier(driver, sorted.get(0).name())
                + " ON "
                + tableSqlName(driver, ref)
                + " ("
                + columns
                + ")";
    }

    private static boolean isCompatibleIndexGroup(List<IndexDefinitionDto> indexes) {
        return indexes.stream().allMatch(index -> index.subPart() <= 0 && nullToEmpty(index.columnName()).matches("[A-Za-z0-9_]+"));
    }

    private static boolean isPrimaryIndex(IndexDefinitionDto index) {
        String name = nullToEmpty(index.name()).toLowerCase(Locale.ROOT);
        return "primary".equals(name) || "primary_key".equals(name);
    }

    private static boolean isPrimaryColumn(ColumnDefinitionDto column) {
        String key = nullToEmpty(column.key()).toUpperCase(Locale.ROOT);
        return "PRI".equals(key) || "PK".equals(key);
    }

    private static Map<String, ColumnDefinitionDto> byLowerName(List<ColumnDefinitionDto> columns, Function<ColumnDefinitionDto, String> extractor) {
        Map<String, ColumnDefinitionDto> result = new LinkedHashMap<>();
        for (ColumnDefinitionDto column : columns) {
            result.put(normalizeName(extractor.apply(column)), column);
        }
        return result;
    }

    private static Map<String, List<IndexDefinitionDto>> groupIndexes(List<IndexDefinitionDto> indexes) {
        return indexes.stream()
                .collect(Collectors.groupingBy(index -> normalizeName(index.name()), LinkedHashMap::new, Collectors.collectingAndThen(Collectors.toList(),
                        list -> list.stream().sorted(Comparator.comparingInt(IndexDefinitionDto::seqInIndex)).toList())));
    }

    private static String normalizeName(String value) {
        return nullToEmpty(value).trim().toLowerCase(Locale.ROOT);
    }

    private static void executeStatements(Connection connection, List<String> statements) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            for (String sql : statements) {
                if (!nullToEmpty(sql).isBlank()) {
                    statement.execute(sql);
                }
            }
        }
    }

    private QueryResultDto executeSingleOnConnection(Connection connection, QueryRequestDto request, String queryId, RunningQuery running) throws SQLException {
        return executeWithRequestedTransactionMode(connection, request, () -> {
            long started = System.nanoTime();
            String sql = requireText(request.sql(), "sql");
            int page = request.normalizedPage();
            int pageSize = request.normalizedPageSize();
            String executableSql = shouldApplyServerPaging(request, sql) ? pagedSql(sql, page, pageSize) : sql.trim();

            try (Statement statement = connection.createStatement()) {
                configureStatement(statement, request.connection(), running);
                ResultSetDataDto resultSet = executeStatement(statement, executableSql, running);
                long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
                boolean readOnly = !isAffectedRowsResult(resultSet);
                return new QueryResultDto(
                        nullSafeColumns(resultSet.columns()),
                        nullSafeRows(resultSet.rows()),
                        nullSafeRows(resultSet.rows()).size(),
                        page,
                        pageSize,
                        elapsedMs,
                        readOnly,
                        queryId
                );
            }
        });
    }

    private List<ResultSetDataDto> executeMultiOnConnection(Connection connection, QueryRequestDto request, RunningQuery running) throws SQLException {
        if (request.normalizedAutoCommit()) {
            return executeMultiStatementsOnConnection(connection, request, running);
        }
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try {
            List<ResultSetDataDto> resultSets = executeMultiStatementsOnConnection(connection, request, running);
            if (hasStatementFailure(resultSets)) {
                connection.rollback();
                return resultSets;
            }
            connection.commit();
            return resultSets;
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    private List<ResultSetDataDto> executeMultiStatementsOnConnection(Connection connection, QueryRequestDto request, RunningQuery running) throws SQLException {
        List<SqlStatementSlice> statements = splitSQLStatementSlices(request.sql());
        List<ResultSetDataDto> resultSets = new ArrayList<>();
        for (int index = 0; index < statements.size(); index++) {
            SqlStatementSlice statementSlice = statements.get(index);
            String statementSql = statementSlice.sql().trim();
            if (statementSql.isEmpty()) {
                continue;
            }
            try (Statement statement = connection.createStatement()) {
                configureStatement(statement, request.connection(), running);
                ResultSetDataDto resultSet = executeStatement(statement, statementSql, running);
                resultSets.add(withStatementExecutionMetadata(resultSet, statementSlice, index + 1, "success", messages.message("common.operationSucceeded")));
            } catch (SQLException error) {
                if (isQueryCancellation(error)) {
                    throw error;
                }
                resultSets.add(statementFailureResult(statementSlice, index + 1, error, !request.normalizedAutoCommit()));
                return resultSets;
            }
        }
        return resultSets;
    }

    private List<ResultSetDataDto> executeMultiWithProgressOnConnection(Connection connection, QueryRequestDto request, RunningQuery running, JobProgressSink progress) throws SQLException {
        JobProgressSink sink = progress == null ? JobProgressSink.NOOP : progress;
        List<SqlStatementSlice> statements = splitSQLStatementSlices(request.sql());
        int total = Math.max(statements.size(), 1);
        sink.progress(0, total, "", "Preparing SQL file execution");
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        List<ResultSetDataDto> resultSets = new ArrayList<>();
        int executed = 0;
        try {
            for (int index = 0; index < statements.size(); index++) {
                SqlStatementSlice statementSlice = statements.get(index);
                String statementSql = statementSlice.sql().trim();
                if (statementSql.isEmpty()) {
                    continue;
                }
                sink.throwIfCancelled();
                String current = "Statement " + (index + 1) + " lines " + statementSlice.startLine() + "-" + statementSlice.endLine();
                sink.progress(executed, total, current, "Executing SQL statement " + (index + 1) + " / " + total);
                try (Statement statement = connection.createStatement()) {
                    configureStatement(statement, request.connection(), running);
                    ResultSetDataDto resultSet = executeStatement(statement, statementSql, running);
                    resultSets.add(withStatementExecutionMetadata(resultSet, statementSlice, index + 1, "success", messages.message("common.operationSucceeded")));
                    executed++;
                    sink.progress(executed, total, current, "Executed SQL statement " + executed + " / " + total);
                } catch (SQLException error) {
                    if (isQueryCancellation(error)) {
                        throw error;
                    }
                    resultSets.add(statementFailureResult(statementSlice, index + 1, error, true));
                    connection.rollback();
                    return resultSets;
                }
            }
            sink.throwIfCancelled();
            connection.commit();
            sink.progress(total, total, "", "SQL file executed");
            return resultSets;
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    private <T> T executeWithRequestedTransactionMode(Connection connection, QueryRequestDto request, SqlWork<T> work) throws SQLException {
        if (request.normalizedAutoCommit()) {
            return work.execute();
        }
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try {
            T result = work.execute();
            connection.commit();
            return result;
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    private static boolean hasStatementFailure(List<ResultSetDataDto> resultSets) {
        return resultSets.stream().anyMatch(resultSet -> "error".equalsIgnoreCase(nullToEmpty(resultSet.status())));
    }

    private ResultSetDataDto executeStatement(Statement statement, String sql, RunningQuery running) throws SQLException {
        running.throwIfCancelled();
        boolean hasResultSet = statement.execute(sql);
        running.throwIfCancelled();
        if (hasResultSet) {
            try (ResultSet rs = statement.getResultSet()) {
                List<String> columns = columns(rs.getMetaData());
                return new ResultSetDataDto(rows(rs, columns), columns);
            }
        }
        int affectedRows = Math.max(statement.getUpdateCount(), 0);
        return affectedRowsResult(affectedRows);
    }

    private static ResultSetDataDto withStatementExecutionMetadata(
            ResultSetDataDto resultSet,
            SqlStatementSlice statement,
            int statementIndex,
            String status,
            String message
    ) {
        return new ResultSetDataDto(
                nullSafeRows(resultSet.rows()),
                nullSafeColumns(resultSet.columns()),
                statementIndex,
                statement.startLine(),
                statement.endLine(),
                statement.sql(),
                status,
                message,
                null
        );
    }

    private static boolean isQueryCancellation(SQLException error) {
        String message = error.getMessage();
        return message != null && message.toLowerCase(Locale.ROOT).contains("cancel");
    }

    private static ResultSetDataDto statementFailureResult(SqlStatementSlice statement, int statementIndex, SQLException error) {
        return statementFailureResult(statement, statementIndex, error, false);
    }

    private static ResultSetDataDto statementFailureResult(SqlStatementSlice statement, int statementIndex, SQLException error, boolean transactionRolledBack) {
        String message = sqlErrorMessage(error);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("statementIndex", statementIndex);
        row.put("startLine", statement.startLine());
        row.put("endLine", statement.endLine());
        row.put("status", "error");
        row.put("message", message);
        if (transactionRolledBack) {
            row.put("transactionRolledBack", true);
        }
        return new ResultSetDataDto(
                List.of(row),
                transactionRolledBack
                        ? List.of("statementIndex", "startLine", "endLine", "status", "message", "transactionRolledBack")
                        : List.of("statementIndex", "startLine", "endLine", "status", "message"),
                statementIndex,
                statement.startLine(),
                statement.endLine(),
                statement.sql(),
                "error",
                message,
                transactionRolledBack
        );
    }

    private static String sqlErrorMessage(SQLException error) {
        String message = error.getMessage();
        if (message == null || message.isBlank()) {
            return "SQL execution failed";
        }
        return SecretRedactor.redact(message);
    }

    private ApplyChangesResultDto applyChangesOnConnection(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            String tableName,
            ChangeSetDto changes
    ) throws SQLException {
        TableRef ref = tableRef(config, requestedDatabase, tableName);
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        String tableSql = tableSqlName(driver, ref);
        boolean previousAutoCommit = connection.getAutoCommit();
        int inserted = 0;
        int updated = 0;
        int deleted = 0;
        boolean allColumnsLocator = isAllColumnsLocator(changes);
        connection.setAutoCommit(false);
        try {
            for (Map<String, Object> keys : nullSafeRows(changes.deletes())) {
                if (isBlankMap(keys)) {
                    continue;
                }
                String where = whereClause(driver, keys, " AND ");
                if (allColumnsLocator) {
                    ensureSingleRowAllColumnsMatch(connection, tableSql, driver, keys);
                }
                try (PreparedStatement statement = connection.prepareStatement("DELETE FROM " + tableSql + " WHERE " + where)) {
                    bindValues(statement, whereBindValues(keys));
                    deleted += Math.max(statement.executeUpdate(), 0);
                }
            }

            for (UpdateRowDto update : nullSafeUpdates(changes.updates())) {
                Map<String, Object> values = update == null ? Map.of() : nullSafeMap(update.values());
                Map<String, Object> keys = update == null ? Map.of() : nullSafeMap(update.keys());
                if (values.isEmpty()) {
                    continue;
                }
                if (keys.isEmpty()) {
                    throw new SQLException("Update operation requires key columns.");
                }
                String set = assignmentClause(driver, values, ", ");
                String where = whereClause(driver, keys, " AND ");
                if (allColumnsLocator) {
                    ensureSingleRowAllColumnsMatch(connection, tableSql, driver, keys);
                }
                try (PreparedStatement statement = connection.prepareStatement("UPDATE " + tableSql + " SET " + set + " WHERE " + where)) {
                    List<Object> args = new ArrayList<>();
                    args.addAll(values.values());
                    args.addAll(whereBindValues(keys));
                    bindValues(statement, args);
                    updated += Math.max(statement.executeUpdate(), 0);
                }
            }

            for (Map<String, Object> row : nullSafeRows(changes.inserts())) {
                Map<String, Object> values = nullSafeMap(row);
                if (values.isEmpty()) {
                    continue;
                }
                String columns = quotedColumns(driver, values.keySet());
                String placeholders = String.join(", ", values.keySet().stream().map(ignored -> "?").toList());
                try (PreparedStatement statement = connection.prepareStatement("INSERT INTO " + tableSql + " (" + columns + ") VALUES (" + placeholders + ")")) {
                    bindValues(statement, values.values());
                    inserted += Math.max(statement.executeUpdate(), 0);
                }
            }
            connection.commit();
            return new ApplyChangesResultDto(inserted, updated, deleted, inserted + updated + deleted);
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    private static boolean isAllColumnsLocator(ChangeSetDto changes) {
        return changes != null && "all-columns".equalsIgnoreCase(nullToEmpty(changes.locatorStrategy()).trim());
    }

    private static void ensureSingleRowAllColumnsMatch(
            Connection connection,
            String tableSql,
            String driver,
            Map<String, Object> keys
    ) throws SQLException {
        String where = whereClause(driver, keys, " AND ");
        try (PreparedStatement statement = connection.prepareStatement("SELECT COUNT(*) FROM " + tableSql + " WHERE " + where)) {
            bindValues(statement, whereBindValues(keys));
            try (ResultSet rs = statement.executeQuery()) {
                int matched = rs.next() ? rs.getInt(1) : 0;
                if (matched != 1) {
                    throw new SQLException("All-columns row locator matched " + matched + " rows; edit is unsafe.");
                }
            }
        }
    }

    private List<String> listDatabasesOnConnection(Connection connection, ConnectionConfigDto config) throws SQLException {
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        List<String> databases = new ArrayList<>();
        if ("mysql".equals(driver)) {
            try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery("SHOW DATABASES")) {
                while (rs.next()) {
                    String database = rs.getString(1);
                    if (database != null && !database.isBlank() && !isSystemSchema(database)) {
                        databases.add(database);
                    }
                }
            }
        } else if ("sqlite".equals(driver)) {
            try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery("PRAGMA database_list")) {
                while (rs.next()) {
                    String database = firstText(getString(rs, "name"), rs.getString(2));
                    if (database != null && !database.isBlank() && !"temp".equalsIgnoreCase(database)) {
                        databases.add(database);
                    }
                }
            }
        } else if ("duckdb".equals(driver)) {
            try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery("select database_name from duckdb_databases() order by database_name")) {
                while (rs.next()) {
                    String database = rs.getString(1);
                    if (database != null && !database.isBlank()) {
                        databases.add(database);
                    }
                }
            } catch (SQLException ignored) {
                databases.add(firstText(config == null ? null : config.database(), "memory"));
            }
        } else if ("postgresql".equals(driver)) {
            try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(
                    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")) {
                while (rs.next()) {
                    String database = rs.getString(1);
                    if (database != null && !database.isBlank()) {
                        databases.add(database);
                    }
                }
            }
        } else if ("dameng".equals(driver) || "h2".equals(driver) || "demo".equals(driver)) {
            try (ResultSet rs = connection.getMetaData().getSchemas()) {
                while (rs.next()) {
                    String schema = getString(rs, "TABLE_SCHEM");
                    if (schema != null && !schema.isBlank() && !isSystemSchema(schema)) {
                        databases.add(schema);
                    }
                }
            }
        } else {
            try (ResultSet rs = connection.getMetaData().getCatalogs()) {
                while (rs.next()) {
                    String database = rs.getString(1);
                    if (database != null && !database.isBlank()) {
                        databases.add(database);
                    }
                }
            }
            if (databases.isEmpty()) {
                String catalog = firstText(connection.getCatalog(), connection.getSchema(), config == null ? null : config.database(), "default");
                databases.add(catalog);
            }
        }
        databases.sort(String::compareToIgnoreCase);
        return databases;
    }

    private DatabaseOperationResultDto clearTablesOnConnection(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            List<String> tableNames,
            boolean truncate
    ) throws SQLException {
        List<String> names = tableNames == null ? List.of() : tableNames.stream()
                .filter(name -> name != null && !name.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        if (names.isEmpty()) {
            throw new IllegalArgumentException("At least one table is required.");
        }
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        List<String> executed = new ArrayList<>();
        int affected = 0;
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try (Statement statement = connection.createStatement()) {
            for (String name : names) {
                TableRef ref = tableRef(config, requestedDatabase, name);
                String sql = (truncate && !isDeleteBackedTruncate(driver) ? "TRUNCATE TABLE " : "DELETE FROM ") + tableSqlName(driver, ref);
                executed.add(sql);
                affected += Math.max(statement.executeUpdate(sql), 0);
            }
            connection.commit();
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
        return new DatabaseOperationResultDto(truncate ? "truncate" : "clear", names.size(), affected, names, executed);
    }

    private DatabaseOperationResultDto dropTablesOnConnection(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            List<String> tableNames
    ) throws SQLException {
        List<String> names = normalizedTableNames(tableNames);
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        List<String> executed = new ArrayList<>();
        int affected = 0;
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try (Statement statement = connection.createStatement()) {
            for (String name : names) {
                String sql = ddlSql(driver, config, "drop-table", name, null, requestedDatabase);
                executed.add(sql);
                affected += Math.max(statement.executeUpdate(sql), 0);
            }
            connection.commit();
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
        return new DatabaseOperationResultDto("drop-tables", names.size(), affected, names, executed);
    }

    private DatabaseOperationResultDto renameTablesOnConnection(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            List<TableRenameDto> renames
    ) throws SQLException {
        List<TableRenameDto> pairs = normalizedTableRenames(renames);
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        List<String> renamedTables = new ArrayList<>();
        List<String> executed = new ArrayList<>();
        int affected = 0;
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try (Statement statement = connection.createStatement()) {
            for (TableRenameDto pair : pairs) {
                String sql = ddlSql(driver, config, "rename-table", pair.oldName(), pair.newName(), requestedDatabase);
                executed.add(sql);
                affected += Math.max(statement.executeUpdate(sql), 0);
                renamedTables.add(pair.newName());
            }
            connection.commit();
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
        return new DatabaseOperationResultDto("rename-tables", renamedTables.size(), affected, renamedTables, executed);
    }

    private DatabaseOperationResultDto executeDatabaseDdl(
            Connection connection,
            ConnectionConfigDto config,
            String operation,
            String name,
            String newName,
            String requestedDatabase
    ) throws SQLException {
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        String sql = ddlSql(driver, config, operation, name, newName, requestedDatabase);
        try (Statement statement = connection.createStatement()) {
            int affectedRows = Math.max(statement.executeUpdate(sql), 0);
            return new DatabaseOperationResultDto(operation, 1, affectedRows, List.of(), List.of(sql));
        }
    }

    private DatabaseOperationResultDto copyTablesOnConnection(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            List<String> tableNames,
            String targetPrefix,
            String targetSuffix,
            boolean includeData,
            JobProgressSink progress
    ) throws SQLException {
        JobProgressSink sink = progress == null ? JobProgressSink.NOOP : progress;
        List<String> names = normalizedTableNames(tableNames);
        int total = names.size();
        sink.progress(0, total, "", includeData ? "Preparing table backup" : "Preparing table structure copy");
        String prefix = targetPrefix == null ? "" : targetPrefix.trim();
        String suffix = targetSuffix == null ? "_copy" : targetSuffix.trim();
        if (prefix.isBlank() && suffix.isBlank()) {
            throw new LocalizedException("ddl.copyNameRequired");
        }

        String driver = jdbcConnectionFactory.normalizeDriver(config);
        List<String> copiedTables = new ArrayList<>();
        List<String> executed = new ArrayList<>();
        int affected = 0;
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try (Statement statement = connection.createStatement()) {
            for (int index = 0; index < names.size(); index++) {
                String sourceName = names.get(index);
                sink.throwIfCancelled();
                sink.progress(index, total, sourceName, includeData ? "Copying table and data" : "Copying table structure");
                TableRef sourceRef = tableRef(config, requestedDatabase, sourceName);
                String targetTable = prefixedTableName(sourceRef.table(), prefix, suffix);
                TableRef targetRef = sourceRef.withTable(targetTable);
                if (tableExists(connection, targetRef)) {
                    throw new LocalizedException("ddl.targetTableExists", "table", targetTable);
                }

                String createSql = copyTableStructureSql(driver, sourceRef, targetRef, includeData);
                statement.execute(createSql);
                executed.add(createSql);

                sink.throwIfCancelled();
                if (includeData && !copyTableStructureSqlIncludesData(driver)) {
                    String insertSql = copyTableDataSql(driver, sourceRef, targetRef);
                    affected += Math.max(statement.executeUpdate(insertSql), 0);
                    executed.add(insertSql);
                }
                copiedTables.add(targetTable);
                sink.progress(index + 1, total, sourceName, "Table copied");
            }
            sink.throwIfCancelled();
            connection.commit();
        } catch (SQLException | RuntimeException error) {
            connection.rollback();
            throw error;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
        sink.progress(total, total, "", "Copy completed");
        return new DatabaseOperationResultDto(includeData ? "copy-tables-with-data" : "copy-tables", copiedTables.size(), affected, copiedTables, executed);
    }

    private String ddlSql(String driver, ConnectionConfigDto config, String operation, String name, String newName, String requestedDatabase) {
        String objectName = requireText(name, "name");
        return switch (operation) {
            case "create-database" -> {
                if ("h2".equals(driver) || "demo".equals(driver)) {
                    yield "CREATE SCHEMA " + quoteIdentifier(driver, objectName);
                }
                yield "CREATE DATABASE " + quoteIdentifier(driver, objectName);
            }
            case "drop-database" -> {
                if ("h2".equals(driver) || "demo".equals(driver)) {
                    yield "DROP SCHEMA " + quoteIdentifier(driver, objectName);
                }
                yield "DROP DATABASE " + quoteIdentifier(driver, objectName);
            }
            case "rename-database" -> renameDatabaseSql(driver, config, objectName, requireText(newName, "newName"));
            case "drop-table" -> "DROP TABLE " + tableSqlName(driver, tableRef(config, requestedDatabase, objectName));
            case "drop-view" -> "DROP VIEW " + tableSqlName(driver, tableRef(config, requestedDatabase, objectName));
            case "drop-function" -> dropFunctionSql(driver, config, requestedDatabase, objectName);
            case "rename-table" -> renameSql(driver, config, requestedDatabase, objectName, requireText(newName, "newName"), "TABLE");
            case "rename-view" -> renameSql(driver, config, requestedDatabase, objectName, requireText(newName, "newName"), "VIEW");
            default -> throw new IllegalArgumentException("Unsupported DDL operation: " + operation);
        };
    }

    private ConnectionConfigDto databaseDdlConnectionConfig(ConnectionConfigDto config, String operation, String targetDatabase) {
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        String target = requireText(targetDatabase, "database");
        if ("sqlite".equals(driver) || "duckdb".equals(driver)) {
            throw new IllegalArgumentException("File databases do not support create/drop/rename database through the JavaNavi SQL DDL endpoint: " + driver);
        }
        if ("rename-database".equals(operation) && "mysql".equals(driver)) {
            throw new IllegalArgumentException("MySQL/MariaDB-compatible JDBC does not support direct database rename; create a new database and migrate data.");
        }
        if (("drop-database".equals(operation) || "rename-database".equals(operation))
                && "postgresql".equals(driver)
                && config != null
                && target.equalsIgnoreCase(textOrNull(config.database()))) {
            throw new IllegalArgumentException("Current PostgreSQL connection is using the target database; connect to a different database before this operation.");
        }
        if ("mysql".equals(driver) && ("create-database".equals(operation) || "drop-database".equals(operation))) {
            return withDatabase(config, null);
        }
        return config;
    }

    private String renameDatabaseSql(String driver, ConnectionConfigDto config, String oldName, String newName) {
        if (oldName.equalsIgnoreCase(newName)) {
            throw new IllegalArgumentException("New database name must differ from the old database name.");
        }
        if ("mysql".equals(driver)) {
            throw new IllegalArgumentException("MySQL/MariaDB-compatible JDBC does not support direct database rename; create a new database and migrate data.");
        }
        if ("postgresql".equals(driver)) {
            if (config != null && oldName.equalsIgnoreCase(textOrNull(config.database()))) {
                throw new IllegalArgumentException("Current PostgreSQL connection is using the target database; connect to a different database before renaming it.");
            }
            return "ALTER DATABASE " + quoteIdentifier(driver, oldName) + " RENAME TO " + quoteIdentifier(driver, newName);
        }
        if ("h2".equals(driver) || "demo".equals(driver)) {
            return "ALTER SCHEMA " + quoteIdentifier(driver, oldName) + " RENAME TO " + quoteIdentifier(driver, newName);
        }
        throw new IllegalArgumentException("Current driver does not support database rename through the JavaNavi compatibility endpoint: " + driver);
    }

    private String dropFunctionSql(String driver, ConnectionConfigDto config, String requestedDatabase, String rawFunctionName) {
        FunctionRef function = functionRef(config, requestedDatabase, rawFunctionName);
        if ("mysql".equals(driver)) {
            return "DROP FUNCTION " + tableSqlName(driver, function.ref());
        }
        String arguments = function.arguments().isBlank() ? "()" : "(" + function.arguments() + ")";
        return "DROP FUNCTION " + tableSqlName(driver, function.ref()) + arguments;
    }

    private String renameSql(String driver, ConnectionConfigDto config, String requestedDatabase, String oldName, String newName, String objectType) {
        TableRef oldRef = tableRef(config, requestedDatabase, oldName);
        String newTable = splitQualifiedTable(newName).table();
        if ("mysql".equals(driver) && ("TABLE".equals(objectType) || "VIEW".equals(objectType))) {
            TableRef newRef = tableRef(config, requestedDatabase, newTable);
            return "RENAME TABLE " + tableSqlName(driver, oldRef) + " TO " + tableSqlName(driver, newRef);
        }
        return "ALTER " + objectType + " " + tableSqlName(driver, oldRef) + " RENAME TO " + quoteIdentifier(driver, newTable);
    }

    private FunctionRef functionRef(ConnectionConfigDto config, String requestedDatabase, String rawFunctionName) {
        String value = requireText(rawFunctionName, "name");
        int openParen = value.indexOf('(');
        if (openParen < 0) {
            return new FunctionRef(tableRef(config, requestedDatabase, value), "");
        }
        if (!value.endsWith(")")) {
            throw new IllegalArgumentException("Function signature must end with ')'.");
        }
        String name = requireText(value.substring(0, openParen), "name");
        String arguments = value.substring(openParen + 1, value.length() - 1).trim();
        if (arguments.contains(";") || arguments.contains("--") || arguments.contains("/*") || arguments.contains("*/")) {
            throw new IllegalArgumentException("Function signature contains unsupported SQL control characters.");
        }
        return new FunctionRef(tableRef(config, requestedDatabase, name), arguments);
    }

    private List<TableSummaryDto> listTablesOnConnection(Connection connection, ConnectionConfigDto config, String requestedDatabase, boolean tablesOnly) throws SQLException {
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        if ("duckdb".equals(driver)) {
            return duckDbTables(connection, tablesOnly);
        }
        MetadataScope primaryScope = metadataScope(config, requestedDatabase);
        MetadataScope scope = jdbcConnectionFactory.isCustomDsn(config)
                ? rememberedMetadataScope(config).orElse(primaryScope)
                : primaryScope;
        String[] tableTypes = tablesOnly ? new String[]{"TABLE"} : new String[]{"TABLE", "VIEW"};
        List<TableSummaryDto> tables = readTables(connection, scope, tableTypes);
        if (tables.isEmpty() && jdbcConnectionFactory.isCustomDsn(config)) {
            for (MetadataScope alternateScope : customMetadataScopes(connection, config, requestedDatabase, primaryScope)) {
                if (alternateScope.equals(scope)) {
                    continue;
                }
                tables = readTables(connection, alternateScope, tableTypes);
                if (!tables.isEmpty()) {
                    scope = alternateScope;
                    rememberCustomMetadataScope(config, scope);
                    break;
                }
            }
        }
        tables = enrichTableComments(connection, config, requestedDatabase, scope, tables);
        tables.sort((left, right) -> {
            int schemaCompare = nullToEmpty(left.schemaName()).compareToIgnoreCase(nullToEmpty(right.schemaName()));
            if (schemaCompare != 0) {
                return schemaCompare;
            }
            return left.tableName().compareToIgnoreCase(right.tableName());
        });
        return tables;
    }

    private List<TableSummaryDto> readTables(Connection connection, MetadataScope scope, String[] tableTypes) throws SQLException {
        List<TableSummaryDto> tables = new ArrayList<>();
        try (ResultSet rs = connection.getMetaData().getTables(scope.catalog(), scope.schema(), "%", tableTypes)) {
            while (rs.next()) {
                String schema = firstText(getString(rs, "TABLE_SCHEM"), getString(rs, "TABLE_CAT"));
                String table = getString(rs, "TABLE_NAME");
                String type = getString(rs, "TABLE_TYPE");
                if (table == null || table.isBlank() || isSystemSchema(schema)) {
                    continue;
                }
                tables.add(new TableSummaryDto(schema, table, type, nullToEmpty(getString(rs, "REMARKS"))));
            }
        }
        return tables;
    }

    private List<MetadataScope> customMetadataScopes(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            MetadataScope primary
    ) throws SQLException {
        List<MetadataScope> scopes = new ArrayList<>();
        addMetadataScope(scopes, primary.catalog(), primary.schema());
        rememberedMetadataScope(config).ifPresent(scope -> addMetadataScope(scopes, scope.catalog(), scope.schema()));
        String requested = firstText(requestedDatabase, config == null ? null : config.database());
        String currentCatalog = firstText(connection.getCatalog());
        String currentSchema = firstText(connection.getSchema());
        addMetadataScope(scopes, requested, null);
        addMetadataScope(scopes, null, requested);
        addMetadataScope(scopes, requested, requested);
        addMetadataScope(scopes, currentCatalog, null);
        addMetadataScope(scopes, null, currentSchema);
        addMetadataScope(scopes, currentCatalog, currentSchema);
        addMetadataScope(scopes, null, null);
        return scopes;
    }

    private static void addMetadataScope(List<MetadataScope> scopes, String catalog, String schema) {
        MetadataScope scope = new MetadataScope(textOrNull(catalog), textOrNull(schema));
        if (!scopes.contains(scope)) {
            scopes.add(scope);
        }
    }

    private Optional<MetadataScope> rememberedMetadataScope(ConnectionConfigDto config) {
        if (config == null) {
            return Optional.empty();
        }
        if (config.options() != null
                && config.options().containsKey(SavedConnectionService.METADATA_CATALOG_OPTION)
                && config.options().containsKey(SavedConnectionService.METADATA_SCHEMA_OPTION)) {
            return Optional.of(new MetadataScope(
                    metadataScopeOption(config.options().get(SavedConnectionService.METADATA_CATALOG_OPTION)),
                    metadataScopeOption(config.options().get(SavedConnectionService.METADATA_SCHEMA_OPTION))
            ));
        }
        if (savedConnectionService != null) {
            return savedConnectionService.readMetadataScope(config)
                    .map(scope -> new MetadataScope(scope.catalog(), scope.schema()));
        }
        return Optional.empty();
    }

    private void rememberCustomMetadataScope(ConnectionConfigDto config, MetadataScope scope) {
        if (savedConnectionService == null || config == null || scope == null || !jdbcConnectionFactory.isCustomDsn(config)) {
            return;
        }
        savedConnectionService.rememberMetadataScope(config, scope.catalog(), scope.schema());
    }

    private static String metadataScopeOption(String value) {
        if (value == null || value.isBlank() || SavedConnectionService.METADATA_SCOPE_NULL_VALUE.equals(value)) {
            return null;
        }
        return value.trim();
    }

    private List<TableSummaryDto> duckDbTables(Connection connection, boolean tablesOnly) throws SQLException {
        String sql = """
                select table_schema, table_name, table_type
                  from information_schema.tables
                 where table_schema not in ('information_schema', 'pg_catalog')
                   and table_type in (%s)
                 order by table_schema, table_name
                """.formatted(tablesOnly ? "'BASE TABLE'" : "'BASE TABLE', 'VIEW'");
        try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
            List<TableSummaryDto> tables = new ArrayList<>();
            while (rs.next()) {
                String schema = getString(rs, "table_schema");
                String table = getString(rs, "table_name");
                String type = getString(rs, "table_type");
                if (table == null || table.isBlank()) {
                    continue;
                }
                tables.add(new TableSummaryDto(
                        schema,
                        table,
                        type != null && type.toUpperCase(Locale.ROOT).contains("VIEW") ? "VIEW" : "TABLE",
                        ""
                ));
            }
            return tables;
        }
    }

    private List<TableSummaryDto> enrichTableComments(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            MetadataScope scope,
            List<TableSummaryDto> tables
    ) {
        if (tables.isEmpty()) {
            return tables;
        }
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        Map<String, String> comments = new HashMap<>();
        try {
            switch (driver) {
                case "mysql" -> readMySqlTableComments(connection, scope, comments);
                case "postgresql" -> readPostgresTableComments(connection, comments);
                case "sqlserver" -> readSqlServerTableComments(connection, config, requestedDatabase, comments);
                case "oracle", "dameng" -> readOracleLikeTableComments(connection, tables, comments);
                case "clickhouse" -> readClickHouseTableComments(connection, config, requestedDatabase, comments);
                default -> {
                    return tables;
                }
            }
        } catch (SQLException ignored) {
            return tables;
        }
        if (comments.isEmpty()) {
            return tables;
        }

        List<TableSummaryDto> enriched = new ArrayList<>();
        for (TableSummaryDto table : tables) {
            String comment = firstText(
                    table.comment(),
                    comments.get(tableCommentKey(table.schemaName(), table.tableName())),
                    comments.get(tableCommentKey("", table.tableName()))
            );
            enriched.add(new TableSummaryDto(
                    table.schemaName(),
                    table.tableName(),
                    table.tableType(),
                    nullToEmpty(comment)
            ));
        }
        return enriched;
    }

    private void readMySqlTableComments(Connection connection, MetadataScope scope, Map<String, String> comments) throws SQLException {
        String schema = firstText(scope.catalog());
        if (schema == null) {
            return;
        }
        String sql = """
                select table_schema, table_name, table_comment
                  from information_schema.tables
                 where table_schema = ?
                   and table_type in ('BASE TABLE', 'VIEW')
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, schema);
            try (ResultSet rs = statement.executeQuery()) {
                while (rs.next()) {
                    putTableComment(comments, getString(rs, "table_schema"), getString(rs, "table_name"), getString(rs, "table_comment"));
                }
            }
        }
    }

    private void readPostgresTableComments(Connection connection, Map<String, String> comments) throws SQLException {
        String sql = """
                select n.nspname as table_schema,
                       c.relname as table_name,
                       obj_description(c.oid, 'pg_class') as table_comment
                  from pg_class c
                  join pg_namespace n on n.oid = c.relnamespace
                 where c.relkind in ('r', 'v')
                   and n.nspname not in ('information_schema', 'pg_catalog')
                   and n.nspname not like 'pg_toast%'
                """;
        try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
            while (rs.next()) {
                putTableComment(comments, getString(rs, "table_schema"), getString(rs, "table_name"), getString(rs, "table_comment"));
            }
        }
    }

    private void readSqlServerTableComments(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            Map<String, String> comments
    ) throws SQLException {
        String database = firstText(requestedDatabase, config == null ? null : config.database());
        String prefix = database == null ? "" : "[" + database.replace("]", "]]") + "].";
        String sql = """
                select s.name as table_schema,
                       o.name as table_name,
                       cast(ep.value as nvarchar(max)) as table_comment
                  from %ssys.objects o
                  join %ssys.schemas s on s.schema_id = o.schema_id
                  left join %ssys.extended_properties ep
                    on ep.major_id = o.object_id
                   and ep.minor_id = 0
                   and ep.name = 'MS_Description'
                 where o.type in ('U', 'V')
                """.formatted(prefix, prefix, prefix);
        try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
            while (rs.next()) {
                putTableComment(comments, getString(rs, "table_schema"), getString(rs, "table_name"), getString(rs, "table_comment"));
            }
        }
    }

    private void readOracleLikeTableComments(
            Connection connection,
            List<TableSummaryDto> tables,
            Map<String, String> comments
    ) throws SQLException {
        Set<String> owners = new LinkedHashSet<>();
        for (TableSummaryDto table : tables) {
            String owner = firstText(table.schemaName());
            if (owner != null) {
                owners.add(owner.toUpperCase(Locale.ROOT));
            }
        }
        if (owners.isEmpty()) {
            return;
        }
        String sql = "select owner, table_name, comments from all_tab_comments where owner = ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (String owner : owners) {
                statement.setString(1, owner);
                try (ResultSet rs = statement.executeQuery()) {
                    while (rs.next()) {
                        putTableComment(comments, getString(rs, "owner"), getString(rs, "table_name"), getString(rs, "comments"));
                    }
                }
            }
        }
    }

    private void readClickHouseTableComments(
            Connection connection,
            ConnectionConfigDto config,
            String requestedDatabase,
            Map<String, String> comments
    ) throws SQLException {
        String database = firstText(requestedDatabase, config == null ? null : config.database());
        if (database == null) {
            return;
        }
        String sql = "select database, name, comment from system.tables where database = ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, database);
            try (ResultSet rs = statement.executeQuery()) {
                while (rs.next()) {
                    putTableComment(comments, getString(rs, "database"), getString(rs, "name"), getString(rs, "comment"));
                }
            }
        }
    }

    private static void putTableComment(Map<String, String> comments, String schema, String table, String comment) {
        String normalizedTable = firstText(table);
        String normalizedComment = firstText(comment);
        if (normalizedTable == null || normalizedComment == null) {
            return;
        }
        comments.put(tableCommentKey(schema, normalizedTable), normalizedComment);
    }

    private static String tableCommentKey(String schema, String table) {
        return nullToEmpty(schema).trim().toLowerCase(Locale.ROOT)
                + "\u0001"
                + nullToEmpty(table).trim().toLowerCase(Locale.ROOT);
    }

    private List<ColumnDefinitionDto> listColumnsOnConnection(Connection connection, ConnectionConfigDto config, String requestedDatabase, String tableName) throws SQLException {
        TableRef ref = tableRef(config, requestedDatabase, tableName);
        Map<String, String> keys = columnKeys(connection, ref);
        List<ColumnDefinitionDto> columns = readColumns(connection, ref, keys);
        if (columns.isEmpty()) {
            for (String alternate : alternateTableNames(ref.table())) {
                TableRef alternateRef = ref.withTable(alternate);
                keys = columnKeys(connection, alternateRef);
                columns = readColumns(connection, alternateRef, keys);
                if (!columns.isEmpty()) {
                    break;
                }
            }
        }
        return columns;
    }

    private List<ColumnDefinitionWithTableDto> listAllColumnsOnConnection(Connection connection, ConnectionConfigDto config, String requestedDatabase) throws SQLException {
        List<ColumnDefinitionWithTableDto> allColumns = new ArrayList<>();
        for (TableSummaryDto table : listTablesOnConnection(connection, config, requestedDatabase, false)) {
            String qualifiedTable = qualifiedTableForFrontend(config, table);
            for (ColumnDefinitionDto column : listColumnsOnConnection(connection, config, table.schemaName(), table.tableName())) {
                allColumns.add(new ColumnDefinitionWithTableDto(qualifiedTable, column.name(), column.type()));
            }
        }
        return allColumns;
    }

    private List<ColumnDefinitionDto> readColumns(Connection connection, TableRef ref, Map<String, String> keys) throws SQLException {
        if (isDuckDbConnection(connection)) {
            return readDuckDbColumns(connection, ref, keys);
        }
        List<ColumnDefinitionDto> columns = new ArrayList<>();
        try (ResultSet rs = connection.getMetaData().getColumns(ref.catalog(), ref.schema(), ref.table(), "%")) {
            while (rs.next()) {
                String name = getString(rs, "COLUMN_NAME");
                if (name == null || name.isBlank()) {
                    continue;
                }
                columns.add(new ColumnDefinitionDto(
                        name,
                        columnType(rs),
                        nullable(rs),
                        keys.getOrDefault(name.toLowerCase(Locale.ROOT), ""),
                        getString(rs, "COLUMN_DEF"),
                        autoIncrementExtra(rs),
                        nullToEmpty(getString(rs, "REMARKS"))
                ));
            }
        }
        return columns;
    }

    private List<ColumnDefinitionDto> readDuckDbColumns(Connection connection, TableRef ref, Map<String, String> keys) throws SQLException {
        String sql = """
                select column_name, data_type, is_nullable, column_default
                  from information_schema.columns
                 where table_name = ?
                   and table_schema not in ('information_schema', 'pg_catalog')
                 order by ordinal_position
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, ref.table());
            try (ResultSet rs = statement.executeQuery()) {
                List<ColumnDefinitionDto> columns = new ArrayList<>();
                while (rs.next()) {
                    String name = getString(rs, "column_name");
                    if (name == null || name.isBlank()) {
                        continue;
                    }
                    columns.add(new ColumnDefinitionDto(
                            name,
                            nullToEmpty(getString(rs, "data_type")),
                            "NO".equalsIgnoreCase(getString(rs, "is_nullable")) ? "NO" : "YES",
                            keys.getOrDefault(name.toLowerCase(Locale.ROOT), ""),
                            getString(rs, "column_default"),
                            "",
                            ""
                    ));
                }
                return columns;
            }
        }
    }

    private List<IndexDefinitionDto> listIndexesOnConnection(Connection connection, ConnectionConfigDto config, String requestedDatabase, String tableName) throws SQLException {
        TableRef ref = tableRef(config, requestedDatabase, tableName);
        List<IndexDefinitionDto> indexes = readIndexes(connection, ref);
        if (indexes.isEmpty()) {
            for (String alternate : alternateTableNames(ref.table())) {
                indexes = readIndexes(connection, ref.withTable(alternate));
                if (!indexes.isEmpty()) {
                    break;
                }
            }
        }
        return indexes;
    }

    private List<IndexDefinitionDto> readIndexes(Connection connection, TableRef ref) throws SQLException {
        if (isDuckDbConnection(connection)) {
            return readDuckDbIndexes(connection, ref);
        }
        List<IndexDefinitionDto> indexes = new ArrayList<>();
        try (ResultSet rs = connection.getMetaData().getIndexInfo(ref.catalog(), ref.schema(), ref.table(), false, false)) {
            while (rs.next()) {
                String indexName = getString(rs, "INDEX_NAME");
                String columnName = getString(rs, "COLUMN_NAME");
                short type = rs.getShort("TYPE");
                if (indexName == null || columnName == null || type == DatabaseMetaData.tableIndexStatistic) {
                    continue;
                }
                boolean nonUnique = rs.getBoolean("NON_UNIQUE");
                indexes.add(new IndexDefinitionDto(
                        indexName,
                        columnName,
                        nonUnique ? 1 : 0,
                        rs.getShort("ORDINAL_POSITION"),
                        indexTypeName(type),
                        0
                ));
            }
        }
        indexes.sort((left, right) -> {
            int nameCompare = left.name().compareToIgnoreCase(right.name());
            if (nameCompare != 0) {
                return nameCompare;
            }
            return Integer.compare(left.seqInIndex(), right.seqInIndex());
        });
        return indexes;
    }

    private List<IndexDefinitionDto> readDuckDbIndexes(Connection connection, TableRef ref) throws SQLException {
        String sql = "select index_name, expressions, is_unique from duckdb_indexes() where table_name = ? order by index_name";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, ref.table());
            try (ResultSet rs = statement.executeQuery()) {
                List<IndexDefinitionDto> indexes = new ArrayList<>();
                while (rs.next()) {
                    String indexName = getString(rs, "index_name");
                    if (indexName == null || indexName.isBlank()) {
                        continue;
                    }
                    String expression = firstText(getString(rs, "expressions"), "");
                    indexes.add(new IndexDefinitionDto(
                            indexName,
                            expression,
                            rs.getBoolean("is_unique") ? 0 : 1,
                            1,
                            "BTREE",
                            0
                    ));
                }
                return indexes;
            }
        } catch (SQLException ignored) {
            return List.of();
        }
    }

    private List<ForeignKeyDefinitionDto> listForeignKeysOnConnection(Connection connection, ConnectionConfigDto config, String requestedDatabase, String tableName) throws SQLException {
        TableRef ref = tableRef(config, requestedDatabase, tableName);
        List<ForeignKeyDefinitionDto> foreignKeys = readForeignKeys(connection, ref);
        if (foreignKeys.isEmpty()) {
            for (String alternate : alternateTableNames(ref.table())) {
                foreignKeys = readForeignKeys(connection, ref.withTable(alternate));
                if (!foreignKeys.isEmpty()) {
                    break;
                }
            }
        }
        return foreignKeys;
    }

    private List<ForeignKeyDefinitionDto> readForeignKeys(Connection connection, TableRef ref) throws SQLException {
        List<ForeignKeyDefinitionDto> foreignKeys = new ArrayList<>();
        try (ResultSet rs = connection.getMetaData().getImportedKeys(ref.catalog(), ref.schema(), ref.table())) {
            while (rs.next()) {
                String name = firstText(getString(rs, "FK_NAME"), getString(rs, "PK_NAME"));
                String refSchema = getString(rs, "PKTABLE_SCHEM");
                String refTable = getString(rs, "PKTABLE_NAME");
                foreignKeys.add(new ForeignKeyDefinitionDto(
                        nullToEmpty(name),
                        nullToEmpty(getString(rs, "FKCOLUMN_NAME")),
                        qualifiedName(refSchema, refTable),
                        nullToEmpty(getString(rs, "PKCOLUMN_NAME")),
                        nullToEmpty(name)
                ));
            }
        }
        return foreignKeys;
    }

    private List<TriggerDefinitionDto> listTriggersOnConnection(Connection connection, ConnectionConfigDto config, String requestedDatabase, String tableName) throws SQLException {
        TableRef ref = tableRef(config, requestedDatabase, tableName);
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        if ("sqlite".equals(driver)) {
            String sql = "select name, sql from sqlite_master where type = 'trigger' and tbl_name = ? order by name";
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, ref.table());
                try (ResultSet rs = statement.executeQuery()) {
                    List<TriggerDefinitionDto> triggers = new ArrayList<>();
                    while (rs.next()) {
                        String triggerSql = nullToEmpty(getString(rs, "sql"));
                        triggers.add(new TriggerDefinitionDto(
                                getString(rs, "name"),
                                sqliteTriggerToken(triggerSql, "AFTER", "BEFORE", "INSTEAD OF"),
                                sqliteTriggerToken(triggerSql, "INSERT", "UPDATE", "DELETE"),
                                triggerSql
                        ));
                    }
                    return triggers;
                }
            }
        }
        String schema = "mysql".equals(driver) ? ref.catalog() : firstText(ref.schema(), "postgresql".equals(driver) ? "public" : null);
        if (schema == null || schema.isBlank()) {
            return List.of();
        }

        String sql = "mysql".equals(driver)
                ? "select TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT from information_schema.TRIGGERS where TRIGGER_SCHEMA = ? and EVENT_OBJECT_TABLE = ? order by TRIGGER_NAME, EVENT_MANIPULATION"
                : "select trigger_name, action_timing, event_manipulation, action_statement from information_schema.triggers where event_object_schema = ? and event_object_table = ? order by trigger_name, event_manipulation";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, schema);
            statement.setString(2, ref.table());
            try (ResultSet rs = statement.executeQuery()) {
                List<TriggerDefinitionDto> triggers = new ArrayList<>();
                while (rs.next()) {
                    triggers.add(new TriggerDefinitionDto(
                            firstText(getString(rs, "TRIGGER_NAME"), getString(rs, "trigger_name")),
                            firstText(getString(rs, "ACTION_TIMING"), getString(rs, "action_timing")),
                            firstText(getString(rs, "EVENT_MANIPULATION"), getString(rs, "event_manipulation")),
                            firstText(getString(rs, "ACTION_STATEMENT"), getString(rs, "action_statement"))
                    ));
                }
                return triggers;
            }
        } catch (SQLException unsupportedMetadataTable) {
            return List.of();
        }
    }

    private String showCreateTableOnConnection(Connection connection, ConnectionConfigDto config, String requestedDatabase, String tableName) throws SQLException {
        TableRef ref = tableRef(config, requestedDatabase, tableName);
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        if ("mysql".equals(driver)) {
            String sql = "SHOW CREATE TABLE " + mysqlQualifiedIdentifier(ref.catalog(), ref.table());
            try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
                if (rs.next()) {
                    return rs.getString(2);
                }
            }
        }
        if ("postgresql".equals(driver)) {
            return postgresCreateTable(connection, ref);
        }
        if ("sqlite".equals(driver)) {
            return sqliteCreateTable(connection, ref);
        }
        return fallbackCreateTable(connection, config, requestedDatabase, tableName);
    }

    private String sqliteCreateTable(Connection connection, TableRef ref) throws SQLException {
        String sql = "select sql from sqlite_master where name = ? and type in ('table', 'view') order by case type when 'table' then 0 else 1 end limit 1";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, ref.table());
            try (ResultSet rs = statement.executeQuery()) {
                if (rs.next()) {
                    String ddl = getString(rs, "sql");
                    if (ddl != null && !ddl.isBlank()) {
                        return stripTrailingSemicolon(ddl) + ";";
                    }
                }
            }
        }
        return fallbackCreateTable(connection, null, null, ref.table());
    }

    private String postgresCreateTable(Connection connection, TableRef ref) throws SQLException {
        List<PostgresColumn> columns = postgresColumns(connection, ref);
        if (columns.isEmpty()) {
            throw new IllegalArgumentException("No PostgreSQL metadata columns found for table: " + ref.table());
        }

        List<String> lines = new ArrayList<>();
        for (PostgresColumn column : columns) {
            List<String> parts = new ArrayList<>();
            parts.add(quoteIdentifier("postgresql", column.name()));
            parts.add(column.type());
            if (column.defaultValue() != null && !column.defaultValue().isBlank()) {
                parts.add("DEFAULT " + column.defaultValue());
            }
            if (!column.nullable()) {
                parts.add("NOT NULL");
            }
            lines.add("  " + String.join(" ", parts));
        }

        Set<String> constraintBackedIndexes = new LinkedHashSet<>();
        for (PostgresConstraint constraint : postgresConstraints(connection, ref)) {
            constraintBackedIndexes.add(constraint.name());
            lines.add("  CONSTRAINT "
                    + quoteIdentifier("postgresql", constraint.name())
                    + " "
                    + constraint.definition());
        }

        StringBuilder ddl = new StringBuilder();
        ddl.append("CREATE TABLE ")
                .append(tableSqlName("postgresql", ref))
                .append(" (\n")
                .append(String.join(",\n", lines))
                .append("\n);");

        List<String> indexes = postgresIndexes(connection, ref, constraintBackedIndexes);
        if (!indexes.isEmpty()) {
            ddl.append("\n\n").append(String.join("\n", indexes));
        }

        List<String> comments = postgresComments(columns, ref);
        if (!comments.isEmpty()) {
            ddl.append("\n\n").append(String.join("\n", comments));
        }
        return ddl.toString();
    }

    private List<PostgresColumn> postgresColumns(Connection connection, TableRef ref) throws SQLException {
        String sql = """
                select a.attname,
                       pg_catalog.format_type(a.atttypid, a.atttypmod) as formatted_type,
                       a.attnotnull,
                       pg_get_expr(ad.adbin, ad.adrelid) as default_expr,
                       col_description(a.attrelid, a.attnum) as comment
                  from pg_catalog.pg_attribute a
                  join pg_catalog.pg_class c on c.oid = a.attrelid
                  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                  left join pg_catalog.pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
                 where n.nspname = ?
                   and c.relname = ?
                   and a.attnum > 0
                   and not a.attisdropped
                 order by a.attnum
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, firstText(ref.schema(), "public"));
            statement.setString(2, ref.table());
            try (ResultSet rs = statement.executeQuery()) {
                List<PostgresColumn> columns = new ArrayList<>();
                while (rs.next()) {
                    columns.add(new PostgresColumn(
                            getString(rs, "attname"),
                            getString(rs, "formatted_type"),
                            !rs.getBoolean("attnotnull"),
                            getString(rs, "default_expr"),
                            getString(rs, "comment")
                    ));
                }
                return columns;
            }
        }
    }

    private List<PostgresConstraint> postgresConstraints(Connection connection, TableRef ref) throws SQLException {
        String sql = """
                select con.conname,
                       con.contype,
                       pg_get_constraintdef(con.oid, true) as definition
                  from pg_catalog.pg_constraint con
                  join pg_catalog.pg_class c on c.oid = con.conrelid
                  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = ?
                   and c.relname = ?
                 order by case con.contype
                            when 'p' then 1
                            when 'u' then 2
                            when 'f' then 3
                            when 'c' then 4
                            else 5
                          end,
                          con.conname
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, firstText(ref.schema(), "public"));
            statement.setString(2, ref.table());
            try (ResultSet rs = statement.executeQuery()) {
                List<PostgresConstraint> constraints = new ArrayList<>();
                while (rs.next()) {
                    String name = getString(rs, "conname");
                    String definition = getString(rs, "definition");
                    if (name != null && definition != null && !definition.isBlank()) {
                        constraints.add(new PostgresConstraint(name, definition));
                    }
                }
                return constraints;
            }
        }
    }

    private List<String> postgresIndexes(Connection connection, TableRef ref, Set<String> constraintBackedIndexes) throws SQLException {
        String sql = "select indexname, indexdef from pg_catalog.pg_indexes where schemaname = ? and tablename = ? order by indexname";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, firstText(ref.schema(), "public"));
            statement.setString(2, ref.table());
            try (ResultSet rs = statement.executeQuery()) {
                List<String> indexes = new ArrayList<>();
                while (rs.next()) {
                    String indexName = getString(rs, "indexname");
                    String indexDefinition = getString(rs, "indexdef");
                    if (indexName == null || indexDefinition == null || constraintBackedIndexes.contains(indexName)) {
                        continue;
                    }
                    indexes.add(stripTrailingSemicolon(indexDefinition) + ";");
                }
                return indexes;
            }
        }
    }

    private List<String> postgresComments(List<PostgresColumn> columns, TableRef ref) {
        List<String> comments = new ArrayList<>();
        String tableName = tableSqlName("postgresql", ref);
        for (PostgresColumn column : columns) {
            if (column.comment() == null || column.comment().isBlank()) {
                continue;
            }
            comments.add("COMMENT ON COLUMN "
                    + tableName
                    + "."
                    + quoteIdentifier("postgresql", column.name())
                    + " IS '"
                    + column.comment().replace("'", "''")
                    + "';");
        }
        return comments;
    }

    private String fallbackCreateTable(Connection connection, ConnectionConfigDto config, String requestedDatabase, String tableName) throws SQLException {
        TableRef ref = tableRef(config, requestedDatabase, tableName);
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        List<ColumnDefinitionDto> tableColumns = listColumnsOnConnection(connection, config, requestedDatabase, tableName);
        if (tableColumns.isEmpty()) {
            throw new IllegalArgumentException("No metadata columns found for table: " + tableName);
        }
        List<String> lines = new ArrayList<>();
        List<String> primaryKeys = new ArrayList<>();
        for (ColumnDefinitionDto column : tableColumns) {
            List<String> parts = new ArrayList<>();
            parts.add(quoteIdentifier(driver, column.name()));
            parts.add(column.type() == null || column.type().isBlank() ? "text" : column.type());
            if ("NO".equalsIgnoreCase(column.nullable())) {
                parts.add("NOT NULL");
            }
            if (column.defaultValue() != null && !column.defaultValue().isBlank()) {
                parts.add("DEFAULT " + column.defaultValue());
            }
            if (column.extra() != null && !column.extra().isBlank() && "mysql".equals(driver)) {
                parts.add(column.extra());
            }
            lines.add("  " + String.join(" ", parts));
            if ("PRI".equalsIgnoreCase(column.key())) {
                primaryKeys.add(quoteIdentifier(driver, column.name()));
            }
        }
        if (!primaryKeys.isEmpty()) {
            lines.add("  PRIMARY KEY (" + String.join(", ", primaryKeys) + ")");
        }
        return "CREATE TABLE " + tableSqlName(driver, ref) + " (\n"
                + String.join(",\n", lines)
                + "\n);";
    }

    private Map<String, String> columnKeys(Connection connection, TableRef ref) throws SQLException {
        Map<String, String> keys = new HashMap<>();
        try (ResultSet rs = connection.getMetaData().getPrimaryKeys(ref.catalog(), ref.schema(), ref.table())) {
            while (rs.next()) {
                String column = getString(rs, "COLUMN_NAME");
                if (column != null) {
                    keys.put(column.toLowerCase(Locale.ROOT), "PRI");
                }
            }
        }
        try (ResultSet rs = connection.getMetaData().getIndexInfo(ref.catalog(), ref.schema(), ref.table(), false, false)) {
            while (rs.next()) {
                String column = getString(rs, "COLUMN_NAME");
                if (column == null || column.isBlank()) {
                    continue;
                }
                String key = column.toLowerCase(Locale.ROOT);
                if ("PRI".equals(keys.get(key))) {
                    continue;
                }
                boolean nonUnique = rs.getBoolean("NON_UNIQUE");
                keys.putIfAbsent(key, nonUnique ? "MUL" : "UNI");
            }
        }
        if (keys.values().stream().noneMatch(value -> "PRI".equalsIgnoreCase(value)) && isMySqlLikeConnection(connection)) {
            mysqlShowKeysFallback(connection, ref, keys);
        }
        if (keys.isEmpty() && isDuckDbConnection(connection)) {
            String sql = """
                    select kcu.column_name
                      from information_schema.key_column_usage kcu
                      join information_schema.table_constraints tc
                        on tc.constraint_name = kcu.constraint_name
                       and tc.table_name = kcu.table_name
                     where kcu.table_name = ?
                       and tc.constraint_type = 'PRIMARY KEY'
                     order by kcu.ordinal_position
                    """;
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, ref.table());
                try (ResultSet rs = statement.executeQuery()) {
                    while (rs.next()) {
                        String column = getString(rs, "column_name");
                        if (column != null && !column.isBlank()) {
                            keys.put(column.toLowerCase(Locale.ROOT), "PRI");
                        }
                    }
                }
            } catch (SQLException ignored) {
                // DuckDB versions differ in constraint metadata; absence degrades to non-key columns.
            }
        }
        return keys;
    }

    private static void mysqlShowKeysFallback(Connection connection, TableRef ref, Map<String, String> keys) throws SQLException {
        String sql = "SHOW KEYS FROM " + tableSqlName("mysql", ref);
        try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
            while (rs.next()) {
                String column = firstText(getString(rs, "Column_name"), getString(rs, "COLUMN_NAME"));
                if (column == null || column.isBlank()) {
                    continue;
                }
                String keyName = firstText(getString(rs, "Key_name"), getString(rs, "INDEX_NAME"));
                String key = column.toLowerCase(Locale.ROOT);
                if ("PRIMARY".equalsIgnoreCase(nullToEmpty(keyName))) {
                    keys.put(key, "PRI");
                    continue;
                }
                if ("PRI".equalsIgnoreCase(keys.get(key))) {
                    continue;
                }
                int nonUnique = rs.getInt("Non_unique");
                keys.putIfAbsent(key, nonUnique == 0 ? "UNI" : "MUL");
            }
        } catch (SQLException ignored) {
            // Metadata already degraded safely; callers can still use all-columns fallback.
        }
    }

    private TableRef tableRef(ConnectionConfigDto config, String requestedDatabase, String rawTableName) {
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        QualifiedTable qualified = splitQualifiedTable(rawTableName);
        String table = requireText(qualified.table(), "table");
        if ("mysql".equals(driver)) {
            return new TableRef(firstText(qualified.schema(), requestedDatabase, config == null ? null : config.database()), null, table);
        }
        if ("postgresql".equals(driver)) {
            return new TableRef(null, firstText(qualified.schema(), requestedDatabase, "public"), table);
        }
        if ("sqlite".equals(driver) || "duckdb".equals(driver)) {
            return new TableRef(null, null, table);
        }
        return new TableRef(null, firstText(qualified.schema(), requestedDatabase), table);
    }

    private MetadataScope metadataScope(ConnectionConfigDto config, String requestedDatabase) {
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        if ("mysql".equals(driver)) {
            return new MetadataScope(firstText(requestedDatabase, config == null ? null : config.database()), null);
        }
        if ("postgresql".equals(driver)) {
            // JavaNavi's PostgreSQL table list returns all user schemas and prefixes table
            // names with the schema. Keep that behavior so the copied React UI can pass
            // the qualified table name back to the detail metadata endpoints.
            return new MetadataScope(null, null);
        }
        if ("sqlite".equals(driver) || "duckdb".equals(driver)) {
            return new MetadataScope(null, null);
        }
        if (jdbcConnectionFactory.isCustomDsn(config)) {
            return new MetadataScope(firstText(requestedDatabase, config == null ? null : config.database()), null);
        }
        return new MetadataScope(null, textOrNull(requestedDatabase));
    }

    private String qualifiedTableForFrontend(ConnectionConfigDto config, TableSummaryDto table) {
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        if ("postgresql".equals(driver) && table.schemaName() != null && !table.schemaName().isBlank()) {
            return table.schemaName() + "." + table.tableName();
        }
        return table.tableName();
    }


    @FunctionalInterface
    private interface SqlWork<T> {
        T execute() throws SQLException;
    }

    private <T> T withConnection(ConnectionConfigDto config, SqlConnectionWork<T> work) throws SQLException {
        if (jdbcConnectionFactory.isDemo(config)) {
            return requireDemoDatabaseService().withConnection(work::execute);
        }
        ConnectionConfigDto resolvedConfig = resolveSavedConnectionSecret(config);
        try (Connection connection = jdbcConnectionPoolRegistry.openConnection(resolvedConfig)) {
            return work.execute(connection);
        }
    }

    private <T> T withDatabaseConnection(ConnectionConfigDto config, String requestedDatabase, SqlConnectionWork<T> work) throws SQLException {
        return withConnection(config, connection -> {
            prepareConnectionDatabase(connection, config, requestedDatabase);
            return work.execute(connection);
        });
    }

    private ConnectionConfigDto resolveSavedConnectionSecret(ConnectionConfigDto config) {
        ConnectionConfigDto resolved = savedConnectionService == null ? config : savedConnectionService.resolveSavedSecret(config);
        if (resolved == null) {
            return null;
        }
        return resolved;
    }

    private void rejectUnsupportedNetworkTunnel(ConnectionConfigDto config) {
        String message = unsupportedNetworkTunnelMessage(config);
        if (message != null) {
            throw new IllegalArgumentException(message);
        }
    }

    private String unsupportedNetworkTunnelMessage(ConnectionConfigDto config) {
        return null;
    }

    private boolean isMongo(ConnectionConfigDto config) {
        return mongoCompatibilityService != null && mongoCompatibilityService.isMongo(config);
    }

    private MongoCompatibilityService requireMongoCompatibilityService() {
        if (mongoCompatibilityService == null) {
            throw new IllegalArgumentException("MongoDB compatibility service is not available.");
        }
        return mongoCompatibilityService;
    }

    private ConnectionConfigDto connectionWithRequestedDatabase(ConnectionConfigDto config, String requestedDatabase) {
        String database = textOrNull(requestedDatabase);
        if (config == null || database == null) {
            return config;
        }
        if (database.equals(config.database())) {
            return config;
        }
        return config.withDatabase(database);
    }

    private ConnectionConfigDto withDatabase(ConnectionConfigDto config, String database) {
        if (config == null) {
            return null;
        }
        return config.withDatabase(database);
    }

    private DemoDatabaseService requireDemoDatabaseService() {
        if (demoDatabaseService == null) {
            throw new IllegalArgumentException("Demo/H2 connection is not available in this service context.");
        }
        return demoDatabaseService;
    }

    private <T> T withRedactedSqlErrors(SqlSupplier<T> supplier) {
        try {
            return supplier.get();
        } catch (SQLException error) {
            throw new IllegalArgumentException(SecretRedactor.redact(error.getMessage()), error);
        } catch (LocalizedException error) {
            throw error;
        } catch (RuntimeException error) {
            throw new IllegalArgumentException(SecretRedactor.redact(error.getMessage()), error);
        }
    }

    private RunningQuery registerQuery(String queryId) {
        RunningQuery running = new RunningQuery(queryId);
        runningQueries.put(queryId, running);
        return running;
    }

    private String normalizedQueryId(String queryId) {
        return firstText(queryId, "query-" + UUID.randomUUID());
    }

    private void prepareConnectionDatabase(Connection connection, ConnectionConfigDto config, String requestedDatabase) throws SQLException {
        String database = textOrNull(requestedDatabase);
        if (database == null) {
            return;
        }
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        if ("mysql".equals(driver)) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("USE " + mysqlIdentifier(database));
            }
            return;
        }
        if ("postgresql".equals(driver) || "dameng".equals(driver)) {
            connection.setSchema("dameng".equals(driver) ? JdbcConnectionFactory.normalizeDamengSchema(database) : database);
        }
    }

    private void configureStatement(Statement statement, ConnectionConfigDto config, RunningQuery running) throws SQLException {
        int timeoutSeconds = queryTimeoutSeconds(config);
        if (timeoutSeconds > 0) {
            statement.setQueryTimeout(timeoutSeconds);
        }
        running.attach(statement);
    }

    private int queryTimeoutSeconds(ConnectionConfigDto config) {
        Integer timeout = config == null ? null : config.timeout();
        if (timeout == null && config != null && config.options() != null) {
            String value = firstText(config.options().get("queryTimeout"), config.options().get("timeout"));
            if (value != null) {
                try {
                    timeout = Integer.parseInt(value.trim());
                } catch (NumberFormatException ignored) {
                    timeout = null;
                }
            }
        }
        if (timeout == null || timeout <= 0) {
            return 30;
        }
        return Math.min(timeout, 3600);
    }

    private static boolean shouldApplyServerPaging(QueryRequestDto request, String sql) {
        return (request.page() != null || request.pageSize() != null)
                && isReadOnlySelect(sql)
                && !hasTopLevelLimit(sql);
    }

    private static String pagedSql(String sql, int page, int pageSize) {
        int offset = (page - 1) * pageSize;
        return stripTrailingSemicolon(sql.trim()) + " limit " + pageSize + " offset " + offset;
    }

    private static boolean hasTopLevelLimit(String sql) {
        return Pattern.compile("\\blimit\\s+\\d+", Pattern.CASE_INSENSITIVE).matcher(sql).find();
    }

    private static boolean isReadOnlySelect(String sql) {
        String normalized = sql.toLowerCase(Locale.ROOT).replaceFirst("^/\\*.*?\\*/", "").trim();
        return normalized.startsWith("select") || normalized.startsWith("with");
    }

    private static boolean isAffectedRowsResult(ResultSetDataDto resultSet) {
        List<String> columns = nullSafeColumns(resultSet.columns());
        return columns.size() == 1 && "affectedRows".equals(columns.get(0));
    }

    private static ResultSetDataDto affectedRowsResult(int affectedRows) {
        return new ResultSetDataDto(List.of(Map.of("affectedRows", affectedRows)), List.of("affectedRows"));
    }

    private static String columnType(ResultSet rs) throws SQLException {
        String type = nullToEmpty(getString(rs, "TYPE_NAME"));
        int jdbcType = rs.getInt("DATA_TYPE");
        int size = rs.getInt("COLUMN_SIZE");
        int scale = rs.getInt("DECIMAL_DIGITS");
        if (type.contains("(") || size <= 0) {
            return type;
        }
        return switch (jdbcType) {
            case Types.CHAR, Types.VARCHAR, Types.NCHAR, Types.NVARCHAR, Types.BINARY, Types.VARBINARY -> type + "(" + size + ")";
            case Types.DECIMAL, Types.NUMERIC -> scale > 0 ? type + "(" + size + "," + scale + ")" : type + "(" + size + ")";
            default -> type;
        };
    }

    private static String nullable(ResultSet rs) throws SQLException {
        int nullable = rs.getInt("NULLABLE");
        if (nullable == DatabaseMetaData.columnNoNulls) {
            return "NO";
        }
        if (nullable == DatabaseMetaData.columnNullable) {
            return "YES";
        }
        return "";
    }

    private static String autoIncrementExtra(ResultSet rs) throws SQLException {
        String value = getString(rs, "IS_AUTOINCREMENT");
        return "YES".equalsIgnoreCase(value) ? "auto_increment" : "";
    }

    private static String indexTypeName(short type) {
        return switch (type) {
            case DatabaseMetaData.tableIndexClustered -> "CLUSTERED";
            case DatabaseMetaData.tableIndexHashed -> "HASH";
            default -> "BTREE";
        };
    }

    private static List<String> columns(ResultSetMetaData metadata) throws SQLException {
        List<String> columns = new ArrayList<>();
        for (int index = 1; index <= metadata.getColumnCount(); index++) {
            columns.add(metadata.getColumnLabel(index));
        }
        return columns;
    }

    private static List<Map<String, Object>> rows(ResultSet rs, List<String> columns) throws SQLException {
        List<Map<String, Object>> rows = new ArrayList<>();
        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int index = 0; index < columns.size(); index++) {
                row.put(columns.get(index), rs.getObject(index + 1));
            }
            rows.add(row);
        }
        return rows;
    }

    private static List<String> alternateTableNames(String table) {
        Set<String> names = new LinkedHashSet<>();
        names.add(table.toUpperCase(Locale.ROOT));
        names.add(table.toLowerCase(Locale.ROOT));
        return new ArrayList<>(names);
    }

    private static QualifiedTable splitQualifiedTable(String rawTableName) {
        String value = requireText(rawTableName, "table");
        int separator = value.lastIndexOf('.');
        if (separator > 0 && separator < value.length() - 1) {
            return new QualifiedTable(unquoteIdentifier(value.substring(0, separator)), unquoteIdentifier(value.substring(separator + 1)));
        }
        return new QualifiedTable(null, unquoteIdentifier(value));
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Schema metadata " + field + " is required.");
        }
        return value.trim();
    }

    private static String textOrNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String getString(ResultSet rs, String column) {
        try {
            return rs.getString(column);
        } catch (SQLException ignored) {
            return null;
        }
    }

    private static boolean isSystemSchema(String schema) {
        if (schema == null) {
            return false;
        }
        String normalized = schema.toLowerCase(Locale.ROOT);
        return normalized.equals("information_schema")
                || normalized.equals("pg_catalog")
                || normalized.equals("mysql")
                || normalized.equals("performance_schema")
                || normalized.equals("sys")
                || normalized.equals("sqlite_schema")
                || normalized.startsWith("pg_toast");
    }

    private static String qualifiedName(String schema, String table) {
        if (table == null || table.isBlank()) {
            return "";
        }
        if (schema == null || schema.isBlank()) {
            return table;
        }
        return schema + "." + table;
    }

    private static String mysqlQualifiedIdentifier(String catalog, String table) {
        if (catalog == null || catalog.isBlank()) {
            return "`" + escapeBacktick(table) + "`";
        }
        return "`" + escapeBacktick(catalog) + "`.`" + escapeBacktick(table) + "`";
    }

    private static String mysqlIdentifier(String value) {
        return "`" + escapeBacktick(value) + "`";
    }

    private static String tableSqlName(String driver, TableRef ref) {
        if ("mysql".equals(driver)) {
            if (ref.catalog() == null || ref.catalog().isBlank()) {
                return quoteIdentifier(driver, ref.table());
            }
            return quoteIdentifier(driver, ref.catalog()) + "." + quoteIdentifier(driver, ref.table());
        }
        if (ref.schema() == null || ref.schema().isBlank()) {
            return quoteIdentifier(driver, ref.table());
        }
        return quoteIdentifier(driver, ref.schema()) + "." + quoteIdentifier(driver, ref.table());
    }

    private static String quoteIdentifier(String driver, String identifier) {
        String value = identifier == null ? "" : identifier.trim();
        if ("mysql".equals(driver)) {
            return "`" + escapeBacktick(value) + "`";
        }
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private static String sqliteTriggerToken(String sql, String... candidates) {
        String normalized = " " + nullToEmpty(sql).toUpperCase(Locale.ROOT).replaceAll("\\s+", " ") + " ";
        for (String candidate : candidates) {
            String token = " " + candidate.toUpperCase(Locale.ROOT) + " ";
            if (normalized.contains(token)) {
                return candidate;
            }
        }
        return "";
    }

    private static boolean isDeleteBackedTruncate(String driver) {
        return "sqlite".equals(driver) || "duckdb".equals(driver);
    }

    private static List<String> normalizedTableNames(List<String> tableNames) {
        List<String> names = tableNames == null ? List.of() : tableNames.stream()
                .filter(name -> name != null && !name.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        if (names.isEmpty()) {
            throw new IllegalArgumentException("At least one table is required.");
        }
        return names;
    }

    private static List<TableRenameDto> normalizedTableRenames(List<TableRenameDto> renames) {
        if (renames == null || renames.isEmpty()) {
            throw new IllegalArgumentException("At least one table rename is required.");
        }
        List<TableRenameDto> pairs = new ArrayList<>();
        Set<String> oldNames = new LinkedHashSet<>();
        for (TableRenameDto rename : renames) {
            String oldName = requireText(rename == null ? null : rename.oldName(), "oldName");
            String newName = requireText(rename == null ? null : rename.newName(), "newName");
            if (oldName.equals(newName)) {
                continue;
            }
            String key = oldName.toLowerCase(Locale.ROOT);
            if (!oldNames.add(key)) {
                throw new IllegalArgumentException("Duplicate source table in rename request: " + oldName);
            }
            pairs.add(new TableRenameDto(oldName, newName));
        }
        if (pairs.isEmpty()) {
            throw new IllegalArgumentException("At least one changed table rename is required.");
        }
        return pairs;
    }

    private static String prefixedTableName(String sourceTable, String prefix, String suffix) {
        return requireText(nullToEmpty(prefix) + requireText(sourceTable, "table") + nullToEmpty(suffix), "newName");
    }

    private static String copyTableStructureSql(String driver, TableRef sourceRef, TableRef targetRef, boolean includeData) {
        String sourceSqlName = tableSqlName(driver, sourceRef);
        String targetSqlName = tableSqlName(driver, targetRef);
        return switch (driver) {
            case "mysql" -> "CREATE TABLE " + targetSqlName + " LIKE " + sourceSqlName;
            case "postgresql" -> "CREATE TABLE " + targetSqlName + " (LIKE " + sourceSqlName + " INCLUDING ALL)";
            case "sqlserver" -> includeData ? "SELECT * INTO " + targetSqlName + " FROM " + sourceSqlName : "SELECT TOP 0 * INTO " + targetSqlName + " FROM " + sourceSqlName;
            default -> "CREATE TABLE " + targetSqlName + " AS SELECT * FROM " + sourceSqlName + " WHERE 1 = 0";
        };
    }

    private static boolean copyTableStructureSqlIncludesData(String driver) {
        return "sqlserver".equals(driver);
    }

    private static String copyTableDataSql(String driver, TableRef sourceRef, TableRef targetRef) {
        String targetSqlName = tableSqlName(driver, targetRef);
        String sourceSqlName = tableSqlName(driver, sourceRef);
        if ("postgresql".equals(driver)) {
            return "INSERT INTO " + targetSqlName + " OVERRIDING SYSTEM VALUE SELECT * FROM " + sourceSqlName;
        }
        return "INSERT INTO " + targetSqlName + " SELECT * FROM " + sourceSqlName;
    }

    private static boolean isDuckDbConnection(Connection connection) {
        try {
            String product = connection.getMetaData().getDatabaseProductName();
            return product != null && product.toLowerCase(Locale.ROOT).contains("duckdb");
        } catch (SQLException ignored) {
            return false;
        }
    }

    private static boolean isMySqlLikeConnection(Connection connection) {
        try {
            String product = connection.getMetaData().getDatabaseProductName();
            String normalized = product == null ? "" : product.toLowerCase(Locale.ROOT);
            return normalized.contains("mysql") || normalized.contains("mariadb");
        } catch (SQLException ignored) {
            return false;
        }
    }

    private static String escapeBacktick(String value) {
        return value.replace("`", "``");
    }

    private static String unquoteIdentifier(String value) {
        String text = value == null ? "" : value.trim();
        if (text.length() >= 2) {
            char first = text.charAt(0);
            char last = text.charAt(text.length() - 1);
            if ((first == '`' && last == '`') || (first == '"' && last == '"') || (first == '[' && last == ']')) {
                return text.substring(1, text.length() - 1);
            }
        }
        return text;
    }

    private static String quotedColumns(String driver, Set<String> columns) {
        List<String> quoted = new ArrayList<>();
        for (String column : columns) {
            quoted.add(quoteIdentifier(driver, requireText(column, "column")));
        }
        return String.join(", ", quoted);
    }

    private static String assignmentClause(String driver, Map<String, Object> values, String separator) {
        List<String> assignments = new ArrayList<>();
        for (String column : values.keySet()) {
            assignments.add(quoteIdentifier(driver, requireText(column, "column")) + " = ?");
        }
        return String.join(separator, assignments);
    }

    private static String whereClause(String driver, Map<String, Object> keys, String separator) {
        List<String> conditions = new ArrayList<>();
        for (Map.Entry<String, Object> entry : keys.entrySet()) {
            String column = entry.getKey();
            String normalizedColumn = requireText(column, "column");
            String expression = "oracle".equals(driver) && "ROWID".equalsIgnoreCase(normalizedColumn)
                    ? "ROWID"
                    : quoteIdentifier(driver, normalizedColumn);
            conditions.add(entry.getValue() == null ? expression + " IS NULL" : expression + " = ?");
        }
        return String.join(separator, conditions);
    }

    private static List<Object> whereBindValues(Map<String, Object> keys) {
        List<Object> values = new ArrayList<>();
        for (Object value : keys.values()) {
            if (value != null) {
                values.add(value);
            }
        }
        return values;
    }

    private static void bindValues(PreparedStatement statement, Iterable<Object> values) throws SQLException {
        int index = 1;
        for (Object value : values) {
            statement.setObject(index++, normalizeJdbcValue(value));
        }
    }

    private static Object normalizeJdbcValue(Object value) {
        if (value instanceof Map<?, ?> || value instanceof List<?>) {
            try {
                return OBJECT_MAPPER.writeValueAsString(value);
            } catch (JsonProcessingException ignored) {
                return String.valueOf(value);
            }
        }
        return value;
    }

    private static List<Map<String, Object>> nullSafeRows(List<Map<String, Object>> rows) {
        return rows == null ? List.of() : rows;
    }

    private static List<String> nullSafeColumns(List<String> columns) {
        return columns == null ? List.of() : columns;
    }

    private static List<UpdateRowDto> nullSafeUpdates(List<UpdateRowDto> updates) {
        return updates == null ? List.of() : updates;
    }

    private static Map<String, Object> nullSafeMap(Map<String, Object> map) {
        return map == null ? Map.of() : map;
    }

    private static boolean isBlankMap(Map<String, Object> map) {
        return map == null || map.isEmpty();
    }

    static List<String> splitSQLStatements(String sql) {
        return splitSQLStatementSlices(sql).stream().map(SqlStatementSlice::sql).toList();
    }

    static List<SqlStatementSlice> splitSQLStatementSlices(String sql) {
        if (sql == null || sql.isBlank()) {
            return List.of();
        }
        List<SqlStatementSlice> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean singleQuote = false;
        boolean doubleQuote = false;
        boolean backtickQuote = false;
        boolean bracketQuote = false;
        boolean lineComment = false;
        boolean blockComment = false;
        String dollarQuote = null;
        int currentStartLine = 1;
        int line = 1;
        boolean previousWasCarriageReturn = false;

        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            char next = i + 1 < sql.length() ? sql.charAt(i + 1) : '\0';

            if (lineComment) {
                current.append(c);
                if (c == '\n' || c == '\r') {
                    lineComment = false;
                    if (shouldCountNewline(c, previousWasCarriageReturn)) {
                        line++;
                    }
                    previousWasCarriageReturn = c == '\r';
                } else {
                    previousWasCarriageReturn = false;
                }
                continue;
            }
            if (blockComment) {
                current.append(c);
                if (c == '*' && next == '/') {
                    current.append(next);
                    i++;
                    blockComment = false;
                }
                if (c == '\n' || c == '\r') {
                    if (shouldCountNewline(c, previousWasCarriageReturn)) {
                        line++;
                    }
                    previousWasCarriageReturn = c == '\r';
                } else {
                    previousWasCarriageReturn = false;
                }
                continue;
            }
            if (dollarQuote != null) {
                if (sql.startsWith(dollarQuote, i)) {
                    current.append(dollarQuote);
                    i += dollarQuote.length() - 1;
                    dollarQuote = null;
                } else {
                    current.append(c);
                    if (c == '\n' || c == '\r') {
                        if (shouldCountNewline(c, previousWasCarriageReturn)) {
                            line++;
                        }
                        previousWasCarriageReturn = c == '\r';
                    } else {
                        previousWasCarriageReturn = false;
                    }
                }
                continue;
            }

            if (!singleQuote && !doubleQuote && !backtickQuote && !bracketQuote) {
                if (c == '-' && next == '-') {
                    current.append(c).append(next);
                    i++;
                    lineComment = true;
                    continue;
                }
                if (c == '/' && next == '*') {
                    current.append(c).append(next);
                    i++;
                    blockComment = true;
                    continue;
                }
                if (c == '$') {
                    Matcher matcher = DOLLAR_QUOTE_START.matcher(sql.substring(i));
                    if (matcher.lookingAt()) {
                        dollarQuote = matcher.group();
                        current.append(dollarQuote);
                        i += dollarQuote.length() - 1;
                        continue;
                    }
                }
            }

            if (c == '\'' && !doubleQuote && !backtickQuote && !bracketQuote) {
                current.append(c);
                if (singleQuote && next == '\'') {
                    current.append(next);
                    i++;
                } else {
                    singleQuote = !singleQuote;
                }
                continue;
            }
            if (c == '"' && !singleQuote && !backtickQuote && !bracketQuote) {
                doubleQuote = !doubleQuote;
                current.append(c);
                continue;
            }
            if (singleQuote || doubleQuote) {
                current.append(c);
                if (c == '\n' || c == '\r') {
                    if (shouldCountNewline(c, previousWasCarriageReturn)) {
                        line++;
                    }
                    previousWasCarriageReturn = c == '\r';
                } else {
                    previousWasCarriageReturn = false;
                }
                continue;
            }
            if (c == '`' && !singleQuote && !doubleQuote && !bracketQuote) {
                backtickQuote = !backtickQuote;
                current.append(c);
                continue;
            }
            if (c == '[' && !singleQuote && !doubleQuote && !backtickQuote) {
                bracketQuote = true;
                current.append(c);
                continue;
            }
            if (c == ']' && bracketQuote) {
                bracketQuote = false;
                current.append(c);
                continue;
            }
            if (c == ';' && !singleQuote && !doubleQuote && !backtickQuote && !bracketQuote) {
                SqlStatementSlice statement = statementSlice(current.toString(), currentStartLine, line);
                if (statement != null) {
                    statements.add(statement);
                }
                current.setLength(0);
                currentStartLine = line;
                previousWasCarriageReturn = false;
                continue;
            }
            current.append(c);
            if (c == '\n' || c == '\r') {
                if (shouldCountNewline(c, previousWasCarriageReturn)) {
                    line++;
                }
                previousWasCarriageReturn = c == '\r';
            } else {
                previousWasCarriageReturn = false;
            }
        }
        SqlStatementSlice tail = statementSlice(current.toString(), currentStartLine, line);
        if (tail != null) {
            statements.add(tail);
        }
        return statements;
    }

    private static boolean shouldCountNewline(char current, boolean previousWasCarriageReturn) {
        return current == '\r' || (current == '\n' && !previousWasCarriageReturn);
    }

    private static SqlStatementSlice statementSlice(String raw, int rawStartLine, int rawEndLine) {
        String statement = raw.trim();
        if (statement.isEmpty()) {
            return null;
        }
        int leadingLines = leadingBlankLines(raw);
        int trailingLines = trailingBlankLines(raw);
        int startLine = rawStartLine + leadingLines;
        int endLine = Math.max(startLine, rawEndLine - trailingLines);
        return new SqlStatementSlice(statement, startLine, endLine);
    }

    private static int leadingBlankLines(String raw) {
        String[] lines = raw.split("\\R", -1);
        int count = 0;
        for (String line : lines) {
            if (!line.trim().isEmpty()) {
                return count;
            }
            count++;
        }
        return 0;
    }

    private static int trailingBlankLines(String raw) {
        String[] lines = raw.split("\\R", -1);
        int count = 0;
        for (int index = lines.length - 1; index >= 0; index--) {
            if (!lines[index].trim().isEmpty()) {
                return count;
            }
            count++;
        }
        return 0;
    }

    record SqlStatementSlice(String sql, int startLine, int endLine) {}

    private static String stripTrailingSemicolon(String sql) {
        String result = sql;
        while (result.endsWith(";")) {
            result = result.substring(0, result.length() - 1).trim();
        }
        return result;
    }

    @FunctionalInterface
    private interface SqlConnectionWork<T> {
        T execute(Connection connection) throws SQLException;
    }

    @FunctionalInterface
    private interface SqlSupplier<T> {
        T get() throws SQLException;
    }

    private record MetadataScope(String catalog, String schema) {
    }

    private record QualifiedTable(String schema, String table) {
    }

    private record TableRef(String catalog, String schema, String table) {
        TableRef withTable(String nextTable) {
            return new TableRef(catalog, schema, nextTable);
        }
    }

    private record FunctionRef(TableRef ref, String arguments) {
    }

    private record PostgresColumn(String name, String type, boolean nullable, String defaultValue, String comment) {
    }

    private record PostgresConstraint(String name, String definition) {
    }

    private static final class RunningQuery {
        private final String queryId;
        private final Instant started = Instant.now();
        private final AtomicReference<Statement> statement = new AtomicReference<>();
        private final AtomicBoolean cancelled = new AtomicBoolean(false);

        private RunningQuery(String queryId) {
            this.queryId = queryId;
        }

        private void attach(Statement nextStatement) throws SQLException {
            statement.set(nextStatement);
            if (cancelled.get()) {
                nextStatement.cancel();
                throw new SQLException("Query cancelled: " + queryId);
            }
        }

        private boolean cancel() {
            cancelled.set(true);
            Statement current = statement.get();
            if (current != null) {
                try {
                    current.cancel();
                } catch (SQLException ignored) {
                    // The executing thread will surface driver-specific cancellation errors.
                }
            }
            return true;
        }

        private void throwIfCancelled() throws SQLException {
            if (cancelled.get()) {
                throw new SQLException("Query cancelled: " + queryId + " started at " + started);
            }
        }
    }
}
