package com.javanavi.driver;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.i18n.I18nMessages;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.net.URI;
import java.net.URL;
import java.net.URLClassLoader;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Properties;
import java.util.ServiceLoader;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import javax.xml.parsers.DocumentBuilderFactory;
import org.xml.sax.InputSource;

@Service
public class JdbcDriverRuntimeService {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final String DEFAULT_REPOSITORY_URL = "https://repo.maven.apache.org/maven2";
    private static final String METADATA_FILE_NAME = "driver-package.json";
    private static final String SETTINGS_FILE_NAME = "driver-runtime-settings.json";
    private static final String UPLOADS_DIR_NAME = "uploads";
    private static final String VERSIONED_DOWNLOADS_DIR_NAME = "versions";
    private static final Duration HTTP_TIMEOUT = Duration.ofSeconds(120);
    private static final int MAX_MAVEN_VERSION_OPTIONS = 80;

    private static final Map<String, DriverPackageDefinition> DEFINITIONS = definitions();
    private static final Map<String, String> ALIASES = aliases();

    private final ObjectMapper objectMapper;
    private final Path defaultDriverDirectory;
    private final HttpClient httpClient;
    private final I18nMessages messages;
    private final ConcurrentMap<String, DriverHandle> driverCache = new ConcurrentHashMap<>();

    public JdbcDriverRuntimeService(SecurityProperties securityProperties, ObjectMapper objectMapper, I18nMessages messages) {
        this.objectMapper = objectMapper;
        this.messages = messages;
        this.defaultDriverDirectory = Path.of(securityProperties.getDataDirectory()).toAbsolutePath().normalize().resolve("drivers");
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public boolean isManagedDriver(String driverType) {
        return definition(driverType).isPresent();
    }

    public boolean isClasspathAvailable(String driverType) {
        return definition(driverType)
                .map(definition -> classpathDriver(definition).isPresent())
                .orElse(false);
    }

    public boolean isRuntimeAvailable(String driverType, Path driverDirectory) {
        Optional<DriverPackageDefinition> definition = definition(driverType);
        if (definition.isEmpty()) {
            return loadInstalledCustomDriver(driverType, resolveDriverDirectory(driverDirectory), false).isPresent();
        }
        if (classpathDriver(definition.get()).isPresent()) {
            return true;
        }
        return loadInstalledDriver(definition.get(), resolveDriverDirectory(driverDirectory), false).isPresent();
    }

    public Connection openConnection(String driverType, String jdbcUrl, Properties properties) throws SQLException {
        String normalizedDriverType = normalizeDriverType(driverType);
        Optional<DriverPackageDefinition> definition = definition(normalizedDriverType);
        Driver driver;
        if (definition.isPresent()) {
            driver = loadDriver(definition.get(), defaultDriverDirectory, true);
        } else {
            driver = loadInstalledCustomDriver(normalizedDriverType, defaultDriverDirectory, true)
                    .orElseThrow(() -> new SQLException("No uploaded custom JDBC driver is available for driver type: " + normalizedDriverType));
        }
        Properties copy = new Properties();
        if (properties != null) {
            copy.putAll(properties);
        }
        Connection connection = driver.connect(jdbcUrl, copy);
        if (connection == null) {
            throw new SQLException("JDBC driver " + driver.getClass().getName() + " did not accept URL: " + jdbcUrl);
        }
        return connection;
    }

    public void ensureDriverAvailable(String driverType) throws SQLException {
        String normalizedDriverType = normalizeDriverType(driverType);
        Optional<DriverPackageDefinition> definition = definition(normalizedDriverType);
        if (definition.isPresent()) {
            loadDriver(definition.get(), defaultDriverDirectory, true);
            return;
        }
        loadInstalledCustomDriver(normalizedDriverType, defaultDriverDirectory, true)
                .orElseThrow(() -> new SQLException("No uploaded custom JDBC driver is available for driver type: " + normalizedDriverType));
    }

    public Map<String, Object> versionList(String driverType, String repositoryURL) {
        DriverPackageDefinition definition = requireDefinition(driverType);
        Artifact primary = definition.primaryArtifact();
        String repository = repositoryFromDownloadInput(repositoryURL, primary);
        MavenVersionLookup versionLookup = mavenVersions(repository, primary);
        List<String> versions = versionLookup.versions();
        if (!versions.contains(definition.version())) {
            versions = new ArrayList<>(versions);
            versions.add(0, definition.version());
        }
        boolean metadataBacked = versionLookup.metadataBacked();
        boolean versionListLimited = !metadataBacked || versions.size() > MAX_MAVEN_VERSION_OPTIONS;
        String metadataError = versionLookup.error();
        List<Map<String, Object>> options = versions.stream()
                .limit(MAX_MAVEN_VERSION_OPTIONS)
                .map(version -> {
                    Artifact artifact = primary.withVersion(version);
                    boolean pinned = version.equals(definition.version());
                    return orderedMap(
                            "version", version,
                            "downloadUrl", artifactUrl(repository, artifact),
                            "packageSizeBytes", pinned ? definition.totalSizeBytes() : 0,
                            "packageSizeText", pinned ? humanSize(definition.totalSizeBytes()) : "",
                            "recommended", pinned,
                            "source", metadataBacked ? "maven-metadata" : "javanavi-jdbc-runtime-manifest",
                            "displayLabel", pinned ? version + messages.message("drivers.recommendedSuffix") : version
                    );
                })
                .toList();
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "pinnedVersion", definition.version(),
                "repositoryUrl", repository,
                "versions", options,
                "javaStatus", "downloadable",
                "metadataBacked", metadataBacked,
                "versionListLimited", versionListLimited,
                "metadataUrl", versionLookup.metadataURL(),
                "metadataURL", versionLookup.metadataURL(),
                "metadataError", metadataError,
                "message", metadataBacked
                        ? ""
                        : messages.message("drivers.versionMetadataUnavailable", "reason", metadataError),
                "dryRun", true
        );
    }

