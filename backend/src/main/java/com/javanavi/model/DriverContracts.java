package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonAlias;

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

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }
}
