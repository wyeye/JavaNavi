package com.javanavi.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.connections.ConnectionPackageCompatibilityService;
import com.javanavi.files.ExportedFileRevealService;
import com.javanavi.i18n.AppLanguage;
import com.javanavi.model.GlobalProxyConfigDto;
import com.javanavi.model.SavedConnectionViewDto;
import com.javanavi.security.SecretStore;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

@Service
public class AppCompatibilityService {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final String GLOBAL_PROXY_SECRET_KEY = "global-proxy:password";
    private static final String GLOBAL_PROXY_SECRET_REF = "global-proxy";

    private final ObjectMapper objectMapper;
    private final ConnectionPackageCompatibilityService connectionPackageCompatibilityService;
    private final ExportedFileRevealService exportedFileRevealService;
    private final SecretStore secretStore;
    private final Path dataDirectory;
    private final Path globalProxyFile;
    private final Path languageFile;
    private final Path sqlWorkspaceDirectory;

    public AppCompatibilityService(
            SecurityProperties securityProperties,
            ObjectMapper objectMapper,
            ConnectionPackageCompatibilityService connectionPackageCompatibilityService,
            ExportedFileRevealService exportedFileRevealService,
            SecretStore secretStore
    ) {
        this.objectMapper = objectMapper;
        this.connectionPackageCompatibilityService = connectionPackageCompatibilityService;
        this.exportedFileRevealService = exportedFileRevealService;
        this.secretStore = secretStore;
        this.dataDirectory = Path.of(securityProperties.getDataDirectory()).toAbsolutePath().normalize();
        this.globalProxyFile = dataDirectory.resolve("global-proxy.json");
        this.languageFile = dataDirectory.resolve("language.json");
        this.sqlWorkspaceDirectory = dataDirectory.resolve("sql-workspace").normalize();
    }

    public Map<String, Object> appInfo() {
        return orderedMap(
                "name", "JavaNavi",
                "version", "0.1.5",
                "backend", "java-spring-boot",
                "packageType", "java-web",
                "dataDirectory", dataDirectory.toString(),
                "author", "wyeye",
                "communityName", "QQ群",
                "communityGroupNumber", "1001949448",
                "communityUrl", "",
                "repoUrl", "https://github.com/wyeye/JavaNavi"
        );
    }

    public Map<String, Object> dataRootInfo() {
        Path driverPath = dataDirectory.resolve("drivers");
        return orderedMap(
                "path", dataDirectory.toString(),
                "directory", dataDirectory.toString(),
                "defaultPath", dataDirectory.toString(),
                "driverPath", driverPath.toString(),
                "bootstrapPath", dataDirectory.resolve("connections.json").toString(),
                "exists", Files.isDirectory(dataDirectory),
                "isDefaultPath", true,
                "webManaged", true
        );
    }

    public synchronized Map<String, Object> getGlobalProxy() {
        Map<String, Object> stored = readMap(globalProxyFile);
        boolean hasPassword = secretStore.get(GLOBAL_PROXY_SECRET_KEY).isPresent() || bool(stored.get("hasPassword"));
        Map<String, Object> result = defaultGlobalProxy();
        result.putAll(stored);
        result.put("password", "");
        result.put("hasPassword", hasPassword);
        result.put("secretRef", GLOBAL_PROXY_SECRET_REF);
        return result;
    }

    public synchronized Map<String, Object> getLanguage() {
        Map<String, Object> stored = readMap(languageFile);
        String language = AppLanguage.from(stored.get("language")) == AppLanguage.ZH ? "zh" : "en";
        return orderedMap("language", language);
    }

    public synchronized Map<String, Object> saveLanguage(String rawLanguage) {
        AppLanguage language = AppLanguage.from(rawLanguage);
        Map<String, Object> value = orderedMap("language", language == AppLanguage.ZH ? "zh" : "en");
        writeMap(languageFile, value);
        return value;
    }

