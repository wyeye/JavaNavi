package com.javanavi.api;

import com.javanavi.ai.AiCompatibilityService;
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
    public ApiEnvelope<Map<String, Object>> saveProvider(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(aiCompatibilityService.saveProvider(input));
    }

    @PostMapping("/providers/delete")
    public ApiEnvelope<Map<String, Object>> deleteProvider(@RequestBody Map<String, Object> input) {
        aiCompatibilityService.deleteProvider(stringValue(input, "id", "providerId"));
        return ApiEnvelope.ok(Map.of("deleted", true));
    }

    @GetMapping("/providers/active")
    public ApiEnvelope<String> activeProvider() {
        return ApiEnvelope.ok(aiCompatibilityService.getActiveProvider());
    }

    @PostMapping("/providers/active")
    public ApiEnvelope<Map<String, Object>> setActiveProvider(@RequestBody Map<String, Object> input) {
        String id = stringValue(input, "id", "providerId");
        aiCompatibilityService.setActiveProvider(id);
        return ApiEnvelope.ok(Map.of("activeProvider", aiCompatibilityService.getActiveProvider()));
    }

    @PostMapping("/providers/test")
    public ApiEnvelope<Map<String, Object>> testProvider(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(aiCompatibilityService.testProvider(input));
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
    public ApiEnvelope<Map<String, Object>> setSafetyLevel(@RequestBody Map<String, Object> input) {
        aiCompatibilityService.setSafetyLevel(stringValue(input, "level", "safetyLevel"));
        return ApiEnvelope.ok(Map.of("safetyLevel", aiCompatibilityService.getSafetyLevel()));
    }

    @GetMapping("/settings/context")
    public ApiEnvelope<String> contextLevel() {
        return ApiEnvelope.ok(aiCompatibilityService.getContextLevel());
    }

    @PostMapping("/settings/context")
    public ApiEnvelope<Map<String, Object>> setContextLevel(@RequestBody Map<String, Object> input) {
        aiCompatibilityService.setContextLevel(stringValue(input, "level", "contextLevel"));
        return ApiEnvelope.ok(Map.of("contextLevel", aiCompatibilityService.getContextLevel()));
    }

    @PostMapping("/safety/check-sql")
    public ApiEnvelope<Map<String, Object>> checkSql(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(aiCompatibilityService.checkSql(stringValue(input, "sql", "query")));
    }

    @PostMapping("/chat/send")
    public ApiEnvelope<Map<String, Object>> chatSend(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(aiCompatibilityService.chatSend(input));
    }

    @PostMapping("/chat/stream")
    public ApiEnvelope<Map<String, Object>> chatStream(@RequestBody Map<String, Object> input) {
        String sessionId = stringValue(input, "sessionId", "id");
        return ApiEnvelope.ok(aiCompatibilityService.chatStream(sessionId, input));
    }

    @PostMapping("/chat/cancel")
    public ApiEnvelope<Map<String, Object>> chatCancel(@RequestBody Map<String, Object> input) {
        String sessionId = stringValue(input, "sessionId", "id");
        aiCompatibilityService.chatCancel(sessionId);
        return ApiEnvelope.ok(Map.of("cancelled", true, "sessionId", sessionId));
    }

    @GetMapping("/sessions")
    public ApiEnvelope<List<Map<String, Object>>> sessions() {
        return ApiEnvelope.ok(aiCompatibilityService.getSessions());
    }

    @PostMapping("/sessions/load")
    public ApiEnvelope<Map<String, Object>> loadSession(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(aiCompatibilityService.loadSession(stringValue(input, "sessionId", "id")));
    }

    @PostMapping("/sessions/save")
    public ApiEnvelope<Map<String, Object>> saveSession(@RequestBody Map<String, Object> input) {
        String sessionId = stringValue(input, "sessionId", "id");
        aiCompatibilityService.saveSession(
                sessionId,
                stringValue(input, "title"),
                doubleValue(input == null ? null : input.get("updatedAt")),
                stringValue(input, "messagesJSON", "messagesJson", "messages")
        );
        return ApiEnvelope.ok(Map.of("saved", true, "sessionId", sessionId));
    }

    @PostMapping("/sessions/delete")
    public ApiEnvelope<Map<String, Object>> deleteSession(@RequestBody Map<String, Object> input) {
        String sessionId = stringValue(input, "sessionId", "id");
        aiCompatibilityService.deleteSession(sessionId);
        return ApiEnvelope.ok(Map.of("deleted", true, "sessionId", sessionId));
    }

    private static String stringValue(Map<String, Object> input, String... keys) {
        if (input == null) {
            return "";
        }
        for (String key : keys) {
            Object value = input.get(key);
            if (value != null) {
                return String.valueOf(value);
            }
        }
        return "";
    }

    private static double doubleValue(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(value == null ? "0" : String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }
}
