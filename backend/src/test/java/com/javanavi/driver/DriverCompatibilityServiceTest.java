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
import com.javanavi.redis.RedisCompatibilityService;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.security.LocalSessionService;
import org.assertj.core.api.InstanceOfAssertFactories;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.lang.reflect.Method;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

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

        ConnectionConfigDto mysql = jdbcConfig("mysql", 3306, true, "required", null, null, null);
        assertThat(factory.jdbcUrl(mysql)).doesNotContain("useSSL=false");
        assertThat(factory.connectionProperties(mysql))
                .containsEntry("sslMode", "VERIFY_IDENTITY")
                .containsEntry("useSSL", "true")
                .containsEntry("requireSSL", "true");

        ConnectionConfigDto mysqlSkipVerify = jdbcConfig("mysql", 3306, true, "skip-verify", null, null, null);
        assertThat(factory.connectionProperties(mysqlSkipVerify))
                .containsEntry("sslMode", "REQUIRED")
                .containsEntry("verifyServerCertificate", "false");

        assertThat(factory.connectionProperties(jdbcConfig("postgresql", 5432, true, "preferred", null, null, null)))
                .containsEntry("sslmode", "prefer");
        assertThat(factory.connectionProperties(jdbcConfig("postgresql", 5432, true, "skip-verify", null, null, null)))
                .containsEntry("sslmode", "require")
                .containsEntry("sslfactory", "org.postgresql.ssl.NonValidatingFactory");

        assertThat(factory.jdbcUrl(jdbcConfig("sqlserver", 1433, true, "required", null, null, null)))
                .contains("encrypt=true")
                .contains("trustServerCertificate=false");
        assertThat(factory.jdbcUrl(jdbcConfig("sqlserver", 1433, true, "skip-verify", null, null, null)))
                .contains("encrypt=true")
                .contains("trustServerCertificate=true");

        assertThat(factory.connectionProperties(jdbcConfig("clickhouse", 8123, true, "skip-verify", null, null, null)))
                .containsEntry("ssl", "true")
                .containsEntry("sslmode", "none");

        ConnectionConfigDto dameng = jdbcConfig("dameng", 5236, true, "required", null, "/tmp/client.crt", "/tmp/client.key");
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
    void globalProxyAppliesOnlyWhenConnectionHasNoConnectionNetwork() {
        JdbcConnectionFactory factory = new JdbcConnectionFactory();
        ConnectionConfigDto globalOnly = jdbcConfig("postgresql", 5432, false, "disable", null, null, null)
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
                null).withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global.proxy", 8080, null, null));

        assertThat(factory.connectionProperties(connectionProxy))
                .containsEntry("javanavi.proxy.type", "socks5")
                .containsEntry("javanavi.proxy.host", "connection.proxy")
                .containsEntry("javanavi.proxy.port", "1080");

        ConnectionConfigDto httpProxy = jdbcConfig("postgresql", 5432, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "connection.proxy", 18080, null, null),
                null,
                null).withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global.proxy", 8080, null, null));

        assertThat(factory.connectionProperties(httpProxy))
                .containsEntry("javanavi.proxy.type", "http")
                .containsEntry("javanavi.proxy.host", "connection.proxy")
                .containsEntry("javanavi.proxy.port", "18080");

        ConnectionConfigDto ssh = new ConnectionConfigDto(
                "postgres-ssh", "Postgres SSH", "postgresql", null, "db.local", 5432, "demo", "user", "password", Map.of(), 30,
                false, "disable",
                true,
                new ConnectionConfigDto.NetworkCredentialConfigDto("ssh.local", 22, "ssh-user", "ssh-secret", null),
                null,
                false,
                null,
                null, null, List.of(), null, null, null, null, null, null, null, null
        ).withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global.proxy", 8080, null, null));

        assertThat(factory.connectionProperties(ssh)).doesNotContainKey("javanavi.proxy.host");
    }

    @Test
    void jdbcConnectionFactoryAppliesInjectedGlobalProxyForDirectConsumers() {
        ConnectionConfigDto.NetworkProxyConfigDto globalProxy =
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "global.proxy", 8080, "global-user", "global-secret");
        JdbcConnectionFactory factory = new JdbcConnectionFactory(
                null,
                new I18nMessages(),
                null,
                globalProxyProvider(globalProxy)
        );

        Properties properties = factory.connectionProperties(jdbcConfig("postgresql", 5432, false, "disable", null, null, null));

        assertThat(properties)
                .containsEntry("javanavi.proxy.type", "http")
                .containsEntry("javanavi.proxy.host", "global.proxy")
                .containsEntry("javanavi.proxy.port", "8080")
                .containsEntry("javanavi.proxy.user", "global-user")
                .containsEntry("javanavi.proxy.password", "global-secret");
    }

    @Test
    void jdbcNetworkProxyValidatesForJdbcWithoutGenericRejection() {
        JdbcConnectionFactory factory = new JdbcConnectionFactory();

        ConnectionConfigDto proxy = jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, "proxy-user", "secret"),
                null,
                null);
        factory.connectionProperties(proxy);

        ConnectionConfigDto httpProxy = jdbcConfig("postgresql", 5432, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "proxy.local", 8080, "proxy-user", "secret"),
                null,
                null);
        factory.connectionProperties(httpProxy);

        ConnectionConfigDto invalidProxy = jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", " ", 1080, null, null),
                null,
                null);
        assertThatThrownBy(() -> factory.connectionProperties(invalidProxy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Proxy host is required");

        ConnectionConfigDto sshAndProxy = new ConnectionConfigDto(
                "mysql-1", "MySQL", "mysql", null, "db.local", 3306, "demo", "user", "password", Map.of(), 30,
                false, "disable",
                true,
                new ConnectionConfigDto.NetworkCredentialConfigDto("ssh.local", 22, "ssh-user", "ssh-secret", null),
                null,
                true,
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, null, null),
                null, null, List.of(), null, null, null, null, null, null, null, null
        );
        assertThatThrownBy(() -> factory.connectionProperties(sshAndProxy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("mutually exclusive");
    }

    @Test
    void jdbcConnectionFactoryAddsDriverProxyProperties() {
        JdbcConnectionFactory factory = new JdbcConnectionFactory();

        Properties mysql = factory.connectionProperties(jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, "proxy-user", "secret"),
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
                null));
        assertThat(postgres)
                .containsEntry("socketFactory", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("javanavi.proxy.host", "proxy.local");

        Properties sqlserver = factory.connectionProperties(jdbcConfig("sqlserver", 1433, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "proxy.local", 8080, null, null),
                null,
                null));
        assertThat(sqlserver)
                .containsEntry("socketFactoryClass", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("javanavi.proxy.type", "http");

        Properties clickhouse = factory.connectionProperties(jdbcConfig("clickhouse", 8123, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "proxy.local", 8080, "proxy-user", "secret"),
                null,
                null));
        assertThat(clickhouse)
                .containsEntry("proxy_type", "HTTP")
                .containsEntry("proxy_host", "proxy.local")
                .containsEntry("proxy_port", "8080")
                .containsEntry("proxy_username", "proxy-user");

        Properties httpProxy = factory.connectionProperties(jdbcConfig("postgresql", 5432, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "proxy.local", 8080, "proxy-user", "secret"),
                null,
                null));
        assertThat(httpProxy)
                .containsEntry("socketFactory", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("javanavi.proxy.type", "http")
                .containsEntry("javanavi.proxy.host", "proxy.local")
                .containsEntry("javanavi.proxy.port", "8080")
                .containsEntry("javanavi.proxy.user", "proxy-user");

        Properties custom = factory.connectionProperties(jdbcConfig("custom", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, null, null),
                null,
                null));
        assertThat(custom)
                .containsEntry("socketFactory", "com.javanavi.db.ProxySocketFactory")
                .containsEntry("socketFactoryClass", "com.javanavi.db.ProxySocketFactory");
    }

    @Test
    void redisConnectUsesConfiguredHttpProxy() throws Exception {
        try (HttpConnectRedisProbe proxy = HttpConnectRedisProbe.start()) {
            RedisCompatibilityService service = new RedisCompatibilityService(new I18nMessages());

            Map<String, Object> result = service.connect(Map.of(
                    "connection", Map.of(
                            "type", "redis",
                            "host", "redis.internal",
                            "port", 6379,
                            "database", 0,
                            "useProxy", true,
                            "proxy", Map.of(
                                    "type", "http",
                                    "host", "127.0.0.1",
                                    "port", proxy.port()
                            )
                    )
            ));

            assertThat(result).containsEntry("connected", true);
            proxy.assertConnectTarget("redis.internal:6379");
            assertThat(proxy.commands()).containsExactly("SELECT", "PING");
        }
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
    void jdbcPoolFingerprintIncludesProxyConfig() throws Exception {
        JdbcConnectionPoolRegistry registry = new JdbcConnectionPoolRegistry(new JdbcConnectionFactory());
        Method fingerprint = JdbcConnectionPoolRegistry.class.getDeclaredMethod("fingerprint", ConnectionConfigDto.class);
        fingerprint.setAccessible(true);

        String direct = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable", null, null, null)));
        String proxy = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, "proxy-user", "secret"),
                null,
                null)));
        String otherProxy = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "other-proxy.local", 1080, "proxy-user", "secret"),
                null,
                null)));
        String httpProxy = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("http", "proxy.local", 8080, "proxy-user", "secret"),
                null,
                null)));
        String connectionProxyGlobalA = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, "proxy-user", "secret"),
                null,
                null).withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global-a", 8080, null, null))));
        String connectionProxyGlobalB = String.valueOf(fingerprint.invoke(registry, jdbcConfig("mysql", 3306, false, "disable",
                new ConnectionConfigDto.NetworkProxyConfigDto("socks5", "proxy.local", 1080, "proxy-user", "secret"),
                null,
                null).withGlobalProxy(new ConnectionConfigDto.NetworkProxyConfigDto("http", "global-b", 8080, null, null))));

        assertThat(proxy).isNotEqualTo(direct);
        assertThat(otherProxy).isNotEqualTo(proxy);
        assertThat(httpProxy).isNotEqualTo(proxy);
        assertThat(httpProxy).isNotEqualTo(direct);
        assertThat(connectionProxyGlobalA).isEqualTo(connectionProxyGlobalB);
    }

    private GlobalProxyConfigProvider globalProxyProvider(ConnectionConfigDto.NetworkProxyConfigDto globalProxy) {
        SecurityProperties securityProperties = new SecurityProperties();
        securityProperties.setDataDirectory(tempDir.toString());
        return new GlobalProxyConfigProvider(securityProperties, new ObjectMapper().findAndRegisterModules(), null) {
            @Override
            public java.util.Optional<ConnectionConfigDto.NetworkProxyConfigDto> activeProxy() {
                return java.util.Optional.of(globalProxy);
            }
        };
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

    private static final class HttpConnectRedisProbe implements AutoCloseable {
        private final ServerSocket server;
        private final CountDownLatch done = new CountDownLatch(1);
        private final AtomicReference<String> connectTarget = new AtomicReference<>("");
        private final AtomicReference<Throwable> error = new AtomicReference<>();
        private final List<String> commands = new ArrayList<>();
        private final Thread thread;

        private HttpConnectRedisProbe(ServerSocket server) {
            this.server = server;
            this.thread = new Thread(this::serve, "redis-http-connect-probe");
            this.thread.setDaemon(true);
        }

        static HttpConnectRedisProbe start() throws IOException {
            try {
                ServerSocket server = new ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"));
                HttpConnectRedisProbe probe = new HttpConnectRedisProbe(server);
                probe.thread.start();
                return probe;
            } catch (IOException error) {
                if (error instanceof SocketException && String.valueOf(error.getMessage()).contains("Operation not permitted")) {
                    Assumptions.assumeTrue(false, "local TCP server unavailable in this test environment: " + error.getMessage());
                }
                throw error;
            }
        }

        int port() {
            return server.getLocalPort();
        }

        List<String> commands() throws Exception {
            awaitDone();
            return List.copyOf(commands);
        }

        void assertConnectTarget(String expected) throws Exception {
            awaitDone();
            assertThat(connectTarget.get()).isEqualTo(expected);
        }

        private void serve() {
            try (Socket socket = server.accept()) {
                InputStream input = socket.getInputStream();
                OutputStream output = socket.getOutputStream();
                String connect = readLine(input);
                if (connect.startsWith("CONNECT ")) {
                    connectTarget.set(connect.substring("CONNECT ".length(), connect.indexOf(" HTTP/")));
                }
                while (!readLine(input).isEmpty()) {
                    // consume proxy headers
                }
                output.write("HTTP/1.1 200 OK\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
                output.flush();
                for (int index = 0; index < 2; index++) {
                    String command = readRedisCommand(input);
                    commands.add(command);
                    output.write(("PING".equals(command) ? "+PONG\r\n" : "+OK\r\n").getBytes(StandardCharsets.UTF_8));
                    output.flush();
                }
            } catch (Throwable failure) {
                error.set(failure);
            } finally {
                done.countDown();
            }
        }

        private static String readRedisCommand(InputStream input) throws IOException {
            String array = readLine(input);
            int count = Integer.parseInt(array.substring(1));
            List<String> parts = new ArrayList<>();
            for (int index = 0; index < count; index++) {
                String bulk = readLine(input);
                int length = Integer.parseInt(bulk.substring(1));
                byte[] value = input.readNBytes(length);
                input.readNBytes(2);
                parts.add(new String(value, StandardCharsets.UTF_8));
            }
            return parts.get(0).toUpperCase(Locale.ROOT);
        }

        private static String readLine(InputStream input) throws IOException {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            int previous = -1;
            while (true) {
                int value = input.read();
                if (value < 0) {
                    throw new IOException("connection closed while reading line");
                }
                if (previous == '\r' && value == '\n') {
                    byte[] bytes = buffer.toByteArray();
                    return new String(bytes, 0, Math.max(0, bytes.length - 1), StandardCharsets.ISO_8859_1);
                }
                buffer.write(value);
                previous = value;
            }
        }

        private void awaitDone() throws Exception {
            assertThat(done.await(3, TimeUnit.SECONDS)).isTrue();
            Throwable failure = error.get();
            if (failure != null) {
                throw new AssertionError(failure);
            }
        }

        @Override
        public void close() throws IOException {
            server.close();
        }
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
