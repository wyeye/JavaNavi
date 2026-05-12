package com.javanavi.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.db.DemoDatabaseService;
import com.javanavi.db.JdbcConnectionFactory;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.files.ExportedFileRevealService;
import com.javanavi.files.FileWorkflowCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.CompatEventStatusDto;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.DatabaseOperationResultDto;
import com.javanavi.model.FileWorkflowContracts;
import com.javanavi.model.LocalSessionDto;
import com.javanavi.security.LocalSessionService;
import com.javanavi.security.SecretStore;
import com.javanavi.security.SecretStoreStatus;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpUpgradeHandler;
import jakarta.servlet.http.Part;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Principal;
import java.util.Collection;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class FileWorkflowCompatibilityControllerTest {
    @TempDir
    Path tempDir;

    @Test
    void uploadImportFileBindsMultipartTableAndEnvelope() {
        FileWorkflowCompatibilityController controller = new FileWorkflowCompatibilityController(service(), new I18nMessages());
        MultipartFile file = new MinimalMultipartFile("rows.csv", "id,name\n1,JavaNavi\n".getBytes());

        ApiEnvelope<FileWorkflowContracts.ImportSelectionResponse> envelope = controller.uploadImportFile("demo_table", null, file);

        assertThat(envelope.success()).isTrue();
        assertThat(envelope.data())
                .extracting(
                        FileWorkflowContracts.ImportSelectionResponse::browserUploadRequired,
                        FileWorkflowContracts.ImportSelectionResponse::table,
                        FileWorkflowContracts.ImportSelectionResponse::totalRows
                )
                .containsExactly(false, "demo_table", 1);
        assertThat(Path.of(envelope.data().filePath()))
                .exists()
                .hasParent(tempDir.resolve("imports"));
    }

    @Test
    void ddlClearTablesReturnsTypedOperationResult() throws Exception {
        DatabaseCompatibilityService database = databaseCompatibilityService();
        try (java.sql.Connection connection = dataSource().getConnection();
             java.sql.Statement statement = connection.createStatement()) {
            statement.execute("create table if not exists clear_target(id int)");
            statement.execute("delete from clear_target");
            statement.execute("insert into clear_target(id) values (1)");
        }

        DatabaseOperationResultDto result = database.clearTables(demoConfig(), "", List.of("clear_target"), false);

        assertThat(result.operation()).isEqualTo("clear");
        assertThat(result.count()).isEqualTo(1);
        assertThat(result.affectedRows()).isEqualTo(1);
        assertThat(result.tables()).containsExactly("clear_target");
        assertThat(result.executedSQLs()).hasSize(1);
    }

    @Test
    void compatEventStatusReturnsTypedContract() {
        I18nMessages messages = new I18nMessages();
        CompatEventController controller = new CompatEventController(
                new CompatEventPublisher(new LocalSessionService()),
                new CompatEventFixtures(messages),
                messages
        );

        ApiEnvelope<CompatEventStatusDto> envelope = controller.status();

        assertThat(envelope.success()).isTrue();
        assertThat(envelope.data().bridge()).isEqualTo("sse");
        assertThat(envelope.data().subscriberCount()).isZero();
        assertThat(envelope.data().fixtureFamilies()).contains("sync", "driver");
    }

    @Test
    void sessionReturnsTypedLocalSessionContract() {
        SecurityProperties properties = new SecurityProperties();
        LocalSessionService localSessionService = new LocalSessionService();
        SecurityController controller = new SecurityController(
                properties,
                localSessionService,
                new MemorySecretStore()
        );

        ApiEnvelope<LocalSessionDto> body = controller.session(new EmptyHttpServletRequest()).getBody();

        assertThat(body).isNotNull();
        assertThat(body.success()).isTrue();
        assertThat(body.data().token()).isNotBlank();
        assertThat(body.data().headerName()).isEqualTo(properties.getSessionHeader());
        assertThat(body.data().secretStore().mode()).isEqualTo("memory");
    }

    private FileWorkflowCompatibilityService service() {
        I18nMessages messages = new I18nMessages();
        return new FileWorkflowCompatibilityService(
                properties(tempDir),
                new ObjectMapper(),
                databaseCompatibilityService(),
                new ExportedFileRevealService(messages),
                new CompatEventPublisher(new LocalSessionService()),
                new CompatEventFixtures(messages),
                messages
        );
    }

    private SecurityProperties properties(Path tempDir) {
        SecurityProperties properties = new SecurityProperties();
        properties.setDataDirectory(tempDir.toString());
        return properties;
    }

    private static DatabaseCompatibilityService databaseCompatibilityService() {
        return new DatabaseCompatibilityService(new DemoDatabaseService(new JdbcTemplate(dataSource()), new I18nMessages()), new JdbcConnectionFactory());
    }

    private static DriverManagerDataSource dataSource() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:javanavi-file-controller-test;MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        dataSource.setDriverClassName("org.h2.Driver");
        return dataSource;
    }

    private static ConnectionConfigDto demoConfig() {
        return new ConnectionConfigDto("demo", "Demo", "demo", "", null, "", "", "", Map.of(), null);
    }

    private static final class MemorySecretStore implements SecretStore {
        @Override
        public SecretStoreStatus status() {
            return new SecretStoreStatus(true, "memory", "memory", true);
        }

        @Override
        public void put(String key, String secret) {
        }

        @Override
        public java.util.Optional<String> get(String key) {
            return java.util.Optional.empty();
        }

        @Override
        public void delete(String key) {
        }
    }

    private static final class EmptyHttpServletRequest implements HttpServletRequest {
        @Override public Cookie[] getCookies() { return null; }
        @Override public String getAuthType() { return null; }
        @Override public long getDateHeader(String name) { return -1; }
        @Override public String getHeader(String name) { return null; }
        @Override public Enumeration<String> getHeaders(String name) { return Collections.emptyEnumeration(); }
        @Override public Enumeration<String> getHeaderNames() { return Collections.emptyEnumeration(); }
        @Override public int getIntHeader(String name) { return -1; }
        @Override public String getMethod() { return "GET"; }
        @Override public String getPathInfo() { return null; }
        @Override public String getPathTranslated() { return null; }
        @Override public String getContextPath() { return ""; }
        @Override public String getQueryString() { return null; }
        @Override public String getRemoteUser() { return null; }
        @Override public boolean isUserInRole(String role) { return false; }
        @Override public Principal getUserPrincipal() { return null; }
        @Override public String getRequestedSessionId() { return null; }
        @Override public String getRequestURI() { return "/api/v1/session"; }
        @Override public StringBuffer getRequestURL() { return new StringBuffer("http://localhost/api/v1/session"); }
        @Override public String getServletPath() { return ""; }
        @Override public HttpSession getSession(boolean create) { return null; }
        @Override public HttpSession getSession() { return null; }
        @Override public String changeSessionId() { return ""; }
        @Override public boolean isRequestedSessionIdValid() { return false; }
        @Override public boolean isRequestedSessionIdFromCookie() { return false; }
        @Override public boolean isRequestedSessionIdFromURL() { return false; }
        @Override public boolean authenticate(jakarta.servlet.http.HttpServletResponse response) { return false; }
        @Override public void login(String username, String password) { }
        @Override public void logout() { }
        @Override public Collection<Part> getParts() { return List.of(); }
        @Override public Part getPart(String name) { return null; }
        @Override public <T extends HttpUpgradeHandler> T upgrade(Class<T> handlerClass) { return null; }
        @Override public Object getAttribute(String name) { return null; }
        @Override public Enumeration<String> getAttributeNames() { return Collections.emptyEnumeration(); }
        @Override public String getCharacterEncoding() { return "UTF-8"; }
        @Override public void setCharacterEncoding(String env) { }
        @Override public int getContentLength() { return 0; }
        @Override public long getContentLengthLong() { return 0; }
        @Override public String getContentType() { return null; }
        @Override public jakarta.servlet.ServletInputStream getInputStream() { return null; }
        @Override public String getParameter(String name) { return null; }
        @Override public Enumeration<String> getParameterNames() { return Collections.emptyEnumeration(); }
        @Override public String[] getParameterValues(String name) { return null; }
        @Override public Map<String, String[]> getParameterMap() { return Map.of(); }
        @Override public String getProtocol() { return "HTTP/1.1"; }
        @Override public String getScheme() { return "http"; }
        @Override public String getServerName() { return "localhost"; }
        @Override public int getServerPort() { return 80; }
        @Override public java.io.BufferedReader getReader() { return null; }
        @Override public String getRemoteAddr() { return "127.0.0.1"; }
        @Override public String getRemoteHost() { return "localhost"; }
        @Override public void setAttribute(String name, Object o) { }
        @Override public void removeAttribute(String name) { }
        @Override public Locale getLocale() { return Locale.ENGLISH; }
        @Override public Enumeration<Locale> getLocales() { return Collections.enumeration(List.of(Locale.ENGLISH)); }
        @Override public boolean isSecure() { return false; }
        @Override public jakarta.servlet.RequestDispatcher getRequestDispatcher(String path) { return null; }
        @Override public int getRemotePort() { return 0; }
        @Override public String getLocalName() { return "localhost"; }
        @Override public String getLocalAddr() { return "127.0.0.1"; }
        @Override public int getLocalPort() { return 80; }
        @Override public jakarta.servlet.ServletContext getServletContext() { return null; }
        @Override public jakarta.servlet.AsyncContext startAsync() { return null; }
        @Override public jakarta.servlet.AsyncContext startAsync(jakarta.servlet.ServletRequest servletRequest, jakarta.servlet.ServletResponse servletResponse) { return null; }
        @Override public boolean isAsyncStarted() { return false; }
        @Override public boolean isAsyncSupported() { return false; }
        @Override public jakarta.servlet.AsyncContext getAsyncContext() { return null; }
        @Override public jakarta.servlet.DispatcherType getDispatcherType() { return jakarta.servlet.DispatcherType.REQUEST; }
        @Override public String getRequestId() { return ""; }
        @Override public String getProtocolRequestId() { return ""; }
        @Override public jakarta.servlet.ServletConnection getServletConnection() { return null; }
    }

    private record MinimalMultipartFile(String originalFilename, byte[] bytes) implements MultipartFile {
        @Override
        public String getName() {
            return "file";
        }

        @Override
        public String getOriginalFilename() {
            return originalFilename;
        }

        @Override
        public String getContentType() {
            return "text/csv";
        }

        @Override
        public boolean isEmpty() {
            return bytes.length == 0;
        }

        @Override
        public long getSize() {
            return bytes.length;
        }

        @Override
        public byte[] getBytes() {
            return bytes;
        }

        @Override
        public java.io.InputStream getInputStream() {
            return new java.io.ByteArrayInputStream(bytes);
        }

        @Override
        public void transferTo(java.io.File dest) throws IOException {
            Files.write(dest.toPath(), bytes);
        }
    }
}
