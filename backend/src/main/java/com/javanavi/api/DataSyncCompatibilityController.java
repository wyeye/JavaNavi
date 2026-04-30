package com.javanavi.api;

import com.javanavi.model.ApiEnvelope;
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
    public ApiEnvelope<Map<String, Object>> run(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(dataSyncCompatibilityService.run(input));
    }

    @PostMapping("/analyze")
    public ApiEnvelope<Map<String, Object>> analyze(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(dataSyncCompatibilityService.analyze(input));
    }

    @PostMapping("/preview")
    public ApiEnvelope<Map<String, Object>> preview(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(dataSyncCompatibilityService.preview(input));
    }
}
