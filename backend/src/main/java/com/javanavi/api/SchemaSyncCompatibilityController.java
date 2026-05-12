package com.javanavi.api;

import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.SchemaSyncRequestDto;
import com.javanavi.model.SyncCancelRequestDto;
import com.javanavi.sync.SchemaSyncCompatibilityService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/schema-sync")
public class SchemaSyncCompatibilityController {
    private final SchemaSyncCompatibilityService schemaSyncCompatibilityService;

    public SchemaSyncCompatibilityController(SchemaSyncCompatibilityService schemaSyncCompatibilityService) {
        this.schemaSyncCompatibilityService = schemaSyncCompatibilityService;
    }

    @PostMapping("/analyze")
    public ApiEnvelope<SchemaSyncRequestDto.SchemaSyncAnalyzeDto> analyze(@RequestBody SchemaSyncRequestDto request) {
        return ApiEnvelope.ok(SchemaSyncRequestDto.SchemaSyncAnalyzeDto.from(
                schemaSyncCompatibilityService.analyze(request == null ? java.util.Map.of() : request.toCompatibilityMap())
        ));
    }

    @PostMapping("/preview")
    public ApiEnvelope<SchemaSyncRequestDto.SchemaSyncPreviewDto> preview(@RequestBody SchemaSyncRequestDto request) {
        return ApiEnvelope.ok(SchemaSyncRequestDto.SchemaSyncPreviewDto.from(
                schemaSyncCompatibilityService.preview(request == null ? java.util.Map.of() : request.toCompatibilityMap())
        ));
    }

    @PostMapping("/run")
    public ApiEnvelope<SchemaSyncRequestDto.SchemaSyncResultDto> run(@RequestBody SchemaSyncRequestDto request) {
        return ApiEnvelope.ok(SchemaSyncRequestDto.SchemaSyncResultDto.from(
                schemaSyncCompatibilityService.run(request == null ? java.util.Map.of() : request.toCompatibilityMap())
        ));
    }

    @PostMapping("/cancel")
    public ApiEnvelope<SchemaSyncRequestDto.SchemaSyncCancelDto> cancel(@RequestBody SyncCancelRequestDto request) {
        String jobId = request == null || request.jobId() == null ? "" : request.jobId();
        return ApiEnvelope.ok(SchemaSyncRequestDto.SchemaSyncCancelDto.from(schemaSyncCompatibilityService.cancel(jobId)));
    }
}
