package com.javanavi.i18n;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class I18nMessagesTest {
    private static final String CUSTOM_DEFINITION_USABLE_EN =
            "Custom JDBC definition is usable. DSN-level connection is not tested yet.";
    private static final String CUSTOM_DEFINITION_USABLE_ZH = "自定义 JDBC 定义可用；尚未测试 DSN 级连接。";

    private final I18nMessages messages = new I18nMessages();

    @Test
    void localizesCustomJdbcDefinitionStatuses() {
        Map<String, String[]> expected = new LinkedHashMap<>();
        expected.put("drivers.customDefinitionUsable", new String[]{
                CUSTOM_DEFINITION_USABLE_EN,
                CUSTOM_DEFINITION_USABLE_ZH
        });
        expected.put("drivers.customDefinitionRepairRequired", new String[]{
                "Custom JDBC definition requires repair.",
                "自定义 JDBC 定义需要修复。"
        });
        expected.put("drivers.customDefinitionMetadataMissing", new String[]{
                "Re-upload this custom JDBC Jar so JavaNavi can recreate driver metadata.",
                "请重新上传此自定义 JDBC Jar，以便 JavaNavi 重新生成驱动元数据。"
        });
        expected.put("drivers.customDefinitionJarMissing", new String[]{
                "The managed Jar files are missing. Upload the custom driver package again.",
                "受管 Jar 文件缺失，请重新上传自定义驱动包。"
        });
        expected.put("drivers.customDefinitionClassMissing", new String[]{
                "No driver class is recorded. Upload a Jar that exposes java.sql.Driver via service metadata.",
                "未记录驱动类，请上传通过服务元数据暴露 java.sql.Driver 的 Jar。"
        });
        expected.put("drivers.customDefinitionClassLoadFailed", new String[]{
                "The JDBC driver class could not be loaded. Include required dependency Jars and re-upload.",
                "无法加载 JDBC 驱动类，请包含所需依赖 Jar 后重新上传。"
        });

        expected.forEach((code, localized) -> {
            assertThat(messages.message(AppLanguage.EN, code)).isEqualTo(localized[0]);
            assertThat(messages.message(AppLanguage.ZH, code)).isEqualTo(localized[1]);
        });
    }

    @Test
    void localizesCustomJdbcDefinitionFallbackStatuses() {
        I18nContext.set(AppLanguage.ZH);
        try {
            assertThat(messages.localizeFallback(CUSTOM_DEFINITION_USABLE_EN))
                    .isEqualTo(CUSTOM_DEFINITION_USABLE_ZH);
            assertThat(messages.localizeFallback("Custom JDBC definition requires repair."))
                    .isEqualTo("自定义 JDBC 定义需要修复。");
            assertThat(messages.localizeFallback("The managed Jar files are missing. Upload the custom driver package again."))
                    .isEqualTo("受管 Jar 文件缺失，请重新上传自定义驱动包。");
        } finally {
            I18nContext.clear();
        }
    }
    @Test
    void localizesJdbcConnectionFactoryErrors() {
        assertThat(messages.message(AppLanguage.EN, "connection.customDsnRequired"))
                .isEqualTo("Custom JDBC connection string is required.");
        assertThat(messages.message(AppLanguage.ZH, "connection.customDsnRequired"))
                .isEqualTo("自定义 JDBC 连接字符串不能为空。");
        assertThat(messages.message(AppLanguage.EN, "connection.customDsnJdbcUrlRequired", "driver", "example"))
                .isEqualTo("Custom JDBC connection string must be a jdbc: URL for driver example.");
        assertThat(messages.message(AppLanguage.ZH, "connection.customDsnJdbcUrlRequired", "driver", "example"))
                .isEqualTo("自定义 JDBC 连接字符串必须是驱动 example 的 jdbc: URL。");
        assertThat(messages.message(AppLanguage.EN, "connection.externalFieldRequired", "field", "host"))
                .isEqualTo("Connection host is required for external JDBC drivers.");
        assertThat(messages.message(AppLanguage.ZH, "connection.externalFieldRequired", "field", "host"))
                .isEqualTo("外部 JDBC 驱动连接字段 host 不能为空。");
    }

}