    public synchronized Map<String, Object> saveGlobalProxy(GlobalProxyConfigDto input) {
        Map<String, Object> next = defaultGlobalProxy();
        if (input != null) {
            next.put("enabled", Boolean.TRUE.equals(input.enabled()));
            next.put("type", textOrDefault(input.type(), "socks5"));
            next.put("host", textOrDefault(input.host(), ""));
            next.put("port", input.port() == null || input.port() < 1 || input.port() > 65535 ? defaultPort(input.type()) : input.port());
            next.put("user", textOrDefault(input.user(), ""));
            if (input.password() != null && !input.password().isBlank()) {
                secretStore.put(GLOBAL_PROXY_SECRET_KEY, input.password());
                next.put("hasPassword", true);
            } else if (Boolean.TRUE.equals(input.clearPassword())) {
                secretStore.delete(GLOBAL_PROXY_SECRET_KEY);
                next.put("hasPassword", false);
            } else {
                next.put("hasPassword", secretStore.get(GLOBAL_PROXY_SECRET_KEY).isPresent());
            }
        }
        next.put("password", "");
        next.put("secretRef", GLOBAL_PROXY_SECRET_REF);
        writeMap(globalProxyFile, next);
        return getGlobalProxy();
    }

    public void logWindowDiagnostic(String stage, String payload) {
        try {
            Path logFile = dataDirectory.resolve("diagnostics").resolve("window.log");
            Files.createDirectories(logFile.getParent());
            String line = objectMapper.writeValueAsString(orderedMap(
                    "ts", Instant.now().toString(),
                    "stage", textOrDefault(stage, "unknown"),
                    "payload", textOrDefault(payload, "")
            ));
            Files.writeString(logFile, line + System.lineSeparator(), StandardCharsets.UTF_8,
                    Files.exists(logFile)
                            ? java.nio.file.StandardOpenOption.APPEND
                            : java.nio.file.StandardOpenOption.CREATE);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi diagnostic log.", error);
        }
    }

    public Map<String, Object> exportConnectionsPackage(Boolean includeSecrets, String filePassword) {
        try {
            Files.createDirectories(dataDirectory.resolve("exports"));
            Path exportFile = dataDirectory.resolve("exports").resolve("connections-" + Instant.now().toEpochMilli() + ".javanavi-conn");
            Map<String, Object> payload = connectionPackageCompatibilityService.buildExportFile(Boolean.TRUE.equals(includeSecrets), filePassword);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(exportFile.toFile(), payload);
            Map<String, Object> result = orderedMap(
                    "path", exportFile.toString(),
                    "filePath", exportFile.toString(),
                    "filename", exportFile.getFileName().toString(),
                    "secretsIncluded", Boolean.TRUE.equals(includeSecrets),
                    "javaNaviPackage", true,
                    "schemaVersion", payload.get("v"),
                    "protection", payload.get("p")
            );
            result.putAll(exportedFileRevealService.revealFields(exportFile));
            return result;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to export JavaNavi connections package.", error);
        }
    }

    public List<SavedConnectionViewDto> importConnectionsPayload(String raw, String password) {
        return connectionPackageCompatibilityService.importPayload(raw, password);
    }

    public Map<String, Object> resolveDatabaseSqlWorkspace(String connectionId, String dbName) {
        try {
            Path directory = databaseSqlWorkspaceDirectory(connectionId, dbName);
            Files.createDirectories(directory);
            return orderedMap(
                    "path", directory.toString(),
                    "name", directory.getFileName() == null ? directory.toString() : directory.getFileName().toString(),
                    "connectionId", safePathSegment(connectionId, "connection"),
                    "dbName", textOrDefault(dbName, "database"),
                    "webManaged", true,
                    "workspaceRoot", sqlWorkspaceDirectory.toString()
            );
        } catch (IOException error) {
            throw new IllegalStateException("Unable to prepare JavaNavi SQL workspace directory.", error);
        }
    }

    public Map<String, Object> selectLocalFile(Map<String, Object> input) {
        String kind = textOrDefault(input == null ? null : String.valueOf(input.get("kind")), "file");
        return orderedMap(
                "selected", false,
                "path", "",
                "kind", kind,
                "desktopRequired", true,
                "message", "Use the JavaNavi desktop native file selector for local files."
        );
    }

