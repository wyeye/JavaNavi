package com.javanavi.model;

public record SavedQueryDto(
        String id,
        String name,
        String sql,
        String connectionId,
        String dbName,
        Long createdAt
) {
}
