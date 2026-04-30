package com.javanavi.api;

import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.redis.RedisCompatibilityService;
import com.javanavi.security.SecretRedactor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

@RestController
@RequestMapping("/api/v1/redis")
public class RedisCompatibilityController {
    private final RedisCompatibilityService service;
    private final I18nMessages messages;

    public RedisCompatibilityController(RedisCompatibilityService service, I18nMessages messages) {
        this.service = service;
        this.messages = messages;
    }

    @PostMapping("/connect") public ApiEnvelope<Object> connect(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.connect(input)); }
    @PostMapping("/test") public ApiEnvelope<Object> test(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.connect(input)); }
    @PostMapping("/keys/scan") public ApiEnvelope<Object> scanKeys(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.scanKeys(input)); }
    @PostMapping("/value") public ApiEnvelope<Object> value(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.getValue(input)); }
    @PostMapping("/string/set") public ApiEnvelope<Object> setString(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.setString(input)); }
    @PostMapping("/hash/field/set") public ApiEnvelope<Object> setHashField(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.setHashField(input)); }
    @PostMapping("/hash/field/delete") public ApiEnvelope<Object> deleteHashField(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.deleteHashField(input)); }
    @PostMapping("/keys/delete") public ApiEnvelope<Object> deleteKeys(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.deleteKeys(input)); }
    @PostMapping("/ttl/set") public ApiEnvelope<Object> setTTL(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.setTTL(input)); }
    @PostMapping("/command/execute") public ApiEnvelope<Object> executeCommand(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.executeCommand(input)); }
    @PostMapping("/server-info") public ApiEnvelope<Object> serverInfo(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.getServerInfo(input)); }
    @PostMapping("/databases") public ApiEnvelope<Object> databases(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.getDatabases(input)); }
    @PostMapping("/select-db") public ApiEnvelope<Object> selectDB(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.selectDB(input)); }
    @PostMapping("/key/rename") public ApiEnvelope<Object> renameKey(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.renameKey(input)); }
    @PostMapping("/key-exists") public ApiEnvelope<Object> keyExists(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.keyExists(input)); }
    @PostMapping("/list/push") public ApiEnvelope<Object> listPush(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.listPush(input)); }
    @PostMapping("/list/set") public ApiEnvelope<Object> listSet(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.listSet(input)); }
    @PostMapping("/set/add") public ApiEnvelope<Object> setAdd(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.setAdd(input)); }
    @PostMapping("/set/remove") public ApiEnvelope<Object> setRemove(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.setRemove(input)); }
    @PostMapping("/zset/add") public ApiEnvelope<Object> zsetAdd(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.zsetAdd(input)); }
    @PostMapping("/zset/remove") public ApiEnvelope<Object> zsetRemove(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.zsetRemove(input)); }
    @PostMapping("/stream/add") public ApiEnvelope<Object> streamAdd(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.streamAdd(input)); }
    @PostMapping("/stream/delete") public ApiEnvelope<Object> streamDelete(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.streamDelete(input)); }
    @PostMapping("/flush-db") public ApiEnvelope<Object> flushDB(@RequestBody(required = false) Map<String, Object> input) { return invoke(() -> service.flushDB(input)); }

    private ApiEnvelope<Object> invoke(Supplier<Object> action) {
        try {
            Object value = localizeMessages(action.get());
            if (value instanceof List<?> || value instanceof Map<?, ?> || value instanceof String || value == null) {
                return ApiEnvelope.ok(value);
            }
            return ApiEnvelope.ok(String.valueOf(value));
        } catch (RuntimeException error) {
            return ApiEnvelope.failKey(messages, "redis.operationFailed", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
        }
    }

    @SuppressWarnings("unchecked")
    private Object localizeMessages(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> copy = new java.util.LinkedHashMap<>();
            map.forEach((key, item) -> copy.put(String.valueOf(key), localizeMessages(item)));
            Object message = copy.get("message");
            if (message instanceof String text) {
                copy.put("message", messages.localizeFallback(text));
            }
            return copy;
        }
        if (value instanceof List<?> list) {
            return list.stream().map(this::localizeMessages).toList();
        }
        return value;
    }
}
