package com.javanavi.files;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.db.DemoDatabaseService;
import com.javanavi.db.JdbcConnectionFactory;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.security.LocalSessionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class FileWorkflowCompatibilityServiceTest {
    @TempDir
    Path tempDir;

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

    private FileWorkflowCompatibilityService service() {
        I18nMessages messages = new I18nMessages();
        SecurityProperties properties = new SecurityProperties();
        properties.setDataDirectory(tempDir.toString());
        return new FileWorkflowCompatibilityService(
                properties,
                new ObjectMapper().findAndRegisterModules(),
                databaseCompatibilityService(messages),
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
}
