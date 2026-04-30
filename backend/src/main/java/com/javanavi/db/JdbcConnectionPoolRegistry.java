package com.javanavi.db;

import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.ConnectionPoolStatusDto;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class JdbcConnectionPoolRegistry {
    private static final int DEFAULT_MAX_POOL_SIZE = 4;
    private static final int MIN_POOL_SIZE = 1;
    private static final int MAX_POOL_SIZE = 20;
    private static final long DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
    private static final long DEFAULT_IDLE_TIMEOUT_MS = 120_000;
    private static final long DEFAULT_MAX_LIFETIME_MS = 1_800_000;

    private final JdbcConnectionFactory jdbcConnectionFactory;
    private final ConcurrentMap<String, ManagedPool> pools = new ConcurrentHashMap<>();

    public JdbcConnectionPoolRegistry(JdbcConnectionFactory jdbcConnectionFactory) {
        this.jdbcConnectionFactory = jdbcConnectionFactory;
    }

    public Connection openConnection(ConnectionConfigDto config) throws SQLException {
        jdbcConnectionFactory.prepareDriver(config);
        ManagedPool pool = poolFor(config);
        try {
            return pool.openConnection();
        } catch (SQLException error) {
            discardFailedPoolIfUnused(pool);
            throw connectionFailure(config, error);
        }
    }

    public ConnectionPoolStatusDto openPool(ConnectionConfigDto config) throws SQLException {
        jdbcConnectionFactory.prepareDriver(config);
        ManagedPool pool = poolFor(config);
        boolean discardInvalidPool = false;
        try (Connection connection = pool.openConnection()) {
            if (!connection.isValid(3)) {
                discardInvalidPool = true;
                throw new SQLException("JDBC connection is not valid.");
            }
        } catch (SQLException error) {
            if (discardInvalidPool) {
                discardFailedPool(pool);
            } else {
                discardFailedPoolIfUnused(pool);
            }
            throw connectionFailure(config, error);
        }
        return pool.status();
    }

    public List<ConnectionPoolStatusDto> statuses() {
        List<ConnectionPoolStatusDto> statuses = new ArrayList<>();
        for (ManagedPool pool : pools.values()) {
            statuses.add(pool.status());
        }
        statuses.sort(Comparator.comparing(ConnectionPoolStatusDto::connectionId));
        return statuses;
    }

    public boolean closePool(String connectionId) {
        String id = requireConnectionId(connectionId);
        ManagedPool pool = pools.remove(id);
        if (pool == null) {
            return false;
        }
        pool.close();
        return true;
    }

    @PreDestroy
    public void closeAll() {
        for (ManagedPool pool : pools.values()) {
            pool.close();
        }
        pools.clear();
    }

    private ManagedPool poolFor(ConnectionConfigDto config) {
        if (!jdbcConnectionFactory.isSupportedExternalDriver(config)) {
            throw new IllegalArgumentException("Managed JDBC pools are currently available for mysql-compatible, postgresql-compatible, sqlite, and duckdb runtime profiles.");
        }
        String connectionId = connectionId(config);
        String fingerprint = fingerprint(config);
        return pools.compute(connectionId, (ignored, existing) -> {
            if (existing != null && existing.matches(fingerprint)) {
                existing.touch();
                return existing;
            }
            if (existing != null) {
                existing.close();
            }
            return createPool(connectionId, fingerprint, config);
        });
    }

    private ManagedPool createPool(String connectionId, String fingerprint, ConnectionConfigDto config) {
        Properties driverProperties = jdbcConnectionFactory.connectionProperties(config);

        String driver = jdbcConnectionFactory.normalizeDriver(config);
        boolean singleWriterFileDb = "sqlite".equals(driver) || "duckdb".equals(driver);
        int maxPoolSize = singleWriterFileDb ? 1 : boundedInt(config, "maxPoolSize", DEFAULT_MAX_POOL_SIZE, MIN_POOL_SIZE, MAX_POOL_SIZE);
        int minimumIdle = boundedInt(config, "minimumIdle", 0, 0, maxPoolSize);

        long connectionTimeoutMs = connectionTimeoutMs(config);
        applyDriverTimeoutProperties(config, driverProperties, connectionTimeoutMs);

        HikariConfig hikari = new HikariConfig();
        hikari.setDataSource(jdbcConnectionFactory.dataSource(config, driverProperties));
        hikari.setMaximumPoolSize(maxPoolSize);
        hikari.setMinimumIdle(minimumIdle);
        hikari.setConnectionTimeout(connectionTimeoutMs);
        hikari.setIdleTimeout(boundedLong(config, "idleTimeoutMs", DEFAULT_IDLE_TIMEOUT_MS, 10_000, 1_800_000));
        hikari.setMaxLifetime(boundedLong(config, "maxLifetimeMs", DEFAULT_MAX_LIFETIME_MS, 30_000, 7_200_000));
        hikari.setPoolName("javanavi-" + sanitizePoolName(connectionId) + "-" + fingerprint.substring(0, 8));
        hikari.setInitializationFailTimeout(-1);

        return new ManagedPool(
                connectionId,
                jdbcConnectionFactory.normalizeDriver(config),
                fingerprint,
                new HikariDataSource(hikari),
                maxPoolSize
        );
    }

    private String connectionId(ConnectionConfigDto config) {
        String explicit = firstText(config == null ? null : config.id(), config == null ? null : config.name());
        if (explicit != null) {
            return sanitizeConnectionId(explicit);
        }
        String publicIdentity = jdbcConnectionFactory.normalizeDriver(config)
                + "|" + nullToEmpty(config == null ? null : config.host())
                + "|" + String.valueOf(config == null ? null : config.port())
                + "|" + nullToEmpty(config == null ? null : config.database())
                + "|" + nullToEmpty(config == null ? null : config.username());
        return "adhoc-" + sha256Hex(publicIdentity).substring(0, 16);
    }

    private String fingerprint(ConnectionConfigDto config) {
        StringBuilder value = new StringBuilder();
        value.append(jdbcConnectionFactory.normalizeDriver(config)).append('\n');
        value.append(jdbcConnectionFactory.jdbcUrl(config)).append('\n');
        value.append(nullToEmpty(config == null ? null : config.username())).append('\n');
        value.append(nullToEmpty(config == null ? null : config.password())).append('\n');
        value.append(String.valueOf(config == null ? null : config.timeout())).append('\n');
        if (config != null && config.options() != null) {
            config.options().entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .forEach(entry -> value.append(entry.getKey()).append('=').append(entry.getValue()).append('\n'));
        }
        return sha256Hex(value.toString());
    }

    private void discardFailedPool(ManagedPool pool) {
        pools.remove(pool.connectionId, pool);
        pool.close();
    }

    private void discardFailedPoolIfUnused(ManagedPool pool) {
        if (pool.hasNoConnections()) {
            discardFailedPool(pool);
        }
    }

    private SQLException connectionFailure(ConnectionConfigDto config, SQLException error) {
        String message = "Unable to connect to " + connectionTarget(config)
                + " within " + connectionTimeoutMs(config) + "ms. "
                + "Check that the database service is running, host/port are reachable, and credentials are valid.";
        String cause = conciseCause(error);
        if (cause != null && !cause.isBlank()) {
            message += " Cause: " + cause;
        }
        return new SQLException(message, error.getSQLState(), error.getErrorCode(), error);
    }

    private String connectionTarget(ConnectionConfigDto config) {
        String driver = jdbcConnectionFactory.normalizeDriver(config);
        if (config != null && jdbcConnectionFactory.isCustomDsn(config)) {
            return "custom " + driver + " JDBC URL";
        }
        if ("sqlite".equals(driver)) {
            return "sqlite file " + firstText(
                    config == null ? null : config.dsn(),
                    config == null ? null : config.host(),
                    config == null ? null : config.database(),
                    config == null ? null : config.uri(),
                    "?"
            );
        }
        if ("duckdb".equals(driver)) {
            return "duckdb file " + firstText(
                    config == null ? null : config.dsn(),
                    config == null ? null : config.host(),
                    config == null ? null : config.database(),
                    config == null ? null : config.uri(),
                    "?"
            );
        }
        String host = firstText(config == null ? null : config.host(), "?");
        int port = config == null || config.port() == null || config.port() <= 0
                ? defaultPort(config == null ? null : jdbcConnectionFactory.logicalDriverType(config), driver)
                : config.port();
        String database = config == null || config.database() == null ? "" : config.database().trim();
        String databaseText = database.isBlank() ? "default database" : "database '" + database + "'";
        return driver + " at " + host + ":" + port + " (" + databaseText + ")";
    }

    private void applyDriverTimeoutProperties(ConnectionConfigDto config, Properties driverProperties, long connectionTimeoutMs) {
        String driver = normalizeDriverForTimeout(config == null ? null : jdbcConnectionFactory.logicalDriverType(config));
        if ("mysql".equals(driver)) {
            putIfAbsentIgnoreCase(driverProperties, "connectTimeout", String.valueOf(connectionTimeoutMs));
            putIfAbsentIgnoreCase(driverProperties, "socketTimeout", String.valueOf(Math.max(connectionTimeoutMs, 1_000L)));
        }
        if ("postgresql".equals(driver)) {
            long timeoutSeconds = Math.max(1L, Math.min(120L, (connectionTimeoutMs + 999L) / 1_000L));
            putIfAbsentIgnoreCase(driverProperties, "connectTimeout", String.valueOf(timeoutSeconds));
            putIfAbsentIgnoreCase(driverProperties, "socketTimeout", String.valueOf(timeoutSeconds));
        }
        if ("sqlserver".equals(driver)) {
            long timeoutSeconds = Math.max(1L, Math.min(120L, (connectionTimeoutMs + 999L) / 1_000L));
            putIfAbsentIgnoreCase(driverProperties, "loginTimeout", String.valueOf(timeoutSeconds));
            putIfAbsentIgnoreCase(driverProperties, "queryTimeout", String.valueOf(timeoutSeconds));
        }
        if ("oracle".equals(driver)) {
            putIfAbsentIgnoreCase(driverProperties, "oracle.net.CONNECT_TIMEOUT", String.valueOf(connectionTimeoutMs));
            putIfAbsentIgnoreCase(driverProperties, "oracle.jdbc.ReadTimeout", String.valueOf(Math.max(connectionTimeoutMs, 1_000L)));
        }
        if ("sqlite".equals(driver)) {
            putIfAbsentIgnoreCase(driverProperties, "busy_timeout", String.valueOf(Math.max(connectionTimeoutMs, 1_000L)));
        }
    }

    private static void putIfAbsentIgnoreCase(Properties properties, String key, String value) {
        for (Object existingKey : properties.keySet()) {
            if (existingKey != null && existingKey.toString().equalsIgnoreCase(key)) {
                return;
            }
        }
        properties.setProperty(key, value);
    }

    private static long connectionTimeoutMs(ConnectionConfigDto config) {
        String explicitMs = option(config, "connectionTimeoutMs");
        if (explicitMs != null) {
            return boundedLongValue(explicitMs, DEFAULT_CONNECTION_TIMEOUT_MS, 1_000, 120_000);
        }
        Integer rootTimeoutSeconds = config == null ? null : config.timeout();
        if (rootTimeoutSeconds != null && rootTimeoutSeconds > 0) {
            return Math.max(1_000L, Math.min(120_000L, rootTimeoutSeconds.longValue() * 1_000L));
        }
        String optionTimeoutSeconds = option(config, "timeout");
        if (optionTimeoutSeconds != null) {
            return Math.max(1_000L, Math.min(120_000L, boundedLongValue(optionTimeoutSeconds, DEFAULT_CONNECTION_TIMEOUT_MS / 1_000L, 1, 120) * 1_000L));
        }
        return DEFAULT_CONNECTION_TIMEOUT_MS;
    }

    private static int defaultPort(String driverType, String normalizedDriver) {
        String driver = driverType == null ? normalizedDriver : driverType.toLowerCase(Locale.ROOT).trim();
        return switch (driver) {
            case "postgres", "postgresql", "pg" -> 5432;
            case "mysql", "mariadb" -> 3306;
            case "doris", "diros" -> 9030;
            case "sphinx" -> 9306;
            case "kingbase", "kingbase8", "kingbasees", "kingbasev8" -> 54321;
            case "highgo" -> 5866;
            case "vastbase" -> 5432;
            case "oracle" -> 1521;
            case "sqlserver", "mssql", "sql_server" -> 1433;
            case "dameng", "dm", "dm8" -> 5236;
            case "tdengine", "taos", "taos-rs", "taos_rs" -> 6041;
            case "clickhouse" -> 8123;
            case "sqlite" -> 0;
            case "duckdb" -> 0;
            default -> switch (normalizedDriver) {
                case "postgresql" -> 5432;
                case "mysql" -> 3306;
                case "oracle" -> 1521;
                case "sqlserver" -> 1433;
                case "dameng" -> 5236;
                case "tdengine" -> 6041;
                case "clickhouse" -> 8123;
                default -> 0;
            };
        };
    }

    private static String normalizeDriverForTimeout(String driverType) {
        String driver = driverType == null ? "" : driverType.toLowerCase(Locale.ROOT).trim();
        return switch (driver) {
            case "postgres", "postgresql", "pg", "kingbase", "kingbase8", "kingbasees", "kingbasev8", "highgo", "vastbase" -> "postgresql";
            case "mysql", "mariadb", "doris", "diros", "sphinx" -> "mysql";
            case "oracle", "oracle11g", "oracle12c", "oracle19c", "oracle23ai" -> "oracle";
            case "sqlserver", "mssql", "sql_server", "sql server" -> "sqlserver";
            case "dameng", "dm", "dm8" -> "dameng";
            case "tdengine", "taos", "taos-rs", "taos_rs" -> "tdengine";
            case "clickhouse", "ch" -> "clickhouse";
            default -> driver;
        };
    }

    private static String conciseCause(Throwable error) {
        String fallback = null;
        Throwable current = error;
        while (current != null) {
            String message = oneLine(current.getMessage());
            if (message != null && !message.isBlank()) {
                fallback = message;
                if (!message.contains("Connection is not available")) {
                    return truncate(message, 360);
                }
            }
            current = current.getCause();
        }
        return truncate(fallback, 360);
    }

    private static String oneLine(String value) {
        return value == null ? null : value.replaceAll("\\s+", " ").trim();
    }

    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength - 1) + "…";
    }

    private static int boundedInt(ConnectionConfigDto config, String optionKey, int defaultValue, int min, int max) {
        String raw = option(config, optionKey);
        if (raw == null) {
            return defaultValue;
        }
        try {
            return Math.max(min, Math.min(max, Integer.parseInt(raw.trim())));
        } catch (NumberFormatException ignored) {
            return defaultValue;
        }
    }

    private static long boundedLong(ConnectionConfigDto config, String optionKey, long defaultValue, long min, long max) {
        return boundedLongValue(option(config, optionKey), defaultValue, min, max);
    }

    private static long boundedLongValue(String raw, long defaultValue, long min, long max) {
        if (raw == null) {
            return defaultValue;
        }
        try {
            return Math.max(min, Math.min(max, Long.parseLong(raw.trim())));
        } catch (NumberFormatException ignored) {
            return defaultValue;
        }
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

    private static String sanitizeConnectionId(String value) {
        String sanitized = value.trim().replaceAll("[^A-Za-z0-9_.:@-]", "-");
        if (sanitized.isBlank()) {
            throw new IllegalArgumentException("Connection id is required.");
        }
        return sanitized.length() > 96 ? sanitized.substring(0, 96) : sanitized;
    }

    private static String sanitizePoolName(String value) {
        String sanitized = sanitizeConnectionId(value).replaceAll("[^A-Za-z0-9_-]", "-");
        return sanitized.length() > 32 ? sanitized.substring(0, 32) : sanitized;
    }

    private static String requireConnectionId(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Connection id is required.");
        }
        return sanitizeConnectionId(value);
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is required for JavaNavi pool fingerprints.", error);
        }
    }

    private static final class ManagedPool {
        private final String connectionId;
        private final String driverType;
        private final String fingerprint;
        private final HikariDataSource dataSource;
        private final int maxPoolSize;
        private final Instant createdAt = Instant.now();
        private volatile Instant lastUsedAt = createdAt;

        private ManagedPool(
                String connectionId,
                String driverType,
                String fingerprint,
                HikariDataSource dataSource,
                int maxPoolSize
        ) {
            this.connectionId = connectionId;
            this.driverType = driverType;
            this.fingerprint = fingerprint;
            this.dataSource = dataSource;
            this.maxPoolSize = maxPoolSize;
        }

        private boolean matches(String nextFingerprint) {
            return fingerprint.equals(nextFingerprint) && !dataSource.isClosed();
        }

        private Connection openConnection() throws SQLException {
            touch();
            return dataSource.getConnection();
        }

        private void touch() {
            lastUsedAt = Instant.now();
        }

        private boolean hasNoConnections() {
            HikariPoolMXBean bean = dataSource.getHikariPoolMXBean();
            return bean == null || bean.getTotalConnections() == 0;
        }

        private ConnectionPoolStatusDto status() {
            HikariPoolMXBean bean = dataSource.getHikariPoolMXBean();
            return new ConnectionPoolStatusDto(
                    connectionId,
                    driverType,
                    true,
                    bean == null ? 0 : bean.getActiveConnections(),
                    bean == null ? 0 : bean.getIdleConnections(),
                    bean == null ? 0 : bean.getTotalConnections(),
                    maxPoolSize,
                    createdAt,
                    lastUsedAt
            );
        }

        private void close() {
            dataSource.close();
        }
    }
}
