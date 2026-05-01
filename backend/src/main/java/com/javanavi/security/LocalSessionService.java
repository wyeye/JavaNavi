package com.javanavi.security;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class LocalSessionService {
    public static final String SECURITY_DISABLED_SESSION_ID = "local-session-security-disabled";

    private static final Duration SESSION_TTL = Duration.ofHours(12);
    private static final ThreadLocal<String> CURRENT_SESSION_ID = new ThreadLocal<>();

    private final SecureRandom secureRandom = new SecureRandom();
    private final ConcurrentMap<String, LocalSession> sessions = new ConcurrentHashMap<>();

    public IssuedSession issueSession() {
        pruneExpiredSessions();
        while (true) {
            String token = randomToken();
            String sessionId = "local-" + fingerprint(token);
            String tokenFingerprint = fingerprint(token + ":fingerprint");
            Instant expiresAt = Instant.now().plus(SESSION_TTL);
            LocalSession session = new LocalSession(token, sessionId, tokenFingerprint, expiresAt);
            if (sessions.putIfAbsent(token, session) == null) {
                return new IssuedSession(token, sessionId, tokenFingerprint, expiresAt);
            }
        }
    }

    /**
     * Legacy helper retained for older callers. New code should use {@link #issueSession()}
     * so it can report the matching fingerprint and session id without exposing the token.
     */
    public String issueToken() {
        return issueSession().token();
    }

    public Optional<IssuedSession> sessionForToken(String candidate) {
        return activeSession(candidate)
                .map(session -> new IssuedSession(
                        session.token(),
                        session.sessionId(),
                        session.tokenFingerprint(),
                        session.expiresAt()
                ));
    }

    public Optional<String> authenticate(String candidate) {
        return activeSession(candidate).map(LocalSession::sessionId);
    }

    private Optional<LocalSession> activeSession(String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return Optional.empty();
        }
        LocalSession session = sessions.get(candidate);
        if (session == null) {
            return Optional.empty();
        }
        if (session.isExpired()) {
            sessions.remove(candidate, session);
            return Optional.empty();
        }
        byte[] left = session.token().getBytes(StandardCharsets.UTF_8);
        byte[] right = candidate.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(left, right)) {
            return Optional.empty();
        }
        return Optional.of(session);
    }

    public boolean matches(String candidate) {
        return authenticate(candidate).isPresent();
    }

    public void bindCurrentSession(String sessionId) {
        if (sessionId != null && !sessionId.isBlank()) {
            CURRENT_SESSION_ID.set(sessionId);
        }
    }

    public Optional<String> currentSessionId() {
        return Optional.ofNullable(CURRENT_SESSION_ID.get());
    }

    public void clearCurrentSession() {
        CURRENT_SESSION_ID.remove();
    }

    private String randomToken() {
        byte[] raw = new byte[32];
        secureRandom.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    private void pruneExpiredSessions() {
        sessions.entrySet().removeIf(entry -> entry.getValue().isExpired());
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

    public record IssuedSession(String token, String sessionId, String tokenFingerprint, Instant expiresAt) {
    }

    private record LocalSession(String token, String sessionId, String tokenFingerprint, Instant expiresAt) {
        private boolean isExpired() {
            return !expiresAt.isAfter(Instant.now());
        }
    }
}
