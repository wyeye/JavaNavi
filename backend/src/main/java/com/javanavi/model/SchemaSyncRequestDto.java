package com.javanavi.model;

import jakarta.validation.Valid;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record SchemaSyncRequestDto(
        @Valid ConnectionConfigDto sourceConfig,
        @Valid ConnectionConfigDto targetConfig,
        String sourceDatabase,
        String targetDatabase,
        List<String> tables,
        List<String> selectedItemIds,
        List<String> confirmedDeleteItemIds,
        String jobId,
        String table
) {
    public Map<String, Object> toCompatibilityMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        if (sourceConfig != null) {
            map.put("sourceConfig", CompatibilityRequestMaps.connectionConfig(sourceConfig));
        }
        if (targetConfig != null) {
            map.put("targetConfig", CompatibilityRequestMaps.connectionConfig(targetConfig));
        }
        CompatibilityRequestMaps.putIfNotNull(map, "sourceDatabase", sourceDatabase);
        CompatibilityRequestMaps.putIfNotNull(map, "targetDatabase", targetDatabase);
        map.put("tables", CompatibilityRequestMaps.stringList(tables));
        CompatibilityRequestMaps.putIfNotNull(map, "selectedItemIds", selectedItemIds);
        CompatibilityRequestMaps.putIfNotNull(map, "confirmedDeleteItemIds", confirmedDeleteItemIds);
        CompatibilityRequestMaps.putIfNotNull(map, "jobId", jobId);
        CompatibilityRequestMaps.putIfNotNull(map, "table", table);
        return map;
    }
}
