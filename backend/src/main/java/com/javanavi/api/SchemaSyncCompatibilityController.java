package com.javanavi.api;

import com.javanavi.model.ApiEnvelope;
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
    public ApiEnvelope<Map<String, Object>> analyze(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(schemaSyncCompatibilityService.analyze(input));
    }

    @PostMapping("/preview")
    public ApiEnvelope<Map<String, Object>> preview(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(schemaSyncCompatibilityService.preview(input));
    }

    @PostMapping("/run")
    public ApiEnvelope<Map<String, Object>> run(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(schemaSyncCompatibilityService.run(input));
    }

    @PostMapping("/cancel")
    public ApiEnvelope<Map<String, Object>> cancel(@RequestBody Map<String, Object> input) {
        String jobId = input == null ? "" : String.valueOf(input.getOrDefault("jobId", ""));
        return ApiEnvelope.ok(schemaSyncCompatibilityService.cancel(jobId));
    }
}
