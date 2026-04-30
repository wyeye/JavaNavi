package com.javanavi.model;

import java.time.Instant;
import java.util.Map;

public record CompatEventDto(
        String id,
        String eventName,
        String family,
        String source,
        String correlationId,
        String phase,
        String message,
        Instant timestamp,
        Map<String, Object> payload
) {
}
