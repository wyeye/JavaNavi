package com.javanavi.files;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.jobs.JobCancellationException;
import com.javanavi.jobs.JobProgressSink;
import com.javanavi.model.ApplyChangesResultDto;
import com.javanavi.model.ChangeSetDto;
import com.javanavi.model.ColumnDefinitionDto;
import com.javanavi.model.CompatEventReplayRequestDto;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.IndexDefinitionDto;
import com.javanavi.model.QueryRequestDto;
import com.javanavi.model.QueryResultDto;
import com.javanavi.model.TableSummaryDto;
import com.javanavi.security.SecretRedactor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class FileWorkflowCompatibilityService {
    private static final TypeReference<List<Map<String, Object>>> ROW_LIST_TYPE = new TypeReference<>() {};
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final Pattern SAFE_TABLE_PATTERN = Pattern.compile("[A-Za-z0-9_.$\\\"]+");
    private static final Duration IMPORT_FILE_RETENTION = Duration.ofDays(7);
    private static final int IMPORT_DUPLICATE_QUERY_CHUNK_SIZE = 100;
    private static final int MAX_DUPLICATE_LOGS = 200;
    private static final DateTimeFormatter SQL_DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter SQL_TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final Set<String> SUPPORTED_IMPORT_DRIVERS = Set.of(
            "demo",
            "mysql",
            "postgresql",
            "sqlite",
            "duckdb"
    );

    private final ObjectMapper objectMapper;
    private final DatabaseCompatibilityService databaseCompatibilityService;
    private final ExportedFileRevealService exportedFileRevealService;
    private final CompatEventPublisher publisher;
    private final CompatEventFixtures fixtures;
    private final I18nMessages messages;
    private final Path dataDirectory;
    private final Path exportDirectory;
    private final Path importDirectory;
    private final Path sqlWorkspaceDirectory;
    private final Path sshKeyDirectory;

    public FileWorkflowCompatibilityService(
            SecurityProperties securityProperties,
            ObjectMapper objectMapper,
            DatabaseCompatibilityService databaseCompatibilityService,
            ExportedFileRevealService exportedFileRevealService,
            CompatEventPublisher publisher,
            CompatEventFixtures fixtures,
            I18nMessages messages
    ) {
        this.objectMapper = objectMapper;
        this.databaseCompatibilityService = databaseCompatibilityService;
        this.exportedFileRevealService = exportedFileRevealService;
        this.publisher = publisher;
        this.fixtures = fixtures;
        this.messages = messages;
        this.dataDirectory = Path.of(securityProperties.getDataDirectory()).toAbsolutePath().normalize();
        this.exportDirectory = dataDirectory.resolve("exports").normalize();
        this.importDirectory = dataDirectory.resolve("imports").normalize();
        this.sqlWorkspaceDirectory = dataDirectory.resolve("sql-workspace").normalize();
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

    public Map<String, Object> selectSshKeyFile(String currentPath) {
        Path file = sshKeyDirectory.resolve("ssh-key-upload-placeholder.pem").normalize();
        return preparePlaceholder(file, sshKeyDirectory, "JavaNavi managed SSH key upload placeholder; no private key material is stored here.\n", orderedMap(
                "runtimeExcluded", true,
                "browserUploadRequired", true,
                "currentPath", SecretRedactor.redact(text(currentPath))
        ));
    }

    public Map<String, Object> uploadImportFile(String tableName, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Upload a non-empty CSV or JSON import file.");
        }
        String safeTable = normalizeFileToken(tableName, "import");
        String originalName = normalizeImportFileName(file.getOriginalFilename());
        Path target = importDirectory.resolve(safeTable + "-" + Instant.now().toEpochMilli() + "-" + originalName).normalize();
        ensureManagedPath(target, importDirectory);
        try {
            Files.createDirectories(target.getParent());
            cleanupStaleImportFiles();
            file.transferTo(target);
            // Parse once here so the user gets an immediate actionable upload error instead of a broken preview modal.
            List<Map<String, Object>> rows = parseImportRows(target);
            return importSelectionResult(target, tableName, false, "JavaNavi Web uploaded the import file into the managed workspace.", rows.size());
        } catch (IOException error) {
            deleteQuietly(target);
            throw new IllegalStateException("Unable to store JavaNavi import file.", error);
        } catch (RuntimeException error) {
            deleteQuietly(target);
            throw error;
        }
    }

    private Map<String, Object> importSelectionResult(Path file, String tableName, boolean browserUploadRequired, String message) {
        return importSelectionResult(file, tableName, browserUploadRequired, message, null);
    }

    private Map<String, Object> importSelectionResult(Path file, String tableName, boolean browserUploadRequired, String message, Integer totalRows) {
        Map<String, Object> result = orderedMap(
                "filePath", file.toString(),
                "path", file.toString(),
                "filename", file.getFileName().toString(),
                "table", tableName,
                "webManaged", true,
                "browserUploadRequired", browserUploadRequired,
                "message", message
        );
        if (totalRows != null) {
            result.put("totalRows", totalRows);
        }
        return result;
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
            String driver = importDriverType(connection);
            if (!SUPPORTED_IMPORT_DRIVERS.contains(driver)) {
                throw new IllegalArgumentException("Current data source does not support JavaNavi table import: " + textOrDefault(driver, "unknown"));
            }
            List<String> columns = columnsForRows(rows);
            if (!columns.isEmpty()) {
                createImportTableIfNeeded(connection, database, tableName, columns);
            }
            rows = normalizeImportRowsForTargetTypes(connection, database, tableName, rows);
            DuplicateFilterResult duplicateFilter = filterDuplicateImportRows(connection, database, tableName, rows);
            rows = duplicateFilter.rows();
            ApplyChangesResultDto result = databaseCompatibilityService.applyChanges(
                    connection,
                    database,
                    tableName,
                    new ChangeSetDto(rows, List.of(), List.of())
            );
            int failed = Math.max(0, rows.size() - result.insertedRows());
            Map<String, Object> importResult = orderedMap(
                    "success", result.insertedRows(),
                    "failed", failed,
                    "total", total,
                    "skippedDuplicates", duplicateFilter.skippedDuplicates(),
                    "duplicateLogs", duplicateFilter.logs(),
                    "duplicateLogCodes", duplicateFilter.logCodes(),
                    "duplicateStrategy", duplicateFilter.strategy(),
                    "duplicateStrategyCode", duplicateFilter.strategyCode(),
                    "duplicateColumns", duplicateFilter.columns(),
                    "duplicateWarning", duplicateFilter.warning(),
                    "duplicateWarningCode", duplicateFilter.warningCode(),
                    "errorLogs", failed == 0 ? List.of() : List.of(messages.message("files.import.insertConstraintWarning")),
                    "errorSummary", messages.message("files.import.summaryWithSkipped", "imported", result.insertedRows(), "skipped", duplicateFilter.skippedDuplicates(), "failed", failed),
                    "dryRun", false,
                    "appliedToDatabase", true,
                    "insertedRows", result.insertedRows(),
                    "affectedRows", result.affectedRows(),
                    "table", tableName,
                    "filePath", file.toString(),
                    "message", duplicateFilter.skippedDuplicates() > 0
                            ? messages.message("files.import.duplicatesSkippedNoOverwrite")
                            : messages.message("files.import.compatInsertedRows")
            );
            deleteQuietly(file);
            return importResult;
        }
        return orderedMap(
                "success", total,
                "failed", 0,
                "total", total,
                "skippedDuplicates", 0,
                "duplicateLogs", List.of(),
                "duplicateLogCodes", List.of(),
                "duplicateStrategy", "",
                "duplicateStrategyCode", "",
                "duplicateColumns", List.of(),
                "duplicateWarning", messages.message("files.import.duplicatesSkippedOnApply"),
                "duplicateWarningCode", "IMPORT_DUPLICATES_SKIPPED_ON_APPLY",
                "errorLogs", List.of(),
                "errorSummary", messages.message("files.import.summary", "imported", total, "failed", 0),
                "dryRun", true,
                "filePath", file.toString(),
                "message", messages.message("files.import.compatParsedDryRun")
        );
    }

    private void createImportTableIfNeeded(ConnectionConfigDto connection, String database, String tableName, List<String> columns) {
        String driver = importDriverType(connection);
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

    private List<Map<String, Object>> normalizeImportRowsForTargetTypes(
            ConnectionConfigDto connection,
            String database,
            String tableName,
            List<Map<String, Object>> rows
    ) {
        if (rows == null || rows.isEmpty()) {
            return rows;
        }
        List<ColumnDefinitionDto> targetColumns;
        try {
            targetColumns = databaseCompatibilityService.listColumns(connection, database, tableName);
        } catch (RuntimeException ignored) {
            return rows;
        }
        if (targetColumns == null || targetColumns.isEmpty()) {
            return rows;
        }
        Map<String, String> typeByColumn = new LinkedHashMap<>();
        for (ColumnDefinitionDto column : targetColumns) {
            if (column != null && column.name() != null) {
                typeByColumn.put(column.name().toLowerCase(Locale.ROOT), text(column.type()).toLowerCase(Locale.ROOT));
            }
        }
        if (typeByColumn.isEmpty()) {
            return rows;
        }

        boolean changed = false;
        List<Map<String, Object>> normalizedRows = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            Map<String, Object> normalizedRow = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : row.entrySet()) {
                String column = text(entry.getKey()).toLowerCase(Locale.ROOT);
                Object value = normalizeImportCellForColumnType(entry.getValue(), typeByColumn.get(column));
                if (value != entry.getValue()) {
                    changed = true;
                }
                normalizedRow.put(entry.getKey(), value);
            }
            normalizedRows.add(normalizedRow);
        }
        return changed ? normalizedRows : rows;
    }

    private static Object normalizeImportCellForColumnType(Object value, String columnType) {
        if (!(value instanceof String textValue) || !isTemporalColumnType(columnType)) {
            return value;
        }
        String unwrapped = unwrapRedundantCsvTextQuotes(textValue);
        return unwrapped.equals(textValue) ? value : unwrapped;
    }

    private static boolean isTemporalColumnType(String columnType) {
        String type = text(columnType).toLowerCase(Locale.ROOT);
        return type.contains("date") || type.contains("time") || "year".equals(type);
    }

    private static String unwrapRedundantCsvTextQuotes(String value) {
        String text = value == null ? "" : value.trim();
        if (text.length() >= 2 && text.charAt(0) == '"' && text.charAt(text.length() - 1) == '"') {
            return text.substring(1, text.length() - 1);
        }
        return value;
    }

    private DuplicateFilterResult filterDuplicateImportRows(
            ConnectionConfigDto connection,
            String database,
            String tableName,
            List<Map<String, Object>> rows
    ) {
        if (rows == null || rows.isEmpty()) {
            return new DuplicateFilterResult(List.of(), 0, List.of(), List.of(), "", "", List.of(), messages.message("files.import.duplicatesSkippedOnApply"), "IMPORT_DUPLICATES_SKIPPED_ON_APPLY");
        }
        List<String> duplicateColumns = importDuplicateKeyColumns(connection, database, tableName, rows);
        return duplicateColumns.isEmpty()
                ? filterFileDuplicateRows(rows)
                : filterKeyDuplicateRows(connection, database, tableName, rows, duplicateColumns);
    }

    private DuplicateFilterResult filterKeyDuplicateRows(
            ConnectionConfigDto connection,
            String database,
            String tableName,
            List<Map<String, Object>> rows,
            List<String> duplicateColumns
    ) {
        String driver = importDriverType(connection);
        Set<String> existingKeys = existingImportKeys(connection, database, tableName, driver, duplicateColumns, rows);
        Set<String> seenKeys = new LinkedHashSet<>();
        List<Map<String, Object>> filteredRows = new ArrayList<>();
        List<String> logs = new ArrayList<>();
        List<Map<String, Object>> logCodes = new ArrayList<>();
        int skipped = 0;
        for (int index = 0; index < rows.size(); index++) {
            Map<String, Object> row = rows.get(index);
            String key = importKeySignature(duplicateColumns, row, true);
            if (key.isBlank()) {
                filteredRows.add(row);
                continue;
            }
            if (seenKeys.contains(key)) {
                skipped++;
                addDuplicateLog(logs, messages.message("files.import.duplicateLog.fileKey", "row", index + 1, "key", key));
                addDuplicateLogCode(logCodes, "file-key", index + 1, key);
                continue;
            }
            if (existingKeys.contains(key)) {
                skipped++;
                addDuplicateLog(logs, messages.message("files.import.duplicateLog.databaseKey", "row", index + 1, "key", key));
                addDuplicateLogCode(logCodes, "database-key", index + 1, key);
                continue;
            }
            seenKeys.add(key);
            filteredRows.add(row);
        }
        addDuplicateOverflowLog(logs, skipped);
        addDuplicateOverflowLogCode(logCodes, skipped);
        String strategy = messages.message("files.import.duplicateStrategy.key", "columns", String.join(", ", duplicateColumns));
        return new DuplicateFilterResult(
                filteredRows,
                skipped,
                logs,
                logCodes,
                strategy,
                "key",
                duplicateColumns,
                messages.message("files.import.duplicateWarning.byKey", "strategy", strategy),
                "IMPORT_DUPLICATES_SKIPPED_BY_KEY"
        );
    }

    private DuplicateFilterResult filterFileDuplicateRows(List<Map<String, Object>> rows) {
        List<String> columns = columnsForRows(rows);
        Set<String> seenRows = new LinkedHashSet<>();
        List<Map<String, Object>> filteredRows = new ArrayList<>();
        List<String> logs = new ArrayList<>();
        List<Map<String, Object>> logCodes = new ArrayList<>();
        int skipped = 0;
        for (int index = 0; index < rows.size(); index++) {
            Map<String, Object> row = rows.get(index);
            String signature = importKeySignature(columns, row, false);
            if (seenRows.contains(signature)) {
                skipped++;
                addDuplicateLog(logs, messages.message("files.import.duplicateLog.fileFullRow", "row", index + 1));
                addDuplicateLogCode(logCodes, "file-full-row", index + 1, "");
                continue;
            }
            seenRows.add(signature);
            filteredRows.add(row);
        }
        addDuplicateOverflowLog(logs, skipped);
        addDuplicateOverflowLogCode(logCodes, skipped);
        return new DuplicateFilterResult(
                filteredRows,
                skipped,
                logs,
                logCodes,
                messages.message("files.import.duplicateStrategy.fileFullRow"),
                "file-full-row",
                List.of(),
                messages.message("files.import.duplicateWarning.fileOnly"),
                "IMPORT_DUPLICATES_FILE_ONLY"
        );
    }

    private List<String> importDuplicateKeyColumns(
            ConnectionConfigDto connection,
            String database,
            String tableName,
            List<Map<String, Object>> rows
    ) {
        List<String> availableColumns = columnsForRows(rows);
        List<ColumnDefinitionDto> targetColumns;
        try {
            targetColumns = databaseCompatibilityService.listColumns(connection, database, tableName);
        } catch (RuntimeException ignored) {
            return List.of();
        }
        List<String> primaryColumns = targetColumns.stream()
                .filter(column -> "PRI".equalsIgnoreCase(column.key()))
                .map(ColumnDefinitionDto::name)
                .toList();
        if (!primaryColumns.isEmpty() && primaryColumns.stream().allMatch(column -> importRowsContainColumn(availableColumns, column))) {
            return primaryColumns;
        }

        List<IndexDefinitionDto> indexes;
        try {
            indexes = databaseCompatibilityService.listIndexes(connection, database, tableName);
        } catch (RuntimeException ignored) {
            return List.of();
        }
        Map<String, List<IndexDefinitionDto>> uniqueGroups = new LinkedHashMap<>();
        for (IndexDefinitionDto index : indexes) {
            if (index == null || index.nonUnique() != 0 || text(index.columnName()).isBlank()) {
                continue;
            }
            uniqueGroups.computeIfAbsent(text(index.name()).toLowerCase(Locale.ROOT), ignored -> new ArrayList<>()).add(index);
        }
        return uniqueGroups.values().stream()
                .map(group -> group.stream()
                        .sorted((left, right) -> Integer.compare(left.seqInIndex(), right.seqInIndex()))
                        .map(IndexDefinitionDto::columnName)
                        .toList())
                .filter(group -> !group.isEmpty())
                .filter(group -> group.stream().allMatch(column -> importRowsContainColumn(availableColumns, column)))
                .findFirst()
                .orElse(List.of());
    }

    private Set<String> existingImportKeys(
            ConnectionConfigDto connection,
            String database,
            String tableName,
            String driver,
            List<String> duplicateColumns,
            List<Map<String, Object>> rows
    ) {
        List<Map<String, Object>> keyRows = rows.stream()
                .filter(row -> !importKeySignature(duplicateColumns, row, true).isBlank())
                .toList();
        if (keyRows.isEmpty()) {
            return Set.of();
        }
        Set<String> existingKeys = new LinkedHashSet<>();
        for (int start = 0; start < keyRows.size(); start += IMPORT_DUPLICATE_QUERY_CHUNK_SIZE) {
            List<Map<String, Object>> chunk = keyRows.subList(start, Math.min(keyRows.size(), start + IMPORT_DUPLICATE_QUERY_CHUNK_SIZE));
            String whereSql = importDuplicateWhereSql(driver, duplicateColumns, chunk);
            if (whereSql.isBlank()) {
                continue;
            }
            String selectedColumns = duplicateColumns.stream()
                    .map(column -> quoteIdentifier(driver, column))
                    .reduce((left, right) -> left + ", " + right)
                    .orElse("");
            String sql = "select " + selectedColumns
                    + " from " + tableSqlName(driver, connection, database, tableName)
                    + " where " + whereSql;
            QueryResultDto result = databaseCompatibilityService.execute(new QueryRequestDto(
                    connection,
                    database,
                    sql,
                    1,
                    chunk.size(),
                    "import-duplicates-" + Instant.now().toEpochMilli()
            ));
            result.rows().forEach(row -> {
                String key = importKeySignature(duplicateColumns, row, true);
                if (!key.isBlank()) {
                    existingKeys.add(key);
                }
            });
        }
        return existingKeys;
    }

    private static String importDuplicateWhereSql(String driver, List<String> duplicateColumns, List<Map<String, Object>> rows) {
        List<String> clauses = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            StringJoiner rowClause = new StringJoiner(" AND ");
            boolean complete = true;
            for (String column : duplicateColumns) {
                Object value = importRowValue(row, column);
                if (value == null || text(value).isBlank()) {
                    complete = false;
                    break;
                }
                rowClause.add(quoteIdentifier(driver, column) + " = " + sqlLiteral(value));
            }
            if (complete) {
                clauses.add("(" + rowClause + ")");
            }
        }
        return clauses.isEmpty() ? "" : String.join(" OR ", clauses);
    }

    private static boolean importRowsContainColumn(List<String> columns, String column) {
        String expected = text(column).toLowerCase(Locale.ROOT);
        return !expected.isBlank() && columns.stream().anyMatch(value -> text(value).equalsIgnoreCase(expected));
    }

    private static String importKeySignature(List<String> columns, Map<String, Object> row, boolean requireNonBlankValues) {
        StringJoiner joiner = new StringJoiner("|");
        for (String column : columns) {
            Object value = importRowValue(row, column);
            if (requireNonBlankValues && (value == null || text(value).isBlank())) {
                return "";
            }
            joiner.add(column + "=" + importKeyValue(value));
        }
        return joiner.toString();
    }

    private static Object importRowValue(Map<String, Object> row, String column) {
        if (row == null || column == null) {
            return null;
        }
        if (row.containsKey(column)) {
            return row.get(column);
        }
        String expected = column.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (text(entry.getKey()).toLowerCase(Locale.ROOT).equals(expected)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static String importKeyValue(Object value) {
        return value == null ? "<NULL>" : String.valueOf(value).trim();
    }

    private static void addDuplicateLog(List<String> logs, String message) {
        if (logs.size() < MAX_DUPLICATE_LOGS) {
            logs.add(message);
        }
    }

    private void addDuplicateOverflowLog(List<String> logs, int skipped) {
        if (skipped > logs.size()) {
            logs.add(messages.message("files.import.duplicateOverflow", "count", skipped - logs.size()));
        }
    }

    private static void addDuplicateLogCode(List<Map<String, Object>> logs, String reason, int rowNumber, String key) {
        if (logs.size() < MAX_DUPLICATE_LOGS) {
            logs.add(orderedMap("reason", reason, "row", rowNumber, "key", key));
        }
    }

    private static void addDuplicateOverflowLogCode(List<Map<String, Object>> logs, int skipped) {
        if (skipped > logs.size()) {
            logs.add(orderedMap("reason", "overflow", "remaining", skipped - logs.size()));
        }
    }

    public Map<String, Object> exportData(List<? extends Map<String, Object>> rows, List<String> columns, String defaultName, String format) {
        return exportData(rows, columns, defaultName, format, "");
    }

    public Map<String, Object> exportData(List<? extends Map<String, Object>> rows, List<String> columns, String defaultName, String format, String targetPath) {
        List<Map<String, Object>> exportRows = rows == null
                ? List.of()
                : rows.stream().<Map<String, Object>>map(LinkedHashMap::new).toList();
        List<String> resolvedColumns = columns == null || columns.isEmpty() ? columnsForRows(exportRows) : columns;
        Path file = writeRowsExport(exportRows, resolvedColumns, defaultName, format, normalizeFileToken(defaultName, "export"), targetPath);
        return exportResult(file, exportRows.size(), resolvedColumns, format, false);
    }

    public Map<String, Object> exportQuery(Map<String, Object> input) {
        return exportQueryWithProgress(input, JobProgressSink.NOOP);
    }

    public Map<String, Object> exportQueryWithProgress(Map<String, Object> input, JobProgressSink progress) {
        JobProgressSink sink = progress == null ? JobProgressSink.NOOP : progress;
        sink.progress(0, 4, "", "Preparing query export");
        String sql = stringValue(input, "query", "sql").trim();
        if (!isReadOnlyQuery(sql)) {
            throw new IllegalArgumentException(messages.message("files.selectOnlyExport"));
        }
        ConnectionConfigDto connection = connectionConfig(input);
        String database = stringValue(input, "database", "dbName");
        String jobId = textOrDefault(stringValue(input, "jobId", "queryId"), "export-" + Instant.now().toEpochMilli());
        sink.throwIfCancelled();
        sink.progress(1, 4, "", "Running query");
        QueryResultDto result = databaseCompatibilityService.execute(new QueryRequestDto(connection, database, sql, null, null, jobId));
        sink.throwIfCancelled();
        sink.progress(3, 4, "", "Writing file");
        Path file = writeRowsExport(result.rows(), result.columns(), stringValue(input, "defaultName", "name"), stringValue(input, "format"), "query-export", stringValue(input, "targetPath", "exportPath", "path"));
        Map<String, Object> exportResult = exportResult(file, result.rowCount(), result.columns(), stringValue(input, "format"), false);
        sink.progress(4, 4, "", "Export completed");
        return exportResult;
    }

    public Map<String, Object> exportTable(Map<String, Object> input) {
        return exportTableWithProgress(input, JobProgressSink.NOOP);
    }

    public Map<String, Object> exportTableWithProgress(Map<String, Object> input, JobProgressSink progress) {
        JobProgressSink sink = progress == null ? JobProgressSink.NOOP : progress;
        String table = requireSafeTableName(stringValue(input, "table", "tableName"));
        sink.progress(0, 4, table, "Preparing table export");
        Map<String, Object> payload = new LinkedHashMap<>(input == null ? Map.of() : input);
        String driver = importDriverType(connectionConfig(input));
        payload.put("query", "select * from " + quoteQualifiedIdentifier(driver, table));
        payload.putIfAbsent("defaultName", table);
        sink.throwIfCancelled();
        return exportQueryWithProgress(payload, sink);
    }

    public Map<String, Object> exportDataWithProgress(Map<String, Object> input, JobProgressSink progress) {
        JobProgressSink sink = progress == null ? JobProgressSink.NOOP : progress;
        sink.progress(0, 4, "", "Preparing data export");
        List<Map<String, Object>> rows = rowsFromInput(input == null ? null : input.get("rows"));
        List<String> columns = stringList(input == null ? null : input.get("columns"));
        sink.throwIfCancelled();
        sink.progress(2, 4, "", "Writing file");
        Map<String, Object> result = exportData(rows, columns, stringValue(input, "defaultName", "name"), stringValue(input, "format"), stringValue(input, "targetPath", "exportPath", "path"));
        sink.throwIfCancelled();
        sink.progress(4, 4, "", "Export completed");
        return result;
    }

    public Map<String, Object> exportTablesSql(Map<String, Object> input, boolean includeSchema, boolean includeData) {
        return exportTablesSqlWithProgress(input, includeSchema, includeData, JobProgressSink.NOOP);
    }

    public Map<String, Object> exportTablesSqlWithProgress(Map<String, Object> input, boolean includeSchema, boolean includeData, JobProgressSink progress) {
        JobProgressSink sink = progress == null ? JobProgressSink.NOOP : progress;
        ConnectionConfigDto connection = connectionConfig(input);
        String database = stringValue(input, "database", "dbName");
        List<String> tableNames = tableNames(input);
        if (tableNames.isEmpty()) {
            tableNames = databaseCompatibilityService.listTables(connection, database).stream()
                    .map(TableSummaryDto::tableName)
                    .filter(value -> value != null && !value.isBlank())
                    .toList();
        }
        int total = Math.max(tableNames.size(), 1);
        sink.progress(0, total, "", "Preparing SQL export");
        String fallbackBaseName = normalizeFileToken(database, "database") + "-" + (includeSchema && includeData ? "backup" : includeSchema ? "schema" : "data");
        String baseName = normalizeFileToken(stringValue(input, "defaultName", "name"), fallbackBaseName);
        Path file = resolveExportFile(baseName, "sql", stringValue(input, "targetPath", "exportPath", "path"));
        try {
            Files.createDirectories(file.getParent());
            StringBuilder sql = new StringBuilder();
            sql.append("-- JavaNavi SQL export compatibility file\n");
            sql.append("-- database: ").append(database.isBlank() ? "<default>" : database).append("\n");
            String driver = importDriverType(connection);
            for (int index = 0; index < tableNames.size(); index++) {
                String safeTable = requireSafeTableName(tableNames.get(index));
                String tableSql = quoteQualifiedIdentifier(driver, safeTable);
                sink.throwIfCancelled();
                sink.progress(index, total, safeTable, includeData ? "Exporting table schema and data" : "Exporting table schema");
                if (includeSchema) {
                    sql.append("\n-- Schema for ").append(safeTable).append("\n");
                    try {
                        appendSqlStatement(sql, databaseCompatibilityService.showCreateTable(connection, database, safeTable));
                    } catch (RuntimeException error) {
                        if (error instanceof JobCancellationException) {
                            throw error;
                        }
                        sink.throwIfCancelled();
                        sql.append("-- Schema unavailable in JavaNavi Web export smoke: ").append(SecretRedactor.redact(error.getMessage())).append("\n");
                    }
                }
                sink.throwIfCancelled();
                if (includeData) {
                    sql.append("\n-- Data for ").append(safeTable).append("\n");
                    try {
                        String jobId = textOrDefault(stringValue(input, "jobId", "queryId"), "export-" + Instant.now().toEpochMilli());
                        QueryResultDto result = databaseCompatibilityService.execute(new QueryRequestDto(connection, database, "select * from " + tableSql, null, null, jobId));
                        appendInsertStatements(sql, driver, tableSql, result.rows(), result.columns());
                    } catch (RuntimeException error) {
                        if (error instanceof JobCancellationException) {
                            throw error;
                        }
                        sink.throwIfCancelled();
                        sql.append("-- Data unavailable in JavaNavi Web export smoke: ").append(SecretRedactor.redact(error.getMessage())).append("\n");
                    }
                }
                sink.progress(index + 1, total, safeTable, "Table exported");
            }
            sink.throwIfCancelled();
            Files.writeString(file, sql.toString(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi SQL export.", error);
        }
        sink.progress(total, total, "", "Export completed");
        return exportResult(file, tableNames.size(), List.of("sql"), "sql", false);
    }

    public Map<String, Object> exportDatabaseSql(Map<String, Object> input) {
        boolean includeData = Boolean.TRUE.equals(input == null ? null : input.get("includeData"));
        return exportTablesSql(input, true, includeData);
    }

    public Map<String, Object> exportDatabaseSqlWithProgress(Map<String, Object> input, JobProgressSink progress) {
        boolean includeData = Boolean.TRUE.equals(input == null ? null : input.get("includeData"));
        return exportTablesSqlWithProgress(input, true, includeData, progress);
    }

    private Path writeRowsExport(List<Map<String, Object>> rows, List<String> columns, String defaultName, String format, String fallbackName, String targetPath) {
        String resolvedFormat = normalizeFormat(format);
        String baseName = normalizeFileToken(defaultName, fallbackName);
        List<Map<String, Object>> exportRows = rows == null ? List.of() : rows;
        List<String> exportColumns = columns == null ? List.of() : columns;
        Path file = resolveExportFile(baseName, resolvedFormat, targetPath);
        try {
            Files.createDirectories(file.getParent());
            if ("xlsx".equals(resolvedFormat)) {
                writeXlsx(file, exportRows, exportColumns);
            } else {
                String content = switch (resolvedFormat) {
                    case "csv" -> toCsv(exportRows, exportColumns);
                    case "md" -> toMarkdown(exportRows, exportColumns);
                    case "html" -> toHtml(exportRows, exportColumns);
                    case "sql" -> toSqlInserts(baseName, exportRows, exportColumns);
                    default -> objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(exportRows);
                };
                Files.writeString(file, content, StandardCharsets.UTF_8);
            }
            return file;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi export file.", error);
        }
    }

    private Path resolveExportFile(String baseName, String format, String targetPath) {
        String normalizedTarget = text(targetPath);
        if (normalizedTarget.isBlank()) {
            Path file = exportDirectory.resolve(baseName + "-" + Instant.now().toEpochMilli() + "." + format).normalize();
            ensureManagedPath(file, exportDirectory);
            return file;
        }
        Path file = Path.of(normalizedTarget).toAbsolutePath().normalize();
        String name = file.getFileName() == null ? "" : file.getFileName().toString();
        if (name.isBlank()) {
            throw new IllegalArgumentException("Export target file name is required.");
        }
        if (!name.contains(".") && !format.isBlank()) {
            file = file.resolveSibling(name + "." + format);
        }
        return file;
    }

    private Map<String, Object> exportResult(Path file, int rowCount, List<String> columns, String requestedFormat, boolean dryRun) {
        try {
            Map<String, Object> result = orderedMap(
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
            result.putAll(exportedFileRevealService.revealFields(file));
            return result;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to inspect JavaNavi export file.", error);
        }
    }

    private List<Map<String, Object>> parseImportRows(Path file) {
        try {
            String content = stripUtf8Bom(Files.readString(file, StandardCharsets.UTF_8));
            if (content.trim().isBlank()) {
                return List.of();
            }
            String lower = file.getFileName().toString().toLowerCase(Locale.ROOT);
            if (lower.endsWith(".json")) {
                String trimmed = content.trim();
                if (trimmed.startsWith("[")) {
                    return objectMapper.readValue(trimmed, ROW_LIST_TYPE);
                }
                return List.of(objectMapper.readValue(trimmed, MAP_TYPE));
            }
            return parseCsv(content);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to parse JavaNavi import file.", error);
        }
    }

    private List<Map<String, Object>> parseCsv(String content) {
        List<List<String>> records = csvRecords(content);
        if (records.isEmpty()) {
            return List.of();
        }
        List<String> headers = records.get(0).stream().map(FileWorkflowCompatibilityService::text).toList();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int index = 1; index < records.size(); index++) {
            List<String> values = records.get(index);
            if (values.stream().allMatch(value -> value == null || value.isBlank())) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (int column = 0; column < headers.size(); column++) {
                String header = headers.get(column);
                if (!header.isBlank()) {
                    row.put(header, column < values.size() ? values.get(column) : "");
                }
            }
            rows.add(row);
        }
        return rows;
    }

    private List<List<String>> csvRecords(String content) {
        List<List<String>> records = new ArrayList<>();
        List<String> record = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < content.length(); index++) {
            char ch = content.charAt(index);
            if (ch == '"') {
                if (quoted && index + 1 < content.length() && content.charAt(index + 1) == '"') {
                    current.append('"');
                    index++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch == ',' && !quoted) {
                record.add(current.toString());
                current.setLength(0);
            } else if ((ch == '\n' || ch == '\r') && !quoted) {
                record.add(current.toString());
                current.setLength(0);
                addCsvRecord(records, record);
                record = new ArrayList<>();
                if (ch == '\r' && index + 1 < content.length() && content.charAt(index + 1) == '\n') {
                    index++;
                }
            } else {
                current.append(ch);
            }
        }
        record.add(current.toString());
        addCsvRecord(records, record);
        return records;
    }

    private void addCsvRecord(List<List<String>> records, List<String> record) {
        if (record.stream().anyMatch(value -> value != null && !value.isBlank())) {
            records.add(record);
        }
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
                .map(this::exportCellText)
                .map(value -> value.contains(",") || value.contains("\"") || value.contains("\n")
                        ? "\"" + value.replace("\"", "\"\"") + "\""
                        : value)
                .reduce((left, right) -> left + "," + right)
                .orElse("");
    }

    private String toMarkdown(List<Map<String, Object>> rows, List<String> columns) {
        if (columns == null || columns.isEmpty()) {
            return "_No columns_\n";
        }
        StringBuilder builder = new StringBuilder();
        builder.append("| ");
        builder.append(columns.stream().map(this::escapeMarkdownCell).reduce((left, right) -> left + " | " + right).orElse(""));
        builder.append(" |\n| ");
        builder.append(columns.stream().map(ignored -> "---").reduce((left, right) -> left + " | " + right).orElse("---"));
        builder.append(" |\n");
        for (Map<String, Object> row : rows) {
            builder.append("| ");
            builder.append(columns.stream()
                    .map(column -> escapeMarkdownCell(row.get(column)))
                    .reduce((left, right) -> left + " | " + right)
                    .orElse(""));
            builder.append(" |\n");
        }
        return builder.toString();
    }

    private String toHtml(List<Map<String, Object>> rows, List<String> columns) {
        StringBuilder builder = new StringBuilder();
        builder.append("<!doctype html>\n<html>\n<head>\n<meta charset=\"UTF-8\">\n");
        builder.append("<title>JavaNavi Export</title>\n");
        builder.append("<style>body{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;margin:24px;}");
        builder.append("table{border-collapse:collapse;width:100%;}th,td{border:1px solid #d9d9d9;padding:6px 8px;text-align:left;vertical-align:top;}");
        builder.append("th{background:#f5f5f5;font-weight:600;}tbody tr:nth-child(even){background:#fafafa;}</style>\n");
        builder.append("</head>\n<body>\n<table>\n<thead>\n<tr>");
        for (String column : columns) {
            builder.append("<th>").append(escapeHtml(column)).append("</th>");
        }
        builder.append("</tr>\n</thead>\n<tbody>\n");
        for (Map<String, Object> row : rows) {
            builder.append("<tr>");
            for (String column : columns) {
                builder.append("<td>").append(escapeHtml(exportCellText(row.get(column)))).append("</td>");
            }
            builder.append("</tr>\n");
        }
        builder.append("</tbody>\n</table>\n</body>\n</html>\n");
        return builder.toString();
    }

    private void writeXlsx(Path file, List<Map<String, Object>> rows, List<String> columns) throws IOException {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(file))) {
            addZipEntry(zip, "[Content_Types].xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                      <Default Extension="xml" ContentType="application/xml"/>
                      <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
                      <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
                      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
                    </Types>
                    """);
            addZipEntry(zip, "_rels/.rels", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
                      <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
                    </Relationships>
                    """);
            addZipEntry(zip, "docProps/app.xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
                      <Application>JavaNavi</Application>
                    </Properties>
                    """);
            addZipEntry(zip, "docProps/core.xml", corePropertiesXml());
            addZipEntry(zip, "xl/workbook.xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                      <sheets>
                        <sheet name="Export" sheetId="1" r:id="rId1"/>
                      </sheets>
                    </workbook>
                    """);
            addZipEntry(zip, "xl/_rels/workbook.xml.rels", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
                    </Relationships>
                    """);
            addZipEntry(zip, "xl/styles.xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                      <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
                      <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
                      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
                      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
                      <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
                      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
                    </styleSheet>
                    """);
            addZipEntry(zip, "xl/worksheets/sheet1.xml", worksheetXml(rows, columns));
        }
    }

    private String worksheetXml(List<Map<String, Object>> rows, List<String> columns) {
        StringBuilder builder = new StringBuilder();
        int rowCount = rows == null ? 0 : rows.size();
        int columnCount = columns == null ? 0 : columns.size();
        String dimension = columnCount == 0 ? "A1" : "A1:" + cellRef(columnCount, Math.max(1, rowCount + 1));
        builder.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n");
        builder.append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">\n");
        builder.append("<dimension ref=\"").append(dimension).append("\"/>\n");
        builder.append("<sheetViews><sheetView workbookViewId=\"0\"/></sheetViews>\n");
        builder.append("<sheetFormatPr defaultRowHeight=\"15\"/>\n<sheetData>\n");
        if (columnCount > 0) {
            builder.append("<row r=\"1\">");
            for (int index = 0; index < columnCount; index++) {
                appendInlineStringCell(builder, cellRef(index + 1, 1), columns.get(index));
            }
            builder.append("</row>\n");
            for (int rowIndex = 0; rowIndex < rowCount; rowIndex++) {
                int excelRow = rowIndex + 2;
                Map<String, Object> row = rows.get(rowIndex);
                builder.append("<row r=\"").append(excelRow).append("\">");
                for (int columnIndex = 0; columnIndex < columnCount; columnIndex++) {
                    String column = columns.get(columnIndex);
                    appendInlineStringCell(builder, cellRef(columnIndex + 1, excelRow), exportCellText(row.get(column)));
                }
                builder.append("</row>\n");
            }
        }
        builder.append("</sheetData>\n</worksheet>\n");
        return builder.toString();
    }

    private String corePropertiesXml() {
        String created = Instant.now().toString();
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                  <dc:creator>JavaNavi</dc:creator>
                  <cp:lastModifiedBy>JavaNavi</cp:lastModifiedBy>
                  <dcterms:created xsi:type="dcterms:W3CDTF">%s</dcterms:created>
                  <dcterms:modified xsi:type="dcterms:W3CDTF">%s</dcterms:modified>
                </cp:coreProperties>
                """.formatted(created, created);
    }

    private void appendInlineStringCell(StringBuilder builder, String reference, Object value) {
        builder.append("<c r=\"").append(reference).append("\" t=\"inlineStr\"><is><t xml:space=\"preserve\">")
                .append(escapeXml(exportCellText(value)))
                .append("</t></is></c>");
    }

    private static String cellRef(int oneBasedColumn, int oneBasedRow) {
        int column = Math.max(1, oneBasedColumn);
        StringBuilder ref = new StringBuilder();
        while (column > 0) {
            column--;
            ref.insert(0, (char) ('A' + (column % 26)));
            column /= 26;
        }
        return ref.append(Math.max(1, oneBasedRow)).toString();
    }

    private void addZipEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.stripLeading().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private String toSqlInserts(String tableName, List<Map<String, Object>> rows, List<String> columns) {
        StringBuilder builder = new StringBuilder();
        builder.append("-- JavaNavi data export compatibility SQL\n");
        appendInsertStatements(builder, "", quoteIdentifier(normalizeFileToken(tableName, "export_table")), rows, columns);
        return builder.toString();
    }

    private void appendInsertStatements(StringBuilder builder, String driver, String tableName, List<Map<String, Object>> rows, List<String> columns) {
        if (columns == null || columns.isEmpty()) {
            builder.append("-- (no columns)\n");
            return;
        }
        if (rows == null || rows.isEmpty()) {
            builder.append("-- (0 rows)\n");
            return;
        }
        String columnSql = columns.stream().map(column -> quoteIdentifier(driver, column)).reduce((left, right) -> left + ", " + right).orElse("");
        for (Map<String, Object> row : rows) {
            String values = columns.stream().map(column -> sqlLiteral(row.get(column))).reduce((left, right) -> left + ", " + right).orElse("");
            builder.append("INSERT INTO ").append(tableName).append(" (").append(columnSql).append(") VALUES (").append(values).append(");\n");
        }
    }

    private static void appendSqlStatement(StringBuilder builder, String statement) {
        String sql = stripTrailingSemicolons(statement);
        if (!sql.isBlank()) {
            builder.append(sql).append(";\n");
        }
    }

    private static String stripTrailingSemicolons(String statement) {
        String sql = statement == null ? "" : statement.stripTrailing();
        while (sql.endsWith(";")) {
            sql = sql.substring(0, sql.length() - 1).stripTrailing();
        }
        return sql;
    }

    private String normalizeImportFileName(String originalName) {
        String name = normalizeFileToken(originalName, "import.csv");
        String lower = name.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".csv") && !lower.endsWith(".json")) {
            throw new IllegalArgumentException("Only CSV and JSON import files are supported.");
        }
        return name;
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
            throw new IllegalArgumentException("Import file path is required.");
        }
        Path input = Path.of(raw);
        Path candidate = input.isAbsolute()
                ? input.toAbsolutePath().normalize()
                : importDirectory.resolve(raw.replace('\\', '/')).normalize();
        if (!candidate.startsWith(importDirectory)) {
            throw new IllegalArgumentException("Import files must stay inside the JavaNavi managed import workspace.");
        }
        if (!Files.exists(candidate)) {
            throw new IllegalArgumentException("Import file does not exist in the JavaNavi managed workspace.");
        }
        return candidate;
    }

    @SuppressWarnings("unchecked")
    private ConnectionConfigDto connectionConfig(Map<String, Object> input) {
        Object raw = input == null ? null : input.get("connection");
        if (raw instanceof ConnectionConfigDto config) {
            return config;
        }
        if (raw instanceof Map<?, ?> map) {
            return objectMapper.convertValue(map, ConnectionConfigDto.class);
        }
        return new ConnectionConfigDto("demo-h2", "Demo", "h2", null, null, "", null, null, Map.of(), null);
    }


    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> rowsFromInput(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                rows.add(new LinkedHashMap<>((Map<String, Object>) map));
            }
        }
        return rows;
    }

    private static List<String> stringList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
                .map(FileWorkflowCompatibilityService::text)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
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
        return switch (normalized) {
            case "csv", "json", "sql", "md", "html" -> normalized;
            case "xlsx", "xls", "excel" -> "xlsx";
            case "markdown" -> "md";
            case "htm" -> "html";
            default -> "json";
        };
    }

    private String importDriverType(ConnectionConfigDto connection) {
        String driver = normalizeDriverType(connection == null ? null : connection.driverType());
        if ("custom".equals(driver)) {
            driver = normalizeDriverType(firstText(
                    connection == null ? null : connection.driver(),
                    connection != null && connection.options() != null ? connection.options().get("driver") : null,
                    connection != null && connection.options() != null ? connection.options().get("driverType") : null
            ));
        }
        return driver;
    }

    private void cleanupStaleImportFiles() {
        try {
            if (!Files.isDirectory(importDirectory)) {
                return;
            }
            Instant cutoff = Instant.now().minus(IMPORT_FILE_RETENTION);
            try (var files = Files.list(importDirectory)) {
                files.filter(Files::isRegularFile)
                        .filter(path -> {
                            try {
                                return Files.getLastModifiedTime(path).toInstant().isBefore(cutoff);
                            } catch (IOException ignored) {
                                return false;
                            }
                        })
                        .forEach(this::deleteQuietly);
            }
        } catch (IOException ignored) {
            // Cleanup is best effort and must not block import.
        }
    }

    private void deleteQuietly(Path file) {
        try {
            if (file != null && file.toAbsolutePath().normalize().startsWith(importDirectory.toAbsolutePath().normalize())) {
                Files.deleteIfExists(file);
            }
        } catch (IOException ignored) {
            // Managed import file cleanup is best effort.
        }
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

    private static String quoteQualifiedIdentifier(String driver, String identifier) {
        QualifiedName qualified = splitQualifiedName(identifier);
        String qualifier = text(qualified.qualifier());
        String table = textOrDefault(qualified.name(), identifier);
        return qualifier.isBlank()
                ? quoteIdentifier(driver, table)
                : quoteIdentifier(driver, qualifier) + "." + quoteIdentifier(driver, table);
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
            case "mysql", "mariadb", "doris", "diros", "sphinx" -> "mysql";
            case "kingbase", "kingbase8", "kingbasees", "kingbasev8", "highgo", "vastbase" -> "postgresql";
            case "sqlserver", "mssql", "sql_server", "sql server" -> "sqlserver";
            case "dameng", "dm", "dm8" -> "dameng";
            case "tdengine", "taos", "taos-rs", "taos_rs" -> "tdengine";
            case "clickhouse", "ch" -> "clickhouse";
            case "sqlite", "sqlite3" -> "sqlite";
            case "duckdb" -> "duckdb";
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
        if (value instanceof LocalDateTime dateTime) {
            return quotedSqlText(formatSqlDateTime(dateTime));
        }
        if (value instanceof LocalDate date) {
            return quotedSqlText(date.toString());
        }
        if (value instanceof LocalTime time) {
            return quotedSqlText(formatSqlTime(time));
        }
        if (value instanceof java.sql.Timestamp timestamp) {
            return quotedSqlText(formatSqlDateTime(timestamp.toLocalDateTime()));
        }
        if (value instanceof java.sql.Date date) {
            return quotedSqlText(date.toLocalDate().toString());
        }
        if (value instanceof java.sql.Time time) {
            return quotedSqlText(formatSqlTime(time.toLocalTime()));
        }
        return quotedSqlText(String.valueOf(value));
    }

    private static String quotedSqlText(String value) {
        return "'" + String.valueOf(value).replace("'", "''") + "'";
    }

    private static String formatSqlDateTime(LocalDateTime dateTime) {
        String formatted = dateTime.format(SQL_DATE_TIME_FORMATTER);
        return appendFraction(formatted, dateTime.getNano());
    }

    private static String formatSqlTime(LocalTime time) {
        String formatted = time.format(SQL_TIME_FORMATTER);
        return appendFraction(formatted, time.getNano());
    }

    private static String appendFraction(String formatted, int nano) {
        if (nano <= 0) {
            return formatted;
        }
        String fraction = String.format(Locale.ROOT, "%09d", nano).replaceFirst("0+$", "");
        return formatted + "." + fraction;
    }

    private String exportCellText(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof CharSequence || value instanceof Number || value instanceof Boolean || value instanceof Character) {
            return String.valueOf(value);
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (IOException ignored) {
            return String.valueOf(value);
        }
    }

    private String escapeMarkdownCell(Object value) {
        return exportCellText(value)
                .replace("\\", "\\\\")
                .replace("|", "\\|")
                .replace("\r\n", "<br>")
                .replace("\n", "<br>")
                .replace("\r", "<br>");
    }

    private String escapeHtml(Object value) {
        return exportCellText(value)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String escapeXml(String value) {
        return xmlSafe(value)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;");
    }

    private static String xmlSafe(String value) {
        StringBuilder builder = new StringBuilder();
        value.codePoints().forEach(codePoint -> {
            if (codePoint == 0x9
                    || codePoint == 0xA
                    || codePoint == 0xD
                    || (codePoint >= 0x20 && codePoint <= 0xD7FF)
                    || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
                    || (codePoint >= 0x10000 && codePoint <= 0x10FFFF)) {
                builder.appendCodePoint(codePoint);
            } else {
                builder.append(' ');
            }
        });
        return builder.toString();
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

    private static String stripUtf8Bom(String value) {
        return value != null && !value.isEmpty() && value.charAt(0) == '\uFEFF' ? value.substring(1) : value;
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    private record DuplicateFilterResult(
            List<Map<String, Object>> rows,
            int skippedDuplicates,
            List<String> logs,
            List<Map<String, Object>> logCodes,
            String strategy,
            String strategyCode,
            List<String> columns,
            String warning,
            String warningCode
    ) {
    }

    private record QualifiedName(String qualifier, String name) {
    }
}
