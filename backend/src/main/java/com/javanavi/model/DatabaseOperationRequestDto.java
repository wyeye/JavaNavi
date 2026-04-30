package com.javanavi.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record DatabaseOperationRequestDto(
        @Valid @NotNull ConnectionConfigDto connection,
        String database,
        String name,
        String newName,
        List<String> tables,
        Boolean includeData
) {
}
