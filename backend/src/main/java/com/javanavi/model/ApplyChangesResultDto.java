package com.javanavi.model;

public record ApplyChangesResultDto(
        int insertedRows,
        int updatedRows,
        int deletedRows,
        int affectedRows
) {
}
