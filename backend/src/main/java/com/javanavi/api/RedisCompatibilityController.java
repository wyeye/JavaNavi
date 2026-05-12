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

    @PostMapping("/connect") public ApiEnvelope<RedisContracts.ConnectResponse> connect(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> RedisContracts.ConnectResponse.from(service.connect(toPayload(input)))); }
    @PostMapping("/test") public ApiEnvelope<RedisContracts.ConnectResponse> test(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> RedisContracts.ConnectResponse.from(service.connect(toPayload(input)))); }
    @PostMapping("/keys/scan") public ApiEnvelope<RedisContracts.ScanKeysResponse> scanKeys(@RequestBody(required = false) RedisContracts.ScanKeysRequest input) { return invoke(() -> RedisContracts.ScanKeysResponse.from(service.scanKeys(toPayload(input)))); }
    @PostMapping("/value") public ApiEnvelope<RedisContracts.RedisValueResponse> value(@RequestBody(required = false) RedisContracts.KeyRequest input) { return invoke(() -> RedisContracts.RedisValueResponse.from(service.getValue(toPayload(input)))); }
    @PostMapping("/string/set") public ApiEnvelope<RedisContracts.OperationStatusResponse> setString(@RequestBody(required = false) RedisContracts.SetStringRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.setString(toPayload(input)))); }
    @PostMapping("/hash/field/set") public ApiEnvelope<RedisContracts.OperationStatusResponse> setHashField(@RequestBody(required = false) RedisContracts.HashFieldSetRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.setHashField(toPayload(input)))); }
    @PostMapping("/hash/field/delete") public ApiEnvelope<RedisContracts.OperationStatusResponse> deleteHashField(@RequestBody(required = false) RedisContracts.HashFieldDeleteRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.deleteHashField(toPayload(input)))); }
    @PostMapping("/keys/delete") public ApiEnvelope<RedisContracts.OperationStatusResponse> deleteKeys(@RequestBody(required = false) RedisContracts.KeysRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.deleteKeys(toPayload(input)))); }
    @PostMapping("/ttl/set") public ApiEnvelope<RedisContracts.OperationStatusResponse> setTTL(@RequestBody(required = false) RedisContracts.TtlRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.setTTL(toPayload(input)))); }
    @PostMapping("/command/execute") public ApiEnvelope<RedisContracts.CommandResponse> executeCommand(@RequestBody(required = false) RedisContracts.CommandRequest input) { return invoke(() -> RedisContracts.CommandResponse.from(service.executeCommand(toPayload(input)))); }
    @PostMapping("/server-info") public ApiEnvelope<Map<String, String>> serverInfo(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> service.getServerInfo(toPayload(input))); }
    @PostMapping("/databases") public ApiEnvelope<List<RedisContracts.DatabaseInfo>> databases(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> service.getDatabases(toPayload(input)).stream().map(RedisContracts.DatabaseInfo::from).toList()); }
    @PostMapping("/select-db") public ApiEnvelope<RedisContracts.OperationStatusResponse> selectDB(@RequestBody(required = false) RedisContracts.SelectDbRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.selectDB(toPayload(input)))); }
    @PostMapping("/key/rename") public ApiEnvelope<RedisContracts.OperationStatusResponse> renameKey(@RequestBody(required = false) RedisContracts.RenameKeyRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.renameKey(toPayload(input)))); }
    @PostMapping("/key-exists") public ApiEnvelope<RedisContracts.OperationStatusResponse> keyExists(@RequestBody(required = false) RedisContracts.KeyRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.keyExists(toPayload(input)))); }
    @PostMapping("/list/push") public ApiEnvelope<RedisContracts.OperationStatusResponse> listPush(@RequestBody(required = false) RedisContracts.ListPushRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.listPush(toPayload(input)))); }
    @PostMapping("/list/set") public ApiEnvelope<RedisContracts.OperationStatusResponse> listSet(@RequestBody(required = false) RedisContracts.ListSetRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.listSet(toPayload(input)))); }
    @PostMapping("/set/add") public ApiEnvelope<RedisContracts.OperationStatusResponse> setAdd(@RequestBody(required = false) RedisContracts.MembersRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.setAdd(toPayload(input)))); }
    @PostMapping("/set/remove") public ApiEnvelope<RedisContracts.OperationStatusResponse> setRemove(@RequestBody(required = false) RedisContracts.MembersRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.setRemove(toPayload(input)))); }
    @PostMapping("/zset/add") public ApiEnvelope<RedisContracts.OperationStatusResponse> zsetAdd(@RequestBody(required = false) RedisContracts.ZSetMembersRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.zsetAdd(toPayload(input)))); }
    @PostMapping("/zset/remove") public ApiEnvelope<RedisContracts.OperationStatusResponse> zsetRemove(@RequestBody(required = false) RedisContracts.MembersRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.zsetRemove(toPayload(input)))); }
    @PostMapping("/stream/add") public ApiEnvelope<RedisContracts.OperationStatusResponse> streamAdd(@RequestBody(required = false) RedisContracts.StreamAddRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.streamAdd(toPayload(input)))); }
    @PostMapping("/stream/delete") public ApiEnvelope<RedisContracts.OperationStatusResponse> streamDelete(@RequestBody(required = false) RedisContracts.StreamDeleteRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.streamDelete(toPayload(input)))); }
    @PostMapping("/flush-db") public ApiEnvelope<RedisContracts.OperationStatusResponse> flushDB(@RequestBody(required = false) RedisContracts.BaseRequest input) { return invoke(() -> RedisContracts.OperationStatusResponse.from(service.flushDB(toPayload(input)))); }

    private static RedisContracts.RequestPayload toPayload(RedisContracts.Request input) { return input == null ? new RedisContracts.RequestPayload() : input.toPayload(); }

    private <T> ApiEnvelope<T> invoke(Supplier<T> action) {
        try {
            return ApiEnvelope.ok(action.get());
        } catch (RuntimeException error) {
            return ApiEnvelope.failKey(messages, "redis.operationFailed", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
        }
    }

}
