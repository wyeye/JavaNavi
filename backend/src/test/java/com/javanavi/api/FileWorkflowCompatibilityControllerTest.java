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
import com.javanavi.security.LocalSessionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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
