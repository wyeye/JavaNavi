package com.javanavi.model;

import java.util.List;

public record DatabaseOperationResultDto(
        String operation,
        int count,
        int affectedRows,
        List<String> tables,
        List<String> executedSQLs
) {
}
