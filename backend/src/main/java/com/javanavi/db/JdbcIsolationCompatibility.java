package com.javanavi.db;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Wrapper;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

public final class JdbcIsolationCompatibility {
    private JdbcIsolationCompatibility() {
    }

    public static Connection wrap(Connection connection, String driverType) {
        if (connection == null || Proxy.isProxyClass(connection.getClass())) {
            return connection;
        }
        ClassLoader classLoader = connection.getClass().getClassLoader();
        if (classLoader == null) {
            classLoader = Connection.class.getClassLoader();
        }
        return (Connection) Proxy.newProxyInstance(
                classLoader,
                connectionInterfaces(connection.getClass()),
                new IsolationInvocationHandler(connection, driverType)
        );
    }

    private static Class<?>[] connectionInterfaces(Class<?> type) {
        Set<Class<?>> interfaces = new LinkedHashSet<>();
        collectInterfaces(type, interfaces);
        interfaces.add(Connection.class);
        interfaces.add(Wrapper.class);
        return interfaces.toArray(Class<?>[]::new);
    }

    private static void collectInterfaces(Class<?> type, Set<Class<?>> interfaces) {
        if (type == null || type == Object.class) {
            return;
        }
        for (Class<?> iface : type.getInterfaces()) {
            interfaces.add(iface);
            collectInterfaces(iface, interfaces);
        }
        collectInterfaces(type.getSuperclass(), interfaces);
    }

    private static final class IsolationInvocationHandler implements InvocationHandler {
        private final Connection delegate;
        private final String validationQuery;
        private final boolean preferQueryValidation;
        private final int fallbackIsolation;
        private volatile boolean emulateIsolationApi;
        private volatile int emulatedIsolation;

        private IsolationInvocationHandler(Connection delegate, String driverType) {
            this.delegate = delegate;
            this.validationQuery = validationQuery(driverType);
            this.preferQueryValidation = validationQuery != null;
            this.fallbackIsolation = defaultIsolation(driverType);
            this.emulatedIsolation = this.fallbackIsolation;
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            String name = method.getName();
            if ("getTransactionIsolation".equals(name) && method.getParameterCount() == 0) {
                return getTransactionIsolation();
            }
            if ("setTransactionIsolation".equals(name) && method.getParameterCount() == 1) {
                setTransactionIsolation(args == null || args.length == 0 ? fallbackIsolation : (Integer) args[0]);
                return null;
            }
            if ("isValid".equals(name) && method.getParameterCount() == 1) {
                return isValid(args == null || args.length == 0 ? 1 : (Integer) args[0]);
            }
            if ("unwrap".equals(name) && method.getParameterCount() == 1 && args != null && args[0] instanceof Class<?> iface) {
                if (iface.isInstance(proxy)) {
                    return proxy;
                }
                if (iface.isInstance(delegate)) {
                    return delegate;
                }
            }
            if ("isWrapperFor".equals(name) && method.getParameterCount() == 1 && args != null && args[0] instanceof Class<?> iface) {
                return iface.isInstance(proxy) || iface.isInstance(delegate) || delegate.isWrapperFor(iface);
            }
            if ("toString".equals(name) && method.getParameterCount() == 0) {
                return delegate + " [jdbc-isolation-compat]";
            }
            try {
                return method.invoke(delegate, args);
            } catch (java.lang.reflect.InvocationTargetException error) {
                throw error.getCause();
            }
        }

        private boolean isValid(int timeoutSeconds) throws SQLException {
            if (delegate.isClosed()) {
                return false;
            }
            if (preferQueryValidation) {
                return validateWithQuery(timeoutSeconds);
            }
            try {
                return delegate.isValid(timeoutSeconds);
            } catch (SQLException error) {
                if (validationQuery == null || delegate.isClosed()) {
                    throw error;
                }
                return validateWithQuery(timeoutSeconds);
            }
        }

        private int getTransactionIsolation() throws SQLException {
            if (emulateIsolationApi) {
                return emulatedIsolation;
            }
            try {
                int level = delegate.getTransactionIsolation();
                if (isSupportedIsolation(level)) {
                    emulatedIsolation = level;
                    return level;
                }
                emulateIsolationApi = true;
                return emulatedIsolation;
            } catch (SQLException error) {
                if (!isIsolationCompatibilityIssue(error)) {
                    throw error;
                }
                emulateIsolationApi = true;
                return emulatedIsolation;
            }
        }

        private void setTransactionIsolation(int requestedLevel) throws SQLException {
            int level = isSupportedIsolation(requestedLevel) ? requestedLevel : emulatedIsolation;
            if (emulateIsolationApi) {
                emulatedIsolation = level;
                return;
            }
            try {
                delegate.setTransactionIsolation(level);
                emulatedIsolation = level;
            } catch (SQLException error) {
                if (!isIsolationCompatibilityIssue(error)) {
                    throw error;
                }
                emulateIsolationApi = true;
                emulatedIsolation = level;
            }
        }

        private boolean validateWithQuery(int timeoutSeconds) throws SQLException {
            try (Statement statement = delegate.createStatement()) {
                try {
                    statement.setQueryTimeout(Math.max(1, timeoutSeconds));
                } catch (SQLException ignored) {
                    // Some drivers do not support per-statement timeouts here.
                }
                statement.execute(validationQuery);
                return !delegate.isClosed();
            }
        }
    }

    private static boolean isSupportedIsolation(int level) {
        return level == Connection.TRANSACTION_NONE
                || level == Connection.TRANSACTION_READ_UNCOMMITTED
                || level == Connection.TRANSACTION_READ_COMMITTED
                || level == Connection.TRANSACTION_REPEATABLE_READ
                || level == Connection.TRANSACTION_SERIALIZABLE;
    }

    private static boolean isIsolationCompatibilityIssue(SQLException error) {
        if (error == null) {
            return false;
        }
        String message = error.getMessage();
        if (message == null) {
            return false;
        }
        String normalized = message.toLowerCase(Locale.ROOT);
        return normalized.contains("transaction isolation") || normalized.contains("isolation level");
    }

    private static int defaultIsolation(String driverType) {
        String driver = driverType == null ? "" : driverType.trim().toLowerCase(Locale.ROOT);
        return switch (driver) {
            case "mysql", "mariadb", "doris", "diros", "sphinx" -> Connection.TRANSACTION_REPEATABLE_READ;
            case "sqlite", "duckdb" -> Connection.TRANSACTION_SERIALIZABLE;
            case "clickhouse", "trino", "presto" -> Connection.TRANSACTION_NONE;
            default -> Connection.TRANSACTION_READ_COMMITTED;
        };
    }

    private static String validationQuery(String driverType) {
        String driver = driverType == null ? "" : driverType.trim().toLowerCase(Locale.ROOT);
        return switch (driver) {
            case "oracle" -> "SELECT 1 FROM DUAL";
            case "mysql", "mariadb", "doris", "diros", "sphinx",
                 "postgresql", "sqlserver", "dameng", "tdengine",
                 "clickhouse", "sqlite", "duckdb", "trino", "presto" -> "SELECT 1";
            default -> null;
        };
    }
}
