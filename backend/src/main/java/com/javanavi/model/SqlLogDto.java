package com.javanavi.model;

public record SqlLogDto(
        String id,
        Long timestamp,
        String sql,
        String status,
        Long duration,
        String message,
        String dbName,
        Long affectedRows
) {
}
