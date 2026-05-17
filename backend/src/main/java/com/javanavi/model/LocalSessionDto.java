package com.javanavi.model;

import com.javanavi.security.SecretStoreStatus;

import java.time.Instant;

public record LocalSessionDto(
        String token,
        String tokenFingerprint,
        String sessionId,
        Instant expiresAt,
        String headerName,
        String cookieName,
        boolean localSessionRequired,
        SecretStoreStatus secretStore
) {
}
