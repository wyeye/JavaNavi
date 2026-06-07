package com.javanavi.redis;

import com.javanavi.i18n.I18nMessages;
import org.springframework.stereotype.Service;

import javax.net.ssl.SSLSocketFactory;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class RedisCompatibilityService {
    private static final String KEY_GONE_MESSAGE = "redis.keyGone";

    private final I18nMessages messages;

    public RedisCompatibilityService(I18nMessages messages) {
        this.messages = messages;
    }

    public Map<String, Object> connect(Map<String, Object> input) {
        List<RedisConfig> configs = resolveConfigs(input, null);
        for (RedisConfig config : configs) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                connection.execute("PING");
            }
        }
        RedisConfig first = configs.get(0);
        return orderedMap(
                "connected", true,
                "message", messages.message("common.connectionSucceeded"),
                "db", first.database(),
                "mode", configs.size() > 1 ? "direct-tcp-cluster" : "direct-tcp",
                "nodes", configs.stream().map(RedisConfig::address).toList()
        );
    }

    public Map<String, Object> scanKeys(Map<String, Object> input) {
        String pattern = firstText(text(input, "pattern"), "*");
        String cursor = parseCursor(value(input, "cursor"));
        int count = positiveInt(value(input, "count"), 2000);
        Map<String, Map<String, Object>> merged = new LinkedHashMap<>();
        String nextCursor = "0";
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                Object raw = connection.execute("SCAN", cursor, "MATCH", pattern, "COUNT", String.valueOf(count));
                List<Object> parts = list(raw);
                if (!parts.isEmpty() && !"0".equals(string(parts.get(0)))) {
                    nextCursor = string(parts.get(0));
                }
                List<Object> keys = parts.size() > 1 ? list(parts.get(1)) : List.of();
                for (Object keyObject : keys) {
                    String key = string(keyObject);
                    if (key.isBlank() || merged.containsKey(key)) {
                        continue;
                    }
                    String type = string(connection.execute("TYPE", key));
                    long ttl = longValue(connection.execute("TTL", key));
                    if (!isGone(type, ttl)) {
                        merged.put(key, orderedMap("key", key, "type", type, "ttl", ttl, "node", config.address()));
                    }
                }
            }
        }
        return orderedMap("keys", new ArrayList<>(merged.values()), "cursor", nextCursor);
    }

    public Map<String, Object> getValue(Map<String, Object> input) {
        String key = requiredText(input, "key");
        RedisOperationException gone = null;
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                return redisValue(connection, key);
            } catch (RedisOperationException error) {
                if (!KEY_GONE_MESSAGE.equals(error.getMessage())) {
                    throw error;
                }
                gone = error;
            }
        }
        throw gone == null ? new RedisOperationException(KEY_GONE_MESSAGE) : gone;
    }

    public Map<String, Object> setString(Map<String, Object> input) {
        String key = requiredText(input, "key");
        String value = text(input, "value");
        long ttl = longValue(value(input, "ttl"), -1);
        try (RedisConnection connection = open(input)) {
            if (ttl > 0) {
                connection.execute("SET", key, value, "EX", String.valueOf(ttl));
            } else {
                connection.execute("SET", key, value);
            }
            return status(messages.message("common.setSucceeded"), "key", key);
        }
    }

    public Map<String, Object> setHashField(Map<String, Object> input) {
        String key = requiredText(input, "key");
        String field = requiredText(input, "field");
        String value = text(input, "value");
        try (RedisConnection connection = open(input)) {
            connection.execute("HSET", key, field, value);
            return status(messages.message("common.setSucceeded"), "key", key, "field", field);
        }
    }

    public Map<String, Object> deleteHashField(Map<String, Object> input) {
        String key = requiredText(input, "key");
        List<String> fields = stringArgs(value(input, "fields"), "fields");
        List<String> command = new ArrayList<>(List.of("HDEL", key));
        command.addAll(fields);
        long deleted = 0;
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                deleted += longValue(connection.execute(command));
            }
        }
        return orderedMap("message", messages.message("common.deleteSucceeded"), "deleted", deleted);
    }

    public Map<String, Object> deleteKeys(Map<String, Object> input) {
        List<String> keys = stringArgs(value(input, "keys"), "keys");
        List<String> command = new ArrayList<>(List.of("DEL"));
        command.addAll(keys);
        long deleted = 0;
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                deleted += longValue(connection.execute(command));
            }
        }
        return orderedMap("deleted", deleted);
    }

    public Map<String, Object> setTTL(Map<String, Object> input) {
        String key = requiredText(input, "key");
        long ttl = longValue(value(input, "ttl"), -1);
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                if (ttl < 0) {
                    connection.execute("PERSIST", key);
                } else {
                    connection.execute("EXPIRE", key, String.valueOf(ttl));
                }
            }
        }
        return status(messages.message("common.setSucceeded"), "key", key, "ttl", ttl);
    }

    public Map<String, Object> executeCommand(Map<String, Object> input) {
        List<String> args = parseRedisCommand(requiredText(input, "command"));
        if (args.isEmpty()) {
            throw new RedisOperationException(messages.message("redis.commandRequired"));
        }
        try (RedisConnection connection = open(input)) {
            Object result = connection.execute(args);
            return orderedMap("command", args, "result", result);
        }
    }

    public Map<String, String> getServerInfo(Map<String, Object> input) {
        try (RedisConnection connection = open(input)) {
            return parseInfo(string(connection.execute("INFO")));
        }
    }

    public List<Map<String, Object>> getDatabases(Map<String, Object> input) {
        Map<Integer, Long> totals = new LinkedHashMap<>();
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                Map<Integer, Long> keyCounts = parseKeyspaceInfo(string(connection.execute("INFO", "keyspace")));
                keyCounts.forEach((index, keys) -> totals.merge(index, keys, Long::sum));
            }
        }
        List<Map<String, Object>> databases = new ArrayList<>();
        for (int index = 0; index < 16; index++) {
            databases.add(orderedMap("index", index, "keys", totals.getOrDefault(index, 0L)));
        }
        return databases;
    }

    public Map<String, Object> selectDB(Map<String, Object> input) {
        int dbIndex = intValue(value(input, "dbIndex"), 0);
        if (dbIndex < 0 || dbIndex > 15) {
            throw new RedisOperationException(messages.message("redis.databaseRange"));
        }
        for (RedisConfig config : resolveConfigs(input, dbIndex)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                connection.execute("PING");
            }
        }
        return orderedMap("selected", true, "index", dbIndex, "message", messages.message("common.switchSucceeded"));
    }

    public Map<String, Object> renameKey(Map<String, Object> input) {
        String oldKey = requiredText(input, "oldKey");
        String newKey = requiredText(input, "newKey");
        RedisOperationException last = null;
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                connection.execute("RENAME", oldKey, newKey);
                return status(messages.message("common.renameSucceeded"), "oldKey", oldKey, "newKey", newKey, "node", config.address());
            } catch (RedisOperationException error) {
                last = error;
            }
        }
        throw last == null ? new RedisOperationException("ERR no such key") : last;
    }

    public Map<String, Object> keyExists(Map<String, Object> input) {
        String key = requiredText(input, "key");
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                if (longValue(connection.execute("EXISTS", key)) > 0) {
                    return orderedMap("exists", true, "node", config.address());
                }
            }
        }
        return orderedMap("exists", false);
    }

    public Map<String, Object> listPush(Map<String, Object> input) {
        String key = requiredText(input, "key");
        List<String> values = stringArgs(value(input, "values"), "values");
        String position = firstText(text(input, "position"), "right").toLowerCase(Locale.ROOT);
        List<String> command = new ArrayList<>(List.of("left".equals(position) ? "LPUSH" : "RPUSH", key));
        command.addAll(values);
        try (RedisConnection connection = open(input)) {
            long length = longValue(connection.execute(command));
            return orderedMap("message", messages.message("common.addSucceeded"), "length", length);
        }
    }

    public Map<String, Object> listSet(Map<String, Object> input) {
        String key = requiredText(input, "key");
        long index = longValue(value(input, "index"), 0);
        String value = text(input, "value");
        try (RedisConnection connection = open(input)) {
            connection.execute("LSET", key, String.valueOf(index), value);
            return status(messages.message("common.setSucceeded"), "key", key, "index", index);
        }
    }

    public Map<String, Object> setAdd(Map<String, Object> input) {
        String key = requiredText(input, "key");
        List<String> members = stringArgs(value(input, "members"), "members");
        List<String> command = new ArrayList<>(List.of("SADD", key));
        command.addAll(members);
        try (RedisConnection connection = open(input)) {
            long added = longValue(connection.execute(command));
            return orderedMap("message", messages.message("common.addSucceeded"), "added", added);
        }
    }

    public Map<String, Object> setRemove(Map<String, Object> input) {
        String key = requiredText(input, "key");
        List<String> members = stringArgs(value(input, "members"), "members");
        List<String> command = new ArrayList<>(List.of("SREM", key));
        command.addAll(members);
        try (RedisConnection connection = open(input)) {
            long removed = longValue(connection.execute(command));
            return orderedMap("message", messages.message("common.deleteSucceeded"), "removed", removed);
        }
    }

    public Map<String, Object> zsetAdd(Map<String, Object> input) {
        String key = requiredText(input, "key");
        List<Map<String, Object>> members = mapList(value(input, "members"));
        if (members.isEmpty()) {
            throw new RedisOperationException(messages.message("redis.membersRequired"));
        }
        List<String> command = new ArrayList<>(List.of("ZADD", key));
        for (Map<String, Object> member : members) {
            command.add(String.valueOf(doubleValue(member.get("score"), 0.0)));
            command.add(firstText(string(member.get("member")), string(member.get("value"))));
        }
        try (RedisConnection connection = open(input)) {
            long added = longValue(connection.execute(command));
            return orderedMap("message", messages.message("common.addSucceeded"), "added", added);
        }
    }

    public Map<String, Object> zsetRemove(Map<String, Object> input) {
        String key = requiredText(input, "key");
        List<String> members = stringArgs(value(input, "members"), "members");
        List<String> command = new ArrayList<>(List.of("ZREM", key));
        command.addAll(members);
        try (RedisConnection connection = open(input)) {
            long removed = longValue(connection.execute(command));
            return orderedMap("message", messages.message("common.deleteSucceeded"), "removed", removed);
        }
    }

    public Map<String, Object> streamAdd(Map<String, Object> input) {
        String key = requiredText(input, "key");
        Map<String, Object> fields = map(value(input, "fields"));
        if (fields.isEmpty()) {
            throw new RedisOperationException(messages.message("redis.streamFieldsRequired"));
        }
        String id = firstText(text(input, "id"), "*");
        List<String> command = new ArrayList<>(List.of("XADD", key, id));
        fields.forEach((field, value) -> {
            command.add(field);
            command.add(string(value));
        });
        try (RedisConnection connection = open(input)) {
            String newId = string(connection.execute(command));
            return orderedMap("message", messages.message("common.addSucceeded"), "id", newId);
        }
    }

    public Map<String, Object> streamDelete(Map<String, Object> input) {
        String key = requiredText(input, "key");
        List<String> ids = stringArgs(value(input, "ids"), "ids");
        List<String> command = new ArrayList<>(List.of("XDEL", key));
        command.addAll(ids);
        try (RedisConnection connection = open(input)) {
            long deleted = longValue(connection.execute(command));
            return orderedMap("message", messages.message("common.deleteSucceeded"), "deleted", deleted);
        }
    }

    public Map<String, Object> flushDB(Map<String, Object> input) {
        int database = intValue(value(map(value(input, "connection")), "redisDB"), 0);
        for (RedisConfig config : resolveConfigs(input, null)) {
            try (RedisConnection connection = new RedisConnection(config, messages)) {
                connection.execute("FLUSHDB");
            }
        }
        return status(messages.message("common.clearSucceeded"), "db", database);
    }

    private Map<String, Object> redisValue(RedisConnection connection, String key) {
        String type = string(connection.execute("TYPE", key));
        long ttl = longValue(connection.execute("TTL", key));
        if (isGone(type, ttl)) {
            throw new RedisOperationException(KEY_GONE_MESSAGE);
        }
        Object value;
        long length;
        switch (type) {
            case "string" -> {
                String text = string(connection.execute("GET", key));
                value = text;
                length = text.length();
            }
            case "hash" -> {
                List<Object> pairs = list(connection.execute("HGETALL", key));
                Map<String, String> fields = new LinkedHashMap<>();
                for (int index = 0; index + 1 < pairs.size(); index += 2) {
                    fields.put(string(pairs.get(index)), string(pairs.get(index + 1)));
                }
                value = fields;
                length = fields.size();
            }
            case "list" -> {
                length = longValue(connection.execute("LLEN", key));
                long stop = Math.max(0, Math.min(length, 1000) - 1);
                value = length == 0 ? List.of() : stringList(connection.execute("LRANGE", key, "0", String.valueOf(stop)));
            }
            case "set" -> {
                length = longValue(connection.execute("SCARD", key));
                value = stringList(connection.execute("SMEMBERS", key));
            }
            case "zset" -> {
                length = longValue(connection.execute("ZCARD", key));
                long stop = Math.max(0, Math.min(length, 1000) - 1);
                List<Object> pairs = length == 0 ? List.of() : list(connection.execute("ZRANGE", key, "0", String.valueOf(stop), "WITHSCORES"));
                List<Map<String, Object>> members = new ArrayList<>();
                for (int index = 0; index + 1 < pairs.size(); index += 2) {
                    members.add(orderedMap("member", string(pairs.get(index)), "score", doubleValue(pairs.get(index + 1), 0.0)));
                }
                value = members;
            }
            case "stream" -> {
                length = longValue(connection.execute("XLEN", key));
                long count = Math.max(1, Math.min(length, 1000));
                Object raw = length == 0 ? List.of() : connection.execute("XRANGE", key, "-", "+", "COUNT", String.valueOf(count));
                value = streamEntries(raw);
            }
            default -> throw new RedisOperationException(messages.message("redis.unsupportedType", "type", type));
        }
        return orderedMap("type", type, "ttl", ttl, "value", value, "length", length);
    }

    private List<Map<String, Object>> streamEntries(Object raw) {
        List<Map<String, Object>> entries = new ArrayList<>();
        for (Object entryObject : list(raw)) {
            List<Object> entry = list(entryObject);
            if (entry.size() < 2) {
                continue;
            }
            List<Object> rawFields = list(entry.get(1));
            Map<String, String> fields = new LinkedHashMap<>();
            for (int index = 0; index + 1 < rawFields.size(); index += 2) {
                fields.put(string(rawFields.get(index)), string(rawFields.get(index + 1)));
            }
            entries.add(orderedMap("id", string(entry.get(0)), "fields", fields));
        }
        return entries;
    }

    private RedisConnection open(Map<String, Object> input) {
        return new RedisConnection(resolveConfig(input, null), messages);
    }

    private RedisConnection open(Map<String, Object> input, int databaseOverride) {
        return new RedisConnection(resolveConfig(input, databaseOverride), messages);
    }

    private RedisConfig resolveConfig(Map<String, Object> input, Integer databaseOverride) {
        return resolveConfigs(input, databaseOverride).get(0);
    }

    private List<RedisConfig> resolveConfigs(Map<String, Object> input, Integer databaseOverride) {
        Map<String, Object> connection = map(value(input, "connection"));
        Map<String, Object> options = map(connection.get("options"));
        if (bool(connection.get("useSSH")) || bool(connection.get("useProxy"))) {
            throw new RedisOperationException(messages.message("redis.runtimeExclusion"));
        }

        RedisConfig fromUri = parseUri(firstText(string(connection.get("uri")), string(options.get("uri"))));
        int defaultPort = positiveInt(firstText(string(connection.get("port")), string(options.get("port")), String.valueOf(fromUri.port())), 6379);
        List<RedisEndpoint> endpoints = resolveEndpoints(connection, options, fromUri, defaultPort);
        String username = firstText(string(connection.get("username")), string(connection.get("user")), fromUri.username());
        String password = sanitizeRedisPassword(firstText(string(connection.get("password")), fromUri.password()));
        int database = databaseOverride != null
                ? databaseOverride
                : boundedDatabase(firstText(string(connection.get("redisDB")), string(options.get("redisDB")), string(connection.get("database")), String.valueOf(fromUri.database())));
        boolean useSsl = bool(connection.get("useSSL")) || fromUri.useSsl();
        int timeoutSeconds = positiveInt(firstText(string(connection.get("timeout")), string(options.get("timeout"))), 5);
        boolean explicitUriUsername = fromUri.explicitUriUsername();

        return endpoints.stream()
                .map(endpoint -> new RedisConfig(endpoint.host(), endpoint.port(), username, password, database, useSsl, timeoutSeconds, explicitUriUsername))
                .toList();
    }

    private List<RedisEndpoint> resolveEndpoints(Map<String, Object> connection, Map<String, Object> options, RedisConfig fromUri, int defaultPort) {
        List<RedisEndpoint> endpoints = new ArrayList<>();
        List<String> hostEntries = hostEntries(connection.get("hosts"));
        if (hostEntries.isEmpty()) {
            hostEntries = hostEntries(options.get("hosts"));
        }
        if (!hostEntries.isEmpty()) {
            for (String entry : hostEntries) {
                endpoints.add(parseEndpoint(entry, defaultPort));
            }
        } else {
            String host = firstText(string(connection.get("host")), fromUri.host(), "127.0.0.1");
            endpoints.add(new RedisEndpoint(host, defaultPort));
        }
        return endpoints.stream()
                .filter(endpoint -> !endpoint.host().isBlank())
                .distinct()
                .toList();
    }

    private static List<String> hostEntries(Object raw) {
        if (raw instanceof List<?> list) {
            return list.stream().map(RedisCompatibilityService::string).map(String::trim).filter(item -> !item.isBlank()).toList();
        }
        String text = string(raw).trim();
        if (text.isBlank()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String item : text.split(",")) {
            String trimmed = item.trim();
            if (!trimmed.isBlank()) {
                result.add(trimmed);
            }
        }
        return result;
    }

    private RedisEndpoint parseEndpoint(String raw, int defaultPort) {
        String value = firstText(raw, "127.0.0.1");
        if (value.startsWith("redis://") || value.startsWith("rediss://")) {
            RedisConfig parsed = parseUri(value);
            return new RedisEndpoint(parsed.host(), parsed.port());
        }
        String host = value;
        int port = defaultPort;
        int colon = value.lastIndexOf(':');
        if (colon > 0 && colon + 1 < value.length()) {
            String candidate = value.substring(colon + 1);
            try {
                port = Integer.parseInt(candidate);
                host = value.substring(0, colon);
            } catch (NumberFormatException ignored) {
                host = value;
            }
        }
        return new RedisEndpoint(host, port);
    }

    private RedisConfig parseUri(String rawUri) {
        if (rawUri == null || rawUri.isBlank()) {
            return RedisConfig.empty();
        }
        try {
            URI uri = URI.create(rawUri.trim());
            String scheme = firstText(uri.getScheme(), "redis").toLowerCase(Locale.ROOT);
            boolean ssl = "rediss".equals(scheme);
            String host = firstText(uri.getHost());
            int port = uri.getPort() > 0 ? uri.getPort() : (ssl ? 6380 : 6379);
            String username = "";
            String password = "";
            boolean explicitUsername = false;
            if (uri.getRawUserInfo() != null) {
                String userInfo = uri.getRawUserInfo();
                int colon = userInfo.indexOf(':');
                if (colon >= 0) {
                    username = decode(userInfo.substring(0, colon));
                    password = decode(userInfo.substring(colon + 1));
                    explicitUsername = !username.isBlank();
                } else {
                    password = decode(userInfo);
                }
            }
            int database = 0;
            String path = uri.getPath();
            if (path != null && path.length() > 1) {
                database = boundedDatabase(path.substring(1));
            }
            return new RedisConfig(host, port, username, password, database, ssl, 5, explicitUsername);
        } catch (RuntimeException ignored) {
            return RedisConfig.empty();
        }
    }

    private static String sanitizeRedisPassword(String password) {
        if (password == null || !password.contains("%")) {
            return password == null ? "" : password;
        }
        try {
            return URLDecoder.decode(password, StandardCharsets.UTF_8);
        } catch (RuntimeException ignored) {
            return password;
        }
    }

    private static List<String> parseRedisCommand(String command) {
        String normalized = command == null ? "" : command.trim();
        if (normalized.isEmpty()) {
            return List.of();
        }
        List<String> args = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuote = false;
        char quoteChar = 0;
        for (int index = 0; index < normalized.length(); index++) {
            char ch = normalized.charAt(index);
            if (inQuote) {
                if (ch == quoteChar) {
                    inQuote = false;
                    args.add(current.toString());
                    current.setLength(0);
                } else {
                    current.append(ch);
                }
            } else if (ch == '\'' || ch == '"') {
                inQuote = true;
                quoteChar = ch;
            } else if (Character.isWhitespace(ch)) {
                if (!current.isEmpty()) {
                    args.add(current.toString());
                    current.setLength(0);
                }
            } else {
                current.append(ch);
            }
        }
        if (!current.isEmpty()) {
            args.add(current.toString());
        }
        return args;
    }

    private static Map<String, String> parseInfo(String raw) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String line : raw.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            int colon = trimmed.indexOf(':');
            if (colon > 0) {
                result.put(trimmed.substring(0, colon), trimmed.substring(colon + 1));
            }
        }
        return result;
    }

    private static Map<Integer, Long> parseKeyspaceInfo(String raw) {
        Map<Integer, Long> result = new LinkedHashMap<>();
        for (String line : raw.split("\\R")) {
            String trimmed = line.trim();
            if (!trimmed.startsWith("db")) {
                continue;
            }
            int colon = trimmed.indexOf(':');
            if (colon < 3) {
                continue;
            }
            try {
                int index = Integer.parseInt(trimmed.substring(2, colon));
                for (String part : trimmed.substring(colon + 1).split(",")) {
                    if (part.startsWith("keys=")) {
                        result.put(index, Long.parseLong(part.substring("keys=".length())));
                        break;
                    }
                }
            } catch (NumberFormatException ignored) {
            }
        }
        return result;
    }

    private static boolean isGone(String type, long ttl) {
        return "none".equalsIgnoreCase(type) || ttl == -2;
    }

    private List<String> stringArgs(Object raw, String name) {
        Object value = raw;
        if (value instanceof Map<?, ?> map && map.get("values") != null) {
            value = map.get("values");
        }
        if (value instanceof List<?> list) {
            List<String> result = list.stream().map(RedisCompatibilityService::string).map(String::trim).filter(item -> !item.isBlank()).toList();
            if (!result.isEmpty()) {
                return result;
            }
        }
        String text = string(value).trim();
        if (!text.isBlank()) {
            return List.of(text);
        }
        throw new RedisOperationException(messages.message("redis.required", "name", name));
    }

    private String requiredText(Map<String, Object> input, String key) {
        String value = text(input, key);
        if (value.isBlank()) {
            throw new RedisOperationException(messages.message("redis.required", "name", key));
        }
        return value;
    }

    private static Map<String, Object> status(String message, Object... entries) {
        Map<String, Object> result = orderedMap("message", message, "ok", true, "timestamp", Instant.now().toEpochMilli());
        for (int index = 0; index + 1 < entries.length; index += 2) {
            result.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return result;
    }

    private static String parseCursor(Object value) {
        String text = string(value).trim();
        if (text.isBlank()) {
            return "0";
        }
        try {
            long parsed = Long.parseLong(text);
            return parsed < 0 ? "0" : String.valueOf(parsed);
        } catch (NumberFormatException ignored) {
            return "0";
        }
    }

    private static int boundedDatabase(String value) {
        int parsed = intValue(value, 0);
        return parsed < 0 || parsed > 15 ? 0 : parsed;
    }

    private static int positiveInt(Object value, int fallback) {
        int parsed = intValue(value, fallback);
        return parsed > 0 ? parsed : fallback;
    }

    private static int intValue(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            String text = string(value).trim();
            return text.isBlank() ? fallback : Integer.parseInt(text);
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static long longValue(Object value) {
        return longValue(value, 0);
    }

    private static long longValue(Object value, long fallback) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            String text = string(value).trim();
            return text.isBlank() ? fallback : Long.parseLong(text);
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static double doubleValue(Object value, double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            String text = string(value).trim();
            return text.isBlank() ? fallback : Double.parseDouble(text);
        } catch (RuntimeException ignored) {
            return fallback;
        }
    }

    private static boolean bool(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        return "true".equalsIgnoreCase(string(value));
    }

    private static String text(Map<String, Object> input, String key) {
        return string(value(input, key)).trim();
    }

    private static Object value(Map<String, Object> input, String key) {
        return input == null ? null : input.get(key);
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static String string(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> raw) {
            Map<String, Object> result = new LinkedHashMap<>();
            raw.forEach((key, mapValue) -> result.put(String.valueOf(key), mapValue));
            return result;
        }
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> list(Object value) {
        if (value instanceof List<?> raw) {
            return (List<Object>) raw;
        }
        return List.of();
    }

    private static List<String> stringList(Object value) {
        return list(value).stream().map(RedisCompatibilityService::string).toList();
    }

    private static List<Map<String, Object>> mapList(Object value) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list(value)) {
            Map<String, Object> map = map(item);
            if (!map.isEmpty()) {
                result.add(map);
            }
        }
        return result;
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    private static final class RedisConnection implements AutoCloseable {
        private final RedisConfig config;
        private final I18nMessages messages;
        private Socket socket;
        private InputStream input;
        private OutputStream output;

        private RedisConnection(RedisConfig config, I18nMessages messages) {
            this.config = config;
            this.messages = messages;
            connectWithLegacyFallback();
        }

        private RedisConfig config() {
            return config;
        }

        private void connectWithLegacyFallback() {
            try {
                openSocket(config.username());
            } catch (RedisOperationException error) {
                if (!shouldRetryWithoutRoot(error)) {
                    throw error;
                }
                closeQuietly();
                openSocket("");
            }
        }

        private boolean shouldRetryWithoutRoot(RedisOperationException error) {
            if (config.explicitUriUsername() || !"root".equals(config.username())) {
                return false;
            }
            String lower = error.getMessage().toLowerCase(Locale.ROOT);
            return lower.contains("wrongpass") || lower.contains("invalid username-password pair") || lower.contains("auth failed") || lower.contains("authentication failed") || lower.contains("wrong number of arguments for 'auth'");
        }

        private void openSocket(String username) {
            try {
                socket = config.useSsl() ? SSLSocketFactory.getDefault().createSocket() : new Socket();
                int timeoutMillis = Math.max(1, config.timeoutSeconds()) * 1000;
                socket.connect(new InetSocketAddress(config.host(), config.port()), timeoutMillis);
                socket.setSoTimeout(timeoutMillis);
                input = socket.getInputStream();
                output = socket.getOutputStream();
                if (!config.password().isBlank()) {
                    if (username == null || username.isBlank()) {
                        execute("AUTH", config.password());
                    } else {
                        execute("AUTH", username, config.password());
                    }
                }
                execute("SELECT", String.valueOf(config.database()));
            } catch (IOException error) {
                closeQuietly();
                throw new RedisOperationException(messages.message("redis.connectionFailed", "message", error.getMessage()), error);
            }
        }

        private Object execute(String... args) {
            return execute(List.of(args));
        }

        private Object execute(List<String> args) {
            if (args == null || args.isEmpty()) {
                throw new RedisOperationException(messages.message("redis.commandRequired"));
            }
            try {
                writeCommand(args);
                return readResponse();
            } catch (IOException error) {
                throw new RedisOperationException(messages.message("redis.commandFailed", "message", error.getMessage()), error);
            }
        }

        private void writeCommand(List<String> args) throws IOException {
            output.write(('*' + String.valueOf(args.size()) + "\r\n").getBytes(StandardCharsets.UTF_8));
            for (String arg : args) {
                byte[] bytes = (arg == null ? "" : arg).getBytes(StandardCharsets.UTF_8);
                output.write(('$' + String.valueOf(bytes.length) + "\r\n").getBytes(StandardCharsets.UTF_8));
                output.write(bytes);
                output.write("\r\n".getBytes(StandardCharsets.UTF_8));
            }
            output.flush();
        }

        private Object readResponse() throws IOException {
            int prefix = input.read();
            if (prefix == -1) {
                throw new EOFException("Redis closed the connection");
            }
            return switch (prefix) {
                case '+' -> readLine();
                case '-' -> throw new RedisOperationException(readLine());
                case ':' -> Long.parseLong(readLine());
                case '$' -> readBulkString();
                case '*' -> readArray();
                default -> throw new RedisOperationException("Unsupported RESP prefix: " + (char) prefix);
            };
        }

        private String readBulkString() throws IOException {
            int length = Integer.parseInt(readLine());
            if (length < 0) {
                return null;
            }
            byte[] bytes = input.readNBytes(length);
            if (bytes.length != length) {
                throw new EOFException("Incomplete Redis bulk string");
            }
            expectCrlf();
            return new String(bytes, StandardCharsets.UTF_8);
        }

        private List<Object> readArray() throws IOException {
            int length = Integer.parseInt(readLine());
            if (length < 0) {
                return List.of();
            }
            List<Object> values = new ArrayList<>(length);
            for (int index = 0; index < length; index++) {
                values.add(readResponse());
            }
            return values;
        }

        private String readLine() throws IOException {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            int previous = -1;
            while (true) {
                int current = input.read();
                if (current == -1) {
                    throw new EOFException("Redis closed the connection");
                }
                if (previous == '\r' && current == '\n') {
                    byte[] bytes = buffer.toByteArray();
                    return new String(bytes, 0, bytes.length - 1, StandardCharsets.UTF_8);
                }
                buffer.write(current);
                previous = current;
            }
        }

        private void expectCrlf() throws IOException {
            int cr = input.read();
            int lf = input.read();
            if (cr != '\r' || lf != '\n') {
                throw new IOException("Invalid Redis bulk terminator");
            }
        }

        @Override
        public void close() {
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                }
            }
        }

        private void closeQuietly() {
            close();
        }
    }

    private record RedisEndpoint(String host, int port) {
    }

    private record RedisConfig(String host, int port, String username, String password, int database, boolean useSsl, int timeoutSeconds, boolean explicitUriUsername) {
        private static RedisConfig empty() {
            return new RedisConfig("", 6379, "", "", 0, false, 5, false);
        }

        private String address() {
            return host + ":" + port;
        }
    }

    public static class RedisOperationException extends RuntimeException {
        public RedisOperationException(String message) {
            super(message);
        }

        public RedisOperationException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
