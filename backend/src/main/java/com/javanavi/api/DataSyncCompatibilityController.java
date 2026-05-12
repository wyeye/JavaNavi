package com.javanavi.api;

import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.DataSyncRequestDto;
import com.javanavi.model.SyncCancelRequestDto;
import com.javanavi.sync.DataSyncCompatibilityService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/data-sync")
public class DataSyncCompatibilityController {
    private final DataSyncCompatibilityService dataSyncCompatibilityService;

    public DataSyncCompatibilityController(DataSyncCompatibilityService dataSyncCompatibilityService) {
        this.dataSyncCompatibilityService = dataSyncCompatibilityService;
    }

    @PostMapping("/run")
    public ApiEnvelope<DataSyncRequestDto.DataSyncResultDto> run(@RequestBody DataSyncRequestDto request) {
        return ApiEnvelope.ok(DataSyncRequestDto.DataSyncResultDto.from(dataSyncCompatibilityService.run(request == null ? java.util.Map.of() : request.toCompatibilityMap())));
    }

    @PostMapping("/analyze")
    public ApiEnvelope<DataSyncRequestDto.DataSyncAnalyzeDto> analyze(@RequestBody DataSyncRequestDto request) {
        return ApiEnvelope.ok(DataSyncRequestDto.DataSyncAnalyzeDto.from(dataSyncCompatibilityService.analyze(request == null ? java.util.Map.of() : request.toCompatibilityMap())));
    }

    @PostMapping("/preview")
    public ApiEnvelope<DataSyncRequestDto.DataSyncPreviewDto> preview(@RequestBody DataSyncRequestDto request) {
        return ApiEnvelope.ok(DataSyncRequestDto.DataSyncPreviewDto.from(dataSyncCompatibilityService.preview(request == null ? java.util.Map.of() : request.toCompatibilityMap())));
    }

    @PostMapping("/cancel")
    public ApiEnvelope<DataSyncRequestDto.DataSyncCancelDto> cancel(@RequestBody SyncCancelRequestDto request) {
        String jobId = request == null || request.jobId() == null ? "" : request.jobId();
        return ApiEnvelope.ok(DataSyncRequestDto.DataSyncCancelDto.from(dataSyncCompatibilityService.cancel(jobId)));
    }
}
