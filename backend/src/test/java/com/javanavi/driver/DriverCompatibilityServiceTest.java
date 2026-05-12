package com.javanavi.driver;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.javanavi.app.GlobalProxyConfigProvider;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.AppLanguage;
import com.javanavi.i18n.I18nContext;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.db.JdbcConnectionFactory;
import com.javanavi.db.JdbcConnectionPoolRegistry;
import com.javanavi.db.ProxySocketFactory;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.security.LocalSessionService;
import org.assertj.core.api.InstanceOfAssertFactories;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.lang.reflect.Method;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Properties;

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
    void networkStatusReportsConfiguredGlobalProxy() {
        DriverCompatibilityService service = serviceWithRepository(
                "https://repo.maven.apache.org/maven2",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "127.0.0.1", 1080, "proxy-user", "secret")
        );

        Map<String, Object> status = service.networkStatus();

        assertThat(status.get("proxyConfigured")).isEqualTo(true);
        assertThat(status.get("recommendedProxy")).isEqualTo(false);
        assertThat(status.get("proxyEnv"))
                .isInstanceOf(Map.class)
                .asInstanceOf(InstanceOfAssertFactories.map(String.class, String.class))
                .containsEntry("scope", "global")
                .containsEntry("type", "socks5")
                .containsEntry("host", "127.0.0.1")
                .containsEntry("port", "1080")
                .doesNotContainKey("password");
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
    void networkStatusLocalizesRepositoryErrorsInChinese() {
        DriverCompatibilityService service = serviceWithRepository("http://:bad-url");
        I18nContext.set(AppLanguage.ZH);
        try {
            Map<String, Object> status = service.networkStatus();
            Map<String, Object> repository = networkCheck(status, "Maven driver repository");

            assertThat(repository.get("error")).isEqualTo("Maven 源地址无效");
        } finally {
            I18nContext.clear();
        }
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
    void rejectsSameDatasourceDefaultDriverWhenManagedRuntimeIsMissing() {
        DriverCompatibilityService service = service();

        assertThatThrownBy(() -> service.configureDefaultDriver("mysql", "mysql", ""))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("available compatible driver");
    }

    @Test
    void acceptsSameDatasourceDefaultDriverWhenRuntimeIsAvailable() {
        DriverCompatibilityService service = service();

        Map<String, Object> redis = service.configureDefaultDriver("redis", "redis", "");
        Map<String, Object> mongodb = service.configureDefaultDriver("mongodb", "mongodb", "");

        assertThat(redis.get("defaultDriverType")).isEqualTo("redis");
        assertThat(mongodb.get("defaultDriverType")).isEqualTo("mongodb");
    }

    @Test
    void managedJdbcDriversAreNotBuiltInByDefault() {
        DriverCompatibilityService service = service();

        Map<String, Object> status = service.statusList("", "");
        Map<String, Object> mysql = driverRow(status, "mysql");

        assertThat(mysql.get("builtIn")).isEqualTo(false);
        assertThat(mysql.get("managedDownload")).isEqualTo(true);
        assertThat(mysql.get("downloadRequired")).isEqualTo(true);
        assertThat(mysql.get("runtimeAvailable")).isEqualTo(false);
        assertThat(mysql.get("connectable")).isEqualTo(false);
    }

    @Test
    void reusedManagedDriversWaitForOwnerRuntimeByDefault() {
        DriverCompatibilityService service = service();

        Map<String, Object> status = service.statusList("", "");
        Map<String, Object> mariadb = driverRow(status, "mariadb");

        assertThat(mariadb.get("builtIn")).isEqualTo(false);
        assertThat(mariadb.get("reusedDriverType")).isEqualTo("mysql");
        assertThat(mariadb.get("downloadRequired")).isEqualTo(false);
        assertThat(mariadb.get("runtimeAvailable")).isEqualTo(false);
        assertThat(mariadb.get("connectable")).isEqualTo(false);
    }

    @Test
    void builtinNonJdbcRuntimeStaysAvailableByDefault() {
        DriverCompatibilityService service = service();

        Map<String, Object> status = service.statusList("", "");
        Map<String, Object> redis = driverRow(status, "redis");

        assertThat(redis.get("builtIn")).isEqualTo(true);
        assertThat(redis.get("runtimeAvailable")).isEqualTo(true);
        assertThat(redis.get("connectable")).isEqualTo(true);
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


    @Test
    void jdbcConnectionFactoryMapsSslModesToDriverProperties() {
        JdbcConnectionFactory factory = new JdbcConnectionFactory();

        ConnectionConfigDto mysql = jdbcConfig("mysql", 3306, true, "required", null, null, null, null);
        assertThat(factory.jdbcUrl(mysql)).doesNotContain("useSSL=false");
        assertThat(factory.connectionProperties(mysql))
                .containsEntry("sslMode", "VERIFY_IDENTITY")
                .containsEntry("useSSL", "true")
                .containsEntry("requireSSL", "true");

        ConnectionConfigDto mysqlSkipVerify = jdbcConfig("mysql", 3306, true, "skip-verify", null, null, null, null);
        assertThat(factory.connectionProperties(mysqlSkipVerify))
                .containsEntry("sslMode", "REQUIRED")
                .containsEntry("verifyServerCertificate", "false");

        assertThat(factory.connectionProperties(jdbcConfig("postgresql", 5432, true, "preferred", null, null, null, null)))
                .containsEntry("sslmode", "prefer");
        assertThat(factory.connectionProperties(jdbcConfig("postgresql", 5432, true, "skip-verify", null, null, null, null)))
                .containsEntry("sslmode", "require")
                .containsEntry("sslfactory", "org.postgresql.ssl.NonValidatingFactory");

        assertThat(factory.jdbcUrl(jdbcConfig("sqlserver", 1433, true, "required", null, null, null, null)))
                .contains("encrypt=true")
                .contains("trustServerCertificate=false");
        assertThat(factory.jdbcUrl(jdbcConfig("sqlserver", 1433, true, "skip-verify", null, null, null, null)))
                .contains("encrypt=true")
                .contains("trustServerCertificate=true");

        assertThat(factory.connectionProperties(jdbcConfig("clickhouse", 8123, true, "skip-verify", null, null, null, null)))
                .containsEntry("ssl", "true")
                .containsEntry("sslmode", "none");

        ConnectionConfigDto dameng = jdbcConfig("dameng", 5236, true, "required", null, null, "/tmp/client.crt", "/tmp/client.key");
        assertThat(factory.connectionProperties(dameng))
                .containsEntry("sslMode", "required")
                .containsEntry("sslFilesPath", "/tmp/client.crt")
                .containsEntry("sslKeyPath", "/tmp/client.key");

        ConnectionConfigDto damengRootFields = jdbcConfigWithRootSslFiles("dameng", 5236, true, "required", "/tmp/root-client.crt", "/tmp/root-client.key");
        assertThat(factory.connectionProperties(damengRootFields))
                .containsEntry("sslFilesPath", "/tmp/root-client.crt")
                .containsEntry("sslKeyPath", "/tmp/root-client.key");
    }

    @Test
    void globalProxyAppliesOnlyWhenConnectionHasNoProxyOrTunnel() {
        JdbcConnectionFactory factory = new JdbcConnectionFactory();
        ConnectionConfigDto globalOnly = jdbcConfig("postgresql", 5432, false, "disable", null, null, null, null)
                .withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global.proxy", 8080, "global-user", "global-secret"));

        assertThat(factory.connectionProperties(globalOnly))
                .containsEntry("socketFactory", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("javanavi.proxy.type", "http")
                .containsEntry("javanavi.proxy.host", "global.proxy")
                .containsEntry("javanavi.proxy.port", "8080")
                .containsEntry("javanavi.proxy.user", "global-user");

        ConnectionConfigDto connectionProxy = jdbcConfig("postgresql", 5432, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "connection.proxy", 1080, null, null),
                null,
                null,
                null).withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global.proxy", 8080, null, null));

        assertThat(factory.connectionProperties(connectionProxy))
                .containsEntry("javanavi.proxy.type", "socks5")
                .containsEntry("javanavi.proxy.host", "connection.proxy")
                .containsEntry("javanavi.proxy.port", "1080");

        ConnectionConfigDto httpTunnel = jdbcConfig("postgresql", 5432, false, "disable",
                null,
                new ConnectionConfigDto.NetworkHttpTunnelConfigDto("connection.tunnel", 18080, null, null),
                null,
                null).withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global.proxy", 8080, null, null));

        assertThat(factory.connectionProperties(httpTunnel))
                .containsEntry("javanavi.proxy.type", "http-connect")
                .containsEntry("javanavi.proxy.host", "connection.tunnel")
                .containsEntry("javanavi.proxy.port", "18080");

        ConnectionConfigDto ssh = new ConnectionConfigDto(
                "postgres-ssh", "Postgres SSH", "postgresql", null, "db.local", 5432, "demo", "user", "password", Map.of(), 30,
                false, "disable", true,
                new ConnectionConfigDto.NetworkCredentialConfigDto("ssh.local", 22, "ssh-user", "ssh-secret", null),
                null,
                false, null, false, null,
                null, null, List.of(), null, null, null, null, null, null, null, null
        ).withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global.proxy", 8080, null, null));

        assertThat(factory.connectionProperties(ssh)).doesNotContainKey("javanavi.proxy.host");
    }

    @Test
    void jdbcNetworkProxyAndHttpTunnelValidateForJdbcWithoutGenericRejection() {
        JdbcConnectionFactory factory = new JdbcConnectionFactory();

        ConnectionConfigDto proxy = jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, "proxy-user", "secret"),
                null,
                null,
                null);
        factory.connectionProperties(proxy);

        ConnectionConfigDto httpTunnel = jdbcConfig("postgresql", 5432, false, "disable",
                null,
                new ConnectionConfigDto.NetworkHttpTunnelConfigDto("tunnel.local", 8080, "tunnel-user", "secret"),
                null,
                null);
        factory.connectionProperties(httpTunnel);

        ConnectionConfigDto invalidProxy = jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", " ", 1080, null, null),
                null,
                null,
                null);
        assertThatThrownBy(() -> factory.connectionProperties(invalidProxy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Proxy host is required");

        ConnectionConfigDto both = new ConnectionConfigDto(
                "mysql-1", "MySQL", "mysql", null, "db.local", 3306, "demo", "user", "password", Map.of(), 30,
                false, "disable", false, null, null, true,
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, null, null),
                true,
                new ConnectionConfigDto.NetworkHttpTunnelConfigDto("tunnel.local", 8080, null, null),
                null, null, List.of(), null, null, null, null, null, null, null, null
        );
        assertThatThrownBy(() -> factory.connectionProperties(both))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("mutually exclusive");
    }

    @Test
    void jdbcConnectionFactoryAddsDriverProxyProperties() {
        JdbcConnectionFactory factory = new JdbcConnectionFactory();

        Properties mysql = factory.connectionProperties(jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, "proxy-user", "secret"),
                null,
                null,
                null));
        assertThat(mysql)
                .containsEntry("socketFactory", "com.mysql.cj.protocol.SocksProxySocketFactory")
                .containsEntry("socksProxyHost", "proxy.local")
                .containsEntry("socksProxyPort", "1080")
                .containsEntry("socksProxyRemoteDns", "true")
                .containsEntry("javanavi.proxy.type", "socks5")
                .containsEntry("javanavi.proxy.host", "proxy.local")
                .containsEntry("javanavi.proxy.port", "1080");

        Properties postgres = factory.connectionProperties(jdbcConfig("postgresql", 5432, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, null, null),
                null,
                null,
                null));
        assertThat(postgres)
                .containsEntry("socketFactory", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("javanavi.proxy.host", "proxy.local");

        Properties sqlserver = factory.connectionProperties(jdbcConfig("sqlserver", 1433, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "proxy.local", 8080, null, null),
                null,
                null,
                null));
        assertThat(sqlserver)
                .containsEntry("socketFactoryClass", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("javanavi.proxy.type", "http");

        Properties clickhouse = factory.connectionProperties(jdbcConfig("clickhouse", 8123, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "proxy.local", 8080, "proxy-user", "secret"),
                null,
                null,
                null));
        assertThat(clickhouse)
                .containsEntry("proxy_type", "HTTP")
                .containsEntry("proxy_host", "proxy.local")
                .containsEntry("proxy_port", "8080")
                .containsEntry("proxy_username", "proxy-user");

        Properties httpTunnel = factory.connectionProperties(jdbcConfig("postgresql", 5432, false, "disable",
                null,
                new ConnectionConfigDto.NetworkHttpTunnelConfigDto("tunnel.local", 8080, "tunnel-user", "secret"),
                null,
                null));
        assertThat(httpTunnel)
                .containsEntry("socketFactory", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("javanavi.proxy.type", "http-connect")
                .containsEntry("javanavi.proxy.host", "tunnel.local")
                .containsEntry("javanavi.proxy.port", "8080")
                .containsEntry("javanavi.proxy.user", "tunnel-user");

        Properties custom = factory.connectionProperties(jdbcConfig("custom", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, null, null),
                null,
                null,
                null));
        assertThat(custom)
                .containsEntry("socketFactory", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("socketFactoryClass", "com.javanavi.db.ProxySocketFactory");
    }

    @Test
    void proxySocketFactoryUsesConfiguredCredentialsForHttpConnectAndSocks5() throws Exception {
        Method httpConnectRequest = ProxySocketFactory.class.getDeclaredMethod("httpConnectRequest", String.class, int.class);
        httpConnectRequest.setAccessible(true);
        Method socks5Greeting = ProxySocketFactory.class.getDeclaredMethod("socks5Greeting");
        socks5Greeting.setAccessible(true);
        Method socks5Authentication = ProxySocketFactory.class.getDeclaredMethod("socks5Authentication");
        socks5Authentication.setAccessible(true);

        ProxySocketFactory httpFactory = new ProxySocketFactory(proxyProperties("http", "proxy.local", 8080, "proxy-user", "secret"));
        assertThat((String) httpConnectRequest.invoke(httpFactory, "db.internal", 5432))
                .contains("CONNECT db.internal:5432 HTTP/1.1")
                .contains("Proxy-Authorization: Basic " + Base64.getEncoder().encodeToString("proxy-user:secret".getBytes(StandardCharsets.UTF_8)));

        ProxySocketFactory socksFactory = new ProxySocketFactory(proxyProperties("socks5", "proxy.local", 1080, "proxy-user", "secret"));
        assertThat((byte[]) socks5Greeting.invoke(socksFactory))
                .containsExactly(0x05, 0x02, 0x00, 0x02);
        assertThat((byte[]) socks5Authentication.invoke(socksFactory))
                .containsExactly(0x01, 0x0a, 'p', 'r', 'o', 'x', 'y', '-', 'u', 's', 'e', 'r', 0x06, 's', 'e', 'c', 'r', 'e', 't');
    }

    @Test
    void jdbcPoolFingerprintIncludesProxyAndHttpTunnelConfig() throws Exception {
        JdbcConnectionPoolRegistry registry = new JdbcConnectionPoolRegistry(new JdbcConnectionFactory());
        Method fingerprint = JdbcConnectionPoolRegistry.class.getDeclaredMethod("fingerprint", ConnectionConfigDto.class);
        fingerprint.setAccessible(true);

        String direct = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable", null, null, null, null)));
        String proxy = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, "proxy-user", "secret"),
                null,
                null,
                null)));
        String otherProxy = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "other-proxy.local", 1080, "proxy-user", "secret"),
                null,
                null,
                null)));
        String httpTunnel = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable",
                null,
                new ConnectionConfigDto.NetworkHttpTunnelConfigDto("tunnel.local", 8080, "tunnel-user", "secret"),
                null,
                null)));

        assertThat(proxy).isNotEqualTo(direct);
        assertThat(otherProxy).isNotEqualTo(proxy);
        assertThat(httpTunnel).isNotEqualTo(proxy);
        assertThat(httpTunnel).isNotEqualTo(direct);
    }

    private DriverCompatibilityService service() {
        return serviceWithRepository("https://repo.maven.apache.org/maven2");
    }

    private DriverCompatibilityService serviceWithRepository(String repositoryUrl) {
        return serviceWithRepository(repositoryUrl, null);
    }

    private DriverCompatibilityService serviceWithRepository(String repositoryUrl, ConnectionConfigDto.NetworkProxyConfigDto globalProxy) {
        I18nMessages messages = new I18nMessages();
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        SecurityProperties securityProperties = new SecurityProperties();
        securityProperties.setDataDirectory(tempDir.toString());
        GlobalProxyConfigProvider globalProxyProvider = globalProxy == null ? null : new GlobalProxyConfigProvider(securityProperties, objectMapper, null) {
            @Override
            public java.util.Optional<ConnectionConfigDto.NetworkProxyConfigDto> activeProxy() {
                return java.util.Optional.of(globalProxy);
            }
        };
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
                globalProxyProvider,
                messages
        );
    }


    private static ConnectionConfigDto jdbcConfig(
            String driverType,
            int port,
            boolean useSSL,
            String sslMode,
            ConnectionConfigDto.NetworkProxyConfigDto proxy,
            ConnectionConfigDto.NetworkHttpTunnelConfigDto httpTunnel,
            String sslCertPath,
            String sslKeyPath
    ) {
        Map<String, String> options = new java.util.LinkedHashMap<>();
        if (sslCertPath != null) {
            options.put("sslCertPath", sslCertPath);
        }
        if (sslKeyPath != null) {
            options.put("sslKeyPath", sslKeyPath);
        }
        return new ConnectionConfigDto(
                driverType + "-1",
                driverType,
                driverType,
                null,
                "db.local",
                port,
                "demo",
                "user",
                "password",
                options,
                30,
                useSSL,
                sslMode,
                false,
                null,
                null,
                proxy != null,
                proxy,
                httpTunnel != null,
                httpTunnel,
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
    }


    private static ConnectionConfigDto jdbcConfigWithRootSslFiles(
            String driverType,
            int port,
            boolean useSSL,
            String sslMode,
            String sslCertPath,
            String sslKeyPath
    ) {
        return new ConnectionConfigDto(
                driverType + "-root-ssl",
                driverType,
                driverType,
                null,
                "db.local",
                port,
                "demo",
                "user",
                "password",
                Map.of(),
                30,
                useSSL,
                sslMode,
                false,
                null,
                null,
                false,
                null,
                false,
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
        ).withSslFiles(sslCertPath, sslKeyPath);
    }

    private static Properties proxyProperties(String type, String host, int port, String user, String password) {
        Properties properties = new Properties();
        properties.setProperty("javanavi.proxy.type", type);
        properties.setProperty("javanavi.proxy.host", host);
        properties.setProperty("javanavi.proxy.port", String.valueOf(port));
        properties.setProperty("javanavi.proxy.user", user);
        properties.setProperty("javanavi.proxy.password", password);
        return properties;
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
            HttpServer server = createLocalServer();
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
            HttpServer server = createLocalServer();
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

        private static HttpServer createLocalServer() throws IOException {
            try {
                return HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            } catch (IOException error) {
                if (error instanceof SocketException && String.valueOf(error.getMessage()).contains("Operation not permitted")) {
                    skipWhenLocalHttpServerIsUnavailable(error);
                }
                throw error;
            }
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

        private static void skipWhenLocalHttpServerIsUnavailable(IOException error) {
            Assumptions.assumeTrue(false, "local HTTP server unavailable in this test environment: " + error.getMessage());
        }
    }
}
