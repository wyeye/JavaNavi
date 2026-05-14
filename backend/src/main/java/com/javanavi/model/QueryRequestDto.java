package com.javanavi.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record QueryRequestDto(
        @Valid @NotNull ConnectionConfigDto connection,
        String database,
        @NotBlank String sql,
        Integer page,
        Integer pageSize,
        String queryId,
        Boolean autoCommit
) {
    public QueryRequestDto(ConnectionConfigDto connection, String sql, Integer page, Integer pageSize) {
        this(connection, null, sql, page, pageSize, null, null);
    }

    public QueryRequestDto(ConnectionConfigDto connection, String database, String sql, Integer page, Integer pageSize, String queryId) {
        this(connection, database, sql, page, pageSize, queryId, null);
    }

    public int normalizedPage() {
        return page == null || page < 1 ? 1 : page;
    }

    public int normalizedPageSize() {
        if (pageSize == null || pageSize < 1) {
            return 100;
        }
        return Math.min(pageSize, 500);
    }

    public boolean normalizedAutoCommit() {
        return autoCommit == null || autoCommit;
    }
}
