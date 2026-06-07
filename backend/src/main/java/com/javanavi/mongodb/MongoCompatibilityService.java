package com.javanavi.mongodb;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApplyChangesResultDto;
import com.javanavi.model.ChangeSetDto;
import com.javanavi.model.ColumnDefinitionDto;
import com.javanavi.model.ColumnDefinitionWithTableDto;
import com.javanavi.db.NetworkSocketConnector;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.model.ConnectionTestResultDto;
import com.javanavi.model.ForeignKeyDefinitionDto;
import com.javanavi.model.IndexDefinitionDto;
import com.javanavi.model.MongoContracts;
import com.javanavi.model.QueryResultDto;
import com.javanavi.model.ResultSetDataDto;
import com.javanavi.model.TableSummaryDto;
import com.javanavi.model.TriggerDefinitionDto;
import com.javanavi.model.UpdateRowDto;
import com.javanavi.security.SecretRedactor;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

@Service
public class MongoCompatibilityService {
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, Object>> COMMAND_TYPE = new TypeReference<>() {
    };
    private static final int OP_MSG = 2013;
    private static final int DEFAULT_PORT = 27017;
    static final String DEFAULT_SSL_MODE = "required";
    private static final int DEFAULT_TIMEOUT_MS = 1500;
    private static final NetworkSocketConnector NETWORK_CONNECTOR = new NetworkSocketConnector();
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final I18nMessages messages;

    public MongoCompatibilityService(I18nMessages messages) {
        this.messages = messages;
    }

    public boolean isMongo(ConnectionConfigDto config) {
        return "mongodb".equals(driverType(config));
    }

    public ConnectionTestResultDto testConnection(ConnectionConfigDto config) {
        if (config == null) {
            return new ConnectionTestResultDto(null, "mongodb", false, messages.message("mongodb.configRequired"));
        }
        String host = mongoHost(config);
        int port = mongoPort(config);
        if (shouldSkipProbe(host)) {
            return new ConnectionTestResultDto(
                    config.id(),
                    "mongodb",
                    false,
                    messages.message("mongodb.skipExampleHost")
            );
        }
        try {
            runCommand(config, "admin", orderedMap("ping", 1));
            return new ConnectionTestResultDto(config.id(), "mongodb", true, messages.message("common.connectionSucceeded"));
        } catch (IllegalArgumentException error) {
            return new ConnectionTestResultDto(config.id(), "mongodb", false, SecretRedactor.redact(error.getMessage()));
        }
    }

    public List<String> listDatabases(ConnectionConfigDto config) {
        Map<String, Object> response = runCommand(config, "admin", orderedMap("listDatabases", 1, "nameOnly", true));
        List<String> names = new ArrayList<>();
        for (Object item : listValue(response.get("databases"))) {
            if (item instanceof Map<?, ?> map) {
                String name = text(map.get("name"));
                if (!name.isBlank()) {
                    names.add(name);
                }
            }
        }
        if (names.isEmpty()) {
            names.add(firstText(config == null ? null : config.database(), "admin"));
        }
        names.sort(String::compareToIgnoreCase);
        return names;
    }

    public List<TableSummaryDto> listTables(ConnectionConfigDto config, String requestedDatabase) {
        String database = mongoDatabase(config, requestedDatabase);
        Map<String, Object> response = runCommand(config, database, orderedMap("listCollections", 1, "nameOnly", true));
        List<TableSummaryDto> tables = new ArrayList<>();
        for (Object item : cursorBatch(response)) {
            if (item instanceof Map<?, ?> map) {
                String name = text(map.get("name"));
                if (!name.isBlank() && !name.startsWith("system.")) {
                    String type = firstText(text(map.get("type")), "collection").toUpperCase(Locale.ROOT);
                    tables.add(new TableSummaryDto(database, name, type));
                }
            }
        }
        tables.sort(Comparator.comparing(TableSummaryDto::tableName, String.CASE_INSENSITIVE_ORDER));
        return tables;
    }

    public List<ColumnDefinitionDto> listColumns(ConnectionConfigDto config, String requestedDatabase, String tableName) {
        String collection = requireText(tableName, "collection");
        List<ColumnDefinitionDto> fromSchema = columnsFromJsonSchema(config, requestedDatabase, collection);
        if (!fromSchema.isEmpty()) {
            return fromSchema;
        }
        return columnsFromSampleDocuments(config, requestedDatabase, collection, 50);
    }

    public List<ColumnDefinitionWithTableDto> listAllColumns() {
        return List.of();
    }

    private List<ColumnDefinitionDto> columnsFromJsonSchema(ConnectionConfigDto config, String requestedDatabase, String collection) {
        Map<String, Object> response = runCommand(config, mongoDatabase(config, requestedDatabase), orderedMap(
                "listCollections", 1,
                "filter", orderedMap("name", collection)
        ));
        for (Object item : cursorBatch(response)) {
            if (!(item instanceof Map<?, ?> rawCollection)) {
                continue;
            }
            Map<String, Object> collectionMap = toStringMap(rawCollection);
            Map<String, Object> options = mapValue(collectionMap.get("options"));
            Map<String, Object> validator = mapValue(options.get("validator"));
            Map<String, Object> jsonSchema = mapValue(validator.get("$jsonSchema"));
            if (jsonSchema.isEmpty()) {
                continue;
            }
            Map<String, FieldStats> stats = new LinkedHashMap<>();
            appendJsonSchemaFields(stats, "", jsonSchema, false);
            return sortedColumnDefinitions(stats);
        }
        return List.of();
    }

    private List<ColumnDefinitionDto> columnsFromSampleDocuments(ConnectionConfigDto config, String requestedDatabase, String collection, int sampleLimit) {
        Map<String, Object> response = runCommand(config, mongoDatabase(config, requestedDatabase), orderedMap(
                "find", collection,
                "limit", sampleLimit
        ));
        Map<String, FieldStats> stats = new LinkedHashMap<>();
        int documentCount = 0;
        for (Object item : cursorBatch(response)) {
            if (!(item instanceof Map<?, ?> rawDocument)) {
                continue;
            }
            documentCount++;
            Set<String> seenInDocument = new LinkedHashSet<>();
            Map<String, Object> document = toStringMap(rawDocument);
            for (Map.Entry<String, Object> entry : document.entrySet()) {
                appendSampleField(stats, entry.getKey(), entry.getValue(), seenInDocument);
            }
        }
        if (documentCount == 0) {
            return List.of();
        }
        final int totalDocuments = documentCount;
        stats.values().forEach(field -> field.setTotalDocuments(totalDocuments));
        return sortedColumnDefinitions(stats);
    }

    private void appendJsonSchemaFields(Map<String, FieldStats> stats, String parentPath, Map<String, Object> schema, boolean required) {
        Map<String, Object> properties = mapValue(schema.get("properties"));
        Set<String> requiredFields = stringSet(schema.get("required"));
        if (!parentPath.isBlank()) {
            registerSchemaField(stats, parentPath, schema, required);
        }
        if (!properties.isEmpty()) {
            for (Map.Entry<String, Object> entry : properties.entrySet()) {
                String fieldName = text(entry.getKey());
                if (fieldName.isBlank()) {
                    continue;
                }
                Map<String, Object> propertySchema = mapValue(entry.getValue());
                if (propertySchema.isEmpty()) {
                    registerFieldType(stats, joinPath(parentPath, fieldName), "unknown", requiredFields.contains(fieldName), false);
                    continue;
                }
                appendJsonSchemaFields(stats, joinPath(parentPath, fieldName), propertySchema, requiredFields.contains(fieldName));
            }
        }

        List<String> schemaTypes = normalizedSchemaTypes(schema);
        boolean arrayType = schemaTypes.contains("array");
        if (arrayType && !parentPath.isBlank()) {
            Map<String, Object> itemSchema = mapValue(schema.get("items"));
            if (itemSchema.isEmpty()) {
                return;
            }
            String arrayPath = parentPath + "[]";
            appendJsonSchemaArrayItems(stats, arrayPath, itemSchema, required);
        }
    }

    private void appendJsonSchemaArrayItems(Map<String, FieldStats> stats, String arrayPath, Map<String, Object> itemSchema, boolean required) {
        registerSchemaField(stats, arrayPath, itemSchema, required);
        Map<String, Object> properties = mapValue(itemSchema.get("properties"));
        Set<String> requiredFields = stringSet(itemSchema.get("required"));
        if (!properties.isEmpty()) {
            for (Map.Entry<String, Object> entry : properties.entrySet()) {
                String fieldName = text(entry.getKey());
                if (fieldName.isBlank()) {
                    continue;
                }
                Map<String, Object> propertySchema = mapValue(entry.getValue());
                if (propertySchema.isEmpty()) {
                    registerFieldType(stats, joinPath(arrayPath, fieldName), "unknown", requiredFields.contains(fieldName), false);
                    continue;
                }
                appendJsonSchemaFields(stats, joinPath(arrayPath, fieldName), propertySchema, requiredFields.contains(fieldName));
            }
        }
        if (normalizedSchemaTypes(itemSchema).contains("array")) {
            Map<String, Object> nestedItems = mapValue(itemSchema.get("items"));
            if (!nestedItems.isEmpty()) {
                appendJsonSchemaArrayItems(stats, arrayPath + "[]", nestedItems, required);
            }
        }
    }

