package com.javanavi.db;

import com.javanavi.JavaNaviApplication;
import com.javanavi.driver.JdbcDriverRuntimeService;
import com.javanavi.i18n.AppLanguage;
import com.javanavi.i18n.I18nContext;
import com.javanavi.i18n.I18nMessages;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;

import java.lang.reflect.Field;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JdbcConnectionFactorySpringInjectionTest {
    @TempDir
    Path tempDir;

    @Test
    void springUsesConstructorWithJdbcDriverRuntimeService() throws Exception {
        Map<String, Object> properties = new HashMap<>();
        properties.put("javanavi.security.data-directory", tempDir.toString());
        properties.put("server.port", "0");
        properties.put("spring.main.web-application-type", "none");

        SpringApplication application = new SpringApplication(JavaNaviApplication.class);
        application.setDefaultProperties(properties);

        try (ConfigurableApplicationContext context = application.run()) {
            JdbcConnectionFactory factory = context.getBean(JdbcConnectionFactory.class);
            JdbcDriverRuntimeService runtimeService = context.getBean(JdbcDriverRuntimeService.class);
            I18nMessages messages = context.getBean(I18nMessages.class);

            assertThat(injectedField(factory, "driverRuntimeService")).isSameAs(runtimeService);
            assertThat(injectedField(factory, "messages")).isSameAs(messages);
        }
    }

    @Test
    void noArgVerificationFactoryUsesLocalizedRuntimeUnavailableMessage() {
        I18nContext.set(AppLanguage.ZH);
        try {
            JdbcConnectionFactory factory = new JdbcConnectionFactory();
            assertThatThrownBy(() -> factory.prepareDriver(null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("JavaNavi 当前支持内置关系型");
        } finally {
            I18nContext.clear();
        }

        I18nContext.set(AppLanguage.ZH);
        try {
            JdbcConnectionFactory factory = new JdbcConnectionFactory();
            assertThatThrownBy(() -> factory.prepareDriver(new com.javanavi.model.ConnectionConfigDto(
                    "mysql-1",
                    "MySQL",
                    "mysql",
                    "127.0.0.1",
                    3306,
                    "demo",
                    "user",
                    "password",
                    null
            )))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("JDBC 驱动运行时服务在当前验证上下文中不可用。");
        } finally {
            I18nContext.clear();
        }
    }

    private static Object injectedField(Object target, String fieldName) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        return field.get(target);
    }
}
