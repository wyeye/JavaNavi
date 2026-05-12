package com.javanavi.driver;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.app.GlobalProxyConfigProvider;
import com.javanavi.config.SecurityProperties;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.CompatEventReplayRequestDto;
import com.javanavi.security.SecretRedactor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.Authenticator;
import java.net.InetSocketAddress;
import java.net.PasswordAuthentication;
import java.net.Proxy;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
public class DriverCompatibilityService {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final String DEFAULT_REPOSITORY_URL = "builtin://javanavi-driver-matrix";
    private static final String METADATA_FILE_NAME = "driver-package.json";
    private static final String DRIVER_DEFAULTS_FILE_NAME = "driver-defaults.json";
    private static final Duration REPOSITORY_CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration REPOSITORY_REQUEST_TIMEOUT = Duration.ofSeconds(5);

    private static final List<DriverDefinition> DRIVER_DEFINITIONS = List.of(
            new DriverDefinition("mysql", "MySQL", false, "runtime", "", "implemented", "com.mysql.cj.jdbc.Driver", "MySQL Connector/J can be downloaded on demand through Driver Manager."),
            new DriverDefinition("oracle", "Oracle", false, "23.26.1.0.0", "", "implemented", "oracle.jdbc.OracleDriver", "Oracle JDBC can be downloaded on demand through Driver Manager."),
            new DriverDefinition("redis", "Redis", true, "runtime", "", "implemented", "", "Redis direct TCP/RESP compatibility is implemented by JavaNavi without an external driver package."),
            new DriverDefinition("postgres", "PostgreSQL", false, "runtime", "", "implemented", "org.postgresql.Driver", "PostgreSQL JDBC can be downloaded on demand through Driver Manager."),
            new DriverDefinition("mariadb", "MariaDB", false, "runtime", "", "implemented", "com.mysql.cj.jdbc.Driver", "MariaDB-compatible JDBC connections reuse the managed MySQL runtime when it is installed."),
            new DriverDefinition("diros", "Doris", false, "runtime", "", "implemented", "com.mysql.cj.jdbc.Driver", "Doris MySQL-wire JDBC connections reuse the managed MySQL runtime when it is installed."),
            new DriverDefinition("sphinx", "Sphinx", false, "runtime", "", "implemented", "com.mysql.cj.jdbc.Driver", "SphinxQL MySQL-wire JDBC connections reuse the managed MySQL runtime when it is installed."),
            new DriverDefinition("sqlserver", "SQL Server", false, "13.4.0.jre11", "", "implemented", "com.microsoft.sqlserver.jdbc.SQLServerDriver", "SQL Server JDBC can be downloaded on demand through Driver Manager."),
            new DriverDefinition("sqlite", "SQLite", false, "runtime", "", "implemented", "org.sqlite.JDBC", "SQLite JDBC can be downloaded on demand through Driver Manager."),
            new DriverDefinition("duckdb", "DuckDB", false, "runtime", "", "implemented", "org.duckdb.DuckDBDriver", "DuckDB JDBC can be downloaded on demand through Driver Manager."),
            new DriverDefinition("dameng", "Dameng", false, "8.1.3.140", "", "implemented", "dm.jdbc.driver.DmDriver", "Dameng JDBC can be downloaded on demand through Driver Manager."),
            new DriverDefinition("kingbase", "Kingbase", false, "runtime", "", "implemented", "org.postgresql.Driver", "Kingbase PostgreSQL-wire JDBC connections reuse the managed PostgreSQL runtime when it is installed."),
            new DriverDefinition("highgo", "HighGo", false, "runtime", "", "implemented", "org.postgresql.Driver", "HighGo PostgreSQL-wire JDBC connections reuse the managed PostgreSQL runtime when it is installed."),
            new DriverDefinition("vastbase", "Vastbase", false, "runtime", "", "implemented", "org.postgresql.Driver", "Vastbase PostgreSQL-wire JDBC connections reuse the managed PostgreSQL runtime when it is installed."),
            new DriverDefinition("mongodb", "MongoDB", true, "runtime", "", "implemented", "", "MongoDB direct wire compatibility is implemented by JavaNavi for discovery, metadata/query/applyChanges, SCRAM auth profiles, and TLS profile handling without a Java driver package."),
            new DriverDefinition("tdengine", "TDengine", false, "3.8.3", "", "implemented", "com.taosdata.jdbc.rs.RestfulDriver", "TDengine JDBC can be downloaded on demand through Driver Manager."),
            new DriverDefinition("clickhouse", "ClickHouse", false, "0.9.8", "", "implemented", "com.clickhouse.jdbc.ClickHouseDriver", "ClickHouse JDBC can be downloaded on demand through Driver Manager.")
    );

    private final ObjectMapper objectMapper;
    private final CompatEventPublisher publisher;
    private final CompatEventFixtures fixtures;
    private final JdbcDriverRuntimeService jdbcDriverRuntimeService;
    private final GlobalProxyConfigProvider globalProxyConfigProvider;
    private final I18nMessages messages;
    private final Path dataDirectory;
    private final Path defaultDriverDirectory;

    public DriverCompatibilityService(
            SecurityProperties securityProperties,
            ObjectMapper objectMapper,
            CompatEventPublisher publisher,
            CompatEventFixtures fixtures,
            JdbcDriverRuntimeService jdbcDriverRuntimeService,
            GlobalProxyConfigProvider globalProxyConfigProvider,
            I18nMessages messages
    ) {
        this.objectMapper = objectMapper;
        this.publisher = publisher;
        this.fixtures = fixtures;
        this.jdbcDriverRuntimeService = jdbcDriverRuntimeService;
        this.globalProxyConfigProvider = globalProxyConfigProvider;
        this.messages = messages;
        this.dataDirectory = Path.of(securityProperties.getDataDirectory()).toAbsolutePath().normalize();
        this.defaultDriverDirectory = dataDirectory.resolve("drivers").normalize();
    }

    private HttpClient repositoryHttpClient() {
        HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(REPOSITORY_CONNECT_TIMEOUT)
                .followRedirects(HttpClient.Redirect.NORMAL);
        activeGlobalProxy().ifPresent(proxy -> applyProxy(builder, proxy));
        return builder.build();
    }

    private static void applyProxy(HttpClient.Builder builder, com.javanavi.model.ConnectionConfigDto.NetworkProxyConfigDto proxy) {
        Proxy.Type proxyType = "socks5".equalsIgnoreCase(proxy.type()) ? Proxy.Type.SOCKS : Proxy.Type.HTTP;
        builder.proxy(new SingleProxySelector(new Proxy(proxyType, new InetSocketAddress(proxy.host(), proxy.port()))));
        if (!text(proxy.user()).isBlank() || !text(proxy.password()).isBlank()) {
            builder.authenticator(new Authenticator() {
                @Override
                protected PasswordAuthentication getPasswordAuthentication() {
                    if (getRequestorType() != RequestorType.PROXY) {
                        return null;
                    }
                    return new PasswordAuthentication(text(proxy.user()), text(proxy.password()).toCharArray());
                }
            });
        }
    }

