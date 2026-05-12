package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class RedisContracts {
    private RedisContracts() {
    }

    public record BaseRequest(ConnectionConfigDto connection) {
        public Map<String, Object> toMap() {
            return withConnection(connection);
        }
    }

    public record ScanKeysRequest(ConnectionConfigDto connection, String pattern, String cursor, Integer count) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "pattern", pattern);
            put(map, "cursor", cursor);
            put(map, "count", count);
            return map;
        }
    }

    public record KeyRequest(ConnectionConfigDto connection, String key) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            return map;
        }
    }

    public record SetStringRequest(ConnectionConfigDto connection, String key, String value, Long ttl) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "value", value);
            put(map, "ttl", ttl);
            return map;
        }
    }

    public record HashFieldSetRequest(ConnectionConfigDto connection, String key, String field, String value) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "field", field);
            put(map, "value", value);
            return map;
        }
    }

    public record HashFieldDeleteRequest(ConnectionConfigDto connection, String key, List<String> fields) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "fields", fields);
            return map;
        }
    }

    public record KeysRequest(ConnectionConfigDto connection, List<String> keys) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "keys", keys);
            return map;
        }
    }

    public record TtlRequest(ConnectionConfigDto connection, String key, Long ttl) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "ttl", ttl);
            return map;
        }
    }

    public record CommandRequest(ConnectionConfigDto connection, String command) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "command", command);
            return map;
        }
    }

    public record SelectDbRequest(ConnectionConfigDto connection, Integer dbIndex) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "dbIndex", dbIndex);
            return map;
        }
    }

    public record RenameKeyRequest(ConnectionConfigDto connection, String oldKey, String newKey) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "oldKey", oldKey);
            put(map, "newKey", newKey);
            return map;
        }
    }

    public record ListPushRequest(ConnectionConfigDto connection, String key, List<String> values, String position) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "values", values);
            put(map, "position", position);
            return map;
        }
    }

    public record ListSetRequest(ConnectionConfigDto connection, String key, Long index, String value) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "index", index);
            put(map, "value", value);
            return map;
        }
    }

    public record MembersRequest(ConnectionConfigDto connection, String key, List<String> members) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "members", members);
            return map;
        }
    }

    public record ZSetMember(String member, String value, Double score) {
    }

    public record ZSetMembersRequest(ConnectionConfigDto connection, String key, List<ZSetMember> members) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "members", members == null ? null : members.stream().map(member -> mapOf(
                    "member", member.member(),
                    "value", member.value(),
                    "score", member.score()
            )).toList());
            return map;
        }
    }

    public record StreamAddRequest(ConnectionConfigDto connection, String key, Map<String, String> fields, String id) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "fields", fields);
            put(map, "id", id);
            return map;
        }
    }

    public record StreamDeleteRequest(ConnectionConfigDto connection, String key, List<String> ids) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = withConnection(connection);
            put(map, "key", key);
            put(map, "ids", ids);
            return map;
        }
    }

    private static Map<String, Object> withConnection(ConnectionConfigDto connection) {
        Map<String, Object> map = new LinkedHashMap<>();
        put(map, "connection", connectionMap(connection));
        return map;
    }

    private static Map<String, Object> connectionMap(ConnectionConfigDto connection) {
        if (connection == null) {
            return null;
        }
        return mapOf(
                "id", connection.id(),
                "name", connection.name(),
                "driverType", connection.driverType(),
                "driver", connection.driver(),
                "host", connection.host(),
                "port", connection.port(),
                "database", connection.database(),
                "username", connection.username(),
                "password", connection.password(),
                "options", connection.options(),
                "timeout", connection.timeout(),
                "useSSL", connection.useSSL(),
                "sslMode", connection.sslMode(),
                "uri", connection.uri(),
                "dsn", connection.dsn(),
                "hosts", connection.hosts(),
                "topology", connection.topology(),
                "replicaSet", connection.replicaSet(),
                "authSource", connection.authSource(),
                "readPreference", connection.readPreference(),
                "mongoSrv", connection.mongoSrv(),
                "mongoAuthMechanism", connection.mongoAuthMechanism(),
                "mongoReplicaUser", connection.mongoReplicaUser(),
                "mongoReplicaPassword", connection.mongoReplicaPassword()
        );
    }

    private static Map<String, Object> mapOf(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            put(map, String.valueOf(entries[i]), entries[i + 1]);
        }
        return map;
    }

    private static void put(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }
}
