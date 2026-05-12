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
    public ApiEnvelope<List<AiContracts.ProviderResponse>> providers() {
        return ApiEnvelope.ok(aiCompatibilityService.getProviders().stream().map(AiContracts.ProviderResponse::from).toList());
    }

    @PostMapping("/providers/save")
    public ApiEnvelope<AiContracts.ProviderResponse> saveProvider(@RequestBody AiContracts.ProviderConfigRequest input) {
        return ApiEnvelope.ok(AiContracts.ProviderResponse.from(aiCompatibilityService.saveProvider(input == null ? Map.of() : input.toMap())));
    }

    @PostMapping("/providers/delete")
    public ApiEnvelope<AiContracts.ProviderDeleteResponse> deleteProvider(@RequestBody AiContracts.IdRequest input) {
        aiCompatibilityService.deleteProvider(idValue(input));
        return ApiEnvelope.ok(new AiContracts.ProviderDeleteResponse(true));
    }

    @GetMapping("/providers/active")
    public ApiEnvelope<String> activeProvider() {
        return ApiEnvelope.ok(aiCompatibilityService.getActiveProvider());
    }

    @PostMapping("/providers/active")
    public ApiEnvelope<AiContracts.ActiveProviderResponse> setActiveProvider(@RequestBody AiContracts.IdRequest input) {
        String id = idValue(input);
        aiCompatibilityService.setActiveProvider(id);
        return ApiEnvelope.ok(new AiContracts.ActiveProviderResponse(aiCompatibilityService.getActiveProvider()));
    }

    @PostMapping("/providers/test")
    public ApiEnvelope<AiContracts.ProviderTestResponse> testProvider(@RequestBody AiContracts.ProviderConfigRequest input) {
        return ApiEnvelope.ok(AiContracts.ProviderTestResponse.from(aiCompatibilityService.testProvider(input == null ? Map.of() : input.toMap())));
    }

    @GetMapping("/prompts/builtin")
    public ApiEnvelope<Map<String, String>> builtinPrompts() {
        return ApiEnvelope.ok(aiCompatibilityService.builtinPrompts());
    }

    @GetMapping("/models")
    public ApiEnvelope<AiContracts.ModelsResponse> models() {
        return ApiEnvelope.ok(AiContracts.ModelsResponse.from(aiCompatibilityService.listModels()));
    }

    @GetMapping("/settings/safety")
    public ApiEnvelope<String> safetyLevel() {
        return ApiEnvelope.ok(aiCompatibilityService.getSafetyLevel());
    }

    @PostMapping("/settings/safety")
    public ApiEnvelope<AiContracts.LevelResponse> setSafetyLevel(@RequestBody AiContracts.LevelRequest input) {
        aiCompatibilityService.setSafetyLevel(input == null ? "" : input.value());
        return ApiEnvelope.ok(AiContracts.LevelResponse.safety(aiCompatibilityService.getSafetyLevel()));
    }

    @GetMapping("/settings/context")
    public ApiEnvelope<String> contextLevel() {
        return ApiEnvelope.ok(aiCompatibilityService.getContextLevel());
    }

    @PostMapping("/settings/context")
    public ApiEnvelope<AiContracts.LevelResponse> setContextLevel(@RequestBody AiContracts.LevelRequest input) {
        aiCompatibilityService.setContextLevel(input == null ? "" : input.value());
        return ApiEnvelope.ok(AiContracts.LevelResponse.context(aiCompatibilityService.getContextLevel()));
    }

    @PostMapping("/safety/check-sql")
    public ApiEnvelope<AiContracts.SqlCheckResponse> checkSql(@RequestBody AiContracts.SqlCheckRequest input) {
        return ApiEnvelope.ok(AiContracts.SqlCheckResponse.from(aiCompatibilityService.checkSql(input == null ? "" : input.value())));
    }

    @PostMapping("/chat/send")
    public ApiEnvelope<AiContracts.ChatResponse> chatSend(@RequestBody AiContracts.ChatRequest input) {
        return ApiEnvelope.ok(AiContracts.ChatResponse.from(aiCompatibilityService.chatSend(input == null ? Map.of() : input.toMap())));
    }

    @PostMapping("/chat/stream")
    public ApiEnvelope<AiContracts.ChatStreamResponse> chatStream(@RequestBody AiContracts.ChatRequest input) {
        String sessionId = input == null ? "" : input.sessionId();
        return ApiEnvelope.ok(AiContracts.ChatStreamResponse.from(aiCompatibilityService.chatStream(sessionId, input == null ? Map.of() : input.toMap())));
    }

    @PostMapping("/chat/cancel")
    public ApiEnvelope<AiContracts.ChatCancelResponse> chatCancel(@RequestBody AiContracts.IdRequest input) {
        String sessionId = idValue(input);
        aiCompatibilityService.chatCancel(sessionId);
        return ApiEnvelope.ok(new AiContracts.ChatCancelResponse(true, sessionId));
    }

    @GetMapping("/sessions")
    public ApiEnvelope<List<AiContracts.SessionSummaryResponse>> sessions() {
        return ApiEnvelope.ok(aiCompatibilityService.getSessions().stream().map(AiContracts.SessionSummaryResponse::from).toList());
    }

    @PostMapping("/sessions/load")
    public ApiEnvelope<AiContracts.SessionLoadResponse> loadSession(@RequestBody AiContracts.IdRequest input) {
        return ApiEnvelope.ok(AiContracts.SessionLoadResponse.from(aiCompatibilityService.loadSession(idValue(input))));
    }

    @PostMapping("/sessions/save")
    public ApiEnvelope<AiContracts.SessionSaveResponse> saveSession(@RequestBody AiContracts.SessionSaveRequest input) {
        String sessionId = input == null ? "" : input.idValue();
        aiCompatibilityService.saveSession(
                sessionId,
                input == null ? "" : input.title(),
                input == null ? 0 : input.updatedAtValue(),
                input == null ? "" : input.messagesJSON()
        );
        return ApiEnvelope.ok(new AiContracts.SessionSaveResponse(true, sessionId));
    }

    @PostMapping("/sessions/delete")
    public ApiEnvelope<AiContracts.SessionDeleteResponse> deleteSession(@RequestBody AiContracts.IdRequest input) {
        String sessionId = idValue(input);
        aiCompatibilityService.deleteSession(sessionId);
        return ApiEnvelope.ok(new AiContracts.SessionDeleteResponse(true, sessionId));
    }

    private static String idValue(AiContracts.IdRequest input) {
        return input == null ? "" : input.value();
    }
}
