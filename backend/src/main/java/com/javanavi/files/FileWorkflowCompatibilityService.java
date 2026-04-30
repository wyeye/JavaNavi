package com.javanavi.files;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApplyChangesResultDto;
import com.javanavi.model.ChangeSetDto;
import com.javanavi.model.CompatEventReplayRequestDto;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.QueryRequestDto;
import com.javanavi.model.QueryResultDto;
import com.javanavi.model.TableSummaryDto;
import com.javanavi.security.SecretRedactor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class FileWorkflowCompatibilityService {
    private static final TypeReference<List<Map<String, Object>>> ROW_LIST_TYPE = new TypeReference<>() {};
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Pattern SAFE_TABLE_PATTERN = Pattern.compile("[A-Za-z0-9_.$\\\"]+");

    private final ObjectMapper objectMapper;
    private final DatabaseCompatibilityService databaseCompatibilityService;
    private final CompatEventPublisher publisher;
    private final CompatEventFixtures fixtures;
    private final I18nMessages messages;
    private final Path dataDirectory;
    private final Path exportDirectory;
    private final Path importDirectory;
    private final Path sqlWorkspaceDirectory;
    private final Path databaseFileDirectory;
    private final Path sshKeyDirectory;

    public FileWorkflowCompatibilityService(
            SecurityProperties securityProperties,
            ObjectMapper objectMapper,
            DatabaseCompatibilityService databaseCompatibilityService,
            CompatEventPublisher publisher,
            CompatEventFixtures fixtures,
            I18nMessages messages
    ) {
        this.objectMapper = objectMapper;
        this.databaseCompatibilityService = databaseCompatibilityService;
        this.publisher = publisher;
        this.fixtures = fixtures;
        this.messages = messages;
        this.dataDirectory = Path.of(securityProperties.getDataDirectory()).toAbsolutePath().normalize();
        this.exportDirectory = dataDirectory.resolve("exports").normalize();
        this.importDirectory = dataDirectory.resolve("imports").normalize();
        this.sqlWorkspaceDirectory = dataDirectory.resolve("sql-workspace").normalize();
        this.databaseFileDirectory = dataDirectory.resolve("database-files").normalize();
        this.sshKeyDirectory = dataDirectory.resolve("ssh-keys").normalize();
    }

    public String openSqlFile() {
        Path file = sqlWorkspaceDirectory.resolve("open-sql-sample.sql").normalize();
        ensureManagedPath(file, sqlWorkspaceDirectory);
        try {
            Files.createDirectories(file.getParent());
            if (!Files.exists(file)) {
                Files.writeString(file, "select * from demo_connections;\n", StandardCharsets.UTF_8);
            }
            long size = Files.size(file);
            if (size > 50L * 1024L * 1024L) {
                return objectMapper.writeValueAsString(orderedMap(
                        "isLargeFile", true,
                        "filePath", file.toString(),
                        "fileSize", size,
                        "fileSizeMB", String.format(Locale.ROOT, "%.1f", size / 1024.0 / 1024.0),
                        "webManaged", true
                ));
            }
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to open JavaNavi SQL workspace file.", error);
        }
    }

    public Map<String, Object> selectDatabaseFile(String currentPath, String driverType) {
        String normalizedType = normalizeFileToken(driverType, "database");
        String extension = switch (normalizedType) {
            case "duckdb" -> ".duckdb";
            case "sqlite" -> ".sqlite";
            default -> ".db";
        };
        Path file = databaseFileDirectory.resolve(normalizedType + "-database-upload-placeholder" + extension).normalize();
        return preparePlaceholder(file, databaseFileDirectory, "JavaNavi managed database-file upload placeholder\n", orderedMap(
                "driverType", normalizedType,
                "browserUploadRequired", true,
                "currentPath", SecretRedactor.redact(text(currentPath))
        ));
    }

    public Map<String, Object> selectSshKeyFile(String currentPath) {
        Path file = sshKeyDirectory.resolve("ssh-key-upload-placeholder.pem").normalize();
        return preparePlaceholder(file, sshKeyDirectory, "JavaNavi managed SSH key upload placeholder; no private key material is stored here.\n", orderedMap(
                "runtimeExcluded", true,
                "browserUploadRequired", true,
                "currentPath", SecretRedactor.redact(text(currentPath))
        ));
    }

    public String importConfigFile() {
        Path file = importDirectory.resolve("connections-import-placeholder.json").normalize();
        ensureManagedPath(file, importDirectory);
        try {
            Files.createDirectories(file.getParent());
            if (!Files.exists(file)) {
                Files.writeString(file, "[]\n", StandardCharsets.UTF_8);
            }
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JavaNavi managed config import file.", error);
        }
    }

    public Map<String, Object> importData(Map<String, Object> input) {
        String tableName = stringValue(input, "table", "tableName");
        Path file = sampleImportFile(tableName);
        publishImportProgress(file.getFileName().toString(), 0, 1, 0, 0);
        return orderedMap(
                "filePath", file.toString(),
                "path", file.toString(),
                "table", tableName,
                "webManaged", true,
                "browserUploadRequired", true,
                "message", "JavaNavi Web prepared a managed import file placeholder for browser upload/preview."
        );
    }

    public Map<String, Object> previewImportFile(String filePath) {
        Path file = resolveImportPath(filePath);
        List<Map<String, Object>> rows = parseImportRows(file);
        List<String> columns = columnsForRows(rows);
        List<Map<String, Object>> preview = rows.size() > 5 ? rows.subList(0, 5) : rows;
        return orderedMap(
                "columns", columns,
                "totalRows", rows.size(),
                "previewRows", preview,
                "filePath", file.toString(),
                "webManaged", true
        );
    }

    public Map<String, Object> importDataWithProgress(Map<String, Object> input) {
        String filePath = stringValue(input, "filePath", "path");
        Path file = resolveImportPath(filePath);
        List<Map<String, Object>> rows = parseImportRows(file);
        int total = rows.size();
        publishImportProgress(file.getFileName().toString(), total, total, total, 0);
        if (booleanValue(input == null ? null : input.get("applyToDatabase"), false)
                || booleanValue(input == null ? null : input.get("apply"), false)
                || booleanValue(input == null ? null : input.get("execute"), false)) {
            String tableName = requireSafeTableName(stringValue(input, "table", "tableName"));
            String database = stringValue(input, "database", "dbName");
            ConnectionConfigDto connection = connectionConfig(input);
            List<String> columns = columnsForRows(rows);
            if (!columns.isEmpty()) {
                createImportTableIfNeeded(connection, database, tableName, columns);
            }
            ApplyChangesResultDto result = databaseCompatibilityService.applyChanges(
                    connection,
                    database,
                    tableName,
                    new ChangeSetDto(rows, List.of(), List.of())
            );
            int failed = Math.max(0, total - result.insertedRows());
            return orderedMap(
                    "success", result.insertedRows(),
                    "failed", failed,
                    "total", total,
                    "errorLogs", failed == 0 ? List.of() : List.of("Some rows were not inserted; inspect database constraints."),
                    "errorSummary", "Imported: " + result.insertedRows() + ", Failed: " + failed,
                    "dryRun", false,
                    "appliedToDatabase", true,
                    "insertedRows", result.insertedRows(),
                    "affectedRows", result.affectedRows(),
                    "table", tableName,
                    "filePath", file.toString(),
                    "message", "JavaNavi Web import compatibility inserted parsed rows into the managed JDBC target."
            );
        }
        return orderedMap(
                "success", total,
                "failed", 0,
                "total", total,
                "errorLogs", List.of(),
                "errorSummary", "Imported: " + total + ", Failed: 0",
                "dryRun", true,
                "filePath", file.toString(),
                "message", "JavaNavi Web import compatibility parsed the managed file and emitted progress; database mutation remains disabled for this browser-safe slice."
        );
    }

    private void createImportTableIfNeeded(ConnectionConfigDto connection, String database, String tableName, List<String> columns) {
        String driver = normalizeDriverType(connection == null ? null : connection.driverType());
        String columnSql = columns.stream()
                .map(column -> quoteIdentifier(driver, column) + " varchar(4000)")
                .reduce((left, right) -> left + ", " + right)
                .orElse("");
        if (columnSql.isBlank()) {
            return;
        }
        String sql = "CREATE TABLE IF NOT EXISTS " + tableSqlName(driver, connection, database, tableName) + " (" + columnSql + ")";
        databaseCompatibilityService.execute(new QueryRequestDto(
                connection,
                database,
                sql,
                1,
                1,
                "import-ddl-" + Instant.now().toEpochMilli()
        ));
    }

    public Map<String, Object> exportData(List<Map<String, Object>> rows, List<String> columns, String defaultName, String format) {
        List<String> resolvedColumns = columns == null || columns.isEmpty() ? columnsForRows(rows) : columns;
        Path file = writeRowsExport(rows == null ? List.of() : rows, resolvedColumns, defaultName, format, normalizeFileToken(defaultName, "export"));
        return exportResult(file, rows == null ? 0 : rows.size(), resolvedColumns, format, false);
    }

    public Map<String, Object> exportQuery(Map<String, Object> input) {
        String sql = stringValue(input, "query", "sql").trim();
        if (!isReadOnlyQuery(sql)) {
            throw new IllegalArgumentException(messages.message("files.selectOnlyExport"));
        }
        ConnectionConfigDto connection = connectionConfig(input);
        String database = stringValue(input, "database", "dbName");
        QueryResultDto result = databaseCompatibilityService.execute(new QueryRequestDto(connection, database, sql, 1, 500, "export-" + Instant.now().toEpochMilli()));
        Path file = writeRowsExport(result.rows(), result.columns(), stringValue(input, "defaultName", "name"), stringValue(input, "format"), "query-export");
        return exportResult(file, result.rowCount(), result.columns(), stringValue(input, "format"), false);
    }

    public Map<String, Object> exportTable(Map<String, Object> input) {
        String table = requireSafeTableName(stringValue(input, "table", "tableName"));
        input = new LinkedHashMap<>(input == null ? Map.of() : input);
        input.put("query", "select * from " + table);
        input.putIfAbsent("defaultName", table);
        return exportQuery(input);
    }

    public Map<String, Object> exportTablesSql(Map<String, Object> input, boolean includeSchema, boolean includeData) {
        ConnectionConfigDto connection = connectionConfig(input);
        String database = stringValue(input, "database", "dbName");
        List<String> tableNames = tableNames(input);
        if (tableNames.isEmpty()) {
            tableNames = databaseCompatibilityService.listTables(connection, database).stream()
                    .map(TableSummaryDto::tableName)
                    .filter(value -> value != null && !value.isBlank())
                    .toList();
        }
        String baseName = normalizeFileToken(database, "database") + "-" + (includeSchema && includeData ? "backup" : includeSchema ? "schema" : "data");
        Path file = exportDirectory.resolve(baseName + "-" + Instant.now().toEpochMilli() + ".sql").normalize();
        ensureManagedPath(file, exportDirectory);
        try {
            Files.createDirectories(file.getParent());
            StringBuilder sql = new StringBuilder();
            sql.append("-- JavaNavi SQL export compatibility file\n");
            sql.append("-- database: ").append(database.isBlank() ? "<default>" : database).append("\n");
            for (String table : tableNames) {
                String safeTable = requireSafeTableName(table);
                if (includeSchema) {
                    sql.append("\n-- Schema for ").append(safeTable).append("\n");
                    try {
                        sql.append(databaseCompatibilityService.showCreateTable(connection, database, safeTable)).append(";\n");
                    } catch (RuntimeException error) {
                        sql.append("-- Schema unavailable in JavaNavi Web export smoke: ").append(SecretRedactor.redact(error.getMessage())).append("\n");
                    }
                }
                if (includeData) {
                    sql.append("\n-- Data for ").append(safeTable).append("\n");
                    try {
                        QueryResultDto result = databaseCompatibilityService.execute(new QueryRequestDto(connection, database, "select * from " + safeTable, 1, 500, "export-" + Instant.now().toEpochMilli()));
                        appendInsertStatements(sql, safeTable, result.rows(), result.columns());
                    } catch (RuntimeException error) {
                        sql.append("-- Data unavailable in JavaNavi Web export smoke: ").append(SecretRedactor.redact(error.getMessage())).append("\n");
                    }
                }
            }
            Files.writeString(file, sql.toString(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi SQL export.", error);
        }
        return exportResult(file, tableNames.size(), List.of("sql"), "sql", false);
    }

    public Map<String, Object> exportDatabaseSql(Map<String, Object> input) {
        boolean includeData = Boolean.TRUE.equals(input == null ? null : input.get("includeData"));
        return exportTablesSql(input, true, includeData);
    }

    private Path writeRowsExport(List<Map<String, Object>> rows, List<String> columns, String defaultName, String format, String fallbackName) {
        String resolvedFormat = normalizeFormat(format);
        String baseName = normalizeFileToken(defaultName, fallbackName);
        Path file = exportDirectory.resolve(baseName + "-" + Instant.now().toEpochMilli() + "." + resolvedFormat).normalize();
        ensureManagedPath(file, exportDirectory);
        try {
            Files.createDirectories(file.getParent());
            String content = switch (resolvedFormat) {
                case "csv" -> toCsv(rows, columns);
                case "sql" -> toSqlInserts(baseName, rows, columns);
                default -> objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(rows);
            };
            Files.writeString(file, content, StandardCharsets.UTF_8);
            return file;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi export file.", error);
        }
    }

    private Map<String, Object> exportResult(Path file, int rowCount, List<String> columns, String requestedFormat, boolean dryRun) {
        try {
            return orderedMap(
                    "path", file.toString(),
                    "filePath", file.toString(),
                    "filename", file.getFileName().toString(),
                    "format", normalizeFormat(requestedFormat),
                    "rows", rowCount,
                    "rowCount", rowCount,
                    "columns", columns == null ? List.of() : columns,
                    "size", Files.size(file),
                    "downloadUrl", "/api/v1/files/download/" + file.getFileName(),
                    "webManaged", true,
                    "dryRun", dryRun
            );
        } catch (IOException error) {
            throw new IllegalStateException("Unable to inspect JavaNavi export file.", error);
        }
    }

    private List<Map<String, Object>> parseImportRows(Path file) {
        try {
            String content = Files.readString(file, StandardCharsets.UTF_8).trim();
            if (content.isBlank()) {
                return List.of();
            }
            String lower = file.getFileName().toString().toLowerCase(Locale.ROOT);
            if (lower.endsWith(".json")) {
                if (content.startsWith("[")) {
                    return objectMapper.readValue(content, ROW_LIST_TYPE);
                }
                return List.of(objectMapper.readValue(content, MAP_TYPE));
            }
            return parseCsv(content);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to parse JavaNavi import file.", error);
        }
    }

    private List<Map<String, Object>> parseCsv(String content) {
        List<String> lines = content.lines().filter(line -> !line.isBlank()).toList();
        if (lines.isEmpty()) {
            return List.of();
        }
        List<String> headers = splitCsvLine(lines.get(0));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int index = 1; index < lines.size(); index++) {
            List<String> values = splitCsvLine(lines.get(index));
            Map<String, Object> row = new LinkedHashMap<>();
            for (int column = 0; column < headers.size(); column++) {
                row.put(headers.get(column), column < values.size() ? values.get(column) : "");
            }
            rows.add(row);
        }
        return rows;
    }

    private List<String> splitCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < line.length(); index++) {
            char ch = line.charAt(index);
            if (ch == '"') {
                if (quoted && index + 1 < line.length() && line.charAt(index + 1) == '"') {
                    current.append('"');
                    index++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch == ',' && !quoted) {
                values.add(current.toString());
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        values.add(current.toString());
        return values;
    }

    private String toCsv(List<Map<String, Object>> rows, List<String> columns) {
        StringBuilder builder = new StringBuilder();
        builder.append(csvLine(columns)).append('\n');
        for (Map<String, Object> row : rows) {
            builder.append(csvLine(columns.stream().map(row::get).toList())).append('\n');
        }
        return builder.toString();
    }

    private String csvLine(List<?> values) {
        return values.stream()
                .map(value -> String.valueOf(value == null ? "" : value))
                .map(value -> value.contains(",") || value.contains("\"") || value.contains("\n")
                        ? "\"" + value.replace("\"", "\"\"") + "\""
                        : value)
                .reduce((left, right) -> left + "," + right)
                .orElse("");
    }

    private String toSqlInserts(String tableName, List<Map<String, Object>> rows, List<String> columns) {
        StringBuilder builder = new StringBuilder();
        builder.append("-- JavaNavi data export compatibility SQL\n");
        appendInsertStatements(builder, normalizeFileToken(tableName, "export_table"), rows, columns);
        return builder.toString();
    }

    private void appendInsertStatements(StringBuilder builder, String tableName, List<Map<String, Object>> rows, List<String> columns) {
        if (columns == null || columns.isEmpty()) {
            builder.append("-- (no columns)\n");
            return;
        }
        if (rows == null || rows.isEmpty()) {
            builder.append("-- (0 rows)\n");
            return;
        }
        String columnSql = columns.stream().map(FileWorkflowCompatibilityService::quoteIdentifier).reduce((left, right) -> left + ", " + right).orElse("");
        for (Map<String, Object> row : rows) {
            String values = columns.stream().map(column -> sqlLiteral(row.get(column))).reduce((left, right) -> left + ", " + right).orElse("");
            builder.append("INSERT INTO ").append(tableName).append(" (").append(columnSql).append(") VALUES (").append(values).append(");\n");
        }
    }

    private Path sampleImportFile(String tableName) {
        String name = normalizeFileToken(tableName, "import") + "-sample.csv";
        Path file = importDirectory.resolve(name).normalize();
        ensureManagedPath(file, importDirectory);
        try {
            Files.createDirectories(file.getParent());
            if (!Files.exists(file)) {
                Files.writeString(file, "id,name\n1,JavaNavi Import Preview\n", StandardCharsets.UTF_8);
            }
            return file;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to prepare JavaNavi import placeholder.", error);
        }
    }

    private Map<String, Object> preparePlaceholder(Path file, Path root, String content, Map<String, Object> extra) {
        ensureManagedPath(file, root);
        try {
            Files.createDirectories(file.getParent());
            if (!Files.exists(file)) {
                Files.writeString(file, content, StandardCharsets.UTF_8);
            }
            Map<String, Object> result = orderedMap(
                    "path", file.toString(),
                    "filePath", file.toString(),
                    "workspaceRoot", root.toString(),
                    "webManaged", true,
                    "size", Files.size(file)
            );
            result.putAll(extra);
            return result;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to prepare JavaNavi managed file placeholder.", error);
        }
    }

    private Path resolveImportPath(String rawPath) {
        String raw = text(rawPath);
        if (raw.isBlank()) {
            return sampleImportFile("import");
        }
        Path input = Path.of(raw);
        Path candidate = input.isAbsolute()
                ? input.toAbsolutePath().normalize()
                : importDirectory.resolve(raw.replace('\\', '/')).normalize();
        if (!candidate.startsWith(importDirectory) && !candidate.startsWith(sqlWorkspaceDirectory) && !candidate.startsWith(dataDirectory)) {
            throw new IllegalArgumentException("Import files must stay inside the JavaNavi managed data directory.");
        }
        if (!Files.exists(candidate)) {
            throw new IllegalArgumentException("Import file does not exist in the JavaNavi managed workspace.");
        }
        return candidate;
    }

    @SuppressWarnings("unchecked")
    private ConnectionConfigDto connectionConfig(Map<String, Object> input) {
        Object raw = input == null ? null : input.get("connection");
        if (raw instanceof Map<?, ?> map) {
            return objectMapper.convertValue(map, ConnectionConfigDto.class);
        }
        return new ConnectionConfigDto("demo-h2", "Demo", "h2", null, null, "", null, null, Map.of(), null);
    }

    private List<String> tableNames(Map<String, Object> input) {
        Object raw = input == null ? null : input.get("tables");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        Set<String> result = new LinkedHashSet<>();
        for (Object item : list) {
            String table = text(item);
            if (!table.isBlank()) {
                result.add(table);
            }
        }
        return new ArrayList<>(result);
    }

    private List<String> columnsForRows(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        Set<String> columns = new LinkedHashSet<>();
        rows.forEach(row -> columns.addAll(row.keySet()));
        return new ArrayList<>(columns);
    }

    private void publishImportProgress(String jobId, int current, int total, int success, int errors) {
        try {
            fixtures.fixturesFor(new CompatEventReplayRequestDto(
                    "import",
                    textOrDefault(jobId, "import-" + Instant.now().toEpochMilli()),
                    null,
                    Map.of("current", current, "total", Math.max(total, 1), "success", success, "errors", errors)
            )).forEach(publisher::publish);
        } catch (RuntimeException ignored) {
            // File workflows should not fail when there are no SSE subscribers.
        }
    }

    private String normalizeFormat(String format) {
        String normalized = textOrDefault(format, "json").toLowerCase(Locale.ROOT);
        if (normalized.equals("xlsx") || normalized.equals("xls")) {
            return "json";
        }
        if (!List.of("csv", "json", "sql").contains(normalized)) {
            return "json";
        }
        return normalized;
    }

    private boolean isReadOnlyQuery(String sql) {
        String normalized = text(sql).toLowerCase(Locale.ROOT);
        return normalized.startsWith("select") || normalized.startsWith("with");
    }

    private static boolean booleanValue(Object value, boolean fallback) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        String text = text(value).toLowerCase(Locale.ROOT);
        if (text.isBlank()) {
            return fallback;
        }
        return switch (text) {
            case "true", "1", "yes", "y", "on" -> true;
            case "false", "0", "no", "n", "off" -> false;
            default -> fallback;
        };
    }

    private String requireSafeTableName(String tableName) {
        String table = text(tableName);
        if (table.isBlank() || !SAFE_TABLE_PATTERN.matcher(table).matches()) {
            throw new IllegalArgumentException(messages.message("files.safeTableRequired"));
        }
        return table;
    }

    private static String quoteIdentifier(String column) {
        return quoteIdentifier("", column);
    }

    private static String tableSqlName(String driver, ConnectionConfigDto connection, String database, String tableName) {
        QualifiedName qualified = splitQualifiedName(tableName);
        String table = textOrDefault(qualified.name(), tableName);
        if ("mysql".equals(driver)) {
            String catalog = firstText(qualified.qualifier(), database, connection == null ? null : connection.database());
            return catalog.isBlank() ? quoteIdentifier(driver, table) : quoteIdentifier(driver, catalog) + "." + quoteIdentifier(driver, table);
        }
        String schema = "postgresql".equals(driver)
                ? firstText(qualified.qualifier(), database, "public")
                : firstText(qualified.qualifier(), database);
        return schema.isBlank() ? quoteIdentifier(driver, table) : quoteIdentifier(driver, schema) + "." + quoteIdentifier(driver, table);
    }

    private static QualifiedName splitQualifiedName(String tableName) {
        String value = text(tableName);
        int separator = value.lastIndexOf('.');
        if (separator > 0 && separator < value.length() - 1) {
            return new QualifiedName(unquoteIdentifier(value.substring(0, separator)), unquoteIdentifier(value.substring(separator + 1)));
        }
        return new QualifiedName("", unquoteIdentifier(value));
    }

    private static String quoteIdentifier(String driver, String identifier) {
        String value = text(identifier);
        if ("mysql".equals(driver)) {
            return "`" + value.replace("`", "``") + "`";
        }
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private static String unquoteIdentifier(String value) {
        String text = text(value);
        if (text.length() >= 2) {
            char first = text.charAt(0);
            char last = text.charAt(text.length() - 1);
            if ((first == '`' && last == '`') || (first == '"' && last == '"') || (first == '[' && last == ']')) {
                return text.substring(1, text.length() - 1);
            }
        }
        return text;
    }

    private static String firstText(Object... values) {
        for (Object value : values) {
            String text = text(value);
            if (!text.isBlank()) {
                return text;
            }
        }
        return "";
    }

    private static String normalizeDriverType(String driverType) {
        String driver = text(driverType).toLowerCase(Locale.ROOT);
        return switch (driver) {
            case "postgres", "postgresql", "pg" -> "postgresql";
            case "mysql", "mariadb" -> "mysql";
            case "h2", "demo" -> "demo";
            default -> driver;
        };
    }

    private static String sqlLiteral(Object value) {
        if (value == null) {
            return "NULL";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        return "'" + String.valueOf(value).replace("'", "''") + "'";
    }

    private static String normalizeFileToken(String value, String fallback) {
        String text = textOrDefault(value, fallback).replaceAll("[^A-Za-z0-9._-]+", "-");
        text = text.replaceAll("^-+|-+$", "");
        return text.isBlank() ? fallback : text;
    }

    private void ensureManagedPath(Path path, Path root) {
        Path normalizedRoot = root.toAbsolutePath().normalize();
        Path normalizedPath = path.toAbsolutePath().normalize();
        if (!normalizedPath.startsWith(normalizedRoot)) {
            throw new IllegalArgumentException("File workflow path must stay inside the JavaNavi managed workspace.");
        }
    }

    private static String stringValue(Map<String, Object> input, String... keys) {
        if (input == null) {
            return "";
        }
        for (String key : keys) {
            Object value = input.get(key);
            if (value != null) {
                return String.valueOf(value).trim();
            }
        }
        return "";
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String textOrDefault(Object value, String fallback) {
        String text = text(value);
        return text.isBlank() ? fallback : text;
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    private record QualifiedName(String qualifier, String name) {
    }
}
