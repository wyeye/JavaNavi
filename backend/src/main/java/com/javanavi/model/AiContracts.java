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
}
