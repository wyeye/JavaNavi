package com.javanavi.api;

import com.javanavi.driver.DriverCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.security.SecretRedactor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/drivers")
public class DriverCompatibilityController {
    private final DriverCompatibilityService driverCompatibilityService;
    private final I18nMessages messages;

    public DriverCompatibilityController(DriverCompatibilityService driverCompatibilityService, I18nMessages messages) {
        this.driverCompatibilityService = driverCompatibilityService;
        this.messages = messages;
    }

    @GetMapping("/network-status")
    public ApiEnvelope<Map<String, Object>> networkStatus() {
        return ApiEnvelope.ok(driverCompatibilityService.networkStatus());
    }

    @PostMapping("/runtime-directory")
    public ApiEnvelope<Map<String, Object>> configureRuntimeDirectory(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.configureRuntimeDirectory(stringValue(input, "path", "directory")));
    }

    @PostMapping("/download-directory/open")
    public ApiEnvelope<Map<String, Object>> openDownloadDirectory(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.openDownloadDirectory(stringValue(input, "path", "directory")));
    }

    @PostMapping("/download-directory/select")
    public ApiEnvelope<Map<String, Object>> selectDownloadDirectory(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.selectDownloadDirectory(stringValue(input, "path", "directory", "currentPath")));
    }

    @PostMapping("/download-directory/resolve")
    public ApiEnvelope<Map<String, Object>> resolveDownloadDirectory(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.resolveDownloadDirectory(stringValue(input, "path", "directory")));
    }

    @PostMapping("/package-directory/select")
    public ApiEnvelope<Map<String, Object>> selectPackageDirectory(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.selectPackageDirectory(stringValue(input, "path", "directory", "currentPath")));
    }

    @PostMapping("/package-file/select")
    public ApiEnvelope<Map<String, Object>> selectPackageFile(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.selectPackageFile(stringValue(input, "path", "directory", "currentPath")));
    }

    @PostMapping("/repository/resolve")
    public ApiEnvelope<Map<String, Object>> resolveRepositoryURL(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.resolveRepositoryURL(stringValue(input, "url", "repositoryURL", "repositoryUrl")));
    }

    @PostMapping("/repository/configure")
    public ApiEnvelope<Map<String, Object>> configureRepositoryURL(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.configureRepositoryURL(stringValue(input, "url", "repositoryURL", "repositoryUrl")));
    }

    @PostMapping("/package-url/resolve")
    public ApiEnvelope<Map<String, Object>> resolvePackageDownloadURL(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.resolvePackageDownloadURL(
                stringValue(input, "driverType"),
                stringValue(input, "url", "repositoryURL", "repositoryUrl")
        ));
    }

    @PostMapping("/versions")
    public ApiEnvelope<Map<String, Object>> versions(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.versionList(
                stringValue(input, "driverType"),
                stringValue(input, "url", "repositoryURL", "repositoryUrl")
        ));
    }

    @PostMapping("/package-size")
    public ApiEnvelope<Map<String, Object>> packageSize(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.packageSize(
                stringValue(input, "driverType"),
                stringValue(input, "version")
        ));
    }

    @PostMapping("/status")
    public ApiEnvelope<Map<String, Object>> status(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.statusList(
                stringValue(input, "downloadDir", "directory", "path"),
                stringValue(input, "manifestURL", "manifestUrl", "repositoryURL", "repositoryUrl")
        ));
    }

    @PostMapping("/custom-definitions")
    public ApiEnvelope<Map<String, Object>> customDefinitions(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.customDefinitions(
                stringValue(input, "downloadDir", "directory", "path")
        ));
    }

    @PostMapping("/custom-definitions/validate")
    public ApiEnvelope<Map<String, Object>> validateCustomDefinition(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.validateCustomDefinition(
                stringValue(input, "driverType"),
                stringValue(input, "downloadDir", "directory", "path")
        ));
    }

    @PostMapping("/default-driver")
    public ApiEnvelope<Map<String, Object>> configureDefaultDriver(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.configureDefaultDriver(
                stringValue(input, "databaseType", "type"),
                stringValue(input, "driverType", "defaultDriverType", "driver"),
                stringValue(input, "downloadDir", "directory", "path")
        ));
    }

    @PostMapping("/download")
    public ApiEnvelope<Map<String, Object>> download(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.downloadPackage(
                stringValue(input, "driverType"),
                stringValue(input, "version"),
                stringValue(input, "downloadURL", "downloadUrl", "url"),
                stringValue(input, "downloadDir", "directory", "path")
        ));
    }

    @PostMapping("/install-local")
    public ApiEnvelope<Map<String, Object>> installLocal(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.installLocalPackage(
                stringValue(input, "driverType"),
                stringValue(input, "filePath", "packagePath", "path"),
                stringValue(input, "downloadDir", "directory"),
                stringValue(input, "version")
        ));
    }

    @PostMapping(value = "/upload-local", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiEnvelope<Map<String, Object>> uploadLocal(
            @RequestParam("driverType") String driverType,
            @RequestParam(value = "downloadDir", required = false) String downloadDir,
            @RequestParam(value = "version", required = false) String version,
            @RequestParam(value = "files", required = false) MultipartFile[] files,
            @RequestParam(value = "file", required = false) MultipartFile file
    ) {
        List<MultipartFile> uploadFiles = files == null ? List.of() : Arrays.asList(files);
        if (file != null && !file.isEmpty()) {
            uploadFiles = new java.util.ArrayList<>(uploadFiles);
            uploadFiles.add(file);
        }
        return ApiEnvelope.ok(driverCompatibilityService.installUploadedPackage(
                driverType,
                uploadFiles,
                downloadDir,
                version
        ));
    }

    @PostMapping("/remove")
    public ApiEnvelope<Map<String, Object>> remove(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(driverCompatibilityService.removePackage(
                stringValue(input, "driverType"),
                stringValue(input, "downloadDir", "directory", "path")
        ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> badRequest(IllegalArgumentException error) {
        return ApiEnvelope.failKey(messages, "drivers.invalidRequest", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
    }

    @ExceptionHandler(IllegalStateException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiEnvelope<Void> illegalState(IllegalStateException error) {
        return ApiEnvelope.failKey(messages, "drivers.state", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
    }

    private static String stringValue(Map<String, Object> input, String... keys) {
        if (input == null) {
            return "";
        }
        for (String key : keys) {
            Object value = input.get(key);
            if (value != null) {
                return String.valueOf(value).trim();
            }
        }
        return "";
    }
}
