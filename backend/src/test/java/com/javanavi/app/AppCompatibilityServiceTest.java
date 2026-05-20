package com.javanavi.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.connections.ConnectionPackageCompatibilityService;
import com.javanavi.connections.SavedConnectionService;
import com.javanavi.files.ExportedFileRevealService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.AppContracts;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.GlobalProxyConfigDto;
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

    private MemorySecretStore secretStore;

    @AfterEach
    void clearDisableProperty() {
        System.clearProperty("javanavi.disableOsOpen");
    }


    @Test
    void appInfoUsesPackagedProjectVersion() throws Exception {
        AppCompatibilityService service = service();

        AppContracts.AppInfoResponse info = service.appInfo();

        assertThat(info.version()).isEqualTo(projectVersion());
        assertThat(info.version()).doesNotContain("${");
        assertThat(info.version()).isNotEqualTo("0.1.8");
    }

    @Test
    void persistsAndReloadsLanguageInAppDataDirectory() throws Exception {
        AppCompatibilityService service = service();

        AppContracts.LanguageResponse saved = service.saveLanguage("zh-CN");

        assertThat(saved.language()).isEqualTo("zh");
        assertThat(Path.of(tempDir.toString(), "language.json")).exists();
        assertThat(service.getLanguage().language()).isEqualTo("zh");
    }

    @Test
    void globalProxyProviderResolvesStoredPasswordForRuntimeUse() {
        AppCompatibilityService service = service();
        service.saveGlobalProxy(new GlobalProxyConfigDto(true, "http", "127.0.0.1", 8080, "proxy-user", "secret", false));

        ConnectionConfigDto.NetworkProxyConfigDto proxy = new GlobalProxyConfigProvider(properties(), objectMapper(), secretStore()).activeProxy().orElseThrow();

        assertThat(proxy.type()).isEqualTo("http");
        assertThat(proxy.host()).isEqualTo("127.0.0.1");
        assertThat(proxy.port()).isEqualTo(8080);
        assertThat(proxy.user()).isEqualTo("proxy-user");
        assertThat(proxy.password()).isEqualTo("secret");
    }

    @Test
    void exportConnectionsPackageReturnsRevealFieldsWithoutBlockingWhenDisabled() {
        System.setProperty("javanavi.disableOsOpen", "true");
        AppCompatibilityService service = service();

        AppContracts.ConnectionExportPackageResponse result = service.exportConnectionsPackage(false, "");

        Path exported = Path.of(result.path());
        assertThat(Files.exists(exported)).isTrue();
        assertThat(result.filePath()).isEqualTo(exported.toString());
        assertThat(result.filename()).isEqualTo(exported.getFileName().toString());
        assertThat(result.revealed()).isFalse();
        assertThat(result.revealSelected()).isFalse();
        assertThat(result.revealMethod()).isEqualTo("disabled");
        assertThat(result.revealTargetPath()).isEqualTo(exported.toAbsolutePath().normalize().toString());
    }

    @Test
    void exposesTypedSqlFileInfoWhenWritingWorkspaceSql() {
        AppCompatibilityService service = service();

        AppContracts.SqlFileInfoResponse result = service.writeSqlFile("", "select 1;");

        assertThat(result.path()).endsWith(".sql");
        assertThat(result.filePath()).isEqualTo(result.path());
        assertThat(result.name()).endsWith(".sql");
        assertThat(result.size()).isGreaterThan(0);
        assertThat(result.webManaged()).isTrue();
    }

    private static String projectVersion() throws Exception {
        String pom = Files.readString(Path.of("pom.xml"));
        String artifactMarker = "<artifactId>javanavi-backend</artifactId>";
        int artifactIndex = pom.indexOf(artifactMarker);
        int versionStart = pom.indexOf("<version>", artifactIndex);
        int versionEnd = pom.indexOf("</version>", versionStart);
        return pom.substring(versionStart + "<version>".length(), versionEnd).trim();
    }

    private AppCompatibilityService service() {
        I18nMessages messages = new I18nMessages();
        SecurityProperties properties = properties();
        ObjectMapper objectMapper = objectMapper();
        MemorySecretStore secretStore = secretStore();
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

    private SecurityProperties properties() {
        SecurityProperties properties = new SecurityProperties();
        properties.setDataDirectory(tempDir.toString());
        return properties;
    }

    private ObjectMapper objectMapper() {
        return new ObjectMapper().findAndRegisterModules();
    }

    private MemorySecretStore secretStore() {
        if (secretStore == null) {
            secretStore = new MemorySecretStore();
        }
        return secretStore;
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
