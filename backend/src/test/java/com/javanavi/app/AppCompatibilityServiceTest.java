package com.javanavi.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.connections.ConnectionPackageCompatibilityService;
import com.javanavi.connections.SavedConnectionService;
import com.javanavi.files.ExportedFileRevealService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.security.SecretStore;
import com.javanavi.security.SecretStoreStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;

class AppCompatibilityServiceTest {
    @TempDir
    Path tempDir;

    @AfterEach
    void clearDisableProperty() {
        System.clearProperty("javanavi.disableOsOpen");
    }

    @Test
    void exportConnectionsPackageReturnsRevealFieldsWithoutBlockingWhenDisabled() {
        System.setProperty("javanavi.disableOsOpen", "true");
        AppCompatibilityService service = service();

        Map<String, Object> result = service.exportConnectionsPackage(false, "");

        Path exported = Path.of(String.valueOf(result.get("path")));
        assertThat(Files.exists(exported)).isTrue();
        assertThat(result)
                .containsEntry("filePath", exported.toString())
                .containsEntry("filename", exported.getFileName().toString())
                .containsEntry("revealed", false)
                .containsEntry("revealSelected", false)
                .containsEntry("revealMethod", "disabled");
        assertThat(result.get("revealTargetPath")).isEqualTo(exported.toAbsolutePath().normalize().toString());
    }

    private AppCompatibilityService service() {
        I18nMessages messages = new I18nMessages();
        SecurityProperties properties = new SecurityProperties();
        properties.setDataDirectory(tempDir.toString());
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        MemorySecretStore secretStore = new MemorySecretStore();
        SavedConnectionService savedConnectionService = new SavedConnectionService(properties, objectMapper, secretStore);
        ConnectionPackageCompatibilityService packageService = new ConnectionPackageCompatibilityService(
                objectMapper,
                savedConnectionService,
                messages
        );
        return new AppCompatibilityService(
                properties,
                objectMapper,
                packageService,
                new ExportedFileRevealService(messages),
                secretStore
        );
    }

    private static final class MemorySecretStore implements SecretStore {
        private final Map<String, String> secrets = new ConcurrentHashMap<>();

        @Override
        public SecretStoreStatus status() {
            return new SecretStoreStatus(true, "memory", "memory", true);
        }

        @Override
        public void put(String key, String secret) {
            secrets.put(key, secret);
        }

        @Override
        public Optional<String> get(String key) {
            return Optional.ofNullable(secrets.get(key));
        }

        @Override
        public void delete(String key) {
            secrets.remove(key);
        }
    }
}
