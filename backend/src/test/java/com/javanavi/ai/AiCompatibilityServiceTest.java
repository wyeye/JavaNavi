package com.javanavi.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.AppLanguage;
import com.javanavi.i18n.I18nContext;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.security.LocalSessionService;
import com.javanavi.security.SecretStore;
import com.javanavi.security.SecretStoreStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;

class AiCompatibilityServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void builtinPromptsMatchGoNaviPromptSetWithJavaNaviBranding() {
        I18nContext.set(AppLanguage.ZH);
        Map<String, String> prompts = service().builtinPrompts();

        assertThat(prompts.keySet()).containsExactly(
                "通用聊天助手",
                "SQL 生成器",
                "SQL 解析器",
                "SQL 优化器",
                "数据洞察分析",
                "表结构审查"
        );
        assertThat(prompts).hasSize(6);
        assertThat(prompts.values())
                .allSatisfy(prompt -> {
                    assertThat(prompt).doesNotContain("GoNavi AI 助手");
                    assertThat(prompt).isNotBlank();
                });

        assertThat(prompts.get("通用聊天助手"))
                .contains("JavaNavi AI 助手")
                .contains("数据库/缓存客户端（JavaNavi）")
                .contains("零容忍的生产红线")
                .contains("没有 WHERE 条件");
        assertThat(prompts.get("SQL 生成器"))
                .contains("markdown 代码块")
                .contains("DELETE/UPDATE")
                .contains("LIMIT 100")
                .contains("Redis 命令");
        assertThat(prompts.get("SQL 解析器"))
                .contains("FROM -> JOIN -> WHERE -> GROUP BY -> SELECT -> ORDER BY");
        assertThat(prompts.get("SQL 优化器"))
                .contains("CREATE INDEX")
                .contains("最左前缀匹配");
        assertThat(prompts.get("数据洞察分析"))
                .contains("趋势与异动")
                .contains("极简研报");
        assertThat(prompts.get("表结构审查"))
                .contains("反三范式")
                .contains("ALTER TABLE");
    }

    @Test
    void builtinPromptTitlesFollowRequestLanguage() {
        I18nContext.set(AppLanguage.EN);
        Map<String, String> prompts = service().builtinPrompts();

        assertThat(prompts.keySet()).containsExactly(
                "General Chat Assistant",
                "SQL Generator",
                "SQL Explainer",
                "SQL Optimizer",
                "Data Insight Analysis",
                "Schema Review"
        );
        assertThat(prompts.values())
                .allSatisfy(prompt -> {
                    assertThat(prompt).contains("JavaNavi AI assistant");
                    assertThat(prompt).doesNotContainPattern("[\\u4e00-\\u9fff]");
                    assertThat(prompt).doesNotContain("你是");
                    assertThat(prompt).doesNotContain("中文");
                });
        assertThat(prompts.get("General Chat Assistant"))
                .contains("database/cache client (JavaNavi)")
                .contains("production red lines")
                .contains("WHERE clause");
        assertThat(prompts.get("SQL Generator"))
                .contains("Redis commands")
                .contains("LIMIT 100");
        assertThat(prompts.get("SQL Explainer"))
                .contains("FROM -> JOIN -> WHERE -> GROUP BY -> SELECT -> ORDER BY");
        assertThat(prompts.get("SQL Optimizer"))
                .contains("CREATE INDEX");
        assertThat(prompts.get("Data Insight Analysis"))
                .contains("Trends and anomalies")
                .contains("compact report style");
        assertThat(prompts.get("Schema Review"))
                .contains("anti-third-normal-form")
                .contains("ALTER TABLE");
    }

    @Test
    void extractsDistinctModelIdsFromOpenAiCompatibleModelsPayload() {
        List<String> models = AiCompatibilityService.openAiCompatibleModelIds(Map.of(
                "object", "list",
                "data", List.of(
                        Map.of("id", "gpt-5.5", "object", "model"),
                        Map.of("id", "gpt-5.5", "object", "model"),
                        Map.of("name", "fallback-name"),
                        "string-model",
                        Map.of("id", "")
                )
        ));

        assertThat(models).containsExactly("gpt-5.5");
    }

    @Test
    void ignoresAlternateModelsArrayPayloadForOpenAiCompatibleDiscovery() {
        List<String> models = AiCompatibilityService.openAiCompatibleModelIds(Map.of(
                "models", List.of(
                        Map.of("model", "provider-model-a"),
                        Map.of("id", "provider-model-b")
                )
        ));

        assertThat(models).isEmpty();
    }

    @Test
    void openAiCompatibleTransportSupportIsLimitedToOpenAiFormat() {
        assertThat(AiCompatibilityService.supportsOpenAiCompatibleTransport("openai", null)).isTrue();
        assertThat(AiCompatibilityService.supportsOpenAiCompatibleTransport("custom", "openai")).isTrue();
        assertThat(AiCompatibilityService.supportsOpenAiCompatibleTransport("anthropic", "openai")).isFalse();
        assertThat(AiCompatibilityService.supportsOpenAiCompatibleTransport("gemini", "openai")).isFalse();
        assertThat(AiCompatibilityService.supportsOpenAiCompatibleTransport("anthropic", null)).isFalse();
        assertThat(AiCompatibilityService.supportsOpenAiCompatibleTransport("gemini", null)).isFalse();
        assertThat(AiCompatibilityService.supportsOpenAiCompatibleTransport("custom", "anthropic")).isFalse();
        assertThat(AiCompatibilityService.supportsOpenAiCompatibleTransport("custom", "claude-cli")).isFalse();
    }

    @Test
    void providerTransportSupportIncludesAnthropicAndGemini() {
        assertThat(AiCompatibilityService.supportsProviderTransport("openai", null)).isTrue();
        assertThat(AiCompatibilityService.supportsProviderTransport("anthropic", null)).isTrue();
        assertThat(AiCompatibilityService.supportsProviderTransport("gemini", null)).isTrue();
        assertThat(AiCompatibilityService.supportsProviderTransport("custom", "openai")).isTrue();
        assertThat(AiCompatibilityService.supportsProviderTransport("custom", "anthropic")).isFalse();
    }

    @Test
    void transportTestDoesNotRequirePreselectedModelBeforeCredentialValidation() {
        Map<String, Object> result = service().testProvider(Map.of(
                "type", "openai",
                "baseUrl", "https://example.test/v1",
                "transportEnabled", true
        ));

        assertThat(result.get("success")).isEqualTo(false);
        assertThat(result.get("message")).isEqualTo("AI provider API key is required or must already be stored.");
        assertThat(result.get("networkTested")).isEqualTo(false);
    }

    @Test
    void transportTestWithApiKeyAttemptsNetworkWhenModelIsBlank() {
        Map<String, Object> result = service().testProvider(Map.of(
                "type", "openai",
                "baseUrl", "https://model-fetch.invalid/v1",
                "apiKey", "test-secret",
                "transportEnabled", true
        ));

        assertThat(result.get("success")).isEqualTo(false);
        assertThat(result.get("message")).asString().startsWith("AI provider transport test failed:");
        assertThat(result.get("message")).asString().doesNotContain("test-secret");
        assertThat(result.get("networkTested")).isEqualTo(true);
        assertThat(result).doesNotContainKey("apiKey");
    }

    @Test
    void transportTestAttemptsNetworkForAnthropicProvider() {
        Map<String, Object> result = service().testProvider(Map.of(
                "type", "anthropic",
                "baseUrl", "https://example.invalid/anthropic",
                "model", "claude-3-5-sonnet-latest",
                "apiKey", "test-secret",
                "transportEnabled", true
        ));

        assertThat(result.get("success")).isEqualTo(false);
        assertThat(result.get("networkTested")).isEqualTo(true);
        assertThat(result.get("transportEnabled")).isEqualTo(true);
        assertThat(result.get("transportRequested")).isEqualTo(true);
        assertThat(result.get("transportCapability")).isEqualTo("anthropic-http");
        assertThat(result.get("modelDiscoverySupported")).isEqualTo(true);
        assertThat(result.get("modelsFetched")).isEqualTo(false);
        assertThat(result.get("message")).asString().startsWith("AI provider transport test failed:");
    }

    @Test
    void transportTestAttemptsNetworkForGeminiProviderEvenWhenModelBlank() {
        Map<String, Object> result = service().testProvider(Map.of(
                "type", "gemini",
                "baseUrl", "https://example.invalid/gemini",
                "apiKey", "test-secret",
                "transportEnabled", true
        ));

        assertThat(result.get("success")).isEqualTo(false);
        assertThat(result.get("message")).asString().startsWith("AI provider transport test failed:");
        assertThat(result.get("networkTested")).isEqualTo(true);
        assertThat(result.get("transportEnabled")).isEqualTo(true);
        assertThat(result.get("transportCapability")).isEqualTo("gemini-http");
        assertThat(result.get("modelDiscoverySupported")).isEqualTo(true);
        assertThat(result.get("modelsFetched")).isEqualTo(false);
    }

    @Test
    void saveProviderKeepsAnthropicTransportEnabledFlag() {
        Map<String, Object> saved = service().saveProvider(Map.of(
                "id", "anthropic-save-guard",
                "type", "anthropic",
                "name", "Anthropic Save Guard",
                "baseUrl", "https://example.invalid/anthropic",
                "model", "claude-3-5-sonnet-latest",
                "apiFormat", "openai",
                "apiKey", "test-secret",
                "transportEnabled", true
        ));

        assertThat(saved.get("transportEnabled")).isEqualTo(true);
        assertThat(saved.get("apiFormat")).isEqualTo("anthropic");
    }

    @Test
    void chatSendUsesAnthropicTransportForStaleProviderState() throws Exception {
        AiCompatibilityService service = service();
        new ObjectMapper().writeValue(tempDir.resolve("ai-state.json").toFile(), Map.of(
                "providers", List.of(Map.of(
                        "id", "stale-unsupported",
                        "type", "anthropic",
                        "name", "Stale Unsupported",
                        "baseUrl", "https://example.invalid/anthropic",
                        "model", "claude-3-5-sonnet-latest",
                        "apiFormat", "anthropic",
                        "headers", Map.of(),
                        "transportEnabled", true,
                        "maxTokens", 4096,
                        "temperature", 0.2
                )),
                "activeProvider", "stale-unsupported",
                "safetyLevel", "readonly",
                "contextLevel", "schema_only",
                "sessions", Map.of()
        ));

        Map<String, Object> response = service.chatSend(Map.of(
                "messages", List.of(Map.of("role", "user", "content", "hello"))
        ));

        assertThat(response.get("transport")).isEqualTo("anthropic-http");
        assertThat(response.get("transportError")).isEqualTo(true);
        assertThat(response.get("content")).asString().startsWith("JavaNavi AI provider transport failed:");
    }

    @Test
    void chatSendWithoutTransportEnabledStillReturnsDisabledTransportHint() {
        AiCompatibilityService service = service();
        service.saveProvider(Map.of(
                "id", "anthropic-manual",
                "type", "anthropic",
                "name", "Anthropic Manual",
                "baseUrl", "https://example.invalid/anthropic",
                "model", "claude-3-5-sonnet-latest",
                "apiKey", "test-secret"
        ));

        Map<String, Object> response = service.chatSend(Map.of(
                "messages", List.of(Map.of("role", "user", "content", "hello"))
        ));

        assertThat(response.get("transport")).isEqualTo("java-web-local-state");
        assertThat(response.get("transportCapability")).isEqualTo("anthropic-http");
        assertThat(response.get("content")).asString()
                .contains("enable transportEnabled");
    }

    @Test
    void explicitProviderSecretClearRemovesStoredSecret() {
        AiCompatibilityService service = service();
        Map<String, Object> saved = service.saveProvider(Map.of(
                "id", "provider-clear-test",
                "type", "openai",
                "name", "Clear Test",
                "baseUrl", "https://example.test/v1",
                "model", "gpt-5.5",
                "apiKey", "test-secret",
                "transportEnabled", true
        ));
        assertThat(saved.get("hasSecret")).isEqualTo(true);

        Map<String, Object> cleared = service.saveProvider(Map.of(
                "id", "provider-clear-test",
                "type", "openai",
                "name", "Clear Test",
                "baseUrl", "https://example.test/v1",
                "model", "gpt-5.5",
                "clearApiKey", true,
                "transportEnabled", true
        ));

        assertThat(cleared.get("hasSecret")).isEqualTo(false);
        assertThat(service.getProviders().get(0).get("hasSecret")).isEqualTo(false);
    }

    private AiCompatibilityService service() {
        SecurityProperties properties = new SecurityProperties();
        properties.setDataDirectory(tempDir.toString());
        return new AiCompatibilityService(
                properties,
                new ObjectMapper().findAndRegisterModules(),
                new MemorySecretStore(),
                new CompatEventPublisher(new LocalSessionService()),
                new I18nMessages()
        );
    }

    private static final class MemorySecretStore implements SecretStore {
        private final Map<String, String> secrets = new ConcurrentHashMap<>();

        @Override
        public SecretStoreStatus status() {
            return new SecretStoreStatus(true, "memory", "memory", true);
        }

        @Override
        public void put(String key, String secret) {
            secrets.put(key, secret);
        }

        @Override
        public Optional<String> get(String key) {
            return Optional.ofNullable(secrets.get(key));
        }

        @Override
        public void delete(String key) {
            secrets.remove(key);
        }
    }
}
