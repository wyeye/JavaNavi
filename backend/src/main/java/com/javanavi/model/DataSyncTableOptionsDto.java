package com.javanavi.model;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record DataSyncTableOptionsDto(
        Boolean insert,
        Boolean update,
        Boolean delete,
        List<String> selectedInsertPks,
        List<String> selectedUpdatePks,
        List<String> selectedDeletePks
) {
    public Map<String, Object> toCompatibilityMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        CompatibilityRequestMaps.putIfNotNull(map, "insert", insert);
        CompatibilityRequestMaps.putIfNotNull(map, "update", update);
        CompatibilityRequestMaps.putIfNotNull(map, "delete", delete);
        CompatibilityRequestMaps.putIfNotNull(map, "selectedInsertPks", selectedInsertPks);
        CompatibilityRequestMaps.putIfNotNull(map, "selectedUpdatePks", selectedUpdatePks);
        CompatibilityRequestMaps.putIfNotNull(map, "selectedDeletePks", selectedDeletePks);
        return map;
    }
}
