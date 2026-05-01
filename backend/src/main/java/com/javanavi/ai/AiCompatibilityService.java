package com.javanavi.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.CompatEventDto;
import com.javanavi.security.SecretRedactor;
import com.javanavi.security.SecretStore;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Inet6Address;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

@Service
public class AiCompatibilityService {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<Map<String, Object>>> LIST_OF_MAPS = new TypeReference<>() {};
    private static final String PROVIDER_SECRET_PREFIX = "ai-provider:";
    private static final String ALLOW_PRIVATE_AI_ENDPOINTS_ENV = "JAVANAVI_ALLOW_PRIVATE_AI_ENDPOINTS";

    private final ObjectMapper objectMapper;
    private final SecretStore secretStore;
    private final Path stateFile;
    private final HttpClient httpClient;
    private final CompatEventPublisher eventPublisher;
    private final I18nMessages messages;
    private final Set<String> cancelledChatStreams = ConcurrentHashMap.newKeySet();

    public AiCompatibilityService(
            SecurityProperties properties,
            ObjectMapper objectMapper,
            SecretStore secretStore,
            CompatEventPublisher eventPublisher,
            I18nMessages messages
    ) {
        this.objectMapper = objectMapper;
        this.secretStore = secretStore;
        this.eventPublisher = eventPublisher;
        this.messages = messages;
        Path directory = Path.of(properties.getDataDirectory()).toAbsolutePath().normalize();
        this.stateFile = directory.resolve("ai-state.json");
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public synchronized List<Map<String, Object>> getProviders() {
        return providers(readState()).stream().map(this::redactedProvider).toList();
    }

    public synchronized Map<String, Object> saveProvider(Map<String, Object> input) {
        if (input == null) {
            throw new IllegalArgumentException("AI provider payload is required.");
        }
        Map<String, Object> state = readState();
        List<Map<String, Object>> providers = new ArrayList<>(providers(state));
        String id = sanitizeId(firstText(text(input.get("id")), "provider-" + UUID.randomUUID().toString().substring(0, 8)));
        Map<String, Object> existing = providers.stream()
                .filter(provider -> id.equals(text(provider.get("id"))))
                .findFirst()
                .orElse(null);

        String type = normalizeType(firstText(text(input.get("type")), existing == null ? null : text(existing.get("type")), "openai"));
        String apiKey = text(input.get("apiKey"));
        boolean hasSecret = existing != null && bool(existing.get("hasSecret")) || secretStore.get(secretKey(id)).isPresent();
        if (apiKey != null && !apiKey.isBlank()) {
            secretStore.put(secretKey(id), apiKey);
            hasSecret = true;
        } else if (Boolean.TRUE.equals(input.get("clearApiKey"))) {
            secretStore.delete(secretKey(id));
            hasSecret = false;
        }

        Map<String, Object> provider = orderedMap(
                "id", id,
                "type", type,
                "name", firstText(text(input.get("name")), existing == null ? null : text(existing.get("name")), id),
                "apiKey", "",
                "secretRef", secretRef(id),
                "hasSecret", hasSecret,
                "baseUrl", firstText(text(input.get("baseUrl")), existing == null ? null : text(existing.get("baseUrl")), defaultBaseUrl(type)),
                "model", firstText(text(input.get("model")), existing == null ? null : text(existing.get("model")), defaultModel(type)),
                "models", stringList(input.get("models")),
                "apiFormat", firstText(text(input.get("apiFormat")), existing == null ? null : text(existing.get("apiFormat")), type),
                "headers", mapValue(input.get("headers")),
                "transportEnabled", booleanValue(input.get("transportEnabled"), existing != null && booleanValue(existing.get("transportEnabled"), false)),
                "maxTokens", positiveInt(input.get("maxTokens"), existing == null ? 4096 : positiveInt(existing.get("maxTokens"), 4096)),
                "temperature", numeric(input.get("temperature"), existing == null ? 0.2 : numeric(existing.get("temperature"), 0.2)),
                "updatedAt", Instant.now().toString()
        );
        providers.removeIf(item -> id.equals(text(item.get("id"))));
        providers.add(provider);
        state.put("providers", providers);
        if (isBlank(text(state.get("activeProvider")))) {
            state.put("activeProvider", id);
        }
        writeState(state);
        return redactedProvider(provider);
    }

    public synchronized void deleteProvider(String id) {
        String providerId = sanitizeId(id);
        Map<String, Object> state = readState();
        List<Map<String, Object>> providers = new ArrayList<>(providers(state));
        providers.removeIf(provider -> providerId.equals(text(provider.get("id"))));
        state.put("providers", providers);
        if (providerId.equals(text(state.get("activeProvider")))) {
            state.put("activeProvider", providers.isEmpty() ? "" : text(providers.get(0).get("id")));
        }
        secretStore.delete(secretKey(providerId));
        writeState(state);
    }

    public synchronized String getActiveProvider() {
        return firstText(text(readState().get("activeProvider")), "");
    }

    public synchronized void setActiveProvider(String id) {
        Map<String, Object> state = readState();
        String providerId = firstText(text(id), "");
        if (!providerId.isBlank()) {
            providerId = sanitizeId(providerId);
        }
        state.put("activeProvider", providerId);
        writeState(state);
    }

    public Map<String, String> builtinPrompts() {
        return orderedStringMap(
                "explain_sql", messages.message("ai.prompt.explainSql"),
                "optimize_sql", messages.message("ai.prompt.optimizeSql"),
                "generate_query", messages.message("ai.prompt.generateQuery"),
                "summarize_result", messages.message("ai.prompt.summarizeResult")
        );
    }

    public synchronized Map<String, Object> listModels() {
        List<Map<String, Object>> providers = getProviders();
        Map<String, Object> byProvider = new LinkedHashMap<>();
        for (Map<String, Object> provider : providers) {
            byProvider.put(text(provider.get("id")), provider.get("models"));
        }
        return orderedMap("models", providers.stream().flatMap(provider -> stringList(provider.get("models")).stream()).distinct().toList(), "byProvider", byProvider);
    }

    public synchronized Map<String, Object> testProvider(Map<String, Object> input) {
        Map<String, Object> state = readState();
        String id = input == null ? null : text(input.get("id"));
        String providerId = isBlank(id) ? "" : sanitizeId(id);
        Map<String, Object> savedProvider = providerId.isBlank()
                ? Map.of()
                : providers(state).stream()
                .filter(provider -> providerId.equals(text(provider.get("id"))))
                .findFirst()
                .orElse(Map.of());
        String type = normalizeType(firstText(input == null ? null : text(input.get("type")), text(savedProvider.get("type"))));
        String model = firstText(input == null ? null : text(input.get("model")), text(savedProvider.get("model")));
        String apiKey = input == null ? null : text(input.get("apiKey"));
        Optional<String> storedSecret = providerId.isBlank() ? Optional.empty() : secretStore.get(secretKey(providerId));
        boolean hasStoredSecret = storedSecret.isPresent();
        if (isBlank(model)) {
            return orderedMap("success", false, "message", "AI model is required.", "networkTested", false);
        }
        if (!"claude_cli".equals(type) && isBlank(apiKey) && !hasStoredSecret) {
            return orderedMap("success", false, "message", "AI provider API key is required or must already be stored.", "networkTested", false);
        }
        boolean transportEnabled = booleanValue(input == null ? null : input.get("transportEnabled"), booleanValue(savedProvider.get("transportEnabled"), false));
        if (transportEnabled && !"claude_cli".equals(type)) {
            Map<String, Object> provider = new LinkedHashMap<>(savedProvider);
            provider.put("type", type);
            provider.put("model", model);
            provider.put("baseUrl", firstText(input == null ? null : text(input.get("baseUrl")), text(savedProvider.get("baseUrl")), defaultBaseUrl(type)));
            provider.put("headers", input != null && input.get("headers") != null ? mapValue(input.get("headers")) : mapValue(savedProvider.get("headers")));
            try {
                Map<String, Object> transport = invokeOpenAiCompatibleHealthCheck(provider, isBlank(apiKey) ? storedSecret.orElse("") : apiKey);
                return orderedMap(
                        "success", true,
                        "message", "AI provider transport test succeeded via JavaNavi Web OpenAI-compatible HTTP check.",
                        "providerId", providerId.isBlank() ? "preview" : providerId,
                        "networkTested", true,
                        "transportEnabled", true,
                        "transport", transport
                );
            } catch (IOException | InterruptedException | IllegalArgumentException error) {
                if (error instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return orderedMap(
                        "success", false,
                        "message", "AI provider transport test failed: " + SecretRedactor.redact(error.getMessage()),
                        "providerId", providerId.isBlank() ? "preview" : providerId,
                        "networkTested", true,
                        "transportEnabled", true
                );
            }
        }
        return orderedMap(
                "success", true,
                "message", transportEnabled
                        ? "AI provider configuration is valid and may use JavaNavi Web OpenAI-compatible HTTP transport."
                        : "AI provider configuration is valid for JavaNavi Web local storage; enable transportEnabled for outbound HTTP model calls.",
                "providerId", providerId.isBlank() ? "preview" : providerId,
                "networkTested", false,
                "transportEnabled", transportEnabled
        );
    }

    public synchronized String getSafetyLevel() {
        return firstText(text(readState().get("safetyLevel")), "readonly");
    }

    public synchronized void setSafetyLevel(String level) {
        Map<String, Object> state = readState();
        state.put("safetyLevel", normalizeSafety(level));
        writeState(state);
    }

    public synchronized String getContextLevel() {
        return firstText(text(readState().get("contextLevel")), "schema_only");
    }

    public synchronized void setContextLevel(String level) {
        Map<String, Object> state = readState();
        state.put("contextLevel", normalizeContext(level));
        writeState(state);
    }

    public Map<String, Object> checkSql(String sql) {
        String normalized = firstText(sql, "").toLowerCase(Locale.ROOT);
        boolean mutating = normalized.matches("(?s).*(\\binsert\\b|\\bupdate\\b|\\bdelete\\b|\\bdrop\\b|\\balter\\b|\\btruncate\\b|\\bcreate\\b|\\bmerge\\b|\\breplace\\b).*?");
        return orderedMap(
                "allowed", true,
                "operationType", mutating ? "write" : "read",
                "requiresConfirm", mutating,
                "warningMessage", mutating ? "This SQL may modify database state; confirm before execution." : null
        );
    }

    public synchronized Map<String, Object> chatSend(Map<String, Object> input) {
        Map<String, Object> state = readState();
        String active = firstText(text(state.get("activeProvider")), "");
        Optional<Map<String, Object>> provider = providers(state).stream()
                .filter(item -> active.equals(text(item.get("id"))))
                .findFirst();
        if (provider.isEmpty()) {
            return orderedMap(
                    "content", "JavaNavi AI provider is not configured. Save a provider before sending model requests.",
                    "choices", List.of(),
                    "providerId", "",
                    "transport", "java-web-local-state"
            );
        }
        Map<String, Object> selected = provider.get();
        if (booleanValue(selected.get("transportEnabled"), false)) {
            Optional<String> apiKey = secretStore.get(secretKey(active));
            if (apiKey.isEmpty()) {
                return orderedMap(
                        "content", "JavaNavi AI provider '" + firstText(text(selected.get("name")), active) + "' has transport enabled but no stored API key.",
                        "choices", List.of(),
                        "providerId", active,
                        "model", selected.get("model"),
                        "transport", "openai-compatible-http",
                        "transportError", true
                );
            }
            try {
                return invokeOpenAiCompatibleChat(selected, input, apiKey.get(), active);
            } catch (IOException | InterruptedException | IllegalArgumentException error) {
                if (error instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return orderedMap(
                        "content", "JavaNavi AI provider transport failed: " + SecretRedactor.redact(error.getMessage()),
                        "choices", List.of(),
                        "providerId", active,
                        "model", selected.get("model"),
                        "transport", "openai-compatible-http",
                        "transportError", true
                );
            }
        }
        return orderedMap(
                "content", "JavaNavi AI provider '" + firstText(text(selected.get("name")), active) + "' is configured with outbound model transport disabled; enable transportEnabled to use JavaNavi Web OpenAI-compatible HTTP calls.",
                "choices", List.of(),
                "providerId", active,
                "model", selected.get("model"),
                "transport", "java-web-local-state"
        );
    }

    private Map<String, Object> invokeOpenAiCompatibleChat(Map<String, Object> provider, Map<String, Object> input, String apiKey, String providerId) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> messages = objectList(input == null ? null : input.get("messages"));
        if (messages.isEmpty()) {
            messages = List.of(orderedMap("role", "user", "content", firstText(text(input == null ? null : input.get("prompt")), "Hello")));
        }
        Map<String, Object> requestBody = openAiCompatibleChatRequestBody(provider, input, model, messages, false);

        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(chatCompletionsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        mapValue(provider.get("headers")).forEach((key, value) -> {
            String header = text(key);
            String headerValue = text(value);
            if (!header.isBlank() && !headerValue.isBlank() && !"authorization".equalsIgnoreCase(header)) {
                builder.header(header, headerValue);
            }
        });

        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = objectMapper.readValue(response.body(), MAP_TYPE);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + providerErrorMessage(payload));
        }
        return orderedMap(
                "content", assistantContent(payload),
                "choices", payload.getOrDefault("choices", List.of()),
                "providerId", providerId,
                "model", firstText(text(payload.get("model")), model),
                "transport", "openai-compatible-http",
                "usage", payload.getOrDefault("usage", Map.of()),
                "responseId", text(payload.get("id"))
        );
    }

    private Map<String, Object> invokeOpenAiCompatibleHealthCheck(Map<String, Object> provider, String apiKey) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(modelsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .GET();
        mapValue(provider.get("headers")).forEach((key, value) -> {
            String header = text(key);
            String headerValue = text(value);
            if (!header.isBlank() && !headerValue.isBlank() && !"authorization".equalsIgnoreCase(header)) {
                builder.header(header, headerValue);
            }
        });
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = response.body().isBlank()
                ? Map.of()
                : objectMapper.readValue(response.body(), MAP_TYPE);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + providerErrorMessage(payload));
        }
        return orderedMap(
                "statusCode", response.statusCode(),
                "endpoint", "models",
                "modelCount", objectList(payload.get("data")).size()
        );
    }

    public void chatCancel(String sessionId) {
        String id = text(sessionId);
        if (!id.isBlank()) {
            cancelledChatStreams.add(sanitizeId(id));
        }
    }

    public synchronized Map<String, Object> chatStream(String sessionId, Map<String, Object> input) {
        String id = sanitizeId(sessionId);
        cancelledChatStreams.remove(id);
        Optional<Map<String, Object>> streamedTransport = tryOpenAiCompatibleStreamingChat(id, input);
        if (streamedTransport.isPresent()) {
            return streamedTransport.get();
        }
        Map<String, Object> response = chatSend(input);
        String eventName = "ai:stream:" + id;
        String transport = firstText(text(response.get("transport")), "java-web-local-state");
        if (booleanValue(response.get("transportError"), false)) {
            publishAiStreamEvent(eventName, id, "error", "AI stream transport error", orderedMap(
                    "error", firstText(text(response.get("content")), "AI stream transport error"),
                    "transport", transport
            ));
            publishAiStreamEvent(eventName, id, "completed", "AI stream completed with error", orderedMap(
                    "done", true,
                    "transport", transport
            ));
            return orderedMap("streamed", false, "sessionId", id, "eventName", eventName, "transport", transport, "error", response.get("content"));
        }

        String content = firstText(text(response.get("content")), "");
        List<String> chunks = streamChunks(content);
        if (chunks.isEmpty()) {
            chunks = List.of("");
        }
        for (String chunk : chunks) {
            if (!chunk.isEmpty()) {
                publishAiStreamEvent(eventName, id, "generating", "AI stream content", orderedMap(
                        "content", chunk,
                        "transport", transport,
                        "providerId", response.get("providerId"),
                        "model", response.get("model")
                ));
            }
        }
        publishAiStreamEvent(eventName, id, "completed", "AI stream completed", orderedMap(
                "done", true,
                "transport", transport,
                "providerId", response.get("providerId"),
                "model", response.get("model"),
                "usage", response.getOrDefault("usage", Map.of())
        ));
        return orderedMap("streamed", true, "sessionId", id, "eventName", eventName, "transport", transport, "chunks", chunks.size());
    }

    private Optional<Map<String, Object>> tryOpenAiCompatibleStreamingChat(String sessionId, Map<String, Object> input) {
        Map<String, Object> state = readState();
        String active = firstText(text(state.get("activeProvider")), "");
        Optional<Map<String, Object>> provider = providers(state).stream()
                .filter(item -> active.equals(text(item.get("id"))))
                .findFirst();
        if (provider.isEmpty() || !booleanValue(provider.get().get("transportEnabled"), false)) {
            return Optional.empty();
        }
        Optional<String> apiKey = secretStore.get(secretKey(active));
        if (apiKey.isEmpty()) {
            return Optional.empty();
        }
        String eventName = "ai:stream:" + sessionId;
        try {
            Map<String, Object> result = invokeOpenAiCompatibleStreamingChat(provider.get(), input, apiKey.get(), active, sessionId, eventName);
            return Optional.of(result);
        } catch (IOException | InterruptedException | IllegalArgumentException error) {
            if (error instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            publishAiStreamEvent(eventName, sessionId, "error", "AI stream transport error", orderedMap(
                    "error", SecretRedactor.redact(error.getMessage()),
                    "transport", "openai-compatible-http"
            ));
            publishAiStreamEvent(eventName, sessionId, "completed", "AI stream completed with error", orderedMap(
                    "done", true,
                    "transport", "openai-compatible-http"
            ));
            return Optional.of(orderedMap(
                    "streamed", false,
                    "sessionId", sessionId,
                    "eventName", eventName,
                    "transport", "openai-compatible-http",
                    "error", SecretRedactor.redact(error.getMessage())
            ));
        }
    }

    private Map<String, Object> invokeOpenAiCompatibleStreamingChat(
            Map<String, Object> provider,
            Map<String, Object> input,
            String apiKey,
            String providerId,
            String sessionId,
            String eventName
    ) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> messages = objectList(input == null ? null : input.get("messages"));
        if (messages.isEmpty()) {
            messages = List.of(orderedMap("role", "user", "content", firstText(text(input == null ? null : input.get("prompt")), "Hello")));
        }
        Map<String, Object> requestBody = openAiCompatibleChatRequestBody(provider, input, model, messages, true);
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(chatCompletionsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(60))
                .header("Accept", "text/event-stream")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        mapValue(provider.get("headers")).forEach((key, value) -> {
            String header = text(key);
            String headerValue = text(value);
            if (!header.isBlank() && !headerValue.isBlank() && !"authorization".equalsIgnoreCase(header)) {
                builder.header(header, headerValue);
            }
        });

        HttpResponse<Stream<String>> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofLines());
        List<String> chunks = new ArrayList<>();
        try (Stream<String> lines = response.body()) {
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String body = String.join("\n", lines.toList());
                throw new IllegalArgumentException("Provider returned HTTP " + response.statusCode() + ": " + SecretRedactor.redact(body));
            }
            for (String line : (Iterable<String>) lines::iterator) {
                if (cancelledChatStreams.contains(sessionId)) {
                    publishAiStreamEvent(eventName, sessionId, "cancelled", "AI stream cancelled", orderedMap(
                            "done", true,
                            "cancelled", true,
                            "transport", "openai-compatible-http",
                            "providerId", providerId,
                            "model", model
                    ));
                    return orderedMap("streamed", false, "cancelled", true, "sessionId", sessionId, "eventName", eventName, "transport", "openai-compatible-http", "chunks", chunks.size());
                }
                String chunk = streamChunkFromLine(line);
                if (chunk == null) {
                    continue;
                }
                if (!chunk.isEmpty()) {
                    chunks.add(chunk);
                    publishAiStreamEvent(eventName, sessionId, "generating", "AI provider stream content", orderedMap(
                            "content", chunk,
                            "transport", "openai-compatible-http",
                            "providerId", providerId,
                            "model", model
                    ));
                }
            }
        } finally {
            cancelledChatStreams.remove(sessionId);
        }
        publishAiStreamEvent(eventName, sessionId, "completed", "AI stream completed", orderedMap(
                "done", true,
                "transport", "openai-compatible-http",
                "providerId", providerId,
                "model", model
        ));
        return orderedMap("streamed", true, "sessionId", sessionId, "eventName", eventName, "transport", "openai-compatible-http", "providerStreamed", true, "chunks", chunks.size());
    }

    private Map<String, Object> openAiCompatibleChatRequestBody(Map<String, Object> provider, Map<String, Object> input, String model, List<Object> messages, boolean stream) {
        Map<String, Object> requestBody = orderedMap(
                "model", model,
                "messages", messages,
                "stream", stream,
                "temperature", numeric(provider.get("temperature"), 0.2),
                "max_tokens", positiveInt(provider.get("maxTokens"), 4096)
        );
        List<Object> tools = objectList(input == null ? null : input.get("tools"));
        if (!tools.isEmpty()) {
            requestBody.put("tools", tools);
        }
        return requestBody;
    }

    private void publishAiStreamEvent(String eventName, String sessionId, String phase, String message, Map<String, Object> payload) {
        eventPublisher.publish(new CompatEventDto(
                UUID.randomUUID().toString(),
                eventName,
                "ai",
                sessionId,
                "javanavi-ai",
                phase,
                message,
                Instant.now(),
                payload
        ));
    }

    public synchronized List<Map<String, Object>> getSessions() {
        Map<String, Object> sessions = sessions(readState());
        return sessions.values().stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(session -> orderedMap(
                        "id", text(session.get("id")),
                        "title", firstText(text(session.get("title")), "Untitled"),
                        "updatedAt", numeric(session.get("updatedAt"), 0),
                        "messageCount", messageCount(text(session.get("messagesJSON")))
                ))
                .sorted(Comparator.comparingDouble(item -> -numeric(item.get("updatedAt"), 0)))
                .toList();
    }

    public synchronized Map<String, Object> loadSession(String sessionId) {
        String id = sanitizeId(sessionId);
        Object sessionValue = sessions(readState()).get(id);
        if (!(sessionValue instanceof Map<?, ?> rawSession)) {
            return orderedMap("id", id, "title", "", "updatedAt", 0, "messages", List.of());
        }
        Map<String, Object> session = mapValue(rawSession);
        return orderedMap(
                "id", id,
                "title", firstText(text(session.get("title")), "Untitled"),
                "updatedAt", numeric(session.get("updatedAt"), 0),
                "messages", parseMessages(text(session.get("messagesJSON")))
        );
    }

    public synchronized void saveSession(String sessionId, String title, double updatedAt, String messagesJson) {
        String id = sanitizeId(sessionId);
        Map<String, Object> state = readState();
        Map<String, Object> sessions = new LinkedHashMap<>(sessions(state));
        sessions.put(id, orderedMap(
                "id", id,
                "title", firstText(title, "Untitled"),
                "updatedAt", updatedAt <= 0 ? System.currentTimeMillis() : updatedAt,
                "messagesJSON", firstText(messagesJson, "[]")
        ));
        state.put("sessions", sessions);
        writeState(state);
    }

    public synchronized void deleteSession(String sessionId) {
        String id = sanitizeId(sessionId);
        Map<String, Object> state = readState();
        Map<String, Object> sessions = new LinkedHashMap<>(sessions(state));
        sessions.remove(id);
        state.put("sessions", sessions);
        writeState(state);
    }

    private Map<String, Object> readState() {
        try {
            if (!Files.exists(stateFile)) {
                return defaultState();
            }
            String json = Files.readString(stateFile, StandardCharsets.UTF_8);
            if (json.isBlank()) {
                return defaultState();
            }
            Map<String, Object> state = objectMapper.readValue(json, MAP_TYPE);
            Map<String, Object> result = defaultState();
            if (state != null) {
                result.putAll(state);
            }
            return result;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JavaNavi AI state.", error);
        }
    }

    private void writeState(Map<String, Object> state) {
        try {
            Files.createDirectories(stateFile.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(stateFile.toFile(), state);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi AI state.", error);
        }
    }

    private Map<String, Object> defaultState() {
        return orderedMap(
                "providers", new ArrayList<Map<String, Object>>(),
                "activeProvider", "",
                "safetyLevel", "readonly",
                "contextLevel", "schema_only",
                "sessions", new LinkedHashMap<String, Object>()
        );
    }

    private List<Map<String, Object>> providers(Map<String, Object> state) {
        Object value = state.get("providers");
        if (value == null) {
            return new ArrayList<>();
        }
        return new ArrayList<>(objectMapper.convertValue(value, LIST_OF_MAPS));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> sessions(Map<String, Object> state) {
        Object value = state.get("sessions");
        if (value instanceof Map<?, ?> map) {
            return new LinkedHashMap<>((Map<String, Object>) map);
        }
        return new LinkedHashMap<>();
    }

    private Map<String, Object> redactedProvider(Map<String, Object> provider) {
        Map<String, Object> result = new LinkedHashMap<>(provider);
        String id = text(result.get("id"));
        boolean hasSecret = bool(result.get("hasSecret")) || (!isBlank(id) && secretStore.get(secretKey(id)).isPresent());
        result.put("apiKey", "");
        result.put("hasSecret", hasSecret);
        result.put("secretRef", isBlank(id) ? "" : secretRef(id));
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        if (value == null) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(value, LinkedHashMap.class);
    }

    private List<String> stringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(AiCompatibilityService::text).filter(item -> !isBlank(item)).distinct().toList();
        }
        String single = text(value);
        if (isBlank(single)) {
            return List.of();
        }
        return List.of(single);
    }

    private List<Object> objectList(Object value) {
        if (value instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        return List.of();
    }

    private static URI chatCompletionsUri(String baseUrl) {
        String base = firstText(baseUrl, defaultBaseUrl("openai"));
        String normalized = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        if (normalized.endsWith("/chat/completions")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/chat/completions");
        }
        return URI.create(normalized + "/v1/chat/completions");
    }

    private static URI modelsUri(String baseUrl) {
        String base = firstText(baseUrl, defaultBaseUrl("openai"));
        String normalized = base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
        if (normalized.endsWith("/chat/completions")) {
            return URI.create(normalized.substring(0, normalized.length() - "/chat/completions".length()) + "/models");
        }
        if (normalized.endsWith("/models")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/models");
        }
        return URI.create(normalized + "/v1/models");
    }

    private static URI validatedProviderUri(URI uri) {
        if (uri == null) {
            throw new IllegalArgumentException("AI provider endpoint is required.");
        }
        String scheme = text(uri.getScheme()).toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            throw new IllegalArgumentException("AI provider endpoint must use http or https.");
        }
        String host = text(uri.getHost());
        if (host.isBlank()) {
            throw new IllegalArgumentException("AI provider endpoint host is required.");
        }
        if (!allowPrivateProviderEndpoints() && isPrivateProviderHost(host)) {
            throw new IllegalArgumentException("AI provider endpoint targets a local or private network host; set "
                    + ALLOW_PRIVATE_AI_ENDPOINTS_ENV + "=true only for trusted local testing.");
        }
        return uri;
    }

    private static boolean allowPrivateProviderEndpoints() {
        return booleanValue(System.getenv(ALLOW_PRIVATE_AI_ENDPOINTS_ENV), false);
    }

    private static boolean isPrivateProviderHost(String host) {
        String normalized = host.trim().toLowerCase(Locale.ROOT);
        if (normalized.equals("localhost")
                || normalized.equals("localhost.localdomain")
                || normalized.endsWith(".localhost")
                || normalized.equals("0.0.0.0")) {
            return true;
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(normalized)) {
                if (isPrivateProviderAddress(address)) {
                    return true;
                }
            }
            return false;
        } catch (UnknownHostException error) {
            return false;
        }
    }

    private static boolean isPrivateProviderAddress(InetAddress address) {
        if (address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()) {
            return true;
        }
        if (address instanceof Inet6Address inet6) {
            byte[] bytes = inet6.getAddress();
            int first = bytes.length > 0 ? bytes[0] & 0xff : 0;
            return (first & 0xfe) == 0xfc;
        }
        return false;
    }

    private static String providerErrorMessage(Map<String, Object> payload) {
        Object error = payload.get("error");
        if (error instanceof Map<?, ?> map) {
            return firstText(text(map.get("message")), text(map.get("type")), "unknown provider error");
        }
        return firstText(text(error), text(payload.get("message")), "unknown provider error");
    }

    private static String assistantContent(Map<String, Object> payload) {
        Object choices = payload.get("choices");
        if (choices instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> choice) {
            Object message = choice.get("message");
            if (message instanceof Map<?, ?> messageMap) {
                String content = text(messageMap.get("content"));
                if (!isBlank(content)) {
                    return content;
                }
            }
            String text = text(choice.get("text"));
            if (!isBlank(text)) {
                return text;
            }
        }
        return "";
    }

    private String streamChunkFromLine(String line) throws JsonProcessingException {
        String text = text(line);
        if (text.isBlank() || text.startsWith(":")) {
            return null;
        }
        if (text.startsWith("data:")) {
            text = text.substring("data:".length()).trim();
        }
        if (text.isBlank() || "[DONE]".equals(text)) {
            return null;
        }
        Map<String, Object> payload = objectMapper.readValue(text, MAP_TYPE);
        Object choices = payload.get("choices");
        if (choices instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> choice) {
            Object delta = choice.get("delta");
            if (delta instanceof Map<?, ?> deltaMap) {
                return text(deltaMap.get("content"));
            }
            Object message = choice.get("message");
            if (message instanceof Map<?, ?> messageMap) {
                return text(messageMap.get("content"));
            }
            return text(choice.get("text"));
        }
        return text(payload.get("content"));
    }

    private static List<String> streamChunks(String content) {
        if (isBlank(content)) {
            return List.of();
        }
        int chunkSize = 80;
        List<String> chunks = new ArrayList<>();
        for (int index = 0; index < content.length(); index += chunkSize) {
            chunks.add(content.substring(index, Math.min(content.length(), index + chunkSize)));
        }
        return chunks;
    }

    private List<Object> parseMessages(String messagesJson) {
        if (isBlank(messagesJson)) {
            return List.of();
        }
        try {
            Object parsed = objectMapper.readValue(messagesJson, Object.class);
            return parsed instanceof List<?> list ? new ArrayList<>(list) : List.of();
        } catch (JsonProcessingException ignored) {
            return List.of();
        }
    }

    private int messageCount(String messagesJson) {
        return parseMessages(messagesJson).size();
    }

    private static String secretKey(String id) {
        return PROVIDER_SECRET_PREFIX + sanitizeId(id) + ":apiKey";
    }

    private static String secretRef(String id) {
        return PROVIDER_SECRET_PREFIX + sanitizeId(id);
    }

    private static String sanitizeId(String value) {
        String sanitized = value == null ? "" : value.trim().replaceAll("[^A-Za-z0-9_.:@-]", "-");
        if (sanitized.isBlank()) {
            throw new IllegalArgumentException("AI provider/session id is required.");
        }
        return sanitized.length() > 96 ? sanitized.substring(0, 96) : sanitized;
    }

    private static String normalizeType(String type) {
        String value = firstText(type, "openai").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "anthropic", "claude" -> "anthropic";
            case "gemini", "google" -> "gemini";
            case "custom" -> "custom";
            case "claude_cli" -> "claude_cli";
            default -> "openai";
        };
    }

    private static String defaultBaseUrl(String type) {
        return switch (normalizeType(type)) {
            case "anthropic" -> "https://api.anthropic.com";
            case "gemini" -> "https://generativelanguage.googleapis.com";
            case "custom" -> "";
            case "claude_cli" -> "local-cli";
            default -> "https://api.openai.com/v1";
        };
    }

    private static String defaultModel(String type) {
        return switch (normalizeType(type)) {
            case "anthropic" -> "claude-3-5-sonnet-latest";
            case "gemini" -> "gemini-1.5-pro";
            case "claude_cli" -> "claude-cli";
            default -> "gpt-4o-mini";
        };
    }

    private static String normalizeSafety(String level) {
        String value = firstText(level, "readonly").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "off", "permissive" -> "off";
            case "confirm" -> "confirm";
            default -> "readonly";
        };
    }

    private static String normalizeContext(String level) {
        String value = firstText(level, "schema_only").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "none" -> "none";
            case "full" -> "full";
            default -> "schema_only";
        };
    }

    private static int positiveInt(Object value, int fallback) {
        if (value instanceof Number number) {
            int result = number.intValue();
            return result > 0 ? result : fallback;
        }
        try {
            int result = Integer.parseInt(text(value));
            return result > 0 ? result : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static double numeric(Object value, double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(text(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static boolean bool(Object value) {
        return value instanceof Boolean bool && bool;
    }

    private static boolean booleanValue(Object value, boolean fallback) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        String text = text(value);
        if (isBlank(text)) {
            return fallback;
        }
        return switch (text.toLowerCase(Locale.ROOT)) {
            case "true", "1", "yes", "y", "on" -> true;
            case "false", "0", "no", "n", "off" -> false;
            default -> fallback;
        };
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String text(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static Map<String, String> orderedStringMap(String... entries) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            map.put(entries[i], entries[i + 1]);
        }
        return map;
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            map.put(String.valueOf(entries[i]), entries[i + 1]);
        }
        return map;
    }
}
