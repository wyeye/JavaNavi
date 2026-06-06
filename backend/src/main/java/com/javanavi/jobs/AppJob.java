package com.javanavi.jobs;

import java.util.LinkedHashMap;
import java.util.Map;

public record AppJob(
        String jobId,
        String type,
        String title,
        String status,
        int percent,
        int total,
        int current,
        String currentTable,
        String stage,
        String filePath,
        String errorMessage,
        Map<String, Object> result,
        boolean cancelRequested,
        String createdAt,
        String updatedAt,
        String finishedAt
) {
    public Map<String, Object> toPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("jobId", jobId);
        payload.put("type", type);
        payload.put("title", title);
        payload.put("status", status);
        payload.put("percent", percent);
        payload.put("total", total);
        payload.put("current", current);
        payload.put("currentTable", currentTable);
        payload.put("table", currentTable);
        payload.put("stage", stage);
        payload.put("filePath", filePath);
        payload.put("errorMessage", errorMessage);
        payload.put("result", result == null ? Map.of() : result);
        payload.put("cancelRequested", cancelRequested);
        payload.put("createdAt", createdAt);
        payload.put("updatedAt", updatedAt);
        payload.put("finishedAt", finishedAt);
        return payload;
    }
}
