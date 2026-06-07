package com.javanavi.db;

import com.javanavi.JavaNaviApplication;
import com.javanavi.driver.JdbcDriverRuntimeService;
import com.javanavi.i18n.AppLanguage;
import com.javanavi.i18n.I18nContext;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ConnectionConfigDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JdbcConnectionFactorySpringInjectionTest {
    @TempDir
    Path tempDir;

    @Test
    void springUsesConstructorWithJdbcDriverRuntimeService() throws Exception {
        Map<String, Object> properties = new HashMap<>();
        properties.put("javanavi.security.data-directory", tempDir.toString());
        properties.put("server.port", "0");
        properties.put("spring.main.web-application-type", "none");

        SpringApplication application = new SpringApplication(JavaNaviApplication.class);
        application.setDefaultProperties(properties);

        try (ConfigurableApplicationContext context = application.run()) {
            JdbcConnectionFactory factory = context.getBean(JdbcConnectionFactory.class);
            JdbcDriverRuntimeService runtimeService = context.getBean(JdbcDriverRuntimeService.class);
            I18nMessages messages = context.getBean(I18nMessages.class);

            assertThat(injectedField(factory, "driverRuntimeService")).isSameAs(runtimeService);
            assertThat(injectedField(factory, "messages")).isSameAs(messages);
        }
    }

    @Test
    void noArgVerificationFactoryUsesLocalizedRuntimeUnavailableMessage() {
        I18nContext.set(AppLanguage.ZH);
        try {
            JdbcConnectionFactory factory = new JdbcConnectionFactory();
            assertThatThrownBy(() -> factory.prepareDriver(null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("JavaNavi 当前支持内置关系型");
        } finally {
            I18nContext.clear();
        }

        I18nContext.set(AppLanguage.ZH);
        try {
            JdbcConnectionFactory factory = new JdbcConnectionFactory();
            assertThatThrownBy(() -> factory.prepareDriver(new com.javanavi.model.ConnectionConfigDto(
                    "mysql-1",
                    "MySQL",
                    "mysql",
                    "127.0.0.1",
                    3306,
                    "demo",
                    "user",
                    "password",
                    null
            )))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("JDBC 驱动运行时服务在当前验证上下文中不可用。");
        } finally {
            I18nContext.clear();
        }
    }

    @Test
    void networkSocketConnectorUsesSshTunnelEndpoint() throws Exception {
        try (ServerSocket target = localServer()) {
            Thread server = new Thread(() -> echoOnce(target), "ssh-route-target");
            server.setDaemon(true);
            server.start();
            ConnectionNetworkTunnelService tunnelService = new ConnectionNetworkTunnelService() {
                @Override
                TunnelLease openSshTunnel(ConnectionConfigDto config) {
                    return new TunnelLease(null, target.getLocalPort());
                }
            };
            NetworkSocketConnector connector = new NetworkSocketConnector(tunnelService);
            ConnectionConfigDto config = new ConnectionConfigDto(
                    "redis-ssh",
                    "Redis SSH",
                    "redis",
                    null,
                    "redis.internal",
                    6379,
                    "0",
                    "",
                    "",
                    Map.of(),
                    2,
                    false,
                    "disable",
                    true,
                    new ConnectionConfigDto.NetworkCredentialConfigDto("ssh.internal", 22, "user", "secret", null),
                    null,
                    false,
                    null,
                    null,
                    null,
                    java.util.List.of(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
            );

            try (Socket socket = connector.openSocket(config, 2000)) {
                socket.getOutputStream().write("ping\n".getBytes(StandardCharsets.UTF_8));
                socket.getOutputStream().flush();
                byte[] response = socket.getInputStream().readNBytes(4);
                assertThat(new String(response, StandardCharsets.UTF_8)).isEqualTo("pong");
            }
        }
    }

    private static ServerSocket localServer() throws IOException {
        try {
            return new ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"));
        } catch (IOException error) {
            if (error instanceof SocketException && String.valueOf(error.getMessage()).contains("Operation not permitted")) {
                org.junit.jupiter.api.Assumptions.assumeTrue(false, "local TCP server unavailable in this test environment: " + error.getMessage());
            }
            throw error;
        }
    }

    private static void echoOnce(ServerSocket server) {
        try (Socket socket = server.accept()) {
            InputStream input = socket.getInputStream();
            OutputStream output = socket.getOutputStream();
            input.readNBytes(5);
            output.write("pong".getBytes(StandardCharsets.UTF_8));
            output.flush();
        } catch (IOException ignored) {
            // test assertion happens on the client side
        }
    }

    private static Object injectedField(Object target, String fieldName) throws Exception {
        Field field = target.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        return field.get(target);
    }
}
