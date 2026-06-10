package com.javanavi.api;

import com.javanavi.ai.AiCompatibilityService;
import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.ApplyChangesRequestDto;
import com.javanavi.model.ApplyChangesResultDto;
import com.javanavi.model.CapabilityDto;
import com.javanavi.model.ColumnDefinitionDto;
import com.javanavi.model.ColumnDefinitionWithTableDto;
import com.javanavi.model.CompatibilityMetadataDto;
import com.javanavi.model.ConnectionCloseRequestDto;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.ConnectionPoolStatusDto;
import com.javanavi.model.ConnectionTestResultDto;
import com.javanavi.model.ConnectionCloseResultDto;
import com.javanavi.model.DatabaseOperationRequestDto;
import com.javanavi.model.DatabaseOperationResultDto;
import com.javanavi.model.ForeignKeyDefinitionDto;
import com.javanavi.model.IndexDefinitionDto;
import com.javanavi.model.QueryCancelRequestDto;
import com.javanavi.model.QueryCancelResultDto;
import com.javanavi.model.QueryRequestDto;
import com.javanavi.model.QueryResultDto;
import com.javanavi.model.QueryStreamEventDto;
import com.javanavi.model.ResultSetDataDto;
import com.javanavi.model.SchemaTablesRequestDto;
import com.javanavi.model.TableSummaryDto;
import com.javanavi.model.TableMetadataRequestDto;
import com.javanavi.model.TriggerDefinitionDto;
import com.javanavi.security.SecretRedactor;
import jakarta.validation.Valid;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class CompatibilityController {
    private static final List<CapabilityDto> CAPABILITIES = List.of(
            new CapabilityDto("connection-test", "Connection test", "ready", "Demo/H2 connection validation"),
            new CapabilityDto("schema-tables", "Schema table listing", "ready", "Lists demo database tables"),
            new CapabilityDto("readonly-query", "Read-only query", "ready", "Runs SELECT statements against the demo database"),
            new CapabilityDto("java-web-package", "Java Web package", "ready", "Spring Boot serves the React static build and API from one process"),
            new CapabilityDto("local-session-security", "Local session security", "ready", "Loopback bind, strict origin checks, and local-session token protection"),
            new CapabilityDto("secret-store", "Encrypted secret store abstraction", "ready", "AES-GCM local file secret-store abstraction is available before real credential flows"),
            new CapabilityDto("jdbc-mysql-postgresql", "MySQL/PostgreSQL JDBC wiring", "ready", "Driver URL/connection/query plumbing has fixture, container, and compatible-profile evidence"),
            new CapabilityDto("schema-metadata", "Relational schema metadata", "partial", "Columns, indexes, foreign keys, triggers, and show-create table are wired for demo/JDBC metadata"),
            new CapabilityDto("connection-pooling", "Managed JDBC connection pooling", "partial", "External MySQL/PostgreSQL connection configs are routed through bounded Hikari pools with explicit close/status APIs"),
            new CapabilityDto("query-cancel", "Cancellable JDBC query execution", "partial", "Query IDs are tracked and forwarded to JDBC Statement.cancel where the driver supports it"),
            new CapabilityDto("query-multi", "Multi-statement query execution", "partial", "Java fallback splitter returns JavaNavi-style result-set arrays for read/write statements"),
            new CapabilityDto("apply-changes", "DataGrid apply changes", "partial", "Transactional insert/update/delete change sets are wired for demo/H2 plus MySQL/PostgreSQL JDBC"),
            new CapabilityDto("relational-ddl", "Relational DDL compatibility", "partial", "Database/table/view/function create/drop/rename and clear/truncate endpoints are wired with dialect guardrails"),
            new CapabilityDto("compat-event-bridge", "Compatibility event bridge", "partial", "SSE publisher/controller and frontend runtime bridge are wired with fixture families for stream-style JavaNavi events"),
            new CapabilityDto("saved-secrets", "Saved secrets compatibility", "ready", "Saved connections and JavaNavi connection packages use SecretStore-backed redaction")
    );

    private static final MediaType NDJSON_MEDIA_TYPE = MediaType.valueOf("application/x-ndjson");
    private static final String REQUEST_SOURCE_HEADER = "X-JavaNavi-Request-Source";
    private static final String AI_TOOL_REQUEST_SOURCE = "ai-tool";

    private final ObjectMapper objectMapper;
    private final DatabaseCompatibilityService databaseCompatibilityService;
    private final AiCompatibilityService aiCompatibilityService;
    private final I18nMessages messages;

    public CompatibilityController(
            DatabaseCompatibilityService databaseCompatibilityService,
            AiCompatibilityService aiCompatibilityService,
            I18nMessages messages
    ) {
        this(databaseCompatibilityService, aiCompatibilityService, messages, new ObjectMapper().findAndRegisterModules());
    }

    @Autowired
    public CompatibilityController(
            DatabaseCompatibilityService databaseCompatibilityService,
            AiCompatibilityService aiCompatibilityService,
            I18nMessages messages,
            ObjectMapper objectMapper
    ) {
        this.objectMapper = objectMapper;
        this.databaseCompatibilityService = databaseCompatibilityService;
        this.aiCompatibilityService = aiCompatibilityService;
        this.messages = messages;
    }

    @GetMapping("/health")
    public ApiEnvelope<Map<String, String>> health() {
        return ApiEnvelope.ok(Map.of(
                "status", "ok",
                "backend", "java-spring-boot",
                "contractVersion", "javanavi-compat-v1"
        ));
    }

    @GetMapping("/capabilities")
    public ApiEnvelope<CompatibilityMetadataDto> capabilities() {
        return ApiEnvelope.ok(new CompatibilityMetadataDto(
                "JavaNavi",
                "java-spring-boot",
                "javanavi-compat-v1",
                CAPABILITIES
        ));
    }

    @PostMapping("/connections/test")
    public ApiEnvelope<ConnectionTestResultDto> testConnection(@Valid @RequestBody ConnectionConfigDto config) {
        ConnectionTestResultDto result = databaseCompatibilityService.testConnection(config);
        if (!result.connected()) {
            return ApiEnvelope.failKey(messages, "connection.unsupportedDriver", "message", result.message());
        }
        return ApiEnvelope.ok(result);
    }

    @PostMapping("/ssh/test")
    public ApiEnvelope<ConnectionTestResultDto> testSshConnection(@Valid @RequestBody ConnectionConfigDto config) {
        ConnectionTestResultDto result = databaseCompatibilityService.testSshConnection(config);
        if (!result.connected()) {
            return ApiEnvelope.failKey(messages, "connection.unsupportedDriver", "message", result.message());
        }
        return ApiEnvelope.ok(result);
    }

    @PostMapping("/connections/open")
    public ApiEnvelope<ConnectionPoolStatusDto> openConnection(@Valid @RequestBody ConnectionConfigDto config) {
        return ApiEnvelope.ok(databaseCompatibilityService.openConnectionPool(config));
    }

    @PostMapping("/connections/close")
    public ApiEnvelope<ConnectionCloseResultDto> closeConnection(@Valid @RequestBody ConnectionCloseRequestDto request) {
        boolean closed = databaseCompatibilityService.closeConnectionPool(request.connectionId());
        return ApiEnvelope.ok(new ConnectionCloseResultDto(request.connectionId(), closed));
    }

    @GetMapping("/connections/pools")
    public ApiEnvelope<List<ConnectionPoolStatusDto>> connectionPools() {
        return ApiEnvelope.ok(databaseCompatibilityService.connectionPoolStatuses());
    }

    @GetMapping("/schema/tables")
    public ApiEnvelope<List<TableSummaryDto>> listTables() {
        return ApiEnvelope.ok(databaseCompatibilityService.listTables(null, null));
    }

    @PostMapping("/schema/tables")
    public ApiEnvelope<List<TableSummaryDto>> listTablesForConnection(@Valid @RequestBody SchemaTablesRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.listTables(request.connection(), request.database()));
    }

    @PostMapping("/schema/objects")
    public ApiEnvelope<List<TableSummaryDto>> listSchemaObjectsForConnection(@Valid @RequestBody SchemaTablesRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.listSchemaObjects(request.connection(), request.database()));
    }

    @PostMapping("/schema/databases")
    public ApiEnvelope<List<Map<String, String>>> listDatabasesForConnection(@Valid @RequestBody SchemaTablesRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.listDatabases(request.connection()).stream()
                .map(database -> Map.of("Database", database, "database", database))
                .toList());
    }

    @PostMapping("/schema/columns")
    public ApiEnvelope<List<ColumnDefinitionDto>> listColumns(@Valid @RequestBody TableMetadataRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.listColumns(request.connection(), request.database(), request.table()));
    }

    @PostMapping("/schema/columns/all")
    public ApiEnvelope<List<ColumnDefinitionWithTableDto>> listAllColumns(@Valid @RequestBody SchemaTablesRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.listAllColumns(request.connection(), request.database()));
    }

    @PostMapping("/schema/indexes")
    public ApiEnvelope<List<IndexDefinitionDto>> listIndexes(@Valid @RequestBody TableMetadataRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.listIndexes(request.connection(), request.database(), request.table()));
    }

    @PostMapping("/schema/foreign-keys")
    public ApiEnvelope<List<ForeignKeyDefinitionDto>> listForeignKeys(@Valid @RequestBody TableMetadataRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.listForeignKeys(request.connection(), request.database(), request.table()));
    }

    @PostMapping("/schema/triggers")
    public ApiEnvelope<List<TriggerDefinitionDto>> listTriggers(@Valid @RequestBody TableMetadataRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.listTriggers(request.connection(), request.database(), request.table()));
    }

    @PostMapping("/schema/show-create-table")
    public ApiEnvelope<String> showCreateTable(@Valid @RequestBody TableMetadataRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.showCreateTable(request.connection(), request.database(), request.table()));
    }

    @PostMapping("/schema/show-create-tables")
    public ApiEnvelope<List<String>> showCreateTables(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.showCreateTables(request.connection(), request.database(), request.tables()));
    }

    @PostMapping("/query")
    public ApiEnvelope<QueryResultDto> query(
            @Valid @RequestBody QueryRequestDto request,
            @RequestHeader(value = REQUEST_SOURCE_HEADER, required = false) String requestSource
    ) {
        enforceAiSqlSafety(request, requestSource);
        return ApiEnvelope.ok(databaseCompatibilityService.execute(request));
    }

    @PostMapping("/query/multi")
    public ApiEnvelope<List<ResultSetDataDto>> queryMulti(
            @Valid @RequestBody QueryRequestDto request,
            @RequestHeader(value = REQUEST_SOURCE_HEADER, required = false) String requestSource
    ) {
        enforceAiSqlSafety(request, requestSource);
        return ApiEnvelope.ok(databaseCompatibilityService.executeMulti(request));
    }

    @PostMapping(value = "/query/multi/stream", produces = "application/x-ndjson")
    public ResponseEntity<StreamingResponseBody> queryMultiStream(
            @Valid @RequestBody QueryRequestDto request,
            @RequestHeader(value = REQUEST_SOURCE_HEADER, required = false) String requestSource
    ) {
        enforceAiSqlSafety(request, requestSource);
        StreamingResponseBody body = outputStream -> {
            BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(outputStream, StandardCharsets.UTF_8));
            try {
                databaseCompatibilityService.executeMultiStream(request, event -> writeStreamEvent(writer, event));
            } catch (UncheckedIOException error) {
                throw error.getCause();
            } catch (RuntimeException error) {
                writeStreamEvent(writer, QueryStreamEventDto.error(SecretRedactor.redact(error.getMessage())));
            } finally {
                writer.flush();
            }
        };
        return ResponseEntity.ok().contentType(NDJSON_MEDIA_TYPE).body(body);
    }

    private void writeStreamEvent(BufferedWriter writer, QueryStreamEventDto event) {
        try {
            writer.write(objectMapper.writeValueAsString(event));
            writer.newLine();
            writer.flush();
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    private void enforceAiSqlSafety(QueryRequestDto request, String requestSource) {
        if (!AI_TOOL_REQUEST_SOURCE.equals(requestSource)) {
            return;
        }
        Map<String, Object> safety = aiCompatibilityService.checkSql(request.sql());
        if (!Boolean.TRUE.equals(safety.get("allowed"))) {
            throw new IllegalArgumentException(String.valueOf(safety.getOrDefault(
                    "warningMessage",
                    "AI SQL safety policy blocks this statement."
            )));
        }
        if (Boolean.TRUE.equals(safety.get("requiresConfirm"))) {
            throw new IllegalArgumentException("AI SQL safety policy requires user confirmation before this statement can run.");
        }
    }

    @PostMapping("/query/cancel")
    public ApiEnvelope<QueryCancelResultDto> cancelQuery(@Valid @RequestBody QueryCancelRequestDto request) {
        boolean cancelled = databaseCompatibilityService.cancelQuery(request.queryId());
        if (!cancelled) {
            return ApiEnvelope.failKey(messages, "query.notRunning");
        }
        return ApiEnvelope.ok(new QueryCancelResultDto(request.queryId(), true));
    }

    @PostMapping("/apply-changes")
    public ApiEnvelope<ApplyChangesResultDto> applyChanges(@Valid @RequestBody ApplyChangesRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.applyChanges(
                request.connection(),
                request.database(),
                request.table(),
                request.changes()
        ));
    }

    @PostMapping("/ddl/clear-tables")
    public ApiEnvelope<DatabaseOperationResultDto> clearTables(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.clearTables(request.connection(), request.database(), request.tables(), false));
    }

    @PostMapping("/ddl/truncate-tables")
    public ApiEnvelope<DatabaseOperationResultDto> truncateTables(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.clearTables(request.connection(), request.database(), request.tables(), true));
    }

    @PostMapping("/ddl/create-database")
    public ApiEnvelope<DatabaseOperationResultDto> createDatabase(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.createDatabase(request.connection(), request.name()));
    }

    @PostMapping("/ddl/drop-database")
    public ApiEnvelope<DatabaseOperationResultDto> dropDatabase(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.dropDatabase(request.connection(), request.name()));
    }

    @PostMapping("/ddl/rename-database")
    public ApiEnvelope<DatabaseOperationResultDto> renameDatabase(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.renameDatabase(request.connection(), request.name(), request.newName()));
    }

    @PostMapping("/ddl/drop-table")
    public ApiEnvelope<DatabaseOperationResultDto> dropTable(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.dropTable(request.connection(), request.database(), request.name()));
    }

    @PostMapping("/ddl/drop-tables")
    public ApiEnvelope<DatabaseOperationResultDto> dropTables(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.dropTables(request.connection(), request.database(), request.tables()));
    }

    @PostMapping("/ddl/drop-view")
    public ApiEnvelope<DatabaseOperationResultDto> dropView(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.dropView(request.connection(), request.database(), request.name()));
    }

    @PostMapping("/ddl/drop-function")
    public ApiEnvelope<DatabaseOperationResultDto> dropFunction(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.dropFunction(request.connection(), request.database(), request.name()));
    }

    @PostMapping("/ddl/rename-table")
    public ApiEnvelope<DatabaseOperationResultDto> renameTable(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.renameTable(request.connection(), request.database(), request.name(), request.newName()));
    }

    @PostMapping("/ddl/rename-tables")
    public ApiEnvelope<DatabaseOperationResultDto> renameTables(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.renameTables(request.connection(), request.database(), request.renames()));
    }

    @PostMapping("/ddl/copy-tables")
    public ApiEnvelope<DatabaseOperationResultDto> copyTables(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.copyTables(
                request.connection(),
                request.database(),
                request.tables(),
                request.targetPrefix(),
                request.targetSuffix(),
                Boolean.TRUE.equals(request.includeData())
        ));
    }

    @PostMapping("/ddl/rename-view")
    public ApiEnvelope<DatabaseOperationResultDto> renameView(@Valid @RequestBody DatabaseOperationRequestDto request) {
        return ApiEnvelope.ok(databaseCompatibilityService.renameView(request.connection(), request.database(), request.name(), request.newName()));
    }

}
