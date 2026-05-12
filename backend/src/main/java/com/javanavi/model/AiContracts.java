package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class AiContracts {
    private AiContracts() {
    }

    public record ProviderConfigRequest(
            String id,
            String type,
            String name,
            String apiKey,
            Boolean clearApiKey,
            String baseUrl,
            String model,
            List<String> models,
            String apiFormat,
            Map<String, Object> headers,
            Boolean transportEnabled,
            Integer maxTokens,
            Double temperature
    ) {
        public Map<String, Object> toMap() {
            return mapOf(
                    "id", id,
                    "type", type,
                    "name", name,
                    "apiKey", apiKey,
                    "clearApiKey", clearApiKey,
                    "baseUrl", baseUrl,
                    "model", model,
                    "models", models,
                    "apiFormat", apiFormat,
                    "headers", headers,
                    "transportEnabled", transportEnabled,
                    "maxTokens", maxTokens,
                    "temperature", temperature
            );
        }
    }

    public record IdRequest(@JsonAlias({"providerId", "sessionId"}) String id) {
        public String value() {
            return text(id);
        }
    }

    public record LevelRequest(@JsonAlias({"safetyLevel", "contextLevel"}) String level) {
        public String value() {
            return text(level);
        }
    }

    public record SqlCheckRequest(@JsonAlias({"query"}) String sql) {
        public String value() {
            return text(sql);
        }
    }

    public record ChatRequest(
            String sessionId,
            String model,
            String prompt,
            List<Object> messages,
            List<Object> tools
    ) {
        public Map<String, Object> toMap() {
            return mapOf(
                    "sessionId", sessionId,
                    "model", model,
                    "prompt", prompt,
                    "messages", messages,
                    "tools", tools
            );
        }
    }

    public record SessionSaveRequest(
            @JsonAlias({"id"}) String sessionId,
            String title,
            Double updatedAt,
            @JsonAlias({"messagesJson", "messages"}) String messagesJSON
    ) {
        public String idValue() {
            return text(sessionId);
        }

        public double updatedAtValue() {
            return updatedAt == null ? 0 : updatedAt;
        }
    }

    public record ProviderResponse(
            String id,
            String type,
            String name,
            boolean hasSecret,
            String baseUrl,
            String model,
            List<String> models,
            String apiFormat,
            Map<String, Object> headers,
            boolean transportEnabled,
            int maxTokens,
            double temperature,
            String updatedAt
    ) {
        public static ProviderResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new ProviderResponse(
                    text(map.get("id")),
                    text(map.get("type")),
                    text(map.get("name")),
                    booleanValue(map.get("hasSecret")),
                    text(map.get("baseUrl")),
                    text(map.get("model")),
                    stringList(map.get("models")),
                    text(map.get("apiFormat")),
                    mapValue(map.get("headers")),
                    booleanValue(map.get("transportEnabled")),
                    intValue(map.get("maxTokens"), 4096),
                    doubleValue(map.get("temperature"), 0.2),
                    text(map.get("updatedAt"))
            );
        }
    }

    public record ProviderDeleteResponse(boolean deleted) {
    }

    public record ActiveProviderResponse(String activeProvider) {
    }

    public record ModelsResponse(List<String> models, Map<String, Object> byProvider) {
        public static ModelsResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new ModelsResponse(stringList(map.get("models")), mapValue(map.get("byProvider")));
        }
    }

    public record LevelResponse(String safetyLevel, String contextLevel) {
        public static LevelResponse safety(String level) {
            return new LevelResponse(text(level), "");
        }

        public static LevelResponse context(String level) {
            return new LevelResponse("", text(level));
        }
    }

    public record SqlCheckResponse(boolean allowed, String operationType, boolean requiresConfirm, String warningMessage) {
        public static SqlCheckResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new SqlCheckResponse(
                    booleanValue(map.get("allowed")),
                    text(map.get("operationType")),
                    booleanValue(map.get("requiresConfirm")),
                    text(map.get("warningMessage"))
            );
        }
    }

    public record ProviderTestResponse(
            boolean success,
            String message,
            String providerId,
            boolean networkTested,
            boolean transportEnabled,
            boolean transportRequested,
            String transportCapability,
            boolean modelDiscoverySupported,
            boolean modelsFetched,
            List<String> models,
            int modelCount,
            Map<String, Object> transport
    ) {
        public static ProviderTestResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new ProviderTestResponse(
                    booleanValue(map.get("success")),
                    text(map.get("message")),
                    text(map.get("providerId")),
                    booleanValue(map.get("networkTested")),
                    booleanValue(map.get("transportEnabled")),
                    booleanValue(map.get("transportRequested")),
                    text(map.get("transportCapability")),
                    booleanValue(map.get("modelDiscoverySupported")),
                    booleanValue(map.get("modelsFetched")),
                    stringList(map.get("models")),
                    intValue(map.get("modelCount"), 0),
                    mapValue(map.get("transport"))
            );
        }
    }

    public record ChatResponse(
            String content,
            List<Object> choices,
            String providerId,
            String model,
            String transport,
            String transportCapability,
            boolean transportError,
            Map<String, Object> usage,
            String responseId
    ) {
        public static ChatResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new ChatResponse(
                    text(map.get("content")),
                    objectList(map.get("choices")),
                    text(map.get("providerId")),
                    text(map.get("model")),
                    text(map.get("transport")),
                    text(map.get("transportCapability")),
                    booleanValue(map.get("transportError")),
                    mapValue(map.get("usage")),
                    text(map.get("responseId"))
            );
        }
    }

    public record ChatStreamResponse(
            boolean streamed,
            String sessionId,
            String eventName,
            String transport,
            String error,
            int chunks,
            boolean providerStreamed,
            boolean cancelled
    ) {
        public static ChatStreamResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new ChatStreamResponse(
                    booleanValue(map.get("streamed")),
                    text(map.get("sessionId")),
                    text(map.get("eventName")),
                    text(map.get("transport")),
                    text(map.get("error")),
                    intValue(map.get("chunks"), 0),
                    booleanValue(map.get("providerStreamed")),
                    booleanValue(map.get("cancelled"))
            );
        }
    }

    public record ChatCancelResponse(boolean cancelled, String sessionId) {
    }

    public record SessionSummaryResponse(String id, String title, double updatedAt, int messageCount) {
        public static SessionSummaryResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new SessionSummaryResponse(
                    text(map.get("id")),
                    text(map.get("title")),
                    doubleValue(map.get("updatedAt"), 0),
                    intValue(map.get("messageCount"), 0)
            );
        }
    }

    public record SessionLoadResponse(String id, String title, double updatedAt, List<Object> messages) {
        public static SessionLoadResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new SessionLoadResponse(
                    text(map.get("id")),
                    text(map.get("title")),
                    doubleValue(map.get("updatedAt"), 0),
                    objectList(map.get("messages"))
            );
        }
    }

    public record SessionSaveResponse(boolean saved, String sessionId) {
    }

    public record SessionDeleteResponse(boolean deleted, String sessionId) {
    }

    private static Map<String, Object> mapOf(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
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

    private static int intValue(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            String text = text(value);
            return text.isBlank() ? fallback : Integer.parseInt(text);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static double doubleValue(Object value, double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            String text = text(value);
            return text.isBlank() ? fallback : Double.parseDouble(text);
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static List<?> listValue(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private static List<Object> objectList(Object value) {
        return List.copyOf(listValue(value));
    }

    private static List<String> stringList(Object value) {
        return listValue(value).stream()
                .map(AiContracts::text)
                .filter(item -> !item.isBlank())
                .toList();
    }

    private static Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> raw)) {
            return Map.of();
        }
        Map<String, Object> map = new LinkedHashMap<>();
        raw.forEach((key, item) -> map.put(String.valueOf(key), item));
        return map;
    }
}
