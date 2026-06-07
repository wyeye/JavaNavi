package com.javanavi.connections;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.SavedConnectionViewDto;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ConnectionPackageCompatibilityService {
    private static final TypeReference<List<Map<String, Object>>> LIST_OF_MAPS = new TypeReference<>() {};
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private static final int SCHEMA_VERSION_V1 = 1;
    private static final int SCHEMA_VERSION_V2 = 2;
    private static final int PROTECTION_APP_MANAGED = 1;
    private static final int PROTECTION_PASSWORD_PROTECTED = 2;
    private static final int AES_256_KEY_BYTES = 32;
    private static final int SALT_BYTES = 16;
    private static final int NONCE_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final int KDF_MEMORY_KIB = 65_536;
    private static final int KDF_TIME_COST = 3;
    private static final int KDF_PARALLELISM = 4;
    private static final int KDF_MAX_MEMORY_KIB = 262_144;
    private static final int KDF_MAX_TIME_COST = 10;
    private static final int KDF_MAX_PARALLELISM = 16;
    private static final int MAX_CIPHERTEXT_BYTES = 16 * 1024 * 1024;
    private static final int MAX_PAYLOAD_BASE64_BYTES = ((MAX_CIPHERTEXT_BYTES + 2) / 3) * 4;
    private static final int MAX_IMPORT_BYTES = MAX_PAYLOAD_BASE64_BYTES + (1024 * 1024);

    private static final String KIND = "javanavi_connection_package";
    private static final String LEGACY_KIND = "go" + "navi_connection_package";
    private static final String CIPHER = "AES-256-GCM";
    private static final String KDF_NAME_V1 = "Argon2id";
    private static final String KDF_NAME_V2 = "a2id";
    private static final String APP_KEY_PURPOSE = "javanavi-export-key-v2";
    private static final String APP_KEY_FALLBACK_SEED = "javanavi-connection-package-v2-seed";
    private static final String APP_KEY_FALLBACK_SALT = "javanavi-connection-package-v2-salt";
    private static final String LEGACY_APP_KEY_PURPOSE = "go" + "navi-export-key-v2";
    private static final String LEGACY_APP_KEY_FALLBACK_SEED = "go" + "navi-connection-package-v2-seed";
    private static final String LEGACY_APP_KEY_FALLBACK_SALT = "go" + "navi-connection-package-v2-salt";
    private static final List<String> SECRET_FIELDS = List.of(
            "password",
            "sshPassword",
            "proxyPassword",
            "mysqlReplicaPassword",
            "mongoReplicaPassword",
            "opaqueURI",
            "opaqueDSN"
    );

    private final ObjectMapper objectMapper;
    private final SavedConnectionService savedConnectionService;
    private final I18nMessages messages;
    private final SecureRandom secureRandom = new SecureRandom();

    public ConnectionPackageCompatibilityService(ObjectMapper objectMapper, SavedConnectionService savedConnectionService, I18nMessages messages) {
        this.objectMapper = objectMapper;
        this.savedConnectionService = savedConnectionService;
        this.messages = messages;
    }

    public Map<String, Object> buildExportFile(boolean includeSecrets, String password) {
        Map<String, Object> payload = orderedMap(
                "exportedAt", Instant.now().toString(),
                "connections", savedConnectionService.exportPackageItems(includeSecrets)
        );
        Map<String, Object> encryptedPayload = encryptPayloadSecrets(payload);
        if (includeSecrets && !normalizePassword(password).isBlank()) {
            return encryptProtectedV2(encryptedPayload, password);
        }
        return orderedMap(
                "v", SCHEMA_VERSION_V2,
                "kind", KIND,
                "p", PROTECTION_APP_MANAGED,
                "exportedAt", encryptedPayload.get("exportedAt"),
                "connections", encryptedPayload.get("connections")
        );
    }

    public List<SavedConnectionViewDto> importPayload(String raw, String password) {
        String text = raw == null ? "" : raw.trim();
        if (text.isBlank()) {
            throw new IllegalArgumentException(messages.message("connections.unsupportedPackage"));
        }
        if (text.getBytes(StandardCharsets.UTF_8).length > MAX_IMPORT_BYTES) {
            throw new IllegalArgumentException(messages.message("connections.importTooLarge"));
        }

        try {
            JsonNode root = objectMapper.readTree(text);
            List<Map<String, Object>> packageItems;
            if (root.isArray()) {
                packageItems = objectMapper.convertValue(root, LIST_OF_MAPS);
            } else if (isV2AppManaged(root)) {
                packageItems = payloadConnections(decryptPayloadSecrets(objectMapper.convertValue(root, MAP_TYPE)));
            } else if (isV2Protected(root)) {
                Map<String, Object> encryptedPayload = decryptProtectedV2(objectMapper.convertValue(root, MAP_TYPE), password);
                packageItems = payloadConnections(decryptPayloadSecrets(encryptedPayload));
            } else if (isV1Protected(root)) {
                Map<String, Object> payload = decryptProtectedV1(objectMapper.convertValue(root, MAP_TYPE), password);
                packageItems = payloadConnections(payload);
            } else if (root.has("connections") && root.get("connections").isArray()) {
                packageItems = objectMapper.convertValue(root.get("connections"), LIST_OF_MAPS);
            } else {
                throw new IllegalArgumentException(messages.message("connections.unsupportedPackage"));
            }
            return savedConnectionService.importPackageItems(packageItems);
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException(messages.message("connections.badPasswordOrCorrupt"), error);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> payloadConnections(Map<String, Object> payload) {
        Object connections = payload.get("connections");
        if (!(connections instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                result.add(new LinkedHashMap<>((Map<String, Object>) map));
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> encryptPayloadSecrets(Map<String, Object> payload) {
        byte[] appKey = deriveAppKey(false);
        List<Map<String, Object>> encryptedConnections = new ArrayList<>();
        for (Map<String, Object> item : payloadConnections(payload)) {
            Map<String, Object> encryptedItem = new LinkedHashMap<>(item);
            Map<String, Object> secrets = item.get("secrets") instanceof Map<?, ?> secretMap
                    ? new LinkedHashMap<>((Map<String, Object>) secretMap)
                    : Map.of();
            Map<String, Object> encryptedSecrets = transformSecretBundle(secrets, value -> encryptSecretField(appKey, value, packageItemAad(item)));
            if (encryptedSecrets.isEmpty()) {
                encryptedItem.remove("secrets");
            } else {
                encryptedItem.put("secrets", encryptedSecrets);
            }
            encryptedConnections.add(encryptedItem);
        }
        return orderedMap(
                "exportedAt", payload.get("exportedAt"),
                "connections", encryptedConnections
        );
    }

    private Map<String, Object> decryptPayloadSecrets(Map<String, Object> payload) {
        try {
            return decryptPayloadSecretsWithKey(payload, deriveAppKey(false));
        } catch (IllegalArgumentException currentError) {
            return decryptPayloadSecretsWithKey(payload, deriveAppKey(true));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> decryptPayloadSecretsWithKey(Map<String, Object> payload, byte[] appKey) {
        List<Map<String, Object>> decryptedConnections = new ArrayList<>();
        for (Map<String, Object> item : payloadConnections(payload)) {
            Map<String, Object> decryptedItem = new LinkedHashMap<>(item);
            Map<String, Object> secrets = item.get("secrets") instanceof Map<?, ?> secretMap
                    ? new LinkedHashMap<>((Map<String, Object>) secretMap)
                    : Map.of();
            Map<String, Object> decryptedSecrets = transformSecretBundle(secrets, value -> decryptSecretField(appKey, value, packageItemAad(item)));
            if (decryptedSecrets.isEmpty()) {
                decryptedItem.remove("secrets");
            } else {
                decryptedItem.put("secrets", decryptedSecrets);
            }
            decryptedConnections.add(decryptedItem);
        }
        return orderedMap(
                "exportedAt", payload.get("exportedAt"),
                "connections", decryptedConnections
        );
    }

    private Map<String, Object> transformSecretBundle(Map<String, Object> secrets, SecretTransform transform) {
        Map<String, Object> transformed = new LinkedHashMap<>();
        for (String key : SECRET_FIELDS) {
            String value = stringValue(secrets.get(key));
            if (!value.isBlank()) {
                transformed.put(key, transform.apply(value));
            }
        }
        return transformed;
    }

    private Map<String, Object> encryptProtectedV2(Map<String, Object> encryptedPayload, String password) {
        String normalizedPassword = requirePassword(password);
        byte[] salt = randomBytes(SALT_BYTES);
        byte[] nonce = randomBytes(NONCE_BYTES);
        Map<String, Object> kdf = kdfSpecV2(Base64.getEncoder().encodeToString(salt));
        Map<String, Object> envelopeHeader = orderedMap(
                "v", SCHEMA_VERSION_V2,
                "kind", KIND,
                "p", PROTECTION_PASSWORD_PROTECTED,
                "kdf", kdf,
                "nc", Base64.getEncoder().encodeToString(nonce)
        );
        byte[] key = deriveConnectionPackageKey(normalizedPassword, salt, KDF_TIME_COST, KDF_MEMORY_KIB, KDF_PARALLELISM);
        byte[] aad = writeJsonBytes(envelopeHeader);
        byte[] cipherText = encryptAesGcm(key, nonce, writeJsonBytes(encryptedPayload), aad);
        return orderedMap(
                "v", SCHEMA_VERSION_V2,
                "kind", KIND,
                "p", PROTECTION_PASSWORD_PROTECTED,
                "kdf", kdf,
                "nc", envelopeHeader.get("nc"),
                "d", Base64.getEncoder().encodeToString(cipherText)
        );
    }

    private Map<String, Object> decryptProtectedV2(Map<String, Object> file, String password) {
        String normalizedPassword = requirePassword(password);
        Map<String, Object> kdf = canonicalKdfV2(mapValue(file.get("kdf")));
        validateKdfV2(kdf);
        byte[] salt = decodeBase64(stringValue(kdf.get("s")));
        byte[] nonce = decodeBase64(stringValue(file.get("nc")));
        byte[] cipherText = decodeCipherText(stringValue(file.get("d")));
        Map<String, Object> aadMap = orderedMap(
                "v", SCHEMA_VERSION_V2,
                "kind", packageKind(file),
                "p", PROTECTION_PASSWORD_PROTECTED,
                "kdf", kdf,
                "nc", file.get("nc")
        );
        byte[] key = deriveConnectionPackageKey(
                normalizedPassword,
                salt,
                intValue(kdf.get("t")),
                intValue(kdf.get("m")),
                intValue(kdf.get("l"))
        );
        byte[] plain = decryptAesGcm(key, nonce, cipherText, writeJsonBytes(aadMap));
        return readMap(plain);
    }

    private Map<String, Object> decryptProtectedV1(Map<String, Object> file, String password) {
        String normalizedPassword = requirePassword(password);
        Map<String, Object> kdf = canonicalKdfV1(mapValue(file.get("kdf")));
        validateKdfV1(kdf);
        byte[] salt = decodeBase64(stringValue(kdf.get("salt")));
        byte[] nonce = decodeBase64(stringValue(file.get("nonce")));
        byte[] cipherText = decodeCipherText(stringValue(file.get("payload")));
        Map<String, Object> aadMap = orderedMap(
                "schemaVersion", SCHEMA_VERSION_V1,
                "kind", packageKind(file),
                "cipher", CIPHER,
                "kdf", kdf,
                "nonce", file.get("nonce")
        );
        byte[] key = deriveConnectionPackageKey(
                normalizedPassword,
                salt,
                intValue(kdf.get("timeCost")),
                intValue(kdf.get("memoryKiB")),
                intValue(kdf.get("parallelism"))
        );
        byte[] plain = decryptAesGcm(key, nonce, cipherText, writeJsonBytes(aadMap));
        return readMap(plain);
    }

    private byte[] deriveAppKey(boolean legacy) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            String seed = legacy ? LEGACY_APP_KEY_FALLBACK_SEED : APP_KEY_FALLBACK_SEED;
            String purpose = legacy ? LEGACY_APP_KEY_PURPOSE : APP_KEY_PURPOSE;
            String fallbackSalt = legacy ? LEGACY_APP_KEY_FALLBACK_SALT : APP_KEY_FALLBACK_SALT;
            mac.init(new SecretKeySpec(seed.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] intermediate = mac.doFinal(purpose.getBytes(StandardCharsets.UTF_8));
            byte[] saltHash = MessageDigest.getInstance("SHA-256").digest(fallbackSalt.getBytes(StandardCharsets.UTF_8));
            byte[] salt = new byte[SALT_BYTES];
            System.arraycopy(saltHash, 0, salt, 0, SALT_BYTES);
            return deriveConnectionPackageKey(intermediate, salt, KDF_TIME_COST, KDF_MEMORY_KIB, KDF_PARALLELISM);
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("Unable to derive JavaNavi connection package app key.", error);
        }
    }

    private byte[] deriveConnectionPackageKey(String password, byte[] salt, int timeCost, int memoryKiB, int parallelism) {
        return deriveConnectionPackageKey(password.getBytes(StandardCharsets.UTF_8), salt, timeCost, memoryKiB, parallelism);
    }

    private byte[] deriveConnectionPackageKey(byte[] password, byte[] salt, int timeCost, int memoryKiB, int parallelism) {
        validateKdfNumbers(memoryKiB, timeCost, parallelism);
        Argon2Parameters parameters = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                .withSalt(salt)
                .withMemoryAsKB(memoryKiB)
                .withIterations(timeCost)
                .withParallelism(parallelism)
                .build();
        Argon2BytesGenerator generator = new Argon2BytesGenerator();
        generator.init(parameters);
        byte[] key = new byte[AES_256_KEY_BYTES];
        generator.generateBytes(password, key);
        return key;
    }

    private String encryptSecretField(byte[] appKey, String plaintext, String aad) {
        if (plaintext.isBlank()) {
            return "";
        }
        byte[] nonce = randomBytes(NONCE_BYTES);
        byte[] cipherText = encryptAesGcm(appKey, nonce, plaintext.getBytes(StandardCharsets.UTF_8), aad.getBytes(StandardCharsets.UTF_8));
        byte[] encoded = new byte[NONCE_BYTES + cipherText.length];
        System.arraycopy(nonce, 0, encoded, 0, NONCE_BYTES);
        System.arraycopy(cipherText, 0, encoded, NONCE_BYTES, cipherText.length);
        return Base64.getEncoder().encodeToString(encoded);
    }

    private String decryptSecretField(byte[] appKey, String encrypted, String aad) {
        if (encrypted.isBlank()) {
            return "";
        }
        byte[] raw = decodeBase64(encrypted);
        if (raw.length <= NONCE_BYTES) {
            throw new IllegalArgumentException(messages.message("connections.badPasswordOrCorrupt"));
        }
        byte[] nonce = new byte[NONCE_BYTES];
        byte[] cipherText = new byte[raw.length - NONCE_BYTES];
        System.arraycopy(raw, 0, nonce, 0, NONCE_BYTES);
        System.arraycopy(raw, NONCE_BYTES, cipherText, 0, cipherText.length);
        return new String(decryptAesGcm(appKey, nonce, cipherText, aad.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
    }

    private byte[] encryptAesGcm(byte[] key, byte[] nonce, byte[] plain, byte[] aad) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(aad);
            byte[] cipherText = cipher.doFinal(plain);
            if (cipherText.length > MAX_CIPHERTEXT_BYTES) {
                throw new IllegalArgumentException(messages.message("connections.packageTooLarge"));
            }
            return cipherText;
        } catch (GeneralSecurityException error) {
            throw new IllegalArgumentException(messages.message("connections.badPasswordOrCorrupt"), error);
        }
    }

    private byte[] decryptAesGcm(byte[] key, byte[] nonce, byte[] cipherText, byte[] aad) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
            cipher.updateAAD(aad);
            return cipher.doFinal(cipherText);
        } catch (GeneralSecurityException error) {
            throw new IllegalArgumentException(messages.message("connections.badPasswordOrCorrupt"), error);
        }
    }

    private Map<String, Object> kdfSpecV2(String salt) {
        return orderedMap(
                "n", KDF_NAME_V2,
                "m", KDF_MEMORY_KIB,
                "t", KDF_TIME_COST,
                "l", KDF_PARALLELISM,
                "s", salt
        );
    }

    private Map<String, Object> canonicalKdfV1(Map<String, Object> kdf) {
        return orderedMap(
                "name", kdf.get("name"),
                "memoryKiB", kdf.get("memoryKiB"),
                "timeCost", kdf.get("timeCost"),
                "parallelism", kdf.get("parallelism"),
                "salt", kdf.get("salt")
        );
    }

    private Map<String, Object> canonicalKdfV2(Map<String, Object> kdf) {
        return orderedMap(
                "n", kdf.get("n"),
                "m", kdf.get("m"),
                "t", kdf.get("t"),
                "l", kdf.get("l"),
                "s", kdf.get("s")
        );
    }

    private boolean isV2AppManaged(JsonNode root) {
        return root.path("v").asInt() == SCHEMA_VERSION_V2
                && isKnownPackageKind(root.path("kind").asText())
                && root.path("p").asInt() == PROTECTION_APP_MANAGED;
    }

    private boolean isV2Protected(JsonNode root) {
        return root.path("v").asInt() == SCHEMA_VERSION_V2
                && isKnownPackageKind(root.path("kind").asText())
                && root.path("p").asInt() == PROTECTION_PASSWORD_PROTECTED;
    }

    private boolean isV1Protected(JsonNode root) {
        return root.path("schemaVersion").asInt() == SCHEMA_VERSION_V1
                && isKnownPackageKind(root.path("kind").asText())
                && CIPHER.equals(root.path("cipher").asText());
    }


    private static boolean isKnownPackageKind(String kind) {
        return KIND.equals(kind) || LEGACY_KIND.equals(kind);
    }

    private static String packageKind(Map<String, Object> file) {
        String kind = stringValue(file.get("kind"));
        return isKnownPackageKind(kind) ? kind : KIND;
    }

    private void validateKdfV2(Map<String, Object> kdf) {
        if (!KDF_NAME_V2.equals(stringValue(kdf.get("n")))) {
            throw new IllegalArgumentException(messages.message("connections.unsupportedPackage"));
        }
        validateKdfNumbers(intValue(kdf.get("m")), intValue(kdf.get("t")), intValue(kdf.get("l")));
    }

    private void validateKdfV1(Map<String, Object> kdf) {
        if (!KDF_NAME_V1.equals(stringValue(kdf.get("name")))) {
            throw new IllegalArgumentException(messages.message("connections.unsupportedPackage"));
        }
        validateKdfNumbers(intValue(kdf.get("memoryKiB")), intValue(kdf.get("timeCost")), intValue(kdf.get("parallelism")));
    }

    private void validateKdfNumbers(int memoryKiB, int timeCost, int parallelism) {
        if (memoryKiB <= 0 || timeCost <= 0 || parallelism <= 0
                || memoryKiB > KDF_MAX_MEMORY_KIB
                || timeCost > KDF_MAX_TIME_COST
                || parallelism > KDF_MAX_PARALLELISM) {
            throw new IllegalArgumentException(messages.message("connections.unsupportedPackage"));
        }
    }

    private String packageItemAad(Map<String, Object> item) {
        String id = stringValue(item.get("id")).trim();
        if (!id.isBlank()) {
            return id;
        }
        Map<String, Object> config = mapValue(item.get("config"));
        return stringValue(config.get("id")).trim();
    }

    private byte[] randomBytes(int count) {
        byte[] bytes = new byte[count];
        secureRandom.nextBytes(bytes);
        return bytes;
    }

    private byte[] decodeCipherText(String base64) {
        if (base64.length() > MAX_PAYLOAD_BASE64_BYTES) {
            throw new IllegalArgumentException(messages.message("connections.packageTooLarge"));
        }
        byte[] bytes = decodeBase64(base64);
        if (bytes.length == 0 || bytes.length > MAX_CIPHERTEXT_BYTES) {
            throw new IllegalArgumentException(messages.message("connections.packageTooLarge"));
        }
        return bytes;
    }

    private byte[] decodeBase64(String value) {
        try {
            return Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException(messages.message("connections.badPasswordOrCorrupt"), error);
        }
    }

    private byte[] writeJsonBytes(Object value) {
        try {
            return objectMapper.writeValueAsBytes(value);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException(messages.message("connections.unsupportedPackage"), error);
        }
    }

    private Map<String, Object> readMap(byte[] json) {
        try {
            return objectMapper.readValue(json, MAP_TYPE);
        } catch (IOException error) {
            throw new IllegalArgumentException(messages.message("connections.badPasswordOrCorrupt"), error);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        return new LinkedHashMap<>((Map<String, Object>) map);
    }

    private String requirePassword(String password) {
        String normalized = normalizePassword(password);
        if (normalized.isBlank()) {
            throw new IllegalArgumentException(messages.message("connections.passwordRequired"));
        }
        return normalized;
    }

    private static String normalizePassword(String password) {
        return password == null ? "" : password.trim();
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static int intValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(stringValue(value));
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    private Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    @FunctionalInterface
    private interface SecretTransform {
        String apply(String value);
    }
}
