package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

public final class DriverContracts {
    private DriverContracts() {
    }

    public record DirectoryRequest(@JsonAlias({"directory"}) String path) {
        public String value() {
            return text(path);
        }
    }

    public record RepositoryRequest(@JsonAlias({"repositoryURL", "repositoryUrl"}) String url) {
        public String value() {
            return text(url);
        }
    }

    public record DriverRepositoryRequest(String driverType, @JsonAlias({"repositoryURL", "repositoryUrl"}) String url) {
    }

    public record DriverTypeRequest(String driverType, @JsonAlias({"directory", "path"}) String downloadDir) {
    }

    public record VersionRequest(String driverType, String version) {
    }

    public record StatusRequest(
            @JsonAlias({"directory", "path"}) String downloadDir,
            @JsonAlias({"manifestURL", "manifestUrl", "repositoryURL", "repositoryUrl"}) String manifestURL
    ) {
    }

    public record DefaultDriverRequest(
            @JsonAlias({"type"}) String databaseType,
            @JsonAlias({"defaultDriverType", "driver"}) String driverType,
            @JsonAlias({"directory", "path"}) String downloadDir
    ) {
    }

    public record DownloadRequest(
            String driverType,
            String version,
            @JsonAlias({"downloadUrl", "url"}) String downloadURL,
            @JsonAlias({"directory", "path"}) String downloadDir
    ) {
    }

    public record InstallLocalRequest(
            String driverType,
            @JsonAlias({"packagePath", "path"}) String filePath,
            @JsonAlias({"directory"}) String downloadDir,
            String version
    ) {
    }

