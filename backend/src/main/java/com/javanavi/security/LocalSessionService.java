package com.javanavi.security;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

@Service
public class LocalSessionService {
    private final String token;
    private final String tokenFingerprint;

    public LocalSessionService() {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        this.token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        this.tokenFingerprint = fingerprint(token);
    }

    public String issueToken() {
        return token;
    }

    public String tokenFingerprint() {
        return tokenFingerprint;
    }

    public boolean matches(String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return false;
        }
        byte[] left = token.getBytes(StandardCharsets.UTF_8);
        byte[] right = candidate.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(left, right);
    }

    private static String fingerprint(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            String encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
            return encoded.substring(0, 16);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 digest is required for JavaNavi session fingerprints", error);
        }
    }
}
