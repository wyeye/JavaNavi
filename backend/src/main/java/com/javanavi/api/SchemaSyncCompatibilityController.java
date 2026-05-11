package com.javanavi.api;

import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.SchemaSyncRequestDto;
import com.javanavi.model.SyncCancelRequestDto;
import com.javanavi.sync.SchemaSyncCompatibilityService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/schema-sync")
public class SchemaSyncCompatibilityController {
    private final SchemaSyncCompatibilityService schemaSyncCompatibilityService;

    public SchemaSyncCompatibilityController(SchemaSyncCompatibilityService schemaSyncCompatibilityService) {
        this.schemaSyncCompatibilityService = schemaSyncCompatibilityService;
    }

    @PostMapping("/analyze")
    public ApiEnvelope<Map<String, Object>> analyze(@RequestBody SchemaSyncRequestDto request) {
        return ApiEnvelope.ok(schemaSyncCompatibilityService.analyze(request == null ? Map.of() : request.toCompatibilityMap()));
    }

    @PostMapping("/preview")
    public ApiEnvelope<Map<String, Object>> preview(@RequestBody SchemaSyncRequestDto request) {
        return ApiEnvelope.ok(schemaSyncCompatibilityService.preview(request == null ? Map.of() : request.toCompatibilityMap()));
    }

    @PostMapping("/run")
    public ApiEnvelope<Map<String, Object>> run(@RequestBody SchemaSyncRequestDto request) {
        return ApiEnvelope.ok(schemaSyncCompatibilityService.run(request == null ? Map.of() : request.toCompatibilityMap()));
    }

    @PostMapping("/cancel")
    public ApiEnvelope<Map<String, Object>> cancel(@RequestBody SyncCancelRequestDto request) {
        String jobId = request == null || request.jobId() == null ? "" : request.jobId();
        return ApiEnvelope.ok(schemaSyncCompatibilityService.cancel(jobId));
    }
}
