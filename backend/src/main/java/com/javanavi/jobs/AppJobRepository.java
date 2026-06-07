package com.javanavi.jobs;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.app.AppPersistenceService;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class AppJobRepository {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final int DEFAULT_LIMIT = 100;
    private static final int MAX_LIMIT = 500;
    private static final String INTERRUPTED_MESSAGE = "Application exited before the task finished.";

    private final ObjectMapper objectMapper;
    private final String jdbcUrl;

    public AppJobRepository(AppPersistenceService persistence, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.jdbcUrl = "jdbc:sqlite:" + persistence.databasePath();
    }

    @PostConstruct
    public synchronized void initialize() {
        try (Connection connection = connect(); Statement statement = connection.createStatement()) {
            statement.execute("pragma journal_mode=WAL");
            statement.execute("pragma busy_timeout=5000");
            statement.execute("create table if not exists app_jobs ("
                    + "job_id text primary key, "
                    + "type text not null, "
                    + "title text not null, "
                    + "status text not null, "
                    + "percent integer not null default 0, "
                    + "total_count integer not null default 0, "
                    + "current_count integer not null default 0, "
                    + "current_table text not null default '', "
                    + "stage text not null default '', "
                    + "file_path text not null default '', "
                    + "error_message text not null default '', "
                    + "result_json text not null default '{}', "
                    + "cancel_requested integer not null default 0, "
                    + "created_at text not null, "
                    + "updated_at text not null, "
                    + "finished_at text not null default ''"
                    + ")");
            statement.execute("create index if not exists idx_app_jobs_status_updated on app_jobs(status, updated_at desc)");
            statement.execute("create index if not exists idx_app_jobs_created_at on app_jobs(created_at desc)");
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to initialize JavaNavi job table.", error);
        }
    }

    public synchronized AppJob create(String jobId, String type, String title) {
        initialize();
        String now = now();
        String sql = "insert into app_jobs(job_id,type,title,status,percent,total_count,current_count,current_table,stage,file_path,error_message,result_json,cancel_requested,created_at,updated_at,finished_at) "
                + "values(?,?,?,?,0,0,0,'','','','','{}',0,?,?, '')";
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, requireText(jobId, "jobId"));
            statement.setString(2, requireText(type, "type"));
            statement.setString(3, requireText(title, "title"));
            statement.setString(4, "running");
            statement.setString(5, now);
            statement.setString(6, now);
            statement.executeUpdate();
            return require(jobId);
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to create JavaNavi job.", error);
        }
    }

    public synchronized List<AppJob> list(int limit) {
        initialize();
        int safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit <= 0 ? DEFAULT_LIMIT : limit));
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("select * from app_jobs order by created_at desc limit ?")) {
            statement.setInt(1, safeLimit);
            try (ResultSet result = statement.executeQuery()) {
                List<AppJob> jobs = new ArrayList<>();
                while (result.next()) {
                    jobs.add(row(result));
                }
                return jobs;
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to list JavaNavi jobs.", error);
        }
    }

    public synchronized Optional<AppJob> find(String jobId) {
        initialize();
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement("select * from app_jobs where job_id = ?")) {
            statement.setString(1, text(jobId));
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(row(result)) : Optional.empty();
            }
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to read JavaNavi job.", error);
        }
    }

    public synchronized AppJob progress(String jobId, int current, int total, String currentTable, String stage) {
        int safeTotal = Math.max(total, 0);
        int safeCurrent = Math.max(0, safeTotal == 0 ? current : Math.min(current, safeTotal));
        int percent = safeTotal <= 0 ? 0 : Math.max(0, Math.min(100, (int) Math.round((safeCurrent * 100.0) / safeTotal)));
        update("update app_jobs set status='running', percent=?, total_count=?, current_count=?, current_table=?, stage=?, updated_at=? where job_id=?", statement -> {
            statement.setInt(1, percent);
            statement.setInt(2, safeTotal);
            statement.setInt(3, safeCurrent);
            statement.setString(4, text(currentTable));
            statement.setString(5, text(stage));
            statement.setString(6, now());
            statement.setString(7, text(jobId));
        });
        return require(jobId);
    }

    public synchronized AppJob complete(String jobId, Map<String, Object> result) {
        Map<String, Object> safeResult = result == null ? Map.of() : result;
        String resultJson = toJson(safeResult);
        String filePath = text(first(safeResult, "filePath", "path", "revealTargetPath"));
        update("update app_jobs set status='completed', percent=100, file_path=?, result_json=?, error_message='', updated_at=?, finished_at=? where job_id=?", statement -> {
            String now = now();
            statement.setString(1, filePath);
            statement.setString(2, resultJson);
            statement.setString(3, now);
            statement.setString(4, now);
            statement.setString(5, text(jobId));
        });
        return require(jobId);
    }

    public synchronized AppJob fail(String jobId, String status, String errorMessage) {
        String safeStatus = "cancelled".equals(status) ? "cancelled" : "failed";
        String stage = "cancelled".equals(safeStatus) ? "Task cancelled." : "Task failed.";
        return fail(jobId, safeStatus, errorMessage, stage);
    }

    public synchronized AppJob fail(String jobId, String status, String errorMessage, String stage) {
        String safeStatus = "cancelled".equals(status) ? "cancelled" : "failed";
        String safeStage = text(stage).isBlank() ? ("cancelled".equals(safeStatus) ? "Task cancelled." : "Task failed.") : text(stage);
        update("update app_jobs set status=?, stage=?, error_message=?, updated_at=?, finished_at=? where job_id=?", statement -> {
            String now = now();
            statement.setString(1, safeStatus);
            statement.setString(2, safeStage);
            statement.setString(3, text(errorMessage));
            statement.setString(4, now);
            statement.setString(5, now);
            statement.setString(6, text(jobId));
        });
        return require(jobId);
    }

    public synchronized AppJob requestCancel(String jobId) {
        update("update app_jobs set cancel_requested=1, stage=?, updated_at=? where job_id=?", statement -> {
            statement.setString(1, "Cancel requested");
            statement.setString(2, now());
            statement.setString(3, text(jobId));
        });
        return require(jobId);
    }

    public synchronized boolean isCancelRequested(String jobId) {
        return find(jobId).map(AppJob::cancelRequested).orElse(false);
    }

    public synchronized void markRunningJobsInterrupted() {
        initialize();
        update("update app_jobs set status='failed', stage=?, error_message=?, updated_at=?, finished_at=? where status='running'", statement -> {
            String now = now();
            statement.setString(1, "Task failed.");
            statement.setString(2, INTERRUPTED_MESSAGE);
            statement.setString(3, now);
            statement.setString(4, now);
        });
    }

    private AppJob require(String jobId) {
        return find(jobId).orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));
    }

    private void update(String sql, StatementBinder binder) {
        initialize();
        try (Connection connection = connect(); PreparedStatement statement = connection.prepareStatement(sql)) {
            binder.bind(statement);
            statement.executeUpdate();
        } catch (SQLException error) {
            throw new IllegalStateException("Unable to update JavaNavi job.", error);
        }
    }

    private AppJob row(ResultSet result) throws SQLException {
        return new AppJob(
                result.getString("job_id"),
                result.getString("type"),
                result.getString("title"),
                result.getString("status"),
                result.getInt("percent"),
                result.getInt("total_count"),
                result.getInt("current_count"),
                result.getString("current_table"),
                result.getString("stage"),
                result.getString("file_path"),
                result.getString("error_message"),
                parseMap(result.getString("result_json")),
                result.getInt("cancel_requested") != 0,
                result.getString("created_at"),
                result.getString("updated_at"),
                result.getString("finished_at")
        );
    }

    private Map<String, Object> parseMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, Object> value = objectMapper.readValue(json, MAP_TYPE);
            return value == null ? new LinkedHashMap<>() : value;
        } catch (JsonProcessingException ignored) {
            return new LinkedHashMap<>();
        }
    }

    private String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value == null ? Map.of() : value);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("Unable to serialize JavaNavi job result.", error);
        }
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(jdbcUrl);
    }

    private static Object first(Map<String, Object> map, String... keys) {
        if (map == null || keys == null) {
            return "";
        }
        for (String key : keys) {
            Object value = map.get(key);
            if (value != null && !String.valueOf(value).isBlank()) {
                return value;
            }
        }
        return "";
    }

    private static String now() {
        return Instant.now().toString();
    }

    private static String requireText(String value, String label) {
        String text = text(value);
        if (text.isBlank()) {
            throw new IllegalArgumentException(label + " is required.");
        }
        return text;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    @FunctionalInterface
    private interface StatementBinder {
        void bind(PreparedStatement statement) throws SQLException;
    }
}
