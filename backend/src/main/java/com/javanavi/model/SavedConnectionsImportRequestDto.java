package com.javanavi.model;

import java.util.List;

public record SavedConnectionsImportRequestDto(
        List<SavedConnectionInputDto> connections
) {
}
