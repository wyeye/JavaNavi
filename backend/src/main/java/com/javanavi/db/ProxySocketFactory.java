package com.javanavi.db;

import javax.net.SocketFactory;
import java.io.Closeable;
import java.io.FilterInputStream;
import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketAddress;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Properties;

public class ProxySocketFactory extends SocketFactory {
    private final ProxyEndpoint endpoint;

    public ProxySocketFactory() {
        this.endpoint = null;
    }

    public ProxySocketFactory(String encodedEndpoint) {
        this.endpoint = ProxyEndpoint.decode(encodedEndpoint);
    }

    public ProxySocketFactory(Properties properties) {
        this.endpoint = ProxyEndpoint.from(properties);
    }

    @Override
    public Socket createSocket() throws IOException {
        return new TunnelSocket(requireEndpoint());
    }

    @Override
    public Socket createSocket(String host, int port) throws IOException {
        Socket socket = createSocket();
        socket.connect(InetSocketAddress.createUnresolved(host, port));
        return socket;
    }

    @Override
    public Socket createSocket(String host, int port, InetAddress localHost, int localPort) throws IOException {
        Socket socket = createSocket();
        socket.bind(new InetSocketAddress(localHost, localPort));
        socket.connect(InetSocketAddress.createUnresolved(host, port));
        return socket;
    }

    @Override
    public Socket createSocket(InetAddress host, int port) throws IOException {
        Socket socket = createSocket();
        socket.connect(new InetSocketAddress(host, port));
        return socket;
    }

    @Override
    public Socket createSocket(InetAddress address, int port, InetAddress localAddress, int localPort) throws IOException {
        Socket socket = createSocket();
        socket.bind(new InetSocketAddress(localAddress, localPort));
        socket.connect(new InetSocketAddress(address, port));
        return socket;
    }

    String httpConnectRequest(String host, int port) throws IOException {
        return httpConnectRequest(requireEndpoint(), host, port);
    }

    byte[] socks5Greeting() throws IOException {
        return socks5Greeting(requireEndpoint());
    }

    byte[] socks5Authentication() throws IOException {
        return socks5Authentication(requireEndpoint());
    }

    private ProxyEndpoint requireEndpoint() throws UnknownHostException {
        if (endpoint == null) {
            throw new UnknownHostException("Proxy endpoint config is required.");
        }
        return endpoint;
    }

