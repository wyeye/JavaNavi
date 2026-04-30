package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ColumnDefinitionDto(
        String name,
        String type,
        String nullable,
        String key,
        @JsonProperty("default") String defaultValue,
        String extra,
        String comment
) {
}
