package com.javanavi.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.app.AppPersistenceService;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.i18n.LocalizedException;
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
    private final AppPersistenceService appPersistence;
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
        this.appPersistence = new AppPersistenceService(properties, objectMapper);
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
            throw new IllegalArgumentException(messages.message("ai.provider.payloadRequired"));
        }
        Map<String, Object> state = readState();
        List<Map<String, Object>> providers = new ArrayList<>(providers(state));
        String id = sanitizeId(firstText(text(input.get("id")), "provider-" + UUID.randomUUID().toString().substring(0, 8)));
        Map<String, Object> existing = providers.stream()
                .filter(provider -> id.equals(text(provider.get("id"))))
                .findFirst()
                .orElse(null);

        String type = normalizeType(firstText(text(input.get("type")), existing == null ? null : text(existing.get("type")), "openai"));
        String apiFormat = providerApiFormat(type, firstText(text(input.get("apiFormat")), existing == null ? null : text(existing.get("apiFormat"))));
        boolean transportRequested = booleanValue(input.get("transportEnabled"), existing != null && booleanValue(existing.get("transportEnabled"), false));
        boolean transportEnabled = transportRequested && supportsProviderTransport(type, apiFormat);
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
                "apiFormat", apiFormat,
                "headers", mapValue(input.get("headers")),
                "transportEnabled", transportEnabled,
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
                messages.message("ai.builtinPrompt.generalChat.title"), messages.message("ai.builtinPrompt.generalChat.prompt"),
                messages.message("ai.builtinPrompt.sqlGenerator.title"), messages.message("ai.builtinPrompt.sqlGenerator.prompt"),
                messages.message("ai.builtinPrompt.sqlExplainer.title"), messages.message("ai.builtinPrompt.sqlExplainer.prompt"),
                messages.message("ai.builtinPrompt.sqlOptimizer.title"), messages.message("ai.builtinPrompt.sqlOptimizer.prompt"),
                messages.message("ai.builtinPrompt.dataInsight.title"), messages.message("ai.builtinPrompt.dataInsight.prompt"),
                messages.message("ai.builtinPrompt.schemaReview.title"), messages.message("ai.builtinPrompt.schemaReview.prompt")
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
        String apiFormat = providerApiFormat(type, firstText(input == null ? null : text(input.get("apiFormat")), text(savedProvider.get("apiFormat"))));
        String model = firstText(input == null ? null : text(input.get("model")), text(savedProvider.get("model")));
        String apiKey = input == null ? null : text(input.get("apiKey"));
        Optional<String> storedSecret = providerId.isBlank() ? Optional.empty() : secretStore.get(secretKey(providerId));
        boolean hasStoredSecret = storedSecret.isPresent();
        boolean transportRequested = booleanValue(input == null ? null : input.get("transportEnabled"), booleanValue(savedProvider.get("transportEnabled"), false));
        boolean modelDiscoverySupported = supportsProviderTransport(type, apiFormat);
        boolean transportEnabled = transportRequested && modelDiscoverySupported;
        if (!"claude_cli".equals(type) && isBlank(apiKey) && !hasStoredSecret) {
            return orderedMap(
                    "success", false,
                    "message", messages.message("ai.provider.apiKeyRequired"),
                    "providerId", providerId.isBlank() ? "preview" : providerId,
                    "networkTested", false,
                    "transportEnabled", false,
                    "transportRequested", transportRequested,
                    "transportCapability", transportCapability(type, apiFormat),
                    "modelDiscoverySupported", modelDiscoverySupported,
                    "modelsFetched", false
            );
        }
        if (transportEnabled) {
            Map<String, Object> provider = new LinkedHashMap<>(savedProvider);
            provider.put("type", type);
            provider.put("apiFormat", apiFormat);
            provider.put("model", model);
            provider.put("baseUrl", firstText(input == null ? null : text(input.get("baseUrl")), text(savedProvider.get("baseUrl")), defaultBaseUrl(type)));
            provider.put("headers", input != null && input.get("headers") != null ? mapValue(input.get("headers")) : mapValue(savedProvider.get("headers")));
            String effectiveApiKey = isBlank(apiKey) ? storedSecret.orElse("") : apiKey;
            try {
                Map<String, Object> transport = switch (type) {
                    case "anthropic" -> invokeAnthropicHealthCheck(provider, effectiveApiKey);
                    case "gemini" -> invokeGeminiHealthCheck(provider, effectiveApiKey);
                    default -> invokeOpenAiCompatibleHealthCheck(provider, effectiveApiKey);
                };
                return orderedMap(
                        "success", true,
                        "message", messages.message("ai.provider.transportSucceeded"),
                        "providerId", providerId.isBlank() ? "preview" : providerId,
                        "networkTested", true,
                        "transportEnabled", true,
                        "transportRequested", true,
                        "transportCapability", transportCapability(type, apiFormat),
                        "modelDiscoverySupported", true,
                        "modelsFetched", true,
                        "models", transport.getOrDefault("models", List.of()),
                        "modelCount", transport.getOrDefault("modelCount", 0),
                        "transport", transport
                );
            } catch (IOException | InterruptedException | IllegalArgumentException error) {
                if (error instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return orderedMap(
                        "success", false,
                        "message", messages.message("ai.provider.transportFailed", "message", SecretRedactor.redact(error.getMessage())),
                        "providerId", providerId.isBlank() ? "preview" : providerId,
                        "networkTested", true,
                        "transportEnabled", true,
                        "transportRequested", true,
                        "transportCapability", transportCapability(type, apiFormat),
                        "modelDiscoverySupported", true,
                        "modelsFetched", false
                );
            }
        }
        if (isBlank(model)) {
            return orderedMap(
                    "success", false,
                    "message", messages.message("ai.provider.modelRequired"),
                    "providerId", providerId.isBlank() ? "preview" : providerId,
                    "networkTested", false,
                    "transportEnabled", false,
                    "transportRequested", transportRequested,
                    "transportCapability", transportCapability(type, apiFormat),
                    "modelDiscoverySupported", modelDiscoverySupported,
                    "modelsFetched", false
            );
        }
        return orderedMap(
                "success", true,
                "message", messages.message("ai.provider.configurationValid"),
                "providerId", providerId.isBlank() ? "preview" : providerId,
                "networkTested", false,
                "transportEnabled", false,
                "transportRequested", transportRequested,
                "transportCapability", transportCapability(type, apiFormat),
                "modelDiscoverySupported", modelDiscoverySupported,
                "modelsFetched", false
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
        SqlOperationType operationType = sqlOperationType(sql);
        String safetyLevel = getSafetyLevel();
        boolean allowed = switch (safetyLevel) {
            case "full" -> true;
            case "readwrite" -> operationType != SqlOperationType.DDL;
            default -> operationType == SqlOperationType.QUERY;
        };
        boolean requiresConfirm = allowed && switch (safetyLevel) {
            case "full" -> operationType != SqlOperationType.QUERY;
            case "readwrite" -> operationType == SqlOperationType.DML;
            default -> false;
        };
        return orderedMap(
                "allowed", allowed,
                "operationType", operationType.apiName(),
                "requiresConfirm", requiresConfirm,
                "warningMessage", sqlSafetyWarning(operationType, safetyLevel, allowed, requiresConfirm)
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
                    "content", messages.message("ai.chat.providerNotConfigured"),
                    "choices", List.of(),
                    "providerId", "",
                    "transport", "java-web-local-state"
            );
        }
        Map<String, Object> selected = provider.get();
        boolean transportEnabled = booleanValue(selected.get("transportEnabled"), false);
        if (transportEnabled) {
            Optional<String> apiKey = secretStore.get(secretKey(active));
            if (apiKey.isEmpty()) {
                return orderedMap(
                        "content", messages.message("ai.chat.transportNoApiKey", "provider", firstText(text(selected.get("name")), active)),
                        "choices", List.of(),
                        "providerId", active,
                        "model", selected.get("model"),
                        "transport", transportName(selected),
                        "transportError", true
                );
            }
            String normalizedType = normalizeType(text(selected.get("type")));
            try {
                return switch (normalizedType) {
                    case "anthropic" -> invokeAnthropicChat(selected, input, apiKey.get(), active);
                    case "gemini" -> invokeGeminiChat(selected, input, apiKey.get(), active);
                    default -> invokeOpenAiCompatibleChat(selected, input, apiKey.get(), active);
                };
            } catch (IOException | InterruptedException | IllegalArgumentException error) {
                if (error instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                return orderedMap(
                        "content", messages.message("ai.chat.transportFailed", "message", SecretRedactor.redact(error.getMessage())),
                        "choices", List.of(),
                        "providerId", active,
                        "model", selected.get("model"),
                        "transport", transportName(selected),
                        "transportError", true
                );
            }
        }
        return orderedMap(
                "content", messages.message("ai.chat.transportDisabled", "provider", firstText(text(selected.get("name")), active)),
                "choices", List.of(),
                "providerId", active,
                "model", selected.get("model"),
                "transport", "java-web-local-state",
                "transportCapability", transportCapability(selected)
        );
    }

    private Map<String, Object> invokeOpenAiCompatibleChat(Map<String, Object> provider, Map<String, Object> input, String apiKey, String providerId) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> chatMessages = defaultChatMessages(input);
        Map<String, Object> requestBody = openAiCompatibleChatRequestBody(provider, input, model, chatMessages, false);

        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(chatCompletionsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        applyAdditionalHeaders(builder, provider, "authorization");

        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException(messages.message("ai.provider.httpError", "status", response.statusCode(), "message", providerErrorMessage(payload)));
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

    private Map<String, Object> invokeAnthropicChat(Map<String, Object> provider, Map<String, Object> input, String apiKey, String providerId) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> chatMessages = defaultChatMessages(input);
        Map<String, Object> requestBody = anthropicRequestBody(provider, input, model, chatMessages);
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(anthropicMessagesUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        applyAdditionalHeaders(builder, provider, "x-api-key", "anthropic-version");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException(messages.message("ai.provider.httpError", "status", response.statusCode(), "message", providerErrorMessage(payload)));
        }
        return orderedMap(
                "content", assistantContentFromAnthropic(payload),
                "choices", payload.getOrDefault("content", List.of()),
                "providerId", providerId,
                "model", firstText(text(payload.get("model")), model),
                "transport", "anthropic-http",
                "usage", payload.getOrDefault("usage", Map.of()),
                "responseId", text(payload.get("id"))
        );
    }

    private Map<String, Object> invokeGeminiChat(Map<String, Object> provider, Map<String, Object> input, String apiKey, String providerId) throws IOException, InterruptedException {
        String model = firstText(text(input == null ? null : input.get("model")), text(provider.get("model")), defaultModel(text(provider.get("type"))));
        List<Object> chatMessages = defaultChatMessages(input);
        Map<String, Object> requestBody = geminiRequestBody(provider, input, chatMessages);
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(geminiGenerateContentUri(text(provider.get("baseUrl")), model)))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody), StandardCharsets.UTF_8));
        applyAdditionalHeaders(builder, provider, "x-goog-api-key");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException(messages.message("ai.provider.httpError", "status", response.statusCode(), "message", providerErrorMessage(payload)));
        }
        return orderedMap(
                "content", assistantContentFromGemini(payload),
                "choices", payload.getOrDefault("candidates", List.of()),
                "providerId", providerId,
                "model", firstText(text(payload.get("modelVersion")), model),
                "transport", "gemini-http",
                "usage", payload.getOrDefault("usageMetadata", Map.of()),
                "responseId", text(payload.get("responseId"))
        );
    }

    private Map<String, Object> invokeOpenAiCompatibleHealthCheck(Map<String, Object> provider, String apiKey) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(modelsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .GET();
        applyAdditionalHeaders(builder, provider, "authorization");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException(messages.message("ai.provider.httpError", "status", response.statusCode(), "message", providerErrorMessage(payload)));
        }
        List<String> models = openAiCompatibleModelIds(payload);
        return orderedMap(
                "statusCode", response.statusCode(),
                "endpoint", "models",
                "modelCount", models.size(),
                "models", models
        );
    }

    private Map<String, Object> invokeAnthropicHealthCheck(Map<String, Object> provider, String apiKey) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(anthropicModelsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .GET();
        applyAdditionalHeaders(builder, provider, "x-api-key", "anthropic-version");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException(messages.message("ai.provider.httpError", "status", response.statusCode(), "message", providerErrorMessage(payload)));
        }
        List<String> models = anthropicModelIds(payload);
        return orderedMap(
                "statusCode", response.statusCode(),
                "endpoint", "models",
                "modelCount", models.size(),
                "models", models
        );
    }

    private Map<String, Object> invokeGeminiHealthCheck(Map<String, Object> provider, String apiKey) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(validatedProviderUri(geminiModelsUri(text(provider.get("baseUrl")))))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .header("x-goog-api-key", apiKey)
                .GET();
        applyAdditionalHeaders(builder, provider, "x-goog-api-key");
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Map<String, Object> payload = parseResponseMap(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalArgumentException(messages.message("ai.provider.httpError", "status", response.statusCode(), "message", providerErrorMessage(payload)));
        }
        List<String> models = geminiModelIds(payload);
        return orderedMap(
                "statusCode", response.statusCode(),
                "endpoint", "models",
                "modelCount", models.size(),
                "models", models
        );
    }

    private Map<String, Object> anthropicRequestBody(Map<String, Object> provider, Map<String, Object> input, String model, List<Object> messages) {
        Map<String, Object> requestBody = orderedMap(
                "model", model,
                "messages", anthropicMessages(messages),
                "max_tokens", positiveInt(provider.get("maxTokens"), 4096),
                "temperature", numeric(provider.get("temperature"), 0.2)
        );
        String systemPrompt = firstSystemPrompt(messages);
        if (!isBlank(systemPrompt)) {
            requestBody.put("system", systemPrompt);
        }
        return requestBody;
    }

    private Map<String, Object> geminiRequestBody(Map<String, Object> provider, Map<String, Object> input, List<Object> messages) {
        Map<String, Object> requestBody = orderedMap(
                "contents", geminiContents(messages),
                "generationConfig", orderedMap(
                        "temperature", numeric(provider.get("temperature"), 0.2),
                        "maxOutputTokens", positiveInt(provider.get("maxTokens"), 4096)
                )
        );
        String systemPrompt = firstSystemPrompt(messages);
        if (!isBlank(systemPrompt)) {
            requestBody.put("system_instruction", orderedMap(
                    "parts", List.of(orderedMap("text", systemPrompt))
            ));
        }
        return requestBody;
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
        if (provider.isEmpty()
                || !booleanValue(provider.get().get("transportEnabled"), false)
                || !supportsOpenAiCompatibleTransport(provider.get())) {
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
        List<Object> chatMessages = objectList(input == null ? null : input.get("messages"));
        if (chatMessages.isEmpty()) {
            chatMessages = List.of(orderedMap("role", "user", "content", firstText(text(input == null ? null : input.get("prompt")), "Hello")));
        }
        Map<String, Object> requestBody = openAiCompatibleChatRequestBody(provider, input, model, chatMessages, true);
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
                throw new IllegalArgumentException(messages.message("ai.provider.httpError", "status", response.statusCode(), "message", SecretRedactor.redact(body)));
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
        Map<String, Object> state = appPersistence.readMap("ai-state", stateFile);
        Map<String, Object> result = defaultState();
        if (state != null) {
            result.putAll(state);
        }
        return result;
    }

    private void writeState(Map<String, Object> state) {
        appPersistence.writeJson("ai-state", state == null ? defaultState() : state);
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

    static List<String> openAiCompatibleModelIds(Map<String, Object> payload) {
        if (payload == null) {
            return List.of();
        }
        return objectListStatic(payload.get("data")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> text(item.get("id")))
                .filter(item -> !isBlank(item))
                .distinct()
                .toList();
    }

    static List<String> anthropicModelIds(Map<String, Object> payload) {
        if (payload == null) {
            return List.of();
        }
        return objectListStatic(payload.get("data")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> firstText(text(item.get("id")), text(item.get("name"))))
                .filter(item -> !isBlank(item))
                .distinct()
                .toList();
    }

    static List<String> geminiModelIds(Map<String, Object> payload) {
        if (payload == null) {
            return List.of();
        }
        return objectListStatic(payload.get("models")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> normalizeGeminiModelName(firstText(text(item.get("name")), text(item.get("model")))))
                .filter(item -> !isBlank(item))
                .distinct()
                .toList();
    }

    private static List<Map<String, Object>> anthropicMessages(List<Object> messages) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object raw : messages) {
            if (!(raw instanceof Map<?, ?> map)) {
                continue;
            }
            String role = normalizeChatRole(text(map.get("role")));
            if ("system".equals(role)) {
                continue;
            }
            String content = firstText(text(map.get("content")), text(map.get("text")));
            if (isBlank(content)) {
                continue;
            }
            result.add(orderedMap(
                    "role", role,
                    "content", List.of(orderedMap("type", "text", "text", content))
            ));
        }
        return result;
    }

    private static List<Map<String, Object>> geminiContents(List<Object> messages) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object raw : messages) {
            if (!(raw instanceof Map<?, ?> map)) {
                continue;
            }
            String role = normalizeChatRole(text(map.get("role")));
            if ("system".equals(role)) {
                continue;
            }
            String content = firstText(text(map.get("content")), text(map.get("text")));
            if (isBlank(content)) {
                continue;
            }
            result.add(orderedMap(
                    "role", "assistant".equals(role) ? "model" : "user",
                    "parts", List.of(orderedMap("text", content))
            ));
        }
        return result;
    }

    private static List<Object> objectListStatic(Object value) {
        if (value instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        return List.of();
    }

    private static URI chatCompletionsUri(String baseUrl) {
        String base = firstText(baseUrl, defaultBaseUrl("openai"));
        String normalized = trimTrailingSlash(base);
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
        String normalized = trimTrailingSlash(base);
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

    private static URI anthropicMessagesUri(String baseUrl) {
        String normalized = trimTrailingSlash(firstText(baseUrl, defaultBaseUrl("anthropic")));
        if (normalized.endsWith("/v1/messages")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/messages");
        }
        return URI.create(normalized + "/v1/messages");
    }

    private static URI anthropicModelsUri(String baseUrl) {
        String normalized = trimTrailingSlash(firstText(baseUrl, defaultBaseUrl("anthropic")));
        if (normalized.endsWith("/v1/models")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/models");
        }
        return URI.create(normalized + "/v1/models");
    }

    private static URI geminiModelsUri(String baseUrl) {
        String normalized = trimTrailingSlash(firstText(baseUrl, defaultBaseUrl("gemini")));
        if (normalized.endsWith("/v1beta/models")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/models")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1beta")) {
            return URI.create(normalized + "/models");
        }
        return URI.create(normalized + "/v1beta/models");
    }

    private static URI geminiGenerateContentUri(String baseUrl, String model) {
        String normalized = trimTrailingSlash(firstText(baseUrl, defaultBaseUrl("gemini")));
        String normalizedModel = normalizeGeminiModelName(firstText(model, defaultModel("gemini")));
        if (normalized.endsWith(":generateContent")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/models")) {
            return URI.create(normalized + "/" + normalizedModel + ":generateContent");
        }
        if (normalized.contains("/models/") && !normalized.endsWith("/models")) {
            return URI.create(normalized + ":generateContent");
        }
        if (normalized.endsWith("/v1beta")) {
            return URI.create(normalized + "/models/" + normalizedModel + ":generateContent");
        }
        return URI.create(normalized + "/v1beta/models/" + normalizedModel + ":generateContent");
    }

    private static URI validatedProviderUri(URI uri) {
        if (uri == null) {
            throw new LocalizedException("ai.providerEndpointRequired");
        }
        String scheme = text(uri.getScheme()).toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            throw new LocalizedException("ai.providerEndpointHttpRequired");
        }
        String host = text(uri.getHost());
        if (host.isBlank()) {
            throw new LocalizedException("ai.providerEndpointHostRequired");
        }
        if (!allowPrivateProviderEndpoints() && isPrivateProviderHost(host)) {
            throw new LocalizedException("ai.providerEndpointPrivateBlocked", "env", ALLOW_PRIVATE_AI_ENDPOINTS_ENV);
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
            return firstText(text(map.get("message")), text(map.get("type")), text(map.get("status")), "unknown provider error");
        }
        return firstText(text(error), text(payload.get("message")), text(payload.get("detail")), "unknown provider error");
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

    private static String assistantContentFromAnthropic(Map<String, Object> payload) {
        return objectListStatic(payload.get("content")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(item -> {
                    if ("text".equals(text(item.get("type")))) {
                        return text(item.get("text"));
                    }
                    return null;
                })
                .filter(item -> !isBlank(item))
                .reduce("", (left, right) -> left.isEmpty() ? right : left + "\n" + right);
    }

    private static String assistantContentFromGemini(Map<String, Object> payload) {
        return objectListStatic(payload.get("candidates")).stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(candidate -> mapValueStatic(candidate.get("content")))
                .flatMap(content -> objectListStatic(content.get("parts")).stream())
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(part -> text(part.get("text")))
                .filter(item -> !isBlank(item))
                .reduce("", (left, right) -> left.isEmpty() ? right : left + "\n" + right);
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
            throw new LocalizedException("ai.providerSessionIdRequired");
        }
        return sanitized.length() > 96 ? sanitized.substring(0, 96) : sanitized;
    }

    private static boolean supportsOpenAiCompatibleTransport(Map<String, Object> provider) {
        return supportsOpenAiCompatibleTransport(text(provider.get("type")), text(provider.get("apiFormat")));
    }

    static boolean supportsOpenAiCompatibleTransport(String type, String apiFormat) {
        String normalizedType = normalizeType(type);
        String normalizedApiFormat = normalizeApiFormat(firstText(apiFormat, defaultApiFormat(normalizedType)));
        return "openai".equals(normalizedType) || ("custom".equals(normalizedType) && "openai".equals(normalizedApiFormat));
    }

    static boolean supportsProviderTransport(String type, String apiFormat) {
        String normalizedType = normalizeType(type);
        String normalizedApiFormat = normalizeApiFormat(firstText(apiFormat, defaultApiFormat(normalizedType)));
        return "openai".equals(normalizedType)
                || "anthropic".equals(normalizedType)
                || "gemini".equals(normalizedType)
                || ("custom".equals(normalizedType) && "openai".equals(normalizedApiFormat));
    }

    private static String transportCapability(Map<String, Object> provider) {
        return transportCapability(text(provider.get("type")), text(provider.get("apiFormat")));
    }

    private static String transportCapability(String type, String apiFormat) {
        String normalizedType = normalizeType(type);
        return supportsProviderTransport(normalizedType, apiFormat)
                ? transportName(normalizedType, apiFormat)
                : providerApiFormat(normalizedType, apiFormat);
    }

    private static String transportName(Map<String, Object> provider) {
        return transportName(text(provider.get("type")), text(provider.get("apiFormat")));
    }

    private static String transportName(String type, String apiFormat) {
        String normalizedType = normalizeType(type);
        return switch (normalizedType) {
            case "anthropic" -> "anthropic-http";
            case "gemini" -> "gemini-http";
            default -> supportsOpenAiCompatibleTransport(normalizedType, apiFormat) ? "openai-compatible-http" : "java-web-local-state";
        };
    }

    private static String normalizeType(String type) {
        String value = firstText(type, "openai").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "anthropic", "claude" -> "anthropic";
            case "gemini", "google" -> "gemini";
            case "custom" -> "custom";
            case "claude_cli", "claude-cli" -> "claude_cli";
            default -> "openai";
        };
    }

    private static String normalizeApiFormat(String apiFormat) {
        String value = firstText(apiFormat, "openai").toLowerCase(Locale.ROOT).replace('_', '-');
        return switch (value) {
            case "anthropic", "claude" -> "anthropic";
            case "gemini", "google" -> "gemini";
            case "claude-cli" -> "claude-cli";
            case "custom" -> "custom";
            default -> "openai";
        };
    }

    private static String providerApiFormat(String type, String apiFormat) {
        return switch (normalizeType(type)) {
            case "anthropic" -> "anthropic";
            case "gemini" -> "gemini";
            case "claude_cli" -> "claude-cli";
            case "custom" -> normalizeApiFormat(firstText(apiFormat, "openai"));
            default -> "openai";
        };
    }

    private static String defaultApiFormat(String type) {
        return switch (normalizeType(type)) {
            case "anthropic" -> "anthropic";
            case "gemini" -> "gemini";
            case "claude_cli" -> "claude-cli";
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

    private static List<Object> defaultChatMessages(Map<String, Object> input) {
        List<Object> messages = objectListStatic(input == null ? null : input.get("messages"));
        if (!messages.isEmpty()) {
            return messages;
        }
        return List.of(orderedMap("role", "user", "content", firstText(text(input == null ? null : input.get("prompt")), "Hello")));
    }

    private void applyAdditionalHeaders(HttpRequest.Builder builder, Map<String, Object> provider, String... excludedHeaders) {
        Set<String> excluded = Set.of(excludedHeaders);
        mapValue(provider.get("headers")).forEach((key, value) -> {
            String header = text(key);
            String headerValue = text(value);
            if (!header.isBlank() && !headerValue.isBlank() && excluded.stream().noneMatch(item -> item.equalsIgnoreCase(header))) {
                builder.header(header, headerValue);
            }
        });
    }

    private Map<String, Object> parseResponseMap(String body) throws JsonProcessingException {
        return body == null || body.isBlank() ? Map.of() : objectMapper.readValue(body, MAP_TYPE);
    }

    private static Map<String, Object> mapValueStatic(Object value) {
        if (value instanceof Map<?, ?>) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) value;
            return map;
        }
        return Map.of();
    }

    private static String trimTrailingSlash(String value) {
        String text = firstText(value);
        while (text.endsWith("/")) {
            text = text.substring(0, text.length() - 1);
        }
        return text;
    }

    private static String normalizeChatRole(String role) {
        String normalized = firstText(role, "user").toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "assistant", "model" -> "assistant";
            case "system" -> "system";
            case "tool" -> "user";
            default -> "user";
        };
    }

    private static String firstSystemPrompt(List<Object> messages) {
        for (Object raw : messages) {
            if (raw instanceof Map<?, ?> map) {
                String role = text(map.get("role"));
                if ("system".equalsIgnoreCase(firstText(role))) {
                    String content = firstText(text(map.get("content")), text(map.get("text")));
                    if (!isBlank(content)) {
                        return content;
                    }
                }
            }
        }
        return "";
    }

    private static String normalizeGeminiModelName(String model) {
        String normalized = firstText(model, defaultModel("gemini"));
        if (normalized.startsWith("models/")) {
            return normalized.substring("models/".length());
        }
        return normalized;
    }

    private static SqlOperationType sqlOperationType(String sql) {
        String keyword = leadingSqlKeyword(sql);
        if (keyword.isBlank()) {
            return SqlOperationType.OTHER;
        }
        if (Set.of("select", "show", "describe", "desc", "explain", "with", "values", "pragma").contains(keyword)) {
            return SqlOperationType.QUERY;
        }
        if (Set.of("insert", "update", "delete", "merge", "replace", "call").contains(keyword)) {
            return SqlOperationType.DML;
        }
        if (Set.of("create", "alter", "drop", "truncate", "rename", "grant", "revoke").contains(keyword)) {
            return SqlOperationType.DDL;
        }
        return SqlOperationType.OTHER;
    }

    private static String leadingSqlKeyword(String sql) {
        String text = firstText(sql, "").replace("\r\n", "\n");
        int index = 0;
        while (index < text.length()) {
            while (index < text.length() && Character.isWhitespace(text.charAt(index))) {
                index++;
            }
            if (index + 1 < text.length() && text.charAt(index) == '-' && text.charAt(index + 1) == '-') {
                index += 2;
                while (index < text.length() && text.charAt(index) != '\n') {
                    index++;
                }
                continue;
            }
            if (index < text.length() && text.charAt(index) == '#') {
                index++;
                while (index < text.length() && text.charAt(index) != '\n') {
                    index++;
                }
                continue;
            }
            if (index + 1 < text.length() && text.charAt(index) == '/' && text.charAt(index + 1) == '*') {
                int end = text.indexOf("*/", index + 2);
                if (end < 0) {
                    return "";
                }
                index = end + 2;
                continue;
            }
            int start = index;
            while (index < text.length()) {
                char ch = text.charAt(index);
                if (!Character.isLetterOrDigit(ch) && ch != '_') {
                    break;
                }
                index++;
            }
            return start == index ? "" : text.substring(start, index).toLowerCase(Locale.ROOT);
        }
        return "";
    }

    private String sqlSafetyWarning(SqlOperationType operationType, String safetyLevel, boolean allowed, boolean requiresConfirm) {
        if (!allowed) {
            if ("readonly".equals(safetyLevel)) {
                return messages.message("ai.sqlSafety.readOnlyOnly");
            }
            if ("readwrite".equals(safetyLevel) && operationType == SqlOperationType.DDL) {
                return messages.message("ai.sqlSafety.readWriteBlocksDdl");
            }
            return messages.message("ai.sqlSafety.blocked");
        }
        if (requiresConfirm) {
            return operationType == SqlOperationType.DDL
                    ? "This SQL may change database structure; confirm before execution."
                    : "This SQL may modify database state; confirm before execution.";
        }
        return null;
    }

    private enum SqlOperationType {
        QUERY("query"),
        DML("dml"),
        DDL("ddl"),
        OTHER("other");

        private final String apiName;

        SqlOperationType(String apiName) {
            this.apiName = apiName;
        }

        String apiName() {
            return apiName;
        }
    }

    private static String normalizeSafety(String level) {
        String value = firstText(level, "readonly").toLowerCase(Locale.ROOT);
        return switch (value) {
            case "readwrite", "confirm" -> "readwrite";
            case "full", "off", "permissive" -> "full";
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
        String text = text(value);
        if (isBlank(text)) {
            return fallback;
        }
        try {
            return Double.parseDouble(text);
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
