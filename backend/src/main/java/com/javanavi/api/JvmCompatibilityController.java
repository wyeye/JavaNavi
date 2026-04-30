package com.javanavi.api;

import com.javanavi.jvm.JvmCompatibilityService;
import com.javanavi.model.ApiEnvelope;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/jvm")
public class JvmCompatibilityController {
    private final JvmCompatibilityService service;

    public JvmCompatibilityController(JvmCompatibilityService service) {
        this.service = service;
    }

    @PostMapping("/test") public ApiEnvelope<Map<String, Object>> test(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.testConnection(input)); }
    @PostMapping("/capabilities") public ApiEnvelope<List<Map<String, Object>>> capabilities(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.probeCapabilities(input)); }
    @PostMapping("/resources") public ApiEnvelope<List<Map<String, Object>>> resources(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.listResources(input)); }
    @PostMapping("/value") public ApiEnvelope<Map<String, Object>> value(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.getValue(input)); }
    @PostMapping("/changes/preview") public ApiEnvelope<Map<String, Object>> preview(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.previewChange(input)); }
    @PostMapping("/changes/apply") public ApiEnvelope<Map<String, Object>> apply(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.applyChange(input)); }
    @PostMapping("/audit") public ApiEnvelope<List<Map<String, Object>>> audit(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.listAuditRecords(stringValue(input, "connectionId"), intValue(input, "limit", 50))); }
    @PostMapping("/monitoring/start") public ApiEnvelope<Map<String, Object>> startMonitoring(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.startMonitoring(input)); }
    @PostMapping("/monitoring/stop") public ApiEnvelope<Map<String, Object>> stopMonitoring(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.stopMonitoring(input)); }
    @PostMapping("/monitoring/history") public ApiEnvelope<Map<String, Object>> monitoringHistory(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.monitoringHistory(input)); }
    @PostMapping("/diagnostics/capabilities") public ApiEnvelope<List<Map<String, Object>>> diagnosticCapabilities(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.probeDiagnosticCapabilities(input)); }
    @PostMapping("/diagnostics/session/start") public ApiEnvelope<Map<String, Object>> startDiagnosticSession(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.startDiagnosticSession(input)); }
    @PostMapping("/diagnostics/command/execute") public ApiEnvelope<Map<String, Object>> executeDiagnosticCommand(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.executeDiagnosticCommand(input)); }
    @PostMapping("/diagnostics/command/cancel") public ApiEnvelope<Map<String, Object>> cancelDiagnosticCommand(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.cancelDiagnosticCommand(input)); }
    @PostMapping("/diagnostics/audit") public ApiEnvelope<List<Map<String, Object>>> diagnosticAudit(@RequestBody(required = false) Map<String, Object> input) { return ApiEnvelope.ok(service.listDiagnosticAuditRecords(stringValue(input, "connectionId"), intValue(input, "limit", 50))); }

    private static String stringValue(Map<String, Object> input, String key) { return input == null || input.get(key) == null ? "" : String.valueOf(input.get(key)); }
    private static int intValue(Map<String, Object> input, String key, int fallback) { try { return input == null ? fallback : Integer.parseInt(String.valueOf(input.get(key))); } catch (RuntimeException ignored) { return fallback; } }
}
