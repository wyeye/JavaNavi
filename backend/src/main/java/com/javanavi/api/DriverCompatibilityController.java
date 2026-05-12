package com.javanavi.api;

import com.javanavi.driver.DriverCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.DriverContracts;
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
    public ApiEnvelope<DriverContracts.NetworkStatusResponse> networkStatus() {
        return ApiEnvelope.ok(DriverContracts.NetworkStatusResponse.from(driverCompatibilityService.networkStatus()));
    }

    @PostMapping("/runtime-directory")
    public ApiEnvelope<DriverContracts.DriverDirectoryResponse> configureRuntimeDirectory(@RequestBody(required = false) DriverContracts.DirectoryRequest input) {
        return ApiEnvelope.ok(DriverContracts.DriverDirectoryResponse.from(driverCompatibilityService.configureRuntimeDirectory(input == null ? "" : input.value())));
    }

    @PostMapping("/download-directory/open")
    public ApiEnvelope<DriverContracts.DriverDirectoryResponse> openDownloadDirectory(@RequestBody(required = false) DriverContracts.DirectoryRequest input) {
        return ApiEnvelope.ok(DriverContracts.DriverDirectoryResponse.from(driverCompatibilityService.openDownloadDirectory(input == null ? "" : input.value())));
    }

    @PostMapping("/download-directory/resolve")
    public ApiEnvelope<DriverContracts.DriverDirectoryResponse> resolveDownloadDirectory(@RequestBody(required = false) DriverContracts.DirectoryRequest input) {
        return ApiEnvelope.ok(DriverContracts.DriverDirectoryResponse.from(driverCompatibilityService.resolveDownloadDirectory(input == null ? "" : input.value())));
    }

    @PostMapping("/repository/resolve")
    public ApiEnvelope<Map<String, Object>> resolveRepositoryURL(@RequestBody(required = false) DriverContracts.RepositoryRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.resolveRepositoryURL(input == null ? "" : input.value()));
    }

    @PostMapping("/repository/configure")
    public ApiEnvelope<Map<String, Object>> configureRepositoryURL(@RequestBody(required = false) DriverContracts.RepositoryRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.configureRepositoryURL(input == null ? "" : input.value()));
    }

    @PostMapping("/package-url/resolve")
    public ApiEnvelope<Map<String, Object>> resolvePackageDownloadURL(@RequestBody(required = false) DriverContracts.DriverRepositoryRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.resolvePackageDownloadURL(
                input == null ? "" : input.driverType(),
                input == null ? "" : input.url()
        ));
    }

    @PostMapping("/versions")
    public ApiEnvelope<Map<String, Object>> versions(@RequestBody(required = false) DriverContracts.DriverRepositoryRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.versionList(
                input == null ? "" : input.driverType(),
                input == null ? "" : input.url()
        ));
    }

    @PostMapping("/package-size")
    public ApiEnvelope<Map<String, Object>> packageSize(@RequestBody(required = false) DriverContracts.VersionRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.packageSize(
                input == null ? "" : input.driverType(),
                input == null ? "" : input.version()
        ));
    }

    @PostMapping("/status")
    public ApiEnvelope<Map<String, Object>> status(@RequestBody(required = false) DriverContracts.StatusRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.statusList(
                input == null ? "" : input.downloadDir(),
                input == null ? "" : input.manifestURL()
        ));
    }

    @PostMapping("/custom-definitions")
    public ApiEnvelope<Map<String, Object>> customDefinitions(@RequestBody(required = false) DriverContracts.DriverTypeRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.customDefinitions(input == null ? "" : input.downloadDir()));
    }

    @PostMapping("/custom-definitions/validate")
    public ApiEnvelope<Map<String, Object>> validateCustomDefinition(@RequestBody(required = false) DriverContracts.DriverTypeRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.validateCustomDefinition(
                input == null ? "" : input.driverType(),
                input == null ? "" : input.downloadDir()
        ));
    }

    @PostMapping("/default-driver")
    public ApiEnvelope<Map<String, Object>> configureDefaultDriver(@RequestBody(required = false) DriverContracts.DefaultDriverRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.configureDefaultDriver(
                input == null ? "" : input.databaseType(),
                input == null ? "" : input.driverType(),
                input == null ? "" : input.downloadDir()
        ));
    }

    @PostMapping("/download")
    public ApiEnvelope<Map<String, Object>> download(@RequestBody(required = false) DriverContracts.DownloadRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.downloadPackage(
                input == null ? "" : input.driverType(),
                input == null ? "" : input.version(),
                input == null ? "" : input.downloadURL(),
                input == null ? "" : input.downloadDir()
        ));
    }

    @PostMapping("/install-local")
    public ApiEnvelope<Map<String, Object>> installLocal(@RequestBody(required = false) DriverContracts.InstallLocalRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.installLocalPackage(
                input == null ? "" : input.driverType(),
                input == null ? "" : input.filePath(),
                input == null ? "" : input.downloadDir(),
                input == null ? "" : input.version()
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
    public ApiEnvelope<Map<String, Object>> remove(@RequestBody(required = false) DriverContracts.DriverTypeRequest input) {
        return ApiEnvelope.ok(driverCompatibilityService.removePackage(
                input == null ? "" : input.driverType(),
                input == null ? "" : input.downloadDir()
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
}
