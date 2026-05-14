package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class FileWorkflowContracts {
    private FileWorkflowContracts() {
    }

    public interface PayloadRequest {
        RequestPayload toPayload();
    }

    public static final class RequestPayload extends LinkedHashMap<String, Object> {
        public RequestPayload() {
        }
    }

    public static final class DataRow extends LinkedHashMap<String, Object> {
    }

    public record SshKeySelectRequest(@JsonAlias({"path"}) String currentPath) {
        public String value() {
            return text(currentPath);
        }
    }

    public record ImportPreviewRequest(@JsonAlias({"path"}) String filePath) {
        public String value() {
            return text(filePath);
        }
    }

    public record ImportRunRequest(
            @JsonAlias({"path"}) String filePath,
            @JsonAlias({"tableName"}) String table,
            @JsonAlias({"dbName"}) String database,
            ConnectionConfigDto connection,
            Boolean applyToDatabase,
            Boolean apply,
            Boolean execute
    ) implements PayloadRequest {
        public RequestPayload toPayload() {
            return payloadOf(
                    "filePath", filePath,
                    "table", table,
                    "database", database,
                    "connection", CompatibilityRequestMaps.connectionConfig(connection),
                    "applyToDatabase", applyToDatabase,
                    "apply", apply,
                    "execute", execute
            );
        }
    }

    public record ExportDataRequest(
            List<DataRow> rows,
            List<String> columns,
            @JsonAlias({"name"}) String defaultName,
            String format,
            @JsonAlias({"exportPath", "path"}) String targetPath
    ) {
    }

    public record ExportQueryRequest(
            ConnectionConfigDto connection,
            @JsonAlias({"dbName"}) String database,
            @JsonAlias({"sql"}) String query,
            @JsonAlias({"name"}) String defaultName,
            String format,
            @JsonAlias({"exportPath", "path"}) String targetPath
    ) implements PayloadRequest {
        public RequestPayload toPayload() {
            return payloadOf(
                    "connection", CompatibilityRequestMaps.connectionConfig(connection),
                    "database", database,
                    "query", query,
                    "defaultName", defaultName,
                    "format", format,
                    "targetPath", targetPath
            );
        }
    }

    public record ExportTableRequest(
            ConnectionConfigDto connection,
            @JsonAlias({"dbName"}) String database,
            @JsonAlias({"tableName"}) String table,
            @JsonAlias({"name"}) String defaultName,
            String format,
            @JsonAlias({"exportPath", "path"}) String targetPath
    ) implements PayloadRequest {
        public RequestPayload toPayload() {
            return payloadOf(
                    "connection", CompatibilityRequestMaps.connectionConfig(connection),
                    "database", database,
                    "table", table,
                    "defaultName", defaultName,
                    "format", format,
                    "targetPath", targetPath
            );
        }
    }

    public record ExportTablesSqlRequest(
            ConnectionConfigDto connection,
            @JsonAlias({"dbName"}) String database,
            List<String> tables,
            Boolean includeData,
            @JsonAlias({"name"}) String defaultName,
            @JsonAlias({"exportPath", "path"}) String targetPath
    ) implements PayloadRequest {
        public RequestPayload toPayload() {
            return payloadOf(
                    "connection", CompatibilityRequestMaps.connectionConfig(connection),
                    "database", database,
                    "tables", tables,
                    "includeData", includeData,
                    "defaultName", defaultName,
                    "targetPath", targetPath
            );
        }
    }

    public record SqlFileOpenResponse(
            String content,
            boolean isLargeFile,
            String filePath,
            long fileSize,
            String fileSizeMB,
            boolean webManaged
    ) {
        public static SqlFileOpenResponse from(String value) {
            String text = value == null ? "" : value;
            Map<String, Object> json = jsonObject(text);
            if (!json.isEmpty()) {
                return new SqlFileOpenResponse(
                        "",
                        booleanValue(json.get("isLargeFile")),
                        text(json.get("filePath")),
                        longValue(json.get("fileSize")),
                        text(json.get("fileSizeMB")),
                        booleanValue(json.get("webManaged"))
                );
            }
            return new SqlFileOpenResponse(text, false, "", 0L, "", false);
        }
    }

    public record ImportSelectionResponse(
            String filePath,
            String path,
            String filename,
            String table,
            boolean webManaged,
            boolean browserUploadRequired,
            String message,
            Integer totalRows
    ) {
        public static ImportSelectionResponse from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new ImportSelectionResponse(
                    text(source.get("filePath")),
                    text(source.get("path")),
                    text(source.get("filename")),
                    text(source.get("table")),
                    booleanValue(source.get("webManaged")),
                    booleanValue(source.get("browserUploadRequired")),
                    text(source.get("message")),
                    integerValue(source.get("totalRows"))
            );
        }
    }

    public record ImportPreviewResponse(
            List<String> columns,
            int totalRows,
            List<Map<String, Object>> previewRows,
            String filePath,
            boolean webManaged
    ) {
        public static ImportPreviewResponse from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new ImportPreviewResponse(
                    stringList(source.get("columns")),
                    intValue(source.get("totalRows")),
                    rowList(source.get("previewRows")),
                    text(source.get("filePath")),
                    booleanValue(source.get("webManaged"))
            );
        }
    }

    public record ImportRunResponse(
            int success,
            int failed,
            int total,
            List<String> errorLogs,
            String errorSummary,
            boolean dryRun,
            boolean appliedToDatabase,
            int insertedRows,
            int affectedRows,
            String table,
            String filePath,
            String message
    ) {
        public static ImportRunResponse from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new ImportRunResponse(
                    intValue(source.get("success")),
                    intValue(source.get("failed")),
                    intValue(source.get("total")),
                    stringList(source.get("errorLogs")),
                    text(source.get("errorSummary")),
                    booleanValue(source.get("dryRun")),
                    booleanValue(source.get("appliedToDatabase")),
                    intValue(source.get("insertedRows")),
                    intValue(source.get("affectedRows")),
                    text(source.get("table")),
                    text(source.get("filePath")),
                    text(source.get("message"))
            );
        }
    }

    public record ExportResultResponse(
            String path,
            String filePath,
            String filename,
            String format,
            int rows,
            int rowCount,
            List<String> columns,
            long size,
            String downloadUrl,
            boolean webManaged,
            boolean dryRun,
            boolean revealed,
            boolean revealSelected,
            String revealMethod,
            String revealTargetPath,
            String revealDirectory,
            String revealMessage
    ) {
        public static ExportResultResponse from(Map<String, Object> map) {
            Map<String, Object> source = safeMap(map);
            return new ExportResultResponse(
                    text(source.get("path")),
                    text(source.get("filePath")),
                    text(source.get("filename")),
                    text(source.get("format")),
                    intValue(source.get("rows")),
                    intValue(source.get("rowCount")),
                    stringList(source.get("columns")),
                    longValue(source.get("size")),
                    text(source.get("downloadUrl")),
                    booleanValue(source.get("webManaged")),
                    booleanValue(source.get("dryRun")),
                    booleanValue(source.get("revealed")),
                    booleanValue(source.get("revealSelected")),
                    text(source.get("revealMethod")),
                    text(source.get("revealTargetPath")),
                    text(source.get("revealDirectory")),
                    text(source.get("revealMessage"))
            );
        }
    }


    private static Map<String, Object> jsonObject(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
            return Map.of();
        }
        try {
            Object parsed = new com.fasterxml.jackson.databind.ObjectMapper().readValue(trimmed, Object.class);
            return parsed instanceof Map<?, ?> map ? mapValue(map) : Map.of();
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private static RequestPayload payloadOf(Object... entries) {
        RequestPayload map = new RequestPayload();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            Object value = entries[i + 1];
            if (value != null) {
                map.put(String.valueOf(entries[i]), value);
            }
        }
        return map;
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static boolean booleanValue(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        String normalized = text(value).toLowerCase(java.util.Locale.ROOT);
        return "true".equals(normalized) || "1".equals(normalized) || "yes".equals(normalized) || "on".equals(normalized);
    }

    private static Integer integerValue(Object value) {
        if (value == null || text(value).isBlank()) {
            return null;
        }
        return intValue(value);
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

    private static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            String text = text(value);
            return text.isBlank() ? 0L : Long.parseLong(text);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private static List<?> listValue(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private static List<String> stringList(Object value) {
        return listValue(value).stream()
                .map(FileWorkflowContracts::text)
                .filter(item -> !item.isBlank())
                .toList();
    }

    private static List<Map<String, Object>> rowList(Object value) {
        return listValue(value).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(FileWorkflowContracts::mapValue)
                .toList();
    }

    private static Map<String, Object> safeMap(Map<String, Object> map) {
        return map == null ? Map.of() : map;
    }

    private static Map<String, Object> mapValue(Map<?, ?> raw) {
        LinkedHashMap<String, Object> map = new LinkedHashMap<>();
        raw.forEach((key, value) -> map.put(String.valueOf(key), value));
        return map;
    }
}
