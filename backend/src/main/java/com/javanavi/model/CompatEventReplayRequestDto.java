package com.javanavi.model;

import java.util.Map;

public record CompatEventReplayRequestDto(
        String family,
        String correlationId,
        String eventName,
        Map<String, Object> payload
) {
}
