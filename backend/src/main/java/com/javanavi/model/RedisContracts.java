package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class RedisContracts {
    private RedisContracts() {
    }

    public interface Request {
        RequestPayload toPayload();
    }

    public static final class RequestPayload extends LinkedHashMap<String, Object> {
        public RequestPayload() {
        }
    }

    public record BaseRequest(ConnectionConfigDto connection) implements Request {
        public RequestPayload toPayload() {
            return withConnection(connection);
        }
    }

    public record ScanKeysRequest(ConnectionConfigDto connection, String pattern, String cursor, Integer count) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "pattern", pattern);
            put(map, "cursor", cursor);
            put(map, "count", count);
            return map;
        }
    }

    public record KeyRequest(ConnectionConfigDto connection, String key) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            return map;
        }
    }

    public record SetStringRequest(ConnectionConfigDto connection, String key, String value, Long ttl) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "value", value);
            put(map, "ttl", ttl);
            return map;
        }
    }

    public record HashFieldSetRequest(ConnectionConfigDto connection, String key, String field, String value) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "field", field);
            put(map, "value", value);
            return map;
        }
    }

    public record HashFieldDeleteRequest(ConnectionConfigDto connection, String key, List<String> fields) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "fields", fields);
            return map;
        }
    }

    public record KeysRequest(ConnectionConfigDto connection, List<String> keys) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "keys", keys);
            return map;
        }
    }

    public record TtlRequest(ConnectionConfigDto connection, String key, Long ttl) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "ttl", ttl);
            return map;
        }
    }

    public record CommandRequest(ConnectionConfigDto connection, String command) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "command", command);
            return map;
        }
    }

    public record SelectDbRequest(ConnectionConfigDto connection, Integer dbIndex) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "dbIndex", dbIndex);
            return map;
        }
    }

    public record RenameKeyRequest(ConnectionConfigDto connection, String oldKey, String newKey) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "oldKey", oldKey);
            put(map, "newKey", newKey);
            return map;
        }
    }

    public record ListPushRequest(ConnectionConfigDto connection, String key, List<String> values, String position) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "values", values);
            put(map, "position", position);
            return map;
        }
    }

    public record ListSetRequest(ConnectionConfigDto connection, String key, Long index, String value) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "index", index);
            put(map, "value", value);
            return map;
        }
    }

    public record MembersRequest(ConnectionConfigDto connection, String key, List<String> members) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "members", members);
            return map;
        }
    }

    public record ZSetMember(String member, String value, Double score) {
    }

    public record ZSetMembersRequest(ConnectionConfigDto connection, String key, List<ZSetMember> members) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "members", members == null ? null : members.stream().map(member -> mapOf(
                    "member", member.member(),
                    "value", member.value(),
                    "score", member.score()
            )).toList());
            return map;
        }
    }

    public record StreamAddRequest(ConnectionConfigDto connection, String key, Map<String, String> fields, String id) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "fields", fields);
            put(map, "id", id);
            return map;
        }
    }

    public record StreamDeleteRequest(ConnectionConfigDto connection, String key, List<String> ids) implements Request {
        public RequestPayload toPayload() {
            RequestPayload map = withConnection(connection);
            put(map, "key", key);
            put(map, "ids", ids);
            return map;
        }
    }

    public record ConnectResponse(boolean connected, String message, int db, String mode, List<String> nodes) {
        public static ConnectResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new ConnectResponse(
                    booleanValue(map.get("connected")),
                    text(map.get("message")),
                    intValue(map.get("db")),
                    text(map.get("mode")),
                    stringList(map.get("nodes"))
            );
        }
    }

    public record KeyInfo(String key, String type, long ttl, String node) {
        public static KeyInfo from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new KeyInfo(
                    text(map.get("key")),
                    text(map.get("type")),
                    longValue(map.get("ttl")),
                    text(map.get("node"))
            );
        }
    }

    public record ScanKeysResponse(List<KeyInfo> keys, String cursor) {
        public static ScanKeysResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new ScanKeysResponse(
                    listValue(map.get("keys")).stream().map(KeyInfo::from).toList(),
                    text(map.get("cursor"))
            );
        }
    }

    public record RedisValueResponse(String type, long ttl, Object value, long length) {
        public static RedisValueResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new RedisValueResponse(
                    text(map.get("type")),
                    longValue(map.get("ttl")),
                    map.get("value"),
                    longValue(map.get("length"))
            );
        }
    }

    public record CommandResponse(List<String> command, Object result) {
        public static CommandResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new CommandResponse(
                    stringList(map.get("command")),
                    map.get("result")
            );
        }
    }

    public record DatabaseInfo(int index, long keys) {
        public static DatabaseInfo from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new DatabaseInfo(intValue(map.get("index")), longValue(map.get("keys")));
        }
    }

    public record OperationStatusResponse(
            String message,
            boolean ok,
            long timestamp,
            Long deleted,
            Long added,
            Long removed,
            Long length,
            String key,
            String field,
            Long ttl,
            Long index,
            String oldKey,
            String newKey,
            String node,
            Integer db,
            String id,
            Boolean selected,
            Boolean exists
    ) {
        public static OperationStatusResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new OperationStatusResponse(
                    text(map.get("message")),
                    booleanValue(map.get("ok")),
                    longValue(map.get("timestamp")),
                    nullableLong(map.get("deleted")),
                    nullableLong(map.get("added")),
                    nullableLong(map.get("removed")),
                    nullableLong(map.get("length")),
                    text(map.get("key")),
                    text(map.get("field")),
                    nullableLong(map.get("ttl")),
                    nullableLong(map.get("index")),
                    text(map.get("oldKey")),
                    text(map.get("newKey")),
                    text(map.get("node")),
                    nullableInt(map.get("db")),
                    text(map.get("id")),
                    nullableBoolean(map.get("selected")),
                    nullableBoolean(map.get("exists"))
            );
        }
    }

    private static RequestPayload withConnection(ConnectionConfigDto connection) {
        RequestPayload map = new RequestPayload();
        put(map, "connection", CompatibilityRequestMaps.connectionConfig(connection));
        return map;
    }

    private static RequestPayload mapOf(Object... entries) {
        RequestPayload map = new RequestPayload();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            put(map, String.valueOf(entries[i]), entries[i + 1]);
        }
        return map;
    }

    private static void put(RequestPayload map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static boolean booleanValue(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        String normalized = text(value).toLowerCase(java.util.Locale.ROOT);
        return "true".equals(normalized) || "1".equals(normalized) || "yes".equals(normalized) || "on".equals(normalized);
    }

    private static Boolean nullableBoolean(Object value) {
        return value == null ? null : booleanValue(value);
    }

    private static int intValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            String text = text(value);
            return text.isBlank() ? 0 : Integer.parseInt(text);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static Integer nullableInt(Object value) {
        return value == null || text(value).isBlank() ? null : intValue(value);
    }

    private static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            String text = text(value);
            return text.isBlank() ? 0L : Long.parseLong(text);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private static Long nullableLong(Object value) {
        return value == null || text(value).isBlank() ? null : longValue(value);
    }

    private static List<?> listValue(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private static List<String> stringList(Object value) {
        return listValue(value).stream()
                .map(RedisContracts::text)
                .filter(item -> !item.isBlank())
                .toList();
    }

    private static Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> raw)) {
            return Map.of();
        }
        RequestPayload map = new RequestPayload();
        raw.forEach((key, item) -> map.put(String.valueOf(key), item));
        return map;
    }
}
