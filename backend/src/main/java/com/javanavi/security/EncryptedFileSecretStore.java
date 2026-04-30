package com.javanavi.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
public class EncryptedFileSecretStore implements SecretStore {
    private static final TypeReference<Map<String, String>> STRING_MAP = new TypeReference<>() {};
    private static final int KEY_BYTES = 32;
    private static final int IV_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;

    private final ObjectMapper objectMapper;
    private final Path directory;
    private final Path keyFile;
    private final Path secretsFile;
    private final SecureRandom secureRandom = new SecureRandom();

    public EncryptedFileSecretStore(SecurityProperties properties, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.directory = Path.of(properties.getDataDirectory()).toAbsolutePath().normalize();
        this.keyFile = directory.resolve("secrets.key");
        this.secretsFile = directory.resolve("secrets.json.aesgcm");
    }

    @Override
    public SecretStoreStatus status() {
        return new SecretStoreStatus(true, "aes-gcm-local-file", secretsFile.toString(), true);
    }

    @Override
    public synchronized void put(String key, String secret) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Secret key must not be blank.");
        }
        Map<String, String> secrets = readAll();
        secrets.put(key, secret == null ? "" : secret);
        writeAll(secrets);
    }

    @Override
    public synchronized Optional<String> get(String key) {
        return Optional.ofNullable(readAll().get(key));
    }

    @Override
    public synchronized void delete(String key) {
        Map<String, String> secrets = readAll();
        if (secrets.remove(key) != null) {
            writeAll(secrets);
        }
    }

    private Map<String, String> readAll() {
        try {
            if (!Files.exists(secretsFile)) {
                return new LinkedHashMap<>();
            }
            String text = Files.readString(secretsFile, StandardCharsets.UTF_8);
            if (text.isBlank()) {
                return new LinkedHashMap<>();
            }
            String[] lines = text.split("\\n", 3);
            if (lines.length != 3 || !"version:1".equals(lines[0]) || !lines[1].startsWith("iv:")) {
                throw new IllegalStateException("Secret store format is not recognized.");
            }
            byte[] iv = Base64.getDecoder().decode(lines[1].substring(3));
            byte[] encrypted = Base64.getDecoder().decode(lines[2].substring("payload:".length()));
            byte[] json = decrypt(loadOrCreateKey(), iv, encrypted);
            return objectMapper.readValue(json, STRING_MAP);
        } catch (IOException | GeneralSecurityException error) {
            throw new IllegalStateException("Unable to read encrypted JavaNavi secret store.", error);
        }
    }

    private void writeAll(Map<String, String> secrets) {
        try {
            Files.createDirectories(directory);
            restrictOwnerOnly(directory);
            byte[] iv = new byte[IV_BYTES];
            secureRandom.nextBytes(iv);
            byte[] json = objectMapper.writeValueAsBytes(secrets);
            byte[] encrypted = encrypt(loadOrCreateKey(), iv, json);
            String text = "version:1\n"
                    + "iv:" + Base64.getEncoder().encodeToString(iv) + "\n"
                    + "payload:" + Base64.getEncoder().encodeToString(encrypted);
            Files.writeString(secretsFile, text, StandardCharsets.UTF_8);
            restrictOwnerOnly(secretsFile);
        } catch (IOException | GeneralSecurityException error) {
            throw new IllegalStateException("Unable to write encrypted JavaNavi secret store.", error);
        }
    }

    private byte[] loadOrCreateKey() throws IOException {
        Files.createDirectories(directory);
        restrictOwnerOnly(directory);
        if (Files.exists(keyFile)) {
            return Base64.getDecoder().decode(Files.readString(keyFile, StandardCharsets.UTF_8).trim());
        }
        byte[] key = new byte[KEY_BYTES];
        secureRandom.nextBytes(key);
        Files.writeString(keyFile, Base64.getEncoder().encodeToString(key), StandardCharsets.UTF_8);
        restrictOwnerOnly(keyFile);
        return key;
    }

    private static byte[] encrypt(byte[] key, byte[] iv, byte[] payload) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return cipher.doFinal(payload);
    }

    private static byte[] decrypt(byte[] key, byte[] iv, byte[] payload) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return cipher.doFinal(payload);
    }

    private static void restrictOwnerOnly(Path path) {
        try {
            Set<PosixFilePermission> permissions = Files.isDirectory(path)
                    ? EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE, PosixFilePermission.OWNER_EXECUTE)
                    : EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
            Files.setPosixFilePermissions(path, permissions);
        } catch (UnsupportedOperationException | IOException ignored) {
            // Non-POSIX file systems cannot apply these permissions. The store is
            // still encrypted; packaging tests assert encryption instead of mode bits.
        }
    }
}
