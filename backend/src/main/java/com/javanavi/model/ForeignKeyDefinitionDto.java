package com.javanavi.model;

public record ForeignKeyDefinitionDto(
        String name,
        String columnName,
        String refTableName,
        String refColumnName,
        String constraintName
) {
}
