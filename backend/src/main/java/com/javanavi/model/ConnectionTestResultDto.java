package com.javanavi.model;

public record ConnectionTestResultDto(
        String connectionId,
        String driverType,
        boolean connected,
        String message
) {
}
