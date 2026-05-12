package com.javanavi.db;

import com.javanavi.model.ConnectionConfigDto;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.Properties;
import java.util.logging.Logger;

final class SshTunnelJdbcDataSource implements DataSource {
    private final JdbcConnectionFactory jdbcConnectionFactory;
    private final ConnectionConfigDto config;
    private final Properties defaultProperties;
    private volatile PrintWriter logWriter;
    private volatile int loginTimeout;

    SshTunnelJdbcDataSource(JdbcConnectionFactory jdbcConnectionFactory, ConnectionConfigDto config, Properties defaultProperties) {
        this.jdbcConnectionFactory = jdbcConnectionFactory;
        this.config = config;
        this.defaultProperties = new Properties();
        if (defaultProperties != null) {
            this.defaultProperties.putAll(defaultProperties);
        }
    }

    @Override
    public Connection getConnection() throws SQLException {
        ConnectionNetworkTunnelService.TunnelLease tunnelLease = jdbcConnectionFactory.networkTunnelService().openSshTunnel(config);
        try {
            ConnectionConfigDto effective = config.withEndpoint("127.0.0.1", tunnelLease.localPort());
            Properties properties = copyProperties(defaultProperties);
            Connection connection = jdbcConnectionFactory.openRawConnection(effective, properties);
            return TunnelBoundConnection.wrap(connection, tunnelLease);
        } catch (SQLException | RuntimeException error) {
            tunnelLease.close();
            throw error;
        }
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
        ConnectionNetworkTunnelService.TunnelLease tunnelLease = jdbcConnectionFactory.networkTunnelService().openSshTunnel(config);
        try {
            ConnectionConfigDto effective = config.withEndpoint("127.0.0.1", tunnelLease.localPort());
            Connection connection = jdbcConnectionFactory.openRawConnection(effective, properties);
            return TunnelBoundConnection.wrap(connection, tunnelLease);
        } catch (SQLException | RuntimeException error) {
            tunnelLease.close();
            throw error;
        }
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
        throw new SQLFeatureNotSupportedException("SSH tunnel JDBC data source does not expose a parent logger.");
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        if (iface.isInstance(this)) {
            return iface.cast(this);
        }
        throw new SQLException("SSH tunnel JDBC data source cannot unwrap to " + iface.getName());
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
