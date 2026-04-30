package com.javanavi.model;

import java.time.Instant;

public record ConnectionPoolStatusDto(
        String connectionId,
        String driverType,
        boolean pooled,
        int activeConnections,
        int idleConnections,
        int totalConnections,
        int maxPoolSize,
        Instant createdAt,
        Instant lastUsedAt
) {
}
