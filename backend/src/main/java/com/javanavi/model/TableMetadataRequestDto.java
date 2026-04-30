package com.javanavi.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record TableMetadataRequestDto(
        @Valid @NotNull ConnectionConfigDto connection,
        String database,
        @NotBlank String table
) {
}
