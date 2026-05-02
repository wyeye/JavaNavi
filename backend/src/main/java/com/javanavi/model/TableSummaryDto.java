package com.javanavi.model;

public record TableSummaryDto(String schemaName, String tableName, String tableType, String comment) {
    public TableSummaryDto(String schemaName, String tableName, String tableType) {
        this(schemaName, tableName, tableType, "");
    }
}
