package com.javanavi.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.model.ErrorLogDto;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class AppPersistenceService {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final int DEFAULT_ERROR_LOG_LIMIT = 200;
    private static final int MAX_ERROR_LOG_LIMIT = 1000;

    private final ObjectMapper objectMapper;
    private final Path databasePath;
    private final String jdbcUrl;

    public AppPersistenceService(SecurityProperties properties, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        Path directory = Path.of(properties.getDataDirectory()).toAbsolutePath().normalize();
        this.databasePath = directory.resolve("javanavi-app.db");
        this.jdbcUrl = "jdbc:sqlite:" + databasePath;
        initialize();
    }

    public Path databasePath() {
        return databasePath;
    }

    public synchronized Map<String, Object> readMap(String key, Path legacyFile) {
        return readJson(key, legacyFile, MAP_TYPE, new LinkedHashMap<>());
    }

    public synchronized <T> T readJson(String key, Path legacyFile, TypeReference<T> type, T fallback) {
        migrateLegacyFile(key, legacyFile);
        String json = readValue(key).orElse(null);
        if (json == null || json.isBlank()) {
            return fallback;
        }
        try {
            T value = objectMapper.readValue(json, type);
            return value == null ? fallback : value;
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Unable to parse JavaNavi persisted app state.", error);
        }
    }

    public synchronized void writeJson(String key, Object value) {
        writeValue(key, toJson(value));
    }

    public synchronized void insertErrorLog(ErrorLogDto log) {
        initialize();
        String sql = "insert or replace into app_error_logs "
                + "(id, created_at, level, request_method, request_path, error_type, message, stack_trace, resolved) "
                + "values (?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, log.id());
            statement.setString(2, log.createdAt());
            statement.setString(3, log.level());
            statement.setString(4, log.requestMethod());
            statement.setString(5, log.requestPath());
            statement.setString(6, log.errorType());
            statement.setString(7, log.message());
            statement.setString(8, log.stackTrace());
            statement.setInt(9, log.resolved() ? 1 : 0);
            statement.executeUpdate();
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to persist JavaNavi error log.", error);
        }
    }

    public synchronized List<ErrorLogDto> listErrorLogs(String query, int requestedLimit) {
        initialize();
        int limit = normalizeLimit(requestedLimit);
        String normalizedQuery = query == null ? "" : query.trim();
        boolean filtered = !normalizedQuery.isBlank();
        String sql = filtered
                ? "select id, created_at, level, request_method, request_path, error_type, message, stack_trace, resolved "
                + "from app_error_logs where id like ? or request_path like ? or error_type like ? or message like ? "
                + "order by created_at desc limit ?"
                : "select id, created_at, level, request_method, request_path, error_type, message, stack_trace, resolved "
                + "from app_error_logs order by created_at desc limit ?";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            if (filtered) {
                String like = "%" + normalizedQuery + "%";
                statement.setString(1, like);
                statement.setString(2, like);
                statement.setString(3, like);
                statement.setString(4, like);
                statement.setInt(5, limit);
            } else {
                statement.setInt(1, limit);
            }
            try (ResultSet result = statement.executeQuery()) {
                List<ErrorLogDto> logs = new ArrayList<>();
                while (result.next()) {
                    logs.add(errorLog(result));
                }
                return logs;
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to read JavaNavi error logs.", error);
        }
    }

    public synchronized Optional<ErrorLogDto> findErrorLog(String id) {
        initialize();
        String normalizedId = id == null ? "" : id.trim();
        if (normalizedId.isBlank()) {
            return Optional.empty();
        }
        String sql = "select id, created_at, level, request_method, request_path, error_type, message, stack_trace, resolved "
                + "from app_error_logs where id = ?";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, normalizedId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return Optional.empty();
                }
                return Optional.of(errorLog(result));
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to read JavaNavi error log.", error);
        }
    }

    public synchronized boolean setErrorLogResolved(String id, boolean resolved) {
        initialize();
        String normalizedId = id == null ? "" : id.trim();
        if (normalizedId.isBlank()) {
            return false;
        }
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("update app_error_logs set resolved = ? where id = ?")) {
            statement.setInt(1, resolved ? 1 : 0);
            statement.setString(2, normalizedId);
            return statement.executeUpdate() > 0;
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to update JavaNavi error log.", error);
        }
    }

    private void initialize() {
        try {
            Files.createDirectories(databasePath.getParent());
            try (Connection connection = connect(); Statement statement = connection.createStatement()) {
                statement.execute("pragma journal_mode=WAL");
                statement.execute("pragma busy_timeout=5000");
                statement.execute("create table if not exists app_kv ("
                        + "key text primary key, "
                        + "value text not null, "
                        + "updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
                        + ")");
                statement.execute("create table if not exists app_error_logs ("
                        + "id text primary key, "
                        + "created_at text not null, "
                        + "level text not null, "
                        + "request_method text not null, "
                        + "request_path text not null, "
                        + "error_type text not null, "
                        + "message text not null, "
                        + "stack_trace text not null, "
                        + "resolved integer not null default 0"
                        + ")");
                statement.execute("create index if not exists idx_app_error_logs_created_at on app_error_logs(created_at desc)");
            }
        } catch (IOException | SQLException error) {
            throw new IllegalStateException("Unable to initialize JavaNavi SQLite app database.", error);
        }
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(jdbcUrl);
    }

    private Optional<String> readValue(String key) {
        initialize();
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("select value from app_kv where key = ?")) {
            statement.setString(1, requireKey(key));
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return Optional.empty();
                }
                return Optional.ofNullable(result.getString(1));
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to read JavaNavi persisted app state.", error);
        }
    }

    private void writeValue(String key, String json) {
        initialize();
        String sql = "insert into app_kv(key, value, updated_at) values (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) "
                + "on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, requireKey(key));
            statement.setString(2, json == null ? "null" : json);
            statement.executeUpdate();
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to write JavaNavi persisted app state.", error);
        }
    }

    private void migrateLegacyFile(String key, Path legacyFile) {
        if (legacyFile == null || readValue(key).isPresent() || !Files.isRegularFile(legacyFile)) {
            return;
        }
        try {
            String text = Files.readString(legacyFile, StandardCharsets.UTF_8);
            if (!text.isBlank()) {
                writeValue(key, text);
            }
        } catch (IOException error) {
            throw new IllegalStateException("Unable to migrate JavaNavi legacy app state.", error);
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Unable to serialize JavaNavi persisted app state.", error);
        }
    }

    private static int normalizeLimit(int requestedLimit) {
        if (requestedLimit <= 0) {
            return DEFAULT_ERROR_LOG_LIMIT;
        }
        return Math.min(MAX_ERROR_LOG_LIMIT, requestedLimit);
    }

    private static String requireKey(String key) {
        String normalized = key == null ? "" : key.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("JavaNavi app state key is required.");
        }
        return normalized;
    }

    private static ErrorLogDto errorLog(ResultSet result) throws SQLException {
        return new ErrorLogDto(
                result.getString("id"),
                result.getString("created_at"),
                result.getString("level"),
                result.getString("request_method"),
                result.getString("request_path"),
                result.getString("error_type"),
                result.getString("message"),
                result.getString("stack_trace"),
                result.getInt("resolved") != 0
        );
    }
}
