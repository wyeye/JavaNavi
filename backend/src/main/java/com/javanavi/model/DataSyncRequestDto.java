package com.javanavi.model;

import jakarta.validation.Valid;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record DataSyncRequestDto(
        @Valid ConnectionConfigDto sourceConfig,
        @Valid ConnectionConfigDto targetConfig,
        List<String> tables,
        String sourceQuery,
        String content,
        String mode,
        String jobId,
        Boolean autoAddColumns,
        String targetTableStrategy,
        Boolean createIndexes,
        String mongoCollectionName,
        Map<String, DataSyncTableOptionsDto> tableOptions,
        Map<String, Object> fixtures,
        String table,
        Integer limit
) {
    public Map<String, Object> toCompatibilityMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        if (sourceConfig != null) {
            map.put("sourceConfig", CompatibilityRequestMaps.connectionConfig(sourceConfig));
        }
        if (targetConfig != null) {
            map.put("targetConfig", CompatibilityRequestMaps.connectionConfig(targetConfig));
        }
        map.put("tables", CompatibilityRequestMaps.stringList(tables));
        CompatibilityRequestMaps.putIfNotNull(map, "sourceQuery", sourceQuery);
        CompatibilityRequestMaps.putIfNotNull(map, "content", content);
        CompatibilityRequestMaps.putIfNotNull(map, "mode", mode);
        CompatibilityRequestMaps.putIfNotNull(map, "jobId", jobId);
        CompatibilityRequestMaps.putIfNotNull(map, "autoAddColumns", autoAddColumns);
        CompatibilityRequestMaps.putIfNotNull(map, "targetTableStrategy", targetTableStrategy);
        CompatibilityRequestMaps.putIfNotNull(map, "createIndexes", createIndexes);
        CompatibilityRequestMaps.putIfNotNull(map, "mongoCollectionName", mongoCollectionName);
        if (tableOptions != null) {
            Map<String, Object> options = new LinkedHashMap<>();
            tableOptions.forEach((table, value) -> options.put(table, value == null ? Map.of() : value.toCompatibilityMap()));
            map.put("tableOptions", options);
        }
        CompatibilityRequestMaps.putIfNotNull(map, "fixtures", fixtures);
        CompatibilityRequestMaps.putIfNotNull(map, "table", table);
        CompatibilityRequestMaps.putIfNotNull(map, "limit", limit);
        return map;
    }
}
