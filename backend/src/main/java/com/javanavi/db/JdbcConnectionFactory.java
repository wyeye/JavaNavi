package com.javanavi.db;

import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.driver.JdbcDriverRuntimeService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.i18n.LocalizedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

@Component
public class JdbcConnectionFactory {
    private final JdbcDriverRuntimeService driverRuntimeService;
    private final I18nMessages messages;
    private final ConnectionNetworkTunnelService networkTunnelService;

    public JdbcConnectionFactory() {
        this(null, new I18nMessages(), new ConnectionNetworkTunnelService());
    }

    @Autowired
    public JdbcConnectionFactory(
            JdbcDriverRuntimeService driverRuntimeService,
            I18nMessages messages,
            ConnectionNetworkTunnelService networkTunnelService
    ) {
        this.driverRuntimeService = driverRuntimeService;
        this.messages = messages;
        this.networkTunnelService = networkTunnelService == null ? new ConnectionNetworkTunnelService() : networkTunnelService;
    }

    private JdbcDriverRuntimeService requireDriverRuntimeService() {
        if (driverRuntimeService == null) {
            throw new IllegalStateException(messages.message("connection.jdbcRuntimeUnavailable"));
        }
        return driverRuntimeService;
    }

    private static final Map<String, Integer> DEFAULT_PORTS = Map.ofEntries(
            Map.entry("mysql", 3306),
            Map.entry("mariadb", 3306),
            Map.entry("doris", 9030),
            Map.entry("diros", 9030),
            Map.entry("sphinx", 9306),
            Map.entry("postgresql", 5432),
            Map.entry("postgres", 5432),
            Map.entry("kingbase", 54321),
            Map.entry("highgo", 5866),
            Map.entry("vastbase", 5432),
            Map.entry("oracle", 1521),
            Map.entry("sqlserver", 1433),
            Map.entry("mssql", 1433),
            Map.entry("dameng", 5236),
            Map.entry("dm", 5236),
            Map.entry("tdengine", 6041),
            Map.entry("taos", 6041),
            Map.entry("clickhouse", 8123),
            Map.entry("sqlite", 0),
            Map.entry("duckdb", 0)
    );

    public boolean isDemo(ConnectionConfigDto config) {
        return config == null || config.isDemoConnection();
    }

    public boolean isSupportedExternalDriver(ConnectionConfigDto config) {
        String driver = normalizeDriver(config);
        if (isCustomDsn(config)) {
            return !driver.isBlank() && !"custom".equals(driver);
        }
        return "mysql".equals(driver)
                || "postgresql".equals(driver)
                || "sqlite".equals(driver)
                || "duckdb".equals(driver)
                || "oracle".equals(driver)
                || "sqlserver".equals(driver)
                || "dameng".equals(driver)
                || "tdengine".equals(driver)
                || "clickhouse".equals(driver);
    }

    public Connection openConnection(ConnectionConfigDto config) throws SQLException {
        if (!isSupportedExternalDriver(config)) {
            throw new IllegalArgumentException(messages.message("connection.jdbcProfiles"));
        }
        try {
            return networkTunnelService.withJdbcNetwork(config, effective -> {
                try {
                    return JdbcIsolationCompatibility.wrap(
                            openRawConnection(effective),
                            normalizeDriver(effective)
                    );
                } catch (SQLException error) {
                    throw new JdbcConnectionRuntimeException(error);
                }
            });
        } catch (JdbcConnectionRuntimeException error) {
            throw error.getCause();
        }
    }

    public Connection openRawConnection(ConnectionConfigDto config) throws SQLException {
        ConnectionConfigDto effective = config;
        String url = jdbcUrl(effective);
        Properties properties = connectionProperties(effective);
        return requireDriverRuntimeService().openConnection(normalizeDriver(config), url, properties);
    }

    public Connection openRawConnection(ConnectionConfigDto config, Properties properties) throws SQLException {
        return requireDriverRuntimeService().openConnection(normalizeDriver(config), jdbcUrl(config), properties);
    }

    public ConnectionNetworkTunnelService networkTunnelService() {
        return networkTunnelService;
    }

    public DataSource dataSource(ConnectionConfigDto config, Properties properties) {
        if (!isSupportedExternalDriver(config)) {
            throw new IllegalArgumentException(messages.message("connection.jdbcProfiles"));
        }
        String driver = normalizeDriver(config);
        return new JdbcIsolationCompatibilityDataSource(
                new DynamicJdbcDataSource(requireDriverRuntimeService(), driver, jdbcUrl(config), properties),
                driver
        );
    }