    public record DriverDirectoryResponse(
            String path,
            String directory,
            String defaultPath,
            boolean isDefaultPath,
            boolean webManaged,
            boolean opened,
            String openMethod,
            String message
    ) {
        public static DriverDirectoryResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new DriverDirectoryResponse(
                    text(source.get("path")),
                    text(source.get("directory")),
                    text(source.get("defaultPath")),
                    booleanValue(source.get("isDefaultPath")),
                    booleanValue(source.get("webManaged")),
                    booleanValue(source.get("opened")),
                    text(source.get("openMethod")),
                    text(source.get("message"))
            );
        }
    }

    public record DriverRepositoryResponse(
            String url,
            String repositoryUrl,
            String defaultUrl,
            String defaultRepositoryURL,
            boolean webManaged,
            String configuredRepositoryUrl,
            boolean repositoryConfigured,
            String defaultRepositoryUrl,
            String updatedAt
    ) {
        public static DriverRepositoryResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new DriverRepositoryResponse(
                    text(source.get("url")),
                    text(source.get("repositoryUrl")),
                    text(source.get("defaultUrl")),
                    text(source.get("defaultRepositoryURL")),
                    booleanValue(source.get("webManaged")),
                    text(source.get("configuredRepositoryUrl")),
                    booleanValue(source.get("repositoryConfigured")),
                    text(source.get("defaultRepositoryUrl")),
                    text(source.get("updatedAt"))
            );
        }
    }

    public record DriverPackageUrlResponse(
            String url,
            String downloadUrl,
            String driverType,
            String driverName,
            String version,
            String engine,
            String repositoryUrl,
            String javaStatus,
            Integer artifactCount,
            boolean dryRun
    ) {
        public static DriverPackageUrlResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new DriverPackageUrlResponse(
                    text(source.get("url")),
                    text(source.get("downloadUrl")),
                    text(source.get("driverType")),
                    text(source.get("driverName")),
                    text(source.get("version")),
                    text(source.get("engine")),
                    text(source.get("repositoryUrl")),
                    text(source.get("javaStatus")),
                    integerValue(source.get("artifactCount")),
                    booleanValue(source.get("dryRun"))
            );
        }
    }

    public record DriverVersionOptionResponse(
            String version,
            String downloadUrl,
            long packageSizeBytes,
            String packageSizeText,
            boolean recommended,
            String source,
            String displayLabel
    ) {
        public static DriverVersionOptionResponse from(Object value) {
            Map<String, Object> source = mapValue(value);
            return new DriverVersionOptionResponse(
                    text(source.get("version")),
                    text(source.get("downloadUrl")),
                    longValue(source.get("packageSizeBytes")) == null ? 0L : longValue(source.get("packageSizeBytes")),
                    text(source.get("packageSizeText")),
                    booleanValue(source.get("recommended")),
                    text(source.get("source")),
                    text(source.get("displayLabel"))
            );
        }
    }

    public record DriverVersionsResponse(
            String driverType,
            String driverName,
            String pinnedVersion,
            String repositoryUrl,
            List<DriverVersionOptionResponse> versions,
            String javaStatus,
            boolean dryRun
    ) {
        public static DriverVersionsResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new DriverVersionsResponse(
                    text(source.get("driverType")),
                    text(source.get("driverName")),
                    text(source.get("pinnedVersion")),
                    text(source.get("repositoryUrl")),
                    listValue(source.get("versions")).stream().map(DriverVersionOptionResponse::from).toList(),
                    text(source.get("javaStatus")),
                    booleanValue(source.get("dryRun"))
            );
        }
    }

    public record DriverPackageSizeResponse(
            String driverType,
            String driverName,
            String version,
            long packageSizeBytes,
            String packageSizeText,
            String releaseAssetName,
            String sizeSource,
            boolean dryRun
    ) {
        public static DriverPackageSizeResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            Long packageSizeBytes = longValue(source.get("packageSizeBytes"));
            return new DriverPackageSizeResponse(
                    text(source.get("driverType")),
                    text(source.get("driverName")),
                    text(source.get("version")),
                    packageSizeBytes == null ? 0L : packageSizeBytes,
                    text(source.get("packageSizeText")),
                    text(source.get("releaseAssetName")),
                    text(source.get("sizeSource")),
                    booleanValue(source.get("dryRun"))
            );
        }
    }

    public record DriverInstalledVersionResponse(
            String version,
            boolean active,
            String installMode,
            String installSource,
            String downloadedAt,
            String installDir,
            String filePath
    ) {
        public static DriverInstalledVersionResponse from(Object value) {
            Map<String, Object> source = mapValue(value);
            return new DriverInstalledVersionResponse(
                    text(source.get("version")),
                    booleanValue(source.get("active")),
                    text(source.get("installMode")),
                    text(source.get("installSource")),
                    text(source.get("downloadedAt")),
                    text(source.get("installDir")),
                    text(source.get("filePath"))
            );
        }
    }

    public record DriverOptionResponse(
            String driverType,
            String driverName,
            String databaseType,
            String databaseName,
            boolean available,
            boolean connectable,
            @JsonProperty("default") boolean defaultDriver,
            String runtimeOwnerType,
            String runtimeOwnerName,
            boolean reusedRuntime,
            String driverClassName,
            String message
    ) {
        public static DriverOptionResponse from(Object value) {
            Map<String, Object> source = mapValue(value);
            return new DriverOptionResponse(
                    text(source.get("driverType")),
                    text(source.get("driverName")),
                    text(source.get("databaseType")),
                    text(source.get("databaseName")),
                    booleanValue(source.get("available")),
                    booleanValue(source.get("connectable")),
                    booleanValue(source.get("default")),
                    text(source.get("runtimeOwnerType")),
                    text(source.get("runtimeOwnerName")),
                    booleanValue(source.get("reusedRuntime")),
                    text(source.get("driverClassName")),
                    text(source.get("message"))
            );
        }
    }

    public record DriverStatusItemResponse(
            String type,
            String name,
            String engine,
            boolean builtIn,
            boolean managedJarUploadAllowed,
            boolean managedDownload,
            boolean downloadRequired,
            String reusedDriverType,
            String reusedDriverName,
            String pinnedVersion,
            String installedVersion,
            List<DriverInstalledVersionResponse> installedVersions,
            Integer installedVersionCount,
            String packageSizeText,
            boolean runtimeAvailable,
            boolean packageInstalled,
            boolean connectable,
            String defaultDownloadUrl,
            String installDir,
            String javaStatus,
            String installMode,
            String installSource,
            String installSourceLabel,
            String installSourceDetail,
            String defaultDriverType,
            String defaultDriverName,
            List<DriverOptionResponse> driverOptions,
            String message,
            String packagePath,
            String packageFileName,
            String downloadedAt,
            String executablePath,
            String reusedPackagePath,
            String reusedPackageFileName,
            String reusedDownloadedAt
    ) {
        public static DriverStatusItemResponse from(Object value) {
            Map<String, Object> source = mapValue(value);
            return new DriverStatusItemResponse(
                    text(source.get("type")),
                    text(source.get("name")),
                    text(source.get("engine")),
                    booleanValue(source.get("builtIn")),
                    booleanValue(source.get("managedJarUploadAllowed")),
                    booleanValue(source.get("managedDownload")),
                    booleanValue(source.get("downloadRequired")),
                    text(source.get("reusedDriverType")),
                    text(source.get("reusedDriverName")),
                    text(source.get("pinnedVersion")),
                    text(source.get("installedVersion")),
                    listValue(source.get("installedVersions")).stream().map(DriverInstalledVersionResponse::from).toList(),
                    integerValue(source.get("installedVersionCount")),
                    text(source.get("packageSizeText")),
                    booleanValue(source.get("runtimeAvailable")),
                    booleanValue(source.get("packageInstalled")),
                    booleanValue(source.get("connectable")),
                    text(source.get("defaultDownloadUrl")),
                    text(source.get("installDir")),
                    text(source.get("javaStatus")),
                    text(source.get("installMode")),
                    text(source.get("installSource")),
                    text(source.get("installSourceLabel")),
                    text(source.get("installSourceDetail")),
                    text(source.get("defaultDriverType")),
                    text(source.get("defaultDriverName")),
                    listValue(source.get("driverOptions")).stream().map(DriverOptionResponse::from).toList(),
                    text(source.get("message")),
                    text(source.get("packagePath")),
                    text(source.get("packageFileName")),
                    text(source.get("downloadedAt")),
                    text(source.get("executablePath")),
                    text(source.get("reusedPackagePath")),
                    text(source.get("reusedPackageFileName")),
                    text(source.get("reusedDownloadedAt"))
            );
        }
    }

    public record DriverStatusResponse(
            String downloadDir,
            List<DriverStatusItemResponse> drivers,
            Map<String, String> defaultDrivers,
            String manifestURL,
            String manifestError,
            boolean webManaged
    ) {
        public static DriverStatusResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new DriverStatusResponse(
                    text(source.get("downloadDir")),
                    listValue(source.get("drivers")).stream().map(DriverStatusItemResponse::from).toList(),
                    stringMap(source.get("defaultDrivers")),
                    text(source.get("manifestURL")),
                    text(source.get("manifestError")),
                    booleanValue(source.get("webManaged"))
            );
        }
    }

    public record DriverArtifactResponse(
            String groupId,
            String artifactId,
            String version,
            String fileName,
            String filePath,
            String sha256,
            Long sizeBytes,
            String downloadUrl,
            String sourcePath
    ) {
        public static DriverArtifactResponse from(Object value) {
            Map<String, Object> source = mapValue(value);
            return new DriverArtifactResponse(
                    text(source.get("groupId")),
                    text(source.get("artifactId")),
                    text(source.get("version")),
                    text(source.get("fileName")),
                    text(source.get("filePath")),
                    text(source.get("sha256")),
                    longValue(source.get("sizeBytes")),
                    text(source.get("downloadUrl")),
                    text(source.get("sourcePath"))
            );
        }
    }

    public record CustomDriverDefinitionResponse(
            String driverType,
            String driverName,
            String version,
            String driverClassName,
            String installSource,
            String downloadedAt,
            List<DriverArtifactResponse> artifacts,
            List<String> jarFileNames,
            boolean driverLoadable,
            boolean definitionUsable,
            String validationStatus,
            String message,
            List<String> repairHints,
            String checkedAt,
            String engine,
            boolean packageInstalled,
            boolean runtimeAvailable,
            boolean connectable,
            String installMode
    ) {
        public static CustomDriverDefinitionResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new CustomDriverDefinitionResponse(
                    text(source.get("driverType")),
                    text(source.get("driverName")),
                    text(source.get("version")),
                    text(source.get("driverClassName")),
                    text(source.get("installSource")),
                    text(source.get("downloadedAt")),
                    listValue(source.get("artifacts")).stream().map(DriverArtifactResponse::from).toList(),
                    stringList(source.get("jarFileNames")),
                    booleanValue(source.get("driverLoadable")),
                    booleanValue(source.get("definitionUsable")),
                    text(source.get("validationStatus")),
                    text(source.get("message")),
                    stringList(source.get("repairHints")),
                    text(source.get("checkedAt")),
                    text(source.get("engine")),
                    booleanValue(source.get("packageInstalled")),
                    booleanValue(source.get("runtimeAvailable")),
                    booleanValue(source.get("connectable")),
                    text(source.get("installMode"))
            );
        }

        public static CustomDriverDefinitionResponse from(Object value) {
            return from(mapValue(value));
        }
    }

    public record CustomDriverDefinitionsResponse(
            List<CustomDriverDefinitionResponse> definitions,
            List<CustomDriverDefinitionResponse> customDefinitions,
            int count,
            boolean webManaged
    ) {
        public static CustomDriverDefinitionsResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new CustomDriverDefinitionsResponse(
                    listValue(source.get("definitions")).stream().map(CustomDriverDefinitionResponse::from).toList(),
                    listValue(source.get("customDefinitions")).stream().map(CustomDriverDefinitionResponse::from).toList(),
                    integerValue(source.get("count")) == null ? 0 : integerValue(source.get("count")),
                    booleanValue(source.get("webManaged"))
            );
        }
    }

    public record DriverPackageOperationResponse(
            String driverType,
            String driverName,
            String version,
            String engine,
            boolean packageInstalled,
            boolean runtimeAvailable,
            boolean connectable,
            String installDir,
            String installMode,
            String installSource,
            List<DriverArtifactResponse> artifacts,
            String driverClassName,
            boolean dryRun,
            boolean removed,
            String message
    ) {
        public static DriverPackageOperationResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new DriverPackageOperationResponse(
                    text(source.get("driverType")),
                    text(source.get("driverName")),
                    text(source.get("version")),
                    text(source.get("engine")),
                    booleanValue(source.get("packageInstalled")),
                    booleanValue(source.get("runtimeAvailable")),
                    booleanValue(source.get("connectable")),
                    text(source.get("installDir")),
                    text(source.get("installMode")),
                    text(source.get("installSource")),
                    listValue(source.get("artifacts")).stream().map(DriverArtifactResponse::from).toList(),
                    text(source.get("driverClassName")),
                    booleanValue(source.get("dryRun")),
                    booleanValue(source.get("removed")),
                    text(source.get("message"))
            );
        }
    }

    public record NetworkCheckResponse(
            String name,
            String url,
            boolean reachable,
            String method,
            String error,
            Integer httpStatus,
            Long httpLatencyMs,
            Long latencyMs
    ) {
        public static NetworkCheckResponse from(Object value) {
            Map<String, Object> map = mapValue(value);
            return new NetworkCheckResponse(
                    text(map.get("name")),
                    text(map.get("url")),
                    booleanValue(map.get("reachable")),
                    text(map.get("method")),
                    text(map.get("error")),
                    integerValue(map.get("httpStatus")),
                    longValue(map.get("httpLatencyMs")),
                    longValue(map.get("latencyMs"))
            );
        }
    }

    public record NetworkStatusResponse(
            boolean reachable,
            String summary,
            boolean recommendedProxy,
            boolean proxyConfigured,
            Map<String, Object> proxyEnv,
            boolean downloadChainReachable,
            List<String> downloadRequiredHosts,
            String defaultRepositoryURL,
            String defaultRepositoryUrl,
            String repositoryURL,
            String repositoryUrl,
            String configuredRepositoryURL,
            String configuredRepositoryUrl,
            boolean repositoryConfigured,
            String checkedAt,
            String networkProbeMode,
            String workspaceRoot,
            List<NetworkCheckResponse> checks
    ) {
        public static NetworkStatusResponse from(Map<String, Object> map) {
            Map<String, Object> source = map == null ? Map.of() : map;
            return new NetworkStatusResponse(
                    booleanValue(source.get("reachable")),
                    text(source.get("summary")),
                    booleanValue(source.get("recommendedProxy")),
                    booleanValue(source.get("proxyConfigured")),
                    mapValue(source.get("proxyEnv")),
                    booleanValue(source.get("downloadChainReachable")),
                    stringList(source.get("downloadRequiredHosts")),
                    text(source.get("defaultRepositoryURL")),
                    text(source.get("defaultRepositoryUrl")),
                    text(source.get("repositoryURL")),
                    text(source.get("repositoryUrl")),
                    text(source.get("configuredRepositoryURL")),
                    text(source.get("configuredRepositoryUrl")),
                    booleanValue(source.get("repositoryConfigured")),
                    text(source.get("checkedAt")),
                    text(source.get("networkProbeMode")),
                    text(source.get("workspaceRoot")),
                    listValue(source.get("checks")).stream().map(NetworkCheckResponse::from).toList()
            );
        }
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static boolean booleanValue(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        String text = text(value).toLowerCase(java.util.Locale.ROOT);
        return "true".equals(text) || "1".equals(text) || "yes".equals(text) || "on".equals(text);
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

    private static Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            String text = text(value);
            return text.isBlank() ? null : Long.parseLong(text);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static List<?> listValue(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private static List<String> stringList(Object value) {
        return listValue(value).stream()
                .map(DriverContracts::text)
                .filter(item -> !item.isBlank())
                .toList();
    }

    private static Map<String, String> stringMap(Object value) {
        Map<String, Object> map = mapValue(value);
        if (map.isEmpty()) {
            return Map.of();
        }
        java.util.LinkedHashMap<String, String> result = new java.util.LinkedHashMap<>();
        map.forEach((key, item) -> result.put(key, text(item)));
        return result;
    }

    private static Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> raw)) {
            return Map.of();
        }
        java.util.LinkedHashMap<String, Object> map = new java.util.LinkedHashMap<>();
        raw.forEach((key, item) -> map.put(String.valueOf(key), item));
        return map;
    }
}
