package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonValue;
import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.List;

public final class AppContracts {
    private AppContracts() {
    }

    public record AppInfoResponse(
            String name,
            String version,
            String backend,
            String packageType,
            String dataDirectory,
            String author,
            String communityName,
            String communityGroupNumber,
            String communityUrl,
            String repoUrl
    ) {
    }

    public record DataRootInfoResponse(
            String path,
            String directory,
            String defaultPath,
            String driverPath,
            String bootstrapPath,
            boolean exists,
            boolean isDefaultPath,
            boolean webManaged
    ) {
    }

    public record LanguageRequest(String language) {
    }

    public record LanguageResponse(String language) {
    }

    public record WindowDiagnosticRequest(String stage, String payload) {
    }

    public record WindowDiagnosticResponse(boolean logged) {
    }

    public record LocalFileSelectRequest(String kind, String currentPath, String path) {
        public String kindValue() {
            return firstText(kind, "file");
        }

        public String currentPathValue() {
            return firstText(currentPath, path);
        }
    }

    public record PathRequest(String path, String currentPath, String directory) {
        public String directoryValue() {
            return firstText(path, currentPath, directory);
        }
    }

    public record SqlWorkspaceRequest(String connectionId, String dbName, String database) {
        public String databaseValue() {
            return firstText(dbName, database);
        }
    }

    public record SqlFileReadRequest(String path, String filePath) {
        public String value() {
            return firstText(path, filePath);
        }
    }

    public record SqlFileWriteRequest(String path, String filePath, String content, String sql) {
        public String pathValue() {
            return firstText(path, filePath);
        }

        public String contentValue() {
            return firstText(content, sql);
        }
    }

    public record SqlDirectoryCreateRequest(String parentPath, String path, String directoryPath, String name, String directoryName) {
        public String parentValue() {
            return firstText(parentPath, path, directoryPath);
        }

        public String nameValue() {
            return firstText(name, directoryName);
        }
    }

    public record SqlPathRenameRequest(String path, String filePath, String newName, String name) {
        public String pathValue() {
            return firstText(path, filePath);
        }

        public String nameValue() {
            return firstText(newName, name);
        }
    }

    public record ConnectionExportPackageRequest(Boolean includeSecrets, String filePassword, @JsonAlias({"exportPath", "path"}) String targetPath) {
        public boolean includeSecretsValue() {
            return Boolean.TRUE.equals(includeSecrets);
        }
    }

    public record ConnectionImportPayloadRequest(String raw, String payload, String content, String password, String filePassword) {
        public String rawValue() {
            return firstText(raw, payload, content);
        }

        public String passwordValue() {
            return firstText(password, filePassword);
        }
    }

    public record SqlWorkspaceResponse(
            String path,
            String name,
            String connectionId,
            String dbName,
            boolean webManaged,
            String workspaceRoot
    ) {
    }

    public record LocalFileSelectionResponse(
            boolean selected,
            String path,
            String name,
            String kind,
            boolean desktopRequired,
            String message
    ) {
    }

    public record LocalFileReadResponse(
            String content,
            boolean isLargeFile,
            String filePath,
            String path,
            String name,
            long fileSize,
            String fileSizeMB,
            boolean webManaged,
            boolean desktopLocal
    ) {
    }

    public record SqlDirectoryEntryResponse(
            String name,
            String path,
            boolean isDir,
            long size,
            boolean webManaged,
            List<SqlDirectoryEntryResponse> children
    ) {
    }

    public sealed interface SqlFileReadResponse permits SqlFileContentResponse, LargeSqlFileResponse {
    }

    public record SqlFileContentResponse(String content) implements SqlFileReadResponse {
        @JsonValue
        public String value() {
            return content;
        }
    }

    public record LargeSqlFileResponse(
            boolean isLargeFile,
            String filePath,
            String path,
            long fileSize,
            String fileSizeMB,
            boolean webManaged
    ) implements SqlFileReadResponse {
    }

    public record SqlFileInfoResponse(
            String path,
            String filePath,
            String name,
            long size,
            boolean webManaged
    ) {
    }

    public record ConnectionExportPackageResponse(
            String path,
            String filePath,
            String filename,
            boolean secretsIncluded,
            boolean javaNaviPackage,
            int schemaVersion,
            int protection,
            boolean revealed,
            boolean revealSelected,
            String revealMethod,
            String revealTargetPath,
            String revealDirectory,
            String revealMessage
    ) {
    }

    private static String firstText(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }
}