    public void prepareDriver(ConnectionConfigDto config) throws SQLException {
        if (!isSupportedExternalDriver(config)) {
            throw new IllegalArgumentException(messages.message("connection.jdbcProfiles"));
        }
        requireDriverRuntimeService().ensureDriverAvailable(normalizeDriver(config));
    }

    public String jdbcUrl(ConnectionConfigDto config) {
        if (isCustomDsn(config)) {
            return customJdbcUrl(config);
        }
        String databaseType = logicalDriverType(config);
        String driver = normalizeDriver(config);
        if ("sqlite".equals(driver)) {
            return sqliteJdbcUrl(config);
        }
        if ("duckdb".equals(driver)) {
            return duckdbJdbcUrl(config);
        }
        String host = requireText(config.host(), "host");
        int port = config.port() == null || config.port() <= 0 ? defaultPort(databaseType, driver) : config.port();
        String database = sanitizePathSegment(config.database());
        return switch (driver) {
            case "mysql" -> "jdbc:mysql://" + host + ":" + port + "/" + database
                    + mysqlUrlQuery(config);
            case "postgresql" -> "jdbc:postgresql://" + host + ":" + port + "/" + database;
            case "oracle" -> "jdbc:oracle:thin:@//" + host + ":" + port + "/" + requireText(database, "database");
            case "sqlserver" -> "jdbc:sqlserver://" + host + ":" + port + ";databaseName=" + database
                    + sqlServerSecurityUrlParameters(config);
            case "dameng" -> "jdbc:dm://" + host + ":" + port;
            case "tdengine" -> "jdbc:TAOS-RS://" + host + ":" + port + "/" + database;
            case "clickhouse" -> "jdbc:clickhouse://" + host + ":" + port + "/" + database;
            default -> throw new IllegalArgumentException(messages.message("drivers.unsupportedType", "type", driver));
        };
    }

    public Properties connectionProperties(ConnectionConfigDto config) {
        config = effectiveConnectionConfig(config);
        Properties properties = new Properties();
        if (config.username() != null && !config.username().isBlank()) {
            properties.setProperty("user", config.username());
        }
        if (config.password() != null) {
            properties.setProperty("password", config.password());
        }
        if (config.options() != null) {
            config.options().forEach((key, value) -> {
                if (key != null && value != null && !key.isBlank() && !isBlockedOption(key) && !isInternalOption(key) && !isPoolLifecycleOption(key)) {
                    properties.setProperty(key, value);
                }
            });
        }
        applyDriverSpecificConnectionProperties(config, properties);
        return properties;
    }

    ConnectionConfigDto effectiveConnectionConfig(ConnectionConfigDto config) {
        return config;
    }

    public String normalizeDriver(String driverType) {
        String driver = driverType == null ? "" : driverType.toLowerCase(Locale.ROOT).trim();
        return switch (driver) {
            case "postgres", "postgresql", "pg" -> "postgresql";
            case "mysql", "mariadb", "doris", "diros", "sphinx" -> "mysql";
            case "kingbase", "kingbase8", "kingbasees", "kingbasev8", "highgo", "vastbase" -> "postgresql";
            case "oracle", "oracle11g", "oracle12c", "oracle19c", "oracle23ai" -> "oracle";
            case "sqlserver", "mssql", "sql_server", "sql server" -> "sqlserver";
            case "dameng", "dm", "dm8" -> "dameng";
            case "tdengine", "taos", "taos-rs", "taos_rs" -> "tdengine";
            case "clickhouse", "ch" -> "clickhouse";
            case "sqlite", "sqlite3" -> "sqlite";
            case "duckdb" -> "duckdb";
            case "h2", "demo" -> "demo";
            default -> driver;
        };
    }

    public String normalizeDriver(ConnectionConfigDto config) {
        return normalizeDriver(selectedDriverType(config));
    }

    public String logicalDriverType(ConnectionConfigDto config) {
        if (config == null) {
            return "";
        }
        String type = config.driverType() == null ? "" : config.driverType().trim();
        if ("custom".equalsIgnoreCase(type)) {
            return firstText(config.driver(), option(config, "driver"), option(config, "driverType"), "custom");
        }
        return type;
    }

