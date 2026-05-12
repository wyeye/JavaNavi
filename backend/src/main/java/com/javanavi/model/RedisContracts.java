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
}
