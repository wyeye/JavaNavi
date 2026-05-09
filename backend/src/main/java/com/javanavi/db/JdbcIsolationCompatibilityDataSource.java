package com.javanavi.db;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.logging.Logger;

final class JdbcIsolationCompatibilityDataSource implements DataSource {
    private final DataSource delegate;
    private final String driverType;

    JdbcIsolationCompatibilityDataSource(DataSource delegate, String driverType) {
        this.delegate = delegate;
        this.driverType = driverType;
    }

    @Override
    public Connection getConnection() throws SQLException {
        return JdbcIsolationCompatibility.wrap(delegate.getConnection(), driverType);
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return JdbcIsolationCompatibility.wrap(delegate.getConnection(username, password), driverType);
    }

    @Override
    public PrintWriter getLogWriter() throws SQLException {
        return delegate.getLogWriter();
    }

    @Override
    public void setLogWriter(PrintWriter out) throws SQLException {
        delegate.setLogWriter(out);
    }

    @Override
    public void setLoginTimeout(int seconds) throws SQLException {
        delegate.setLoginTimeout(seconds);
    }

    @Override
    public int getLoginTimeout() throws SQLException {
        return delegate.getLoginTimeout();
    }

    @Override
    public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        return delegate.getParentLogger();
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        if (iface.isInstance(this)) {
            return iface.cast(this);
        }
        if (iface.isInstance(delegate)) {
            return iface.cast(delegate);
        }
        return delegate.unwrap(iface);
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) throws SQLException {
        return iface.isInstance(this) || iface.isInstance(delegate) || delegate.isWrapperFor(iface);
    }
}
