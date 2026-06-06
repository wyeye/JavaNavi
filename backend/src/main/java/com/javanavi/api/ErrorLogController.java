package com.javanavi.api;

import com.javanavi.app.ErrorLogService;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.ErrorLogDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/error-logs")
public class ErrorLogController {
    private final ErrorLogService errorLogService;

    public ErrorLogController(ErrorLogService errorLogService) {
        this.errorLogService = errorLogService;
    }

    @GetMapping
    public ApiEnvelope<List<ErrorLogDto>> list(
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "limit", required = false, defaultValue = "200") int limit
    ) {
        return ApiEnvelope.ok(errorLogService.list(query, limit));
    }

    @GetMapping("/{id}")
    public ApiEnvelope<ErrorLogDto> get(@PathVariable String id) {
        return ApiEnvelope.ok(errorLogService.find(id).orElse(null));
    }

    @PostMapping("/{id}/resolved")
    public ApiEnvelope<ErrorLogDto> setResolved(@PathVariable String id, @RequestBody(required = false) Map<String, Object> input) {
        boolean resolved = input != null && Boolean.TRUE.equals(input.get("resolved"));
        errorLogService.setResolved(id, resolved);
        return ApiEnvelope.ok(errorLogService.find(id).orElse(null));
    }
}
