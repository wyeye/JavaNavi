package com.javanavi.model;

import java.util.List;
import java.util.Map;

public record ResultSetDataDto(
        List<Map<String, Object>> rows,
        List<String> columns,
        Integer statementIndex,
        Integer startLine,
        Integer endLine,
        String sql,
        String status,
        String message,
        Boolean transactionRolledBack
) {
    public ResultSetDataDto(List<Map<String, Object>> rows, List<String> columns) {
        this(rows, columns, null, null, null, null, null, null, null);
    }
}
