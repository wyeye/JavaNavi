package com.javanavi.api;

import com.javanavi.ai.AiCompatibilityService;
import com.javanavi.model.AiContracts;
import com.javanavi.model.ApiEnvelope;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/ai")
public class AiCompatibilityController {
    private final AiCompatibilityService aiCompatibilityService;

    public AiCompatibilityController(AiCompatibilityService aiCompatibilityService) {
        this.aiCompatibilityService = aiCompatibilityService;
    }

    @GetMapping("/providers")
    public ApiEnvelope<List<Map<String, Object>>> providers() {
        return ApiEnvelope.ok(aiCompatibilityService.getProviders());
    }

    @PostMapping("/providers/save")
    public ApiEnvelope<Map<String, Object>> saveProvider(@RequestBody AiContracts.ProviderConfigRequest input) {
        return ApiEnvelope.ok(aiCompatibilityService.saveProvider(input == null ? Map.of() : input.toMap()));
    }

    @PostMapping("/providers/delete")
    public ApiEnvelope<Map<String, Object>> deleteProvider(@RequestBody AiContracts.IdRequest input) {
        aiCompatibilityService.deleteProvider(idValue(input));
        return ApiEnvelope.ok(Map.of("deleted", true));
    }

    @GetMapping("/providers/active")
    public ApiEnvelope<String> activeProvider() {
        return ApiEnvelope.ok(aiCompatibilityService.getActiveProvider());
    }

    @PostMapping("/providers/active")
    public ApiEnvelope<Map<String, Object>> setActiveProvider(@RequestBody AiContracts.IdRequest input) {
        String id = idValue(input);
        aiCompatibilityService.setActiveProvider(id);
        return ApiEnvelope.ok(Map.of("activeProvider", aiCompatibilityService.getActiveProvider()));
    }

    @PostMapping("/providers/test")
    public ApiEnvelope<Map<String, Object>> testProvider(@RequestBody AiContracts.ProviderConfigRequest input) {
        return ApiEnvelope.ok(aiCompatibilityService.testProvider(input == null ? Map.of() : input.toMap()));
    }

    @GetMapping("/prompts/builtin")
    public ApiEnvelope<Map<String, String>> builtinPrompts() {
        return ApiEnvelope.ok(aiCompatibilityService.builtinPrompts());
    }

    @GetMapping("/models")
    public ApiEnvelope<Map<String, Object>> models() {
        return ApiEnvelope.ok(aiCompatibilityService.listModels());
    }

    @GetMapping("/settings/safety")
    public ApiEnvelope<String> safetyLevel() {
        return ApiEnvelope.ok(aiCompatibilityService.getSafetyLevel());
    }

    @PostMapping("/settings/safety")
    public ApiEnvelope<Map<String, Object>> setSafetyLevel(@RequestBody AiContracts.LevelRequest input) {
        aiCompatibilityService.setSafetyLevel(input == null ? "" : input.value());
        return ApiEnvelope.ok(Map.of("safetyLevel", aiCompatibilityService.getSafetyLevel()));
    }

    @GetMapping("/settings/context")
    public ApiEnvelope<String> contextLevel() {
        return ApiEnvelope.ok(aiCompatibilityService.getContextLevel());
    }

    @PostMapping("/settings/context")
    public ApiEnvelope<Map<String, Object>> setContextLevel(@RequestBody AiContracts.LevelRequest input) {
        aiCompatibilityService.setContextLevel(input == null ? "" : input.value());
        return ApiEnvelope.ok(Map.of("contextLevel", aiCompatibilityService.getContextLevel()));
    }

    @PostMapping("/safety/check-sql")
    public ApiEnvelope<Map<String, Object>> checkSql(@RequestBody AiContracts.SqlCheckRequest input) {
        return ApiEnvelope.ok(aiCompatibilityService.checkSql(input == null ? "" : input.value()));
    }

    @PostMapping("/chat/send")
    public ApiEnvelope<Map<String, Object>> chatSend(@RequestBody AiContracts.ChatRequest input) {
        return ApiEnvelope.ok(aiCompatibilityService.chatSend(input == null ? Map.of() : input.toMap()));
    }

    @PostMapping("/chat/stream")
    public ApiEnvelope<Map<String, Object>> chatStream(@RequestBody AiContracts.ChatRequest input) {
        String sessionId = input == null ? "" : input.sessionId();
        return ApiEnvelope.ok(aiCompatibilityService.chatStream(sessionId, input == null ? Map.of() : input.toMap()));
    }

    @PostMapping("/chat/cancel")
    public ApiEnvelope<Map<String, Object>> chatCancel(@RequestBody AiContracts.IdRequest input) {
        String sessionId = idValue(input);
        aiCompatibilityService.chatCancel(sessionId);
        return ApiEnvelope.ok(Map.of("cancelled", true, "sessionId", sessionId));
    }

    @GetMapping("/sessions")
    public ApiEnvelope<List<Map<String, Object>>> sessions() {
        return ApiEnvelope.ok(aiCompatibilityService.getSessions());
    }

    @PostMapping("/sessions/load")
    public ApiEnvelope<Map<String, Object>> loadSession(@RequestBody AiContracts.IdRequest input) {
        return ApiEnvelope.ok(aiCompatibilityService.loadSession(idValue(input)));
    }

    @PostMapping("/sessions/save")
    public ApiEnvelope<Map<String, Object>> saveSession(@RequestBody AiContracts.SessionSaveRequest input) {
        String sessionId = input == null ? "" : input.idValue();
        aiCompatibilityService.saveSession(
                sessionId,
                input == null ? "" : input.title(),
                input == null ? 0 : input.updatedAtValue(),
                input == null ? "" : input.messagesJSON()
        );
        return ApiEnvelope.ok(Map.of("saved", true, "sessionId", sessionId));
    }

    @PostMapping("/sessions/delete")
    public ApiEnvelope<Map<String, Object>> deleteSession(@RequestBody AiContracts.IdRequest input) {
        String sessionId = idValue(input);
        aiCompatibilityService.deleteSession(sessionId);
        return ApiEnvelope.ok(Map.of("deleted", true, "sessionId", sessionId));
    }

    private static String idValue(AiContracts.IdRequest input) {
        return input == null ? "" : input.value();
    }
}
