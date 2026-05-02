package com.javanavi.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.security.LocalSessionService;
import com.javanavi.security.SecretStore;
import com.javanavi.security.SecretStoreStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;

class AiCompatibilityServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void builtinPromptsMatchGoNaviPromptSetWithJavaNaviBranding() {
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
