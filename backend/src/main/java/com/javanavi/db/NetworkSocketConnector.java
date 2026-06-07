package com.javanavi.db;

import com.javanavi.model.ConnectionConfigDto;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketAddress;
import java.net.SocketException;
import java.util.Properties;

public class NetworkSocketConnector {
    private final ConnectionNetworkTunnelService tunnelService;

    public NetworkSocketConnector() {
        this(new ConnectionNetworkTunnelService());
    }

    NetworkSocketConnector(ConnectionNetworkTunnelService tunnelService) {
        this.tunnelService = tunnelService == null ? new ConnectionNetworkTunnelService() : tunnelService;
    }

    public Socket openSocket(ConnectionConfigDto config, int timeoutMillis) throws IOException {
        String host = requireHost(config);
        int port = requirePort(config);
        int timeout = Math.max(1, timeoutMillis);
        ConnectionNetworkTunnelService.validateJdbcNetwork(config);
        if (config != null && config.sshEnabled()) {
            ConnectionNetworkTunnelService.TunnelLease lease = tunnelService.openSshTunnel(config);
            try {
                Socket socket = openDirectSocket("127.0.0.1", lease.localPort(), timeout);
                return new LeaseBoundSocket(socket, lease);
            } catch (IOException | RuntimeException error) {
                lease.close();
                throw error;
            }
        }
        ConnectionNetworkTunnelService.JdbcProxyEndpoint proxy = ConnectionNetworkTunnelService.jdbcProxyEndpoint(config);
        if (proxy != null) {
            Socket socket = new ProxySocketFactory(proxyProperties(proxy)).createSocket();
            socket.connect(InetSocketAddress.createUnresolved(host, port), timeout);
            socket.setSoTimeout(timeout);
            return socket;
        }
        return openDirectSocket(host, port, timeout);
    }

    private static Socket openDirectSocket(String host, int port, int timeoutMillis) throws IOException {
        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress(host, port), timeoutMillis);
            socket.setSoTimeout(timeoutMillis);
            return socket;
        } catch (IOException | RuntimeException error) {
            try {
                socket.close();
            } catch (IOException ignored) {
                // best effort cleanup before surfacing the connection failure
            }
            throw error;
        }
    }

    private static Properties proxyProperties(ConnectionNetworkTunnelService.JdbcProxyEndpoint proxy) {
        Properties properties = new Properties();
        properties.setProperty("javanavi.proxy.type", proxy.type());
        properties.setProperty("javanavi.proxy.host", proxy.host());
        properties.setProperty("javanavi.proxy.port", String.valueOf(proxy.port()));
        if (proxy.user() != null) {
            properties.setProperty("javanavi.proxy.user", proxy.user());
        }
        if (proxy.password() != null) {
            properties.setProperty("javanavi.proxy.password", proxy.password());
        }
        return properties;
    }

    private static String requireHost(ConnectionConfigDto config) {
        String host = config == null ? null : trimToNull(config.host());
        if (host == null) {
            throw new IllegalArgumentException("Network target host is required.");
        }
        return host;
    }

    private static int requirePort(ConnectionConfigDto config) {
        Integer port = config == null ? null : config.port();
        if (port == null || port < 1 || port > 65535) {
            throw new IllegalArgumentException("Network target port must be in 1-65535.");
        }
        return port;
    }

    private static String trimToNull(String value) {
        return value == null || value.trim().isBlank() ? null : value.trim();
    }

    private static final class LeaseBoundSocket extends Socket {
        private final Socket delegate;
        private final ConnectionNetworkTunnelService.TunnelLease lease;

        private LeaseBoundSocket(Socket delegate, ConnectionNetworkTunnelService.TunnelLease lease) {
            this.delegate = delegate;
            this.lease = lease;
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return delegate.getInputStream();
        }

        @Override
        public OutputStream getOutputStream() throws IOException {
            return delegate.getOutputStream();
        }

        @Override
        public synchronized void setSoTimeout(int timeout) throws SocketException {
            delegate.setSoTimeout(timeout);
        }

        @Override
        public synchronized int getSoTimeout() throws SocketException {
            return delegate.getSoTimeout();
        }

        @Override
        public void setTcpNoDelay(boolean on) throws SocketException {
            delegate.setTcpNoDelay(on);
        }

        @Override
        public boolean getTcpNoDelay() throws SocketException {
            return delegate.getTcpNoDelay();
        }

        @Override
        public InetAddress getInetAddress() {
            return delegate.getInetAddress();
        }

        @Override
        public InetAddress getLocalAddress() {
            return delegate.getLocalAddress();
        }

        @Override
        public int getPort() {
            return delegate.getPort();
        }

        @Override
        public int getLocalPort() {
            return delegate.getLocalPort();
        }

        @Override
        public SocketAddress getRemoteSocketAddress() {
            return delegate.getRemoteSocketAddress();
        }

        @Override
        public SocketAddress getLocalSocketAddress() {
            return delegate.getLocalSocketAddress();
        }

        @Override
        public boolean isConnected() {
            return delegate.isConnected();
        }

        @Override
        public boolean isClosed() {
            return delegate.isClosed();
        }

        @Override
        public synchronized void close() throws IOException {
            try {
                delegate.close();
            } finally {
                lease.close();
            }
        }
    }
}
