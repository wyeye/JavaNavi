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
            String format
    ) {
    }

    public record ExportQueryRequest(
            ConnectionConfigDto connection,
            @JsonAlias({"dbName"}) String database,
            @JsonAlias({"sql"}) String query,
            @JsonAlias({"name"}) String defaultName,
            String format
    ) implements PayloadRequest {
        public RequestPayload toPayload() {
            return payloadOf(
                    "connection", CompatibilityRequestMaps.connectionConfig(connection),
                    "database", database,
                    "query", query,
                    "defaultName", defaultName,
                    "format", format
            );
        }
    }

    public record ExportTableRequest(
            ConnectionConfigDto connection,
            @JsonAlias({"dbName"}) String database,
            @JsonAlias({"tableName"}) String table,
            @JsonAlias({"name"}) String defaultName,
            String format
    ) implements PayloadRequest {
        public RequestPayload toPayload() {
            return payloadOf(
                    "connection", CompatibilityRequestMaps.connectionConfig(connection),
                    "database", database,
                    "table", table,
                    "defaultName", defaultName,
                    "format", format
            );
        }
    }

    public record ExportTablesSqlRequest(
            ConnectionConfigDto connection,
            @JsonAlias({"dbName"}) String database,
            List<String> tables,
            Boolean includeData
    ) implements PayloadRequest {
        public RequestPayload toPayload() {
            return payloadOf(
                    "connection", CompatibilityRequestMaps.connectionConfig(connection),
                    "database", database,
                    "tables", tables,
                    "includeData", includeData
            );
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
}
