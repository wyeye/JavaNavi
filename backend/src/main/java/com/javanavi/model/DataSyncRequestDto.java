package com.javanavi.model;

import jakarta.validation.Valid;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record DataSyncRequestDto(
        @Valid ConnectionConfigDto sourceConfig,
        @Valid ConnectionConfigDto targetConfig,
        List<String> tables,
        String sourceQuery,
        String content,
        String mode,
        String jobId,
        Boolean autoAddColumns,
        String targetTableStrategy,
        Boolean createIndexes,
        String mongoCollectionName,
        Map<String, DataSyncTableOptionsDto> tableOptions,
        Map<String, Object> fixtures,
        String table,
        Integer limit
) {
    public Map<String, Object> toCompatibilityMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        if (sourceConfig != null) {
            map.put("sourceConfig", CompatibilityRequestMaps.connectionConfig(sourceConfig));
        }
        if (targetConfig != null) {
            map.put("targetConfig", CompatibilityRequestMaps.connectionConfig(targetConfig));
        }
        map.put("tables", CompatibilityRequestMaps.stringList(tables));
        CompatibilityRequestMaps.putIfNotNull(map, "sourceQuery", sourceQuery);
        CompatibilityRequestMaps.putIfNotNull(map, "content", content);
        CompatibilityRequestMaps.putIfNotNull(map, "mode", mode);
        CompatibilityRequestMaps.putIfNotNull(map, "jobId", jobId);
        CompatibilityRequestMaps.putIfNotNull(map, "autoAddColumns", autoAddColumns);
        CompatibilityRequestMaps.putIfNotNull(map, "targetTableStrategy", targetTableStrategy);
        CompatibilityRequestMaps.putIfNotNull(map, "createIndexes", createIndexes);
        CompatibilityRequestMaps.putIfNotNull(map, "mongoCollectionName", mongoCollectionName);
        if (tableOptions != null) {
            Map<String, Object> options = new LinkedHashMap<>();
            tableOptions.forEach((table, value) -> options.put(table, value == null ? Map.of() : value.toCompatibilityMap()));
            map.put("tableOptions", options);
        }
        CompatibilityRequestMaps.putIfNotNull(map, "fixtures", fixtures);
        CompatibilityRequestMaps.putIfNotNull(map, "table", table);
        CompatibilityRequestMaps.putIfNotNull(map, "limit", limit);
        return map;
    }

    public record DataSyncCancelDto(boolean cancelled, String jobId) {
        public static DataSyncCancelDto from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new DataSyncCancelDto(booleanValue(source.get("cancelled")), text(source.get("jobId")));
        }
    }

    public record DataSyncTableSummaryDto(
            String table,
            String pkColumn,
            boolean canSync,
            int inserts,
            int updates,
            int deletes,
            int same,
            int schemaDiffCount,
            String message,
            boolean hasSchema,
            boolean targetTableExists,
            String plannedAction,
            List<String> warnings,
            List<String> unsupportedObjects,
            int indexesToCreate,
            int indexesSkipped
    ) {
        public static DataSyncTableSummaryDto from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new DataSyncTableSummaryDto(
                    text(map.get("table")),
                    text(map.get("pkColumn")),
                    booleanValue(map.get("canSync")),
                    intValue(map.get("inserts")),
                    intValue(map.get("updates")),
                    intValue(map.get("deletes")),
                    intValue(map.get("same")),
                    intValue(map.get("schemaDiffCount")),
                    text(map.get("message")),
                    booleanValue(map.get("hasSchema")),
                    booleanValue(map.get("targetTableExists")),
                    text(map.get("plannedAction")),
                    stringList(map.get("warnings")),
                    stringList(map.get("unsupportedObjects")),
                    intValue(map.get("indexesToCreate")),
                    intValue(map.get("indexesSkipped"))
            );
        }
    }

    public record DataSyncResultDto(
            boolean success,
            boolean cancelled,
            String message,
            List<String> logs,
            int tablesSynced,
            int rowsInserted,
            int rowsUpdated,
            int rowsDeleted,
            int totalRows,
            int syncedRows,
            String jobId,
            List<Object> tables,
            boolean dryRun,
            boolean fixtureBacked,
            boolean jdbcBacked,
            boolean sourceQueryBacked,
            boolean tableSyncBacked,
            Map<String, Object> targetSnapshots
    ) {
        public static DataSyncResultDto from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new DataSyncResultDto(
                    booleanValue(source.get("success")),
                    booleanValue(source.get("cancelled")),
                    text(source.get("message")),
                    stringList(source.get("logs")),
                    intValue(source.get("tablesSynced")),
                    intValue(source.get("rowsInserted")),
                    intValue(source.get("rowsUpdated")),
                    intValue(source.get("rowsDeleted")),
                    intValue(source.get("totalRows")),
                    intValue(source.get("syncedRows")),
                    text(source.get("jobId")),
                    objectList(source.get("tables")),
                    booleanValue(source.get("dryRun")),
                    booleanValue(source.get("fixtureBacked")),
                    booleanValue(source.get("jdbcBacked")),
                    booleanValue(source.get("sourceQueryBacked")),
                    booleanValue(source.get("tableSyncBacked")),
                    mapValue(source.get("targetSnapshots"))
            );
        }
    }

    public record DataSyncAnalyzeDto(
            boolean success,
            String message,
            List<String> logs,
            int tablesSynced,
            int rowsInserted,
            int rowsUpdated,
            int rowsDeleted,
            List<DataSyncTableSummaryDto> tables,
            boolean dryRun,
            boolean fixtureBacked,
            boolean jdbcBacked,
            boolean sourceQueryBacked,
            boolean tableSyncBacked
    ) {
        public static DataSyncAnalyzeDto from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new DataSyncAnalyzeDto(
                    booleanValue(source.get("success")),
                    text(source.get("message")),
                    stringList(source.get("logs")),
                    intValue(source.get("tablesSynced")),
                    intValue(source.get("rowsInserted")),
                    intValue(source.get("rowsUpdated")),
                    intValue(source.get("rowsDeleted")),
                    listValue(source.get("tables")).stream().map(DataSyncTableSummaryDto::from).toList(),
                    booleanValue(source.get("dryRun")),
                    booleanValue(source.get("fixtureBacked")),
                    booleanValue(source.get("jdbcBacked")),
                    booleanValue(source.get("sourceQueryBacked")),
                    booleanValue(source.get("tableSyncBacked"))
            );
        }
    }

    public record DataSyncPreviewDto(
            String table,
            String pkColumn,
            Map<String, Object> columnTypes,
            String schemaSummary,
            List<String> schemaWarnings,
            List<String> schemaStatements,
            int totalInserts,
            int totalUpdates,
            int totalDeletes,
            List<Map<String, Object>> inserts,
            List<Map<String, Object>> updates,
            List<Map<String, Object>> deletes,
            List<Map<String, Object>> insertRows,
            List<Map<String, Object>> updateRows,
            List<Map<String, Object>> deleteRows,
            int limit,
            boolean hasMore,
            boolean dryRun,
            boolean fixtureBacked,
            boolean jdbcBacked,
            boolean sourceQueryBacked,
            boolean tableSyncBacked,
            String message
    ) {
        public static DataSyncPreviewDto from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new DataSyncPreviewDto(
                    text(source.get("table")),
                    text(source.get("pkColumn")),
                    mapValue(source.get("columnTypes")),
                    text(source.get("schemaSummary")),
                    stringList(source.get("schemaWarnings")),
                    stringList(source.get("schemaStatements")),
                    intValue(source.get("totalInserts")),
                    intValue(source.get("totalUpdates")),
                    intValue(source.get("totalDeletes")),
                    mapList(source.get("inserts")),
                    mapList(source.get("updates")),
                    mapList(source.get("deletes")),
                    mapList(source.get("insertRows")),
                    mapList(source.get("updateRows")),
                    mapList(source.get("deleteRows")),
                    intValue(source.get("limit")),
                    booleanValue(source.get("hasMore")),
                    booleanValue(source.get("dryRun")),
                    booleanValue(source.get("fixtureBacked")),
                    booleanValue(source.get("jdbcBacked")),
                    booleanValue(source.get("sourceQueryBacked")),
                    booleanValue(source.get("tableSyncBacked")),
                    text(source.get("message"))
            );
        }
    }

    private static Map<String, Object> safeMap(Map<String, Object> map) {
        return map == null ? Map.of() : map;
    }

    private static Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> raw)) {
            return Map.of();
        }
        Map<String, Object> map = new LinkedHashMap<>();
        raw.forEach((key, item) -> map.put(String.valueOf(key), item));
        return map;
    }

    private static List<?> listValue(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private static List<Object> objectList(Object value) {
        return List.copyOf(listValue(value));
    }

    private static List<String> stringList(Object value) {
        return listValue(value).stream()
                .map(DataSyncRequestDto::text)
                .filter(item -> !item.isBlank())
                .toList();
    }

    private static List<Map<String, Object>> mapList(Object value) {
        return listValue(value).stream()
                .filter(Map.class::isInstance)
                .map(DataSyncRequestDto::mapValue)
                .toList();
    }

    private static boolean booleanValue(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        String normalized = text(value).toLowerCase(java.util.Locale.ROOT);
        return "true".equals(normalized) || "1".equals(normalized) || "yes".equals(normalized) || "on".equals(normalized);
    }

    private static int intValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            String text = text(value);
            return text.isBlank() ? 0 : Integer.parseInt(text);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
