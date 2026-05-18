package com.javanavi.files;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.db.DemoDatabaseService;
import com.javanavi.db.JdbcConnectionFactory;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.QueryResultDto;
import com.javanavi.security.LocalSessionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileWorkflowCompatibilityServiceTest {
    @TempDir
    Path tempDir;
    private DatabaseCompatibilityService lastDatabaseCompatibilityService;

    @AfterEach
    void clearDisableProperty() {
        System.clearProperty("javanavi.disableOsOpen");
    }

    @Test
    void exportDataReturnsRevealFieldsWithoutBlockingWhenDisabled() {
        System.setProperty("javanavi.disableOsOpen", "true");
        FileWorkflowCompatibilityService service = service();

        Map<String, Object> result = service.exportData(
                List.of(Map.of("id", 1, "name", "JavaNavi")),
                List.of("id", "name"),
                "demo-table",
                "csv"
        );

        Path exported = Path.of(String.valueOf(result.get("path")));
        assertThat(Files.exists(exported)).isTrue();
        assertThat(result)
                .containsEntry("revealed", false)
                .containsEntry("revealSelected", false)
                .containsEntry("revealMethod", "disabled");
        assertThat(result.get("revealTargetPath")).isEqualTo(exported.toAbsolutePath().normalize().toString());
        assertThat(String.valueOf(result.get("revealMessage"))).contains(exported.toString());
    }

    @Test
    void exportDataSupportsAllVisibleGridFormats() throws Exception {
        System.setProperty("javanavi.disableOsOpen", "true");
        FileWorkflowCompatibilityService service = service();
        List<Map<String, Object>> rows = List.of(
                Map.of("id", 1, "name", "JavaNavi", "note", "A|B\n中文"),
                Map.of("id", 2, "name", "Export", "note", "<safe>")
        );
        List<String> columns = List.of("id", "name", "note");

        Map<String, Object> csv = service.exportData(rows, columns, "demo-table", "csv");
        assertThat(csv).containsEntry("format", "csv").containsEntry("rows", 2);
        assertThat(Path.of(String.valueOf(csv.get("path"))).getFileName().toString()).endsWith(".csv");
        assertThat(Files.readString(Path.of(String.valueOf(csv.get("path"))))).contains("id,name,note", "\"A|B\n中文\"");

        Map<String, Object> json = service.exportData(rows, columns, "demo-table", "json");
        assertThat(json).containsEntry("format", "json").containsEntry("rows", 2);
        assertThat(Path.of(String.valueOf(json.get("path"))).getFileName().toString()).endsWith(".json");
        assertThat(Files.readString(Path.of(String.valueOf(json.get("path"))))).contains("\"name\" : \"JavaNavi\"");

        Map<String, Object> markdown = service.exportData(rows, columns, "demo-table", "md");
        assertThat(markdown).containsEntry("format", "md").containsEntry("rows", 2);
        assertThat(Path.of(String.valueOf(markdown.get("path"))).getFileName().toString()).endsWith(".md");
        assertThat(Files.readString(Path.of(String.valueOf(markdown.get("path"))))).contains("| id | name | note |", "A\\|B<br>中文");

        Map<String, Object> html = service.exportData(rows, columns, "demo-table", "html");
        assertThat(html).containsEntry("format", "html").containsEntry("rows", 2);
        assertThat(Path.of(String.valueOf(html.get("path"))).getFileName().toString()).endsWith(".html");
        assertThat(Files.readString(Path.of(String.valueOf(html.get("path"))))).contains("<meta charset=\"UTF-8\">", "&lt;safe&gt;");

        Map<String, Object> xlsx = service.exportData(rows, columns, "demo-table", "xlsx");
        Path xlsxPath = Path.of(String.valueOf(xlsx.get("path")));
        assertThat(xlsx).containsEntry("format", "xlsx").containsEntry("rows", 2);
        assertThat(xlsxPath.getFileName().toString()).endsWith(".xlsx");
        try (ZipFile zipFile = new ZipFile(xlsxPath.toFile())) {
            assertThat(zipFile.getEntry("[Content_Types].xml")).isNotNull();
            assertThat(zipFile.getEntry("xl/workbook.xml")).isNotNull();
            String worksheet = new String(zipFile.getInputStream(zipFile.getEntry("xl/worksheets/sheet1.xml")).readAllBytes());
            assertThat(worksheet).contains("JavaNavi", "A|B\n中文", "&lt;safe&gt;", "<dimension ref=\"A1:C3\"/>");
        }

        Map<String, Object> sql = service.exportData(rows, columns, "demo-table", "sql");
        assertThat(sql).containsEntry("format", "sql").containsEntry("rows", 2);
        assertThat(Path.of(String.valueOf(sql.get("path"))).getFileName().toString()).endsWith(".sql");
        assertThat(Files.readString(Path.of(String.valueOf(sql.get("path"))))).contains("INSERT INTO \"demo-table\"", "'A|B\n中文'");
    }

    @Test
    void previewImportFileParsesQuotedCsvWithBomAndMultilineFields() throws Exception {
        FileWorkflowCompatibilityService service = service();
        Path file = tempDir.resolve("imports/quoted.csv");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "\uFEFFid,name,note\r\n1,\"Ada, Lovelace\",\"Line 1\nLine 2\"\r\n2,\"Quote \"\"OK\"\"\",\"中文\"\r\n");

        Map<String, Object> preview = service.previewImportFile(file.toString());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) preview.get("previewRows");

        assertThat(preview).containsEntry("totalRows", 2);
        assertThat(rows.get(0))
                .containsEntry("name", "Ada, Lovelace")
                .containsEntry("note", "Line 1\nLine 2");
        assertThat(rows.get(1))
                .containsEntry("name", "Quote \"OK\"")
                .containsEntry("note", "中文");
    }

    @Test
    void previewImportFileAcceptsJsonArrayAndObject() throws Exception {
        FileWorkflowCompatibilityService service = service();
        Path arrayFile = tempDir.resolve("imports/array.json");
        Path objectFile = tempDir.resolve("imports/object.json");
        Files.createDirectories(arrayFile.getParent());
        Files.writeString(arrayFile, "[{\"id\":1,\"name\":\"数组\"},{\"id\":2,\"name\":\"Array\"}]");
        Files.writeString(objectFile, "{\"id\":3,\"name\":\"对象\"}");

        Map<String, Object> arrayPreview = service.previewImportFile(arrayFile.toString());
        Map<String, Object> objectPreview = service.previewImportFile(objectFile.toString());

        assertThat(arrayPreview).containsEntry("totalRows", 2);
        assertThat(arrayPreview.get("columns")).asList().contains("id", "name");
        assertThat(objectPreview).containsEntry("totalRows", 1);
        assertThat(objectPreview.get("columns")).asList().contains("id", "name");
    }

    @Test
    void uploadImportFileStoresCsvAndRejectsUnsupportedExtensions() {
        FileWorkflowCompatibilityService service = service();

        Map<String, Object> uploaded = service.uploadImportFile(
                "demo_import",
                new BytesMultipartFile("rows.csv", "id,name\n1,JavaNavi\n".getBytes())
        );

        Path uploadedPath = Path.of(String.valueOf(uploaded.get("filePath")));
        assertThat(Files.exists(uploadedPath)).isTrue();
        assertThat(uploaded)
                .containsEntry("browserUploadRequired", false)
                .containsEntry("totalRows", 1);
        assertThatThrownBy(() -> service.uploadImportFile(
                "demo_import",
                new BytesMultipartFile("rows.txt", "id,name\n1,JavaNavi\n".getBytes())
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Only CSV and JSON");
    }

    @Test
    void importDataWithProgressAppliesRowsToDemoDatabaseWhenRequested() throws Exception {
        FileWorkflowCompatibilityService service = service();
        Path file = tempDir.resolve("imports/apply.csv");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "id,name,note\n1,JavaNavi,导入\n2,Import,OK\n");

        Map<String, Object> result = service.importDataWithProgress(Map.of(
                "filePath", file.toString(),
                "table", "import_apply_rows",
                "applyToDatabase", true
        ));
        assertThat(result)
                .containsEntry("dryRun", false)
                .containsEntry("appliedToDatabase", true)
                .containsEntry("insertedRows", 2)
                .containsEntry("failed", 0);
        assertThat(Files.exists(file)).isFalse();
        assertThatThrownBy(() -> service.previewImportFile(file.toString()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Import file does not exist");
        QueryResultDto rows = lastDatabaseCompatibilityService.execute(new com.javanavi.model.QueryRequestDto(
                null,
                "",
                "select id, name, note from \"import_apply_rows\" order by id",
                1,
                10,
                "verify-import"
        ));
        assertThat(rows.rows()).hasSize(2);
        assertThat(rows.rows().get(0)).containsEntry("name", "JavaNavi").containsEntry("note", "导入");
    }

    @Test
    void importDataWithProgressNormalizesQuotedTemporalCsvCellsForExistingTables() throws Exception {
        FileWorkflowCompatibilityService service = service();
        lastDatabaseCompatibilityService.execute(new com.javanavi.model.QueryRequestDto(
                null,
                "",
                "create table \"import_temporal_rows\" (\"dept_id\" bigint primary key, \"org_code\" varchar(50), \"create_time\" timestamp)",
                1,
                10,
                "prepare-temporal-import"
        ));
        Path file = tempDir.resolve("imports/temporal.csv");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "dept_id,org_code,create_time\n4400,004400,\"\"\"2025-11-23T00:00:01\"\"\"\n");

        Map<String, Object> result = service.importDataWithProgress(Map.of(
                "filePath", file.toString(),
                "table", "import_temporal_rows",
                "applyToDatabase", true
        ));

        assertThat(result)
                .containsEntry("insertedRows", 1)
                .containsEntry("failed", 0);
        QueryResultDto rows = lastDatabaseCompatibilityService.execute(new com.javanavi.model.QueryRequestDto(
                null,
                "",
                "select dept_id, org_code, create_time from \"import_temporal_rows\"",
                1,
                10,
                "verify-temporal-import"
        ));
        assertThat(rows.rows()).hasSize(1);
        assertThat(String.valueOf(rows.rows().get(0).get("create_time"))).contains("2025-11-23");
    }

    @Test
    void importDataWithProgressRejectsUnsupportedBackendDatasourceTypes() throws Exception {
        FileWorkflowCompatibilityService service = service();
        Path file = tempDir.resolve("imports/mongo.csv");
        Files.createDirectories(file.getParent());
        Files.writeString(file, "id,name\n1,JavaNavi\n");

        assertThatThrownBy(() -> service.importDataWithProgress(Map.of(
                "filePath", file.toString(),
                "table", "mongo_collection",
                "connection", Map.of("driverType", "mongodb"),
                "applyToDatabase", true
        ))).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not support JavaNavi table import");
    }

    private FileWorkflowCompatibilityService service() {
        I18nMessages messages = new I18nMessages();
        SecurityProperties properties = new SecurityProperties();
        properties.setDataDirectory(tempDir.toString());
        DatabaseCompatibilityService databaseCompatibilityService = databaseCompatibilityService(messages);
        lastDatabaseCompatibilityService = databaseCompatibilityService;
        return new FileWorkflowCompatibilityService(
                properties,
                new ObjectMapper().findAndRegisterModules(),
                databaseCompatibilityService,
                new ExportedFileRevealService(messages),
                new CompatEventPublisher(new LocalSessionService()),
                new CompatEventFixtures(messages),
                messages
        );
    }

    private static DatabaseCompatibilityService databaseCompatibilityService(I18nMessages messages) {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:javanavi-file-export-test;MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        dataSource.setDriverClassName("org.h2.Driver");
        DemoDatabaseService demoDatabaseService = new DemoDatabaseService(new JdbcTemplate(dataSource), messages);
        return new DatabaseCompatibilityService(demoDatabaseService, new JdbcConnectionFactory());
    }

    private record BytesMultipartFile(String originalFilename, byte[] bytes) implements MultipartFile {
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
        public InputStream getInputStream() {
            return new ByteArrayInputStream(bytes);
        }

        @Override
        public void transferTo(java.io.File dest) throws IOException {
            Files.write(dest.toPath(), bytes);
        }

        @Override
        public void transferTo(Path dest) throws IOException {
            Files.write(dest, bytes);
        }
    }
}
