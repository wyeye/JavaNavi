package com.javanavi.driver;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.db.JdbcConnectionFactory;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.security.LocalSessionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DriverCompatibilityServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void defaultDriverOptionsStayScopedToTheDatasourceType() {
        DriverCompatibilityService service = service();

        Map<String, Object> status = service.statusList("", "");
        Map<String, Object> mysql = driverRow(status, "mysql");
        Map<String, Object> mariadb = driverRow(status, "mariadb");
        Map<String, Object> postgres = driverRow(status, "postgres");

        assertThat(driverOptionTypes(mysql)).containsExactly("mysql");
        assertThat(driverOptionTypes(mariadb)).containsExactly("mariadb");
        assertThat(driverOptionTypes(postgres)).containsExactly("postgres");
        assertThat((Boolean) firstDriverOption(mariadb).get("reusedRuntime")).isTrue();
        assertThat(mysql.get("defaultDriverType")).isEqualTo("mysql");
        assertThat(mariadb.get("defaultDriverType")).isEqualTo("mariadb");
    }

    @Test
    void rejectsCrossDatasourceDefaultDrivers() {
        DriverCompatibilityService service = service();

        assertThatThrownBy(() -> service.configureDefaultDriver("mysql", "postgres", ""))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("PostgreSQL")
                .hasMessageContaining("MySQL");
        assertThatThrownBy(() -> service.configureDefaultDriver("mysql", "mariadb", ""))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("MariaDB")
                .hasMessageContaining("MySQL");
    }

    @Test
    void acceptsSameDatasourceDefaultDriver() {
        DriverCompatibilityService service = service();

        Map<String, Object> mysql = service.configureDefaultDriver("mysql", "mysql", "");
        Map<String, Object> mariadb = service.configureDefaultDriver("mariadb", "mariadb", "");

        assertThat(mysql.get("defaultDriverType")).isEqualTo("mysql");
        assertThat(mariadb.get("defaultDriverType")).isEqualTo("mariadb");
    }

    @Test
    void connectionFactoryIgnoresCrossDatasourceDriverSelection() {
        JdbcConnectionFactory factory = new JdbcConnectionFactory();
        ConnectionConfigDto mysqlConfigWithPostgresSelection = new ConnectionConfigDto(
                "mysql-1",
                "MySQL",
                "mysql",
                "postgres",
                "127.0.0.1",
                3306,
                "demo",
                "user",
                "password",
                Map.of(),
                30,
                null,
                null,
                null,
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );

        assertThat(factory.normalizeDriver(mysqlConfigWithPostgresSelection)).isEqualTo("mysql");
        assertThat(factory.jdbcUrl(mysqlConfigWithPostgresSelection)).startsWith("jdbc:mysql://");
    }

    private DriverCompatibilityService service() {
        I18nMessages messages = new I18nMessages();
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        SecurityProperties securityProperties = new SecurityProperties();
        securityProperties.setDataDirectory(tempDir.toString());
        JdbcDriverRuntimeService runtimeService = new JdbcDriverRuntimeService(securityProperties, objectMapper, messages);
        return new DriverCompatibilityService(
                securityProperties,
                objectMapper,
                new CompatEventPublisher(new LocalSessionService()),
                new CompatEventFixtures(messages),
                runtimeService,
                messages
        );
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> driverRow(Map<String, Object> status, String type) {
        return ((List<Map<String, Object>>) status.get("drivers")).stream()
                .filter(row -> type.equals(row.get("type")))
                .findFirst()
                .orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static List<String> driverOptionTypes(Map<String, Object> row) {
        return ((List<Map<String, Object>>) row.get("driverOptions")).stream()
                .map(option -> String.valueOf(option.get("driverType")))
                .toList();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> firstDriverOption(Map<String, Object> row) {
        return ((List<Map<String, Object>>) row.get("driverOptions")).get(0);
    }
}
