package com.javanavi.model;

public record IndexDefinitionDto(
        String name,
        String columnName,
        int nonUnique,
        int seqInIndex,
        String indexType,
        int subPart
) {
}