    private String selectedDriverType(ConnectionConfigDto config) {
        String logical = logicalDriverType(config);
        if (config == null || isCustomDsn(config)) {
            return logical;
        }
        String selected = normalizeSelectionToken(config.driver());
        if (!selected.isBlank() && compatibleDriverTypes(logical).contains(selected)) {
            return selected;
        }
        return logical;
    }

    public boolean isCustomDsn(ConnectionConfigDto config) {
        return config != null && "custom".equalsIgnoreCase(config.driverType());
    }

    private String customJdbcUrl(ConnectionConfigDto config) {
        String rawDsn = firstText(config.dsn(), config.uri(), option(config, "dsn"), option(config, "jdbcUrl"), option(config, "url"));
        if (rawDsn == null || rawDsn.isBlank()) {
            throw new LocalizedException("connection.customDsnRequired");
        }
        String dsn = rawDsn.trim();
        String driver = normalizeDriver(config);
        if (dsn.startsWith("jdbc:")) {
            return validateGenericJdbcUrl(dsn);
        }
        if ("sqlite".equals(driver)) {
            return sqliteJdbcUrlFromPath(dsn);
        }
        if ("duckdb".equals(driver)) {
            return duckDbJdbcUrlFromPath(dsn);
        }
        throw new LocalizedException("connection.customDsnJdbcUrlRequired", "driver", driver);
    }

    static final class JdbcConnectionRuntimeException extends RuntimeException {
        JdbcConnectionRuntimeException(SQLException cause) {
            super(cause);
        }

        @Override
        public synchronized SQLException getCause() {
            return (SQLException) super.getCause();
        }
    }

    private static String sqliteJdbcUrl(ConnectionConfigDto config) {
        String rawPath = firstText(
                config == null ? null : config.uri(),
                option(config, "path"),
                option(config, "filePath"),
                config == null ? null : config.host(),
                config == null ? null : config.database()
        );
        if (rawPath == null || rawPath.isBlank()) {
            throw new LocalizedException("connection.sqlitePathRequired");
        }

        return sqliteJdbcUrlFromPath(rawPath);
    }

    private static String validateSqliteJdbcUrl(String url) {
        if (url.indexOf('\0') >= 0 || url.contains("\n") || url.contains("\r")) {
            throw new LocalizedException("connection.sqliteUrlControlChars");
        }
        return url;
    }

    private static String sqliteJdbcUrlFromPath(String rawPath) {
        String pathText = rawPath.trim();
        if (pathText.startsWith("jdbc:sqlite:")) {
            return validateSqliteJdbcUrl(pathText);
        }
        pathText = pathText.replaceFirst("(?i)^sqlite://", "");
        if (pathText.equals(":memory:")) {
            return "jdbc:sqlite::memory:";
        }
        if (pathText.indexOf('\0') >= 0 || pathText.contains("\n") || pathText.contains("\r")) {
            throw new LocalizedException("connection.sqlitePathControlChars");
        }
        if (pathText.contains("?") || pathText.contains("#")) {
            throw new LocalizedException("connection.sqlitePathQueryFragment");
        }
        return "jdbc:sqlite:" + Path.of(pathText).toAbsolutePath().normalize();
    }

    private static String duckdbJdbcUrl(ConnectionConfigDto config) {
        String rawPath = firstText(
                config == null ? null : config.uri(),
                option(config, "path"),
                option(config, "filePath"),
                config == null ? null : config.host(),
                config == null ? null : config.database()
        );
        if (rawPath == null || rawPath.isBlank()) {
            throw new LocalizedException("connection.duckdbPathRequired");
        }

        return duckDbJdbcUrlFromPath(rawPath);
    }

    private static String validateDuckDbJdbcUrl(String url) {
        if (url.indexOf('\0') >= 0 || url.contains("\n") || url.contains("\r")) {
            throw new LocalizedException("connection.duckdbUrlControlChars");
        }
        return url;
    }

    private static String duckDbJdbcUrlFromPath(String rawPath) {
        String pathText = rawPath.trim();
        if (pathText.startsWith("jdbc:duckdb:")) {
            return validateDuckDbJdbcUrl(pathText);
        }
        pathText = pathText.replaceFirst("(?i)^duckdb://", "");
        if (pathText.equals(":memory:")) {
            return "jdbc:duckdb:";
        }
        if (pathText.indexOf('\0') >= 0 || pathText.contains("\n") || pathText.contains("\r")) {
            throw new LocalizedException("connection.duckdbPathControlChars");
        }
        if (pathText.contains("?") || pathText.contains("#")) {
            throw new LocalizedException("connection.duckdbPathQueryFragment");
        }
        return "jdbc:duckdb:" + Path.of(pathText).toAbsolutePath().normalize();
    }

