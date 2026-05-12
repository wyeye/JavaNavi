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
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:javanavi-file-controller-test;MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        dataSource.setDriverClassName("org.h2.Driver");
        return new DatabaseCompatibilityService(new DemoDatabaseService(new JdbcTemplate(dataSource), new I18nMessages()), new JdbcConnectionFactory());
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
