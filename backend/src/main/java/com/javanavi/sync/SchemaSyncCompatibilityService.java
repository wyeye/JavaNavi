package com.javanavi.sync;

import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.db.JdbcConnectionFactory;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ColumnDefinitionDto;
import com.javanavi.model.CompatEventDto;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.ForeignKeyDefinitionDto;
import com.javanavi.model.IndexDefinitionDto;
import com.javanavi.model.TableSummaryDto;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class SchemaSyncCompatibilityService {
    private static final Pattern TYPE_WITH_ARGS = Pattern.compile("^([a-zA-Z0-9_ ]+)(\\(.*\\))?$");

    private final DatabaseCompatibilityService databaseCompatibilityService;
    private final CompatEventPublisher eventPublisher;
    private final I18nMessages messages;
    private final JdbcConnectionFactory jdbcConnectionFactory;
    private final Set<String> cancelledJobs = ConcurrentHashMap.newKeySet();

    public SchemaSyncCompatibilityService(
            DatabaseCompatibilityService databaseCompatibilityService,
            CompatEventPublisher eventPublisher,
            I18nMessages messages,
            JdbcConnectionFactory jdbcConnectionFactory
    ) {
        this.databaseCompatibilityService = databaseCompatibilityService;
        this.eventPublisher = eventPublisher;
        this.messages = messages;
        this.jdbcConnectionFactory = jdbcConnectionFactory;
    }

    public Map<String, Object> cancel(String jobId) {
        String normalized = text(jobId);
        if (!normalized.isBlank()) {
            cancelledJobs.add(normalized);
            publishSyncLog(normalized, "warn", "Structure sync cancelled by user.");
        }
        return orderedMap("cancelled", true, "jobId", normalized, "logs", List.of("Structure sync cancelled by user."));
    }

    public Map<String, Object> analyze(Map<String, Object> input) {
        Request request = Request.from(input);
        try {
            String driverError = validateDriverCompatibility(request);
            if (driverError != null) {
                return failureResult(request.jobId(), driverError);
            }
            List<TablePlan> plans = analyzePlans(request);
            return orderedMap(
                    "success", true,
                    "message", "Schema sync analysis completed.",
                    "tables", plans.stream().map(TablePlan::toTableMap).toList(),
                    "tableCount", plans.size(),
                    "dryRun", true,
                    "logs", List.of("Schema sync analysis completed for " + plans.size() + " table(s).")
            );
        } catch (Exception error) {
            return failureResult(request.jobId(), error.getMessage());
        } finally {
            cancelledJobs.remove(request.jobId());
        }
    }

    public Map<String, Object> preview(Map<String, Object> input) {
        Request request = Request.from(input);
        try {
            String driverError = validateDriverCompatibility(request);
            if (driverError != null) {
                return failureResult(request.jobId(), driverError);
            }
            String table = request.previewTable();
            if (table.isBlank()) {
                table = request.tables().isEmpty() ? "" : request.tables().get(0);
            }
            TablePlan plan = analyzeSingleTable(request, table);
            List<String> selected = request.selectedItemIds().isEmpty()
                    ? plan.defaultSelectedIds()
                    : plan.selectedStatements(request.selectedItemIds());
            return orderedMap(
                    "success", true,
                    "message", "Schema sync preview loaded.",
                    "table", plan.tableName(),
                    "schemaSummary", "Schema diff preview",
                    "schemaStatements", plan.selectedStatements(selected),
                    "items", plan.items().stream().map(DiffItem::toMap).toList(),
                    "selectedItemIds", selected,
                    "deleteItemIds", plan.deleteItemIds(),
                    "warnings", plan.collectWarnings(),
                    "hasMore", false
            );
        } catch (Exception error) {
            return failureResult(request.jobId(), error.getMessage());
        } finally {
            cancelledJobs.remove(request.jobId());
        }
    }

    public Map<String, Object> run(Map<String, Object> input) {
        Request request = Request.from(input);
        try {
            String driverError = validateDriverCompatibility(request);
            if (driverError != null) {
                return failureResult(request.jobId(), driverError);
            }
            List<TablePlan> plans = analyzePlans(request);
            Map<String, DiffItem> allItems = plans.stream()
                    .flatMap(plan -> plan.items().stream())
                    .collect(Collectors.toMap(DiffItem::id, item -> item, (left, right) -> left, LinkedHashMap::new));
            List<String> selectedIds = request.selectedItemIds().isEmpty()
                    ? plans.stream().flatMap(plan -> plan.defaultSelectedIds().stream()).toList()
                    : request.selectedItemIds();
            List<String> selectedDeletes = selectedIds.stream()
                    .filter(id -> {
                        DiffItem item = allItems.get(id);
                        return item != null && item.requiresDeleteConfirm();
                    })
                    .toList();
            if (!request.confirmedDeleteItemIds().containsAll(selectedDeletes)) {
                return orderedMap(
                        "success", false,
                        "message", "Delete confirmation is required before executing structure sync.",
                        "missingDeleteConfirmItemIds", selectedDeletes.stream()
                                .filter(id -> !request.confirmedDeleteItemIds().contains(id))
                                .toList()
                );
            }

            int totalTables = Math.max(plans.size(), 1);
            int current = 0;
            int executed = 0;
            int skipped = 0;
            List<String> logs = new ArrayList<>();
            publishSyncLog(request.jobId(), "info", "Structure sync started.");
            for (TablePlan plan : plans) {
                throwIfCancelled(request.jobId());
                current++;
                publishSyncProgress(request.jobId(), current - 1, totalTables, plan.tableName(), messages.message("events.readSource"));
                List<DiffItem> tableItems = plan.items().stream()
                        .filter(item -> selectedIds.contains(item.id()))
                        .toList();
                List<String> statements = orderForExecution(tableItems).stream()
                        .flatMap(item -> item.sqlStatements().stream())
                        .filter(sql -> !sql.isBlank())
                        .toList();
                if (statements.isEmpty()) {
                    skipped += tableItems.size();
                    logs.add("Table " + plan.tableName() + ": no executable statements selected.");
                    publishSyncProgress(request.jobId(), current, totalTables, plan.tableName(), messages.message("events.writeTarget"));
                    continue;
                }
                databaseCompatibilityService.executeDdlStatements(request.targetConfig(), request.targetDatabase(), statements);
                executed += tableItems.size();
                logs.add("Table " + plan.tableName() + ": executed " + statements.size() + " statement(s).");
                publishSyncProgress(request.jobId(), current, totalTables, plan.tableName(), messages.message("events.writeTarget"));
            }
            publishSyncLog(request.jobId(), "info", "Structure sync completed.");
            publishSyncProgress(request.jobId(), totalTables, totalTables, plans.isEmpty() ? "" : plans.get(plans.size() - 1).tableName(), messages.message("events.complete"));
            return orderedMap(
                    "success", true,
                    "message", "Structure sync completed.",
                    "tablesSynced", plans.size(),
                    "itemsExecuted", executed,
                    "itemsSkipped", skipped,
                    "logs", logs,
                    "warnings", plans.stream().flatMap(plan -> plan.collectWarnings().stream()).distinct().toList(),
                    "jobId", request.jobId()
            );
        } catch (Exception error) {
            return failureResult(request.jobId(), error.getMessage());
        } finally {
            cancelledJobs.remove(request.jobId());
        }
    }

    private List<TablePlan> analyzePlans(Request request) {
        List<TablePlan> plans = new ArrayList<>();
        int total = Math.max(request.tables().size(), 1);
        for (int index = 0; index < request.tables().size(); index++) {
            String table = request.tables().get(index);
            throwIfCancelled(request.jobId());
            plans.add(analyzeSingleTable(request, table));
            publishSyncProgress(request.jobId(), index + 1, total, table, messages.message("events.readSource"));
        }
        return plans;
    }

    private TablePlan analyzeSingleTable(Request request, String table) {
        List<TableSummaryDto> sourceTables = databaseCompatibilityService.listTables(request.sourceConfig(), request.sourceDatabase());
        List<TableSummaryDto> targetTables = databaseCompatibilityService.listTables(request.targetConfig(), request.targetDatabase());
        TableSummaryDto sourceTable = matchTable(sourceTables, table);
        TableSummaryDto targetTable = matchTable(targetTables, table);
        boolean targetExists = targetTable != null;
        boolean sourceExists = sourceTable != null;
        List<DiffItem> items = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        if (!sourceExists) {
            warnings.add("Source table not found: " + table);
            return new TablePlan(table, false, targetExists, items, warnings);
        }
        if (!targetExists) {
            String createSql = databaseCompatibilityService.showCreateTable(request.sourceConfig(), request.sourceDatabase(), table);
            items.add(new DiffItem(
                    itemId(table, "TABLE", table, "ADD"),
                    table,
                    "TABLE",
                    table,
                    "ADD",
                    "Create missing target table",
                    true,
                    null,
                    false,
                    listOf(createSql),
                    List.of()
            ));
            return new TablePlan(table, true, false, items, warnings);
        }

        String sourceDriver = jdbcConnectionFactory.normalizeDriver(request.sourceConfig());
        List<ColumnDefinitionDto> sourceColumns = databaseCompatibilityService.listColumns(request.sourceConfig(), request.sourceDatabase(), table);
        List<ColumnDefinitionDto> targetColumns = databaseCompatibilityService.listColumns(request.targetConfig(), request.targetDatabase(), table);
        Map<String, ColumnDefinitionDto> sourceColumnsByName = byLowerName(sourceColumns, ColumnDefinitionDto::name);
        Map<String, ColumnDefinitionDto> targetColumnsByName = byLowerName(targetColumns, ColumnDefinitionDto::name);
        for (ColumnDefinitionDto sourceColumn : sourceColumns) {
            ColumnDefinitionDto targetColumn = targetColumnsByName.get(normalizeName(sourceColumn.name()));
            if (targetColumn == null) {
                items.add(buildAddColumnItem(sourceDriver, table, sourceColumn));
                continue;
            }
            if (!sameColumn(sourceColumn, targetColumn)) {
                items.add(buildAlterColumnItem(sourceDriver, table, sourceColumn, targetColumn));
            }
        }
        for (ColumnDefinitionDto targetColumn : targetColumns) {
            if (!sourceColumnsByName.containsKey(normalizeName(targetColumn.name()))) {
                items.add(buildDropColumnItem(sourceDriver, table, targetColumn));
            }
        }

        List<IndexDefinitionDto> sourceIndexes = databaseCompatibilityService.listIndexes(request.sourceConfig(), request.sourceDatabase(), table);
        List<IndexDefinitionDto> targetIndexes = databaseCompatibilityService.listIndexes(request.targetConfig(), request.targetDatabase(), table);
        Map<String, List<IndexDefinitionDto>> sourceIndexGroups = groupIndexes(sourceIndexes);
        Map<String, List<IndexDefinitionDto>> targetIndexGroups = groupIndexes(targetIndexes);
        LinkedHashSet<String> indexNames = new LinkedHashSet<>();
        indexNames.addAll(sourceIndexGroups.keySet());
        indexNames.addAll(targetIndexGroups.keySet());
        for (String indexName : indexNames) {
            List<IndexDefinitionDto> sourceGroup = sourceIndexGroups.getOrDefault(indexName, List.of());
            List<IndexDefinitionDto> targetGroup = targetIndexGroups.getOrDefault(indexName, List.of());
            if (sourceGroup.isEmpty()) {
                items.add(buildDropIndexItem(sourceDriver, table, targetGroup));
                continue;
            }
            if (targetGroup.isEmpty()) {
                items.add(buildCreateIndexItem(sourceDriver, table, sourceGroup));
                continue;
            }
            if (!sameIndex(sourceGroup, targetGroup)) {
                items.add(buildReplaceIndexItem(sourceDriver, table, sourceGroup, targetGroup));
            }
        }

        List<ForeignKeyDefinitionDto> sourceFks = databaseCompatibilityService.listForeignKeys(request.sourceConfig(), request.sourceDatabase(), table);
        List<ForeignKeyDefinitionDto> targetFks = databaseCompatibilityService.listForeignKeys(request.targetConfig(), request.targetDatabase(), table);
        Map<String, List<ForeignKeyDefinitionDto>> sourceFkGroups = groupForeignKeys(sourceFks);
        Map<String, List<ForeignKeyDefinitionDto>> targetFkGroups = groupForeignKeys(targetFks);
        LinkedHashSet<String> fkNames = new LinkedHashSet<>();
        fkNames.addAll(sourceFkGroups.keySet());
        fkNames.addAll(targetFkGroups.keySet());
        Set<String> selectedTableNames = request.tables().stream().map(SchemaSyncCompatibilityService::normalizeTableName).collect(Collectors.toSet());
        for (String fkName : fkNames) {
            List<ForeignKeyDefinitionDto> sourceGroup = sourceFkGroups.getOrDefault(fkName, List.of());
            List<ForeignKeyDefinitionDto> targetGroup = targetFkGroups.getOrDefault(fkName, List.of());
            if (sourceGroup.isEmpty()) {
                items.add(buildDropForeignKeyItem(sourceDriver, table, targetGroup));
                continue;
            }
            if (targetGroup.isEmpty()) {
                items.add(buildCreateForeignKeyItem(sourceDriver, table, sourceGroup, selectedTableNames));
                continue;
            }
            if (!sameForeignKey(sourceGroup, targetGroup)) {
                items.add(buildReplaceForeignKeyItem(sourceDriver, table, sourceGroup, targetGroup, selectedTableNames));
            }
        }

        return new TablePlan(table, true, true, items, warnings);
    }

    private DiffItem buildAddColumnItem(String driver, String table, ColumnDefinitionDto column) {
        return new DiffItem(
                itemId(table, "COLUMN", column.name(), "ADD"),
                table,
                "COLUMN",
                column.name(),
                "ADD",
                "Add column " + column.name(),
                true,
                null,
                false,
                List.of("ALTER TABLE " + tableSqlName(driver, table) + " ADD COLUMN " + columnDefinition(driver, column) + ";"),
                List.of()
        );
    }

    private DiffItem buildAlterColumnItem(String driver, String table, ColumnDefinitionDto sourceColumn, ColumnDefinitionDto targetColumn) {
        return new DiffItem(
                itemId(table, "COLUMN", sourceColumn.name(), "ALTER"),
                table,
                "COLUMN",
                sourceColumn.name(),
                "ALTER",
                "Alter column " + sourceColumn.name(),
                true,
                null,
                false,
                alterColumnStatements(driver, table, sourceColumn, targetColumn),
                List.of()
        );
    }

    private DiffItem buildDropColumnItem(String driver, String table, ColumnDefinitionDto column) {
        return new DiffItem(
                itemId(table, "COLUMN", column.name(), "DROP"),
                table,
                "COLUMN",
                column.name(),
                "DROP",
                "Drop target-only column " + column.name(),
                true,
                null,
                true,
                List.of("ALTER TABLE " + tableSqlName(driver, table) + " DROP COLUMN " + quoteIdentifier(driver, column.name()) + ";"),
                List.of()
        );
    }

    private DiffItem buildCreateIndexItem(String driver, String table, List<IndexDefinitionDto> indexes) {
        String indexName = indexes.get(0).name();
        return new DiffItem(
                itemId(table, "INDEX", indexName, "ADD"),
                table,
                "INDEX",
                indexName,
                "ADD",
                "Create index " + indexName,
                true,
                null,
                false,
                List.of(createIndexSql(driver, table, indexes) + ";"),
                List.of()
        );
    }

    private DiffItem buildDropIndexItem(String driver, String table, List<IndexDefinitionDto> indexes) {
        String indexName = indexes.get(0).name();
        return new DiffItem(
                itemId(table, "INDEX", indexName, "DROP"),
                table,
                "INDEX",
                indexName,
                "DROP",
                "Drop target-only index " + indexName,
                true,
                null,
                true,
                List.of(dropIndexSql(driver, table, indexName) + ";"),
                List.of()
        );
    }

    private DiffItem buildReplaceIndexItem(String driver, String table, List<IndexDefinitionDto> sourceGroup, List<IndexDefinitionDto> targetGroup) {
        String indexName = sourceGroup.get(0).name();
        return new DiffItem(
                itemId(table, "INDEX", indexName, "ALTER"),
                table,
                "INDEX",
                indexName,
                "ALTER",
                "Rebuild index " + indexName,
                true,
                null,
                false,
                List.of(
                        dropIndexSql(driver, table, targetGroup.get(0).name()) + ";",
                        createIndexSql(driver, table, sourceGroup) + ";"
                ),
                List.of()
        );
    }

    private DiffItem buildCreateForeignKeyItem(String driver, String table, List<ForeignKeyDefinitionDto> fks, Set<String> selectedTableNames) {
        ForeignKeyDefinitionDto fk = fks.get(0);
        String referenced = normalizeTableName(fk.refTableName());
        boolean supported = selectedTableNames.contains(referenced) || referenced.equals(normalizeTableName(table));
        return new DiffItem(
                itemId(table, "FOREIGN_KEY", fk.constraintName(), "ADD"),
                table,
                "FOREIGN_KEY",
                fk.constraintName(),
                "ADD",
                "Create foreign key " + fk.constraintName(),
                supported,
                supported ? null : "Referenced table is outside the selected structure-sync scope.",
                false,
                supported ? List.of(createForeignKeySql(driver, table, fks) + ";") : List.of(),
                supported ? List.of() : List.of("Referenced table is outside the selected structure-sync scope.")
        );
    }

    private DiffItem buildDropForeignKeyItem(String driver, String table, List<ForeignKeyDefinitionDto> fks) {
        ForeignKeyDefinitionDto fk = fks.get(0);
        return new DiffItem(
                itemId(table, "FOREIGN_KEY", fk.constraintName(), "DROP"),
                table,
                "FOREIGN_KEY",
                fk.constraintName(),
                "DROP",
                "Drop target-only foreign key " + fk.constraintName(),
                true,
                null,
                true,
                List.of(dropForeignKeySql(driver, table, fk.constraintName()) + ";"),
                List.of()
        );
    }

    private DiffItem buildReplaceForeignKeyItem(String driver, String table, List<ForeignKeyDefinitionDto> sourceGroup, List<ForeignKeyDefinitionDto> targetGroup, Set<String> selectedTableNames) {
        ForeignKeyDefinitionDto sourceFk = sourceGroup.get(0);
        String referenced = normalizeTableName(sourceFk.refTableName());
        boolean supported = selectedTableNames.contains(referenced) || referenced.equals(normalizeTableName(table));
        return new DiffItem(
                itemId(table, "FOREIGN_KEY", sourceFk.constraintName(), "ALTER"),
                table,
                "FOREIGN_KEY",
                sourceFk.constraintName(),
                "ALTER",
                "Rebuild foreign key " + sourceFk.constraintName(),
                supported,
                supported ? null : "Referenced table is outside the selected structure-sync scope.",
                false,
                supported ? List.of(
                        dropForeignKeySql(driver, table, targetGroup.get(0).constraintName()) + ";",
                        createForeignKeySql(driver, table, sourceGroup) + ";"
                ) : List.of(),
                supported ? List.of() : List.of("Referenced table is outside the selected structure-sync scope.")
        );
    }

    private List<String> alterColumnStatements(String driver, String table, ColumnDefinitionDto sourceColumn, ColumnDefinitionDto targetColumn) {
        List<String> statements = new ArrayList<>();
        if ("mysql".equals(driver)) {
            statements.add("ALTER TABLE " + tableSqlName(driver, table) + " MODIFY COLUMN " + columnDefinition(driver, sourceColumn) + ";");
            return statements;
        }
        String tableName = tableSqlName(driver, table);
        if (!sameType(sourceColumn.type(), targetColumn.type())) {
            statements.add("ALTER TABLE " + tableName + " ALTER COLUMN " + quoteIdentifier(driver, sourceColumn.name()) + " TYPE " + sourceColumn.type().trim() + ";");
        }
        if (!Objects.equals(normalizeNullable(sourceColumn.nullable()), normalizeNullable(targetColumn.nullable()))) {
            if (isNullable(sourceColumn.nullable())) {
                statements.add("ALTER TABLE " + tableName + " ALTER COLUMN " + quoteIdentifier(driver, sourceColumn.name()) + " DROP NOT NULL;");
            } else {
                statements.add("ALTER TABLE " + tableName + " ALTER COLUMN " + quoteIdentifier(driver, sourceColumn.name()) + " SET NOT NULL;");
            }
        }
        if (!sameDefault(sourceColumn.defaultValue(), targetColumn.defaultValue())) {
            if (text(sourceColumn.defaultValue()).isBlank()) {
                statements.add("ALTER TABLE " + tableName + " ALTER COLUMN " + quoteIdentifier(driver, sourceColumn.name()) + " DROP DEFAULT;");
            } else {
                statements.add("ALTER TABLE " + tableName + " ALTER COLUMN " + quoteIdentifier(driver, sourceColumn.name()) + " SET DEFAULT " + defaultLiteral(sourceColumn.defaultValue()) + ";");
            }
        }
        return statements;
    }

    private String columnDefinition(String driver, ColumnDefinitionDto column) {
        List<String> parts = new ArrayList<>();
        parts.add(quoteIdentifier(driver, column.name()));
        parts.add(text(column.type()).trim());
        if (!text(column.defaultValue()).isBlank()) {
            parts.add("DEFAULT " + defaultLiteral(column.defaultValue()));
        }
        parts.add(isNullable(column.nullable()) ? "NULL" : "NOT NULL");
        if ("mysql".equals(driver) && "auto_increment".equalsIgnoreCase(text(column.extra()).trim())) {
            parts.add("AUTO_INCREMENT");
        }
        return String.join(" ", parts);
    }

    private String createIndexSql(String driver, String table, List<IndexDefinitionDto> indexes) {
        List<IndexDefinitionDto> sorted = indexes.stream().sorted(Comparator.comparingInt(IndexDefinitionDto::seqInIndex)).toList();
        String columns = sorted.stream().map(IndexDefinitionDto::columnName).map(name -> quoteIdentifier(driver, name)).collect(Collectors.joining(", "));
        boolean unique = sorted.get(0).nonUnique() == 0;
        return (unique ? "CREATE UNIQUE INDEX " : "CREATE INDEX ")
                + quoteIdentifier(driver, sorted.get(0).name())
                + " ON "
                + tableSqlName(driver, table)
                + " ("
                + columns
                + ")";
    }

    private String dropIndexSql(String driver, String table, String indexName) {
        if ("mysql".equals(driver)) {
            return "DROP INDEX " + quoteIdentifier(driver, indexName) + " ON " + tableSqlName(driver, table);
        }
        return "DROP INDEX " + quoteIdentifier(driver, indexName);
    }

    private String createForeignKeySql(String driver, String table, List<ForeignKeyDefinitionDto> fks) {
        List<ForeignKeyDefinitionDto> ordered = fks.stream().sorted(Comparator.comparing(ForeignKeyDefinitionDto::columnName, String.CASE_INSENSITIVE_ORDER)).toList();
        String localColumns = ordered.stream().map(ForeignKeyDefinitionDto::columnName).map(name -> quoteIdentifier(driver, name)).collect(Collectors.joining(", "));
        String refColumns = ordered.stream().map(ForeignKeyDefinitionDto::refColumnName).map(name -> quoteIdentifier(driver, name)).collect(Collectors.joining(", "));
        String refTable = tableSqlName(driver, ordered.get(0).refTableName());
        return "ALTER TABLE " + tableSqlName(driver, table)
                + " ADD CONSTRAINT " + quoteIdentifier(driver, ordered.get(0).constraintName())
                + " FOREIGN KEY (" + localColumns + ") REFERENCES " + refTable + " (" + refColumns + ")";
    }

    private String dropForeignKeySql(String driver, String table, String constraintName) {
        if ("mysql".equals(driver)) {
            return "ALTER TABLE " + tableSqlName(driver, table) + " DROP FOREIGN KEY " + quoteIdentifier(driver, constraintName);
        }
        return "ALTER TABLE " + tableSqlName(driver, table) + " DROP CONSTRAINT " + quoteIdentifier(driver, constraintName);
    }

    private List<DiffItem> orderForExecution(List<DiffItem> items) {
        return items.stream()
                .sorted(Comparator.comparingInt(item -> executionPriority(item.objectType(), item.changeType())))
                .toList();
    }

    private int executionPriority(String objectType, String changeType) {
        if ("FOREIGN_KEY".equals(objectType) && "DROP".equals(changeType)) return 0;
        if ("INDEX".equals(objectType) && "DROP".equals(changeType)) return 1;
        if ("COLUMN".equals(objectType) && "DROP".equals(changeType)) return 2;
        if ("TABLE".equals(objectType) && "ADD".equals(changeType)) return 3;
        if ("COLUMN".equals(objectType) && "ADD".equals(changeType)) return 4;
        if ("COLUMN".equals(objectType) && "ALTER".equals(changeType)) return 5;
        if ("INDEX".equals(objectType) && ("ADD".equals(changeType) || "ALTER".equals(changeType))) return 6;
        if ("FOREIGN_KEY".equals(objectType) && ("ADD".equals(changeType) || "ALTER".equals(changeType))) return 7;
        return 8;
    }

    private String validateDriverCompatibility(Request request) {
        String sourceDriver = jdbcConnectionFactory.normalizeDriver(request.sourceConfig());
        String targetDriver = jdbcConnectionFactory.normalizeDriver(request.targetConfig());
        if (sourceDriver.isBlank() || targetDriver.isBlank()) {
            return "Source and target drivers are required.";
        }
        if (!Objects.equals(sourceDriver, targetDriver)) {
            return "Structure sync currently supports same-type databases only.";
        }
        return null;
    }

    private void throwIfCancelled(String jobId) {
        if (!text(jobId).isBlank() && cancelledJobs.contains(text(jobId))) {
            throw new DataSyncCancelledException("Structure sync cancelled");
        }
    }

    private void publishSyncLog(String jobId, String level, String message) {
        if (text(jobId).isBlank()) {
            return;
        }
        eventPublisher.publish(new CompatEventDto(
                UUID.randomUUID().toString(),
                "sync:log",
                "sync",
                "javanavi-backend",
                jobId,
                level,
                message,
                Instant.now(),
                orderedMap("jobId", jobId, "level", level, "message", message)
        ));
    }

    private void publishSyncProgress(String jobId, int current, int total, String table, String stage) {
        if (text(jobId).isBlank()) {
            return;
        }
        int safeTotal = Math.max(total, 0);
        int safeCurrent = Math.max(0, Math.min(current, safeTotal == 0 ? current : safeTotal));
        int percent = safeTotal <= 0 ? 0 : Math.min(100, Math.max(0, (int) Math.round((safeCurrent * 100.0) / safeTotal)));
        eventPublisher.publish(new CompatEventDto(
                UUID.randomUUID().toString(),
                "sync:progress",
                "sync",
                "javanavi-backend",
                jobId,
                "running",
                stage,
                Instant.now(),
                orderedMap("jobId", jobId, "percent", percent, "current", safeCurrent, "total", safeTotal, "table", table, "stage", stage)
        ));
    }

    private static String tableSqlName(String driver, String tableName) {
        String text = text(tableName).trim();
        int separator = text.lastIndexOf('.');
        if (separator > 0 && separator < text.length() - 1) {
            return quoteIdentifier(driver, unquoteIdentifier(text.substring(0, separator))) + "." + quoteIdentifier(driver, unquoteIdentifier(text.substring(separator + 1)));
        }
        return quoteIdentifier(driver, unquoteIdentifier(text));
    }

    private static String quoteIdentifier(String driver, String value) {
        String text = text(value).trim();
        if ("mysql".equals(driver)) {
            return "`" + text.replace("`", "``") + "`";
        }
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }

    private static String unquoteIdentifier(String value) {
        String text = text(value).trim();
        if ((text.startsWith("`") && text.endsWith("`")) || (text.startsWith("\"") && text.endsWith("\""))) {
            return text.substring(1, text.length() - 1);
        }
        return text;
    }

    private static String defaultLiteral(String value) {
        String text = text(value).trim();
        if (text.isBlank()) {
            return "";
        }
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.startsWith("'") || lower.matches("-?\\d+(\\.\\d+)?") || "null".equals(lower) || "current_timestamp".equals(lower)) {
            return text;
        }
        return "'" + text.replace("'", "''") + "'";
    }

    private static boolean sameColumn(ColumnDefinitionDto left, ColumnDefinitionDto right) {
        return sameType(left.type(), right.type())
                && Objects.equals(normalizeNullable(left.nullable()), normalizeNullable(right.nullable()))
                && sameDefault(left.defaultValue(), right.defaultValue())
                && Objects.equals(text(left.extra()).trim().toLowerCase(Locale.ROOT), text(right.extra()).trim().toLowerCase(Locale.ROOT))
                && Objects.equals(text(left.key()).trim().toLowerCase(Locale.ROOT), text(right.key()).trim().toLowerCase(Locale.ROOT));
    }

    private static boolean sameType(String left, String right) {
        return normalizeType(left).equals(normalizeType(right));
    }

    private static boolean sameDefault(String left, String right) {
        return text(left).trim().equalsIgnoreCase(text(right).trim());
    }

    private static String normalizeType(String value) {
        String text = text(value).trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        var matcher = TYPE_WITH_ARGS.matcher(text);
        if (!matcher.matches()) {
            return text;
        }
        return text;
    }

    private static String normalizeNullable(String value) {
        return isNullable(value) ? "YES" : "NO";
    }

    private static boolean isNullable(String value) {
        return !"NO".equalsIgnoreCase(text(value).trim());
    }

    private static boolean sameIndex(List<IndexDefinitionDto> left, List<IndexDefinitionDto> right) {
        if (left.size() != right.size()) {
            return false;
        }
        for (int index = 0; index < left.size(); index++) {
            IndexDefinitionDto leftItem = left.get(index);
            IndexDefinitionDto rightItem = right.get(index);
            if (leftItem.nonUnique() != rightItem.nonUnique()
                    || !Objects.equals(normalizeName(leftItem.columnName()), normalizeName(rightItem.columnName()))
                    || leftItem.seqInIndex() != rightItem.seqInIndex()) {
                return false;
            }
        }
        return true;
    }

    private static boolean sameForeignKey(List<ForeignKeyDefinitionDto> left, List<ForeignKeyDefinitionDto> right) {
        if (left.size() != right.size()) {
            return false;
        }
        for (int index = 0; index < left.size(); index++) {
            ForeignKeyDefinitionDto leftItem = left.get(index);
            ForeignKeyDefinitionDto rightItem = right.get(index);
            if (!Objects.equals(normalizeName(leftItem.columnName()), normalizeName(rightItem.columnName()))
                    || !Objects.equals(normalizeTableName(leftItem.refTableName()), normalizeTableName(rightItem.refTableName()))
                    || !Objects.equals(normalizeName(leftItem.refColumnName()), normalizeName(rightItem.refColumnName()))) {
                return false;
            }
        }
        return true;
    }

    private static Map<String, List<IndexDefinitionDto>> groupIndexes(List<IndexDefinitionDto> indexes) {
        return indexes.stream()
                .collect(Collectors.groupingBy(index -> normalizeName(index.name()), LinkedHashMap::new, Collectors.collectingAndThen(Collectors.toList(),
                        list -> list.stream().sorted(Comparator.comparingInt(IndexDefinitionDto::seqInIndex)).toList())));
    }

    private static Map<String, List<ForeignKeyDefinitionDto>> groupForeignKeys(List<ForeignKeyDefinitionDto> foreignKeys) {
        return foreignKeys.stream()
                .collect(Collectors.groupingBy(fk -> normalizeName(fk.constraintName()), LinkedHashMap::new, Collectors.collectingAndThen(Collectors.toList(),
                        list -> list.stream().sorted(Comparator.comparing(ForeignKeyDefinitionDto::columnName, String.CASE_INSENSITIVE_ORDER)).toList())));
    }

    private static TableSummaryDto matchTable(List<TableSummaryDto> tables, String tableName) {
        String normalized = normalizeTableName(tableName);
        for (TableSummaryDto table : tables) {
            String candidate = normalizeTableName(qualifiedTableName(table));
            if (Objects.equals(candidate, normalized)) {
                return table;
            }
        }
        return null;
    }

    private static String qualifiedTableName(TableSummaryDto table) {
        if (table == null) {
            return "";
        }
        if (text(table.schemaName()).isBlank()) {
            return text(table.tableName());
        }
        return table.schemaName() + "." + table.tableName();
    }

    private static <T> Map<String, T> byLowerName(List<T> items, java.util.function.Function<T, String> extractor) {
        Map<String, T> result = new LinkedHashMap<>();
        for (T item : items) {
            result.put(normalizeName(extractor.apply(item)), item);
        }
        return result;
    }

    private static String normalizeName(String value) {
        return text(value).trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeTableName(String value) {
        return normalizeName(unquoteIdentifier(text(value).replace("\"", "").replace("`", "")));
    }

    private static String itemId(String table, String objectType, String objectName, String changeType) {
        return text(table) + ":" + objectType + ":" + text(objectName) + ":" + changeType;
    }

    private static List<String> listOf(String value) {
        if (text(value).isBlank()) {
            return List.of();
        }
        return List.of(value);
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    private Map<String, Object> failureResult(String jobId, String message) {
        return orderedMap(
                "success", false,
                "jobId", jobId,
                "message", text(message).isBlank() ? "Structure sync failed." : message,
                "logs", List.of()
        );
    }

    private record Request(
            ConnectionConfigDto sourceConfig,
            ConnectionConfigDto targetConfig,
            String sourceDatabase,
            String targetDatabase,
            List<String> tables,
            List<String> selectedItemIds,
            List<String> confirmedDeleteItemIds,
            String jobId,
            String previewTable
    ) {
        static Request from(Map<String, Object> input) {
            Map<String, Object> sourceMap = objectMap(input == null ? null : input.get("sourceConfig"));
            Map<String, Object> targetMap = objectMap(input == null ? null : input.get("targetConfig"));
            return new Request(
                    connectionConfig(sourceMap),
                    connectionConfig(targetMap),
                    text(input == null ? null : input.get("sourceDatabase")),
                    text(input == null ? null : input.get("targetDatabase")),
                    stringList(input == null ? null : input.get("tables")),
                    stringList(input == null ? null : input.get("selectedItemIds")),
                    stringList(input == null ? null : input.get("confirmedDeleteItemIds")),
                    firstText(text(input == null ? null : input.get("jobId")), "schema-sync-" + System.currentTimeMillis()),
                    text(input == null ? null : input.get("table"))
            );
        }

        private static Map<String, Object> objectMap(Object value) {
            if (value instanceof Map<?, ?> map) {
                Map<String, Object> result = new LinkedHashMap<>();
                map.forEach((key, item) -> result.put(String.valueOf(key), item));
                return result;
            }
            return Map.of();
        }

        private static ConnectionConfigDto connectionConfig(Map<String, Object> source) {
            return new ConnectionConfigDto(
                    text(source.get("id")),
                    text(source.get("name")),
                    text(source.get("driverType")),
                    text(source.get("driver")),
                    text(source.get("host")),
                    integer(source.get("port")),
                    text(source.get("database")),
                    firstText(text(source.get("username")), text(source.get("user"))),
                    text(source.get("password")),
                    stringMap(source.get("options")),
                    integer(source.get("timeout")),
                    booleanValue(source.get("useSSL")),
                    text(source.get("sslMode")),
                    text(source.get("uri")),
                    text(source.get("dsn")),
                    stringList(source.get("hosts")),
                    text(source.get("topology")),
                    text(source.get("replicaSet")),
                    text(source.get("authSource")),
                    text(source.get("readPreference")),
                    booleanValue(source.get("mongoSrv")),
                    text(source.get("mongoAuthMechanism")),
                    text(source.get("mongoReplicaUser")),
                    text(source.get("mongoReplicaPassword"))
            );
        }

        private static Map<String, String> stringMap(Object value) {
            if (!(value instanceof Map<?, ?> map)) {
                return Map.of();
            }
            Map<String, String> result = new LinkedHashMap<>();
            map.forEach((key, item) -> result.put(String.valueOf(key), item == null ? "" : String.valueOf(item)));
            return result;
        }

        private static Integer integer(Object value) {
            if (value == null || text(value).isBlank()) {
                return null;
            }
            return Integer.parseInt(text(value).trim());
        }

        private static Boolean booleanValue(Object value) {
            if (value == null || text(value).isBlank()) {
                return null;
            }
            return Boolean.parseBoolean(text(value));
        }

        private static List<String> stringList(Object value) {
            if (!(value instanceof Collection<?> collection)) {
                return List.of();
            }
            return collection.stream().map(SchemaSyncCompatibilityService::text).filter(item -> !item.isBlank()).toList();
        }

        private static String firstText(String first, String fallback) {
            return text(first).isBlank() ? fallback : first;
        }
    }

    private record TablePlan(String tableName, boolean sourceExists, boolean targetExists, List<DiffItem> items, List<String> warnings) {
        Map<String, Object> toTableMap() {
            return orderedMap(
                    "table", tableName,
                    "sourceExists", sourceExists,
                    "targetTableExists", targetExists,
                    "canSync", true,
                    "schemaDiffCount", items.size(),
                    "message", items.isEmpty() ? "No structure changes detected." : "Structure changes detected.",
                    "warnings", collectWarnings(),
                    "items", items.stream().map(DiffItem::toMap).toList(),
                    "selectedItemIds", defaultSelectedIds(),
                    "deleteItemIds", deleteItemIds()
            );
        }

        List<String> collectWarnings() {
            LinkedHashSet<String> all = new LinkedHashSet<>(warnings);
            items.stream().flatMap(item -> item.warnings().stream()).forEach(all::add);
            return new ArrayList<>(all);
        }

        List<String> defaultSelectedIds() {
            return items.stream()
                    .filter(item -> item.supported() && !"DROP".equals(item.changeType()))
                    .map(DiffItem::id)
                    .toList();
        }

        List<String> deleteItemIds() {
            return items.stream().filter(DiffItem::requiresDeleteConfirm).map(DiffItem::id).toList();
        }

        List<String> selectedStatements(List<String> selectedIds) {
            return items.stream()
                    .filter(item -> selectedIds.contains(item.id()))
                    .flatMap(item -> item.sqlStatements().stream())
                    .toList();
        }
    }

    private record DiffItem(
            String id,
            String tableName,
            String objectType,
            String objectName,
            String changeType,
            String summary,
            boolean supported,
            String unsupportedReason,
            boolean requiresDeleteConfirm,
            List<String> sqlStatements,
            List<String> warnings
    ) {
        Map<String, Object> toMap() {
            return orderedMap(
                    "id", id,
                    "tableName", tableName,
                    "objectType", objectType,
                    "objectName", objectName,
                    "changeType", changeType,
                    "summary", summary,
                    "supported", supported,
                    "unsupportedReason", unsupportedReason,
                    "requiresDeleteConfirm", requiresDeleteConfirm,
                    "sql", sqlStatements,
                    "sqlStatements", sqlStatements,
                    "warnings", warnings
            );
        }
    }
}
