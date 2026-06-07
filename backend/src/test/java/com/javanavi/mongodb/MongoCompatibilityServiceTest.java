package com.javanavi.mongodb;

import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.MongoContracts;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class MongoCompatibilityServiceTest {
    @Test
    void defaultSslModeIsRequiredNotPreferred() throws Exception {
        assertThat(normalizeSslMode(""))
                .isEqualTo(MongoCompatibilityService.DEFAULT_SSL_MODE)
                .isEqualTo("required");
        assertThat(normalizeSslMode("preferred")).isEqualTo("preferred");
        assertThat(normalizeSslMode("skip_verify")).isEqualTo("skip-verify");
    }

    @Test
    void missingSslModeDoesNotEnableTlsWhenUseSslIsFalse() throws Exception {
        List<?> attempts = attemptsFor(new ConnectionConfigDto(
                "mongo-plain",
                "Mongo Plain",
                "mongodb",
                null,
                "mongo.local",
                27017,
                "admin",
                "user",
                "password",
                Map.of(),
                2,
                false,
                null,
                null,
                null,
                List.of(),
                "single",
                null,
                "admin",
                null,
                false,
                "SCRAM-SHA-256",
                null,
                null
        ));

        assertThat(attempts).hasSize(1);
        Object attempt = attempts.get(0);
        assertThat((boolean) invoke(attempt, "tls")).isFalse();
        assertThat((String) invoke(attempt, "label")).contains("tls=plain");
    }

    @Test
    void requiredSslModeDoesNotCreatePlainOrInsecureAttempt() throws Exception {
        List<?> attempts = attemptsFor(new ConnectionConfigDto(
                "mongo-required",
                "Mongo Required",
                "mongodb",
                null,
                "mongo.local",
                27017,
                "admin",
                "user",
                "password",
                Map.of(),
                2,
                true,
                null,
                null,
                null,
                List.of(),
                "single",
                null,
                "admin",
                null,
                false,
                "SCRAM-SHA-256",
                null,
                null
        ));

        assertThat(attempts).hasSize(1);
        Object attempt = attempts.get(0);
        assertThat((boolean) invoke(attempt, "tls")).isTrue();
        assertThat((boolean) invoke(attempt, "tlsInsecure")).isFalse();
        assertThat((String) invoke(attempt, "label")).contains("tls=required");
    }

    @Test
    void preferredSslModeIsExplicitCompatibilityFallback() throws Exception {
        List<?> attempts = attemptsFor(new ConnectionConfigDto(
                "mongo-preferred",
                "Mongo Preferred",
                "mongodb",
                null,
                "mongo.local",
                27017,
                "admin",
                "user",
                "password",
                Map.of(),
                2,
                true,
                "preferred",
                null,
                null,
                List.of(),
                "single",
                null,
                "admin",
                null,
                false,
                "SCRAM-SHA-256",
                null,
                null
        ));

        assertThat(attempts).hasSize(2);
        assertThat(attempts.stream().map(this::label)).contains("mongo.local:27017 tls=preferred auth=primary/SCRAM-SHA-256");
        assertThat(attempts.stream().map(this::label)).contains("mongo.local:27017 tls=plain-fallback auth=primary/SCRAM-SHA-256");
    }

    @Test
    void sendCommandUsesConfiguredHttpProxy() throws Exception {
        try (MongoHttpConnectProbe proxy = MongoHttpConnectProbe.start()) {
            ConnectionConfigDto config = new ConnectionConfigDto(
                    "mongo-proxy",
                    "Mongo Proxy",
                    "mongodb",
                    null,
                    "mongo.internal",
                    27017,
                    "admin",
                    "",
                    "",
                    Map.of(),
                    2,
                    false,
                    "disable",
                    false,
                    null,
                    null,
                    true,
                    new ConnectionConfigDto.NetworkProxyConfigDto("http", "127.0.0.1", proxy.port(), null, null),
                    null,
                    null,
                    List.of(),
                    "single",
                    null,
                    "admin",
                    null,
                    false,
                    "",
                    null,
                    null
            );

            Map<String, Object> document = sendCommandDocument(config, Map.of("hello", 1, "$db", "admin"));

            assertThat(document).containsEntry("ok", 1.0d);
            proxy.assertConnectTarget("mongo.internal:27017");
        }
    }

    @Test
    void discoverMembersReturnsTypedPreviewForExampleHost() {
        MongoCompatibilityService service = new MongoCompatibilityService(new com.javanavi.i18n.I18nMessages());

        MongoContracts.DiscoverMembersResponse response = service.discoverMembers(new MongoContracts.DiscoverMembersRequest(new ConnectionConfigDto(
                "mongo-preview",
                "Mongo Preview",
                "mongodb",
                null,
                "mongo.example",
                27017,
                "admin",
                "",
                "",
                Map.of(),
                2,
                true,
                "required",
                null,
                null,
                List.of(),
                "replica",
                "rs0",
                "admin",
                null,
                false,
                "",
                null,
                null
        )));

        assertThat(response.dryRun()).isTrue();
        assertThat(response.replicaSet()).isEqualTo("rs0");
        assertThat(response.members()).hasSize(1);
        assertThat(response.members().get(0).host()).isEqualTo("mongo.example:27017");
        assertThat(response.tlsProfile().enabled()).isTrue();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> sendCommandDocument(ConnectionConfigDto config, Map<String, Object> command) throws Exception {
        Method method = MongoCompatibilityService.class.getDeclaredMethod("sendCommandDocument", ConnectionConfigDto.class, Map.class);
        method.setAccessible(true);
        return (Map<String, Object>) method.invoke(null, config, command);
    }

    private static final class MongoHttpConnectProbe implements AutoCloseable {
        private static final int OP_MSG = 2013;
        private final ServerSocket server;
        private final CountDownLatch done = new CountDownLatch(1);
        private final AtomicReference<String> connectTarget = new AtomicReference<>("");
        private final AtomicReference<Throwable> error = new AtomicReference<>();
        private final Thread thread;

        private MongoHttpConnectProbe(ServerSocket server) {
            this.server = server;
            this.thread = new Thread(this::serve, "mongo-http-connect-probe");
            this.thread.setDaemon(true);
        }

        static MongoHttpConnectProbe start() throws IOException {
            try {
                ServerSocket server = new ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"));
                MongoHttpConnectProbe probe = new MongoHttpConnectProbe(server);
                probe.thread.start();
                return probe;
            } catch (IOException error) {
                if (error instanceof SocketException && String.valueOf(error.getMessage()).contains("Operation not permitted")) {
                    Assumptions.assumeTrue(false, "local TCP server unavailable in this test environment: " + error.getMessage());
                }
                throw error;
            }
        }

        int port() {
            return server.getLocalPort();
        }

        void assertConnectTarget(String expected) throws Exception {
            awaitDone();
            assertThat(connectTarget.get()).isEqualTo(expected);
        }

        private void serve() {
            try (Socket socket = server.accept()) {
                InputStream input = socket.getInputStream();
                OutputStream output = socket.getOutputStream();
                String connect = readLine(input);
                if (connect.startsWith("CONNECT ")) {
                    connectTarget.set(connect.substring("CONNECT ".length(), connect.indexOf(" HTTP/")));
                }
                while (!readLine(input).isEmpty()) {
                    // consume proxy headers
                }
                output.write("HTTP/1.1 200 OK\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
                output.flush();

                byte[] header = input.readNBytes(16);
                ByteBuffer requestHeader = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
                int length = requestHeader.getInt();
                int requestId = requestHeader.getInt();
                input.readNBytes(length - 16);
                output.write(opMsgResponse(requestId));
                output.flush();
            } catch (Throwable failure) {
                error.set(failure);
            } finally {
                done.countDown();
            }
        }

        private static byte[] opMsgResponse(int responseTo) {
            byte[] document = bsonDocument(Map.of("ok", 1.0d, "isWritablePrimary", true, "helloOk", true));
            int length = 16 + 4 + 1 + document.length;
            ByteBuffer buffer = ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
            buffer.putInt(length);
            buffer.putInt(1);
            buffer.putInt(responseTo);
            buffer.putInt(OP_MSG);
            buffer.putInt(0);
            buffer.put((byte) 0);
            buffer.put(document);
            return buffer.array();
        }

        private static byte[] bsonDocument(Map<String, Object> document) {
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            document.forEach((key, value) -> {
                if (value instanceof Double number) {
                    body.write(0x01);
                    writeCString(body, key);
                    writeDouble(body, number);
                } else if (value instanceof Boolean bool) {
                    body.write(0x08);
                    writeCString(body, key);
                    body.write(bool ? 1 : 0);
                } else {
                    throw new IllegalArgumentException("unsupported test BSON value");
                }
            });
            body.write(0);
            byte[] bodyBytes = body.toByteArray();
            ByteBuffer buffer = ByteBuffer.allocate(4 + bodyBytes.length).order(ByteOrder.LITTLE_ENDIAN);
            buffer.putInt(4 + bodyBytes.length);
            buffer.put(bodyBytes);
            return buffer.array();
        }

        private static void writeCString(ByteArrayOutputStream output, String value) {
            output.writeBytes(value.getBytes(StandardCharsets.UTF_8));
            output.write(0);
        }

        private static void writeDouble(ByteArrayOutputStream output, double value) {
            ByteBuffer buffer = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
            buffer.putDouble(value);
            output.writeBytes(buffer.array());
        }

        private static String readLine(InputStream input) throws IOException {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            int previous = -1;
            while (true) {
                int value = input.read();
                if (value < 0) {
                    throw new IOException("connection closed while reading line");
                }
                if (previous == '\r' && value == '\n') {
                    byte[] bytes = buffer.toByteArray();
                    return new String(bytes, 0, Math.max(0, bytes.length - 1), StandardCharsets.ISO_8859_1);
                }
                buffer.write(value);
                previous = value;
            }
        }

        private void awaitDone() throws Exception {
            assertThat(done.await(3, TimeUnit.SECONDS)).isTrue();
            Throwable failure = error.get();
            if (failure != null) {
                throw new AssertionError(failure);
            }
        }

        @Override
        public void close() throws IOException {
            server.close();
        }
    }

    private static List<?> attemptsFor(ConnectionConfigDto config) throws Exception {
        Class<?> profileClass = Class.forName("com.javanavi.mongodb.MongoCompatibilityService$MongoConnectionProfile");
        Method from = profileClass.getDeclaredMethod("from", ConnectionConfigDto.class);
        from.setAccessible(true);
        Object profile = from.invoke(null, config);
        Method attempts = profileClass.getDeclaredMethod("attempts");
        attempts.setAccessible(true);
        return (List<?>) attempts.invoke(profile);
    }

    private String label(Object attempt) {
        return (String) invoke(attempt, "label");
    }

    private static Object invoke(Object target, String methodName) {
        try {
            Method method = target.getClass().getDeclaredMethod(methodName);
            method.setAccessible(true);
            return method.invoke(target);
        } catch (ReflectiveOperationException error) {
            throw new AssertionError(error);
        }
    }

    private static String normalizeSslMode(String raw) throws Exception {
        Method normalize = MongoCompatibilityService.class.getDeclaredMethod("normalizeSslMode", String.class);
        normalize.setAccessible(true);
        return (String) normalize.invoke(null, raw);
    }
}