    private Optional<com.javanavi.model.ConnectionConfigDto.NetworkProxyConfigDto> activeGlobalProxy() {
        return globalProxyConfigProvider == null ? Optional.empty() : globalProxyConfigProvider.activeProxy();
    }

    private Map<String, String> proxySummary(com.javanavi.model.ConnectionConfigDto.NetworkProxyConfigDto proxy) {
        return orderedStringMap(
                "scope", "global",
                "type", proxy.type(),
                "host", proxy.host(),
                "port", String.valueOf(proxy.port())
        );
    }

    public Map<String, Object> networkStatus() {
        ensureDirectory(defaultDriverDirectory);
        boolean workspaceAvailable = Files.isDirectory(defaultDriverDirectory);
        Map<String, Object> repositorySettings = jdbcDriverRuntimeService.repositorySettings();
        String repositoryUrl = textOrDefault(repositorySettings.get("repositoryUrl"), jdbcDriverRuntimeService.defaultRepositoryURL());
        String repositoryHost = repositoryHost(repositoryUrl);
        Optional<com.javanavi.model.ConnectionConfigDto.NetworkProxyConfigDto> globalProxy = activeGlobalProxy();
        Map<String, Object> repositoryProbe = probeRepository(repositoryUrl);
        boolean repositoryReachable = Boolean.TRUE.equals(repositoryProbe.get("reachable"));
        boolean overallReachable = workspaceAvailable && repositoryReachable;
        List<Map<String, Object>> checks = List.of(
                orderedMap(
                        "name", "JavaNavi backend package",
                        "url", "local://backend",
                        "reachable", true,
                        "method", "LOCAL",
                        "error", ""
                ),
                orderedMap(
                        "name", "Managed driver workspace",
                        "url", defaultDriverDirectory.toString(),
                        "reachable", workspaceAvailable,
                        "method", "FILESYSTEM",
                        "error", workspaceAvailable ? "" : messages.message("drivers.workspaceDirectoryUnavailable")
                ),
                repositoryProbe
        );
        return orderedMap(
                "reachable", overallReachable,
                "summary", workspaceAvailable
                        ? messages.message("drivers.workspaceReady")
                        : messages.message("drivers.workspaceUnavailable"),
                "recommendedProxy", workspaceAvailable && !repositoryReachable && globalProxy.isEmpty(),
                "proxyConfigured", globalProxy.isPresent(),
                "proxyEnv", globalProxy.map(this::proxySummary).orElseGet(Map::of),
                "downloadChainReachable", repositoryReachable,
                "downloadRequiredHosts", repositoryHost.isBlank() ? List.of() : List.of(repositoryHost),
                "defaultRepositoryURL", jdbcDriverRuntimeService.defaultRepositoryURL(),
                "defaultRepositoryUrl", jdbcDriverRuntimeService.defaultRepositoryURL(),
                "repositoryURL", repositoryUrl,
                "repositoryUrl", repositoryUrl,
                "configuredRepositoryURL", repositorySettings.get("configuredRepositoryUrl"),
                "configuredRepositoryUrl", repositorySettings.get("configuredRepositoryUrl"),
                "repositoryConfigured", repositorySettings.get("repositoryConfigured"),
                "checkedAt", Instant.now().toString(),
                "networkProbeMode", "http-repository-probe",
                "workspaceRoot", defaultDriverDirectory.toString(),
                "checks", checks
        );
    }

    private Map<String, Object> probeRepository(String repositoryUrl) {
        if (!supportsHttpProbe(repositoryUrl)) {
            return orderedMap(
                    "name", "Maven driver repository",
                    "url", SecretRedactor.redact(repositoryUrl),
                    "reachable", false,
                    "method", "INVALID",
                    "error", messages.message("drivers.invalidRepositoryUrl")
            );
        }
        Map<String, Object> headProbe = probeRepositoryOnce(repositoryUrl, "HEAD");
        Integer headStatus = integerValue(headProbe.get("httpStatus"));
        if (headStatus != null && shouldFallbackToGet(headStatus)) {
            Map<String, Object> getProbe = probeRepositoryOnce(repositoryUrl, "GET");
            if (Boolean.TRUE.equals(getProbe.get("reachable"))) {
                return getProbe;
            }
            Map<String, Object> next = new LinkedHashMap<>(getProbe);
            String reason = text(getProbe.get("error"));
            next.put("error", reason.isBlank()
                    ? messages.message("drivers.httpFallbackFailed", "status", headStatus)
                    : messages.message("drivers.httpFallbackFailedWithReason", "status", headStatus, "reason", reason));
            return next;
        }
        return headProbe;
    }

