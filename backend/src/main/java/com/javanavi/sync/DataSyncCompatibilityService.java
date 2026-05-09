package com.javanavi.sync;

import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.CompatEventDto;
import com.javanavi.model.ApplyChangesResultDto;
import com.javanavi.model.ChangeSetDto;
import com.javanavi.model.ColumnDefinitionDto;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.QueryRequestDto;
import com.javanavi.model.QueryResultDto;
import com.javanavi.model.UpdateRowDto;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class DataSyncCompatibilityService {
    private static final int SYNC_QUERY_PAGE_SIZE = 10_000;
    private final DatabaseCompatibilityService databaseCompatibilityService;
    private final CompatEventPublisher eventPublisher;
    private final I18nMessages messages;
    private final Set<String> cancelledJobs = ConcurrentHashMap.newKeySet();

    public DataSyncCompatibilityService(DatabaseCompatibilityService databaseCompatibilityService, CompatEventPublisher eventPublisher, I18nMessages messages) {
        this.databaseCompatibilityService = databaseCompatibilityService;
        this.eventPublisher = eventPublisher;
        this.messages = messages;
    }

    public Map<String, Object> cancel(String jobId) {
        String normalized = text(jobId);
        if (!normalized.isBlank()) {
            cancelledJobs.add(normalized);
            publishSyncLog(normalized, "warn", "Data sync cancelled by user.");
        }
        return orderedMap("cancelled", true, "jobId", normalized);
    }

    public Map<String, Object> run(Map<String, Object> input) {
        SyncRequest request = SyncRequest.from(input);
        try {
            if (request.hasSourceQuery()) {
                return runSourceQuerySync(request);
            }
            if (request.hasJdbcTableSync()) {
                return runJdbcTableSync(request);
            }
            if (!request.fixtureEligible()) {
                return externalPendingRun(request);
            }
            List<TableDiff> diffs = new ArrayList<>();
            for (String table : request.tables()) {
                throwIfCancelled(request.jobId());
                diffs.add(diff(table, request.fixture(table)));
            }

            int inserted = 0;
            int updated = 0;
            int deleted = 0;
            int tablesSynced = 0;
            List<String> logs = new ArrayList<>();
            logs.add("DataSync fixture-backed compatibility request accepted");
            logs.add("Mode: " + request.mode() + "; content: " + request.content());
            publishSyncLog(request.jobId(), "info", "DataSync fixture-backed compatibility request accepted");

            Map<String, Object> targetSnapshots = new LinkedHashMap<>();
            boolean syncSchema = request.syncSchema();
            boolean syncData = request.syncData();
            int total = Math.max(1, diffs.size());
            for (int index = 0; index < diffs.size(); index++) {
                throwIfCancelled(request.jobId());
                TableDiff diff = diffs.get(index);
                TableOptions options = request.tableOptions(diff.table());
                List<Map<String, Object>> targetAfter = diff.copyTargetRows();
                publishSyncProgress(request.jobId(), index, total, diff.table(), messages.message("events.readSource"));
                if (syncSchema) {
                    logs.add("Schema fixture inspected for table " + diff.table() + ": " + diff.schemaStatements().size() + " statement(s)");
                }
                if (syncData) {
                    MutationStats stats = applyFixtureMutation(diff, targetAfter, request.mode(), options);
                    inserted += stats.inserted();
                    updated += stats.updated();
                    deleted += stats.deleted();
                    logs.add("Table " + diff.table() + ": inserted=" + stats.inserted() + ", updated=" + stats.updated() + ", deleted=" + stats.deleted());
                    publishSyncProgress(request.jobId(), index + 1, total, diff.table(), messages.message("events.writeTarget"));
                }
                if (syncSchema || syncData) {
                    tablesSynced++;
                }
                targetSnapshots.put(diff.table(), targetAfter);
            }
            publishSyncLog(request.jobId(), "info", "DataSync fixture-backed compatibility completed.");
            publishSyncProgress(request.jobId(), total, total, diffs.isEmpty() ? "" : diffs.get(diffs.size() - 1).table(), messages.message("events.complete"));

            return orderedMap(
                    "success", true,
                    "message", "JavaNavi Web data sync compatibility completed against managed fixture datasets.",
                    "logs", logs,
                    "tablesSynced", tablesSynced,
                    "rowsInserted", inserted,
                    "rowsUpdated", updated,
                    "rowsDeleted", deleted,
                    "totalRows", inserted + updated + deleted,
                    "syncedRows", inserted + updated + deleted,
                    "jobId", request.jobId(),
                    "tables", request.tables(),
                    "dryRun", false,
                    "fixtureBacked", true,
                    "targetSnapshots", targetSnapshots
            );
        } catch (DataSyncCancelledException cancelled) {
            return cancelledResult(request.jobId(), List.of("Data sync cancelled by user."));
        } finally {
            cancelledJobs.remove(request.jobId());
        }
    }

    public Map<String, Object> analyze(Map<String, Object> input) {
        SyncRequest request = SyncRequest.from(input);
        throwIfCancelled(request.jobId());
        try {
            if (request.hasSourceQuery()) {
                return analyzeSourceQuerySync(request);
            }
            if (request.hasJdbcTableSync()) {
                return analyzeJdbcTableSync(request);
            }
            if (!request.fixtureEligible()) {
                return externalPendingAnalyze(request);
            }
            List<Map<String, Object>> tableSummaries = new ArrayList<>();
            int total = Math.max(1, request.tables().size());
            for (int index = 0; index < request.tables().size(); index++) {
                throwIfCancelled(request.jobId());
                String table = request.tables().get(index);
                TableDiff diff = diff(table, request.fixture(table));
                tableSummaries.add(orderedMap(
                        "table", diff.table(),
                        "pkColumn", diff.pkColumn(),
                        "canSync", true,
                        "inserts", diff.inserts().size(),
                        "updates", diff.updates().size(),
                        "deletes", diff.deletes().size(),
                        "same", diff.same(),
                        "schemaDiffCount", diff.schemaStatements().size(),
                        "message", diff.summaryMessage(),
                        "hasSchema", request.syncSchema(),
                        "targetTableExists", true,
                        "plannedAction", request.syncSchema() ? "Fixture schema will be checked before data mutation" : "Fixture data diff is ready",
                        "warnings", List.of("Fixture-backed Java Web compatibility path; external cross-database writes still require integration profile evidence."),
                        "unsupportedObjects", List.of(),
                        "indexesToCreate", 0,
                        "indexesSkipped", 0
                ));
                publishSyncProgress(request.jobId(), index + 1, total, table, messages.message("events.readSource"));
            }
            return orderedMap(
                    "success", true,
                    "message", "JavaNavi Web data sync analysis completed against managed fixture datasets.",
                    "logs", List.of("Analyzed table count: " + request.tables().size(), "Fixture source/target rows were compared without external database side effects"),
                    "tablesSynced", 0,
                    "rowsInserted", tableSummaries.stream().mapToInt(row -> intValue(row.get("inserts"), 0)).sum(),
                    "rowsUpdated", tableSummaries.stream().mapToInt(row -> intValue(row.get("updates"), 0)).sum(),
                    "rowsDeleted", tableSummaries.stream().mapToInt(row -> intValue(row.get("deletes"), 0)).sum(),
                    "tables", tableSummaries,
                    "dryRun", true,
                    "fixtureBacked", true
            );
        } catch (DataSyncCancelledException cancelled) {
            return cancelledResult(request.jobId(), List.of("Data sync cancelled by user."));
        } finally {
            cancelledJobs.remove(request.jobId());
        }
    }

    public Map<String, Object> preview(Map<String, Object> input) {
        SyncRequest request = SyncRequest.from(input);
        throwIfCancelled(request.jobId());
        try {
            String table = firstText(text(input == null ? null : input.get("table")), request.tables().isEmpty() ? "" : request.tables().get(0));
            if (table.isBlank()) {
                table = "fixture_table";
            }
            int limit = positiveInt(input == null ? null : input.get("limit"), 20, 500);
            if (request.hasSourceQuery()) {
                return previewSourceQuerySync(request, table, limit);
            }
            if (request.hasJdbcTableSync()) {
                return previewJdbcTableSync(request, table, limit);
            }
            if (!request.fixtureEligible()) {
                return externalPendingPreview(table, limit);
            }
            TableDiff diff = diff(table, request.fixture(table));
            List<Map<String, Object>> inserts = diff.inserts().stream().limit(limit).map(PreviewInsert::toMap).toList();
            List<Map<String, Object>> updates = diff.updates().stream().limit(limit).map(PreviewUpdate::toMap).toList();
            List<Map<String, Object>> deletes = diff.deletes().stream().limit(limit).map(PreviewDelete::toMap).toList();
            return orderedMap(
                    "table", diff.table(),
                    "pkColumn", diff.pkColumn(),
                    "columnTypes", diff.columnTypes(),
                    "schemaSummary", request.syncSchema() ? "Fixture schema statements available" : "Fixture data diff preview",
                    "schemaWarnings", List.of("External database schema execution is not performed by the fixture path."),
                    "schemaStatements", diff.schemaStatements(),
                    "totalInserts", diff.inserts().size(),
                    "totalUpdates", diff.updates().size(),
                    "totalDeletes", diff.deletes().size(),
                    "inserts", inserts,
                    "updates", updates,
                    "deletes", deletes,
                    "insertRows", inserts,
                    "updateRows", updates,
                    "deleteRows", deletes,
                    "limit", limit,
                    "hasMore", diff.inserts().size() > limit || diff.updates().size() > limit || diff.deletes().size() > limit,
                    "dryRun", true,
                    "fixtureBacked", true,
                    "message", "JavaNavi Web data sync preview computed source/target fixture differences."
            );
        } catch (DataSyncCancelledException cancelled) {
            return cancelledResult(request.jobId(), List.of("Data sync cancelled by user."));
        } finally {
            cancelledJobs.remove(request.jobId());
        }
    }


    private Map<String, Object> runSourceQuerySync(SyncRequest request) {
        boolean diffMode = "insert_update".equals(request.mode());
        SourceQueryContext context = loadSourceQueryContext(request, diffMode, diffMode);
        TableOptions options = request.tableOptions(context.table());
        if (!options.insert() && !options.update() && !options.delete()) {
            return orderedMap(
                    "success", true,
                    "message", "JavaNavi Web data sync source-query path skipped because no table operations were selected.",
                    "logs", List.of("No insert/update/delete operation was selected for " + context.table()),
                    "tablesSynced", 0,
                    "rowsInserted", 0,
                    "rowsUpdated", 0,
                    "rowsDeleted", 0,
                    "totalRows", 0,
                    "syncedRows", 0,
                    "jobId", request.jobId(),
                    "tables", request.tables(),
                    "dryRun", false,
                    "fixtureBacked", false,
                    "jdbcBacked", true,
                    "sourceQueryBacked", true
            );
        }

        List<Map<String, Object>> inserts = new ArrayList<>();
        List<UpdateRowDto> updates = new ArrayList<>();
        List<Map<String, Object>> deletes = new ArrayList<>();
        publishSyncLog(request.jobId(), "info", "DataSync source-query sync started.");
        publishSyncProgress(request.jobId(), 0, 2, context.table(), messages.message("events.readSource"));
        throwIfCancelled(request.jobId());
        if ("full_overwrite".equals(request.mode())) {
            databaseCompatibilityService.clearTables(context.targetConfig(), jdbcScopeName(context.targetConfig()), List.of(context.table()), false);
            if (options.insert()) {
                inserts.addAll(filteredSourceRows(context));
            }
        } else if ("insert_only".equals(request.mode())) {
            if (options.insert()) {
                inserts.addAll(filteredSourceRows(context));
            }
        } else {
            SourceQueryDiff diff = sourceQueryDiff(context);
            if (options.insert()) {
                inserts.addAll(diff.inserts().stream()
                        .filter(row -> options.allowsInsert(pkValue(row, context.pkColumn())))
                        .map(row -> filterRowToTargetColumns(row, context.targetColumns()))
                        .filter(row -> !row.isEmpty())
                        .toList());
            }
            if (options.update()) {
                updates.addAll(diff.updates().stream()
                        .filter(update -> options.allowsUpdate(pkValue(update.keys(), context.pkColumn())))
                        .map(update -> filterUpdateToTargetColumns(update, context.targetColumns()))
                        .filter(update -> !update.values().isEmpty())
                        .toList());
            }
            if (options.delete()) {
                deletes.addAll(diff.deletes().stream()
                        .filter(row -> options.allowsDelete(pkValue(row, context.pkColumn())))
                        .map(row -> Map.<String, Object>of(context.pkColumn(), cellValue(row, context.pkColumn())))
                        .toList());
            }
        }

        throwIfCancelled(request.jobId());
        ApplyChangesResultDto result = databaseCompatibilityService.applyChanges(
                context.targetConfig(),
                jdbcScopeName(context.targetConfig()),
                context.table(),
                new ChangeSetDto(inserts, updates, deletes)
        );
        publishSyncProgress(request.jobId(), 1, 2, context.table(), messages.message("events.writeTarget"));
        publishSyncLog(request.jobId(), "info", "DataSync source-query sync completed.");
        int affected = result.affectedRows();
        return orderedMap(
                "success", true,
                "message", "JavaNavi Web data sync applied source SQL result rows to the managed JDBC target table.",
                "logs", List.of(
                        "Source query rows: " + context.sourceRows().size(),
                        "Target table: " + context.table(),
                        "Applied inserts=" + result.insertedRows() + ", updates=" + result.updatedRows() + ", deletes=" + result.deletedRows()
                ),
                "tablesSynced", 1,
                "rowsInserted", result.insertedRows(),
                "rowsUpdated", result.updatedRows(),
                "rowsDeleted", result.deletedRows(),
                "totalRows", affected,
                "syncedRows", affected,
                "jobId", request.jobId(),
                "tables", request.tables(),
                "dryRun", false,
                "fixtureBacked", false,
                "jdbcBacked", true,
                "sourceQueryBacked", true
        );
    }

    private Map<String, Object> analyzeSourceQuerySync(SyncRequest request) {
        SourceQueryContext context = loadSourceQueryContext(request, true, true);
        SourceQueryDiff diff = sourceQueryDiff(context);
        Map<String, Object> summary = orderedMap(
                "table", context.table(),
                "pkColumn", context.pkColumn(),
                "canSync", true,
                "inserts", diff.inserts().size(),
                "updates", diff.updates().size(),
                "deletes", diff.deletes().size(),
                "same", diff.same(),
                "schemaDiffCount", 0,
                "message", messages.message("sync.sqlDiffDone"),
                "hasSchema", false,
                "targetTableExists", true,
                "plannedAction", "source-query-jdbc-apply",
                "warnings", List.of(),
                "unsupportedObjects", List.of(),
                "indexesToCreate", 0,
                "indexesSkipped", 0
        );
        return orderedMap(
                "success", true,
                "message", "JavaNavi Web data sync analyzed source SQL rows against the managed JDBC target table.",
                "logs", List.of("Analyzed source-query target table: " + context.table()),
                "tablesSynced", 0,
                "rowsInserted", diff.inserts().size(),
                "rowsUpdated", diff.updates().size(),
                "rowsDeleted", diff.deletes().size(),
                "tables", List.of(summary),
                "dryRun", true,
                "fixtureBacked", false,
                "jdbcBacked", true,
                "sourceQueryBacked", true
        );
    }

    private Map<String, Object> previewSourceQuerySync(SyncRequest request, String table, int limit) {
        SourceQueryContext context = loadSourceQueryContext(request.withSingleTable(table), true, true);
        SourceQueryDiff diff = sourceQueryDiff(context);
        List<Map<String, Object>> inserts = diff.inserts().stream().limit(limit)
                .map(row -> orderedMap("pk", pkValue(row, context.pkColumn()), "row", row))
                .toList();
        List<Map<String, Object>> updates = diff.updates().stream().limit(limit)
                .map(update -> {
                    Map<String, Object> target = context.targetByPk().get(pkValue(update.keys(), context.pkColumn()));
                    Map<String, Object> source = context.sourceByPk().get(pkValue(update.keys(), context.pkColumn()));
                    return orderedMap(
                            "pk", pkValue(update.keys(), context.pkColumn()),
                            "changedColumns", new ArrayList<>(update.values().keySet()),
                            "source", source == null ? Map.of() : source,
                            "target", target == null ? Map.of() : target
                    );
                })
                .toList();
        List<Map<String, Object>> deletes = diff.deletes().stream().limit(limit)
                .map(row -> orderedMap("pk", pkValue(row, context.pkColumn()), "row", row))
                .toList();
        return orderedMap(
                "table", context.table(),
                "pkColumn", context.pkColumn(),
                "columnTypes", columnTypes(context.targetColumns()),
                "schemaSummary", messages.message("sync.sqlPreview"),
                "schemaWarnings", List.of(),
                "schemaStatements", List.of(),
                "totalInserts", diff.inserts().size(),
                "totalUpdates", diff.updates().size(),
                "totalDeletes", diff.deletes().size(),
                "inserts", inserts,
                "updates", updates,
                "deletes", deletes,
                "insertRows", inserts,
                "updateRows", updates,
                "deleteRows", deletes,
                "limit", limit,
                "hasMore", diff.inserts().size() > limit || diff.updates().size() > limit || diff.deletes().size() > limit,
                "dryRun", true,
                "fixtureBacked", false,
                "jdbcBacked", true,
                "sourceQueryBacked", true,
                "message", "JavaNavi Web data sync preview computed source SQL differences against the managed JDBC target."
        );
    }

    private Map<String, Object> runJdbcTableSync(SyncRequest request) {
        int inserted = 0;
        int updated = 0;
        int deleted = 0;
        int tablesSynced = 0;
        List<String> logs = new ArrayList<>();
        logs.add("DataSync JDBC table-to-table request accepted");
        logs.add("Mode: " + request.mode() + "; content: " + request.content());
        publishSyncLog(request.jobId(), "info", "DataSync JDBC table-to-table request accepted.");

        if (!request.syncData()) {
            return orderedMap(
                    "success", true,
                    "message", "JavaNavi Web data sync inspected JDBC table metadata; schema-only mutation is not executed by this existing-table slice.",
                    "logs", logs,
                    "tablesSynced", 0,
                    "rowsInserted", 0,
                    "rowsUpdated", 0,
                    "rowsDeleted", 0,
                    "totalRows", 0,
                    "syncedRows", 0,
                    "jobId", request.jobId(),
                    "tables", request.tables(),
                    "dryRun", true,
                    "fixtureBacked", false,
                    "jdbcBacked", true,
                    "tableSyncBacked", true
            );
        }

        int total = Math.max(1, request.tables().size());
        for (String table : request.tables()) {
            throwIfCancelled(request.jobId());
            SourceQueryContext context = loadTableSyncContext(request, table, true, true);
            TableOptions options = request.tableOptions(context.table());
            if (!options.insert() && !options.update() && !options.delete()) {
                logs.add("Table " + context.table() + ": skipped because no insert/update/delete operation was selected");
                continue;
            }

            List<Map<String, Object>> inserts = new ArrayList<>();
            List<UpdateRowDto> updates = new ArrayList<>();
            List<Map<String, Object>> deletes = new ArrayList<>();
            publishSyncProgress(request.jobId(), tablesSynced, total, context.table(), messages.message("events.readSource"));
            if ("full_overwrite".equals(request.mode())) {
                databaseCompatibilityService.clearTables(context.targetConfig(), jdbcScopeName(context.targetConfig()), List.of(context.table()), false);
                if (options.insert()) {
                    inserts.addAll(filteredSourceRows(context));
                }
            } else if ("insert_only".equals(request.mode())) {
                if (options.insert()) {
                    SourceQueryDiff diff = sourceQueryDiff(context);
                    inserts.addAll(diff.inserts().stream()
                            .filter(row -> options.allowsInsert(pkValue(row, context.pkColumn())))
                            .map(row -> filterRowToTargetColumns(row, context.targetColumns()))
                            .filter(row -> !row.isEmpty())
                            .toList());
                }
            } else {
                SourceQueryDiff diff = sourceQueryDiff(context);
                if (options.insert()) {
                    inserts.addAll(diff.inserts().stream()
                            .filter(row -> options.allowsInsert(pkValue(row, context.pkColumn())))
                            .map(row -> filterRowToTargetColumns(row, context.targetColumns()))
                            .filter(row -> !row.isEmpty())
                            .toList());
                }
                if (options.update()) {
                    updates.addAll(diff.updates().stream()
                            .filter(update -> options.allowsUpdate(pkValue(update.keys(), context.pkColumn())))
                            .map(update -> filterUpdateToTargetColumns(update, context.targetColumns()))
                            .filter(update -> !update.values().isEmpty())
                            .toList());
                }
                if (options.delete()) {
                    deletes.addAll(diff.deletes().stream()
                            .filter(row -> options.allowsDelete(pkValue(row, context.pkColumn())))
                            .map(row -> Map.<String, Object>of(context.pkColumn(), cellValue(row, context.pkColumn())))
                            .toList());
                }
            }

            throwIfCancelled(request.jobId());
            ApplyChangesResultDto result = databaseCompatibilityService.applyChanges(
                    context.targetConfig(),
                    jdbcScopeName(context.targetConfig()),
                    context.table(),
                    new ChangeSetDto(inserts, updates, deletes)
            );
            publishSyncProgress(request.jobId(), tablesSynced + 1, total, context.table(), messages.message("events.writeTarget"));
            inserted += result.insertedRows();
            updated += result.updatedRows();
            deleted += result.deletedRows();
            tablesSynced++;
            logs.add("Table " + context.table() + ": inserted=" + result.insertedRows()
                    + ", updated=" + result.updatedRows() + ", deleted=" + result.deletedRows());
        }
        publishSyncLog(request.jobId(), "info", "DataSync JDBC table-to-table sync completed.");

        int affected = inserted + updated + deleted;
        return orderedMap(
                "success", true,
                "message", "JavaNavi Web data sync applied JDBC table-to-table differences to existing target table(s).",
                "logs", logs,
                "tablesSynced", tablesSynced,
                "rowsInserted", inserted,
                "rowsUpdated", updated,
                "rowsDeleted", deleted,
                "totalRows", affected,
                "syncedRows", affected,
                "jobId", request.jobId(),
                "tables", request.tables(),
                "dryRun", false,
                "fixtureBacked", false,
                "jdbcBacked", true,
                "tableSyncBacked", true
        );
    }

    private Map<String, Object> analyzeJdbcTableSync(SyncRequest request) {
        List<Map<String, Object>> tableSummaries = new ArrayList<>();
        int inserted = 0;
        int updated = 0;
        int deleted = 0;
        for (String table : request.tables()) {
            throwIfCancelled(request.jobId());
            SourceQueryContext context = loadTableSyncContext(request, table, true, true);
            SourceQueryDiff diff = sourceQueryDiff(context);
            inserted += diff.inserts().size();
            updated += diff.updates().size();
            deleted += diff.deletes().size();
            tableSummaries.add(orderedMap(
                    "table", context.table(),
                    "pkColumn", context.pkColumn(),
                    "canSync", true,
                    "inserts", diff.inserts().size(),
                    "updates", diff.updates().size(),
                    "deletes", diff.deletes().size(),
                    "same", diff.same(),
                    "schemaDiffCount", 0,
                    "message", messages.message("sync.jdbcDiffDone"),
                    "hasSchema", false,
                    "targetTableExists", true,
                    "plannedAction", "jdbc-table-to-table-apply",
                    "warnings", request.syncSchema()
                            ? List.of("Existing-table JDBC path verifies data sync; schema creation/migration remains a separate profile.")
                            : List.of(),
                    "unsupportedObjects", List.of(),
                    "indexesToCreate", 0,
                    "indexesSkipped", 0
            ));
        }
        return orderedMap(
                "success", true,
                "message", "JavaNavi Web data sync analyzed JDBC source table rows against existing JDBC target table(s).",
                "logs", List.of("Analyzed JDBC table count: " + request.tables().size()),
                "tablesSynced", 0,
                "rowsInserted", inserted,
                "rowsUpdated", updated,
                "rowsDeleted", deleted,
                "tables", tableSummaries,
                "dryRun", true,
                "fixtureBacked", false,
                "jdbcBacked", true,
                "tableSyncBacked", true
        );
    }

    private Map<String, Object> previewJdbcTableSync(SyncRequest request, String table, int limit) {
        throwIfCancelled(request.jobId());
        SourceQueryContext context = loadTableSyncContext(request.withSingleTable(table), table, true, true);
        SourceQueryDiff diff = sourceQueryDiff(context);
        List<Map<String, Object>> inserts = diff.inserts().stream().limit(limit)
                .map(row -> orderedMap("pk", pkValue(row, context.pkColumn()), "row", row))
                .toList();
        List<Map<String, Object>> updates = diff.updates().stream().limit(limit)
                .map(update -> {
                    Map<String, Object> target = context.targetByPk().get(pkValue(update.keys(), context.pkColumn()));
                    Map<String, Object> source = context.sourceByPk().get(pkValue(update.keys(), context.pkColumn()));
                    return orderedMap(
                            "pk", pkValue(update.keys(), context.pkColumn()),
                            "changedColumns", new ArrayList<>(update.values().keySet()),
                            "source", source == null ? Map.of() : source,
                            "target", target == null ? Map.of() : target
                    );
                })
                .toList();
        List<Map<String, Object>> deletes = diff.deletes().stream().limit(limit)
                .map(row -> orderedMap("pk", pkValue(row, context.pkColumn()), "row", row))
                .toList();
        return orderedMap(
                "table", context.table(),
                "pkColumn", context.pkColumn(),
                "columnTypes", columnTypes(context.targetColumns()),
                "schemaSummary", messages.message("sync.jdbcPreview"),
                "schemaWarnings", request.syncSchema()
                        ? List.of("Existing-table JDBC path does not create or migrate target schema in this slice.")
                        : List.of(),
                "schemaStatements", List.of(),
                "totalInserts", diff.inserts().size(),
                "totalUpdates", diff.updates().size(),
                "totalDeletes", diff.deletes().size(),
                "inserts", inserts,
                "updates", updates,
                "deletes", deletes,
                "insertRows", inserts,
                "updateRows", updates,
                "deleteRows", deletes,
                "limit", limit,
                "hasMore", diff.inserts().size() > limit || diff.updates().size() > limit || diff.deletes().size() > limit,
                "dryRun", true,
                "fixtureBacked", false,
                "jdbcBacked", true,
                "tableSyncBacked", true,
                "message", "JavaNavi Web data sync preview computed JDBC table-to-table differences."
        );
    }

    private static Map<String, Object> externalPendingRun(SyncRequest request) {
        return orderedMap(
                "success", true,
                "message", "JavaNavi Web data sync accepted the request but skipped external database mutation because only managed fixture/demo datasets are verified in this compatibility slice.",
                "logs", List.of("DataSync compatibility request accepted", "External source/target sync requires a dedicated integration profile", "No external target mutations were executed"),
                "tablesSynced", 0,
                "rowsInserted", 0,
                "rowsUpdated", 0,
                "rowsDeleted", 0,
                "totalRows", 0,
                "syncedRows", 0,
                "jobId", request.jobId(),
                "tables", request.tables(),
                "dryRun", true,
                "fixtureBacked", false
        );
    }

    private static Map<String, Object> externalPendingAnalyze(SyncRequest request) {
        List<Map<String, Object>> tableSummaries = request.tables().stream()
                .map(table -> orderedMap(
                        "table", table,
                        "pkColumn", "id",
                        "canSync", false,
                        "inserts", 0,
                        "updates", 0,
                        "deletes", 0,
                        "same", 0,
                        "schemaDiffCount", 0,
                        "message", "Source/target diff was not executed because this request did not include a fixture, source-query, or JDBC table profile.",
                        "hasSchema", request.syncSchema(),
                        "targetTableExists", false,
                        "plannedAction", "source-target-profile-required",
                        "warnings", List.of("No database mutation or row scan was executed for the unprofiled request."),
                        "unsupportedObjects", List.of(),
                        "indexesToCreate", 0,
                        "indexesSkipped", 0
                ))
                .toList();
        return orderedMap(
                "success", true,
                "message", "JavaNavi Web data sync analysis requires a fixture, source-query, or JDBC table profile for row-diff execution.",
                "logs", List.of("Analyzed table count: " + request.tables().size(), "No source/target rows were scanned because no executable profile was supplied"),
                "tablesSynced", 0,
                "rowsInserted", 0,
                "rowsUpdated", 0,
                "rowsDeleted", 0,
                "tables", tableSummaries,
                "dryRun", true,
                "fixtureBacked", false
        );
    }

    private static Map<String, Object> externalPendingPreview(String table, int limit) {
        return orderedMap(
                "table", table,
                "pkColumn", "id",
                "columnTypes", Map.of(),
                "schemaSummary", "Preview requires a fixture, source-query, or JDBC table profile",
                "schemaWarnings", List.of("No database rows were read for the unprofiled request."),
                "schemaStatements", List.of(),
                "totalInserts", 0,
                "totalUpdates", 0,
                "totalDeletes", 0,
                "inserts", List.of(),
                "updates", List.of(),
                "deletes", List.of(),
                "insertRows", List.of(),
                "updateRows", List.of(),
                "deleteRows", List.of(),
                "limit", limit,
                "hasMore", false,
                "dryRun", true,
                "fixtureBacked", false,
                "message", "JavaNavi Web data sync preview requires a fixture, source-query, or JDBC table profile for row-diff execution."
        );
    }

    private static MutationStats applyFixtureMutation(TableDiff diff, List<Map<String, Object>> targetAfter, String mode, TableOptions options) {
        if ("full_overwrite".equals(mode)) {
            int deleted = targetAfter.size();
            targetAfter.clear();
            for (PreviewInsert insert : diff.sourceAsInserts()) {
                targetAfter.add(copyRow(insert.row()));
            }
            return new MutationStats(diff.sourceAsInserts().size(), 0, deleted);
        }
        int inserted = 0;
        int updated = 0;
        int deleted = 0;
        if (options.insert()) {
            for (PreviewInsert insert : diff.inserts()) {
                if (!options.allowsInsert(insert.pk())) {
                    continue;
                }
                targetAfter.add(copyRow(insert.row()));
                inserted++;
            }
        }
        if (!"insert_only".equals(mode) && options.update()) {
            Map<String, Map<String, Object>> targetByPk = rowsByPk(targetAfter, diff.pkColumn());
            for (PreviewUpdate update : diff.updates()) {
                if (!options.allowsUpdate(update.pk())) {
                    continue;
                }
                Map<String, Object> row = targetByPk.get(update.pk());
                if (row != null) {
                    row.clear();
                    row.putAll(copyRow(update.source()));
                    updated++;
                }
            }
        }
        if (!"insert_only".equals(mode) && options.delete()) {
            Set<String> deletePks = diff.deletes().stream()
                    .map(PreviewDelete::pk)
                    .filter(options::allowsDelete)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            if (!deletePks.isEmpty()) {
                int before = targetAfter.size();
                targetAfter.removeIf(row -> deletePks.contains(pkValue(row, diff.pkColumn())));
                deleted = before - targetAfter.size();
            }
        }
        return new MutationStats(inserted, updated, deleted);
    }

    private void throwIfCancelled(String jobId) {
        String normalized = text(jobId);
        if (!normalized.isBlank() && cancelledJobs.contains(normalized)) {
            throw new DataSyncCancelledException(normalized);
        }
    }

    private void publishSyncLog(String jobId, String level, String message) {
        if (eventPublisher == null) {
            return;
        }
        Instant now = Instant.now();
        eventPublisher.publish(new CompatEventDto(
                UUID.randomUUID().toString(),
                "sync:log",
                "sync",
                "javanavi-backend",
                jobId,
                "running",
                message,
                now,
                orderedMap(
                        "jobId", jobId,
                        "level", level,
                        "message", message,
                        "ts", now.toEpochMilli()
                )
        ));
    }

    private void publishSyncProgress(String jobId, int current, int total, String table, String stage) {
        if (eventPublisher == null) {
            return;
        }
        int safeTotal = Math.max(total, 0);
        int safeCurrent = Math.max(0, Math.min(current, safeTotal == 0 ? current : safeTotal));
        int percent = safeTotal <= 0 ? 0 : Math.min(100, Math.max(0, (int) Math.round((safeCurrent * 100.0) / safeTotal)));
        Instant now = Instant.now();
        eventPublisher.publish(new CompatEventDto(
                UUID.randomUUID().toString(),
                "sync:progress",
                "sync",
                "javanavi-backend",
                jobId,
                "running",
                stage,
                now,
                orderedMap(
                        "jobId", jobId,
                        "percent", percent,
                        "current", safeCurrent,
                        "total", safeTotal,
                        "table", table,
                        "stage", stage
                )
        ));
    }

    private Map<String, Object> cancelledResult(String jobId, List<String> logs) {
        return orderedMap(
                "success", true,
                "cancelled", true,
                "message", "已取消",
                "jobId", jobId,
                "logs", logs,
                "tablesSynced", 0,
                "rowsInserted", 0,
                "rowsUpdated", 0,
                "rowsDeleted", 0,
                "totalRows", 0,
                "syncedRows", 0,
                "dryRun", false,
                "fixtureBacked", false,
                "jdbcBacked", false
        );
    }

    private static TableDiff diff(String table, TableFixture fixture) {
        String pkColumn = fixture.pkColumn();
        Map<String, Map<String, Object>> targetByPk = rowsByPk(fixture.targetRows(), pkColumn);
        Set<String> sourcePks = new HashSet<>();
        List<PreviewInsert> inserts = new ArrayList<>();
        List<PreviewUpdate> updates = new ArrayList<>();
        int same = 0;
        for (Map<String, Object> sourceRow : fixture.sourceRows()) {
            String pk = pkValue(sourceRow, pkColumn);
            if (pk.isBlank()) {
                continue;
            }
            sourcePks.add(pk);
            Map<String, Object> targetRow = targetByPk.get(pk);
            if (targetRow == null) {
                inserts.add(new PreviewInsert(pk, copyRow(sourceRow)));
                continue;
            }
            List<String> changed = changedColumns(sourceRow, targetRow, pkColumn);
            if (changed.isEmpty()) {
                same++;
            } else {
                updates.add(new PreviewUpdate(pk, changed, copyRow(sourceRow), copyRow(targetRow)));
            }
        }
        List<PreviewDelete> deletes = new ArrayList<>();
        for (Map<String, Object> targetRow : fixture.targetRows()) {
            String pk = pkValue(targetRow, pkColumn);
            if (!pk.isBlank() && !sourcePks.contains(pk)) {
                deletes.add(new PreviewDelete(pk, copyRow(targetRow)));
            }
        }
        return new TableDiff(table, pkColumn, fixture.columnTypes(), fixture.schemaStatements(), inserts, updates, deletes, same, fixture.sourceRows(), fixture.targetRows());
    }

    private static List<String> changedColumns(Map<String, Object> sourceRow, Map<String, Object> targetRow, String pkColumn) {
        List<String> columns = new ArrayList<>();
        LinkedHashSet<String> names = new LinkedHashSet<>();
        names.addAll(sourceRow.keySet());
        names.addAll(targetRow.keySet());
        for (String name : names) {
            if (name.equalsIgnoreCase(pkColumn)) {
                continue;
            }
            if (!Objects.equals(normalizeCell(sourceRow.get(name)), normalizeCell(targetRow.get(name)))) {
                columns.add(name);
            }
        }
        return columns;
    }

    private static Object normalizeCell(Object value) {
        if (value instanceof Number number) {
            return number.toString();
        }
        return value;
    }

    private static Map<String, Map<String, Object>> rowsByPk(List<Map<String, Object>> rows, String pkColumn) {
        Map<String, Map<String, Object>> byPk = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            String pk = pkValue(row, pkColumn);
            if (!pk.isBlank()) {
                byPk.put(pk, row);
            }
        }
        return byPk;
    }

    private static String pkValue(Map<String, Object> row, String pkColumn) {
        Object exact = row.get(pkColumn);
        if (exact != null) {
            return text(exact);
        }
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(pkColumn)) {
                return text(entry.getValue());
            }
        }
        return "";
    }

    private static List<String> tableNames(Map<String, Object> input) {
        LinkedHashSet<String> tables = new LinkedHashSet<>();
        if (input != null && input.get("tables") instanceof List<?> rawTables) {
            rawTables.stream().map(DataSyncCompatibilityService::text).filter(value -> !value.isBlank()).forEach(tables::add);
        }
        if (input != null && input.get("fixtures") instanceof Map<?, ?> fixtures) {
            fixtures.keySet().stream().map(DataSyncCompatibilityService::text).filter(value -> !value.isBlank()).forEach(tables::add);
        }
        if (tables.isEmpty()) {
            tables.add("users");
        }
        return new ArrayList<>(tables);
    }

    @SuppressWarnings("unchecked")
    private static TableFixture tableFixture(Map<String, Object> input, String table) {
        if (input != null && input.get("fixtures") instanceof Map<?, ?> rawFixtures) {
            Object rawFixture = lookupIgnoreCase(rawFixtures, table);
            if (rawFixture instanceof Map<?, ?> fixtureMap) {
                return parseFixture(table, (Map<String, Object>) fixtureMap);
            }
        }
        return defaultFixture(table);
    }

    private static TableFixture parseFixture(String table, Map<String, Object> fixtureMap) {
        String pkColumn = firstText(text(fixtureMap.get("pkColumn")), text(fixtureMap.get("primaryKey")), "id");
        List<Map<String, Object>> sourceRows = rowsFrom(firstNonNull(fixtureMap.get("sourceRows"), fixtureMap.get("source")));
        List<Map<String, Object>> targetRows = rowsFrom(firstNonNull(fixtureMap.get("targetRows"), fixtureMap.get("target")));
        if (sourceRows.isEmpty() && targetRows.isEmpty()) {
            return defaultFixture(table);
        }
        Map<String, String> columnTypes = columnTypes(fixtureMap.get("columnTypes"), sourceRows, targetRows, pkColumn);
        List<String> schemaStatements = stringList(fixtureMap.get("schemaStatements"));
        if (schemaStatements.isEmpty()) {
            schemaStatements = List.of(createTableStatement(table, columnTypes, pkColumn));
        }
        return new TableFixture(pkColumn, sourceRows, targetRows, columnTypes, schemaStatements);
    }

    private static TableFixture defaultFixture(String table) {
        String normalized = safeIdentifier(table);
        List<Map<String, Object>> sourceRows = List.of(
                orderedMap("id", 1, "name", normalized + "-alpha", "status", "active"),
                orderedMap("id", 2, "name", normalized + "-beta", "status", "active"),
                orderedMap("id", 3, "name", normalized + "-gamma", "status", "new")
        );
        List<Map<String, Object>> targetRows = List.of(
                orderedMap("id", 1, "name", normalized + "-alpha", "status", "active"),
                orderedMap("id", 2, "name", normalized + "-beta-old", "status", "stale"),
                orderedMap("id", 4, "name", normalized + "-delta", "status", "orphan")
        );
        Map<String, String> columnTypes = orderedStringMap("id", "INTEGER", "name", "VARCHAR", "status", "VARCHAR");
        return new TableFixture("id", sourceRows, targetRows, columnTypes, List.of(createTableStatement(normalized, columnTypes, "id")));
    }

    private static List<Map<String, Object>> rowsFrom(Object value) {
        if (!(value instanceof List<?> rawRows)) {
            return List.of();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object rawRow : rawRows) {
            if (rawRow instanceof Map<?, ?> rawMap) {
                Map<String, Object> row = new LinkedHashMap<>();
                rawMap.forEach((key, cell) -> row.put(text(key), cell));
                rows.add(row);
            }
        }
        return rows;
    }

    private static Map<String, String> columnTypes(Object rawColumnTypes, List<Map<String, Object>> sourceRows, List<Map<String, Object>> targetRows, String pkColumn) {
        Map<String, String> result = new LinkedHashMap<>();
        if (rawColumnTypes instanceof Map<?, ?> rawMap) {
            rawMap.forEach((key, value) -> {
                String column = text(key);
                String type = text(value);
                if (!column.isBlank() && !type.isBlank()) {
                    result.put(column, type);
                }
            });
        }
        List<Map<String, Object>> allRows = new ArrayList<>();
        allRows.addAll(sourceRows);
        allRows.addAll(targetRows);
        for (Map<String, Object> row : allRows) {
            for (Map.Entry<String, Object> entry : row.entrySet()) {
                result.putIfAbsent(entry.getKey(), inferColumnType(entry.getKey(), entry.getValue(), pkColumn));
            }
        }
        result.putIfAbsent(pkColumn, "VARCHAR");
        return result.entrySet().stream()
                .sorted(Comparator.comparing(entry -> entry.getKey().equalsIgnoreCase(pkColumn) ? "" : entry.getKey().toLowerCase(Locale.ROOT)))
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (left, right) -> left, LinkedHashMap::new));
    }

    private static String inferColumnType(String column, Object value, String pkColumn) {
        if (column.equalsIgnoreCase(pkColumn) && value instanceof Number) {
            return "INTEGER";
        }
        if (value instanceof Number) {
            return "DECIMAL";
        }
        if (value instanceof Boolean) {
            return "BOOLEAN";
        }
        return "VARCHAR";
    }

    private static String createTableStatement(String table, Map<String, String> columnTypes, String pkColumn) {
        String columns = columnTypes.entrySet().stream()
                .map(entry -> quoteIdentifier(entry.getKey()) + " " + entry.getValue() + (entry.getKey().equalsIgnoreCase(pkColumn) ? " PRIMARY KEY" : ""))
                .collect(Collectors.joining(", "));
        return "CREATE TABLE IF NOT EXISTS " + quoteIdentifier(safeIdentifier(table)) + " (" + columns + ")";
    }

    private static String quoteIdentifier(String value) {
        return '"' + safeIdentifier(value) + '"';
    }

    private static String safeIdentifier(String value) {
        String text = text(value).replaceAll("[^A-Za-z0-9_]", "_");
        return text.isBlank() ? "fixture_table" : text;
    }

    private static Object lookupIgnoreCase(Map<?, ?> map, String key) {
        Object exact = map.get(key);
        if (exact != null) {
            return exact;
        }
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (text(entry.getKey()).equalsIgnoreCase(key)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static Object firstNonNull(Object... values) {
        for (Object value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static List<String> stringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(DataSyncCompatibilityService::text).filter(text -> !text.isBlank()).toList();
    }

    private static int positiveInt(Object value, int fallback, int max) {
        int result = intValue(value, fallback);
        if (result <= 0) {
            return fallback;
        }
        return Math.min(result, max);
    }

    private static int intValue(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(text(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static Map<String, Object> copyRow(Map<String, Object> row) {
        return new LinkedHashMap<>(row);
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            map.put(String.valueOf(entries[i]), entries[i + 1]);
        }
        return map;
    }

    private static Map<String, String> orderedStringMap(String key1, String value1, String key2, String value2, String key3, String value3) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put(key1, value1);
        map.put(key2, value2);
        map.put(key3, value3);
        return map;
    }


    private static boolean fixtureEligible(Map<String, Object> input) {
        if (input.get("fixtures") instanceof Map<?, ?> fixtures && !fixtures.isEmpty()) {
            return true;
        }
        boolean hasSource = input.get("sourceConfig") instanceof Map<?, ?>;
        boolean hasTarget = input.get("targetConfig") instanceof Map<?, ?>;
        if (!hasSource && !hasTarget) {
            return true;
        }
        return isDemoLikeConfig(input.get("sourceConfig")) && isDemoLikeConfig(input.get("targetConfig"));
    }

    private static boolean isDemoLikeConfig(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return false;
        }
        String driver = firstText(text(map.get("driverType")), text(map.get("type")), text(map.get("driver"))).toLowerCase(Locale.ROOT);
        return driver.isBlank() || Set.of("demo", "h2", "fixture").contains(driver);
    }

    private SourceQueryContext loadSourceQueryContext(SyncRequest request, boolean needTargetRows, boolean requirePk) {
        String table = request.requireSingleSourceQueryTargetTable();
        ConnectionConfigDto sourceConfig = request.connectionConfig("sourceConfig");
        ConnectionConfigDto targetConfig = request.connectionConfig("targetConfig");
        List<ColumnDefinitionDto> targetColumns = databaseCompatibilityService.listColumns(targetConfig, jdbcScopeName(targetConfig), table);
        if (targetColumns.isEmpty()) {
            throw new IllegalArgumentException(messages.message("sync.targetTableMissing", "table", table));
        }
        String pkColumn = requirePk ? resolveSinglePrimaryKey(targetColumns, messages) : firstText(targetColumns.get(0).name(), "id");
        QueryResultDto sourceResult = databaseCompatibilityService.execute(new QueryRequestDto(
                sourceConfig,
                "",
                request.sourceQuery(),
                1,
                SYNC_QUERY_PAGE_SIZE,
                request.jobId() + "-source"
        ));
        List<Map<String, Object>> sourceRows = normalizeRows(sourceResult.rows(), targetColumns);
        List<Map<String, Object>> targetRows = List.of();
        if (needTargetRows) {
            QueryResultDto targetResult = databaseCompatibilityService.execute(new QueryRequestDto(
                    targetConfig,
                    "",
                    "SELECT * FROM " + tableSqlName(targetConfig, table),
                    1,
                    SYNC_QUERY_PAGE_SIZE,
                    request.jobId() + "-target"
            ));
            targetRows = normalizeRows(targetResult.rows(), targetColumns);
        }
        return new SourceQueryContext(
                table,
                pkColumn,
                sourceConfig,
                targetConfig,
                targetColumns,
                sourceRows,
                targetRows,
                rowsByPk(sourceRows, pkColumn),
                rowsByPk(targetRows, pkColumn)
        );
    }

    private SourceQueryContext loadTableSyncContext(SyncRequest request, String table, boolean needTargetRows, boolean requirePk) {
        String tableName = firstText(table, request.tables().isEmpty() ? "" : request.tables().get(0));
        if (tableName.isBlank()) {
            throw new IllegalArgumentException(messages.message("sync.tableSelectionRequired"));
        }
        ConnectionConfigDto sourceConfig = request.connectionConfig("sourceConfig");
        ConnectionConfigDto targetConfig = request.connectionConfig("targetConfig");
        List<ColumnDefinitionDto> targetColumns = databaseCompatibilityService.listColumns(targetConfig, jdbcScopeName(targetConfig), tableName);
        if (targetColumns.isEmpty()) {
            throw new IllegalArgumentException(messages.message("sync.targetTableMissing", "table", tableName));
        }
        String pkColumn = requirePk ? resolveSinglePrimaryKey(targetColumns, messages) : firstText(targetColumns.get(0).name(), "id");
        QueryResultDto sourceResult = databaseCompatibilityService.execute(new QueryRequestDto(
                sourceConfig,
                "",
                "SELECT * FROM " + tableSqlName(sourceConfig, tableName),
                1,
                SYNC_QUERY_PAGE_SIZE,
                request.jobId() + "-" + safeIdentifier(tableName) + "-source-table"
        ));
        List<ColumnDefinitionDto> comparableColumns = comparableTargetColumns(targetColumns, sourceResult.columns(), pkColumn, messages);
        List<Map<String, Object>> sourceRows = normalizeAndFilterRows(sourceResult.rows(), comparableColumns);
        List<Map<String, Object>> targetRows = List.of();
        if (needTargetRows) {
            QueryResultDto targetResult = databaseCompatibilityService.execute(new QueryRequestDto(
                    targetConfig,
                    "",
                    "SELECT * FROM " + tableSqlName(targetConfig, tableName),
                    1,
                    SYNC_QUERY_PAGE_SIZE,
                    request.jobId() + "-" + safeIdentifier(tableName) + "-target-table"
            ));
            targetRows = normalizeAndFilterRows(targetResult.rows(), comparableColumns);
        }
        return new SourceQueryContext(
                tableName,
                pkColumn,
                sourceConfig,
                targetConfig,
                comparableColumns,
                sourceRows,
                targetRows,
                rowsByPk(sourceRows, pkColumn),
                rowsByPk(targetRows, pkColumn)
        );
    }

    private static SourceQueryDiff sourceQueryDiff(SourceQueryContext context) {
        List<Map<String, Object>> inserts = new ArrayList<>();
        List<UpdateRowDto> updates = new ArrayList<>();
        List<Map<String, Object>> deletes = new ArrayList<>();
        Set<String> sourcePks = new LinkedHashSet<>();
        int same = 0;
        for (Map<String, Object> sourceRow : context.sourceRows()) {
            String pk = pkValue(sourceRow, context.pkColumn());
            if (pk.isBlank()) {
                continue;
            }
            sourcePks.add(pk);
            Map<String, Object> targetRow = context.targetByPk().get(pk);
            if (targetRow == null) {
                inserts.add(copyRow(sourceRow));
                continue;
            }
            Map<String, Object> changed = changedValues(sourceRow, targetRow, context.pkColumn());
            if (changed.isEmpty()) {
                same++;
            } else {
                updates.add(new UpdateRowDto(Map.of(context.pkColumn(), cellValue(sourceRow, context.pkColumn())), changed));
            }
        }
        for (Map<String, Object> targetRow : context.targetRows()) {
            String pk = pkValue(targetRow, context.pkColumn());
            if (!pk.isBlank() && !sourcePks.contains(pk)) {
                deletes.add(Map.of(context.pkColumn(), cellValue(targetRow, context.pkColumn())));
            }
        }
        return new SourceQueryDiff(inserts, updates, deletes, same);
    }

    private static Map<String, Object> changedValues(Map<String, Object> sourceRow, Map<String, Object> targetRow, String pkColumn) {
        Map<String, Object> changed = new LinkedHashMap<>();
        LinkedHashSet<String> names = new LinkedHashSet<>();
        names.addAll(sourceRow.keySet());
        names.addAll(targetRow.keySet());
        for (String name : names) {
            if (name.equalsIgnoreCase(pkColumn)) {
                continue;
            }
            Object source = cellValue(sourceRow, name);
            Object target = cellValue(targetRow, name);
            if (!Objects.equals(normalizeCell(source), normalizeCell(target))) {
                changed.put(canonicalKey(sourceRow, name), source);
            }
        }
        return changed;
    }

    private static List<Map<String, Object>> normalizeRows(List<Map<String, Object>> rows, List<ColumnDefinitionDto> targetColumns) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        Map<String, String> targetNames = new LinkedHashMap<>();
        for (ColumnDefinitionDto column : targetColumns) {
            targetNames.put(column.name().toLowerCase(Locale.ROOT), column.name());
        }
        List<Map<String, Object>> normalized = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> next = new LinkedHashMap<>();
            row.forEach((key, value) -> next.put(targetNames.getOrDefault(key.toLowerCase(Locale.ROOT), key), value));
            normalized.add(next);
        }
        return normalized;
    }

    private static List<Map<String, Object>> normalizeAndFilterRows(List<Map<String, Object>> rows, List<ColumnDefinitionDto> targetColumns) {
        return normalizeRows(rows, targetColumns).stream()
                .map(row -> filterRowToTargetColumns(row, targetColumns))
                .filter(row -> !row.isEmpty())
                .toList();
    }

    private static List<ColumnDefinitionDto> comparableTargetColumns(List<ColumnDefinitionDto> targetColumns, List<String> sourceColumns, String pkColumn, I18nMessages messages) {
        Set<String> sourceColumnNames = sourceColumns == null
                ? Set.of()
                : sourceColumns.stream()
                .map(DataSyncCompatibilityService::text)
                .filter(text -> !text.isBlank())
                .map(text -> text.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
        if (sourceColumnNames.isEmpty()) {
            return targetColumns;
        }
        List<ColumnDefinitionDto> comparable = targetColumns.stream()
                .filter(column -> column.name().equalsIgnoreCase(pkColumn) || sourceColumnNames.contains(column.name().toLowerCase(Locale.ROOT)))
                .toList();
        if (comparable.stream().noneMatch(column -> column.name().equalsIgnoreCase(pkColumn))) {
            throw new IllegalArgumentException(messages.message("sync.pkColumnMissing", "column", pkColumn));
        }
        return comparable;
    }

    private static Map<String, Object> filterRowToTargetColumns(Map<String, Object> row, List<ColumnDefinitionDto> targetColumns) {
        Map<String, Object> filtered = new LinkedHashMap<>();
        for (ColumnDefinitionDto column : targetColumns) {
            Object value = cellValue(row, column.name());
            if (value != null || containsKeyIgnoreCase(row, column.name())) {
                filtered.put(column.name(), value);
            }
        }
        return filtered;
    }

    private static List<Map<String, Object>> filteredSourceRows(SourceQueryContext context) {
        return context.sourceRows().stream()
                .map(row -> filterRowToTargetColumns(row, context.targetColumns()))
                .filter(row -> !row.isEmpty())
                .toList();
    }

    private static UpdateRowDto filterUpdateToTargetColumns(UpdateRowDto update, List<ColumnDefinitionDto> targetColumns) {
        Map<String, Object> values = filterRowToTargetColumns(update.values(), targetColumns);
        return new UpdateRowDto(update.keys(), values);
    }

    private static Map<String, String> columnTypes(List<ColumnDefinitionDto> targetColumns) {
        Map<String, String> types = new LinkedHashMap<>();
        for (ColumnDefinitionDto column : targetColumns) {
            types.put(column.name().toLowerCase(Locale.ROOT), column.type());
        }
        return types;
    }

    private static String resolveSinglePrimaryKey(List<ColumnDefinitionDto> columns, I18nMessages messages) {
        Map<String, String> primaryKeysByLowerName = new LinkedHashMap<>();
        columns.stream()
                .filter(column -> Set.of("PRI", "PK").contains(text(column.key()).toUpperCase(Locale.ROOT)))
                .map(ColumnDefinitionDto::name)
                .forEach(name -> primaryKeysByLowerName.putIfAbsent(text(name).toLowerCase(Locale.ROOT), name));
        List<String> primaryKeys = new ArrayList<>(primaryKeysByLowerName.values());
        if (primaryKeys.isEmpty()) {
            throw new IllegalArgumentException(messages.message("sync.sqlTargetNoPk"));
        }
        if (primaryKeys.size() > 1) {
            throw new IllegalArgumentException(messages.message("sync.sqlTargetCompositePk", "columns", String.join(",", primaryKeys)));
        }
        return primaryKeys.get(0);
    }

    private static Object cellValue(Map<String, Object> row, String column) {
        if (row.containsKey(column)) {
            return row.get(column);
        }
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(column)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static String canonicalKey(Map<String, Object> row, String column) {
        if (row.containsKey(column)) {
            return column;
        }
        for (String key : row.keySet()) {
            if (key.equalsIgnoreCase(column)) {
                return key;
            }
        }
        return column;
    }

    private static boolean containsKeyIgnoreCase(Map<String, Object> row, String column) {
        if (row.containsKey(column)) {
            return true;
        }
        return row.keySet().stream().anyMatch(key -> key.equalsIgnoreCase(column));
    }

    private static String tableSqlName(ConnectionConfigDto config, String tableName) {
        String driver = normalizeDriverType(config == null ? null : config.driverType());
        String text = text(tableName);
        int separator = text.lastIndexOf('.');
        if (separator > 0 && separator < text.length() - 1) {
            return quoteIdentifier(driver, unquoteIdentifier(text.substring(0, separator))) + "." + quoteIdentifier(driver, unquoteIdentifier(text.substring(separator + 1)));
        }
        String defaultSchema = "postgresql".equals(driver) ? "" : text(config == null ? null : config.database());
        if (!defaultSchema.isBlank()) {
            return quoteIdentifier(driver, unquoteIdentifier(defaultSchema)) + "." + quoteIdentifier(driver, unquoteIdentifier(tableName));
        }
        return quoteIdentifier(driver, unquoteIdentifier(tableName));
    }

    private static String jdbcScopeName(ConnectionConfigDto config) {
        if ("postgresql".equals(normalizeDriverType(config == null ? null : config.driverType()))) {
            return "";
        }
        return text(config == null ? null : config.database());
    }

    private static String quoteIdentifier(String driver, String value) {
        String text = text(value);
        if ("mysql".equals(driver)) {
            return "`" + text.replace("`", "``") + "`";
        }
        return "\"" + text.replace("\"", "\"\"") + "\"";
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

    private static String normalizeDriverType(String driverType) {
        String driver = text(driverType).toLowerCase(Locale.ROOT);
        return switch (driver) {
            case "postgres", "postgresql", "pg" -> "postgresql";
            case "mysql", "mariadb" -> "mysql";
            case "h2", "demo" -> "demo";
            default -> driver;
        };
    }

    private static ConnectionConfigDto connectionConfig(Object raw, String label) {
        if (!(raw instanceof Map<?, ?> map)) {
            return new ConnectionConfigDto(label + "-demo-h2", label + " Demo", "h2", null, null, "", null, null, Map.of(), null);
        }
        Map<String, String> options = Map.of();
        Object rawOptions = map.get("options");
        if (rawOptions instanceof Map<?, ?> optionMap) {
            Map<String, String> parsed = new LinkedHashMap<>();
            optionMap.forEach((key, value) -> {
                String optionKey = text(key);
                String optionValue = text(value);
                if (!optionKey.isBlank()) {
                    parsed.put(optionKey, optionValue);
                }
            });
            options = parsed;
        }
        return new ConnectionConfigDto(
                firstText(text(map.get("id")), label + "-connection"),
                firstText(text(map.get("name")), label + " connection"),
                firstText(text(map.get("driverType")), text(map.get("type")), text(map.get("driver")), "h2"),
                text(map.get("host")),
                nullableInt(map.get("port")),
                text(map.get("database")),
                firstText(text(map.get("username")), text(map.get("user"))),
                text(map.get("password")),
                options,
                nullableInt(map.get("timeout"))
        );
    }

    private static Integer nullableInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        String text = text(value);
        if (text.isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private record SyncRequest(Map<String, Object> input, String jobId, String content, String mode, List<String> tables, boolean fixtureEligible, String sourceQuery) {
        static SyncRequest from(Map<String, Object> input) {
            String jobId = text(input == null ? null : input.get("jobId"));
            if (jobId.isBlank()) {
                jobId = "sync-" + Instant.now().toEpochMilli();
            }
            String content = text(input == null ? null : input.get("content")).toLowerCase(Locale.ROOT);
            if (content.isBlank()) {
                content = "data";
            }
            String mode = text(input == null ? null : input.get("mode")).toLowerCase(Locale.ROOT);
            if (!Set.of("insert_update", "insert_only", "full_overwrite").contains(mode)) {
                mode = "insert_update";
            }
            Map<String, Object> normalizedInput = input == null ? Map.of() : input;
            String sourceQuery = text(input == null ? null : input.get("sourceQuery"));
            List<String> tables = tableNames(input);
            if (!sourceQuery.isBlank() && !(input != null && input.get("tables") instanceof List<?> rawTables && !rawTables.isEmpty())) {
                tables = List.of();
            }
            return new SyncRequest(normalizedInput, jobId, content, mode, tables, DataSyncCompatibilityService.fixtureEligible(normalizedInput), sourceQuery);
        }

        boolean hasSourceQuery() {
            return !sourceQuery.isBlank();
        }

        boolean hasJdbcTableSync() {
            return !hasExplicitFixtures()
                    && input.get("sourceConfig") instanceof Map<?, ?>
                    && input.get("targetConfig") instanceof Map<?, ?>
                    && !tables.isEmpty();
        }

        private boolean hasExplicitFixtures() {
            return input.get("fixtures") instanceof Map<?, ?> fixtures && !fixtures.isEmpty();
        }

        SyncRequest withSingleTable(String table) {
            return new SyncRequest(input, jobId, content, mode, List.of(table), fixtureEligible, sourceQuery);
        }

        String requireSingleSourceQueryTargetTable() {
            if (!"data".equals(content)) {
                throw new IllegalArgumentException(new I18nMessages().message("sync.sqlDataOnly"));
            }
            if (tables.size() != 1 || text(tables.get(0)).isBlank()) {
                throw new IllegalArgumentException(new I18nMessages().message("sync.sqlSingleTargetRequired"));
            }
            return tables.get(0);
        }

        ConnectionConfigDto connectionConfig(String key) {
            return DataSyncCompatibilityService.connectionConfig(input.get(key), key);
        }

        boolean syncSchema() {
            return "schema".equals(content) || "both".equals(content);
        }

        boolean syncData() {
            return !"schema".equals(content);
        }

        TableFixture fixture(String table) {
            return tableFixture(input, table);
        }

        TableOptions tableOptions(String table) {
            Object rawTableOptions = input.get("tableOptions");
            if (rawTableOptions instanceof Map<?, ?> optionsByTable) {
                Object rawOptions = lookupIgnoreCase(optionsByTable, table);
                if (rawOptions instanceof Map<?, ?> optionsMap) {
                    return TableOptions.from(optionsMap);
                }
            }
            return TableOptions.defaults();
        }
    }

    private record TableOptions(boolean insert, boolean update, boolean delete, Set<String> selectedInsertPks, Set<String> selectedUpdatePks, Set<String> selectedDeletePks) {
        static TableOptions defaults() {
            return new TableOptions(true, true, false, Set.of(), Set.of(), Set.of());
        }

        static TableOptions from(Map<?, ?> raw) {
            return new TableOptions(
                    booleanValue(raw.get("insert"), true),
                    booleanValue(raw.get("update"), true),
                    booleanValue(raw.get("delete"), false),
                    stringSet(raw.get("selectedInsertPks")),
                    stringSet(raw.get("selectedUpdatePks")),
                    stringSet(raw.get("selectedDeletePks"))
            );
        }

        boolean allowsInsert(String pk) {
            return selectedInsertPks.isEmpty() || selectedInsertPks.contains(pk);
        }

        boolean allowsUpdate(String pk) {
            return selectedUpdatePks.isEmpty() || selectedUpdatePks.contains(pk);
        }

        boolean allowsDelete(String pk) {
            return selectedDeletePks.isEmpty() || selectedDeletePks.contains(pk);
        }

        private static boolean booleanValue(Object value, boolean fallback) {
            if (value instanceof Boolean bool) {
                return bool;
            }
            String text = text(value).toLowerCase(Locale.ROOT);
            if (text.isBlank()) {
                return fallback;
            }
            return Set.of("true", "1", "yes", "y").contains(text);
        }

        private static Set<String> stringSet(Object value) {
            if (!(value instanceof List<?> list)) {
                return Set.of();
            }
            return list.stream().map(DataSyncCompatibilityService::text).filter(text -> !text.isBlank()).collect(Collectors.toUnmodifiableSet());
        }
    }

    private record TableFixture(String pkColumn, List<Map<String, Object>> sourceRows, List<Map<String, Object>> targetRows, Map<String, String> columnTypes, List<String> schemaStatements) {
    }

    private record TableDiff(String table, String pkColumn, Map<String, String> columnTypes, List<String> schemaStatements, List<PreviewInsert> inserts, List<PreviewUpdate> updates, List<PreviewDelete> deletes, int same, List<Map<String, Object>> sourceRows, List<Map<String, Object>> targetRows) {
        String summaryMessage() {
            return "Fixture diff: inserts=" + inserts.size() + ", updates=" + updates.size() + ", deletes=" + deletes.size() + ", same=" + same;
        }

        List<Map<String, Object>> copyTargetRows() {
            return targetRows.stream().map(DataSyncCompatibilityService::copyRow).collect(Collectors.toCollection(ArrayList::new));
        }

        List<PreviewInsert> sourceAsInserts() {
            return sourceRows.stream().map(row -> new PreviewInsert(pkValue(row, pkColumn), copyRow(row))).toList();
        }
    }

    private record PreviewInsert(String pk, Map<String, Object> row) {
        Map<String, Object> toMap() {
            return orderedMap("pk", pk, "row", row);
        }
    }

    private record PreviewUpdate(String pk, List<String> changedColumns, Map<String, Object> source, Map<String, Object> target) {
        Map<String, Object> toMap() {
            return orderedMap("pk", pk, "changedColumns", changedColumns, "source", source, "target", target);
        }
    }

    private record PreviewDelete(String pk, Map<String, Object> row) {
        Map<String, Object> toMap() {
            return orderedMap("pk", pk, "row", row);
        }
    }

    private record SourceQueryContext(
            String table,
            String pkColumn,
            ConnectionConfigDto sourceConfig,
            ConnectionConfigDto targetConfig,
            List<ColumnDefinitionDto> targetColumns,
            List<Map<String, Object>> sourceRows,
            List<Map<String, Object>> targetRows,
            Map<String, Map<String, Object>> sourceByPk,
            Map<String, Map<String, Object>> targetByPk
    ) {
    }

    private record SourceQueryDiff(List<Map<String, Object>> inserts, List<UpdateRowDto> updates, List<Map<String, Object>> deletes, int same) {
    }

    private record MutationStats(int inserted, int updated, int deleted) {
    }
}
