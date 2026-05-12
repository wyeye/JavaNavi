package com.javanavi.api;

import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.RedisContracts;
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

    @PostMapping("/connect") public ApiEnvelope<Object> connect(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> service.connect(toPayload(input))); }
    @PostMapping("/test") public ApiEnvelope<Object> test(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> service.connect(toPayload(input))); }
    @PostMapping("/keys/scan") public ApiEnvelope<Object> scanKeys(@RequestBody(required = false) RedisContracts.ScanKeysRequest input) { return invoke(() -> service.scanKeys(toPayload(input))); }
    @PostMapping("/value") public ApiEnvelope<Object> value(@RequestBody(required = false) RedisContracts.KeyRequest input) { return invoke(() -> service.getValue(toPayload(input))); }
    @PostMapping("/string/set") public ApiEnvelope<Object> setString(@RequestBody(required = false) RedisContracts.SetStringRequest input) { return invoke(() -> service.setString(toPayload(input))); }
    @PostMapping("/hash/field/set") public ApiEnvelope<Object> setHashField(@RequestBody(required = false) RedisContracts.HashFieldSetRequest input) { return invoke(() -> service.setHashField(toPayload(input))); }
    @PostMapping("/hash/field/delete") public ApiEnvelope<Object> deleteHashField(@RequestBody(required = false) RedisContracts.HashFieldDeleteRequest input) { return invoke(() -> service.deleteHashField(toPayload(input))); }
    @PostMapping("/keys/delete") public ApiEnvelope<Object> deleteKeys(@RequestBody(required = false) RedisContracts.KeysRequest input) { return invoke(() -> service.deleteKeys(toPayload(input))); }
    @PostMapping("/ttl/set") public ApiEnvelope<Object> setTTL(@RequestBody(required = false) RedisContracts.TtlRequest input) { return invoke(() -> service.setTTL(toPayload(input))); }
    @PostMapping("/command/execute") public ApiEnvelope<Object> executeCommand(@RequestBody(required = false) RedisContracts.CommandRequest input) { return invoke(() -> service.executeCommand(toPayload(input))); }
    @PostMapping("/server-info") public ApiEnvelope<Object> serverInfo(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> service.getServerInfo(toPayload(input))); }
    @PostMapping("/databases") public ApiEnvelope<Object> databases(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> service.getDatabases(toPayload(input))); }
    @PostMapping("/select-db") public ApiEnvelope<Object> selectDB(@RequestBody(required = false) RedisContracts.SelectDbRequest input) { return invoke(() -> service.selectDB(toPayload(input))); }
    @PostMapping("/key/rename") public ApiEnvelope<Object> renameKey(@RequestBody(required = false) RedisContracts.RenameKeyRequest input) { return invoke(() -> service.renameKey(toPayload(input))); }
    @PostMapping("/key-exists") public ApiEnvelope<Object> keyExists(@RequestBody(required = false) RedisContracts.KeyRequest input) { return invoke(() -> service.keyExists(toPayload(input))); }
    @PostMapping("/list/push") public ApiEnvelope<Object> listPush(@RequestBody(required = false) RedisContracts.ListPushRequest input) { return invoke(() -> service.listPush(toPayload(input))); }
    @PostMapping("/list/set") public ApiEnvelope<Object> listSet(@RequestBody(required = false) RedisContracts.ListSetRequest input) { return invoke(() -> service.listSet(toPayload(input))); }
    @PostMapping("/set/add") public ApiEnvelope<Object> setAdd(@RequestBody(required = false) RedisContracts.MembersRequest input) { return invoke(() -> service.setAdd(toPayload(input))); }
    @PostMapping("/set/remove") public ApiEnvelope<Object> setRemove(@RequestBody(required = false) RedisContracts.MembersRequest input) { return invoke(() -> service.setRemove(toPayload(input))); }
    @PostMapping("/zset/add") public ApiEnvelope<Object> zsetAdd(@RequestBody(required = false) RedisContracts.ZSetMembersRequest input) { return invoke(() -> service.zsetAdd(toPayload(input))); }
    @PostMapping("/zset/remove") public ApiEnvelope<Object> zsetRemove(@RequestBody(required = false) RedisContracts.MembersRequest input) { return invoke(() -> service.zsetRemove(toPayload(input))); }
    @PostMapping("/stream/add") public ApiEnvelope<Object> streamAdd(@RequestBody(required = false) RedisContracts.StreamAddRequest input) { return invoke(() -> service.streamAdd(toPayload(input))); }
    @PostMapping("/stream/delete") public ApiEnvelope<Object> streamDelete(@RequestBody(required = false) RedisContracts.StreamDeleteRequest input) { return invoke(() -> service.streamDelete(toPayload(input))); }
    @PostMapping("/flush-db") public ApiEnvelope<Object> flushDB(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> service.flushDB(toPayload(input))); }

    private static RedisContracts.RequestPayload toPayload(RedisContracts.Request input) { return input == null ? new RedisContracts.RequestPayload() : input.toPayload(); }

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