    private static String validateGenericJdbcUrl(String url) {
        if (url.indexOf('\0') >= 0 || url.contains("\n") || url.contains("\r")) {
            throw new LocalizedException("connection.customJdbcUrlControlChars");
        }
        return url;
    }

    private void applyDriverSpecificConnectionProperties(ConnectionConfigDto config, Properties properties) {
        ConnectionNetworkTunnelService.validateJdbcNetwork(config);
        String driver = normalizeDriver(config);
        String logicalDriver = normalizeDriver(logicalDriverType(config));
        applySslProperties(config, driver, properties);
        applyJdbcProxyProperties(config, driver, logicalDriver, properties);
        if ("dameng".equals(driver)) {
            String schema = damengSchema(config);
            if (schema != null && !schema.isBlank()) {
                putIfAbsentIgnoreCase(properties, "schema", schema);
            }
        }
    }

    private static String mysqlUrlQuery(ConnectionConfigDto config) {
        String sslParameter = sslEnabled(config) ? "" : "&useSSL=false";
        return "?useUnicode=true&characterEncoding=utf8" + sslParameter + "&allowPublicKeyRetrieval=true";
    }

    private static String sqlServerSecurityUrlParameters(ConnectionConfigDto config) {
        if (!sslEnabled(config)) {
            return ";encrypt=false;trustServerCertificate=true";
        }
        return switch (normalizedSslMode(config)) {
            case "skip-verify", "preferred" -> ";encrypt=true;trustServerCertificate=true";
            default -> ";encrypt=true;trustServerCertificate=false";
        };
    }

    private static void applySslProperties(ConnectionConfigDto config, String driver, Properties properties) {
        if (!sslEnabled(config)) {
            return;
        }
        String mode = normalizedSslMode(config);
        String certPath = firstText(config == null ? null : config.sslCertPath(), option(config, "sslCertPath"), option(config, "sslCertificate"), option(config, "sslFilesPath"));
        String keyPath = firstText(config == null ? null : config.sslKeyPath(), option(config, "sslKeyPath"), option(config, "sslKey"));
        String rootCertPath = firstText(option(config, "sslRootCertPath"), option(config, "sslRootCert"), option(config, "sslrootcert"));
        switch (driver) {
            case "mysql" -> applyMySqlSslProperties(mode, properties);
            case "postgresql" -> applyPostgresSslProperties(mode, certPath, keyPath, rootCertPath, properties);
            case "clickhouse" -> applyClickHouseSslProperties(mode, certPath, keyPath, rootCertPath, properties);
            case "dameng" -> applyDamengSslProperties(mode, certPath, keyPath, properties);
            default -> {
                // SQL Server SSL is encoded in the JDBC URL. Other JDBC drivers may use caller-provided options.
            }
        }
    }

    private static void applyMySqlSslProperties(String mode, Properties properties) {
        putIfAbsentIgnoreCase(properties, "useSSL", "true");
        putIfAbsentIgnoreCase(properties, "requireSSL", "true");
        String driverMode = switch (mode) {
            case "skip-verify", "preferred" -> "REQUIRED";
            default -> "VERIFY_IDENTITY";
        };
        putIfAbsentIgnoreCase(properties, "sslMode", driverMode);
        if ("skip-verify".equals(mode) || "preferred".equals(mode)) {
            putIfAbsentIgnoreCase(properties, "verifyServerCertificate", "false");
        }
    }

    private static void applyPostgresSslProperties(String mode, String certPath, String keyPath, String rootCertPath, Properties properties) {
        String driverMode = switch (mode) {
            case "preferred" -> "prefer";
            case "skip-verify" -> "require";
            default -> "verify-full";
        };
        putIfAbsentIgnoreCase(properties, "sslmode", driverMode);
        if ("skip-verify".equals(mode)) {
            putIfAbsentIgnoreCase(properties, "sslfactory", "org.postgresql.ssl.NonValidatingFactory");
        }
        putIfText(properties, "sslcert", certPath);
        putIfText(properties, "sslkey", keyPath);
        putIfText(properties, "sslrootcert", rootCertPath);
    }