    private Map<String, Object> probeRepositoryOnce(String repositoryUrl, String method) {
        long startedAt = System.nanoTime();
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(new URI(repositoryUrl))
                    .timeout(REPOSITORY_REQUEST_TIMEOUT);
            HttpRequest request = "HEAD".equalsIgnoreCase(method)
                    ? builder.method("HEAD", HttpRequest.BodyPublishers.noBody()).build()
                    : builder.GET().build();
            HttpResponse<Void> response = repositoryHttpClient().send(request, HttpResponse.BodyHandlers.discarding());
            long latencyMs = Math.max(1L, Duration.ofNanos(System.nanoTime() - startedAt).toMillis());
            int statusCode = response.statusCode();
            boolean reachable = statusCode >= 200 && statusCode < 400;
            Map<String, Object> result = orderedMap(
                    "name", "Maven driver repository",
                    "url", SecretRedactor.redact(repositoryUrl),
                    "reachable", reachable,
                    "method", method.toUpperCase(Locale.ROOT),
                    "httpStatus", statusCode,
                    "httpLatencyMs", latencyMs,
                    "latencyMs", latencyMs
            );
            if (!reachable) {
                result.put("error", messages.message("drivers.httpStatus", "status", statusCode));
            }
            return result;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return orderedMap(
                    "name", "Maven driver repository",
                    "url", SecretRedactor.redact(repositoryUrl),
                    "reachable", false,
                    "method", method.toUpperCase(Locale.ROOT),
                    "error", messages.message("drivers.requestInterrupted")
            );
        } catch (Exception error) {
            return orderedMap(
                    "name", "Maven driver repository",
                    "url", SecretRedactor.redact(repositoryUrl),
                    "reachable", false,
                    "method", method.toUpperCase(Locale.ROOT),
                    "error", normalizeProbeError(error)
            );
        }
    }

    private static boolean shouldFallbackToGet(int statusCode) {
        return statusCode == 403 || statusCode == 405 || statusCode == 501;
    }

    private static boolean supportsHttpProbe(String repositoryUrl) {
        try {
            URI uri = new URI(repositoryUrl);
            String scheme = text(uri.getScheme()).toLowerCase(Locale.ROOT);
            return ("http".equals(scheme) || "https".equals(scheme)) && !text(uri.getHost()).isBlank();
        } catch (Exception ignored) {
            return false;
        }
    }

    private String normalizeProbeError(Exception error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof IllegalArgumentException || current instanceof URISyntaxException) {
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

    public Map<String, Object> configureRuntimeDirectory(String directory) {
        Path resolved = resolveManagedDriverDirectory(directory);
        ensureDirectory(resolved);
        return orderedMap(
                "path", resolved.toString(),
                "directory", resolved.toString(),
                "defaultPath", defaultDriverDirectory.toString(),
                "isDefaultPath", resolved.equals(defaultDriverDirectory),
                "webManaged", true,
                "message", messages.message("drivers.runtimeDirectoryManaged")
        );
    }

    public Map<String, Object> openDownloadDirectory(String directory) {
        Path resolved = resolveManagedDriverDirectory(directory);
        ensureDirectory(resolved);
        DirectoryOpenResult openResult = openDirectory(resolved);
        return orderedMap(
                "path", resolved.toString(),
                "directory", resolved.toString(),
                "webManaged", true,
                "opened", openResult.opened(),
                "openMethod", openResult.method(),
                "message", openResult.message()
        );
    }

    public Map<String, Object> resolveDownloadDirectory(String directory) {
        Path resolved = resolveManagedDriverDirectory(directory);
        return orderedMap(
                "path", resolved.toString(),
                "directory", resolved.toString(),
                "defaultPath", defaultDriverDirectory.toString(),
                "isDefaultPath", resolved.equals(defaultDriverDirectory),
                "webManaged", true
        );
    }

    public Map<String, Object> resolveRepositoryURL(String repositoryURL) {
        Map<String, Object> resolved = new LinkedHashMap<>(jdbcDriverRuntimeService.resolveRepositoryURL(repositoryURL));
        String redacted = SecretRedactor.redact(text(resolved.get("url")));
        resolved.put("url", redacted);
        resolved.put("repositoryUrl", redacted);
        return resolved;
    }

    public Map<String, Object> configureRepositoryURL(String repositoryURL) {
        return jdbcDriverRuntimeService.configureRepositoryURL(repositoryURL);
    }

    public Map<String, Object> resolvePackageDownloadURL(String driverType, String repositoryURL) {
        DriverDefinition definition = requireDefinition(driverType);
        if (definition.builtIn() && jdbcDriverRuntimeService.isClasspathAvailable(definition.type())) {
            throw new IllegalArgumentException(builtInPackageMessage(definition, messages.message("drivers.noDownloadNeeded")));
        }
        if (jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
            return jdbcDriverRuntimeService.resolvePackageDownloadURL(definition.type(), repositoryURL);
        }
        String url = definition.defaultDownloadUrl().isBlank()
                ? "builtin://activate/" + publicDriverType(definition.type())
                : definition.defaultDownloadUrl();
        return orderedMap(
                "url", url,
                "downloadUrl", url,
                "driverType", definition.type(),
                "driverName", definition.name(),
                "version", definition.pinnedVersion(),
                "engine", "java-compat-metadata",
                "repositoryUrl", sanitizeRepositoryURL(repositoryURL),
                "javaStatus", definition.javaStatus(),
                "dryRun", true
        );
    }

    public Map<String, Object> versionList(String driverType, String repositoryURL) {
        DriverDefinition definition = requireDefinition(driverType);
        if (definition.builtIn() && jdbcDriverRuntimeService.isClasspathAvailable(definition.type())) {
            throw new IllegalArgumentException(builtInPackageMessage(definition, messages.message("drivers.noVersionNeeded")));
        }
        if (jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
            return jdbcDriverRuntimeService.versionList(definition.type(), repositoryURL);
        }
        Map<String, Object> option = orderedMap(
                "version", definition.pinnedVersion(),
                "downloadUrl", definition.defaultDownloadUrl().isBlank()
                        ? "builtin://activate/" + publicDriverType(definition.type())
                        : definition.defaultDownloadUrl(),
                "packageSizeBytes", 0,
                "packageSizeText", "external package metadata",
                "recommended", true,
                "source", "javanavi-driver-matrix",
                "displayLabel", definition.pinnedVersion() + "（JavaNavi external package metadata）"
        );
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "pinnedVersion", definition.pinnedVersion(),
                "repositoryUrl", sanitizeRepositoryURL(repositoryURL),
                "versions", List.of(option),
                "javaStatus", definition.javaStatus(),
                "dryRun", true
        );
    }

    public Map<String, Object> packageSize(String driverType, String version) {
        DriverDefinition definition = requireDefinition(driverType);
        String versionText = textOrDefault(version, definition.pinnedVersion());
        boolean runtimeAvailable = runtimeAvailable(definition, defaultDriverDirectory);
        boolean classpathAvailable = jdbcDriverRuntimeService.isClasspathAvailable(definition.type());
        if (jdbcDriverRuntimeService.isManagedDriver(definition.type()) && !classpathAvailable) {
            return jdbcDriverRuntimeService.packageSize(definition.type(), version);
        }
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "version", versionText,
                "packageSizeBytes", 0,
                "packageSizeText", definition.builtIn()
                        ? (runtimeAvailable ? "backend runtime" : "not bundled in this package")
                        : "external package metadata",
                "releaseAssetName", publicDriverType(definition.type()) + "-driver-metadata.json",
                "sizeSource", "javanavi-driver-matrix",
                "dryRun", !definition.builtIn() || !runtimeAvailable
        );
    }

    public Map<String, Object> statusList(String downloadDir, String manifestURL) {
        Path resolvedDir = resolveManagedDriverDirectory(downloadDir);
        ensureDirectory(resolvedDir);
        Map<String, String> defaultDrivers = readDefaultDriverSettings();
        List<Map<String, Object>> rows = DRIVER_DEFINITIONS.stream()
                .map(definition -> statusItem(definition, resolvedDir, defaultDrivers))
                .toList();
        return orderedMap(
                "downloadDir", resolvedDir.toString(),
                "drivers", rows,
                "defaultDrivers", defaultDrivers,
                "manifestURL", sanitizeRepositoryURL(manifestURL),
                "manifestError", "",
                "webManaged", true
        );
    }

    public Map<String, Object> customDefinitions(String downloadDir) {
        Path resolvedDir = resolveManagedDriverDirectory(downloadDir);
        ensureDirectory(resolvedDir);
        List<Map<String, Object>> definitions = jdbcDriverRuntimeService.installedCustomDefinitionMetadataList(resolvedDir);
        return orderedMap(
                "definitions", definitions,
                "customDefinitions", definitions,
                "count", definitions.size(),
                "webManaged", true
        );
    }

    public Map<String, Object> validateCustomDefinition(String driverType, String downloadDir) {
        Path resolvedDir = resolveManagedDriverDirectory(downloadDir);
        ensureDirectory(resolvedDir);
        String normalizedDriverType = requireSafeCustomDriverType(driverType);
        return jdbcDriverRuntimeService.validateCustomDefinition(normalizedDriverType, resolvedDir);
    }

    public Map<String, Object> configureDefaultDriver(String databaseType, String driverType, String downloadDir) {
        Path resolvedDir = resolveManagedDriverDirectory(downloadDir);
        ensureDirectory(resolvedDir);
        DriverDefinition database = requireDefinition(databaseType);
        String selectedDriverType = normalizeDriverType(driverType);
        if (!compatibleDriverTypes(database.type()).contains(selectedDriverType)) {
            throw new IllegalArgumentException(messages.message("drivers.defaultIncompatible", "driver", driverName(selectedDriverType), "database", database.name()));
        }
        if (!runtimeAvailable(requireDefinition(selectedDriverType), resolvedDir)) {
            throw new IllegalArgumentException(messages.message("drivers.defaultMustBeAvailable"));
        }
        Map<String, String> defaults = new LinkedHashMap<>(readDefaultDriverSettings());
        defaults.put(database.type(), selectedDriverType);
        writeDefaultDriverSettings(defaults);
        return statusItem(database, resolvedDir, defaults);
    }

    public Map<String, Object> downloadPackage(String driverType, String version, String downloadURL, String downloadDir) {
        DriverDefinition definition = requireDefinition(driverType);
        Path resolvedDir = resolveManagedDriverDirectory(downloadDir);
        if (definition.builtIn() && jdbcDriverRuntimeService.isClasspathAvailable(definition.type())) {
            throw new IllegalArgumentException(builtInPackageMessage(definition, messages.message("drivers.noDownloadNeeded")));
        }
        if (jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
            publishDriverProgress(definition.type());
            return jdbcDriverRuntimeService.downloadPackage(definition.type(), version, downloadURL, resolvedDir);
        }
        ensureDirectory(resolvedDir);
        String versionText = textOrDefault(version, definition.pinnedVersion());
        String urlText = textOrDefault(downloadURL, definition.defaultDownloadUrl());
        if (urlText.isBlank()) {
            urlText = "builtin://activate/" + publicDriverType(definition.type());
        }
        publishDriverProgress(definition.type());
        Map<String, Object> metadata = driverMetadata(definition, versionText, urlText, "managed-download", resolvedDir);
        writeMetadata(resolvedDir, definition.type(), metadata);
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "version", versionText,
                "engine", "java-compat-metadata",
                "packageInstalled", true,
                "runtimeAvailable", false,
                "connectable", false,
                "dryRun", true,
                "message", messages.message("drivers.recordedMetadata")
        );
    }

    public Map<String, Object> installLocalPackage(String driverType, String packagePath, String downloadDir, String version) {
        return installLocalPackage(driverType, packagePath, downloadDir, version, "managed-local-import");
    }

    private Map<String, Object> installLocalPackage(String driverType, String packagePath, String downloadDir, String version, String installMode) {
        DriverDefinition definition = requireDefinition(driverType);
        Path resolvedDir = resolveManagedDriverDirectory(downloadDir);
        if (definition.builtIn() && jdbcDriverRuntimeService.isClasspathAvailable(definition.type())) {
            throw new IllegalArgumentException(builtInPackageMessage(definition, messages.message("drivers.noInstallNeeded")));
        }
        if (jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
            publishDriverProgress(definition.type());
            return jdbcDriverRuntimeService.installLocalPackage(definition.type(), packagePath, resolvedDir, version, installMode);
        }
        ensureDirectory(resolvedDir);
        String versionText = textOrDefault(version, definition.pinnedVersion());
        publishDriverProgress(definition.type());
        Map<String, Object> metadata = driverMetadata(definition, versionText, packagePath, installMode, resolvedDir);
        metadata.put("sourcePath", SecretRedactor.redact(textOrDefault(packagePath, "managed-upload-placeholder")));
        writeMetadata(resolvedDir, definition.type(), metadata);
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "version", versionText,
                "engine", "java-compat-metadata",
                "packageInstalled", true,
                "runtimeAvailable", false,
                "connectable", false,
                "installMode", installMode,
                "dryRun", true,
                "message", messages.message("drivers.recordedLocalImport")
        );
    }

    public Map<String, Object> installUploadedPackage(String driverType, List<MultipartFile> files, String downloadDir, String version) {
        Optional<DriverDefinition> optionalDefinition = findDefinition(driverType);
        Path resolvedDir = resolveManagedDriverDirectory(downloadDir);
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException(messages.message("drivers.uploadOneJar"));
        }
        String versionText = MojibakeTextNormalizer.normalize(version);
        if (versionText.isBlank()) {
            throw new IllegalArgumentException(messages.message("drivers.versionRequiredBeforeUpload"));
        }
        if (optionalDefinition.isPresent() && optionalDefinition.get().builtIn() && jdbcDriverRuntimeService.isClasspathAvailable(optionalDefinition.get().type())) {
            DriverDefinition definition = optionalDefinition.get();
            throw new IllegalArgumentException(builtInPackageMessage(definition, messages.message("drivers.noUploadNeeded")));
        }
        if (optionalDefinition.isPresent() && jdbcDriverRuntimeService.isManagedDriver(optionalDefinition.get().type())) {
            DriverDefinition definition = optionalDefinition.get();
            throw new IllegalArgumentException(builtInPackageMessage(definition, messages.message("drivers.noUploadNeeded")));
        }
        String normalizedDriverType = optionalDefinition
                .map(DriverDefinition::type)
                .orElseGet(() -> requireSafeCustomDriverType(driverType));
        Path uploadDir = resolvedDir.resolve("uploads").resolve(UUID.randomUUID().toString()).normalize();
        if (!uploadDir.startsWith(dataDirectory)) {
            throw new IllegalArgumentException(messages.message("drivers.uploadPathEscaped"));
        }
        ensureDirectory(uploadDir);
        int copied = 0;
        try {
            for (MultipartFile file : files) {
                if (file == null || file.isEmpty()) {
                    continue;
                }
                String fileName = uploadFileName(file.getOriginalFilename(), copied);
                Path target = uploadDir.resolve(fileName).normalize();
                if (!target.startsWith(uploadDir)) {
                    throw new IllegalArgumentException(messages.message("drivers.uploadFileEscaped"));
                }
                try {
                    file.transferTo(target);
                } catch (IOException error) {
                    throw new IllegalStateException(messages.message("drivers.storeUploadedJar", "file", fileName), error);
                }
                copied += 1;
            }
            if (copied == 0) {
                throw new IllegalArgumentException(messages.message("drivers.uploadNonEmptyJar"));
            }
            if (optionalDefinition.isPresent()) {
                return installLocalPackage(normalizedDriverType, uploadDir.toString(), resolvedDir.toString(), versionText, "manual-upload");
            }
            publishDriverProgress(normalizedDriverType);
            Map<String, Object> installResult = jdbcDriverRuntimeService.installCustomLocalPackage(normalizedDriverType, uploadDir.toString(), resolvedDir, versionText, "manual-upload");
            Map<String, Object> definition = new LinkedHashMap<>(jdbcDriverRuntimeService.validateCustomDefinition(normalizedDriverType, resolvedDir));
            definition.put("engine", textOrDefault(installResult.get("engine"), "java-jdbc-runtime"));
            definition.put("packageInstalled", true);
            definition.put("runtimeAvailable", definition.get("driverLoadable"));
            definition.put("connectable", definition.get("definitionUsable"));
            definition.put("installMode", textOrDefault(installResult.get("installMode"), "manual-upload"));
            definition.put("installSource", "manual-upload");
            definition.put("message", textOrDefault(installResult.get("message"), text(definition.get("message"))));
            return definition;
        } finally {
            deleteDirectory(uploadDir);
        }
    }

    public Map<String, Object> removePackage(String driverType, String downloadDir) {
        DriverDefinition definition = requireDefinition(driverType);
        Path resolvedDir = resolveManagedDriverDirectory(downloadDir);
        String runtimeOwnerType = managedRuntimeOwnerType(definition.type());
        if (!runtimeOwnerType.equals(definition.type()) && jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
            throw new IllegalArgumentException(messages.message("drivers.reuseManagedByOwner", "driver", definition.name(), "owner", driverName(runtimeOwnerType)));
        }
        if (definition.builtIn() && runtimeAvailable(definition, resolvedDir) && jdbcDriverRuntimeService.isClasspathAvailable(definition.type())) {
            throw new IllegalArgumentException(messages.message("drivers.builtinCannotRemove"));
        }
        if (jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
            return jdbcDriverRuntimeService.removePackage(definition.type(), resolvedDir);
        }
        Path installDir = installDir(resolvedDir, definition.type());
        try {
            if (Files.exists(installDir)) {
                try (var walk = Files.walk(installDir)) {
                    walk.sorted((left, right) -> right.compareTo(left))
                            .forEach(path -> {
                                try {
                                    Files.deleteIfExists(path);
                                } catch (IOException error) {
                                    throw new IllegalStateException(messages.message("drivers.removeMetadataFailed"), error);
                                }
                            });
                }
            }
        } catch (IOException error) {
            throw new IllegalStateException(messages.message("drivers.removeMetadataFailed"), error);
        }
        return orderedMap(
                "driverType", definition.type(),
                "driverName", definition.name(),
                "removed", true,
                "message", messages.message("drivers.metadataRemoved")
        );
    }

    private Map<String, Object> statusItem(DriverDefinition definition, Path resolvedDir, Map<String, String> defaultDrivers) {
        String runtimeOwnerType = managedRuntimeOwnerType(definition.type());
        boolean reusedManagedRuntime = !runtimeOwnerType.equals(definition.type()) && jdbcDriverRuntimeService.isManagedDriver(definition.type());
        Optional<Map<String, Object>> metadata = reusedManagedRuntime
                ? Optional.empty()
                : readMetadata(resolvedDir, definition.type());
        Optional<Map<String, Object>> jdbcMetadata = reusedManagedRuntime
                ? Optional.empty()
                : jdbcDriverRuntimeService.installedMetadata(definition.type(), resolvedDir);
        Optional<Map<String, Object>> reusedJdbcMetadata = reusedManagedRuntime
                ? jdbcDriverRuntimeService.installedMetadata(runtimeOwnerType, resolvedDir)
                : Optional.empty();
        List<Map<String, Object>> installedVersions = reusedManagedRuntime
                ? jdbcDriverRuntimeService.installedVersionMetadataList(runtimeOwnerType, resolvedDir)
                : jdbcDriverRuntimeService.installedVersionMetadataList(definition.type(), resolvedDir);
        boolean managedJdbc = jdbcDriverRuntimeService.isManagedDriver(definition.type());
        boolean classpathRuntime = jdbcDriverRuntimeService.isClasspathAvailable(definition.type());
        boolean implementedRuntime = runtimeAvailable(definition, resolvedDir);
        boolean backendBuiltIn = definition.builtIn() && implementedRuntime && (!managedJdbc || classpathRuntime);
        boolean packageInstalled = backendBuiltIn ? implementedRuntime : metadata.isPresent() || jdbcMetadata.isPresent();
        String javaStatus = implementedRuntime ? definition.javaStatus() : "not-bundled";
        String installedVersion = jdbcMetadata
                .or(() -> reusedJdbcMetadata)
                .or(() -> metadata)
                .map(value -> text(value.get("version")))
                .filter(value -> !value.isBlank())
                .orElse("");
        if (installedVersion.isBlank() && implementedRuntime) {
            installedVersion = definition.pinnedVersion();
        }
        Optional<Map<String, Object>> activeMetadata = jdbcMetadata.or(() -> metadata);
        Map<String, Object> sourceInfo = driverSourceInfo(
                definition,
                backendBuiltIn,
                reusedManagedRuntime,
                runtimeOwnerType,
                activeMetadata,
                reusedJdbcMetadata,
                implementedRuntime
        );
        List<Map<String, Object>> driverOptions = compatibleDriverOptions(definition, resolvedDir, defaultDrivers);
        String defaultDriverType = defaultDriverType(definition.type(), resolvedDir, defaultDrivers);
        Map<String, Object> row = orderedMap(
                "type", definition.type(),
                "name", definition.name(),
                "engine", "java",
                "builtIn", backendBuiltIn,
                "managedJarUploadAllowed", false,
                "managedDownload", managedJdbc,
                "downloadRequired", managedJdbc && !implementedRuntime && !reusedManagedRuntime,
                "reusedDriverType", reusedManagedRuntime ? runtimeOwnerType : "",
                "reusedDriverName", reusedManagedRuntime ? driverName(runtimeOwnerType) : "",
                "pinnedVersion", definition.pinnedVersion(),
                "installedVersion", installedVersion,
                "installedVersions", installedVersions,
                "installedVersionCount", installedVersions.size(),
                "packageSizeText", backendBuiltIn
                        ? "backend runtime"
                        : reusedManagedRuntime
                        ? messages.message("drivers.reuseRuntimeLabel", "owner", driverName(runtimeOwnerType))
                        : managedJdbc && implementedRuntime
                        ? "managed driver cache"
                        : managedJdbc
                        ? messages.message("drivers.onDemandDownload")
                        : "external package metadata",
                "runtimeAvailable", implementedRuntime,
                "packageInstalled", packageInstalled,
                "connectable", implementedRuntime,
                "defaultDownloadUrl", definition.defaultDownloadUrl(),
                "installDir", installDir(resolvedDir, definition.type()).toString(),
                "javaStatus", javaStatus,
                "installMode", sourceInfo.get("installMode"),
                "installSource", sourceInfo.get("installSource"),
                "installSourceLabel", sourceInfo.get("installSourceLabel"),
                "installSourceDetail", sourceInfo.get("installSourceDetail"),
                "defaultDriverType", defaultDriverType,
                "defaultDriverName", driverName(defaultDriverType),
                "driverOptions", driverOptions,
                "message", statusMessage(definition, resolvedDir, metadata.isPresent() || jdbcMetadata.isPresent(), runtimeOwnerType)
        );
        jdbcMetadata.ifPresent(value -> {
            row.put("packagePath", text(value.get("filePath")));
            row.put("packageFileName", text(value.get("fileName")));
            row.put("downloadedAt", text(value.get("downloadedAt")));
            row.put("executablePath", text(value.get("executablePath")));
        });
        reusedJdbcMetadata.ifPresent(value -> {
            row.put("reusedPackagePath", text(value.get("filePath")));
            row.put("reusedPackageFileName", text(value.get("fileName")));
            row.put("reusedDownloadedAt", text(value.get("downloadedAt")));
        });
        metadata.ifPresent(value -> {
            row.put("packagePath", text(value.get("filePath")));
            row.put("packageFileName", text(value.get("fileName")));
            row.put("downloadedAt", text(value.get("downloadedAt")));
            row.put("executablePath", text(value.get("executablePath")));
        });
        return row;
    }

    private Map<String, Object> driverSourceInfo(
            DriverDefinition definition,
            boolean backendBuiltIn,
            boolean reusedManagedRuntime,
            String runtimeOwnerType,
            Optional<Map<String, Object>> activeMetadata,
            Optional<Map<String, Object>> reusedMetadata,
            boolean implementedRuntime
    ) {
        if (backendBuiltIn) {
            return orderedMap(
                    "installMode", "backend-runtime",
                    "installSource", "backend-runtime",
                    "installSourceLabel", messages.message("drivers.builtinRuntime"),
                    "installSourceDetail", definition.message()
            );
        }
        if (reusedManagedRuntime) {
            Map<String, Object> ownerSource = metadataSourceInfo(reusedMetadata);
            String ownerLabel = textOrDefault(ownerSource.get("installSourceLabel"), messages.message("drivers.notInstalled"));
            return orderedMap(
                    "installMode", "reused-runtime",
                    "installSource", "reused-runtime",
                    "installSourceLabel", messages.message("drivers.reuseRuntimeSourceLabel", "owner", driverName(runtimeOwnerType), "label", ownerLabel),
                    "installSourceDetail", messages.message("drivers.reuseRuntimeSourceDetail", "driver", definition.name(), "owner", driverName(runtimeOwnerType))
            );
        }
        if (activeMetadata.isPresent()) {
            return metadataSourceInfo(activeMetadata);
        }
        if (implementedRuntime) {
            return orderedMap(
                    "installMode", "runtime",
                    "installSource", "runtime",
                    "installSourceLabel", "Java runtime",
                    "installSourceDetail", definition.message()
            );
        }
        return orderedMap(
                "installMode", "",
                "installSource", "not-installed",
                "installSourceLabel", messages.message("drivers.notInstalled"),
                "installSourceDetail", ""
        );
    }

    private Map<String, Object> metadataSourceInfo(Optional<Map<String, Object>> metadata) {
        if (metadata.isEmpty()) {
            return orderedMap(
                    "installMode", "backend-runtime",
                    "installSource", "backend-runtime",
                    "installSourceLabel", messages.message("drivers.builtinRuntime"),
                    "installSourceDetail", ""
            );
        }
        Map<String, Object> value = metadata.get();
        String installMode = text(value.get("installMode"));
        String normalized = installMode.toLowerCase(Locale.ROOT);
        if (normalized.contains("download")) {
            String repository = SecretRedactor.redact(text(value.get("repositoryUrl")));
            return orderedMap(
                    "installMode", installMode,
                    "installSource", "maven-download",
                    "installSourceLabel", messages.message("drivers.mavenDownload"),
                    "installSourceDetail", repository.isBlank() ? messages.message("drivers.mavenSourceDownload") : messages.message("drivers.mavenSourcePrefix") + repository
            );
        }
        if (normalized.contains("upload") || normalized.contains("local-import")) {
            return orderedMap(
                    "installMode", installMode,
                    "installSource", "manual-upload",
                    "installSourceLabel", messages.message("drivers.manualUpload"),
                    "installSourceDetail", messages.message("drivers.uploadInstallDetail")
            );
        }
        return orderedMap(
                "installMode", installMode,
                "installSource", installMode.isBlank() ? "metadata" : installMode,
                "installSourceLabel", installMode.isBlank() ? messages.message("drivers.metadata") : installMode,
                "installSourceDetail", ""
        );
    }

    private List<Map<String, Object>> compatibleDriverOptions(DriverDefinition databaseDefinition, Path resolvedDir, Map<String, String> defaultDrivers) {
        String defaultDriverType = defaultDriverType(databaseDefinition.type(), resolvedDir, defaultDrivers);
        return compatibleDriverTypes(databaseDefinition.type()).stream()
                .map(this::requireDefinition)
                .map(driverDefinition -> {
                    String runtimeOwnerType = managedRuntimeOwnerType(driverDefinition.type());
                    boolean available = runtimeAvailable(driverDefinition, resolvedDir);
                    boolean reusedRuntime = !runtimeOwnerType.equals(driverDefinition.type());
                    return orderedMap(
                            "driverType", driverDefinition.type(),
                            "driverName", driverDefinition.name(),
                            "databaseType", databaseDefinition.type(),
                            "databaseName", databaseDefinition.name(),
                            "available", available,
                            "connectable", available,
                            "default", driverDefinition.type().equals(defaultDriverType),
                            "runtimeOwnerType", runtimeOwnerType,
                            "runtimeOwnerName", driverName(runtimeOwnerType),
                            "reusedRuntime", reusedRuntime,
                            "driverClassName", driverDefinition.runtimeClassName(),
                            "message", reusedRuntime
                                    ? messages.message("drivers.reuseRuntimeSourceDetail", "driver", driverDefinition.name(), "owner", driverName(runtimeOwnerType))
                                    : driverDefinition.message()
                    );
                })
                .toList();
    }

    private String defaultDriverType(String databaseType, Path resolvedDir, Map<String, String> defaultDrivers) {
        String normalizedDatabaseType = normalizeDriverType(databaseType);
        List<String> candidates = compatibleDriverTypes(normalizedDatabaseType);
        String configured = normalizeDriverType(defaultDrivers.get(normalizedDatabaseType));
        if (candidates.contains(configured) && runtimeAvailable(requireDefinition(configured), resolvedDir)) {
            return configured;
        }
        return candidates.stream()
                .filter(candidate -> runtimeAvailable(requireDefinition(candidate), resolvedDir))
                .findFirst()
                .orElse(candidates.get(0));
    }

    private static List<String> compatibleDriverTypes(String databaseType) {
        String normalized = normalizeDriverType(databaseType);
        return List.of(normalized);
    }

    private String statusMessage(DriverDefinition definition, Path resolvedDir, boolean metadataInstalled, String runtimeOwnerType) {
        if (runtimeAvailable(definition, resolvedDir)) {
            if (!runtimeOwnerType.equals(definition.type()) && jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
                return messages.message("drivers.reuseRuntimeStatus", "driver", definition.name(), "owner", driverName(runtimeOwnerType));
            }
            if (jdbcDriverRuntimeService.isManagedDriver(definition.type()) && !jdbcDriverRuntimeService.isClasspathAvailable(definition.type())) {
                return "JavaNavi managed JDBC runtime available from local driver cache: " + definition.message();
            }
            return "JavaNavi runtime available: " + definition.message();
        }
        if (definition.builtIn() && "implemented".equals(definition.javaStatus())) {
            if (jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
                if (!runtimeOwnerType.equals(definition.type())) {
                    return messages.message("drivers.reuseRuntimeDependency", "driver", definition.name(), "owner", driverName(runtimeOwnerType));
                }
                return messages.message("drivers.missingJdbcDownloadable");
            }
            return messages.message("drivers.missingCanDownloadJar");
        }
        if (metadataInstalled) {
            return messages.message("drivers.metadataRegisteredPrefix") + definition.message();
        }
        return definition.message();
    }

    private boolean runtimeAvailable(DriverDefinition definition, Path resolvedDir) {
        if (!"implemented".equals(definition.javaStatus())) {
            return false;
        }
        if (!jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
            return true;
        }
        return jdbcDriverRuntimeService.isRuntimeAvailable(definition.type(), resolvedDir);
    }

    private String builtInPackageMessage(DriverDefinition definition, String defaultMessage) {
        if (runtimeAvailable(definition, defaultDriverDirectory)) {
            return messages.message("drivers.builtinDriverNoSuffix") + defaultMessage;
        }
        if (jdbcDriverRuntimeService.isManagedDriver(definition.type())) {
            return messages.message("drivers.missingCanDownloadJar");
        }
        return messages.message("drivers.missingCanDownloadJar");
    }

    private Map<String, Object> driverMetadata(DriverDefinition definition, String version, String source, String installMode, Path resolvedDir) {
        Path installDir = installDir(resolvedDir, definition.type());
        return orderedMap(
                "driverType", definition.type(),
                "version", version,
                "filePath", installDir.resolve(METADATA_FILE_NAME).toString(),
                "fileName", METADATA_FILE_NAME,
                "executablePath", "",
                "downloadUrl", SecretRedactor.redact(textOrDefault(source, definition.defaultDownloadUrl())),
                "sha256", "",
                "downloadedAt", Instant.now().toString(),
                "installMode", installMode,
                "runtimeAvailable", false,
                "connectable", false,
                "dryRun", true
        );
    }

    private void writeMetadata(Path resolvedDir, String driverType, Map<String, Object> metadata) {
        Path directory = installDir(resolvedDir, driverType);
        ensureDirectory(directory);
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(directory.resolve(METADATA_FILE_NAME).toFile(), metadata);
        } catch (IOException error) {
            throw new IllegalStateException(messages.message("drivers.writeMetadataFailed"), error);
        }
    }

    private Optional<Map<String, Object>> readMetadata(Path resolvedDir, String driverType) {
        Path file = installDir(resolvedDir, driverType).resolve(METADATA_FILE_NAME);
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        try {
            Map<String, Object> value = objectMapper.readValue(file.toFile(), MAP_TYPE);
            return Optional.of(new LinkedHashMap<>(value));
        } catch (IOException error) {
            throw new IllegalStateException(messages.message("drivers.readMetadataFailed"), error);
        }
    }

    private Map<String, String> readDefaultDriverSettings() {
        Path file = defaultDriverDirectory.resolve(DRIVER_DEFAULTS_FILE_NAME);
        if (!Files.isRegularFile(file)) {
            return Map.of();
        }
        try {
            Map<String, Object> raw = objectMapper.readValue(file.toFile(), MAP_TYPE);
            Map<String, String> defaults = new LinkedHashMap<>();
            raw.forEach((databaseType, driverType) -> {
                String normalizedDatabaseType = normalizeDriverType(databaseType);
                String normalizedDriverType = normalizeDriverType(text(driverType));
                if (!normalizedDatabaseType.isBlank()
                        && compatibleDriverTypes(normalizedDatabaseType).contains(normalizedDriverType)) {
                    defaults.put(normalizedDatabaseType, normalizedDriverType);
                }
            });
            return defaults;
        } catch (IOException error) {
            throw new IllegalStateException(messages.message("drivers.readDefaultsFailed"), error);
        }
    }

    private void writeDefaultDriverSettings(Map<String, String> defaults) {
        ensureDirectory(defaultDriverDirectory);
        Map<String, String> normalized = new LinkedHashMap<>();
        defaults.forEach((databaseType, driverType) -> {
            String normalizedDatabaseType = normalizeDriverType(databaseType);
            String normalizedDriverType = normalizeDriverType(driverType);
            if (!normalizedDatabaseType.isBlank()
                    && compatibleDriverTypes(normalizedDatabaseType).contains(normalizedDriverType)) {
                normalized.put(normalizedDatabaseType, normalizedDriverType);
            }
        });
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(defaultDriverDirectory.resolve(DRIVER_DEFAULTS_FILE_NAME).toFile(), normalized);
        } catch (IOException error) {
            throw new IllegalStateException(messages.message("drivers.writeDefaultsFailed"), error);
        }
    }

    private void publishDriverProgress(String driverType) {
        try {
            fixtures.fixturesFor(new CompatEventReplayRequestDto(
                    "driver",
                    normalizeDriverType(driverType),
                    null,
                    Map.of("driverType", normalizeDriverType(driverType))
            )).forEach(publisher::publish);
        } catch (RuntimeException ignored) {
            // Driver operations should still succeed if there are no SSE subscribers or fixture publication is unavailable.
        }
    }

    private DriverDefinition requireDefinition(String driverType) {
        return findDefinition(driverType)
                .orElseThrow(() -> new IllegalArgumentException(messages.message("drivers.unsupportedType", "type", textOrDefault(driverType, "<empty>"))));
    }

    private Optional<DriverDefinition> findDefinition(String driverType) {
        String normalized = normalizeDriverType(driverType);
        return DRIVER_DEFINITIONS.stream()
                .filter(definition -> definition.type().equals(normalized))
                .findFirst();
    }

    private Path resolveManagedDriverDirectory(String rawPath) {
        String raw = rawPath == null ? "" : rawPath.trim();
        Path root = defaultDriverDirectory.toAbsolutePath().normalize();
        if (raw.isBlank()) {
            return root;
        }
        Path input = Path.of(raw);
        Path candidate = input.isAbsolute()
                ? input.toAbsolutePath().normalize()
                : root.resolve(raw.replace('\\', '/')).normalize();
        if (!candidate.startsWith(dataDirectory)) {
            String leaf = candidate.getFileName() == null ? "drivers" : candidate.getFileName().toString();
            candidate = root.resolve(leaf).normalize();
        }
        if (!candidate.startsWith(dataDirectory)) {
            throw new IllegalArgumentException(messages.message("drivers.workspacePathManaged"));
        }
        return candidate;
    }

    private String sanitizeRepositoryURL(String repositoryURL) {
        String raw = textOrDefault(repositoryURL, DEFAULT_REPOSITORY_URL);
        if (raw.startsWith("builtin://")) {
            return raw;
        }
        try {
            URI uri = new URI(raw);
            String scheme = text(uri.getScheme()).toLowerCase(Locale.ROOT);
            if (!List.of("https", "http", "file").contains(scheme)) {
                return DEFAULT_REPOSITORY_URL;
            }
            return SecretRedactor.redact(raw);
        } catch (URISyntaxException error) {
            return DEFAULT_REPOSITORY_URL;
        }
    }

    private static String normalizeDriverType(String driverType) {
        String normalized = textOrDefault(driverType, "").toLowerCase(Locale.ROOT).trim();
        if (normalized.equals("doris")) {
            return "diros";
        }
        if (normalized.equals("postgresql")) {
            return "postgres";
        }
        if (normalized.equals("mssql") || normalized.equals("sql_server") || normalized.equals("sql server")) {
            return "sqlserver";
        }
        if (normalized.equals("dm") || normalized.equals("dm8")) {
            return "dameng";
        }
        if (normalized.equals("taos") || normalized.equals("taos-rs") || normalized.equals("taos_rs")) {
            return "tdengine";
        }
        if (normalized.equals("ch")) {
            return "clickhouse";
        }
        return normalized;
    }

    private String requireSafeCustomDriverType(String driverType) {
        String normalized = normalizeDriverType(driverType);
        boolean builtIn = DRIVER_DEFINITIONS.stream().anyMatch(definition -> definition.type().equals(normalized));
        if (!normalized.matches("[a-z0-9][a-z0-9._-]{0,63}")
                || ".".equals(normalized)
                || "..".equals(normalized)
                || "custom".equals(normalized)
                || builtIn) {
            throw new IllegalArgumentException(messages.message("drivers.invalidCustomId", "type", textOrDefault(driverType, "<empty>")));
        }
        return normalized;
    }

    private static String publicDriverType(String driverType) {
        return "diros".equals(driverType) ? "doris" : driverType;
    }

    private static String managedRuntimeOwnerType(String driverType) {
        return switch (normalizeDriverType(driverType)) {
            case "mariadb", "diros", "sphinx" -> "mysql";
            case "kingbase", "highgo", "vastbase" -> "postgres";
            default -> normalizeDriverType(driverType);
        };
    }

    private static String driverName(String driverType) {
        return switch (normalizeDriverType(driverType)) {
            case "mysql" -> "MySQL";
            case "postgres" -> "PostgreSQL";
            case "mariadb" -> "MariaDB";
            case "diros" -> "Doris";
            case "sphinx" -> "Sphinx";
            case "kingbase" -> "Kingbase";
            case "highgo" -> "HighGo";
            case "vastbase" -> "Vastbase";
            default -> publicDriverType(driverType);
        };
    }

    private static String repositoryHost(String repositoryUrl) {
        try {
            String host = new URI(repositoryUrl).getHost();
            return text(host);
        } catch (URISyntaxException ignored) {
            return "";
        }
    }

    private static Integer integerValue(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            String text = text(value);
            return text.isBlank() ? null : Integer.parseInt(text);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String uploadFileName(String originalFilename, int index) {
        String leaf = Path.of(textOrDefault(originalFilename, "jdbc-driver-" + index + ".jar"))
                .getFileName()
                .toString()
                .replaceAll("[^A-Za-z0-9._-]", "_");
        if (leaf.isBlank()) {
            leaf = "jdbc-driver-" + index + ".jar";
        }
        if (!leaf.toLowerCase(Locale.ROOT).endsWith(".jar")) {
            throw new IllegalArgumentException(messages.message("drivers.jdbcJarOnly", "file", leaf));
        }
        return index + "-" + leaf;
    }

    private static Path installDir(Path resolvedDir, String driverType) {
        return resolvedDir.resolve(normalizeDriverType(driverType)).normalize();
    }

    private void ensureDirectory(Path directory) {
        try {
            Files.createDirectories(directory);
        } catch (IOException error) {
            throw new IllegalStateException(messages.message("drivers.prepareWorkspaceFailed"), error);
        }
    }

    private void deleteDirectory(Path directory) {
        if (!Files.exists(directory)) {
            return;
        }
        try (var walk = Files.walk(directory)) {
            walk.sorted((left, right) -> right.compareTo(left))
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException error) {
                            throw new IllegalStateException(messages.message("drivers.removeTempUploadFailed"), error);
                        }
                    });
        } catch (IOException error) {
            throw new IllegalStateException(messages.message("drivers.removeTempUploadFailed"), error);
        }
    }

    private DirectoryOpenResult openDirectory(Path directory) {
        if (truthy(System.getenv("JAVANAVI_DISABLE_OS_OPEN"))) {
            return new DirectoryOpenResult(false, "disabled", messages.message("drivers.openDirDisabled", "path", directory));
        }
        List<List<String>> commands = directoryOpenCommands(directory);
        String lastError = "";
        for (List<String> command : commands) {
            try {
                Process process = new ProcessBuilder(command)
                        .redirectErrorStream(true)
                        .start();
                boolean exited = process.waitFor(2, TimeUnit.SECONDS);
                if (!exited || process.exitValue() == 0) {
                    return new DirectoryOpenResult(true, command.get(0), messages.message("drivers.openedDir", "path", directory));
                }
                lastError = command.get(0) + " exit=" + process.exitValue();
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return new DirectoryOpenResult(false, command.get(0), messages.message("drivers.openDirInterrupted", "path", directory));
            } catch (Exception error) {
                lastError = command.get(0) + ": " + error.getMessage();
            }
        }
        String suffix = lastError.isBlank() ? "" : " (" + lastError + ")";
        return new DirectoryOpenResult(false, "", messages.message("drivers.openDirFailed", "path", directory, "suffix", suffix));
    }

    private static List<List<String>> directoryOpenCommands(Path directory) {
        String path = directory.toString();
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            return List.of(List.of("explorer.exe", path));
        }
        if (os.contains("mac") || os.contains("darwin")) {
            return List.of(List.of("open", path));
        }
        return List.of(
                List.of("xdg-open", path),
                List.of("gio", "open", path),
                List.of("kde-open5", path),
                List.of("kde-open", path)
        );
    }

    private static boolean truthy(String value) {
        String normalized = text(value).toLowerCase(Locale.ROOT);
        return List.of("1", "true", "yes", "on").contains(normalized);
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String textOrDefault(Object value, String fallback) {
        String text = text(value);
        return text.isBlank() ? fallback : text;
    }

    private static Map<String, String> orderedStringMap(String... entries) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < entries.length; i += 2) {
            map.put(entries[i], entries[i + 1]);
        }
        return map;
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    private record DriverDefinition(
            String type,
            String name,
            boolean builtIn,
            String pinnedVersion,
            String defaultDownloadUrl,
            String javaStatus,
            String runtimeClassName,
            String message
    ) {
    }

    private record DirectoryOpenResult(boolean opened, String method, String message) {
    }
}
