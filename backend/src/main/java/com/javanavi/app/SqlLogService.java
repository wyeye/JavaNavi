package com.javanavi.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.javanavi.config.SecurityProperties;
import com.javanavi.model.SqlLogDto;
import com.javanavi.model.SqlLogsRequestDto;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class SqlLogService {
    private static final TypeReference<List<StoredSqlLog>> STORED_SQL_LOGS = new TypeReference<>() {};
    private static final int MAX_SQL_LOGS = 1000;
    private static final int MAX_SQL_TEXT_LENGTH = 200_000;

    private final AppPersistenceService appPersistence;
    private final Path sqlLogsFile;

    public SqlLogService(SecurityProperties properties, AppPersistenceService appPersistence) {
        this.appPersistence = appPersistence;
        Path directory = Path.of(properties.getDataDirectory()).toAbsolutePath().normalize();
        this.sqlLogsFile = directory.resolve("sql-logs.json");
    }

    public synchronized List<SqlLogDto> list() {
        return readAll().stream().map(this::toDto).toList();
    }

    public synchronized List<SqlLogDto> save(SqlLogsRequestDto input) {
        List<StoredSqlLog> logs = sanitizeLogs(input == null ? null : input.logs());
        writeAll(logs);
        return logs.stream().map(this::toDto).toList();
    }

    public synchronized List<SqlLogDto> saveOne(SqlLogDto input) {
        StoredSqlLog log = sanitizeLog(input, 0);
        List<StoredSqlLog> logs = new ArrayList<>(readAll());
        logs.removeIf(existing -> existing.id().equals(log.id()));
        logs.add(0, log);
        logs = logs.stream().limit(MAX_SQL_LOGS).toList();
        writeAll(logs);
        return logs.stream().map(this::toDto).toList();
    }

    public synchronized List<SqlLogDto> clear() {
        writeAll(List.of());
        return List.of();
    }

    private List<StoredSqlLog> readAll() {
        List<StoredSqlLog> logs = appPersistence.readJson("sql-logs", sqlLogsFile, STORED_SQL_LOGS, new ArrayList<>());
        return logs == null ? new ArrayList<>() : new ArrayList<>(logs).stream().limit(MAX_SQL_LOGS).toList();
    }

    private void writeAll(List<StoredSqlLog> logs) {
        appPersistence.writeJson("sql-logs", logs.stream().limit(MAX_SQL_LOGS).toList());
    }

    private SqlLogDto toDto(StoredSqlLog log) {
        return new SqlLogDto(
                log.id(),
                log.timestamp(),
                log.sql(),
                log.status(),
                log.duration(),
                log.message(),
                log.dbName(),
                log.affectedRows()
        );
    }

    private static List<StoredSqlLog> sanitizeLogs(List<SqlLogDto> logs) {
        if (logs == null || logs.isEmpty()) {
            return List.of();
        }
        List<StoredSqlLog> result = new ArrayList<>();
        List<String> seenIds = new ArrayList<>();
        for (int index = 0; index < logs.size(); index++) {
            StoredSqlLog log = sanitizeLog(logs.get(index), index);
            if (seenIds.contains(log.id())) {
                continue;
            }
            seenIds.add(log.id());
            result.add(log);
            if (result.size() >= MAX_SQL_LOGS) {
                break;
            }
        }
        return result;
    }

    private static StoredSqlLog sanitizeLog(SqlLogDto log, int index) {
        if (log == null) {
            throw new IllegalArgumentException("SQL log payload is required.");
        }
        String sql = firstText(log.sql());
        if (sql == null) {
            throw new IllegalArgumentException("SQL log SQL is required.");
        }
        if (sql.length() > MAX_SQL_TEXT_LENGTH) {
            sql = sql.substring(0, MAX_SQL_TEXT_LENGTH);
        }
        String id = sanitizeId(firstText(log.id(), "sql-log-" + UUID.randomUUID().toString().substring(0, 8) + "-" + (index + 1)));
        long timestamp = log.timestamp() == null || log.timestamp() <= 0 ? System.currentTimeMillis() : log.timestamp();
        String status = "error".equalsIgnoreCase(firstText(log.status())) ? "error" : "success";
        long duration = log.duration() == null || log.duration() < 0 ? 0 : log.duration();
        String message = firstText(log.message());
        String dbName = firstText(log.dbName());
        Long affectedRows = log.affectedRows();
        return new StoredSqlLog(id, timestamp, sql, status, duration, message, dbName, affectedRows);
    }

    private static String sanitizeId(String value) {
        String sanitized = value == null ? "" : value.trim().replaceAll("[^A-Za-z0-9_.:@-]", "-");
        if (sanitized.isBlank()) {
            throw new IllegalArgumentException("SQL log id is required.");
        }
        return sanitized.length() > 96 ? sanitized.substring(0, 96) : sanitized;
    }

    private static String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    public record StoredSqlLog(
            String id,
            long timestamp,
            String sql,
            String status,
            long duration,
            String message,
            String dbName,
            Long affectedRows
    ) {
    }
}
