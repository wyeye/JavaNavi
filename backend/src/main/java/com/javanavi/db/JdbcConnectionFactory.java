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

    public JdbcConnectionFactory() {
        this(null, new I18nMessages());
    }

    @Autowired
    public JdbcConnectionFactory(JdbcDriverRuntimeService driverRuntimeService, I18nMessages messages) {
        this.driverRuntimeService = driverRuntimeService;
        this.messages = messages;
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
        return JdbcIsolationCompatibility.wrap(
                requireDriverRuntimeService().openConnection(normalizeDriver(config), jdbcUrl(config), connectionProperties(config)),
                normalizeDriver(config)
        );
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
                    + "?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true";
            case "postgresql" -> "jdbc:postgresql://" + host + ":" + port + "/" + database;
            case "oracle" -> "jdbc:oracle:thin:@//" + host + ":" + port + "/" + requireText(database, "database");
            case "sqlserver" -> "jdbc:sqlserver://" + host + ":" + port + ";databaseName=" + database
                    + ";encrypt=false;trustServerCertificate=true";
            case "dameng" -> "jdbc:dm://" + host + ":" + port;
            case "tdengine" -> "jdbc:TAOS-RS://" + host + ":" + port + "/" + database;
            case "clickhouse" -> "jdbc:clickhouse://" + host + ":" + port + "/" + database;
            default -> throw new IllegalArgumentException(messages.message("drivers.unsupportedType", "type", driver));
        };
    }

    public Properties connectionProperties(ConnectionConfigDto config) {
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
        String driver = normalizeDriver(config);
        if ("dameng".equals(driver)) {
            String schema = damengSchema(config);
            if (schema != null && !schema.isBlank()) {
                putIfAbsentIgnoreCase(properties, "schema", schema);
            }
        }
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
