package com.javanavi.model;

import jakarta.validation.Valid;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record SchemaSyncRequestDto(
        @Valid ConnectionConfigDto sourceConfig,
        @Valid ConnectionConfigDto targetConfig,
        String sourceDatabase,
        String targetDatabase,
        List<String> tables,
        List<String> selectedItemIds,
        List<String> confirmedDeleteItemIds,
        String jobId,
        String table
) {
    public Map<String, Object> toCompatibilityMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        if (sourceConfig != null) {
            map.put("sourceConfig", CompatibilityRequestMaps.connectionConfig(sourceConfig));
        }
        if (targetConfig != null) {
            map.put("targetConfig", CompatibilityRequestMaps.connectionConfig(targetConfig));
        }
        CompatibilityRequestMaps.putIfNotNull(map, "sourceDatabase", sourceDatabase);
        CompatibilityRequestMaps.putIfNotNull(map, "targetDatabase", targetDatabase);
        map.put("tables", CompatibilityRequestMaps.stringList(tables));
        CompatibilityRequestMaps.putIfNotNull(map, "selectedItemIds", selectedItemIds);
        CompatibilityRequestMaps.putIfNotNull(map, "confirmedDeleteItemIds", confirmedDeleteItemIds);
        CompatibilityRequestMaps.putIfNotNull(map, "jobId", jobId);
        CompatibilityRequestMaps.putIfNotNull(map, "table", table);
        return map;
    }

    public record SchemaSyncCancelDto(boolean cancelled, String jobId, List<String> logs) {
        public static SchemaSyncCancelDto from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new SchemaSyncCancelDto(booleanValue(source.get("cancelled")), text(source.get("jobId")), stringList(source.get("logs")));
        }
    }

    public record SchemaSyncDiffItemDto(
            String id,
            String tableName,
            String objectType,
            String objectName,
            String changeType,
            String summary,
            boolean supported,
            String unsupportedReason,
            boolean requiresDeleteConfirm,
            List<String> sql,
            List<String> sqlStatements,
            List<String> warnings
    ) {
        public static SchemaSyncDiffItemDto from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new SchemaSyncDiffItemDto(
                    text(map.get("id")),
                    text(map.get("tableName")),
                    text(map.get("objectType")),
                    text(map.get("objectName")),
                    text(map.get("changeType")),
                    text(map.get("summary")),
                    booleanValue(map.get("supported")),
                    text(map.get("unsupportedReason")),
                    booleanValue(map.get("requiresDeleteConfirm")),
                    stringList(map.get("sql")),
                    stringList(map.get("sqlStatements")),
                    stringList(map.get("warnings"))
            );
        }
    }

    public record SchemaSyncTableDto(
            String table,
            boolean sourceExists,
            boolean targetTableExists,
            boolean canSync,
            int schemaDiffCount,
            String message,
            List<String> warnings,
            List<SchemaSyncDiffItemDto> items,
            List<String> selectedItemIds,
            List<String> deleteItemIds
    ) {
        public static SchemaSyncTableDto from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new SchemaSyncTableDto(
                    text(map.get("table")),
                    booleanValue(map.get("sourceExists")),
                    booleanValue(map.get("targetTableExists")),
                    booleanValue(map.get("canSync")),
                    intValue(map.get("schemaDiffCount")),
                    text(map.get("message")),
                    stringList(map.get("warnings")),
                    listValue(map.get("items")).stream().map(SchemaSyncDiffItemDto::from).toList(),
                    stringList(map.get("selectedItemIds")),
                    stringList(map.get("deleteItemIds"))
            );
        }
    }

    public record SchemaSyncAnalyzeDto(
            boolean success,
            String message,
            List<SchemaSyncTableDto> tables,
            int tableCount,
            boolean dryRun,
            List<String> logs,
            String jobId
    ) {
        public static SchemaSyncAnalyzeDto from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new SchemaSyncAnalyzeDto(
                    booleanValue(source.get("success")),
                    text(source.get("message")),
                    listValue(source.get("tables")).stream().map(SchemaSyncTableDto::from).toList(),
                    intValue(source.get("tableCount")),
                    booleanValue(source.get("dryRun")),
                    stringList(source.get("logs")),
                    text(source.get("jobId"))
            );
        }
    }

    public record SchemaSyncPreviewDto(
            boolean success,
            String message,
            String table,
            String schemaSummary,
            List<String> schemaStatements,
            List<SchemaSyncDiffItemDto> items,
            List<String> selectedItemIds,
            List<String> deleteItemIds,
            List<String> warnings,
            boolean hasMore,
            String jobId
    ) {
        public static SchemaSyncPreviewDto from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new SchemaSyncPreviewDto(
                    booleanValue(source.get("success")),
                    text(source.get("message")),
                    text(source.get("table")),
                    text(source.get("schemaSummary")),
                    stringList(source.get("schemaStatements")),
                    listValue(source.get("items")).stream().map(SchemaSyncDiffItemDto::from).toList(),
                    stringList(source.get("selectedItemIds")),
                    stringList(source.get("deleteItemIds")),
                    stringList(source.get("warnings")),
                    booleanValue(source.get("hasMore")),
                    text(source.get("jobId"))
            );
        }
    }

    public record SchemaSyncResultDto(
            boolean success,
            String message,
            int tablesSynced,
            int itemsExecuted,
            int itemsSkipped,
            List<String> logs,
            List<String> warnings,
            String jobId,
            List<String> missingDeleteConfirmItemIds
    ) {
        public static SchemaSyncResultDto from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new SchemaSyncResultDto(
                    booleanValue(source.get("success")),
                    text(source.get("message")),
                    intValue(source.get("tablesSynced")),
                    intValue(source.get("itemsExecuted")),
                    intValue(source.get("itemsSkipped")),
                    stringList(source.get("logs")),
                    stringList(source.get("warnings")),
                    text(source.get("jobId")),
                    stringList(source.get("missingDeleteConfirmItemIds"))
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

    private static List<String> stringList(Object value) {
        return listValue(value).stream()
                .map(SchemaSyncRequestDto::text)
                .filter(item -> !item.isBlank())
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
