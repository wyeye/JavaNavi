package com.javanavi.connections;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.api.SavedConnectionController;
import com.javanavi.config.SecurityProperties;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.SavedConnectionDeleteResultDto;
import com.javanavi.model.SavedConnectionIdRequestDto;
import com.javanavi.model.SavedConnectionInputDto;
import com.javanavi.model.SavedConnectionViewDto;
import com.javanavi.security.SecretStore;
import com.javanavi.security.SecretStoreStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.assertThat;

class SavedConnectionServiceTest {
    @TempDir
    Path tempDir;

    @Test
    void saveRedactsAndResolvesPrimaryOpaqueAndMongoReplicaSecrets() {
        SavedConnectionService service = service();
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("id", "mongo-prod");
        config.put("type", "mongodb");
        config.put("host", "mongo.local");
        config.put("port", 27017);
        config.put("user", "primary");
        config.put("password", "primary-secret");
        config.put("uri", "mongodb://primary:primary-secret@mongo.local/admin");
        config.put("dsn", "jdbc:custom://opaque");
        config.put("mongoReplicaUser", "replica");
        config.put("mongoReplicaPassword", "replica-secret");

        SavedConnectionViewDto saved = service.save(new SavedConnectionInputDto(
                "mongo-prod",
                "Mongo Prod",
                config,
                List.of("admin"),
                null,
                null,
                null,
                false,
                false,
                false,
                false,
                false,
                false,
                false
        ));

        assertThat(saved.hasPrimaryPassword()).isTrue();
        assertThat(saved.hasMongoReplicaPassword()).isTrue();
        assertThat(saved.hasOpaqueURI()).isTrue();
        assertThat(saved.hasOpaqueDSN()).isTrue();
        assertThat(saved.config()).containsEntry("password", "");
        assertThat(saved.config()).containsEntry("mongoReplicaPassword", "");
        assertThat(saved.config()).containsEntry("uri", "");
        assertThat(saved.config()).containsEntry("dsn", "");

        ConnectionConfigDto resolved = service.resolveSavedSecret(new ConnectionConfigDto(
                "mongo-prod",
                "Mongo Prod",
                "mongodb",
                null,
                "mongo.local",
                27017,
                "admin",
                "primary",
                "",
                Map.of(),
                30,
                true,
                "required",
                "",
                "",
                List.of(),
                "replica",
                "rs0",
                "admin",
                "primary",
                false,
                "SCRAM-SHA-256",
                "replica",
                ""
        ));

        assertThat(resolved.password()).isEqualTo("primary-secret");
        assertThat(resolved.mongoReplicaPassword()).isEqualTo("replica-secret");
        assertThat(resolved.uri()).isEqualTo("mongodb://primary:primary-secret@mongo.local/admin");
        assertThat(resolved.dsn()).isEqualTo("jdbc:custom://opaque");
    }

    @Test
    void deleteEndpointReturnsTypedDeleteResult() {
        SavedConnectionService service = service();
        service.save(new SavedConnectionInputDto(
                "to-delete",
                "To Delete",
                Map.of("id", "to-delete", "type", "demo"),
                null,
                null,
                null,
                null,
                false,
                false,
                false,
                false,
                false,
                false,
                false
        ));
        SavedConnectionController controller = new SavedConnectionController(service);

        ApiEnvelope<SavedConnectionDeleteResultDto> envelope = controller.delete(new SavedConnectionIdRequestDto("to-delete", null));

        assertThat(envelope.success()).isTrue();
        assertThat(envelope.data().connectionId()).isEqualTo("to-delete");
        assertThat(envelope.data().deleted()).isTrue();
    }

    @Test
    void saveDropsClientSuppliedGlobalProxyFromConnectionConfig() {
        SavedConnectionService service = service();
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("id", "postgres-prod");
        config.put("type", "postgresql");
        config.put("host", "db.local");
        config.put("port", 5432);
        config.put("globalProxy", Map.of(
                "type", "http",
                "host", "client.proxy",
                "port", 8080,
                "user", "proxy-user",
                "password", "proxy-secret"
        ));

        SavedConnectionViewDto saved = service.save(new SavedConnectionInputDto(
                "postgres-prod",
                "Postgres Prod",
                config,
                null,
                null,
                null,
                null,
                false,
                false,
                false,
                false,
                false,
                false,
                false
        ));

        assertThat(saved.config()).doesNotContainKey("globalProxy");
    }

    private SavedConnectionService service() {
        SecurityProperties properties = new SecurityProperties();
        properties.setDataDirectory(tempDir.toString());
        return new SavedConnectionService(properties, new ObjectMapper().findAndRegisterModules(), new MemorySecretStore());
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
