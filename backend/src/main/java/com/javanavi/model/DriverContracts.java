package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonAlias;

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

    private static Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> raw)) {
            return Map.of();
        }
        java.util.LinkedHashMap<String, Object> map = new java.util.LinkedHashMap<>();
        raw.forEach((key, item) -> map.put(String.valueOf(key), item));
        return map;
    }
}
