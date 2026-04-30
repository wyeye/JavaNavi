package com.javanavi.model;

import jakarta.validation.constraints.NotBlank;

public record ConnectionCloseRequestDto(
        @NotBlank String connectionId
) {
}
