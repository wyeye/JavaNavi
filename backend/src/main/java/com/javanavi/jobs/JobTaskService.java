package com.javanavi.jobs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.db.DatabaseCompatibilityService;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.files.FileWorkflowCompatibilityService;
import com.javanavi.model.CompatEventDto;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.DatabaseOperationResultDto;
import com.javanavi.security.LocalSessionService;
import com.javanavi.security.SecretRedactor;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
public class JobTaskService {
    private final AppJobRepository jobs;
    private final FileWorkflowCompatibilityService fileWorkflow;
    private final DatabaseCompatibilityService databaseCompatibility;
    private final CompatEventPublisher events;
    private final LocalSessionService localSessionService;
    private final ObjectMapper objectMapper;
    private final ExecutorService executor = Executors.newFixedThreadPool(4, runnable -> {
        Thread thread = new Thread(runnable, "javanavi-job-worker");
        thread.setDaemon(true);
        return thread;
    });

    public JobTaskService(
            AppJobRepository jobs,
            FileWorkflowCompatibilityService fileWorkflow,
            DatabaseCompatibilityService databaseCompatibility,
            CompatEventPublisher events,
            LocalSessionService localSessionService,
            ObjectMapper objectMapper
    ) {
        this.jobs = jobs;
        this.fileWorkflow = fileWorkflow;
        this.databaseCompatibility = databaseCompatibility;
        this.events = events;
        this.localSessionService = localSessionService;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void markInterruptedJobs() {
        jobs.markRunningJobsInterrupted();
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    public List<AppJob> list(int limit) {
        return jobs.list(limit);
    }

    public AppJob get(String jobId) {
        return jobs.find(jobId).orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));
    }

    public AppJob cancel(String jobId) {
        AppJob job = jobs.requestCancel(jobId);
        databaseCompatibility.cancelQuery(jobId);
        publish(currentSessionId(), jobs.progress(jobId, job.current(), Math.max(job.total(), 1), job.currentTable(), "Cancel requested"));
        return job;
    }

    public AppJob createExportData(Map<String, Object> payload) {
        Map<String, Object> body = payload(payload);
        return start("export-data", title(body, "Export data"), (jobId, sink) -> {
            body.put("jobId", jobId);
            return fileWorkflow.exportDataWithProgress(body, sink);
        });
    }

    public AppJob createExportQuery(Map<String, Object> payload) {
        Map<String, Object> body = payload(payload);
        return start("export-query", title(body, "Export query"), (jobId, sink) -> {
            body.put("jobId", jobId);
            return fileWorkflow.exportQueryWithProgress(body, sink);
        });
    }

    public AppJob createExportTable(Map<String, Object> payload) {
        Map<String, Object> body = payload(payload);
        return start("export-table", title(body, "Export table"), (jobId, sink) -> {
            body.put("jobId", jobId);
            return fileWorkflow.exportTableWithProgress(body, sink);
        });
    }

    public AppJob createExportTables(Map<String, Object> payload, boolean includeSchema, boolean includeData) {
        Map<String, Object> body = payload(payload);
        String type = includeSchema && includeData ? "export-tables-backup" : includeSchema ? "export-tables-schema" : "export-tables-data";
        return start(type, title(body, "Export tables"), (jobId, sink) -> {
            body.put("jobId", jobId);
            return fileWorkflow.exportTablesSqlWithProgress(body, includeSchema, includeData, sink);
        });
    }

    public AppJob createExportDatabase(Map<String, Object> payload) {
        Map<String, Object> body = payload(payload);
        boolean includeData = Boolean.TRUE.equals(body.get("includeData"));
        return start(includeData ? "export-database-backup" : "export-database-schema", title(body, "Export database"), (jobId, sink) -> {
            body.put("jobId", jobId);
            return fileWorkflow.exportDatabaseSqlWithProgress(body, sink);
        });
    }

    public AppJob createCopyTables(Map<String, Object> payload) {
        Map<String, Object> body = payload(payload);
        return start("copy-tables", title(body, "Backup tables"), (jobId, sink) -> {
            body.put("jobId", jobId);
            DatabaseOperationResultDto result = databaseCompatibility.copyTablesWithProgress(
                    connection(body),
                    text(body.get("database")),
                    stringList(body.get("tables")),
                    text(body.get("targetPrefix")),
                    text(body.get("targetSuffix")),
                    Boolean.TRUE.equals(body.get("includeData")),
                    sink
            );
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("operation", result.operation());
            map.put("count", result.count());
            map.put("affectedRows", result.affectedRows());
            map.put("tables", result.tables());
            map.put("executedSQLs", result.executedSQLs());
            return map;
        });
    }

    private AppJob start(String type, String title, JobWork work) {
        String jobId = "job-" + Instant.now().toEpochMilli() + "-" + UUID.randomUUID().toString().substring(0, 8);
        String sessionId = currentSessionId();
        AppJob created = jobs.create(jobId, type, title);
        publish(sessionId, created);
        executor.submit(() -> run(jobId, sessionId, work));
        return created;
    }

    private void run(String jobId, String sessionId, JobWork work) {
        JobProgressSink sink = sink(jobId, sessionId);
        try {
            sink.progress(0, 1, "", "Preparing");
            Map<String, Object> result = work.run(jobId, sink);
            publish(sessionId, jobs.complete(jobId, result));
        } catch (JobCancellationException error) {
            publish(sessionId, jobs.fail(jobId, "cancelled", "Task cancelled."));
        } catch (RuntimeException error) {
            publish(sessionId, jobs.fail(jobId, "failed", SecretRedactor.redact(error.getMessage())));
        }
    }

    private JobProgressSink sink(String jobId, String sessionId) {
        return new JobProgressSink() {
            @Override
            public void progress(int current, int total, String currentTable, String stage) {
                publish(sessionId, jobs.progress(jobId, current, total, currentTable, stage));
            }

            @Override
            public void throwIfCancelled() {
                if (jobs.isCancelRequested(jobId)) {
                    databaseCompatibility.cancelQuery(jobId);
                    throw new JobCancellationException(jobId);
                }
            }
        };
    }

    private void publish(String sessionId, AppJob job) {
        events.publishToSession(sessionId, new CompatEventDto(
                UUID.randomUUID().toString(),
                "job:progress",
                "job",
                "javanavi-backend",
                job.jobId(),
                job.status(),
                job.stage(),
                Instant.now(),
                job.toPayload()
        ));
    }

    private String currentSessionId() {
        return localSessionService.currentSessionId().orElse(LocalSessionService.SECURITY_DISABLED_SESSION_ID);
    }

    private ConnectionConfigDto connection(Map<String, Object> payload) {
        Object raw = payload == null ? null : payload.get("connection");
        if (raw instanceof Map<?, ?> map) {
            return objectMapper.convertValue(map, ConnectionConfigDto.class);
        }
        return new ConnectionConfigDto("demo-h2", "Demo", "h2", null, null, "", null, null, Map.of(), null);
    }

    private static Map<String, Object> payload(Map<String, Object> payload) {
        return payload == null ? new LinkedHashMap<>() : new LinkedHashMap<>(payload);
    }

    private static List<String> stringList(Object raw) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(JobTaskService::text).filter(value -> !value.isBlank()).distinct().toList();
    }

    private static String title(Map<String, Object> payload, String fallback) {
        String title = text(payload == null ? null : payload.get("title"));
        return title.isBlank() ? fallback : title;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    @FunctionalInterface
    private interface JobWork {
        Map<String, Object> run(String jobId, JobProgressSink sink);
    }
}
