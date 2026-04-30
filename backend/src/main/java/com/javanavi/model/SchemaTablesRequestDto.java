package com.javanavi.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record SchemaTablesRequestDto(
        @Valid @NotNull ConnectionConfigDto connection,
        String database
) {
}
