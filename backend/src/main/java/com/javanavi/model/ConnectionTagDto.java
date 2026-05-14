package com.javanavi.model;

import java.util.List;

public record ConnectionTagDto(
        String id,
        String name,
        List<String> connectionIds
) {
}
