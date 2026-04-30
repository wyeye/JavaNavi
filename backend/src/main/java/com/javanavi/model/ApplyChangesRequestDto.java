package com.javanavi.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ApplyChangesRequestDto(
        @Valid @NotNull ConnectionConfigDto connection,
        String database,
        @NotBlank String table,
        @Valid @NotNull ChangeSetDto changes
) {
}