    public Object readLocalFile(String rawPath) {
        Path file = Path.of(textOrDefault(rawPath, "")).toAbsolutePath().normalize();
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("Selected local file does not exist.");
        }
        if (!file.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".sql")) {
            throw new IllegalArgumentException("Only SQL files can be opened through this action.");
        }
        try {
            long size = Files.size(file);
            if (size > 50L * 1024L * 1024L) {
                return orderedMap(
                        "isLargeFile", true,
                        "filePath", file.toString(),
                        "path", file.toString(),
                        "fileSize", size,
                        "fileSizeMB", String.format(Locale.ROOT, "%.1f", size / 1024.0 / 1024.0),
                        "webManaged", false,
                        "desktopLocal", true
                );
            }
            return orderedMap(
                    "content", Files.readString(file, StandardCharsets.UTF_8),
                    "filePath", file.toString(),
                    "path", file.toString(),
                    "name", file.getFileName().toString(),
                    "webManaged", false,
                    "desktopLocal", true
            );
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JavaNavi local SQL file.", error);
        }
    }

    public Map<String, Object> selectSqlDirectory(String currentPath) {
        try {
            Path directory = resolveSqlWorkspacePath(currentPath, true);
            Files.createDirectories(directory);
            return orderedMap(
                    "path", directory.toString(),
                    "name", directory.getFileName() == null ? directory.toString() : directory.getFileName().toString(),
                    "webManaged", true,
                    "workspaceRoot", sqlWorkspaceDirectory.toString()
            );
        } catch (IOException error) {
            throw new IllegalStateException("Unable to prepare JavaNavi SQL workspace directory.", error);
        }
    }

    public List<Map<String, Object>> listSqlDirectory(String directoryPath) {
        try {
            Path directory = resolveSqlWorkspacePath(directoryPath, true);
            Files.createDirectories(directory);
            try (Stream<Path> stream = Files.list(directory)) {
                return stream
                        .filter(path -> Files.isDirectory(path) || path.getFileName().toString().toLowerCase().endsWith(".sql"))
                        .sorted(Comparator
                                .comparing((Path path) -> !Files.isDirectory(path))
                                .thenComparing(path -> path.getFileName().toString().toLowerCase()))
                        .map(this::sqlDirectoryEntry)
                        .toList();
            }
        } catch (IOException error) {
            throw new IllegalStateException("Unable to list JavaNavi SQL workspace directory.", error);
        }
    }

    public Map<String, Object> uploadSqlFile(String directoryPath, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Please upload a non-empty SQL file.");
        }
        try {
            Path directory = resolveSqlWorkspacePath(directoryPath, true);
            Files.createDirectories(directory);
            Path target = directory.resolve(requireSqlFileName(file.getOriginalFilename())).normalize();
            if (!target.startsWith(sqlWorkspaceRoot())) {
                throw new IllegalArgumentException("SQL workspace paths must stay inside the JavaNavi managed SQL workspace.");
            }
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
            return orderedMap(
                    "path", target.toString(),
                    "filePath", target.toString(),
                    "name", target.getFileName().toString(),
                    "size", Files.size(target),
                    "webManaged", true
            );
        } catch (IOException error) {
            throw new IllegalStateException("Unable to upload JavaNavi SQL workspace file.", error);
        }
    }

    public Map<String, Object> createSqlDirectory(String parentPath, String name) {
        try {
            Path parent = resolveSqlWorkspacePath(parentPath, true);
            Files.createDirectories(parent);
            Path target = parent.resolve(requireWorkspaceName(name)).normalize();
            if (!target.startsWith(sqlWorkspaceRoot())) {
                throw new IllegalArgumentException("SQL workspace paths must stay inside the JavaNavi managed SQL workspace.");
            }
            Files.createDirectories(target);
            return sqlDirectoryEntry(target);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to create JavaNavi SQL workspace directory.", error);
        }
    }

    public Map<String, Object> renameSqlPath(String path, String newName) {
        try {
            Path source = resolveSqlWorkspaceExistingPath(path);
            if (!Files.exists(source)) {
                throw new IllegalArgumentException("Selected path does not exist in the JavaNavi managed SQL workspace.");
            }
            String normalizedName = Files.isDirectory(source)
                    ? requireWorkspaceName(newName)
                    : requireSqlFileName(newName);
            Path target = source.resolveSibling(normalizedName).normalize();
            if (!target.startsWith(sqlWorkspaceRoot())) {
                throw new IllegalArgumentException("SQL workspace paths must stay inside the JavaNavi managed SQL workspace.");
            }
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
            return sqlDirectoryEntry(target);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to rename JavaNavi SQL workspace path.", error);
        }
    }

    public Object readSqlFile(String filePath) {
        try {
            Path file = resolveSqlWorkspacePath(filePath, false);
            if (!Files.isRegularFile(file)) {
                throw new IllegalArgumentException("Selected path is not a SQL file in the JavaNavi managed workspace.");
            }
            long size = Files.size(file);
            if (size > 50L * 1024L * 1024L) {
                return orderedMap(
                        "isLargeFile", true,
                        "filePath", file.toString(),
                        "path", file.toString(),
                        "fileSize", size,
                        "fileSizeMB", String.format("%.1f", size / 1024.0 / 1024.0),
                        "webManaged", true
                );
            }
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JavaNavi SQL workspace file.", error);
        }
    }

    public Map<String, Object> writeSqlFile(String filePath, String content) {
        try {
            Path file = resolveSqlWorkspacePath(filePath, false);
            if (Files.isDirectory(file)) {
                throw new IllegalArgumentException("Selected path is a directory, not a SQL file.");
            }
            Files.createDirectories(file.getParent());
            Files.writeString(file, content == null ? "" : content, StandardCharsets.UTF_8);
            return orderedMap(
                    "filePath", file.toString(),
                    "path", file.toString(),
                    "name", file.getFileName().toString(),
                    "size", Files.size(file),
                    "webManaged", true
            );
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi SQL workspace file.", error);
        }
    }

    public Map<String, Object> unsupported(String method) {
        return orderedMap(
                "method", textOrDefault(method, "unknown"),
                "supported", false,
                "message", textOrDefault(method, "This capability") + " is unavailable in the JavaNavi Java Web execution context."
        );
    }

    private Map<String, Object> readMap(Path file) {
        try {
            if (!Files.exists(file)) {
                return new LinkedHashMap<>();
            }
            String json = Files.readString(file, StandardCharsets.UTF_8);
            if (json.isBlank()) {
                return new LinkedHashMap<>();
            }
            Map<String, Object> value = objectMapper.readValue(json, MAP_TYPE);
            return value == null ? new LinkedHashMap<>() : new LinkedHashMap<>(value);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JavaNavi app state.", error);
        }
    }

    private Map<String, Object> sqlDirectoryEntry(Path path) {
        try {
            boolean directory = Files.isDirectory(path);
            Map<String, Object> result = orderedMap(
                    "name", path.getFileName().toString(),
                    "path", path.toAbsolutePath().normalize().toString(),
                    "isDir", directory,
                    "size", directory ? 0 : Files.size(path),
                    "webManaged", true
            );
            if (directory) {
                try (Stream<Path> stream = Files.list(path)) {
                    List<Map<String, Object>> children = stream
                            .filter(child -> Files.isDirectory(child) || child.getFileName().toString().toLowerCase().endsWith(".sql"))
                            .sorted(Comparator
                                    .comparing((Path child) -> !Files.isDirectory(child))
                                    .thenComparing(child -> child.getFileName().toString().toLowerCase()))
                            .map(this::sqlDirectoryEntry)
                            .toList();
                    result.put("children", children);
                }
            }
            return result;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to inspect JavaNavi SQL workspace path.", error);
        }
    }

    private Path databaseSqlWorkspaceDirectory(String connectionId, String dbName) {
        return sqlWorkspaceDirectory.resolve("connections")
                .resolve(safePathSegment(connectionId, "connection"))
                .resolve("databases")
                .resolve(safePathSegment(dbName, "database"))
                .toAbsolutePath()
                .normalize();
    }

    private Path resolveSqlWorkspacePath(String rawPath, boolean directoryDefault) {
        String raw = rawPath == null ? "" : rawPath.trim();
        Path root = sqlWorkspaceRoot();
        if (raw.isBlank()) {
            return directoryDefault ? root : root.resolve("untitled-" + Instant.now().toEpochMilli() + ".sql").normalize();
        }

        Path input = Path.of(raw);
        Path candidate = input.isAbsolute()
                ? input.toAbsolutePath().normalize()
                : root.resolve(raw.replace('\\', '/')).normalize();
        if (Files.isDirectory(candidate) && !directoryDefault) {
            candidate = candidate.resolve("untitled-" + Instant.now().toEpochMilli() + ".sql").normalize();
        }
        if (!candidate.startsWith(root)) {
            throw new IllegalArgumentException("SQL workspace paths must stay inside the JavaNavi managed SQL workspace.");
        }
        if (!directoryDefault && !candidate.getFileName().toString().toLowerCase().endsWith(".sql")) {
            candidate = candidate.resolveSibling(candidate.getFileName() + ".sql").normalize();
        }
        return candidate;
    }

    private Path resolveSqlWorkspaceExistingPath(String rawPath) {
        String raw = rawPath == null ? "" : rawPath.trim();
        Path root = sqlWorkspaceRoot();
        if (raw.isBlank()) {
            throw new IllegalArgumentException("SQL workspace path must not be empty.");
        }
        Path input = Path.of(raw);
        Path candidate = input.isAbsolute()
                ? input.toAbsolutePath().normalize()
                : root.resolve(raw.replace('\\', '/')).normalize();
        if (!candidate.startsWith(root)) {
            throw new IllegalArgumentException("SQL workspace paths must stay inside the JavaNavi managed SQL workspace.");
        }
        return candidate;
    }

    private Path sqlWorkspaceRoot() {
        return sqlWorkspaceDirectory.toAbsolutePath().normalize();
    }

    private String safePathSegment(String value, String fallback) {
        String normalized = textOrDefault(value, fallback)
                .replace('\\', '-')
                .replace('/', '-')
                .replaceAll("[^A-Za-z0-9._-]+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^[-.]+|[-.]+$", "");
        return normalized.isBlank() ? fallback : normalized;
    }

    private String requireSqlFileName(String rawName) {
        String normalized = requireWorkspaceName(rawName);
        String withSqlSuffix = normalized.toLowerCase(Locale.ROOT).endsWith(".sql") ? normalized : normalized + ".sql";
        if (withSqlSuffix.contains("/") || withSqlSuffix.contains("\\")) {
            throw new IllegalArgumentException("SQL file names must not contain path separators.");
        }
        return withSqlSuffix;
    }

    private String requireWorkspaceName(String rawName) {
        String normalized = textOrDefault(rawName, "").trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("Workspace name must not be empty.");
        }
        if (normalized.contains("/") || normalized.contains("\\") || ".".equals(normalized) || "..".equals(normalized)) {
            throw new IllegalArgumentException("Workspace names must not contain path separators.");
        }
        return normalized;
    }

    private void writeMap(Path file, Map<String, Object> value) {
        try {
            Files.createDirectories(file.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), value);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JavaNavi app state.", error);
        }
    }

    private static Map<String, Object> defaultGlobalProxy() {
        return orderedMap(
                "enabled", false,
                "type", "socks5",
                "host", "",
                "port", 1080,
                "user", "",
                "password", "",
                "hasPassword", false,
                "secretRef", GLOBAL_PROXY_SECRET_REF
        );
    }

    private static int defaultPort(String type) {
        return "http".equalsIgnoreCase(type) ? 8080 : 1080;
    }

    private static String textOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static boolean bool(Object value) {
        return value instanceof Boolean bool && bool;
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            map.put(String.valueOf(entries[i]), entries[i + 1]);
        }
        return map;
    }
}