    private void registerSchemaField(Map<String, FieldStats> stats, String path, Map<String, Object> schema, boolean required) {
        List<String> schemaTypes = normalizedSchemaTypes(schema);
        boolean allowsNull = schemaTypes.remove("null");
        if (schemaTypes.isEmpty()) {
            schemaTypes.add(inferSchemaType(schema));
        }
        for (String schemaType : schemaTypes) {
            registerFieldType(stats, adjustedSchemaPath(path, schemaType), schemaType, required, allowsNull);
        }
    }

    private void appendSampleField(Map<String, FieldStats> stats, String path, Object value) {
        appendSampleField(stats, path, value, new LinkedHashSet<>());
    }

    private void appendSampleField(Map<String, FieldStats> stats, String path, Object value, Set<String> seenInDocument) {
        String normalizedPath = firstText(path);
        if (normalizedPath.isBlank()) {
            return;
        }
        if (value == null) {
            registerSampleField(stats, normalizedPath, "null", seenInDocument);
            return;
        }
        if (value instanceof Map<?, ?> rawMap) {
            registerSampleField(stats, normalizedPath, "object", seenInDocument);
            Map<String, Object> map = toStringMap(rawMap);
            for (Map.Entry<String, Object> entry : map.entrySet()) {
                String childKey = text(entry.getKey());
                if (!childKey.isBlank()) {
                    appendSampleField(stats, joinPath(normalizedPath, childKey), entry.getValue(), seenInDocument);
                }
            }
            return;
        }
        if (value instanceof List<?> list) {
            String arrayPath = normalizedPath + "[]";
            registerSampleField(stats, arrayPath, "array", seenInDocument);
            for (Object item : list) {
                if (item instanceof Map<?, ?> rawItemMap) {
                    registerSampleField(stats, arrayPath, "object", seenInDocument);
                    Map<String, Object> itemMap = toStringMap(rawItemMap);
                    for (Map.Entry<String, Object> entry : itemMap.entrySet()) {
                        String childKey = text(entry.getKey());
                        if (!childKey.isBlank()) {
                            appendSampleField(stats, joinPath(arrayPath, childKey), entry.getValue(), seenInDocument);
                        }
                    }
                } else if (item instanceof List<?> nestedList) {
                    appendSampleField(stats, arrayPath, nestedList, seenInDocument);
                } else {
                    registerSampleField(stats, arrayPath, inferSampleType(arrayPath, item), seenInDocument);
                }
            }
            return;
        }
        registerSampleField(stats, normalizedPath, inferSampleType(normalizedPath, value), seenInDocument);
    }

    private void registerSampleField(Map<String, FieldStats> stats, String path, String type, Set<String> seenInDocument) {
        FieldStats fieldStats = stats.computeIfAbsent(path, ignored -> new FieldStats());
        fieldStats.addType(type);
        fieldStats.markPresent(path, seenInDocument);
        if ("null".equals(type)) {
            fieldStats.markNullAllowed();
        }
        if ("_id".equals(path)) {
            fieldStats.markPrimary();
        }
    }

    private void registerFieldType(Map<String, FieldStats> stats, String fieldName, String type, boolean required, boolean allowsNull) {
        FieldStats fieldStats = stats.computeIfAbsent(fieldName, ignored -> new FieldStats());
        fieldStats.addType(type);
        if (required) {
            fieldStats.markRequired();
        }
        if (allowsNull) {
            fieldStats.markNullAllowed();
        }
        if ("_id".equals(fieldName)) {
            fieldStats.markPrimary();
        }
    }

    private List<ColumnDefinitionDto> sortedColumnDefinitions(Map<String, FieldStats> stats) {
        List<ColumnDefinitionDto> columns = stats.entrySet().stream()
                .map(entry -> toColumnDefinition(entry.getKey(), entry.getValue()))
                .toList();
        List<ColumnDefinitionDto> ordered = new ArrayList<>(columns);
        ordered.sort((left, right) -> {
            if ("_id".equals(left.name())) {
                return "_id".equals(right.name()) ? 0 : -1;
            }
            if ("_id".equals(right.name())) {
                return 1;
            }
            return left.name().compareToIgnoreCase(right.name());
        });
        return ordered;
    }

    private ColumnDefinitionDto toColumnDefinition(String fieldName, FieldStats stats) {
        return new ColumnDefinitionDto(
                fieldName,
                stats.renderType(),
                stats.nullableFlag(),
                stats.keyFlag(),
                "",
                "",
                ""
        );
    }

