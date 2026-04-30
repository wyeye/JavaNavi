package com.javanavi.model;

public record SavedConnectionIdRequestDto(
        String connectionId,
        String id
) {
    public String resolvedId() {
        if (connectionId != null && !connectionId.isBlank()) {
            return connectionId;
        }
        return id;
    }
}
