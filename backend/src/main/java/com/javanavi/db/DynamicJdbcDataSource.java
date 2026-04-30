package com.javanavi.db;

import com.javanavi.driver.JdbcDriverRuntimeService;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.Properties;
import java.util.logging.Logger;

final class DynamicJdbcDataSource implements DataSource {
    private final JdbcDriverRuntimeService driverRuntimeService;
    private final String driverType;
    private final String jdbcUrl;
    private final Properties defaultProperties;
    private volatile PrintWriter logWriter;
    private volatile int loginTimeout;

    DynamicJdbcDataSource(
            JdbcDriverRuntimeService driverRuntimeService,
            String driverType,
            String jdbcUrl,
            Properties defaultProperties
    ) {
        this.driverRuntimeService = driverRuntimeService;
        this.driverType = driverType;
        this.jdbcUrl = jdbcUrl;
        this.defaultProperties = new Properties();
        if (defaultProperties != null) {
            this.defaultProperties.putAll(defaultProperties);
        }
    }

    @Override
    public Connection getConnection() throws SQLException {
        return driverRuntimeService.openConnection(driverType, jdbcUrl, copyProperties(defaultProperties));
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        Properties properties = copyProperties(defaultProperties);
        if (username != null) {
            properties.setProperty("user", username);
        }
        if (password != null) {
            properties.setProperty("password", password);
        }
        return driverRuntimeService.openConnection(driverType, jdbcUrl, properties);
    }

    @Override
    public PrintWriter getLogWriter() {
        return logWriter;
    }

    @Override
    public void setLogWriter(PrintWriter out) {
        this.logWriter = out;
    }

    @Override
    public void setLoginTimeout(int seconds) {
        this.loginTimeout = Math.max(0, seconds);
    }

    @Override
    public int getLoginTimeout() {
        return loginTimeout;
    }

    @Override
    public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        throw new SQLFeatureNotSupportedException("Dynamic JDBC data source does not expose a parent logger.");
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        if (iface.isInstance(this)) {
            return iface.cast(this);
        }
        throw new SQLException("Dynamic JDBC data source cannot unwrap to " + iface.getName());
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) {
        return iface.isInstance(this);
    }

    private static Properties copyProperties(Properties source) {
        Properties copy = new Properties();
        if (source != null) {
            copy.putAll(source);
        }
        return copy;
    }
}
