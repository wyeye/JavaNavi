package com.javanavi.model;

import java.util.List;
import java.util.Map;

public record QueryResultDto(
        List<String> columns,
        List<Map<String, Object>> rows,
        int rowCount,
        int page,
        int pageSize,
        long elapsedMs,
        boolean readOnly,
        String queryId
) {
    public QueryResultDto(
            List<String> columns,
            List<Map<String, Object>> rows,
            int rowCount,
            int page,
            int pageSize,
            long elapsedMs,
            boolean readOnly
    ) {
        this(columns, rows, rowCount, page, pageSize, elapsedMs, readOnly, null);
    }
}
