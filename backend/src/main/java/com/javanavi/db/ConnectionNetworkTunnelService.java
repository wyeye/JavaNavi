package com.javanavi.db;

import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.security.SecretRedactor;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.ServerSocket;
import java.util.Locale;
import java.util.Properties;
import java.util.function.Function;

@Component
class ConnectionNetworkTunnelService {
    private static final String UNSUPPORTED_PROXY_MESSAGE = "Proxy / HTTP Tunnel runtime is not supported yet. Disable Proxy / HTTP Tunnel or use SSH tunnel.";

    <T> T withJdbcNetwork(ConnectionConfigDto config, Function<ConnectionConfigDto, T> action) {
        if (config == null) {
            return action.apply(null);
        }
        rejectUnsupported(config);
        if (!config.sshEnabled()) {
            return action.apply(config);
        }
        try (TunnelLease tunnelLease = openSshTunnel(config)) {
            return action.apply(config.withEndpoint("127.0.0.1", tunnelLease.localPort()));
        }
    }

    TunnelLease openSshTunnel(ConnectionConfigDto config) {
        ConnectionConfigDto.NetworkCredentialConfigDto ssh = config.effectiveSsh();
        if (ssh == null) {
            throw new IllegalArgumentException("SSH tunnel config is required.");
        }
        String sshHost = requireText(ssh.host(), "SSH host");
        String sshUser = requireText(ssh.user(), "SSH user");
        int sshPort = validPort(ssh.port(), 22, "SSH port");
        String targetHost = requireText(config.host(), "database host");
        int targetPort = validPort(config.port(), defaultDatabasePort(config), "database port");
        int localPort = freeLocalPort();
        try {
            JSch jsch = new JSch();
            String keyPath = text(ssh.keyPath());
            if (keyPath != null) {
                String password = text(ssh.password());
                if (password == null) {
                    jsch.addIdentity(keyPath);
                } else {
                    jsch.addIdentity(keyPath, password);
                }
            }
            Session session = jsch.getSession(sshUser, sshHost, sshPort);
            String password = text(ssh.password());
            if (password != null && keyPath == null) {
                session.setPassword(password);
            }
            Properties properties = new Properties();
            properties.setProperty("StrictHostKeyChecking", "no");
            session.setConfig(properties);
            session.connect(Math.max(5_000, timeoutMillis(config)));
            int assignedPort = session.setPortForwardingL("127.0.0.1", localPort, targetHost, targetPort);
            return new TunnelLease(session, assignedPort);
        } catch (JSchException error) {
            throw new IllegalArgumentException("SSH tunnel failed: " + SecretRedactor.redact(error.getMessage()), error);
        }
    }

    void rejectUnsupported(ConnectionConfigDto config) {
        if (Boolean.TRUE.equals(config.useProxy()) || Boolean.TRUE.equals(config.useHttpTunnel()) || config.proxyEnabled() || config.httpTunnelEnabled()) {
            throw new IllegalArgumentException(UNSUPPORTED_PROXY_MESSAGE);
        }
    }

    private static int freeLocalPort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        } catch (IOException error) {
            throw new IllegalStateException("Unable to allocate local SSH tunnel port.", error);
        }
    }

    private static int timeoutMillis(ConnectionConfigDto config) {
        int seconds = config == null || config.timeout() == null || config.timeout() <= 0 ? 30 : Math.min(config.timeout(), 300);
        return seconds * 1000;
    }

    private static int validPort(Integer value, int fallback, String label) {
        int port = value == null || value <= 0 ? fallback : value;
        if (port < 1 || port > 65535) {
            throw new IllegalArgumentException(label + " must be in 1-65535.");
        }
        return port;
    }

    private static int defaultDatabasePort(ConnectionConfigDto config) {
        String driver = config == null || config.driverType() == null ? "" : config.driverType().toLowerCase(Locale.ROOT).trim();
        return switch (driver) {
            case "postgres", "postgresql", "pg", "vastbase", "highgo" -> 5432;
            case "oracle" -> 1521;
            case "sqlserver", "mssql" -> 1433;
            case "dameng", "dm" -> 5236;
            case "clickhouse" -> 8123;
            case "tdengine", "taos" -> 6041;
            default -> 3306;
        };
    }

    private static String requireText(String value, String label) {
        String text = text(value);
        if (text == null) {
            throw new IllegalArgumentException(label + " is required.");
        }
        return text;
    }

    private static String text(String value) {
        return value == null || value.trim().isBlank() ? null : value.trim();
    }

    static final class TunnelLease implements AutoCloseable {
        private final Session session;
        private final int localPort;

        TunnelLease(Session session, int localPort) {
            this.session = session;
            this.localPort = localPort;
        }

        int localPort() {
            return localPort;
        }

        @Override
        public void close() {
            if (session != null && session.isConnected()) {
                session.disconnect();
            }
        }
    }
}