    private static void applyClickHouseSslProperties(String mode, String certPath, String keyPath, String rootCertPath, Properties properties) {
        putIfAbsentIgnoreCase(properties, "ssl", "true");
        putIfAbsentIgnoreCase(properties, "sslmode", "skip-verify".equals(mode) || "preferred".equals(mode) ? "none" : "strict");
        putIfText(properties, "sslcert", certPath);
        putIfText(properties, "sslkey", keyPath);
        putIfText(properties, "sslrootcert", rootCertPath);
    }

    private static void applyDamengSslProperties(String mode, String certPath, String keyPath, Properties properties) {
        putIfAbsentIgnoreCase(properties, "sslMode", mode);
        putIfText(properties, "sslFilesPath", certPath);
        putIfText(properties, "sslKeyPath", keyPath);
    }

    private static void applyJdbcProxyProperties(ConnectionConfigDto config, String driver, String logicalDriver, Properties properties) {
        ConnectionNetworkTunnelService.JdbcProxyEndpoint endpoint = ConnectionNetworkTunnelService.jdbcProxyEndpoint(config);
        if (endpoint == null) {
            return;
        }
        if ("clickhouse".equals(driver) || "clickhouse".equals(logicalDriver)) {
            putIfAbsentIgnoreCase(properties, "proxy_type", clickHouseProxyType(endpoint.type()));
            putIfAbsentIgnoreCase(properties, "proxy_host", endpoint.host());
            putIfAbsentIgnoreCase(properties, "proxy_port", String.valueOf(endpoint.port()));
            putIfText(properties, "proxy_username", endpoint.user());
            putIfText(properties, "proxy_password", endpoint.password());
            return;
        }
        if ("mysql".equals(driver)) {
            if ("socks5".equalsIgnoreCase(endpoint.type())) {
                putIfAbsentIgnoreCase(properties, "socketFactory", "com.mysql.cj.protocol.SocksProxySocketFactory");
                putIfAbsentIgnoreCase(properties, "socksProxyHost", endpoint.host());
                putIfAbsentIgnoreCase(properties, "socksProxyPort", String.valueOf(endpoint.port()));
                putIfAbsentIgnoreCase(properties, "socksProxyRemoteDns", "true");
            } else {
                throw new IllegalArgumentException("HTTP CONNECT proxy is not supported for MySQL JDBC runtime. Use SOCKS5 proxy or SSH tunnel.");
            }
        } else if ("sqlserver".equals(driver) || "sqlserver".equals(logicalDriver)) {
            putIfAbsentIgnoreCase(properties, "socketFactoryClass", ProxySocketFactory.class.getName());
            putIfAbsentIgnoreCase(properties, "socketFactoryConstructorArg", endpoint.encoded());
        } else {
            putIfAbsentIgnoreCase(properties, "socketFactory", ProxySocketFactory.class.getName());
            putIfAbsentIgnoreCase(properties, "socketFactoryArg", endpoint.encoded());
        }
        if ("custom".equals(driver)) {
            putIfAbsentIgnoreCase(properties, "socketFactoryClass", ProxySocketFactory.class.getName());
            putIfAbsentIgnoreCase(properties, "socketFactoryConstructorArg", endpoint.encoded());
        }
        putIfAbsentIgnoreCase(properties, "javanavi.proxy.type", endpoint.type());
        putIfAbsentIgnoreCase(properties, "javanavi.proxy.host", endpoint.host());
        putIfAbsentIgnoreCase(properties, "javanavi.proxy.port", String.valueOf(endpoint.port()));
        putIfText(properties, "javanavi.proxy.user", endpoint.user());
        putIfText(properties, "javanavi.proxy.password", endpoint.password());
    }

    private static String clickHouseProxyType(String type) {
        return "socks5".equalsIgnoreCase(type) ? "SOCKS" : "HTTP";
    }

    private static boolean sslEnabled(ConnectionConfigDto config) {
        return Boolean.TRUE.equals(config == null ? null : config.useSSL()) && !"disable".equals(normalizedSslMode(config));
    }

