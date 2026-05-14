package com.javanavi.model;

import java.util.List;

public record SavedConnectionTagsRequestDto(
        List<ConnectionTagDto> tags
) {
}
