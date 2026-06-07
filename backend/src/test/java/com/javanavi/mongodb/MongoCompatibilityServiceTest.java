package com.javanavi.mongodb;

import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.MongoContracts;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

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
