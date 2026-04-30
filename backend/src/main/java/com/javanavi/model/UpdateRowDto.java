package com.javanavi.model;

import java.util.Map;

public record UpdateRowDto(
        Map<String, Object> keys,
        Map<String, Object> values
) {
}
