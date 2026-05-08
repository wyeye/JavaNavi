package com.javanavi.driver;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.db.JdbcConnectionFactory;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.security.LocalSessionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DriverCompatibilityServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void networkStatusMeasuresRepositoryLatencyWithHead() throws Exception {
        try (ProbeServer probe = ProbeServer.headOk()) {
            DriverCompatibilityService service = serviceWithRepository(probe.baseUrl());

            Map<String, Object> status = service.networkStatus();
            Map<String, Object> repository = networkCheck(status, "Maven driver repository");

            assertThat(status.get("networkProbeMode")).isEqualTo("http-repository-probe");
            assertThat(status.get("downloadChainReachable")).isEqualTo(true);
            assertThat(repository.get("reachable")).isEqualTo(true);
            assertThat(repository.get("method")).isEqualTo("HEAD");
            assertThat(repository.get("httpStatus")).isEqualTo(200);
            assertThat(((Number) repository.get("httpLatencyMs")).longValue()).isGreaterThan(0L);
            assertThat(repository.get("latencyMs")).isEqualTo(repository.get("httpLatencyMs"));
        }
    }

    @Test
    void networkStatusFallsBackToGetWhenHeadIsNotSupported() throws Exception {
        try (ProbeServer probe = ProbeServer.head405Get200()) {
            DriverCompatibilityService service = serviceWithRepository(probe.baseUrl());

            Map<String, Object> status = service.networkStatus();
            Map<String, Object> repository = networkCheck(status, "Maven driver repository");

            assertThat(status.get("downloadChainReachable")).isEqualTo(true);
            assertThat(repository.get("reachable")).isEqualTo(true);
            assertThat(repository.get("method")).isEqualTo("GET");
            assertThat(repository.get("httpStatus")).isEqualTo(200);
            assertThat(((Number) repository.get("httpLatencyMs")).longValue()).isGreaterThan(0L);
        }
    }

    @Test
    void networkStatusMarksRepositoryAsUnreachableWhenUrlIsInvalid() {
        DriverCompatibilityService service = serviceWithRepository("http://:bad-url");

        Map<String, Object> status = service.networkStatus();
        Map<String, Object> repository = networkCheck(status, "Maven driver repository");

        assertThat(status.get("downloadChainReachable")).isEqualTo(false);
        assertThat(status.get("reachable")).isEqualTo(false);
        assertThat(repository.get("reachable")).isEqualTo(false);
        assertThat(repository.get("error")).isEqualTo("Invalid repository URL");
    }

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
        return serviceWithRepository("https://repo.maven.apache.org/maven2");
    }

    private DriverCompatibilityService serviceWithRepository(String repositoryUrl) {
        I18nMessages messages = new I18nMessages();
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        SecurityProperties securityProperties = new SecurityProperties();
        securityProperties.setDataDirectory(tempDir.toString());
        JdbcDriverRuntimeService runtimeService = new JdbcDriverRuntimeService(securityProperties, objectMapper, messages) {
            @Override
            public Map<String, Object> repositorySettings() {
                return Map.of(
                        "repositoryUrl", repositoryUrl,
                        "configuredRepositoryUrl", repositoryUrl,
                        "repositoryConfigured", true,
                        "defaultRepositoryURL", defaultRepositoryURL(),
                        "defaultRepositoryUrl", defaultRepositoryURL()
                );
            }
        };
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

    @SuppressWarnings("unchecked")
    private static Map<String, Object> networkCheck(Map<String, Object> status, String name) {
        return ((List<Map<String, Object>>) status.get("checks")).stream()
                .filter(item -> name.equals(item.get("name")))
                .findFirst()
                .orElseThrow();
    }

    private static final class ProbeServer implements AutoCloseable {
        private final HttpServer server;

        private ProbeServer(HttpServer server) {
            this.server = server;
        }

        static ProbeServer headOk() throws IOException {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                if ("HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
                    sendNoBody(exchange, 200);
                    return;
                }
                sendText(exchange, 200, "ok");
            });
            server.start();
            return new ProbeServer(server);
        }

        static ProbeServer head405Get200() throws IOException {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                if ("HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
                    sendNoBody(exchange, 405);
                    return;
                }
                sendText(exchange, 200, "ok");
            });
            server.start();
            return new ProbeServer(server);
        }

        String baseUrl() {
            return "http://127.0.0.1:" + server.getAddress().getPort();
        }

        @Override
        public void close() {
            server.stop(0);
        }

        private static void sendNoBody(HttpExchange exchange, int status) throws IOException {
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
        }

        private static void sendText(HttpExchange exchange, int status, String body) throws IOException {
            byte[] bytes = body.getBytes();
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(bytes);
            } finally {
                exchange.close();
            }
        }
    }
}