    private static String normalizedSslMode(ConnectionConfigDto config) {
        String mode = firstText(config == null ? null : config.sslMode(), option(config, "sslMode"));
        if (mode == null) {
            return "required";
        }
        String normalized = mode.toLowerCase(Locale.ROOT).replace("_", "-").trim();
        return switch (normalized) {
            case "required", "require", "verify-full", "verify-ca", "true", "1", "yes", "on" -> "required";
            case "skip-verify", "skipverify", "insecure", "insecure-skip-verify" -> "skip-verify";
            case "preferred", "prefer", "compat", "compatibility" -> "preferred";
            case "disable", "disabled", "false", "0", "no", "off", "none" -> "disable";
            default -> "required";
        };
    }

    private static String damengSchema(ConnectionConfigDto config) {
        if (config == null) {
            return null;
        }
        String schema = firstText(config.database(), config.username());
        if (schema == null) {
            return null;
        }
        return normalizeDamengSchema(schema);
    }

    static String normalizeDamengSchema(String schema) {
        String value = schema == null ? "" : schema.trim();
        if (value.isBlank()) {
            return "";
        }
        if (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2) {
            return value.substring(1, value.length() - 1);
        }
        return value.toUpperCase(Locale.ROOT);
    }

    private static String requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new LocalizedException("connection.externalFieldRequired", "field", field);
        }
        return value.trim();
    }

    private static void putIfAbsentIgnoreCase(Properties properties, String key, String value) {
        for (Object existingKey : properties.keySet()) {
            if (existingKey != null && existingKey.toString().equalsIgnoreCase(key)) {
                return;
            }
        }
        properties.setProperty(key, value);
    }

    private static void putIfText(Properties properties, String key, String value) {
        if (value != null && !value.isBlank()) {
            putIfAbsentIgnoreCase(properties, key, value.trim());
        }
    }

    private static int defaultPort(String driverType, String normalizedDriver) {
        String logical = driverType == null ? "" : driverType.toLowerCase(Locale.ROOT).trim();
        Integer port = DEFAULT_PORTS.get(logical);
        if (port != null) {
            return port;
        }
        return DEFAULT_PORTS.getOrDefault(normalizedDriver, 0);
    }

    private static List<String> compatibleDriverTypes(String driverType) {
        String logical = normalizeSelectionToken(driverType);
        return List.of(logical);
    }

    private static String normalizeSelectionToken(String value) {
        String normalized = value == null ? "" : value.toLowerCase(Locale.ROOT).trim();
        return switch (normalized) {
            case "postgresql", "pg" -> "postgres";
            case "doris" -> "diros";
            case "mssql", "sql_server", "sql server" -> "sqlserver";
            case "dm", "dm8" -> "dameng";
            case "taos", "taos-rs", "taos_rs" -> "tdengine";
            case "ch" -> "clickhouse";
            case "sqlite3" -> "sqlite";
            default -> normalized;
        };
    }

    private static String sanitizePathSegment(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String database = value.trim();
        if (database.contains("?") || database.contains("#") || database.contains(";")) {
            throw new LocalizedException("connection.databaseControlChars");
        }
        return database;
    }

    private static boolean isBlockedOption(String key) {
        String normalized = key.toLowerCase(Locale.ROOT).trim();
        return normalized.contains("password") || normalized.contains("token") || normalized.contains("secret");
    }

    private static boolean isInternalOption(String key) {
        String normalized = normalizeOptionKey(key);
        return normalized.startsWith("customdatasource") || normalized.startsWith("javanavi");
    }

    private static boolean isPoolLifecycleOption(String key) {
        String normalized = key.toLowerCase(Locale.ROOT).replace("-", "").replace("_", "").trim();
        return normalized.equals("querytimeout")
                || normalized.equals("timeout")
                || normalized.equals("validationquery")
                || normalized.equals("connectiontestquery")
                || normalized.equals("maxpoolsize")
                || normalized.equals("maximumpoolsize")
                || normalized.equals("minimumidle")
                || normalized.equals("connectiontimeoutms")
                || normalized.equals("idletimeoutms")
                || normalized.equals("maxlifetimems")
                || normalized.equals("poolname");
    }

    private static String option(ConnectionConfigDto config, String optionKey) {
        if (config == null || config.options() == null) {
            return null;
        }
        String normalizedKey = normalizeOptionKey(optionKey);
        for (Map.Entry<String, String> entry : config.options().entrySet()) {
            if (entry.getKey() != null && normalizeOptionKey(entry.getKey()).equals(normalizedKey)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static String normalizeOptionKey(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replace("-", "").replace("_", "").trim();
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }
}
