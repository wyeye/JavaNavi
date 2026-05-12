package com.javanavi.db;

import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.security.SecretRedactor;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Properties;
import java.util.function.Function;

@Component
class ConnectionNetworkTunnelService {
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
        validateJdbcNetwork(config);
    }

    static void validateJdbcNetwork(ConnectionConfigDto config) {
        jdbcProxyEndpoint(config);
    }

    static JdbcProxyEndpoint jdbcProxyEndpoint(ConnectionConfigDto config) {
        if (config == null) {
            return null;
        }
        boolean proxyRequested = Boolean.TRUE.equals(config.useProxy()) || config.proxyEnabled();
        boolean httpTunnelRequested = Boolean.TRUE.equals(config.useHttpTunnel()) || config.httpTunnelEnabled();
        if (config.sshEnabled() && (proxyRequested || httpTunnelRequested)) {
            throw new IllegalArgumentException("SSH tunnel and Proxy / HTTP Tunnel are mutually exclusive.");
        }
        if (proxyRequested && httpTunnelRequested) {
            throw new IllegalArgumentException("Proxy and HTTP Tunnel are mutually exclusive.");
        }
        if (proxyRequested) {
            ConnectionConfigDto.NetworkProxyConfigDto proxy = config.proxy();
            if (proxy == null) {
                throw new IllegalArgumentException("Proxy config is required.");
            }
            return jdbcProxyEndpoint(proxy);
        }
        if (httpTunnelRequested) {
            ConnectionConfigDto.NetworkHttpTunnelConfigDto tunnel = config.httpTunnel();
            if (tunnel == null) {
                throw new IllegalArgumentException("HTTP Tunnel config is required.");
            }
            String host = requireText(tunnel.host(), "HTTP Tunnel host");
            int port = validPort(tunnel.port(), 8080, "HTTP Tunnel port");
            return new JdbcProxyEndpoint("http-connect", host, port, text(tunnel.user()), text(tunnel.password()));
        }
        if (config.sshEnabled()) {
            return null;
        }
        ConnectionConfigDto.NetworkProxyConfigDto globalProxy = config.globalProxy();
        if (globalProxy != null && text(globalProxy.host()) != null) {
            return jdbcProxyEndpoint(globalProxy);
        }
        return null;
    }

    static JdbcProxyEndpoint jdbcProxyEndpoint(ConnectionConfigDto.NetworkProxyConfigDto proxy) {
        if (proxy == null) {
            return null;
        }
        String type = normalizeProxyType(proxy.type());
        String host = requireText(proxy.host(), "Proxy host");
        int port = validPort(proxy.port(), defaultProxyPort(type), "Proxy port");
        return new JdbcProxyEndpoint(type, host, port, text(proxy.user()), text(proxy.password()));
    }

    private static String normalizeProxyType(String value) {
        String type = value == null ? "socks5" : value.toLowerCase(Locale.ROOT).replace("_", "-").trim();
        return switch (type) {
            case "", "socks", "socks5" -> "socks5";
            case "http", "http-connect", "https" -> "http";
            default -> throw new IllegalArgumentException("Proxy type must be socks5 or http.");
        };
    }

    private static int defaultProxyPort(String type) {
        return "http".equals(type) || "http-connect".equals(type) ? 8080 : 1080;
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

    record JdbcProxyEndpoint(String type, String host, int port, String user, String password) {
        String encoded() {
            String value = type + "\n" + host + "\n" + port + "\n" + nullToEmpty(user) + "\n" + nullToEmpty(password);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
        }

        private static String nullToEmpty(String value) {
            return value == null ? "" : value;
        }
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
