package com.javanavi.model;

public record ErrorLogDto(
        String id,
        String createdAt,
        String level,
        String requestMethod,
        String requestPath,
        String errorType,
        String message,
        String stackTrace,
        boolean resolved
) {
}
