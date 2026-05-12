package com.javanavi.model;

import com.javanavi.security.SecretStoreStatus;

public record LocalSessionDto(
        String token,
        String tokenFingerprint,
        String sessionId,
        String headerName,
        String cookieName,
        boolean localSessionRequired,
        SecretStoreStatus secretStore
) {
}
