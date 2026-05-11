package com.javanavi.api;

import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.DataSyncRequestDto;
import com.javanavi.model.SyncCancelRequestDto;
import com.javanavi.sync.DataSyncCompatibilityService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/data-sync")
public class DataSyncCompatibilityController {
    private final DataSyncCompatibilityService dataSyncCompatibilityService;

    public DataSyncCompatibilityController(DataSyncCompatibilityService dataSyncCompatibilityService) {
        this.dataSyncCompatibilityService = dataSyncCompatibilityService;
    }

    @PostMapping("/run")
    public ApiEnvelope<Map<String, Object>> run(@RequestBody DataSyncRequestDto request) {
        return ApiEnvelope.ok(dataSyncCompatibilityService.run(request == null ? Map.of() : request.toCompatibilityMap()));
    }

    @PostMapping("/analyze")
    public ApiEnvelope<Map<String, Object>> analyze(@RequestBody DataSyncRequestDto request) {
        return ApiEnvelope.ok(dataSyncCompatibilityService.analyze(request == null ? Map.of() : request.toCompatibilityMap()));
    }

    @PostMapping("/preview")
    public ApiEnvelope<Map<String, Object>> preview(@RequestBody DataSyncRequestDto request) {
        return ApiEnvelope.ok(dataSyncCompatibilityService.preview(request == null ? Map.of() : request.toCompatibilityMap()));
    }

    @PostMapping("/cancel")
    public ApiEnvelope<Map<String, Object>> cancel(@RequestBody SyncCancelRequestDto request) {
        String jobId = request == null || request.jobId() == null ? "" : request.jobId();
        return ApiEnvelope.ok(dataSyncCompatibilityService.cancel(jobId));
    }
}
