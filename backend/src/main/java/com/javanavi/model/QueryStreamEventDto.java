package com.javanavi.model;

public record QueryStreamEventDto(
        String type,
        Integer statementIndex,
        Integer startLine,
        Integer endLine,
        Integer total,
        String sql,
        String status,
        String message,
        Boolean autoCommit,
        Boolean transactionRolledBack,
        ResultSetDataDto resultSet
) {
    public static QueryStreamEventDto start(int total, boolean autoCommit, String message) {
        return new QueryStreamEventDto("start", null, null, null, total, null, null, message, autoCommit, null, null);
    }

    public static QueryStreamEventDto statementStart(ResultSetDataDto statement, int total, boolean autoCommit, String message) {
        return new QueryStreamEventDto(
                "statementStart",
                statement.statementIndex(),
                statement.startLine(),
                statement.endLine(),
                total,
                statement.sql(),
                null,
                message,
                autoCommit,
                null,
                null
        );
    }

    public static QueryStreamEventDto statementResult(ResultSetDataDto resultSet, int total, boolean autoCommit) {
        return new QueryStreamEventDto(
                "statementResult",
                resultSet.statementIndex(),
                resultSet.startLine(),
                resultSet.endLine(),
                total,
                resultSet.sql(),
                resultSet.status(),
                resultSet.message(),
                autoCommit,
                resultSet.transactionRolledBack(),
                resultSet
        );
    }

    public static QueryStreamEventDto transaction(String type, int total, String message, boolean transactionRolledBack) {
        return new QueryStreamEventDto(type, null, null, null, total, null, null, message, false, transactionRolledBack, null);
    }

    public static QueryStreamEventDto done(int total, boolean autoCommit, String message) {
        return new QueryStreamEventDto("done", null, null, null, total, null, "success", message, autoCommit, null, null);
    }

    public static QueryStreamEventDto error(String message) {
        return new QueryStreamEventDto("error", null, null, null, null, null, "error", message, null, null, null);
    }
}
