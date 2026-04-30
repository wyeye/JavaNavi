package com.javanavi.model;

import java.util.List;
import java.util.Map;

public record ChangeSetDto(
        List<Map<String, Object>> inserts,
        List<UpdateRowDto> updates,
        List<Map<String, Object>> deletes,
        String locatorStrategy
) {
    public ChangeSetDto(
            List<Map<String, Object>> inserts,
            List<UpdateRowDto> updates,
            List<Map<String, Object>> deletes
    ) {
        this(inserts, updates, deletes, null);
    }
}
