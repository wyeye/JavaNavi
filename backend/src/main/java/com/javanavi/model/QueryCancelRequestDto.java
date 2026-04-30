package com.javanavi.model;

import jakarta.validation.constraints.NotBlank;

public record QueryCancelRequestDto(
        @NotBlank String queryId
) {
}
