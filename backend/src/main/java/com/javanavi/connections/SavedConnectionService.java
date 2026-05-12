package com.javanavi.connections;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.SavedConnectionInputDto;
import com.javanavi.model.SavedConnectionViewDto;
import com.javanavi.security.SecretStore;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class SavedConnectionService {
    private static final TypeReference<List<StoredConnection>> STORED_CONNECTIONS = new TypeReference<>() {};
    private static final String SECRET_PREFIX = "connection:";
    public static final String METADATA_CATALOG_OPTION = "javanaviMetadataCatalog";
    public static final String METADATA_SCHEMA_OPTION = "javanaviMetadataSchema";
    public static final String METADATA_SCOPE_NULL_VALUE = "__javanavi_null__";

    private final ObjectMapper objectMapper;
    private final SecretStore secretStore;
    private final Path connectionsFile;

    public SavedConnectionService(SecurityProperties properties, ObjectMapper objectMapper, SecretStore secretStore) {
        this.objectMapper = objectMapper;
        this.secretStore = secretStore;
        Path directory = Path.of(properties.getDataDirectory()).toAbsolutePath().normalize();
        this.connectionsFile = directory.resolve("connections.json");
    }

    public synchronized List<SavedConnectionViewDto> list() {
        return readAll().stream()
                .sorted(Comparator.comparing(StoredConnection::createdAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(this::toView)
                .toList();
    }

    public synchronized SavedConnectionViewDto save(SavedConnectionInputDto input) {
        if (input == null) {
            throw new IllegalArgumentException("Connection payload is required.");
        }
        List<StoredConnection> connections = new ArrayList<>(readAll());
        String id = sanitizeId(firstText(input.id(), mapText(input.config(), "id"), "conn-" + UUID.randomUUID().toString().substring(0, 8)));
        StoredConnection existing = find(connections, id).orElse(null);
        Map<String, Object> rawConfig = input.config() == null ? new LinkedHashMap<>() : deepCopyMap(input.config());
        rawConfig.put("id", id);

        boolean hasPrimaryPassword = updateSecret(id, "primaryPassword", stringAt(rawConfig, "password"), input.clearPrimaryPassword(), existing == null ? false : existing.hasPrimaryPassword());
        boolean hasSSHPassword = updateSecret(id, "sshPassword", stringAt(rawConfig, "ssh", "password"), input.clearSSHPassword(), existing == null ? false : existing.hasSSHPassword());
        boolean hasProxyPassword = updateSecret(id, "proxyPassword", stringAt(rawConfig, "proxy", "password"), input.clearProxyPassword(), existing == null ? false : existing.hasProxyPassword());
        boolean hasHttpTunnelPassword = updateSecret(id, "httpTunnelPassword", stringAt(rawConfig, "httpTunnel", "password"), input.clearHttpTunnelPassword(), existing == null ? false : existing.hasHttpTunnelPassword());
        boolean hasMySQLReplicaPassword = updateSecret(id, "mysqlReplicaPassword", stringAt(rawConfig, "mysqlReplicaPassword"), input.clearMySQLReplicaPassword(), existing == null ? false : existing.hasMySQLReplicaPassword());
        boolean hasMongoReplicaPassword = updateSecret(id, "mongoReplicaPassword", stringAt(rawConfig, "mongoReplicaPassword"), input.clearMongoReplicaPassword(), existing == null ? false : existing.hasMongoReplicaPassword());
        boolean hasOpaqueURI = updateSecret(id, "opaqueURI", stringAt(rawConfig, "uri"), input.clearOpaqueURI(), existing == null ? false : existing.hasOpaqueURI());
        boolean hasOpaqueDSN = updateSecret(id, "opaqueDSN", stringAt(rawConfig, "dsn"), input.clearOpaqueDSN(), existing == null ? false : existing.hasOpaqueDSN());

        redactStoredSecrets(rawConfig);

        StoredConnection next = new StoredConnection(
                id,
                firstText(input.name(), existing == null ? null : existing.name(), id),
                rawConfig,
                safeStringList(input.includeDatabases()),
                safeIntegerList(input.includeRedisDatabases()),
                textOrNull(input.iconType()),
                textOrNull(input.iconColor()),
                secretRef(id),
                hasPrimaryPassword,
                hasSSHPassword,
                hasProxyPassword,
                hasHttpTunnelPassword,
                hasMySQLReplicaPassword,
                hasMongoReplicaPassword,
                hasOpaqueURI,
                hasOpaqueDSN,
                existing == null ? Instant.now() : existing.createdAt(),
                Instant.now()
        );

        connections.removeIf(item -> item.id().equals(id));
        connections.add(next);
        writeAll(connections);
        return toView(next);
    }

    public synchronized Optional<SavedConnectionViewDto> rememberMetadataScope(ConnectionConfigDto config, String catalog, String schema) {
        if (config == null) {
            return Optional.empty();
        }
        String id = firstText(config.id(), config.name());
        if (id == null) {
            return Optional.empty();
        }
        String connectionId = sanitizeId(id);
        List<StoredConnection> connections = new ArrayList<>(readAll());
        StoredConnection existing = find(connections, connectionId).orElse(null);
        if (existing == null) {
            return Optional.empty();
        }

        Map<String, Object> nextConfig = deepCopyMap(existing.config());
        Map<String, Object> options = mapValue(nextConfig.get("options"));
        String nextCatalog = metadataScopeOptionValue(catalog);
        String nextSchema = metadataScopeOptionValue(schema);
        if (nextCatalog.equals(String.valueOf(options.get(METADATA_CATALOG_OPTION)))
                && nextSchema.equals(String.valueOf(options.get(METADATA_SCHEMA_OPTION)))) {
            return Optional.of(toView(existing));
        }
        options.put(METADATA_CATALOG_OPTION, nextCatalog);
        options.put(METADATA_SCHEMA_OPTION, nextSchema);
        nextConfig.put("options", options);

        StoredConnection next = new StoredConnection(
                existing.id(),
                existing.name(),
                nextConfig,
                existing.includeDatabases(),
                existing.includeRedisDatabases(),
                existing.iconType(),
                existing.iconColor(),
                existing.secretRef(),
                existing.hasPrimaryPassword(),
                existing.hasSSHPassword(),
                existing.hasProxyPassword(),
                existing.hasHttpTunnelPassword(),
                existing.hasMySQLReplicaPassword(),
                existing.hasMongoReplicaPassword(),
                existing.hasOpaqueURI(),
                existing.hasOpaqueDSN(),
                existing.createdAt(),
                Instant.now()
        );

        connections.removeIf(item -> item.id().equals(connectionId));
        connections.add(next);
        writeAll(connections);
        return Optional.of(toView(next));
    }

    public synchronized Optional<MetadataScopeMemory> readMetadataScope(ConnectionConfigDto config) {
        if (config == null) {
            return Optional.empty();
        }
        String id = firstText(config.id(), config.name());
        if (id == null) {
            return Optional.empty();
        }
        return find(readAll(), sanitizeId(id))
                .flatMap(connection -> metadataScopeMemory(mapValue(connection.config().get("options"))));
    }

    public synchronized boolean delete(String id) {
        String connectionId = requireId(id);
        List<StoredConnection> connections = new ArrayList<>(readAll());
        boolean removed = connections.removeIf(item -> item.id().equals(connectionId));
        if (removed) {
            deleteSecrets(connectionId);
            writeAll(connections);
        }
        return removed;
    }

    public synchronized SavedConnectionViewDto duplicate(String id) {
        String sourceId = requireId(id);
        StoredConnection source = find(readAll(), sourceId)
                .orElseThrow(() -> new IllegalArgumentException("Saved connection not found: " + sourceId));
        String nextId = uniqueDuplicateId(sourceId);
        Map<String, Object> config = deepCopyMap(source.config());
        config.put("id", nextId);
        copySecrets(sourceId, nextId);
        StoredConnection duplicate = new StoredConnection(
                nextId,
                source.name() + " Copy",
                config,
                source.includeDatabases(),
                source.includeRedisDatabases(),
                source.iconType(),
                source.iconColor(),
                secretRef(nextId),
                source.hasPrimaryPassword(),
                source.hasSSHPassword(),
                source.hasProxyPassword(),
                source.hasHttpTunnelPassword(),
                source.hasMySQLReplicaPassword(),
                source.hasMongoReplicaPassword(),
                source.hasOpaqueURI(),
                source.hasOpaqueDSN(),
                Instant.now(),
                Instant.now()
        );
        List<StoredConnection> connections = new ArrayList<>(readAll());
        connections.add(duplicate);
        writeAll(connections);
        return toView(duplicate);
    }

    public synchronized List<Map<String, Object>> exportPackageItems(boolean includeSecrets) {
        return readAll().stream()
                .sorted(Comparator.comparing(StoredConnection::createdAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(connection -> exportPackageItem(connection, includeSecrets))
                .toList();
    }

    public synchronized List<SavedConnectionViewDto> importPackageItems(List<Map<String, Object>> items) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        List<SavedConnectionViewDto> views = new ArrayList<>();
        for (Map<String, Object> item : items) {
            views.add(save(packageItemToInput(item)));
        }
        return views;
    }

    public ConnectionConfigDto resolveSavedSecret(ConnectionConfigDto config) {
        if (config == null) {
            return config;
        }
        String id = firstText(config.id(), config.name());
        if (id == null) {
            return config;
        }
        String sanitizedId = sanitizeId(id);
        Optional<String> password = config.password() == null || config.password().isBlank()
                ? secretStore.get(secretKey(sanitizedId, "primaryPassword"))
                : Optional.empty();
        Optional<String> sshPassword = config.effectiveSsh() != null && isBlankString(config.effectiveSsh().password())
                ? secretStore.get(secretKey(sanitizedId, "sshPassword"))
                : Optional.empty();
        Optional<String> proxyPassword = config.proxy() != null && isBlankString(config.proxy().password())
                ? secretStore.get(secretKey(sanitizedId, "proxyPassword"))
                : Optional.empty();
        Optional<String> httpTunnelPassword = config.httpTunnel() != null && isBlankString(config.httpTunnel().password())
                ? secretStore.get(secretKey(sanitizedId, "httpTunnelPassword"))
                : Optional.empty();
        Optional<String> mongoReplicaPassword = config.mongoReplicaPassword() == null || config.mongoReplicaPassword().isBlank()
                ? secretStore.get(secretKey(sanitizedId, "mongoReplicaPassword"))
                : Optional.empty();
        Optional<String> uri = config.uri() == null || config.uri().isBlank()
                ? secretStore.get(secretKey(sanitizedId, "opaqueURI"))
                : Optional.empty();
        Optional<String> dsn = config.dsn() == null || config.dsn().isBlank()
                ? secretStore.get(secretKey(sanitizedId, "opaqueDSN"))
                : Optional.empty();
        if (password.isEmpty()
                && sshPassword.isEmpty()
                && proxyPassword.isEmpty()
                && httpTunnelPassword.isEmpty()
                && mongoReplicaPassword.isEmpty()
                && uri.isEmpty()
                && dsn.isEmpty()) {
            return config;
        }
        ConnectionConfigDto.NetworkCredentialConfigDto ssh = config.effectiveSsh();
        ConnectionConfigDto.NetworkProxyConfigDto proxy = config.proxy();
        ConnectionConfigDto.NetworkHttpTunnelConfigDto httpTunnel = config.httpTunnel();
        return new ConnectionConfigDto(
                config.id(),
                config.name(),
                config.driverType(),
                config.driver(),
                config.host(),
                config.port(),
                config.database(),
                config.username(),
                password.orElse(config.password()),
                config.options(),
                config.timeout(),
                config.useSSL(),
                config.sslMode(),
                config.useSSH(),
                sshPassword.map(value -> new ConnectionConfigDto.NetworkCredentialConfigDto(
                        ssh.host(), ssh.port(), ssh.user(), value, ssh.keyPath()
                )).orElse(config.ssh()),
                config.sshConfig(),
                config.useProxy(),
                proxyPassword.map(value -> new ConnectionConfigDto.NetworkProxyConfigDto(
                        proxy.type(), proxy.host(), proxy.port(), proxy.user(), value
                )).orElse(proxy),
                config.useHttpTunnel(),
                httpTunnelPassword.map(value -> new ConnectionConfigDto.NetworkHttpTunnelConfigDto(
                        httpTunnel.host(), httpTunnel.port(), httpTunnel.user(), value
                )).orElse(httpTunnel),
                uri.orElse(config.uri()),
                dsn.orElse(config.dsn()),
                config.hosts(),
                config.topology(),
                config.replicaSet(),
                config.authSource(),
                config.readPreference(),
                config.mongoSrv(),
                config.mongoAuthMechanism(),
                config.mongoReplicaUser(),
                mongoReplicaPassword.orElse(config.mongoReplicaPassword())
        );
    }

    private Map<String, Object> exportPackageItem(StoredConnection connection, boolean includeSecrets) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", connection.id());
        item.put("name", connection.name());
        putIfNotNull(item, "includeDatabases", connection.includeDatabases());
        putIfNotNull(item, "includeRedisDatabases", connection.includeRedisDatabases());
        putIfNotNull(item, "iconType", connection.iconType());
        putIfNotNull(item, "iconColor", connection.iconColor());
        item.put("config", deepCopyMap(connection.config()));
        if (includeSecrets) {
            Map<String, Object> secrets = exportSecretBundle(connection.id());
            if (!secrets.isEmpty()) {
                item.put("secrets", secrets);
            }
        }
        return item;
    }

    private Map<String, Object> exportSecretBundle(String connectionId) {
        Map<String, Object> secrets = new LinkedHashMap<>();
        putSecret(secrets, "password", connectionId, "primaryPassword");
        putSecret(secrets, "sshPassword", connectionId, "sshPassword");
        putSecret(secrets, "proxyPassword", connectionId, "proxyPassword");
        putSecret(secrets, "httpTunnelPassword", connectionId, "httpTunnelPassword");
        putSecret(secrets, "mysqlReplicaPassword", connectionId, "mysqlReplicaPassword");
        putSecret(secrets, "mongoReplicaPassword", connectionId, "mongoReplicaPassword");
        putSecret(secrets, "opaqueURI", connectionId, "opaqueURI");
        putSecret(secrets, "opaqueDSN", connectionId, "opaqueDSN");
        return secrets;
    }

    @SuppressWarnings("unchecked")
    private SavedConnectionInputDto packageItemToInput(Map<String, Object> item) {
        if (item == null) {
            throw new IllegalArgumentException("Connection package item is required.");
        }
        Map<String, Object> config = item.get("config") instanceof Map<?, ?> configMap
                ? deepCopyMap((Map<String, Object>) configMap)
                : new LinkedHashMap<>();
        String id = firstText(mapText(item, "id"), mapText(config, "id"), "conn-" + UUID.randomUUID().toString().substring(0, 8));
        config.put("id", id);

        Map<String, Object> secrets = item.get("secrets") instanceof Map<?, ?> secretMap
                ? deepCopyMap((Map<String, Object>) secretMap)
                : Map.of();
        applyPackageSecrets(config, secrets);

        return new SavedConnectionInputDto(
                id,
                firstText(mapText(item, "name"), id),
                config,
                safeStringListFromObject(item.get("includeDatabases")),
                safeIntegerListFromObject(item.get("includeRedisDatabases")),
                mapText(item, "iconType"),
                mapText(item, "iconColor"),
                !secrets.containsKey("password") && isBlankString(config.get("password")),
                !secrets.containsKey("sshPassword") && isBlankNested(config, "ssh", "password"),
                !secrets.containsKey("proxyPassword") && isBlankNested(config, "proxy", "password"),
                !secrets.containsKey("httpTunnelPassword") && isBlankNested(config, "httpTunnel", "password"),
                !secrets.containsKey("mysqlReplicaPassword") && isBlankString(config.get("mysqlReplicaPassword")),
                !secrets.containsKey("mongoReplicaPassword") && isBlankString(config.get("mongoReplicaPassword")),
                !secrets.containsKey("opaqueURI") && isBlankString(config.get("uri")),
                !secrets.containsKey("opaqueDSN") && isBlankString(config.get("dsn"))
        );
    }

    private static void putIfNotNull(Map<String, Object> target, String key, Object value) {
        if (value != null) {
            target.put(key, value);
        }
    }

    private void putSecret(Map<String, Object> target, String packageField, String connectionId, String secretName) {
        secretStore.get(secretKey(connectionId, secretName))
                .filter(value -> !value.isBlank())
                .ifPresent(value -> target.put(packageField, value));
    }

    @SuppressWarnings("unchecked")
    private static void applyPackageSecrets(Map<String, Object> config, Map<String, Object> secrets) {
        putSecretValue(config, "password", secrets.get("password"));
        putNestedSecretValue(config, "ssh", "password", secrets.get("sshPassword"));
        putNestedSecretValue(config, "proxy", "password", secrets.get("proxyPassword"));
        putNestedSecretValue(config, "httpTunnel", "password", secrets.get("httpTunnelPassword"));
        putSecretValue(config, "mysqlReplicaPassword", secrets.get("mysqlReplicaPassword"));
        putSecretValue(config, "mongoReplicaPassword", secrets.get("mongoReplicaPassword"));
        putSecretValue(config, "uri", secrets.get("opaqueURI"));
        putSecretValue(config, "dsn", secrets.get("opaqueDSN"));
    }

    private static void putSecretValue(Map<String, Object> config, String key, Object value) {
        String text = textOrNull(value == null ? null : String.valueOf(value));
        if (text != null) {
            config.put(key, text);
        }
    }

    @SuppressWarnings("unchecked")
    private static void putNestedSecretValue(Map<String, Object> config, String parent, String key, Object value) {
        String text = textOrNull(value == null ? null : String.valueOf(value));
        if (text == null) {
            return;
        }
        Object nested = config.get(parent);
        Map<String, Object> nestedMap;
        if (nested instanceof Map<?, ?> map) {
            nestedMap = (Map<String, Object>) map;
        } else {
            nestedMap = new LinkedHashMap<>();
            config.put(parent, nestedMap);
        }
        nestedMap.put(key, text);
    }

    private static boolean isBlankString(Object value) {
        return value == null || String.valueOf(value).isBlank();
    }

    @SuppressWarnings("unchecked")
    private static boolean isBlankNested(Map<String, Object> config, String parent, String key) {
        Object nested = config.get(parent);
        if (!(nested instanceof Map<?, ?> map)) {
            return true;
        }
        return isBlankString(((Map<String, Object>) map).get(key));
    }

    private static List<String> safeStringListFromObject(Object value) {
        if (!(value instanceof List<?> list)) {
            return null;
        }
        return safeStringList(list.stream().map(item -> item == null ? null : String.valueOf(item)).toList());
    }

    private static List<Integer> safeIntegerListFromObject(Object value) {
        if (!(value instanceof List<?> list)) {
            return null;
        }
        List<Integer> parsed = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Number number) {
                parsed.add(number.intValue());
                continue;
            }
            try {
                parsed.add(Integer.parseInt(String.valueOf(item)));
            } catch (NumberFormatException ignored) {
                // Ignore values that cannot map to JavaNavi Redis database indexes.
            }
        }
        return safeIntegerList(parsed);
    }

    private Optional<StoredConnection> find(List<StoredConnection> connections, String id) {
        return connections.stream().filter(item -> item.id().equals(id)).findFirst();
    }

    private String uniqueDuplicateId(String sourceId) {
        List<StoredConnection> connections = readAll();
        String base = sanitizeId(sourceId) + "-copy";
        String candidate = base;
        int index = 2;
        while (find(connections, candidate).isPresent()) {
            candidate = base + "-" + index++;
        }
        return candidate;
    }

    private SavedConnectionViewDto toView(StoredConnection stored) {
        return new SavedConnectionViewDto(
                stored.id(),
                stored.name(),
                deepCopyMap(stored.config()),
                stored.includeDatabases(),
                stored.includeRedisDatabases(),
                stored.iconType(),
                stored.iconColor(),
                stored.secretRef(),
                stored.hasPrimaryPassword(),
                stored.hasSSHPassword(),
                stored.hasProxyPassword(),
                stored.hasHttpTunnelPassword(),
                stored.hasMySQLReplicaPassword(),
                stored.hasMongoReplicaPassword(),
                stored.hasOpaqueURI(),
                stored.hasOpaqueDSN()
        );
    }

    private boolean updateSecret(String connectionId, String secretName, String value, Boolean clear, boolean existingHasSecret) {
        String key = secretKey(connectionId, secretName);
        if (value != null && !value.isBlank()) {
            secretStore.put(key, value);
            return true;
        }
        if (Boolean.TRUE.equals(clear)) {
            secretStore.delete(key);
            return false;
        }
        return existingHasSecret;
    }

    private void copySecrets(String sourceId, String targetId) {
        for (String name : secretNames()) {
            secretStore.get(secretKey(sourceId, name)).ifPresent(value -> secretStore.put(secretKey(targetId, name), value));
        }
    }

    private void deleteSecrets(String connectionId) {
        for (String name : secretNames()) {
            secretStore.delete(secretKey(connectionId, name));
        }
    }

    private static List<String> secretNames() {
        return List.of(
                "primaryPassword",
                "sshPassword",
                "proxyPassword",
                "httpTunnelPassword",
                "mysqlReplicaPassword",
                "mongoReplicaPassword",
                "opaqueURI",
                "opaqueDSN"
        );
    }

    private static String secretKey(String connectionId, String secretName) {
        return SECRET_PREFIX + sanitizeId(connectionId) + ":" + secretName;
    }

    private static String secretRef(String connectionId) {
        return SECRET_PREFIX + sanitizeId(connectionId);
    }

    private List<StoredConnection> readAll() {
        try {
            if (!Files.exists(connectionsFile)) {
                return new ArrayList<>();
            }
            String text = Files.readString(connectionsFile, StandardCharsets.UTF_8);
            if (text.isBlank()) {
                return new ArrayList<>();
            }
            List<StoredConnection> connections = objectMapper.readValue(text, STORED_CONNECTIONS);
            return connections == null ? new ArrayList<>() : new ArrayList<>(connections);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JavaNavi saved connections.", error);
        }
    }

    private void writeAll(List<StoredConnection> connections) {
        try {
            Files.createDirectories(connectionsFile.getParent());
            byte[] json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(connections);
            Files.write(connectionsFile, json);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi saved connections.", error);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> deepCopyMap(Map<String, Object> value) {
        if (value == null) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(value, LinkedHashMap.class);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            return objectMapper.convertValue((Map<String, Object>) map, LinkedHashMap.class);
        }
        return new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    private static void redactStoredSecrets(Map<String, Object> config) {
        config.put("password", "");
        Object ssh = config.get("ssh");
        if (ssh instanceof Map<?, ?> sshMap) {
            ((Map<String, Object>) sshMap).put("password", "");
        }
        Object proxy = config.get("proxy");
        if (proxy instanceof Map<?, ?> proxyMap) {
            ((Map<String, Object>) proxyMap).put("password", "");
        }
        Object httpTunnel = config.get("httpTunnel");
        if (httpTunnel instanceof Map<?, ?> httpTunnelMap) {
            ((Map<String, Object>) httpTunnelMap).put("password", "");
        }
        config.put("mysqlReplicaPassword", "");
        config.put("mongoReplicaPassword", "");
        config.put("uri", "");
        config.put("dsn", "");
    }

    private static String requireId(String id) {
        String value = firstText(id);
        if (value == null) {
            throw new IllegalArgumentException("Connection id is required.");
        }
        return sanitizeId(value);
    }

    private static String sanitizeId(String value) {
        String sanitized = value == null ? "" : value.trim().replaceAll("[^A-Za-z0-9_.:@-]", "-");
        if (sanitized.isBlank()) {
            throw new IllegalArgumentException("Connection id is required.");
        }
        return sanitized.length() > 96 ? sanitized.substring(0, 96) : sanitized;
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static String textOrNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String metadataScopeOptionValue(String value) {
        String text = textOrNull(value);
        return text == null ? METADATA_SCOPE_NULL_VALUE : text;
    }

    private static Optional<MetadataScopeMemory> metadataScopeMemory(Map<String, Object> options) {
        if (options == null
                || !options.containsKey(METADATA_CATALOG_OPTION)
                || !options.containsKey(METADATA_SCHEMA_OPTION)) {
            return Optional.empty();
        }
        return Optional.of(new MetadataScopeMemory(
                metadataScopeValue(options.get(METADATA_CATALOG_OPTION)),
                metadataScopeValue(options.get(METADATA_SCHEMA_OPTION))
        ));
    }

    private static String metadataScopeValue(Object value) {
        if (value == null) {
            return null;
        }
        String text = textOrNull(String.valueOf(value));
        if (text == null || METADATA_SCOPE_NULL_VALUE.equals(text)) {
            return null;
        }
        return text;
    }

    private static String mapText(Map<String, Object> value, String key) {
        if (value == null || value.get(key) == null) {
            return null;
        }
        return String.valueOf(value.get(key));
    }

    @SuppressWarnings("unchecked")
    private static String stringAt(Map<String, Object> value, String... path) {
        Object current = value;
        for (String segment : path) {
            if (!(current instanceof Map<?, ?> map)) {
                return null;
            }
            current = ((Map<String, Object>) map).get(segment);
        }
        if (current == null) {
            return null;
        }
        return String.valueOf(current);
    }

    private static List<String> safeStringList(List<String> values) {
        if (values == null) {
            return null;
        }
        List<String> result = values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
        return result.isEmpty() ? null : result;
    }

    private static List<Integer> safeIntegerList(List<Integer> values) {
        if (values == null) {
            return null;
        }
        List<Integer> result = values.stream()
                .filter(value -> value != null && value >= 0 && value <= 15)
                .distinct()
                .toList();
        return result.isEmpty() ? null : result;
    }

    public record StoredConnection(
            String id,
            String name,
            Map<String, Object> config,
            List<String> includeDatabases,
            List<Integer> includeRedisDatabases,
            String iconType,
            String iconColor,
            String secretRef,
            boolean hasPrimaryPassword,
            boolean hasSSHPassword,
            boolean hasProxyPassword,
            boolean hasHttpTunnelPassword,
            boolean hasMySQLReplicaPassword,
            boolean hasMongoReplicaPassword,
            boolean hasOpaqueURI,
            boolean hasOpaqueDSN,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record MetadataScopeMemory(String catalog, String schema) {
    }
}
