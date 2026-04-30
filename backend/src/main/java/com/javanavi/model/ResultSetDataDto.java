package com.javanavi.model;

import java.util.List;
import java.util.Map;

public record ResultSetDataDto(
        List<Map<String, Object>> rows,
        List<String> columns
) {
}