    private static String httpConnectRequest(ProxyEndpoint endpoint, String host, int port) {
        StringBuilder request = new StringBuilder();
        request.append("CONNECT ").append(host).append(':').append(port).append(" HTTP/1.1\r\n");
        request.append("Host: ").append(host).append(':').append(port).append("\r\n");
        String credentials = credentials(endpoint);
        if (credentials != null) {
            request.append("Proxy-Authorization: Basic ")
                    .append(Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8)))
                    .append("\r\n");
        }
        request.append("\r\n");
        return request.toString();
    }

    private static byte[] socks5Greeting(ProxyEndpoint endpoint) {
        return credentials(endpoint) == null
                ? new byte[]{0x05, 0x01, 0x00}
                : new byte[]{0x05, 0x02, 0x00, 0x02};
    }

    private static byte[] socks5Authentication(ProxyEndpoint endpoint) throws IOException {
        String user = endpoint.user() == null ? "" : endpoint.user();
        String password = endpoint.password() == null ? "" : endpoint.password();
        byte[] userBytes = user.getBytes(StandardCharsets.UTF_8);
        byte[] passwordBytes = password.getBytes(StandardCharsets.UTF_8);
        if (userBytes.length > 255 || passwordBytes.length > 255) {
            throw new IOException("SOCKS5 proxy credentials must be 255 bytes or fewer.");
        }
        byte[] value = new byte[3 + userBytes.length + passwordBytes.length];
        value[0] = 0x01;
        value[1] = (byte) userBytes.length;
        System.arraycopy(userBytes, 0, value, 2, userBytes.length);
        value[2 + userBytes.length] = (byte) passwordBytes.length;
        System.arraycopy(passwordBytes, 0, value, 3 + userBytes.length, passwordBytes.length);
        return value;
    }

    private static String credentials(ProxyEndpoint endpoint) {
        if (endpoint.user() == null && endpoint.password() == null) {
            return null;
        }
        return (endpoint.user() == null ? "" : endpoint.user()) + ":" + (endpoint.password() == null ? "" : endpoint.password());
    }

    private static String targetHost(SocketAddress endpoint) {
        if (endpoint instanceof InetSocketAddress address) {
            return address.isUnresolved() ? address.getHostString() : address.getAddress().getHostAddress();
        }
        throw new IllegalArgumentException("Unsupported socket address type.");
    }

    private static int targetPort(SocketAddress endpoint) {
        if (endpoint instanceof InetSocketAddress address) {
            return address.getPort();
        }
        throw new IllegalArgumentException("Unsupported socket address type.");
    }

    private static final class TunnelSocket extends Socket {
        private final ProxyEndpoint endpoint;
        private Socket delegate;
        private boolean closed;

        private TunnelSocket(ProxyEndpoint endpoint) {
            this.endpoint = endpoint;
        }

        @Override
        public synchronized void connect(SocketAddress remote) throws IOException {
            connect(remote, 0);
        }

        @Override
        public synchronized void connect(SocketAddress remote, int timeout) throws IOException {
            if (isClosed()) {
                throw new SocketException("Socket is closed.");
            }
            if (isConnected()) {
                throw new SocketException("Socket is already connected.");
            }
            Socket socket = delegate == null ? new Socket() : delegate;
            if (!socket.isConnected()) {
                socket.connect(new InetSocketAddress(endpoint.host(), endpoint.port()), timeout);
            }
            String host = targetHost(remote);
            int port = targetPort(remote);
            if ("socks5".equals(endpoint.type())) {
                connectSocks5(socket, host, port);
            } else {
                connectHttp(socket, host, port);
            }
            delegate = socket;
        }

        @Override
        public void bind(SocketAddress bindpoint) throws IOException {
            ensureDelegate().bind(bindpoint);
        }

        @Override
        public InetAddress getInetAddress() {
            return delegate == null ? null : delegate.getInetAddress();
        }

        @Override
        public InetAddress getLocalAddress() {
            return delegate == null ? null : delegate.getLocalAddress();
        }

        @Override
        public int getPort() {
            return delegate == null ? 0 : delegate.getPort();
        }

        @Override
        public int getLocalPort() {
            return delegate == null ? -1 : delegate.getLocalPort();
        }

        @Override
        public SocketAddress getRemoteSocketAddress() {
            return delegate == null ? null : delegate.getRemoteSocketAddress();
        }

        @Override
        public SocketAddress getLocalSocketAddress() {
            return delegate == null ? null : delegate.getLocalSocketAddress();
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return new CloseShieldInputStream(ensureDelegate().getInputStream());
        }

        @Override
        public OutputStream getOutputStream() throws IOException {
            return new CloseShieldOutputStream(ensureDelegate().getOutputStream());
        }

        @Override
        public void setTcpNoDelay(boolean on) throws SocketException {
            try {
                ensureDelegate().setTcpNoDelay(on);
            } catch (SocketException error) {
                throw error;
            } catch (IOException error) {
                throw new SocketException(error.getMessage());
            }
        }

        @Override
        public boolean getTcpNoDelay() throws SocketException {
            return ensureDelegateSocketException().getTcpNoDelay();
        }

        @Override
        public void setSoLinger(boolean on, int linger) throws SocketException {
            ensureDelegateSocketException().setSoLinger(on, linger);
        }

        @Override
        public int getSoLinger() throws SocketException {
            return ensureDelegateSocketException().getSoLinger();
        }

        @Override
        public synchronized void setSoTimeout(int timeout) throws SocketException {
            ensureDelegateSocketException().setSoTimeout(timeout);
        }

        @Override
        public synchronized int getSoTimeout() throws SocketException {
            return ensureDelegateSocketException().getSoTimeout();
        }

        @Override
        public synchronized void setSendBufferSize(int size) throws SocketException {
            ensureDelegateSocketException().setSendBufferSize(size);
        }

        @Override
        public synchronized int getSendBufferSize() throws SocketException {
            return ensureDelegateSocketException().getSendBufferSize();
        }

        @Override
        public synchronized void setReceiveBufferSize(int size) throws SocketException {
            ensureDelegateSocketException().setReceiveBufferSize(size);
        }

        @Override
        public synchronized int getReceiveBufferSize() throws SocketException {
            return ensureDelegateSocketException().getReceiveBufferSize();
        }

        @Override
        public void setKeepAlive(boolean on) throws SocketException {
            ensureDelegateSocketException().setKeepAlive(on);
        }

        @Override
        public boolean getKeepAlive() throws SocketException {
            return ensureDelegateSocketException().getKeepAlive();
        }

        @Override
        public void setTrafficClass(int tc) throws SocketException {
            ensureDelegateSocketException().setTrafficClass(tc);
        }

        @Override
        public int getTrafficClass() throws SocketException {
            return ensureDelegateSocketException().getTrafficClass();
        }

        @Override
        public void setReuseAddress(boolean on) throws SocketException {
            ensureDelegateSocketException().setReuseAddress(on);
        }

        @Override
        public boolean getReuseAddress() throws SocketException {
            return ensureDelegateSocketException().getReuseAddress();
        }

        @Override
        public synchronized void close() throws IOException {
            closed = true;
            if (delegate != null) {
                delegate.close();
            }
        }

        @Override
        public void shutdownInput() throws IOException {
            ensureDelegate().shutdownInput();
        }

        @Override
        public void shutdownOutput() throws IOException {
            ensureDelegate().shutdownOutput();
        }

        @Override
        public boolean isConnected() {
            return delegate != null && delegate.isConnected() && !delegate.isClosed();
        }

        @Override
        public boolean isBound() {
            return delegate != null && delegate.isBound();
        }

        @Override
        public boolean isClosed() {
            return closed || delegate != null && delegate.isClosed();
        }

        @Override
        public boolean isInputShutdown() {
            return delegate != null && delegate.isInputShutdown();
        }

        @Override
        public boolean isOutputShutdown() {
            return delegate != null && delegate.isOutputShutdown();
        }

        private Socket ensureDelegate() throws IOException {
            if (delegate == null) {
                delegate = new Socket();
            }
            return delegate;
        }

        private Socket ensureDelegateSocketException() throws SocketException {
            if (delegate == null) {
                delegate = new Socket();
            }
            return delegate;
        }

        private void connectHttp(Socket socket, String host, int port) throws IOException {
            OutputStream output = socket.getOutputStream();
            output.write(httpConnectRequest(endpoint, host, port).getBytes(StandardCharsets.ISO_8859_1));
            output.flush();

            String response = readHttpResponse(socket.getInputStream());
            int status = httpStatus(response);
            if (status < 200 || status >= 300) {
                throw new IOException("HTTP CONNECT proxy failed with status " + status + ".");
            }
        }

        private void connectSocks5(Socket socket, String host, int port) throws IOException {
            InputStream input = socket.getInputStream();
            OutputStream output = socket.getOutputStream();
            output.write(socks5Greeting(endpoint));
            output.flush();

            byte[] method = readBytes(input, 2);
            if (method[0] != 0x05) {
                throw new IOException("SOCKS5 proxy returned invalid version.");
            }
            if (method[1] == 0x02) {
                output.write(socks5Authentication(endpoint));
                output.flush();
                byte[] auth = readBytes(input, 2);
                if (auth[1] != 0x00) {
                    throw new IOException("SOCKS5 proxy authentication failed.");
                }
            } else if (method[1] != 0x00) {
                throw new IOException("SOCKS5 proxy did not accept authentication method.");
            }

            output.write(socks5ConnectRequest(host, port));
            output.flush();
            byte[] header = readBytes(input, 4);
            if (header[1] != 0x00) {
                throw new IOException("SOCKS5 proxy connect failed with status " + (header[1] & 0xff) + ".");
            }
            int addressLength = switch (header[3] & 0xff) {
                case 0x01 -> 4;
                case 0x03 -> input.read();
                case 0x04 -> 16;
                default -> throw new IOException("SOCKS5 proxy returned invalid address type.");
            };
            readBytes(input, addressLength + 2);
        }

        private static byte[] socks5ConnectRequest(String host, int port) throws IOException {
            byte[] hostBytes = host.getBytes(StandardCharsets.UTF_8);
            if (hostBytes.length > 255) {
                throw new IOException("SOCKS5 target host must be 255 bytes or fewer.");
            }
            byte[] value = new byte[7 + hostBytes.length];
            value[0] = 0x05;
            value[1] = 0x01;
            value[2] = 0x00;
            value[3] = 0x03;
            value[4] = (byte) hostBytes.length;
            System.arraycopy(hostBytes, 0, value, 5, hostBytes.length);
            value[5 + hostBytes.length] = (byte) ((port >> 8) & 0xff);
            value[6 + hostBytes.length] = (byte) (port & 0xff);
            return value;
        }
    }

    private static String readHttpResponse(InputStream input) throws IOException {
        StringBuilder builder = new StringBuilder();
        int matched = 0;
        int b;
        while ((b = input.read()) >= 0) {
            builder.append((char) b);
            matched = switch (matched) {
                case 0 -> b == '\r' ? 1 : 0;
                case 1 -> b == '\n' ? 2 : b == '\r' ? 1 : 0;
                case 2 -> b == '\r' ? 3 : 0;
                case 3 -> b == '\n' ? 4 : b == '\r' ? 1 : 0;
                default -> matched;
            };
            if (matched == 4) {
                break;
            }
            if (builder.length() > 16_384) {
                throw new IOException("HTTP proxy response headers are too large.");
            }
        }
        return builder.toString();
    }

    private static int httpStatus(String response) throws IOException {
        String[] parts = response.split("\\s+", 3);
        if (parts.length < 2) {
            throw new IOException("HTTP CONNECT proxy returned invalid response.");
        }
        try {
            return Integer.parseInt(parts[1]);
        } catch (NumberFormatException error) {
            throw new IOException("HTTP CONNECT proxy returned invalid status.", error);
        }
    }

    private static byte[] readBytes(InputStream input, int length) throws IOException {
        byte[] value = input.readNBytes(length);
        if (value.length != length) {
            throw new IOException("Unexpected end of stream.");
        }
        return value;
    }

    private static final class CloseShieldInputStream extends FilterInputStream {
        private CloseShieldInputStream(InputStream in) {
            super(in);
        }

        @Override
        public void close() {
            // Drivers may replace streams during TLS negotiation; keep the socket alive.
        }
    }

    private static final class CloseShieldOutputStream extends FilterOutputStream {
        private CloseShieldOutputStream(OutputStream out) {
            super(out);
        }

        @Override
        public void close() throws IOException {
            flush();
        }
    }
}