    public Map<String, Object> packageSize(String driverType, String version) {
        DriverPackageDefinition definition = requireDefinition(driverType);
        String versionText = requestedVersion(definition, version);
        DriverPackageDefinition selected = definition.withVersion(versionText);
        long packageSizeBytes = versionText.equals(definition.version())
                ? definition.totalSizeBytes()
                : selected.artifacts().stream()
                .mapToLong(artifact -> remoteContentLength(effectiveRepositoryURL(), artifact).orElse(0L))
                .sum();
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "version", versionText,
                "packageSizeBytes", packageSizeBytes,
                "packageSizeText", packageSizeBytes > 0 ? humanSize(packageSizeBytes) : messages.message("drivers.mavenDownload"),
                "releaseAssetName", selected.primaryArtifact().fileName(),
                "sizeSource", versionText.equals(definition.version()) ? "javanavi-jdbc-runtime-manifest" : "maven-repository-head",
                "dryRun", true
        );
    }

    public Map<String, Object> resolvePackageDownloadURL(String driverType, String repositoryURL) {
        DriverPackageDefinition definition = requireDefinition(driverType);
        String repository = repositoryFromDownloadInput(repositoryURL, definition.primaryArtifact());
        return orderedMap(
                "url", artifactUrl(repository, definition.primaryArtifact()),
                "downloadUrl", artifactUrl(repository, definition.primaryArtifact()),
                "driverType", definition.type(),
                "driverName", definition.name(),
                "version", definition.version(),
                "engine", "java-jdbc-runtime",
                "repositoryUrl", repository,
                "javaStatus", "downloadable",
                "artifactCount", definition.artifacts().size(),
                "dryRun", true
        );
    }

    public Map<String, Object> downloadPackage(String driverType, String version, String repositoryURL, Path driverDirectory) {
        DriverPackageDefinition definition = requireDefinition(driverType);
        String versionText = requestedVersion(definition, version);
        DriverPackageDefinition selected = definition.withVersion(versionText);
        Artifact selectedPrimary = selected.primaryArtifact();
        String repository = repositoryFromDownloadInput(repositoryURL, selectedPrimary);
        Path installDir = installDir(resolveDriverDirectory(driverDirectory), definition.type());
        Path versionInstallDir = versionInstallDir(installDir, versionText);
        ensureDirectory(installDir);
        ensureDirectory(versionInstallDir);
        List<Map<String, Object>> artifactMetadata = new ArrayList<>();
        List<String> jarPaths = new ArrayList<>();

        for (Artifact artifact : selected.artifacts()) {
            Path target = versionInstallDir.resolve(artifact.fileName()).normalize();
            if (!target.startsWith(versionInstallDir)) {
                throw new IllegalStateException("Resolved JDBC driver artifact path escaped the install directory.");
            }
            String expectedSha256 = text(artifact.sha256());
            if (!Files.isRegularFile(target)
                    || (!expectedSha256.isBlank() && !sha256Hex(target).equalsIgnoreCase(expectedSha256))) {
                downloadArtifact(repository, artifact, target);
            }
            String actualSha256 = sha256Hex(target);
            if (!expectedSha256.isBlank() && !actualSha256.equalsIgnoreCase(expectedSha256)) {
                throw new IllegalStateException("Downloaded JDBC driver checksum mismatch for " + artifact.fileName());
            }
            jarPaths.add(target.toString());
            artifactMetadata.add(orderedMap(
                    "groupId", artifact.groupId(),
                    "artifactId", artifact.artifactId(),
                    "version", artifact.version(),
                    "fileName", artifact.fileName(),
                    "filePath", target.toString(),
                    "sha256", artifact.sha256(),
                    "sizeBytes", artifact.sizeBytes(),
                    "downloadUrl", artifactUrl(repository, artifact)
            ));
        }

        Map<String, Object> versionMetadata = orderedMap(
                "driverType", definition.type(),
                "version", versionText,
                "driverClassName", definition.driverClassName(),
                "filePath", versionInstallDir.resolve(METADATA_FILE_NAME).toString(),
                "fileName", METADATA_FILE_NAME,
                "jars", jarPaths,
                "artifacts", artifactMetadata,
                "downloadUrl", artifactUrl(repository, selectedPrimary),
                "repositoryUrl", repository,
                "sha256", artifactMetadata.isEmpty() ? "" : text(artifactMetadata.get(0).get("sha256")),
                "downloadedAt", Instant.now().toString(),
                "installMode", "managed-download",
                "installDir", versionInstallDir.toString(),
                "runtimeAvailable", true,
                "connectable", true,
                "dryRun", false
        );
        writeMetadata(versionInstallDir, versionMetadata);
        Map<String, Object> activeMetadata = new LinkedHashMap<>(versionMetadata);
        activeMetadata.put("filePath", installDir.resolve(METADATA_FILE_NAME).toString());
        activeMetadata.put("activeVersionDirectory", versionInstallDir.toString());
        writeMetadata(installDir, activeMetadata);
        invalidateDriverCache(definition.type());
        loadInstalledDriver(definition, resolveDriverDirectory(driverDirectory), false)
                .orElseThrow(() -> new IllegalStateException("Downloaded JDBC driver could not be loaded: " + definition.type()));
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "version", versionText,
                "engine", "java-jdbc-runtime",
                "packageInstalled", true,
                "runtimeAvailable", true,
                "connectable", true,
                "installDir", versionInstallDir.toString(),
                "artifacts", artifactMetadata,
                "message", definition.name() + " JDBC driver downloaded and enabled."
        );
    }

    public Map<String, Object> installLocalPackage(String driverType, String packagePath, Path driverDirectory, String version) {
        return installLocalPackage(driverType, packagePath, driverDirectory, version, "managed-local-import");
    }

    public Map<String, Object> installLocalPackage(String driverType, String packagePath, Path driverDirectory, String version, String installMode) {
        DriverPackageDefinition definition = requireDefinition(driverType);
        Path source = Path.of(requireText(packagePath, "packagePath")).toAbsolutePath().normalize();
        if (!Files.exists(source)) {
            throw new IllegalArgumentException("Local JDBC driver package path does not exist: " + source);
        }
        Path installDir = installDir(resolveDriverDirectory(driverDirectory), definition.type());
        ensureDirectory(installDir);
        List<Path> sources = localJarSources(source, definition);
        if (sources.isEmpty()) {
            throw new IllegalArgumentException("No JDBC jar files found for " + definition.name() + " in " + source);
        }
        List<String> jarPaths = new ArrayList<>();
        List<Map<String, Object>> artifacts = new ArrayList<>();
        for (Path jar : sources) {
            Path target = installDir.resolve(jar.getFileName().toString()).normalize();
            if (!target.startsWith(installDir)) {
                throw new IllegalStateException("Resolved JDBC driver artifact path escaped the install directory.");
            }
            try {
                Files.copy(jar, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException error) {
                throw new IllegalStateException("Unable to copy local JDBC driver jar: " + jar, error);
            }
            jarPaths.add(target.toString());
            artifacts.add(orderedMap(
                    "fileName", target.getFileName().toString(),
                    "filePath", target.toString(),
                    "sha256", sha256Hex(target),
                    "sizeBytes", size(target),
                    "sourcePath", source.toString()
            ));
        }
        Map<String, Object> metadata = orderedMap(
                "driverType", definition.type(),
                "version", textOrDefault(version, definition.version()),
                "driverClassName", definition.driverClassName(),
                "filePath", installDir.resolve(METADATA_FILE_NAME).toString(),
                "fileName", METADATA_FILE_NAME,
                "jars", jarPaths,
                "artifacts", artifacts,
                "downloadUrl", "",
                "sha256", artifacts.isEmpty() ? "" : text(artifacts.get(0).get("sha256")),
                "downloadedAt", Instant.now().toString(),
                "installMode", normalizeInstallMode(installMode),
                "runtimeAvailable", true,
                "connectable", true,
                "dryRun", false
        );
        writeMetadata(installDir, metadata);
        invalidateDriverCache(definition.type());
        loadInstalledDriver(definition, resolveDriverDirectory(driverDirectory), false)
                .orElseThrow(() -> new IllegalStateException("Imported JDBC driver could not be loaded: " + definition.type()));
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "version", textOrDefault(version, definition.version()),
                "engine", "java-jdbc-runtime",
                "packageInstalled", true,
                "runtimeAvailable", true,
                "connectable", true,
                "installDir", installDir.toString(),
                "installMode", normalizeInstallMode(installMode),
                "message", definition.name() + " local JDBC driver imported and enabled."
        );
    }

    public Map<String, Object> installCustomLocalPackage(String driverType, String packagePath, Path driverDirectory, String version, String installMode) {
        String normalizedDriverType = requireSafeCustomDriverType(driverType);
        Path source = Path.of(requireText(packagePath, "packagePath")).toAbsolutePath().normalize();
        if (!Files.exists(source)) {
            throw new IllegalArgumentException("Local JDBC driver package path does not exist: " + source);
        }
        Path root = resolveDriverDirectory(driverDirectory);
        Path installDir = installDir(root, normalizedDriverType);
        if (!installDir.startsWith(root)) {
            throw new IllegalArgumentException("Custom JDBC driver directory escaped the managed driver root.");
        }
        ensureDirectory(installDir);
        List<Path> sources = localJarSources(source, null);
        if (sources.isEmpty()) {
            throw new IllegalArgumentException("No JDBC jar files found for custom driver " + normalizedDriverType + " in " + source);
        }
        List<String> jarPaths = new ArrayList<>();
        List<Map<String, Object>> artifacts = new ArrayList<>();
        for (Path jar : sources) {
            Path target = installDir.resolve(jar.getFileName().toString()).normalize();
            if (!target.startsWith(installDir)) {
                throw new IllegalStateException("Resolved custom JDBC driver artifact path escaped the install directory.");
            }
            try {
                Files.copy(jar, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException error) {
                throw new IllegalStateException("Unable to copy custom JDBC driver jar: " + jar, error);
            }
            jarPaths.add(target.toString());
            artifacts.add(orderedMap(
                    "fileName", target.getFileName().toString(),
                    "filePath", target.toString(),
                    "sha256", sha256Hex(target),
                    "sizeBytes", size(target),
                    "sourcePath", source.toString()
            ));
        }
        String driverClassName = discoverDriverClassName(jarPaths)
                .orElseThrow(() -> new IllegalArgumentException(messages.message("drivers.noJdbcDriverInJar")));
        String versionText = textOrDefault(MojibakeTextNormalizer.normalize(version), messages.message("drivers.uploadVersionFallback"));
        Map<String, Object> metadata = orderedMap(
                "driverType", normalizedDriverType,
                "version", versionText,
                "driverClassName", driverClassName,
                "filePath", installDir.resolve(METADATA_FILE_NAME).toString(),
                "fileName", METADATA_FILE_NAME,
                "jars", jarPaths,
                "artifacts", artifacts,
                "downloadUrl", "",
                "sha256", artifacts.isEmpty() ? "" : text(artifacts.get(0).get("sha256")),
                "downloadedAt", Instant.now().toString(),
                "installMode", normalizeInstallMode(installMode),
                "installSource", "manual-upload",
                "customDriver", true,
                "runtimeAvailable", true,
                "connectable", true,
                "dryRun", false
        );
        writeMetadata(installDir, metadata);
        invalidateDriverCache(normalizedDriverType);
        loadInstalledCustomDriver(normalizedDriverType, root, false)
                .orElseThrow(() -> new IllegalStateException("Uploaded custom JDBC driver could not be loaded: " + normalizedDriverType));
        return orderedMap(
                "driverType", normalizedDriverType,
                "driverName", normalizedDriverType,
                "version", versionText,
                "driverClassName", driverClassName,
                "engine", "java-jdbc-runtime",
                "packageInstalled", true,
                "runtimeAvailable", true,
                "connectable", true,
                "installDir", installDir.toString(),
                "installMode", normalizeInstallMode(installMode),
                "installSource", "manual-upload",
                "message", messages.message("drivers.customJarUploaded")
        );
    }

    public Map<String, Object> removePackage(String driverType, Path driverDirectory) {
        DriverPackageDefinition definition = requireDefinition(driverType);
        Path installDir = installDir(resolveDriverDirectory(driverDirectory), definition.type());
        invalidateDriverCache(definition.type());
        deleteDirectory(installDir);
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "removed", true,
                "message", messages.message("drivers.metadataCacheRemoved")
        );
    }

    public Optional<Map<String, Object>> installedMetadata(String driverType, Path driverDirectory) {
        return definition(driverType).flatMap(definition -> readMetadata(installDir(resolveDriverDirectory(driverDirectory), definition.type())));
    }

    public List<Map<String, Object>> installedCustomDefinitionMetadataList(Path driverDirectory) {
        Path root = resolveDriverDirectory(driverDirectory);
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        try (var stream = Files.list(root)) {
            stream.filter(Files::isDirectory)
                    .filter(directory -> !UPLOADS_DIR_NAME.equals(directory.getFileName().toString()))
                    .filter(directory -> !VERSIONED_DOWNLOADS_DIR_NAME.equals(directory.getFileName().toString()))
                    .forEach(directory -> {
                        String driverType = directory.getFileName().toString();
                        if (definition(driverType).isPresent()) {
                            return;
                        }
                        try {
                            String normalizedDriverType = requireSafeCustomDriverType(driverType);
                            if (!installDir(root, normalizedDriverType).equals(directory.toAbsolutePath().normalize())) {
                                return;
                            }
                            readMetadata(directory.toAbsolutePath().normalize()).ifPresent(metadata -> rows.add(customDefinitionMetadataItem(
                                    normalizedDriverType,
                                    directory.toAbsolutePath().normalize(),
                                    metadata
                            )));
                        } catch (RuntimeException ignored) {
                            // Ignore unsafe or unreadable directories: callers receive repairable rows only for managed custom metadata.
                        }
                    });
        } catch (IOException error) {
            throw new IllegalStateException("Unable to list custom JDBC driver definitions.", error);
        }
        rows.sort((left, right) -> text(left.get("driverType")).compareToIgnoreCase(text(right.get("driverType"))));
        return rows;
    }

    public Map<String, Object> validateCustomDefinition(String driverType, Path driverDirectory) {
        String normalizedDriverType = requireSafeCustomDriverType(driverType);
        Path root = resolveDriverDirectory(driverDirectory);
        Path installDir = installDir(root, normalizedDriverType);
        Optional<Map<String, Object>> metadata;
        try {
            metadata = readMetadata(installDir);
        } catch (RuntimeException error) {
            return customValidationResult(
                    normalizedDriverType,
                    "",
                    "",
                    "",
                    List.of(),
                    false,
                    false,
                    "error",
                    "Custom JDBC driver metadata could not be read. Re-upload the Jar from Driver Manager.",
                    List.of("Open Driver Manager and upload this custom JDBC Jar again to repair its metadata.")
            );
        }
        if (metadata.isEmpty()) {
            return customValidationResult(
                    normalizedDriverType,
                    "",
                    "",
                    "",
                    List.of(),
                    false,
                    false,
                    "error",
                    "No custom JDBC driver metadata was found. Re-upload the Jar from Driver Manager.",
                    List.of("Open Driver Manager and upload this custom JDBC Jar again.")
            );
        }
        return customDefinitionMetadataItem(normalizedDriverType, installDir, metadata.get());
    }

    public List<Map<String, Object>> installedVersionMetadataList(String driverType, Path driverDirectory) {
        Optional<DriverPackageDefinition> definition = definition(driverType);
        if (definition.isEmpty()) {
            return List.of();
        }
        Path installDir = installDir(resolveDriverDirectory(driverDirectory), definition.get().type());
        Map<String, Map<String, Object>> versions = new LinkedHashMap<>();
        readMetadata(installDir).ifPresent(metadata -> {
            Map<String, Object> item = installedVersionItem(metadata, true);
            String key = textOrDefault(item.get("version"), "active") + "@active";
            versions.put(key, item);
        });
        Path versionsDir = installDir.resolve(VERSIONED_DOWNLOADS_DIR_NAME).normalize();
        if (versionsDir.startsWith(installDir) && Files.isDirectory(versionsDir)) {
            try (var stream = Files.list(versionsDir)) {
                stream
                        .filter(Files::isDirectory)
                        .map(this::readMetadata)
                        .flatMap(Optional::stream)
                        .forEach(metadata -> {
                            Map<String, Object> item = installedVersionItem(metadata, false);
                            String key = textOrDefault(item.get("version"), "") + "@" + text(item.get("installDir"));
                            if (!key.isBlank()) {
                                versions.putIfAbsent(key, item);
                            }
                        });
            } catch (IOException error) {
                throw new IllegalStateException("Unable to inspect installed JDBC driver versions.", error);
            }
        }
        List<Map<String, Object>> items = new ArrayList<>(versions.values());
        items.sort((left, right) -> {
            boolean leftActive = Boolean.TRUE.equals(left.get("active"));
            boolean rightActive = Boolean.TRUE.equals(right.get("active"));
            if (leftActive != rightActive) {
                return leftActive ? -1 : 1;
            }
            return text(right.get("downloadedAt")).compareTo(text(left.get("downloadedAt")));
        });
        return items;
    }

    public String defaultRepositoryURL() {
        return DEFAULT_REPOSITORY_URL;
    }

    public String effectiveRepositoryURL() {
        return sanitizeRepositoryURL(configuredRepositoryURL().orElse(""));
    }

    public Map<String, Object> repositorySettings() {
        Optional<String> configured = configuredRepositoryURL();
        String effective = sanitizeRepositoryURL(configured.orElse(""));
        return orderedMap(
                "repositoryUrl", effective,
                "configuredRepositoryUrl", configured.orElse(""),
                "repositoryConfigured", configured.isPresent(),
                "defaultRepositoryURL", DEFAULT_REPOSITORY_URL,
                "defaultRepositoryUrl", DEFAULT_REPOSITORY_URL
        );
    }

    public Map<String, Object> resolveRepositoryURL(String repositoryURL) {
        String resolved = sanitizeRepositoryURL(repositoryURL);
        return orderedMap(
                "url", resolved,
                "repositoryUrl", resolved,
                "defaultUrl", DEFAULT_REPOSITORY_URL,
                "defaultRepositoryURL", DEFAULT_REPOSITORY_URL,
                "webManaged", true
        );
    }

    public Map<String, Object> configureRepositoryURL(String repositoryURL) {
        String raw = text(repositoryURL);
        String resolved = raw.isBlank() ? "" : sanitizeRepositoryURL(raw);
        Map<String, Object> settings = orderedMap(
                "repositoryUrl", resolved,
                "updatedAt", Instant.now().toString()
        );
        writeSettings(settings);
        return repositorySettings();
    }

    public Path defaultDriverDirectory() {
        return defaultDriverDirectory;
    }

    private Driver loadDriver(DriverPackageDefinition definition, Path driverDirectory, boolean autoDownload) throws SQLException {
        Optional<Driver> classpath = classpathDriver(definition);
        if (classpath.isPresent()) {
            return classpath.get();
        }
        Path root = resolveDriverDirectory(driverDirectory);
        Optional<Driver> installed = loadInstalledDriver(definition, root, false);
        if (installed.isPresent()) {
            return installed.get();
        }
        if (autoDownload) {
            try {
                downloadPackage(definition.type(), definition.version(), effectiveRepositoryURL(), root);
                return loadInstalledDriver(definition, root, false)
                        .orElseThrow(() -> new SQLException("JDBC driver downloaded but could not be loaded: " + definition.type()));
            } catch (RuntimeException error) {
                throw new SQLException("JDBC driver is not bundled and automatic download failed for " + definition.name()
                        + ". Open Driver Manager to download/import it manually. Cause: " + error.getMessage(), error);
            }
        }
        throw new SQLException("JDBC driver is not bundled or installed: " + definition.name());
    }

    private Optional<Driver> classpathDriver(DriverPackageDefinition definition) {
        try {
            Class<?> driverClass = Class.forName(definition.driverClassName(), true, Thread.currentThread().getContextClassLoader());
            return Optional.of(instantiateDriver(driverClass));
        } catch (ReflectiveOperationException | LinkageError ignored) {
            return Optional.empty();
        }
    }

    private Optional<Driver> loadInstalledDriver(DriverPackageDefinition definition, Path driverDirectory, boolean strict) {
        return loadInstalledDriver(definition.type(), definition.driverClassName(), driverDirectory, strict);
    }

    private Optional<Driver> loadInstalledCustomDriver(String driverType, Path driverDirectory, boolean strict) {
        String normalizedDriverType;
        try {
            normalizedDriverType = requireSafeCustomDriverType(driverType);
        } catch (IllegalArgumentException error) {
            if (strict) {
                throw error;
            }
            return Optional.empty();
        }
        return loadInstalledDriver(normalizedDriverType, "", driverDirectory, strict);
    }

    private Optional<Driver> loadInstalledDriver(String driverType, String fallbackDriverClassName, Path driverDirectory, boolean strict) {
        String normalizedDriverType = normalizeDriverType(driverType);
        Path installDir = installDir(driverDirectory, normalizedDriverType);
        Optional<Map<String, Object>> metadata = readMetadata(installDir);
        if (metadata.isEmpty()) {
            return Optional.empty();
        }
        List<Path> jars = metadataJars(metadata.get(), installDir);
        if (jars.isEmpty() || jars.stream().anyMatch(path -> !Files.isRegularFile(path))) {
            return Optional.empty();
        }
        String fingerprint = jars.stream()
                .map(path -> path.toString() + ":" + sha256Hex(path))
                .reduce((left, right) -> left + "|" + right)
                .orElse("");
        DriverHandle cached = driverCache.get(normalizedDriverType);
        if (cached != null && cached.fingerprint().equals(fingerprint)) {
            return Optional.of(cached.driver());
        }
        try {
            URL[] urls = new URL[jars.size()];
            for (int index = 0; index < jars.size(); index += 1) {
                urls[index] = jars.get(index).toUri().toURL();
            }
            URLClassLoader loader = new URLClassLoader(urls, driverClassLoaderParent(normalizedDriverType));
            String driverClassName = textOrDefault(metadata.get().get("driverClassName"), fallbackDriverClassName);
            Driver driver = instantiateDriver(loader, driverClassName)
                    .orElseThrow(() -> new IllegalStateException("Unable to discover JDBC driver class for " + normalizedDriverType));
            DriverHandle previous = driverCache.put(normalizedDriverType, new DriverHandle(driver, loader, fingerprint));
            if (previous != null) {
                previous.close();
            }
            return Optional.of(driver);
        } catch (ReflectiveOperationException | IOException | LinkageError | RuntimeException | java.util.ServiceConfigurationError error) {
            if (strict) {
                throw new IllegalStateException("Unable to load JDBC driver " + normalizedDriverType, error);
            }
            return Optional.empty();
        }
    }

    private void invalidateDriverCache(String driverType) {
        DriverHandle handle = driverCache.remove(driverType);
        if (handle != null) {
            handle.close();
        }
    }

    private Driver instantiateDriver(Class<?> driverClass) throws ReflectiveOperationException {
        Object value = driverClass.getDeclaredConstructor().newInstance();
        if (!(value instanceof Driver driver)) {
            throw new IllegalStateException(driverClass.getName() + " is not a java.sql.Driver");
        }
        return driver;
    }

    private Optional<Driver> instantiateDriver(URLClassLoader loader, String driverClassName)
            throws ReflectiveOperationException {
        String className = text(driverClassName);
        if (!className.isBlank()) {
            return Optional.of(instantiateDriver(Class.forName(className, true, loader)));
        }
        ServiceLoader<Driver> serviceLoader = ServiceLoader.load(Driver.class, loader);
        for (Driver driver : serviceLoader) {
            if (driver != null) {
                return Optional.of(driver);
            }
        }
        return Optional.empty();
    }

    private Optional<String> discoverDriverClassName(List<String> jarPaths) {
        List<Path> jars = jarPaths.stream()
                .map(value -> Path.of(value).toAbsolutePath().normalize())
                .filter(Files::isRegularFile)
                .toList();
        if (jars.isEmpty()) {
            return Optional.empty();
        }
        try {
            URL[] urls = new URL[jars.size()];
            for (int index = 0; index < jars.size(); index += 1) {
                urls[index] = jars.get(index).toUri().toURL();
            }
            try (URLClassLoader loader = new URLClassLoader(urls, driverClassLoaderParent(""))) {
                ServiceLoader<Driver> serviceLoader = ServiceLoader.load(Driver.class, loader);
                for (Driver driver : serviceLoader) {
                    if (driver != null) {
                        return Optional.of(driver.getClass().getName());
                    }
                }
            }
            return Optional.empty();
        } catch (IOException | LinkageError | java.util.ServiceConfigurationError error) {
            return Optional.empty();
        }
    }

    private static ClassLoader driverClassLoaderParent(String driverType) {
        String normalized = text(driverType).toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || !DEFINITIONS.containsKey(normalized)) {
            return ClassLoader.getPlatformClassLoader();
        }
        ClassLoader context = Thread.currentThread().getContextClassLoader();
        return context == null ? ClassLoader.getPlatformClassLoader() : context;
    }

    private void downloadArtifact(String repositoryURL, Artifact artifact, Path target) {
        String url = artifactUrl(repositoryURL, artifact);
        Path tmp = target.resolveSibling(target.getFileName() + ".tmp");
        try {
            Files.deleteIfExists(tmp);
            if (copyFromLocalMavenCache(artifact, tmp)) {
                moveAtomically(tmp, target);
                return;
            }
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(HTTP_TIMEOUT)
                    .GET()
                    .build();
            HttpResponse<Path> response = httpClient.send(request, HttpResponse.BodyHandlers.ofFile(tmp));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("HTTP " + response.statusCode() + " while downloading " + url);
            }
            moveAtomically(response.body(), target);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while downloading JDBC driver artifact: " + artifact.fileName(), error);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to download JDBC driver artifact: " + artifact.fileName(), error);
        } finally {
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException ignored) {
                // Best effort cleanup only.
            }
        }
    }

    private boolean copyFromLocalMavenCache(Artifact artifact, Path target) throws IOException {
        for (Path repository : localMavenRepositories()) {
            Path source = repository.resolve(artifact.repositoryPath()).toAbsolutePath().normalize();
            if (!source.startsWith(repository) || !Files.isRegularFile(source)) {
                continue;
            }
            String expectedSha256 = text(artifact.sha256());
            if (!expectedSha256.isBlank() && !sha256Hex(source).equalsIgnoreCase(expectedSha256)) {
                continue;
            }
            Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
            return true;
        }
        return false;
    }

    private MavenVersionLookup mavenVersions(String repositoryURL, Artifact primaryArtifact) {
        String metadataURL = sanitizeRepositoryURL(repositoryURL)
                + "/" + primaryArtifact.groupId().replace('.', '/')
                + "/" + primaryArtifact.artifactId()
                + "/maven-metadata.xml";
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(metadataURL))
                    .timeout(Duration.ofSeconds(20))
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return MavenVersionLookup.fallback(
                        primaryArtifact.version(),
                        metadataURL,
                        messages.message("drivers.httpStatus", "status", response.statusCode())
                );
            }
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setExpandEntityReferences(false);
            Document document = factory.newDocumentBuilder().parse(new InputSource(new StringReader(response.body())));
            NodeList nodes = document.getElementsByTagName("version");
            List<String> versions = new ArrayList<>();
            for (int index = nodes.getLength() - 1; index >= 0; index -= 1) {
                String version = text(nodes.item(index).getTextContent());
                if (!version.isBlank() && isSafeMavenVersion(version) && !versions.contains(version)) {
                    versions.add(version);
                }
            }
            if (versions.isEmpty()) {
                return MavenVersionLookup.fallback(
                        primaryArtifact.version(),
                        metadataURL,
                        messages.message("drivers.emptyVersionMetadata")
                );
            }
            return new MavenVersionLookup(List.copyOf(versions), true, metadataURL, "");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return MavenVersionLookup.fallback(primaryArtifact.version(), metadataURL, messages.message("drivers.requestInterrupted"));
        } catch (Exception error) {
            return MavenVersionLookup.fallback(primaryArtifact.version(), metadataURL, normalizeRepositoryError(error));
        }
    }

    private String normalizeRepositoryError(Exception error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof IllegalArgumentException) {
                return messages.message("drivers.invalidRepositoryUrl");
            }
            if (current instanceof HttpConnectTimeoutException) {
                return messages.message("drivers.connectionTimedOut");
            }
            if (current instanceof HttpTimeoutException) {
                return messages.message("drivers.readTimedOut");
            }
            if (current instanceof UnknownHostException) {
                return messages.message("drivers.dnsLookupFailed");
            }
            if (current instanceof javax.net.ssl.SSLHandshakeException) {
                return messages.message("drivers.tlsHandshakeFailed");
            }
            if (current instanceof java.net.ConnectException) {
                return messages.message("drivers.connectionRefused");
            }
            if (current instanceof java.net.NoRouteToHostException) {
                return messages.message("drivers.noRouteToHost");
            }
            current = current.getCause();
        }
        String message = text(error.getMessage());
        return message.isBlank() ? error.getClass().getSimpleName() : message;
    }

    private Optional<Long> remoteContentLength(String repositoryURL, Artifact artifact) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(artifactUrl(repositoryURL, artifact)))
                    .timeout(Duration.ofSeconds(15))
                    .method("HEAD", HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return Optional.empty();
            }
            Optional<String> value = response.headers().firstValue("Content-Length");
            if (value.isEmpty()) {
                return Optional.empty();
            }
            long parsed = Long.parseLong(value.get());
            return parsed > 0 ? Optional.of(parsed) : Optional.empty();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    private static List<Path> localMavenRepositories() {
        List<Path> candidates = new ArrayList<>();
        addPathCandidate(candidates, System.getProperty("javanavi.mavenRepository"));
        addPathCandidate(candidates, System.getenv("JAVANAVI_MAVEN_REPOSITORY"));
        addPathCandidate(candidates, System.getProperty("maven.repo.local"));
        addPathCandidate(candidates, Path.of("").toAbsolutePath().resolve(".m2/repository").toString());
        addPathCandidate(candidates, Path.of(System.getProperty("user.home", ".")).resolve(".m2/repository").toString());
        return candidates.stream().distinct().toList();
    }

    private static void addPathCandidate(List<Path> candidates, String value) {
        String text = text(value);
        if (!text.isBlank()) {
            candidates.add(Path.of(text).toAbsolutePath().normalize());
        }
    }

    private static void moveAtomically(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private List<Path> localJarSources(Path source, DriverPackageDefinition definition) {
        try {
            if (Files.isRegularFile(source) && source.getFileName().toString().endsWith(".jar")) {
                return List.of(source);
            }
            if (!Files.isDirectory(source)) {
                return List.of();
            }
            List<Path> jars = new ArrayList<>();
            try (var stream = Files.list(source)) {
                stream.filter(path -> Files.isRegularFile(path) && path.getFileName().toString().endsWith(".jar"))
                        .forEach(jars::add);
            }
            if (definition == null) {
                return jars;
            }
            List<String> expected = definition.artifacts().stream().map(Artifact::fileName).toList();
            List<Path> preferred = jars.stream()
                    .filter(path -> expected.contains(path.getFileName().toString()))
                    .toList();
            return preferred.isEmpty() ? jars : preferred;
        } catch (IOException error) {
            throw new IllegalStateException("Unable to inspect local JDBC driver package path: " + source, error);
        }
    }

    private Optional<Map<String, Object>> readMetadata(Path installDir) {
        Path file = installDir.resolve(METADATA_FILE_NAME);
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return Optional.of(new LinkedHashMap<>(objectMapper.readValue(file.toFile(), MAP_TYPE)));
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JDBC driver package metadata.", error);
        }
    }

    private void writeMetadata(Path installDir, Map<String, Object> metadata) {
        ensureDirectory(installDir);
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(installDir.resolve(METADATA_FILE_NAME).toFile(), metadata);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JDBC driver package metadata.", error);
        }
    }

    private Map<String, Object> installedVersionItem(Map<String, Object> metadata, boolean active) {
        String installMode = normalizeInstallMode(text(metadata.get("installMode")));
        return orderedMap(
                "version", text(metadata.get("version")),
                "active", active,
                "installMode", installMode,
                "installSource", installMode.contains("download") ? "maven-download" : installMode.contains("upload") ? "manual-upload" : installMode,
                "downloadedAt", text(metadata.get("downloadedAt")),
                "installDir", textOrDefault(metadata.get("installDir"), text(metadata.get("activeVersionDirectory"))),
                "filePath", text(metadata.get("filePath"))
        );
    }

    private Optional<String> configuredRepositoryURL() {
        Optional<Map<String, Object>> settings = readSettings();
        String configured = settings
                .map(value -> text(value.get("repositoryUrl")))
                .filter(value -> !value.isBlank())
                .orElse("");
        return configured.isBlank() ? Optional.empty() : Optional.of(sanitizeRepositoryURL(configured));
    }

    private Optional<Map<String, Object>> readSettings() {
        Path file = defaultDriverDirectory.resolve(SETTINGS_FILE_NAME);
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            return Optional.of(new LinkedHashMap<>(objectMapper.readValue(file.toFile(), MAP_TYPE)));
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JDBC driver runtime settings.", error);
        }
    }

    private void writeSettings(Map<String, Object> settings) {
        ensureDirectory(defaultDriverDirectory);
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(defaultDriverDirectory.resolve(SETTINGS_FILE_NAME).toFile(), settings);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to write JDBC driver runtime settings.", error);
        }
    }

    private List<Path> metadataJars(Map<String, Object> metadata, Path installDir) {
        Object raw = metadata.get("jars");
        if (raw instanceof List<?> list) {
            return list.stream()
                    .map(value -> Path.of(String.valueOf(value)).toAbsolutePath().normalize())
                    .filter(path -> path.startsWith(installDir.toAbsolutePath().normalize()))
                    .toList();
        }
        Object single = metadata.get("filePath");
        String singleText = text(single);
        if (singleText.endsWith(".jar")) {
            Path jar = Path.of(singleText).toAbsolutePath().normalize();
            if (jar.startsWith(installDir.toAbsolutePath().normalize())) {
                return List.of(jar);
            }
        }
        return List.of();
    }

    private Map<String, Object> customDefinitionMetadataItem(String driverType, Path installDir, Map<String, Object> metadata) {
        String normalizedDriverType = requireSafeCustomDriverType(driverType);
        List<Path> jars = metadataJars(metadata, installDir);
        List<Path> existingJars = jars.stream().filter(Files::isRegularFile).toList();
        String driverClassName = text(metadata.get("driverClassName"));
        boolean metadataReadable = !metadata.isEmpty();
        boolean hasJars = !existingJars.isEmpty();
        boolean driverLoadable = loadInstalledCustomDriver(normalizedDriverType, installDir.getParent(), false).isPresent();
        boolean definitionUsable = metadataReadable && hasJars && driverLoadable;
        List<String> repairHints = new ArrayList<>();
        if (!metadataReadable) {
            repairHints.add(messages.message("drivers.customDefinitionMetadataMissing"));
        }
        if (!hasJars) {
            repairHints.add(messages.message("drivers.customDefinitionJarMissing"));
        }
        if (driverClassName.isBlank()) {
            repairHints.add(messages.message("drivers.customDefinitionClassMissing"));
        }
        if (hasJars && !driverLoadable) {
            repairHints.add(messages.message("drivers.customDefinitionClassLoadFailed"));
        }
        String validationStatus = definitionUsable ? "valid" : hasJars ? "warning" : "error";
        String message = definitionUsable
                ? messages.message("drivers.customDefinitionUsable")
                : repairHints.isEmpty() ? messages.message("drivers.customDefinitionRepairRequired") : repairHints.get(0);
        return customValidationResult(
                normalizedDriverType,
                text(metadata.get("version")),
                driverClassName,
                text(metadata.get("downloadedAt")),
                sanitizedArtifacts(metadata, installDir),
                driverLoadable,
                definitionUsable,
                validationStatus,
                message,
                repairHints
        );
    }

    private Map<String, Object> customValidationResult(
            String driverType,
            String version,
            String driverClassName,
            String downloadedAt,
            List<Map<String, Object>> artifacts,
            boolean driverLoadable,
            boolean definitionUsable,
            String validationStatus,
            String message,
            List<String> repairHints
    ) {
        return orderedMap(
                "driverType", driverType,
                "driverName", driverType,
                "version", version,
                "driverClassName", driverClassName,
                "installSource", "manual-upload",
                "downloadedAt", downloadedAt,
                "artifacts", artifacts,
                "jarFileNames", artifacts.stream().map(item -> text(item.get("fileName"))).filter(value -> !value.isBlank()).toList(),
                "driverLoadable", driverLoadable,
                "definitionUsable", definitionUsable,
                "validationStatus", validationStatus,
                "message", message,
                "repairHints", repairHints,
                "checkedAt", Instant.now().toString()
        );
    }

    private List<Map<String, Object>> sanitizedArtifacts(Map<String, Object> metadata, Path installDir) {
        List<Map<String, Object>> artifacts = new ArrayList<>();
        Object rawArtifacts = metadata.get("artifacts");
        if (rawArtifacts instanceof List<?> list) {
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> rawMap)) {
                    continue;
                }
                String fileName = text(rawMap.get("fileName")).replace('\\', '/');
                if (fileName.contains("/")) {
                    fileName = Path.of(fileName).getFileName().toString();
                }
                if (fileName.isBlank()) {
                    continue;
                }
                artifacts.add(orderedMap(
                        "fileName", fileName,
                        "sha256", text(rawMap.get("sha256")),
                        "sizeBytes", parseLong(rawMap.get("sizeBytes"))
                ));
            }
        }
        if (!artifacts.isEmpty()) {
            return artifacts;
        }
        return metadataJars(metadata, installDir).stream()
                .filter(Files::isRegularFile)
                .map(path -> orderedMap(
                        "fileName", path.getFileName().toString(),
                        "sha256", sha256Hex(path),
                        "sizeBytes", size(path)
                ))
                .toList();
    }

    private DriverPackageDefinition requireDefinition(String driverType) {
        return definition(driverType)
                .orElseThrow(() -> new IllegalArgumentException(messages.message("drivers.unsupportedDownloadType", "type", textOrDefault(driverType, "<empty>"))));
    }

    private Optional<DriverPackageDefinition> definition(String driverType) {
        String normalized = normalizeDriverType(driverType);
        return Optional.ofNullable(DEFINITIONS.get(normalized));
    }

    private String normalizeDriverType(String driverType) {
        String normalized = text(driverType).toLowerCase(Locale.ROOT);
        return ALIASES.getOrDefault(normalized, normalized);
    }

    private String requireSafeCustomDriverType(String driverType) {
        String normalized = normalizeDriverType(driverType);
        if (!normalized.matches("[a-z0-9][a-z0-9._-]{0,63}")
                || ".".equals(normalized)
                || "..".equals(normalized)
                || "custom".equals(normalized)
                || DEFINITIONS.containsKey(normalized)) {
            throw new IllegalArgumentException("Invalid custom JDBC driver type: " + textOrDefault(driverType, "<empty>"));
        }
        return normalized;
    }

    private String requestedVersion(DriverPackageDefinition definition, String version) {
        String requested = text(version);
        String resolved = requested.isBlank() ? definition.version() : requested;
        if (!isSafeMavenVersion(resolved)) {
            throw new IllegalArgumentException("Invalid Maven JDBC driver version: " + resolved);
        }
        return resolved;
    }

    private void validateVersion(DriverPackageDefinition definition, String version) {
        requestedVersion(definition, version);
    }

    private Path resolveDriverDirectory(Path driverDirectory) {
        return driverDirectory == null ? defaultDriverDirectory : driverDirectory.toAbsolutePath().normalize();
    }

    private static String sanitizeRepositoryURL(String repositoryURL) {
        String raw = textOrDefault(repositoryURL, DEFAULT_REPOSITORY_URL);
        if (raw.startsWith("builtin://")) {
            return DEFAULT_REPOSITORY_URL;
        }
        String normalized = raw.endsWith("/") ? raw.substring(0, raw.length() - 1) : raw;
        if (!normalized.startsWith("https://") && !normalized.startsWith("http://")) {
            return DEFAULT_REPOSITORY_URL;
        }
        return normalized;
    }

    private String repositoryFromDownloadInput(String value, Artifact primaryArtifact) {
        String raw = text(value);
        if (raw.isBlank()) {
            return effectiveRepositoryURL();
        }
        if (raw.endsWith(".jar")) {
            String suffix = "/" + primaryArtifact.groupId().replace('.', '/') + "/" + primaryArtifact.artifactId()
                    + "/" + primaryArtifact.version() + "/" + primaryArtifact.fileName();
            if (raw.endsWith(suffix)) {
                return sanitizeRepositoryURL(raw.substring(0, raw.length() - suffix.length()));
            }
            return effectiveRepositoryURL();
        }
        return sanitizeRepositoryURL(value);
    }

    private static String artifactUrl(String repositoryURL, Artifact artifact) {
        String base = sanitizeRepositoryURL(repositoryURL);
        return base + "/" + artifact.repositoryPath();
    }

    private static Path installDir(Path root, String driverType) {
        return root.resolve(driverType).normalize();
    }

    private static Path versionInstallDir(Path installDir, String version) {
        String safeVersion = text(version).replaceAll("[^A-Za-z0-9._+-]", "_");
        if (safeVersion.isBlank()) {
            throw new IllegalArgumentException("Driver version is required.");
        }
        return installDir.resolve(VERSIONED_DOWNLOADS_DIR_NAME).resolve(safeVersion).normalize();
    }

    private static boolean isSafeMavenVersion(String version) {
        return text(version).matches("[A-Za-z0-9][A-Za-z0-9._+-]*");
    }

    private static void ensureDirectory(Path directory) {
        try {
            Files.createDirectories(directory);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to prepare JDBC driver directory: " + directory, error);
        }
    }

    private static void deleteDirectory(Path directory) {
        if (!Files.exists(directory)) {
            return;
        }
        try (var walk = Files.walk(directory)) {
            walk.sorted((left, right) -> right.compareTo(left))
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException error) {
                            throw new IllegalStateException("Unable to remove JDBC driver package: " + directory, error);
                        }
                    });
        } catch (IOException error) {
            throw new IllegalStateException("Unable to remove JDBC driver package: " + directory, error);
        }
    }

    private static String sha256Hex(Path path) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = Files.newInputStream(path)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) >= 0) {
                    digest.update(buffer, 0, read);
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (IOException | NoSuchAlgorithmException error) {
            throw new IllegalStateException("Unable to compute SHA-256 for " + path, error);
        }
    }

    private static long size(Path path) {
        try {
            return Files.size(path);
        } catch (IOException ignored) {
            return 0L;
        }
    }

    private static String humanSize(long bytes) {
        if (bytes <= 0) {
            return "0 B";
        }
        double mib = bytes / 1024.0 / 1024.0;
        if (mib >= 1) {
            return String.format(Locale.ROOT, "%.2f MB", mib);
        }
        return String.format(Locale.ROOT, "%.1f KB", bytes / 1024.0);
    }

    private static String requireText(String value, String field) {
        String text = text(value);
        if (text.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return text;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static long parseLong(Object value) {
        try {
            long parsed = Long.parseLong(text(value));
            return Math.max(parsed, 0L);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private static String normalizeInstallMode(String installMode) {
        String normalized = text(installMode);
        return normalized.isBlank() ? "managed-local-import" : normalized;
    }

    private static String textOrDefault(Object value, String fallback) {
        String text = text(value);
        return text.isBlank() ? fallback : text;
    }

    private static Map<String, Object> orderedMap(Object... values) {
        if (values.length % 2 != 0) {
            throw new IllegalArgumentException("orderedMap requires key/value pairs");
        }
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index < values.length; index += 2) {
            map.put(String.valueOf(values[index]), values[index + 1]);
        }
        return map;
    }

    private static Map<String, String> aliases() {
        Map<String, String> aliases = new LinkedHashMap<>();
        aliases.put("postgresql", "postgres");
        aliases.put("pg", "postgres");
        aliases.put("mariadb", "mysql");
        aliases.put("doris", "mysql");
        aliases.put("diros", "mysql");
        aliases.put("sphinx", "mysql");
        aliases.put("kingbase", "postgres");
        aliases.put("kingbase8", "postgres");
        aliases.put("kingbasees", "postgres");
        aliases.put("kingbasev8", "postgres");
        aliases.put("highgo", "postgres");
        aliases.put("vastbase", "postgres");
        aliases.put("mssql", "sqlserver");
        aliases.put("sql_server", "sqlserver");
        aliases.put("sql server", "sqlserver");
        aliases.put("dm", "dameng");
        aliases.put("dm8", "dameng");
        aliases.put("taos", "tdengine");
        aliases.put("taos-rs", "tdengine");
        aliases.put("taos_rs", "tdengine");
        aliases.put("ch", "clickhouse");
        aliases.put("sqlite3", "sqlite");
        return aliases;
    }

    private static Map<String, DriverPackageDefinition> definitions() {
        List<DriverPackageDefinition> definitions = List.of(
                definition("mysql", "MySQL", "com.mysql.cj.jdbc.Driver", artifact("com.mysql", "mysql-connector-j", "9.7.0", "0353648eaa1c91e0f4020c959abf756bc866ffd583df22ae6b6f6e0cbd43eb44", 2_607_237)),
                definition("postgres", "PostgreSQL", "org.postgresql.Driver", artifact("org.postgresql", "postgresql", "42.7.10", "cab1cd67cfa25c25de4348e532298028288a877ba01c77d1619fe45416193387", 1_137_016)),
                definition("sqlite", "SQLite", "org.sqlite.JDBC", artifact("org.xerial", "sqlite-jdbc", "3.53.0.0", "303e8150100982f2ed7d1b82d897278ef7744bd494c28ad4e7042b7914591697", 11_964_230)),
                definition("duckdb", "DuckDB", "org.duckdb.DuckDBDriver", artifact("org.duckdb", "duckdb_jdbc", "1.5.2.0", "77afc7fc6c828b7ed4bdb9b65607e4e924d92c3164143451de6180a19e9aec6b", 83_807_914)),
                definition("sqlserver", "SQL Server", "com.microsoft.sqlserver.jdbc.SQLServerDriver", artifact("com.microsoft.sqlserver", "mssql-jdbc", "13.4.0.jre11", "e36f5237c1267983e5b88dc2169f6b9d7e50eceec6dc1ca31018e3877e14af66", 1_547_706)),
                definition("oracle", "Oracle", "oracle.jdbc.OracleDriver", artifact("com.oracle.database.jdbc", "ojdbc11", "23.26.1.0.0", "94ff71df1cb409bf355b61f2e485994231cda233f918594f63b605a4da92c792", 7_647_964)),
                definition("dameng", "Dameng", "dm.jdbc.driver.DmDriver", artifact("com.dameng", "DmJdbcDriver18", "8.1.3.140", "9af4ff4d6ed15948507f528a18ab9b7196b3600d9169ad7998c19869031a3c6f", 1_376_925)),
                definition("tdengine", "TDengine", "com.taosdata.jdbc.rs.RestfulDriver", artifact("com.taosdata.jdbc", "taos-jdbcdriver", "3.8.3", "34528e4d9ab8fb2f685e69a9f51e22b9a01e7151e345e066f7e109ac4cad3dff", 513_385)),
                definition("clickhouse", "ClickHouse", "com.clickhouse.jdbc.ClickHouseDriver",
                        artifact("com.clickhouse", "clickhouse-jdbc", "0.9.8", "647788aa48699bd1a46179429c46f53c891db9795f3368b489e65206756a50ed", 284_138),
                        artifact("com.clickhouse", "clickhouse-client", "0.9.8", "ef8b2d7f1117d82400bf4c41af25acfba455f1f0a6796afc86532effdd67a563", 195_925),
                        artifact("com.clickhouse", "clickhouse-data", "0.9.8", "5a886bb03fe2df091e3c7fa171d14164bac04b05ead047c991d601e437b41714", 587_360),
                        artifact("com.clickhouse", "clickhouse-http-client", "0.9.8", "7a33732c310864b7e84691fd46dae1f986fe40a685befebdef522e518d96fb95", 70_169),
                        artifact("com.clickhouse", "jdbc-v2", "0.9.8", "daea5e0265733eb3ed3903e72f12f175959d343f0050d4bebe52fe65cb6627ab", 822_973),
                        artifact("com.clickhouse", "client-v2", "0.9.8", "2493271c65f019dc03a0b90e430b31078b62410dd5848fe899833d074ebb9ba8", 250_012))
        );
        Map<String, DriverPackageDefinition> byType = new LinkedHashMap<>();
        for (DriverPackageDefinition definition : definitions) {
            byType.put(definition.type(), definition);
        }
        return Map.copyOf(byType);
    }

    private static DriverPackageDefinition definition(String type, String name, String driverClassName, Artifact... artifacts) {
        return new DriverPackageDefinition(type, name, driverClassName, List.of(artifacts));
    }

    private static Artifact artifact(String groupId, String artifactId, String version, String sha256, long sizeBytes) {
        return new Artifact(groupId, artifactId, version, sha256, sizeBytes);
    }

    private record MavenVersionLookup(
            List<String> versions,
            boolean metadataBacked,
            String metadataURL,
            String error
    ) {
        private MavenVersionLookup {
            versions = List.copyOf(versions);
            metadataURL = text(metadataURL);
            error = text(error);
        }

        private static MavenVersionLookup fallback(String version, String metadataURL, String error) {
            String fallbackVersion = text(version);
            List<String> versions = fallbackVersion.isBlank() ? List.of() : List.of(fallbackVersion);
            return new MavenVersionLookup(versions, false, metadataURL, error);
        }
    }

    private record DriverPackageDefinition(
            String type,
            String name,
            String driverClassName,
            List<Artifact> artifacts
    ) {
        private DriverPackageDefinition {
            artifacts = List.copyOf(artifacts);
        }

        private String version() {
            return primaryArtifact().version();
        }

        private Artifact primaryArtifact() {
            return artifacts.get(0);
        }

        private long totalSizeBytes() {
            return artifacts.stream().mapToLong(Artifact::sizeBytes).sum();
        }

        private DriverPackageDefinition withVersion(String version) {
            String selectedVersion = textOrDefault(version, version());
            if (selectedVersion.equals(version())) {
                return this;
            }
            return new DriverPackageDefinition(
                    type,
                    name,
                    driverClassName,
                    artifacts.stream().map(artifact -> artifact.withVersion(selectedVersion)).toList()
            );
        }
    }

    private record Artifact(String groupId, String artifactId, String version, String sha256, long sizeBytes) {
        private String fileName() {
            return artifactId + "-" + version + ".jar";
        }

        private String repositoryPath() {
            return groupId.replace('.', '/') + "/" + artifactId + "/" + version + "/" + fileName();
        }

        private Artifact withVersion(String selectedVersion) {
            String normalized = textOrDefault(selectedVersion, version);
            if (normalized.equals(version)) {
                return this;
            }
            return new Artifact(groupId, artifactId, normalized, "", 0L);
        }
    }

    private record DriverHandle(Driver driver, URLClassLoader classLoader, String fingerprint) implements AutoCloseable {
        private DriverHandle {
            Objects.requireNonNull(classLoader);
        }

        @Override
        public void close() {
            try {
                classLoader.close();
            } catch (IOException ignored) {
                // Best effort only; the cache entry is already invalidated.
            }
        }
    }
}
