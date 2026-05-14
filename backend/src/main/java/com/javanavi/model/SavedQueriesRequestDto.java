package com.javanavi.model;

import java.util.List;

public record SavedQueriesRequestDto(
        List<SavedQueryDto> queries
) {
}