    private static List<String> normalizedSchemaTypes(Map<String, Object> schema) {
        List<String> types = new ArrayList<>();
        appendSchemaTypes(types, schema.get("bsonType"));
        appendSchemaTypes(types, schema.get("type"));
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String type : types) {
            String normalized = normalizeTypeName(type);
            if (!normalized.isBlank()) {
                unique.add(normalized);
            }
        }
        return new ArrayList<>(unique);
    }

    private static void appendSchemaTypes(List<String> target, Object rawType) {
        if (rawType instanceof List<?> list) {
            for (Object item : list) {
                String type = text(item);
                if (!type.isBlank()) {
                    target.add(type);
                }
            }
            return;
        }
        String type = text(rawType);
        if (!type.isBlank()) {
            target.add(type);
        }
    }

    private static String inferSchemaType(Map<String, Object> schema) {
        if (!mapValue(schema.get("properties")).isEmpty()) {
            return "object";
        }
        if (!mapValue(schema.get("items")).isEmpty()) {
            return "array";
        }
        return "unknown";
    }

    private static String adjustedSchemaPath(String path, String schemaType) {
        if ("array".equals(schemaType) && !path.endsWith("[]")) {
            return path + "[]";
        }
        return path;
    }

    private static String joinPath(String parent, String child) {
        String normalizedParent = firstText(parent);
        String normalizedChild = firstText(child);
        if (normalizedParent.isBlank()) {
            return normalizedChild;
        }
        if (normalizedChild.isBlank()) {
            return normalizedParent;
        }
        return normalizedParent + "." + normalizedChild;
    }

    private static String inferSampleType(String path, Object value) {
        if (value == null) {
            return "null";
        }
        if ("_id".equals(path) && value instanceof String text && text.matches("^[0-9a-fA-F]{24}$")) {
            return "objectId";
        }
        if (value instanceof Boolean) {
            return "boolean";
        }
        if (value instanceof Byte || value instanceof Short || value instanceof Integer) {
            return "int32";
        }
        if (value instanceof Long || value instanceof BigInteger) {
            return "int64";
        }
        if (value instanceof Float || value instanceof Double || value instanceof BigDecimal) {
            return "number";
        }
        if (value instanceof Map<?, ?>) {
            return "object";
        }
        if (value instanceof List<?>) {
            return "array";
        }
        if (value instanceof String text) {
            if (text.startsWith("decimal128:")) {
                return "decimal128";
            }
            if (text.startsWith("base64:")) {
                return "binary";
            }
            if (text.startsWith("/") && text.lastIndexOf('/') > 0) {
                return "regex";
            }
            return "string";
        }
        return normalizeTypeName(value.getClass().getSimpleName());
    }

    private static String normalizeTypeName(String rawType) {
        String value = firstText(rawType).toLowerCase(Locale.ROOT);
        return switch (value) {
            case "int", "integer", "int32", "short", "byte" -> "int32";
            case "long", "int64", "biginteger" -> "int64";
            case "double", "float", "decimal", "bigdecimal", "number" -> "number";
            case "bool", "boolean" -> "boolean";
            case "date", "timestamp", "instant" -> "date";
            case "objectid" -> "objectId";
            case "object" -> "object";
            case "array" -> "array";
            case "regex" -> "regex";
            case "decimal128" -> "decimal128";
            case "binary", "bindata" -> "binary";
            case "string" -> "string";
            case "null" -> "null";
            default -> value.isBlank() ? "unknown" : value;
        };
    }

    private static Map<String, Object> mapValue(Object value) {
        if (value instanceof Map<?, ?> rawMap) {
            return toStringMap(rawMap);
        }
        return Map.of();
    }

    private static Set<String> stringSet(Object value) {
        if (!(value instanceof List<?> list)) {
            return Set.of();
        }
        LinkedHashSet<String> items = new LinkedHashSet<>();
        for (Object item : list) {
            String text = text(item);
            if (!text.isBlank()) {
                items.add(text);
            }
        }
        return items;
    }

    public List<IndexDefinitionDto> listIndexes(ConnectionConfigDto config, String requestedDatabase, String tableName) {
        String collection = requireText(tableName, "collection");
        Map<String, Object> response = runCommand(config, mongoDatabase(config, requestedDatabase), orderedMap("listIndexes", collection));
        List<IndexDefinitionDto> indexes = new ArrayList<>();
        for (Object item : cursorBatch(response)) {
            if (!(item instanceof Map<?, ?> index)) {
                continue;
            }
            String name = firstText(text(index.get("name")), "unnamed");
            boolean unique = Boolean.TRUE.equals(index.get("unique"));
            Object key = index.get("key");
            if (key instanceof Map<?, ?> keyMap && !keyMap.isEmpty()) {
                int seq = 1;
                for (Object field : keyMap.keySet()) {
                    indexes.add(new IndexDefinitionDto(name, text(field), unique ? 0 : 1, seq++, "BTREE", 0));
                }
            }
        }
        indexes.sort((left, right) -> {
            int byName = left.name().compareToIgnoreCase(right.name());
            return byName != 0 ? byName : Integer.compare(left.seqInIndex(), right.seqInIndex());
        });
        return indexes;
    }

    public List<ForeignKeyDefinitionDto> listForeignKeys() {
        return List.of();
    }

    public List<TriggerDefinitionDto> listTriggers() {
        return List.of();
    }

    public String showCreateTable(String requestedDatabase, String tableName) {
        return "// MongoDB collection: " + firstText(requestedDatabase, "default") + "." + requireText(tableName, "collection")
                + "\n// MongoDB is schemaless - no CREATE statement available";
    }

    public QueryResultDto execute(ConnectionConfigDto config, String requestedDatabase, String rawQuery, int page, int pageSize, String queryId) {
        long started = System.nanoTime();
        Map<String, Object> command = parseMongoCommand(requireText(rawQuery, "query"));
        Map<String, Object> response = runCommand(config, mongoDatabase(config, requestedDatabase), command);
        ResultSetDataDto resultSet = resultSetForCommand(command, response);
        long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
        int normalizedPage = page < 1 ? 1 : page;
        int normalizedPageSize = pageSize < 1 ? 100 : Math.min(pageSize, 500);
        return new QueryResultDto(
                resultSet.columns(),
                resultSet.rows(),
                resultSet.rows().size(),
                normalizedPage,
                normalizedPageSize,
                elapsedMs,
                isReadOnlyCommand(command),
                queryId
        );
    }

    public List<ResultSetDataDto> executeMulti(ConnectionConfigDto config, String requestedDatabase, String query) {
        QueryResultDto result = execute(config, requestedDatabase, query, 1, 100, null);
        return List.of(new ResultSetDataDto(result.rows(), result.columns()));
    }

    public ApplyChangesResultDto applyChanges(ConnectionConfigDto config, String requestedDatabase, String tableName, ChangeSetDto changes) {
        String collection = requireText(tableName, "collection");
        String database = mongoDatabase(config, requestedDatabase);
        int inserted = 0;
        int updated = 0;
        int deleted = 0;

        List<Map<String, Object>> inserts = nullSafeRows(changes == null ? null : changes.inserts());
        if (!inserts.isEmpty()) {
            Map<String, Object> response = runCommand(config, database, orderedMap("insert", collection, "documents", inserts));
            inserted += numericInt(response.get("n"), inserts.size());
        }

        for (UpdateRowDto update : nullSafeUpdates(changes == null ? null : changes.updates())) {
            Map<String, Object> keys = nullSafeMap(update == null ? null : update.keys());
            Map<String, Object> values = nullSafeMap(update == null ? null : update.values());
            if (keys.isEmpty() || values.isEmpty()) {
                continue;
            }
            Map<String, Object> response = runCommand(config, database, orderedMap(
                    "update", collection,
                    "updates", List.of(orderedMap("q", keys, "u", orderedMap("$set", values), "multi", false))
            ));
            updated += numericInt(firstNonNull(response.get("nModified"), response.get("n")), 1);
        }

        for (Map<String, Object> keys : nullSafeRows(changes == null ? null : changes.deletes())) {
            Map<String, Object> query = nullSafeMap(keys);
            if (query.isEmpty()) {
                continue;
            }
            Map<String, Object> response = runCommand(config, database, orderedMap(
                    "delete", collection,
                    "deletes", List.of(orderedMap("q", query, "limit", 1))
            ));
            deleted += numericInt(response.get("n"), 1);
        }

        return new ApplyChangesResultDto(inserted, updated, deleted, inserted + updated + deleted);
    }

    public MongoContracts.DiscoverMembersResponse discoverMembers(MongoContracts.DiscoverMembersRequest input) {
        Map<String, Object> payload = input == null ? Map.of() : input.toCompatibilityMap();
        Map<String, Object> connection = payload.get("connection") instanceof Map<?, ?> raw ? toStringMap(raw) : Map.of();
        ConnectionConfigDto config = mongoConfigFrom(connection, payload);
        MongoConnectionProfile profile = MongoConnectionProfile.from(config);
        HostPort seed = profile.seeds().isEmpty() ? new HostPort("localhost", DEFAULT_PORT) : profile.seeds().get(0);
        String replicaSet = firstText(profile.replicaSet(), option(connection, "mongoReplicaSet"));

        if (shouldSkipProbe(seed.host())) {
            return preview(profile, seed, replicaSet, "JavaNavi skipped network probing for documentation/example host.");
        }

        try {
            HelloResult hello = probeHello(config);
            String resolvedReplicaSet = firstText(hello.replicaSet(), replicaSet);
            List<MongoContracts.MemberInfo> members = membersFromHello(seed.host(), seed.port(), hello);
            return new MongoContracts.DiscoverMembersResponse(
                    resolvedReplicaSet,
                    members,
                    false,
                    false,
                    true,
                    authProfile(profile),
                    tlsProfile(profile),
                    Instant.now().toString(),
                    "JavaNavi Web MongoDB member discovery completed with a direct Mongo wire-protocol hello probe."
            );
        } catch (IOException | IllegalArgumentException error) {
            return preview(profile, seed, replicaSet, "JavaNavi MongoDB direct wire probe failed: " + SecretRedactor.redact(error.getMessage()));
        }
    }

    private static HelloResult probeHello(ConnectionConfigDto config) throws IOException {
        try {
            return sendCommand(config, "hello");
        } catch (IOException | IllegalArgumentException helloError) {
            try {
                return sendCommand(config, "isMaster");
            } catch (IOException | IllegalArgumentException isMasterError) {
                IOException combined = new IOException("hello=" + helloError.getMessage() + "; isMaster=" + isMasterError.getMessage());
                combined.addSuppressed(helloError);
                combined.addSuppressed(isMasterError);
                throw combined;
            }
        }
    }

    private static HelloResult sendCommand(ConnectionConfigDto config, String commandName) throws IOException {
        Map<String, Object> document = sendCommandDocument(config, orderedMap(commandName, 1, "$db", "admin"));
        double ok = numeric(document.get("ok"), 0);
        if (ok != 1.0d) {
            throw new IOException("MongoDB hello returned ok=" + ok + " message=" + firstText(text(document.get("errmsg")), text(document.get("codeName"))));
        }
        return HelloResult.from(document);
    }

    private Map<String, Object> runCommand(ConnectionConfigDto config, String database, Map<String, Object> command) {
        String targetDatabase = firstText(database, config == null ? null : config.database(), "admin");
        Map<String, Object> commandWithDatabase = new LinkedHashMap<>(command);
        commandWithDatabase.putIfAbsent("$db", targetDatabase);
        try {
            Map<String, Object> document = sendCommandDocument(config, commandWithDatabase);
            double ok = numeric(document.get("ok"), 0);
            if (ok != 1.0d) {
                throw new IllegalArgumentException("MongoDB command returned ok=" + ok + " message=" + firstText(text(document.get("errmsg")), text(document.get("codeName"))));
            }
            return document;
        } catch (IOException | IllegalArgumentException error) {
            throw new IllegalArgumentException("MongoDB command failed: " + SecretRedactor.redact(error.getMessage()), error);
        }
    }

    private static Map<String, Object> sendCommandDocument(ConnectionConfigDto config, Map<String, Object> command) throws IOException {
        List<MongoConnectionAttempt> attempts = MongoConnectionProfile.from(config).attempts();
        IOException last = null;
        for (MongoConnectionAttempt attempt : attempts) {
            try {
                return sendCommandDocument(attempt, command);
            } catch (IOException | IllegalArgumentException error) {
                last = new IOException(attempt.label() + ": " + SecretRedactor.redact(error.getMessage()), error);
            }
        }
        if (last != null) {
            throw last;
        }
        throw new IOException("No MongoDB connection attempts were available.");
    }

    private static Map<String, Object> sendCommandDocument(MongoConnectionAttempt attempt, Map<String, Object> command) throws IOException {
        try (Socket socket = openSocket(attempt)) {
            if (attempt.hasAuth()) {
                authenticate(socket, attempt);
            }
            return sendCommandOnSocket(socket, command);
        }
    }

    private static Map<String, Object> sendCommandOnSocket(Socket socket, Map<String, Object> command) throws IOException {
        int requestId = ThreadLocalRandom.current().nextInt(1, Integer.MAX_VALUE);
        byte[] request = opMsg(requestId, command);
        OutputStream output = socket.getOutputStream();
        output.write(request);
        output.flush();

        DataInputStream input = new DataInputStream(socket.getInputStream());
        byte[] header = input.readNBytes(16);
        if (header.length != 16) {
            throw new IOException("MongoDB response header was incomplete.");
        }
        ByteBuffer headerBuffer = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
        int length = headerBuffer.getInt();
        headerBuffer.getInt(); // response request id
        int responseTo = headerBuffer.getInt();
        int opCode = headerBuffer.getInt();
        if (length < 21 || length > 16 * 1024 * 1024) {
            throw new IOException("MongoDB response length is invalid: " + length);
        }
        byte[] body = input.readNBytes(length - 16);
        if (body.length != length - 16) {
            throw new IOException("MongoDB response body was incomplete.");
        }
        if (opCode != OP_MSG) {
            throw new IOException("Unsupported MongoDB wire opcode: " + opCode);
        }
        if (responseTo != requestId && responseTo != 0) {
            throw new IOException("MongoDB response correlation mismatch.");
        }
        return parseOpMsgDocument(body);
    }

    private static Socket openSocket(MongoConnectionAttempt attempt) throws IOException {
        Socket plain = NETWORK_CONNECTOR.openSocket(attempt.networkConfig(), attempt.timeoutMs());
        try {
            plain.setSoTimeout(attempt.timeoutMs());
            if (!attempt.tls()) {
                return plain;
            }
            SSLSocketFactory factory = attempt.tlsInsecure() ? trustAllSslSocketFactory() : (SSLSocketFactory) SSLSocketFactory.getDefault();
            SSLSocket sslSocket = (SSLSocket) factory.createSocket(plain, attempt.host(), attempt.port(), true);
            sslSocket.setUseClientMode(true);
            sslSocket.setSoTimeout(attempt.timeoutMs());
            sslSocket.startHandshake();
            return sslSocket;
        } catch (IOException | RuntimeException error) {
            try {
                plain.close();
            } catch (IOException ignored) {
                // best effort cleanup before trying the next Mongo connection attempt
            }
            throw error;
        }
    }

    private static SSLSocketFactory trustAllSslSocketFactory() throws IOException {
        try {
            TrustManager[] trustManagers = new TrustManager[]{
                    new X509TrustManager() {
                        @Override
                        public void checkClientTrusted(X509Certificate[] chain, String authType) {
                        }

                        @Override
                        public void checkServerTrusted(X509Certificate[] chain, String authType) {
                        }

                        @Override
                        public X509Certificate[] getAcceptedIssuers() {
                            return new X509Certificate[0];
                        }
                    }
            };
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, trustManagers, SECURE_RANDOM);
            return context.getSocketFactory();
        } catch (GeneralSecurityException error) {
            throw new IOException("Unable to initialize MongoDB TLS context.", error);
        }
    }

    private static void authenticate(Socket socket, MongoConnectionAttempt attempt) throws IOException {
        String mechanism = attempt.mechanism().toUpperCase(Locale.ROOT);
        if (!Set.of("SCRAM-SHA-256", "SCRAM-SHA-1").contains(mechanism)) {
            throw new IOException("Unsupported MongoDB auth mechanism: " + mechanism);
        }
        String clientNonce = randomNonce();
        String username = escapeScramName(attempt.username());
        String clientFirstBare = "n=" + username + ",r=" + clientNonce;
        byte[] clientFirstPayload = ("n,," + clientFirstBare).getBytes(StandardCharsets.UTF_8);
        Map<String, Object> start = sendCommandOnSocket(socket, orderedMap(
                "saslStart", 1,
                "mechanism", mechanism,
                "payload", new BsonBinary((byte) 0, clientFirstPayload),
                "autoAuthorize", 1,
                "$db", attempt.authSource()
        ));
        assertMongoOk(start, "MongoDB SASL start");
        String serverFirst = new String(binaryBytes(start.get("payload")), StandardCharsets.UTF_8);
        Map<String, String> attributes = scramAttributes(serverFirst);
        String serverNonce = attributes.getOrDefault("r", "");
        if (!serverNonce.startsWith(clientNonce)) {
            throw new IOException("MongoDB SCRAM server nonce did not extend the client nonce.");
        }
        byte[] salt = Base64.getDecoder().decode(attributes.getOrDefault("s", ""));
        int iterations = positiveInt(attributes.getOrDefault("i", ""), 0);
        if (iterations <= 0) {
            throw new IOException("MongoDB SCRAM iteration count is invalid.");
        }
        String clientFinalWithoutProof = "c=biws,r=" + serverNonce;
        String authMessage = clientFirstBare + "," + serverFirst + "," + clientFinalWithoutProof;
        ScramProof proof = scramProof(mechanism, attempt.username(), attempt.password(), salt, iterations, authMessage);
        String clientFinal = clientFinalWithoutProof + ",p=" + Base64.getEncoder().encodeToString(proof.clientProof());
        Map<String, Object> finish = sendCommandOnSocket(socket, orderedMap(
                "saslContinue", 1,
                "conversationId", numericInt(start.get("conversationId"), 1),
                "payload", new BsonBinary((byte) 0, clientFinal.getBytes(StandardCharsets.UTF_8)),
                "$db", attempt.authSource()
        ));
        assertMongoOk(finish, "MongoDB SASL continue");
        byte[] serverFinalBytes = binaryBytes(finish.get("payload"));
        if (serverFinalBytes.length > 0) {
            Map<String, String> finalAttributes = scramAttributes(new String(serverFinalBytes, StandardCharsets.UTF_8));
            String serverSignature = finalAttributes.get("v");
            if (serverSignature != null && !MessageDigest.isEqual(Base64.getDecoder().decode(serverSignature), proof.serverSignature())) {
                throw new IOException("MongoDB SCRAM server signature verification failed.");
            }
        }
        if (!Boolean.TRUE.equals(finish.get("done"))) {
            Map<String, Object> done = sendCommandOnSocket(socket, orderedMap(
                    "saslContinue", 1,
                    "conversationId", numericInt(finish.get("conversationId"), numericInt(start.get("conversationId"), 1)),
                    "payload", new BsonBinary((byte) 0, new byte[0]),
                    "$db", attempt.authSource()
            ));
            assertMongoOk(done, "MongoDB SASL final continue");
        }
    }

    private static void assertMongoOk(Map<String, Object> document, String phase) throws IOException {
        double ok = numeric(document.get("ok"), 0);
        if (ok != 1.0d) {
            throw new IOException(phase + " returned ok=" + ok + " message=" + firstText(text(document.get("errmsg")), text(document.get("codeName"))));
        }
    }

    private static ScramProof scramProof(String mechanism, String username, String password, byte[] salt, int iterations, String authMessage) throws IOException {
        try {
            String hmacAlgorithm = "SCRAM-SHA-1".equals(mechanism) ? "HmacSHA1" : "HmacSHA256";
            String digestAlgorithm = "SCRAM-SHA-1".equals(mechanism) ? "SHA-1" : "SHA-256";
            byte[] normalizedPassword = normalizedScramPassword(mechanism, username, password).getBytes(StandardCharsets.UTF_8);
            byte[] saltedPassword = hi(hmacAlgorithm, normalizedPassword, salt, iterations);
            byte[] clientKey = hmac(hmacAlgorithm, saltedPassword, "Client Key".getBytes(StandardCharsets.UTF_8));
            byte[] storedKey = MessageDigest.getInstance(digestAlgorithm).digest(clientKey);
            byte[] clientSignature = hmac(hmacAlgorithm, storedKey, authMessage.getBytes(StandardCharsets.UTF_8));
            byte[] proof = xor(clientKey, clientSignature);
            byte[] serverKey = hmac(hmacAlgorithm, saltedPassword, "Server Key".getBytes(StandardCharsets.UTF_8));
            byte[] serverSignature = hmac(hmacAlgorithm, serverKey, authMessage.getBytes(StandardCharsets.UTF_8));
            return new ScramProof(proof, serverSignature);
        } catch (GeneralSecurityException error) {
            throw new IOException("Unable to compute MongoDB SCRAM proof.", error);
        }
    }

    private static String normalizedScramPassword(String mechanism, String username, String password) throws GeneralSecurityException {
        if (!"SCRAM-SHA-1".equals(mechanism)) {
            return password == null ? "" : password;
        }
        MessageDigest md5 = MessageDigest.getInstance("MD5");
        byte[] digest = md5.digest((firstText(username) + ":mongo:" + firstText(password)).getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(digest);
    }

    private static byte[] hi(String hmacAlgorithm, byte[] password, byte[] salt, int iterations) throws GeneralSecurityException {
        byte[] saltBlock = new byte[salt.length + 4];
        System.arraycopy(salt, 0, saltBlock, 0, salt.length);
        saltBlock[salt.length + 3] = 1;
        byte[] result = hmac(hmacAlgorithm, password, saltBlock);
        byte[] previous = result;
        for (int i = 1; i < iterations; i++) {
            previous = hmac(hmacAlgorithm, password, previous);
            for (int j = 0; j < result.length; j++) {
                result[j] ^= previous[j];
            }
        }
        return result;
    }

    private static byte[] hmac(String algorithm, byte[] key, byte[] value) throws GeneralSecurityException {
        Mac mac = Mac.getInstance(algorithm);
        mac.init(new SecretKeySpec(key, algorithm));
        return mac.doFinal(value);
    }

    private static byte[] xor(byte[] left, byte[] right) {
        byte[] result = new byte[Math.min(left.length, right.length)];
        for (int i = 0; i < result.length; i++) {
            result[i] = (byte) (left[i] ^ right[i]);
        }
        return result;
    }

    private static Map<String, String> scramAttributes(String text) {
        Map<String, String> attributes = new LinkedHashMap<>();
        for (String part : text.split(",")) {
            int separator = part.indexOf('=');
            if (separator > 0) {
                attributes.put(part.substring(0, separator), part.substring(separator + 1));
            }
        }
        return attributes;
    }

    private static String escapeScramName(String value) {
        return firstText(value).replace("=", "=3D").replace(",", "=2C");
    }

    private static String randomNonce() {
        byte[] bytes = new byte[18];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] binaryBytes(Object value) {
        if (value instanceof BsonBinary binary) {
            return binary.bytes();
        }
        String text = text(value);
        if (text.startsWith("base64:")) {
            String[] parts = text.split(":", 3);
            if (parts.length == 3) {
                return Base64.getDecoder().decode(parts[2]);
            }
        }
        if (text.isBlank()) {
            return new byte[0];
        }
        return Base64.getDecoder().decode(text);
    }

    private static byte[] opMsg(int requestId, Map<String, Object> command) {
        byte[] document = bsonDocument(command);
        int length = 16 + 4 + 1 + document.length;
        ByteBuffer buffer = ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN);
        buffer.putInt(length);
        buffer.putInt(requestId);
        buffer.putInt(0);
        buffer.putInt(OP_MSG);
        buffer.putInt(0);
        buffer.put((byte) 0);
        buffer.put(document);
        return buffer.array();
    }

    private static byte[] bsonDocument(Map<String, Object> document) {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        document.forEach((key, value) -> writeBsonElement(body, key, value));
        body.write(0);
        byte[] bodyBytes = body.toByteArray();
        ByteBuffer buffer = ByteBuffer.allocate(4 + bodyBytes.length).order(ByteOrder.LITTLE_ENDIAN);
        buffer.putInt(4 + bodyBytes.length);
        buffer.put(bodyBytes);
        return buffer.array();
    }

    private static void writeBsonElement(ByteArrayOutputStream output, String key, Object value) {
        if (value == null) {
            output.write(0x0A);
            writeCString(output, key);
            return;
        }
        if (value instanceof Boolean bool) {
            output.write(0x08);
            writeCString(output, key);
            output.write(bool ? 1 : 0);
            return;
        }
        if (value instanceof Byte || value instanceof Short || value instanceof Integer) {
            output.write(0x10);
            writeCString(output, key);
            writeInt32(output, ((Number) value).intValue());
            return;
        }
        if (value instanceof Long || value instanceof BigInteger) {
            output.write(0x12);
            writeCString(output, key);
            writeInt64(output, ((Number) value).longValue());
            return;
        }
        if (value instanceof BsonBinary binary) {
            output.write(0x05);
            writeCString(output, key);
            writeInt32(output, binary.bytes().length);
            output.write(binary.subtype());
            output.writeBytes(binary.bytes());
            return;
        }
        if (value instanceof byte[] bytes) {
            output.write(0x05);
            writeCString(output, key);
            writeInt32(output, bytes.length);
            output.write(0);
            output.writeBytes(bytes);
            return;
        }
        if (value instanceof Float || value instanceof Double || value instanceof BigDecimal) {
            output.write(0x01);
            writeCString(output, key);
            writeDouble(output, ((Number) value).doubleValue());
            return;
        }
        if (value instanceof Map<?, ?> map) {
            output.write(0x03);
            writeCString(output, key);
            output.writeBytes(bsonDocument(toStringMap(map)));
            return;
        }
        if (value instanceof Iterable<?> iterable) {
            output.write(0x04);
            writeCString(output, key);
            Map<String, Object> arrayDocument = new LinkedHashMap<>();
            int index = 0;
            for (Object item : iterable) {
                arrayDocument.put(String.valueOf(index++), item);
            }
            output.writeBytes(bsonDocument(arrayDocument));
            return;
        }
        output.write(0x02);
        writeCString(output, key);
        byte[] bytes = text(value).getBytes(StandardCharsets.UTF_8);
        writeInt32(output, bytes.length + 1);
        output.writeBytes(bytes);
        output.write(0);
    }

    private static Map<String, Object> parseOpMsgDocument(byte[] body) {
        if (body.length < 5) {
            throw new IllegalArgumentException("MongoDB OP_MSG body is too short.");
        }
        ByteBuffer buffer = ByteBuffer.wrap(body).order(ByteOrder.LITTLE_ENDIAN);
        buffer.getInt(); // flags
        byte sectionKind = buffer.get();
        if (sectionKind != 0) {
            throw new IllegalArgumentException("Only MongoDB OP_MSG body section kind 0 is supported.");
        }
        return readDocument(buffer);
    }

    private static Map<String, Object> readDocument(ByteBuffer buffer) {
        int start = buffer.position();
        int length = buffer.getInt();
        int end = start + length;
        if (length < 5 || end > buffer.limit()) {
            throw new IllegalArgumentException("Invalid BSON document length: " + length);
        }
        Map<String, Object> values = new LinkedHashMap<>();
        while (buffer.position() < end - 1) {
            int type = Byte.toUnsignedInt(buffer.get());
            String key = readCString(buffer);
            values.put(key, readValue(buffer, type));
        }
        buffer.get(); // trailing null
        return values;
    }

    private static Object readValue(ByteBuffer buffer, int type) {
        return switch (type) {
            case 0x01 -> buffer.getDouble();
            case 0x02 -> readString(buffer);
            case 0x03 -> readDocument(buffer);
            case 0x04 -> new ArrayList<>(readDocument(buffer).values());
            case 0x05 -> readBinary(buffer);
            case 0x07 -> readObjectId(buffer);
            case 0x08 -> buffer.get() != 0;
            case 0x09 -> Instant.ofEpochMilli(buffer.getLong()).toString();
            case 0x0A -> null;
            case 0x0B -> readRegex(buffer);
            case 0x10 -> buffer.getInt();
            case 0x11 -> buffer.getLong();
            case 0x12 -> buffer.getLong();
            case 0x13 -> readDecimal128(buffer);
            case 0x7F -> "MaxKey";
            case 0xFF -> "MinKey";
            default -> throw new IllegalArgumentException("Unsupported BSON type in MongoDB hello response: 0x" + Integer.toHexString(type));
        };
    }

    private static String readString(ByteBuffer buffer) {
        int length = buffer.getInt();
        if (length <= 0 || length > buffer.remaining()) {
            throw new IllegalArgumentException("Invalid BSON string length: " + length);
        }
        byte[] bytes = new byte[length - 1];
        buffer.get(bytes);
        buffer.get();
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static String readCString(ByteBuffer buffer) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        while (buffer.hasRemaining()) {
            byte value = buffer.get();
            if (value == 0) {
                return output.toString(StandardCharsets.UTF_8);
            }
            output.write(value);
        }
        throw new IllegalArgumentException("Unterminated BSON cstring.");
    }

    private static String readObjectId(ByteBuffer buffer) {
        byte[] raw = new byte[12];
        buffer.get(raw);
        return HexFormat.of().formatHex(raw);
    }

    private static String readBinary(ByteBuffer buffer) {
        int length = buffer.getInt();
        if (length < 0 || length + 1 > buffer.remaining()) {
            throw new IllegalArgumentException("Invalid BSON binary length: " + length);
        }
        int subtype = Byte.toUnsignedInt(buffer.get());
        byte[] raw = new byte[length];
        buffer.get(raw);
        return "base64:" + subtype + ":" + Base64.getEncoder().encodeToString(raw);
    }

    private static String readRegex(ByteBuffer buffer) {
        String pattern = readCString(buffer);
        String options = readCString(buffer);
        return "/" + pattern + "/" + options;
    }

    private static String readDecimal128(ByteBuffer buffer) {
        long low = buffer.getLong();
        long high = buffer.getLong();
        return "decimal128:" + Long.toUnsignedString(high, 16) + Long.toUnsignedString(low, 16);
    }

    private Map<String, Object> parseMongoCommand(String rawQuery) {
        String query = rawQuery.trim();
        String lower = query.toLowerCase(Locale.ROOT);
        if (lower.startsWith("select") || lower.startsWith("show")) {
            Map<String, Object> converted = sqlToMongoCommand(query);
            if (!converted.isEmpty()) {
                return converted;
            }
        }
        try {
            LinkedHashMap<String, Object> parsed = OBJECT_MAPPER.readValue(query, COMMAND_TYPE);
            if (parsed.isEmpty()) {
                throw new IllegalArgumentException("MongoDB command cannot be empty.");
            }
            return parsed;
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("MongoDB command must be a JSON object or supported SELECT statement.");
        }
    }

    private Map<String, Object> sqlToMongoCommand(String sql) {
        String lower = sql.toLowerCase(Locale.ROOT).trim();
        String collection = extractCollectionFromSql(sql);
        if (collection.isBlank()) {
            return Map.of();
        }
        if (lower.startsWith("select count(")) {
            return orderedMap("count", collection, "query", Map.of());
        }
        if (!lower.startsWith("select")) {
            return Map.of();
        }
        Map<String, Object> command = orderedMap("find", collection, "filter", Map.of());
        long limit = sqlNumberAfter(lower, "limit");
        long skip = sqlNumberAfter(lower, "offset");
        if (limit > 0) {
            command.put("limit", limit);
        }
        if (skip > 0) {
            command.put("skip", skip);
        }
        return command;
    }

    private static String extractCollectionFromSql(String sql) {
        String lower = sql.toLowerCase(Locale.ROOT);
        int from = lower.indexOf("from ");
        if (from < 0) {
            return "";
        }
        String after = sql.substring(from + 5).trim();
        if (after.isEmpty()) {
            return "";
        }
        char quote = after.charAt(0);
        if (quote == '"' || quote == '`') {
            int end = after.indexOf(quote, 1);
            return end > 1 ? after.substring(1, end).trim() : "";
        }
        String[] parts = after.split("\\s+");
        return parts.length == 0 ? "" : parts[0].trim();
    }

    private static long sqlNumberAfter(String lowerSql, String keyword) {
        int index = lowerSql.indexOf(keyword + " ");
        if (index < 0) {
            return 0;
        }
        String after = lowerSql.substring(index + keyword.length() + 1).trim();
        String[] parts = after.split("\\s+");
        if (parts.length == 0) {
            return 0;
        }
        try {
            return Long.parseLong(parts[0]);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private ResultSetDataDto resultSetForCommand(Map<String, Object> command, Map<String, Object> response) {
        String commandName = firstCommandName(command);
        if ("find".equals(commandName) || response.containsKey("cursor")) {
            List<Map<String, Object>> rows = cursorBatch(response).stream()
                    .filter(Map.class::isInstance)
                    .map(item -> nullSafeMap((Map<?, ?>) item))
                    .toList();
            return new ResultSetDataDto(rows, columnsForRows(rows));
        }
        if ("count".equals(commandName)) {
            return new ResultSetDataDto(List.of(orderedMap("total", firstNonNull(response.get("n"), 0))), List.of("total"));
        }
        if (!isReadOnlyCommand(command)) {
            return new ResultSetDataDto(List.of(orderedMap("affectedRows", numericInt(response.get("n"), 0))), List.of("affectedRows"));
        }
        Map<String, Object> result = new LinkedHashMap<>(response);
        result.remove("ok");
        return new ResultSetDataDto(List.of(orderedMap("result", result)), List.of("result"));
    }

    private static List<String> columnsForRows(List<Map<String, Object>> rows) {
        LinkedHashSet<String> columns = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            columns.addAll(row.keySet());
        }
        List<String> ordered = new ArrayList<>(columns);
        ordered.sort(String::compareToIgnoreCase);
        if (ordered.remove("_id")) {
            ordered.add(0, "_id");
        }
        return ordered;
    }

    private static boolean isReadOnlyCommand(Map<String, Object> command) {
        return switch (firstCommandName(command)) {
            case "find", "count", "aggregate", "distinct", "listdatabases", "listcollections", "listindexes" -> true;
            default -> false;
        };
    }

    private static String firstCommandName(Map<String, Object> command) {
        for (String key : command.keySet()) {
            if (!"$db".equals(key)) {
                return key.toLowerCase(Locale.ROOT);
            }
        }
        return "";
    }

    private static List<MongoContracts.MemberInfo> membersFromHello(String host, int port, HelloResult hello) {
        LinkedHashSet<String> hosts = new LinkedHashSet<>();
        hosts.addAll(hello.hosts());
        hosts.addAll(hello.passives());
        hosts.addAll(hello.arbiters());
        String self = firstText(hello.me(), host + ":" + port);
        if (hosts.isEmpty()) {
            hosts.add(self);
        }
        Set<String> passiveSet = Set.copyOf(hello.passives());
        Set<String> arbiterSet = Set.copyOf(hello.arbiters());
        String primary = hello.primary();
        List<MongoContracts.MemberInfo> members = new ArrayList<>();
        for (String memberHost : hosts) {
            String role = "SECONDARY";
            int stateCode = 2;
            if (memberHost.equals(primary) || (primary.isBlank() && memberHost.equals(self) && hello.writablePrimary())) {
                role = "PRIMARY";
                stateCode = 1;
            } else if (arbiterSet.contains(memberHost)) {
                role = "ARBITER";
                stateCode = 7;
            } else if (passiveSet.contains(memberHost)) {
                role = "PASSIVE";
                stateCode = 6;
            }
            members.add(new MongoContracts.MemberInfo(
                    memberHost,
                    role,
                    role,
                    stateCode,
                    true,
                    memberHost.equals(self),
                    "javanavi-java-web-wire-hello"
            ));
        }
        members.sort(Comparator.comparing(MongoContracts.MemberInfo::host, String.CASE_INSENSITIVE_ORDER));
        return members;
    }

    private static MongoContracts.DiscoverMembersResponse preview(MongoConnectionProfile profile, HostPort seed, String replicaSet, String message) {
        return new MongoContracts.DiscoverMembersResponse(
                replicaSet,
                List.of(new MongoContracts.MemberInfo(
                        seed.host() + ":" + seed.port(),
                        "UNKNOWN",
                        "UNKNOWN",
                        0,
                        false,
                        false,
                        "javanavi-java-web-config-preview"
                )),
                true,
                false,
                false,
                authProfile(profile),
                tlsProfile(profile),
                Instant.now().toString(),
                message
        );
    }

    private static MongoContracts.AuthProfile authProfile(MongoConnectionProfile profile) {
        return new MongoContracts.AuthProfile(
                !profile.username().isBlank(),
                !profile.password().isBlank(),
                profile.authSource(),
                profile.authMechanism().isBlank() ? "SCRAM-SHA-256/SCRAM-SHA-1" : profile.authMechanism(),
                !profile.replicaUsername().isBlank(),
                "NONE".equalsIgnoreCase(profile.authMechanism())
        );
    }

    private static MongoContracts.TlsProfile tlsProfile(MongoConnectionProfile profile) {
        return new MongoContracts.TlsProfile(
                profile.tlsEnabled(),
                profile.sslMode(),
                profile.tlsInsecure(),
                profile.preferredTlsFallback(),
                profile.mongoSrv()
        );
    }

    private static boolean shouldSkipProbe(String host) {
        String normalized = host.toLowerCase(Locale.ROOT);
        return normalized.endsWith(".example") || normalized.endsWith(".invalid") || normalized.endsWith(".test");
    }

    private static ConnectionConfigDto mongoConfigFrom(Map<String, Object> connection, Map<String, Object> input) {
        Map<String, String> options = new LinkedHashMap<>();
        Object rawOptions = connection.get("options");
        if (rawOptions instanceof Map<?, ?> optionMap) {
            optionMap.forEach((key, value) -> {
                String optionKey = text(key);
                if (!optionKey.isBlank()) {
                    options.put(optionKey, text(value));
                }
            });
        }
        String host = firstText(text(connection.get("host")), text(input == null ? null : input.get("host")));
        Integer port = nullableInt(firstText(text(connection.get("port")), text(input == null ? null : input.get("port"))));
        Integer timeout = nullableInt(firstText(text(connection.get("timeout")), text(input == null ? null : input.get("timeout"))));
        return new ConnectionConfigDto(
                firstText(text(connection.get("id")), "mongo-discovery"),
                firstText(text(connection.get("name")), "MongoDB"),
                firstText(text(connection.get("driverType")), text(connection.get("type")), "mongodb"),
                text(connection.get("driver")),
                host,
                port,
                text(connection.get("database")),
                firstText(text(connection.get("username")), text(connection.get("user"))),
                text(connection.get("password")),
                options,
                timeout,
                nullableBoolean(connection.get("useSSL")),
                text(connection.get("sslMode")),
                nullableBoolean(connection.get("useSSH")),
                networkCredential(connection.get("ssh")),
                networkCredential(connection.get("sshConfig")),
                nullableBoolean(connection.get("useProxy")),
                networkProxy(connection.get("proxy")),
                text(connection.get("uri")),
                text(connection.get("dsn")),
                stringList(connection.get("hosts")),
                text(connection.get("topology")),
                firstText(text(connection.get("replicaSet")), text(connection.get("mongoReplicaSet"))),
                text(connection.get("authSource")),
                text(connection.get("readPreference")),
                nullableBoolean(firstNonNull(connection.get("mongoSrv"), connection.get("mongoSRV"))),
                text(connection.get("mongoAuthMechanism")),
                text(connection.get("mongoReplicaUser")),
                text(connection.get("mongoReplicaPassword"))
        );
    }

    private static ConnectionConfigDto.NetworkCredentialConfigDto networkCredential(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return null;
        }
        return new ConnectionConfigDto.NetworkCredentialConfigDto(
                text(map.get("host")),
                nullableInt(text(map.get("port"))),
                firstText(text(map.get("user")), text(map.get("username"))),
                text(map.get("password")),
                text(map.get("keyPath"))
        );
    }

    private static ConnectionConfigDto.NetworkProxyConfigDto networkProxy(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return null;
        }
        return new ConnectionConfigDto.NetworkProxyConfigDto(
                text(map.get("type")),
                text(map.get("host")),
                nullableInt(text(map.get("port"))),
                firstText(text(map.get("user")), text(map.get("username"))),
                text(map.get("password"))
        );
    }

    private static Map<String, Object> toStringMap(Map<?, ?> raw) {
        Map<String, Object> result = new LinkedHashMap<>();
        raw.forEach((key, value) -> result.put(String.valueOf(key), value));
        return result;
    }

    private static String option(Map<String, Object> input, String key) {
        Object options = input.get("options");
        if (!(options instanceof Map<?, ?> map)) {
            return "";
        }
        Object value = map.get(key);
        return text(value);
    }

    private static int positiveInt(String value, int fallback) {
        try {
            int parsed = Integer.parseInt(value);
            return parsed > 0 ? parsed : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static Integer nullableInt(String value) {
        String text = firstText(value);
        if (text.isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Boolean nullableBoolean(Object value) {
        String text = text(value).toLowerCase(Locale.ROOT);
        if (text.isBlank()) {
            return null;
        }
        return Set.of("1", "true", "t", "yes", "y", "on", "required").contains(text);
    }

    private static double numeric(Object value, double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(text(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static void writeCString(ByteArrayOutputStream output, String value) {
        output.writeBytes(value.getBytes(StandardCharsets.UTF_8));
        output.write(0);
    }

    private static void writeInt32(ByteArrayOutputStream output, int value) {
        output.write(value & 0xff);
        output.write((value >>> 8) & 0xff);
        output.write((value >>> 16) & 0xff);
        output.write((value >>> 24) & 0xff);
    }

    private static void writeInt64(ByteArrayOutputStream output, long value) {
        for (int shift = 0; shift < 64; shift += 8) {
            output.write((int) ((value >>> shift) & 0xff));
        }
    }

    private static void writeDouble(ByteArrayOutputStream output, double value) {
        writeInt64(output, Double.doubleToRawLongBits(value));
    }

    private static String driverType(ConnectionConfigDto config) {
        String driver = config == null ? "" : firstText(config.driverType(), text(option(config, "driverType")), text(option(config, "type")));
        return driver.toLowerCase(Locale.ROOT).trim();
    }

    private static String mongoHost(ConnectionConfigDto config) {
        MongoConnectionProfile profile = MongoConnectionProfile.from(config);
        return profile.seeds().isEmpty() ? "localhost" : profile.seeds().get(0).host();
    }

    private static int mongoPort(ConnectionConfigDto config) {
        MongoConnectionProfile profile = MongoConnectionProfile.from(config);
        return profile.seeds().isEmpty() ? DEFAULT_PORT : profile.seeds().get(0).port();
    }

    private static int mongoTimeoutMs(ConnectionConfigDto config) {
        String raw = firstText(
                config == null || config.timeout() == null ? null : String.valueOf(config.timeout()),
                text(option(config, "timeout")),
                text(option(config, "connectTimeoutMS")),
                text(option(config, "serverSelectionTimeoutMS"))
        );
        int value = positiveInt(raw, DEFAULT_TIMEOUT_MS);
        return Math.min(30_000, Math.max(250, value));
    }

    private static String mongoDatabase(ConnectionConfigDto config, String requestedDatabase) {
        MongoConnectionProfile profile = MongoConnectionProfile.from(config);
        return firstText(requestedDatabase, profile.database(), "admin");
    }

    private static Object option(ConnectionConfigDto config, String key) {
        if (config == null || config.options() == null) {
            return null;
        }
        return config.options().get(key);
    }

    private static List<?> listValue(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private static List<?> cursorBatch(Map<String, Object> response) {
        Object cursor = response.get("cursor");
        if (cursor instanceof Map<?, ?> map) {
            Object firstBatch = map.get("firstBatch");
            if (firstBatch instanceof List<?> list) {
                return list;
            }
            Object nextBatch = map.get("nextBatch");
            if (nextBatch instanceof List<?> list) {
                return list;
            }
        }
        return List.of();
    }

    private static List<Map<String, Object>> nullSafeRows(List<Map<String, Object>> rows) {
        return rows == null ? List.of() : rows.stream().map(MongoCompatibilityService::nullSafeMap).toList();
    }

    private static List<UpdateRowDto> nullSafeUpdates(List<UpdateRowDto> updates) {
        return updates == null ? List.of() : updates;
    }

    private static Map<String, Object> nullSafeMap(Map<?, ?> input) {
        if (input == null || input.isEmpty()) {
            return Map.of();
        }
        return toStringMap(input);
    }

    private static Object firstNonNull(Object... values) {
        for (Object value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static int numericInt(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(text(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String requireText(String value, String field) {
        String text = firstText(value);
        if (text.isBlank()) {
            throw new IllegalArgumentException("MongoDB " + field + " is required.");
        }
        return text;
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    private static List<String> stringList(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(MongoCompatibilityService::text).filter(item -> !item.isBlank()).toList();
        }
        String text = text(value);
        if (text.isBlank()) {
            return List.of();
        }
        return List.of(text.split(",")).stream().map(String::trim).filter(item -> !item.isBlank()).toList();
    }

    private static Map<String, String> queryParams(String rawUri) {
        String uri = firstText(rawUri);
        if (uri.isBlank()) {
            return Map.of();
        }
        int question = uri.indexOf('?');
        if (question < 0 || question == uri.length() - 1) {
            return Map.of();
        }
        Map<String, String> result = new LinkedHashMap<>();
        String query = uri.substring(question + 1);
        for (String part : query.split("&")) {
            if (part.isBlank()) {
                continue;
            }
            int separator = part.indexOf('=');
            String key = separator < 0 ? part : part.substring(0, separator);
            String value = separator < 0 ? "" : part.substring(separator + 1);
            result.put(urlDecode(key), urlDecode(value));
        }
        return result;
    }

    private static String urlDecode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static List<HostPort> uriSeeds(String rawUri, int fallbackPort, boolean srv) {
        String uri = firstText(rawUri);
        if (uri.isBlank()) {
            return List.of();
        }
        try {
            URI parsed = new URI(uri);
            String authority = firstText(parsed.getRawAuthority());
            int at = authority.lastIndexOf('@');
            if (at >= 0) {
                authority = authority.substring(at + 1);
            }
            if (authority.isBlank()) {
                return List.of();
            }
            List<HostPort> seeds = new ArrayList<>();
            for (String item : authority.split(",")) {
                HostPort hostPort = HostPort.parse(urlDecode(item), fallbackPort, srv);
                if (hostPort != null) {
                    seeds.add(hostPort);
                }
            }
            return seeds;
        } catch (URISyntaxException ignored) {
            return List.of();
        }
    }

    private static final class MongoConnectionProfile {
        private final ConnectionConfigDto config;
        private final String database;
        private final List<HostPort> seeds;
        private final int timeoutMs;
        private final boolean useSsl;
        private final String sslMode;
        private final boolean mongoSrv;
        private final String username;
        private final String password;
        private final String replicaUsername;
        private final String replicaPassword;
        private final String authSource;
        private final String authMechanism;
        private final String replicaSet;

        private MongoConnectionProfile(
                ConnectionConfigDto config,
                String database,
                List<HostPort> seeds,
                int timeoutMs,
                boolean useSsl,
                String sslMode,
                boolean mongoSrv,
                String username,
                String password,
                String replicaUsername,
                String replicaPassword,
                String authSource,
                String authMechanism,
                String replicaSet
        ) {
            this.config = config;
            this.database = database;
            this.seeds = seeds;
            this.timeoutMs = timeoutMs;
            this.useSsl = useSsl;
            this.sslMode = sslMode;
            this.mongoSrv = mongoSrv;
            this.username = username;
            this.password = password;
            this.replicaUsername = replicaUsername;
            this.replicaPassword = replicaPassword;
            this.authSource = authSource;
            this.authMechanism = authMechanism;
            this.replicaSet = replicaSet;
        }

        static MongoConnectionProfile from(ConnectionConfigDto config) {
            Map<String, String> uriParams = queryParams(config == null ? null : config.uri());
            boolean srv = booleanValue(
                    firstNonNull(
                            config == null ? null : config.mongoSrv(),
                            option(config, "mongoSrv"),
                            option(config, "mongoSRV")
                    ),
                    firstText(config == null ? null : config.uri()).toLowerCase(Locale.ROOT).startsWith("mongodb+srv://")
            );
            int fallbackPort = config == null || config.port() == null || config.port() <= 0 ? DEFAULT_PORT : config.port();
            List<HostPort> seeds = new ArrayList<>();
            List<String> explicitHosts = config == null ? List.of() : stringList(config.hosts());
            if (!explicitHosts.isEmpty()) {
                for (String host : explicitHosts) {
                    HostPort parsed = HostPort.parse(host, fallbackPort, srv);
                    if (parsed != null) {
                        seeds.add(parsed);
                    }
                }
            } else if (!firstText(config == null ? null : config.host()).isBlank()) {
                seeds.add(new HostPort(firstText(config.host()), fallbackPort));
            } else {
                seeds.addAll(uriSeeds(config == null ? null : config.uri(), fallbackPort, srv));
            }
            if (seeds.isEmpty()) {
                seeds.add(new HostPort("localhost", fallbackPort));
            }
            String database = firstText(config == null ? null : config.database(), uriDatabase(config == null ? null : config.uri()), "admin");
            String username = firstText(config == null ? null : config.username(), uriUsername(config == null ? null : config.uri()));
            String password = firstText(config == null ? null : config.password(), uriPassword(config == null ? null : config.uri()));
            String authSource = firstText(config == null ? null : config.authSource(), text(option(config, "authSource")), uriParams.get("authSource"), username.isBlank() ? "" : "admin");
            String mechanism = firstText(config == null ? null : config.mongoAuthMechanism(), text(option(config, "mongoAuthMechanism")), uriParams.get("authMechanism"));
            String sslModeRaw = firstText(config == null ? null : config.sslMode(), text(option(config, "sslMode")), uriParams.get("tls"), uriParams.get("ssl"));
            String sslMode = normalizeSslMode(sslModeRaw);
            boolean sslModeExplicit = !sslModeRaw.isBlank();
            boolean useSsl = booleanValue(config == null ? null : config.useSSL(), false)
                    || srv
                    || tlsQueryEnabled(uriParams.get("tls"))
                    || tlsQueryEnabled(uriParams.get("ssl"));
            if (sslModeExplicit && Set.of("required", "skip-verify").contains(sslMode)) {
                useSsl = true;
            }
            return new MongoConnectionProfile(
                    config,
                    database,
                    List.copyOf(seeds),
                    mongoTimeoutMs(config),
                    useSsl,
                    useSsl ? sslMode : "disable",
                    srv,
                    username,
                    password,
                    firstText(config == null ? null : config.mongoReplicaUser(), text(option(config, "mongoReplicaUser"))),
                    firstText(config == null ? null : config.mongoReplicaPassword(), text(option(config, "mongoReplicaPassword"))),
                    authSource,
                    mechanism,
                    firstText(config == null ? null : config.replicaSet(), text(option(config, "replicaSet")), text(option(config, "mongoReplicaSet")), uriParams.get("replicaSet"))
            );
        }

        List<MongoConnectionAttempt> attempts() {
            List<TlsAttempt> tlsAttempts = tlsAttempts();
            List<AuthAttempt> authAttempts = authAttempts();
            List<MongoConnectionAttempt> attempts = new ArrayList<>();
            for (HostPort seed : seeds) {
                for (TlsAttempt tls : tlsAttempts) {
                    for (AuthAttempt auth : authAttempts) {
                        attempts.add(new MongoConnectionAttempt(
                                seed.host(),
                                seed.port(),
                                timeoutMs,
                                tls.enabled(),
                                tls.insecure(),
                                auth.username(),
                                auth.password(),
                                authSource.isBlank() ? "admin" : authSource,
                                auth.mechanism(),
                                networkConfigForSeed(config, seed),
                                seed.host() + ":" + seed.port() + " tls=" + tls.label() + " auth=" + auth.label()
                        ));
                    }
                }
            }
            return attempts;
        }

        private static ConnectionConfigDto networkConfigForSeed(ConnectionConfigDto config, HostPort seed) {
            if (config == null) {
                return new ConnectionConfigDto(
                        "mongo-runtime",
                        "MongoDB",
                        "mongodb",
                        null,
                        seed.host(),
                        seed.port(),
                        "admin",
                        "",
                        "",
                        Map.of(),
                        DEFAULT_TIMEOUT_MS / 1000,
                        false,
                        "disable",
                        false,
                        null,
                        null,
                        false,
                        null,
                        null,
                        null,
                        List.of(),
                        null,
                        null,
                        null,
                        null,
                        false,
                        null,
                        null,
                        null
                );
            }
            return config.withEndpoint(seed.host(), seed.port());
        }

        private List<TlsAttempt> tlsAttempts() {
            if (!useSsl || "disable".equals(sslMode)) {
                return List.of(new TlsAttempt(false, false, "plain"));
            }
            boolean insecure = "skip-verify".equals(sslMode) || "preferred".equals(sslMode);
            List<TlsAttempt> attempts = new ArrayList<>();
            attempts.add(new TlsAttempt(true, insecure, sslMode));
            if ("preferred".equals(sslMode) && !mongoSrv) {
                attempts.add(new TlsAttempt(false, false, "plain-fallback"));
            }
            return attempts;
        }

        private List<AuthAttempt> authAttempts() {
            if (username.isBlank() || "NONE".equalsIgnoreCase(authMechanism)) {
                return List.of(new AuthAttempt("", "", "", "none"));
            }
            List<AuthIdentity> identities = new ArrayList<>();
            identities.add(new AuthIdentity(username, password, "primary"));
            if (!replicaUsername.isBlank() && (!replicaUsername.equals(username) || !replicaPassword.equals(password))) {
                identities.add(new AuthIdentity(replicaUsername, replicaPassword, "replica"));
            }
            List<String> mechanisms = authMechanism.isBlank()
                    ? List.of("SCRAM-SHA-256", "SCRAM-SHA-1")
                    : List.of(authMechanism.toUpperCase(Locale.ROOT));
            List<AuthAttempt> attempts = new ArrayList<>();
            for (AuthIdentity identity : identities) {
                for (String mechanism : mechanisms) {
                    attempts.add(new AuthAttempt(identity.username(), identity.password(), mechanism, identity.label() + "/" + mechanism));
                }
            }
            return attempts;
        }

        String database() {
            return database;
        }

        List<HostPort> seeds() {
            return seeds;
        }

        boolean tlsEnabled() {
            return useSsl && !"disable".equals(sslMode);
        }

        boolean tlsInsecure() {
            return tlsEnabled() && ("skip-verify".equals(sslMode) || "preferred".equals(sslMode));
        }

        boolean preferredTlsFallback() {
            return tlsEnabled() && "preferred".equals(sslMode) && !mongoSrv;
        }

        String sslMode() {
            return sslMode;
        }

        boolean mongoSrv() {
            return mongoSrv;
        }

        String username() {
            return username;
        }

        String password() {
            return password;
        }

        String replicaUsername() {
            return replicaUsername;
        }

        String authSource() {
            return authSource;
        }

        String authMechanism() {
            return authMechanism;
        }

        String replicaSet() {
            return replicaSet;
        }
    }

    private static String normalizeSslMode(String raw) {
        String value = firstText(raw).toLowerCase(Locale.ROOT);
        return switch (value) {
            case "required", "require", "true", "1", "yes", "on", "mandatory", "strict" -> "required";
            case "skip-verify", "skipverify", "skip_verify", "insecure", "insecure-skip-verify" -> "skip-verify";
            case "preferred", "prefer", "compat", "compatibility" -> "preferred";
            case "disable", "disabled", "false", "0", "no", "off", "none" -> "disable";
            default -> DEFAULT_SSL_MODE;
        };
    }

    private static boolean tlsQueryEnabled(String raw) {
        String value = firstText(raw).toLowerCase(Locale.ROOT);
        return Set.of("1", "true", "t", "yes", "y", "on", "required").contains(value);
    }

    private static String uriDatabase(String rawUri) {
        try {
            URI uri = new URI(firstText(rawUri));
            String path = firstText(uri.getRawPath());
            if (path.startsWith("/") && path.length() > 1) {
                return urlDecode(path.substring(1));
            }
        } catch (URISyntaxException ignored) {
            // keep explicit config/default database
        }
        return "";
    }

    private static String uriUsername(String rawUri) {
        try {
            URI uri = new URI(firstText(rawUri));
            String userInfo = firstText(uri.getRawUserInfo());
            if (userInfo.isBlank()) {
                return "";
            }
            int separator = userInfo.indexOf(':');
            return urlDecode(separator < 0 ? userInfo : userInfo.substring(0, separator));
        } catch (URISyntaxException ignored) {
            return "";
        }
    }

    private static String uriPassword(String rawUri) {
        try {
            URI uri = new URI(firstText(rawUri));
            String userInfo = firstText(uri.getRawUserInfo());
            int separator = userInfo.indexOf(':');
            return separator < 0 ? "" : urlDecode(userInfo.substring(separator + 1));
        } catch (URISyntaxException ignored) {
            return "";
        }
    }

    private static boolean booleanValue(Object value, boolean fallback) {
        String text = text(value).toLowerCase(Locale.ROOT);
        if (text.isBlank()) {
            return fallback;
        }
        if (Set.of("1", "true", "t", "yes", "y", "on", "required").contains(text)) {
            return true;
        }
        if (Set.of("0", "false", "f", "no", "n", "off", "disable", "disabled").contains(text)) {
            return false;
        }
        return fallback;
    }

    private record HostPort(String host, int port) {
        static HostPort parse(String raw, int fallbackPort, boolean srv) {
            String text = firstText(raw);
            if (text.isBlank()) {
                return null;
            }
            if (srv) {
                return new HostPort(text.replaceFirst(":\\d+$", ""), DEFAULT_PORT);
            }
            int colon = text.lastIndexOf(':');
            if (colon > 0 && colon < text.length() - 1 && text.indexOf(']') < colon) {
                try {
                    return new HostPort(text.substring(0, colon), Integer.parseInt(text.substring(colon + 1)));
                } catch (NumberFormatException ignored) {
                    return new HostPort(text, fallbackPort);
                }
            }
            return new HostPort(text, fallbackPort);
        }
    }

    private record TlsAttempt(boolean enabled, boolean insecure, String label) {
    }

    private record AuthIdentity(String username, String password, String label) {
    }

    private record AuthAttempt(String username, String password, String mechanism, String label) {
    }

    private record MongoConnectionAttempt(
            String host,
            int port,
            int timeoutMs,
            boolean tls,
            boolean tlsInsecure,
            String username,
            String password,
            String authSource,
            String mechanism,
            ConnectionConfigDto networkConfig,
            String label
    ) {
        boolean hasAuth() {
            return !firstText(username).isBlank() && !firstText(mechanism).isBlank();
        }
    }

    private record BsonBinary(byte subtype, byte[] bytes) {
    }

    private record ScramProof(byte[] clientProof, byte[] serverSignature) {
    }

    private record HelloResult(
            String replicaSet,
            String primary,
            String me,
            boolean writablePrimary,
            List<String> hosts,
            List<String> passives,
            List<String> arbiters
    ) {
        static HelloResult from(Map<String, Object> document) {
            return new HelloResult(
                    firstText(text(document.get("setName")), text(document.get("set"))),
                    text(document.get("primary")),
                    text(document.get("me")),
                    Boolean.TRUE.equals(document.get("isWritablePrimary")) || Boolean.TRUE.equals(document.get("ismaster")),
                    stringList(document.get("hosts")),
                    stringList(document.get("passives")),
                    stringList(document.get("arbiters"))
            );
        }

        private static List<String> stringList(Object value) {
            if (!(value instanceof List<?> list)) {
                return List.of();
            }
            return list.stream().map(MongoCompatibilityService::text).filter(item -> !item.isBlank()).toList();
        }
    }

    private static final class FieldStats {
        private final LinkedHashSet<String> observedTypes = new LinkedHashSet<>();
        private boolean required;
        private boolean nullAllowed;
        private boolean primary;
        private int presentDocuments;
        private int totalDocuments;

        void addType(String type) {
            String normalized = normalizeTypeName(type);
            if (!normalized.isBlank() && !"null".equals(normalized)) {
                observedTypes.add(normalized);
            }
        }

        void markRequired() {
            this.required = true;
        }

        void markNullAllowed() {
            this.nullAllowed = true;
        }

        void markPrimary() {
            this.primary = true;
            this.required = true;
        }

        void markPresent(String path, Set<String> seenInDocument) {
            if (seenInDocument.add(path)) {
                this.presentDocuments += 1;
            }
        }

        void setTotalDocuments(int totalDocuments) {
            this.totalDocuments = Math.max(this.totalDocuments, totalDocuments);
        }

        String renderType() {
            if (observedTypes.isEmpty()) {
                return "unknown";
            }
            if (observedTypes.size() == 1) {
                return observedTypes.iterator().next();
            }
            return "mixed(" + String.join("|", observedTypes) + ")";
        }

        String nullableFlag() {
            if (primary || required) {
                return nullAllowed ? "YES" : "NO";
            }
            if (totalDocuments > 0 && presentDocuments < totalDocuments) {
                return "YES";
            }
            return nullAllowed ? "YES" : "NO";
        }

        String keyFlag() {
            return primary ? "PRI" : "";
        }
    }
}
