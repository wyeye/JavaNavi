package com.javanavi.model;

public record ColumnDefinitionWithTableDto(
        String tableName,
        String name,
        String type
) {
}
