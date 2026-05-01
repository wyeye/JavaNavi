package com.javanavi.db;

import com.javanavi.JavaNaviApplication;
import com.javanavi.driver.JdbcDriverRuntimeService;
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

    private static Object injectedField(Object target, String fieldName) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        return field.get(target);
    }
}
