package com.javanavi.api;

import com.javanavi.jobs.AppJob;
import com.javanavi.jobs.JobTaskService;
import com.javanavi.model.ApiEnvelope;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/jobs")
public class JobController {
    private final JobTaskService jobs;

    public JobController(JobTaskService jobs) {
        this.jobs = jobs;
    }

    @GetMapping
    public ApiEnvelope<List<Map<String, Object>>> list(@RequestParam(value = "limit", required = false, defaultValue = "100") int limit) {
        return ApiEnvelope.ok(jobs.list(limit).stream().map(AppJob::toPayload).toList());
    }

    @GetMapping("/{jobId}")
    public ApiEnvelope<Map<String, Object>> get(@PathVariable String jobId) {
        return ApiEnvelope.ok(jobs.get(jobId).toPayload());
    }

    @PostMapping("/{jobId}/cancel")
    public ApiEnvelope<Map<String, Object>> cancel(@PathVariable String jobId) {
        return ApiEnvelope.ok(jobs.cancel(jobId).toPayload());
    }

    @PostMapping("/export-data")
    public ApiEnvelope<Map<String, Object>> exportData(@RequestBody(required = false) Map<String, Object> payload) {
        return ApiEnvelope.ok(jobs.createExportData(payloadOrEmpty(payload)).toPayload());
    }

    @PostMapping("/export-query")
    public ApiEnvelope<Map<String, Object>> exportQuery(@RequestBody(required = false) Map<String, Object> payload) {
        return ApiEnvelope.ok(jobs.createExportQuery(payloadOrEmpty(payload)).toPayload());
    }

    @PostMapping("/export-table")
    public ApiEnvelope<Map<String, Object>> exportTable(@RequestBody(required = false) Map<String, Object> payload) {
        return ApiEnvelope.ok(jobs.createExportTable(payloadOrEmpty(payload)).toPayload());
    }

    @PostMapping("/export-tables")
    public ApiEnvelope<Map<String, Object>> exportTables(@RequestBody(required = false) Map<String, Object> payload) {
        Map<String, Object> body = payloadOrEmpty(payload);
        boolean includeData = Boolean.TRUE.equals(body.get("includeData"));
        boolean includeSchema = !Boolean.FALSE.equals(body.get("includeSchema"));
        return ApiEnvelope.ok(jobs.createExportTables(body, includeSchema, includeData).toPayload());
    }

    @PostMapping("/export-database")
    public ApiEnvelope<Map<String, Object>> exportDatabase(@RequestBody(required = false) Map<String, Object> payload) {
        return ApiEnvelope.ok(jobs.createExportDatabase(payloadOrEmpty(payload)).toPayload());
    }

    @PostMapping("/copy-tables")
    public ApiEnvelope<Map<String, Object>> copyTables(@RequestBody(required = false) Map<String, Object> payload) {
        return ApiEnvelope.ok(jobs.createCopyTables(payloadOrEmpty(payload)).toPayload());
    }

    private static Map<String, Object> payloadOrEmpty(Map<String, Object> payload) {
        return payload == null ? new LinkedHashMap<>() : new LinkedHashMap<>(payload);
    }
}
