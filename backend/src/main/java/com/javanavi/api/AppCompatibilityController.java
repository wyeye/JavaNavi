package com.javanavi.api;

import com.javanavi.app.AppCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.AppCompatInvokeRequestDto;
import com.javanavi.model.GlobalProxyConfigDto;
import com.javanavi.model.SavedConnectionViewDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/app")
public class AppCompatibilityController {
    private final AppCompatibilityService appCompatibilityService;
    private final I18nMessages messages;

    public AppCompatibilityController(AppCompatibilityService appCompatibilityService, I18nMessages messages) {
        this.appCompatibilityService = appCompatibilityService;
        this.messages = messages;
    }

    @GetMapping("/info")
    public ApiEnvelope<Map<String, Object>> appInfo() {
        return ApiEnvelope.ok(appCompatibilityService.appInfo());
    }

    @GetMapping("/data-root")
    public ApiEnvelope<Map<String, Object>> dataRootInfo() {
        return ApiEnvelope.ok(appCompatibilityService.dataRootInfo());
    }

    @PostMapping("/data-root/select")
    public ApiEnvelope<Map<String, Object>> selectDataRoot() {
        return ApiEnvelope.failKey(messages, "app.browserNativeUnavailable");
    }

    @PostMapping("/data-root/apply")
    public ApiEnvelope<Map<String, Object>> applyDataRoot() {
        return ApiEnvelope.failKey(messages, "app.restartRequiredUnsupported");
    }

    @PostMapping("/data-root/open")
    public ApiEnvelope<Map<String, Object>> openDataRoot() {
        return ApiEnvelope.ok(appCompatibilityService.dataRootInfo());
    }

    @GetMapping("/global-proxy")
    public ApiEnvelope<Map<String, Object>> getGlobalProxy() {
        return ApiEnvelope.ok(appCompatibilityService.getGlobalProxy());
    }

    @PostMapping("/global-proxy")
    public ApiEnvelope<Map<String, Object>> saveGlobalProxy(@RequestBody GlobalProxyConfigDto input) {
        return ApiEnvelope.ok(appCompatibilityService.saveGlobalProxy(input));
    }

    @GetMapping("/security-update/status")
    public ApiEnvelope<Map<String, Object>> securityUpdateStatus() {
        return ApiEnvelope.ok(appCompatibilityService.securityUpdateStatus("completed"));
    }

    @PostMapping("/security-update/start")
    public ApiEnvelope<Map<String, Object>> startSecurityUpdate() {
        return ApiEnvelope.ok(appCompatibilityService.securityUpdateStatus("completed"));
    }

    @PostMapping("/security-update/retry")
    public ApiEnvelope<Map<String, Object>> retrySecurityUpdate() {
        return ApiEnvelope.ok(appCompatibilityService.securityUpdateStatus("completed"));
    }

    @PostMapping("/security-update/restart")
    public ApiEnvelope<Map<String, Object>> restartSecurityUpdate() {
        return ApiEnvelope.ok(appCompatibilityService.securityUpdateStatus("completed"));
    }

    @PostMapping("/security-update/dismiss")
    public ApiEnvelope<Map<String, Object>> dismissSecurityUpdate() {
        return ApiEnvelope.ok(appCompatibilityService.securityUpdateStatus("postponed"));
    }

    @PostMapping("/diagnostics/window")
    public ApiEnvelope<Map<String, Object>> logWindowDiagnostic(@RequestBody Map<String, Object> input) {
        String stage = input == null || input.get("stage") == null ? "" : String.valueOf(input.get("stage"));
        String payload = input == null || input.get("payload") == null ? "" : String.valueOf(input.get("payload"));
        appCompatibilityService.logWindowDiagnostic(stage, payload);
        return ApiEnvelope.ok(Map.of("logged", true));
    }

    @GetMapping("/updates/check")
    public ApiEnvelope<Map<String, Object>> checkUpdates() {
        return ApiEnvelope.ok(appCompatibilityService.updateStatus());
    }

    @PostMapping("/updates/download")
    public ApiEnvelope<Map<String, Object>> downloadUpdate() {
        return ApiEnvelope.failKey(messages, "app.updateUnavailable");
    }

    @PostMapping("/updates/open-downloaded")
    public ApiEnvelope<Map<String, Object>> openDownloadedUpdateDirectory() {
        return ApiEnvelope.failKey(messages, "app.browserNativeUnavailable");
    }

    @PostMapping("/updates/install")
    public ApiEnvelope<Map<String, Object>> installUpdateAndRestart() {
        return ApiEnvelope.failKey(messages, "app.updateUnavailable");
    }

    @PostMapping("/sql-directory/select")
    public ApiEnvelope<Map<String, Object>> selectSqlDirectory(@RequestBody Map<String, Object> input) {
        String currentPath = stringValue(input, "path", "currentPath", "directory");
        return ApiEnvelope.ok(appCompatibilityService.selectSqlDirectory(currentPath));
    }

    @PostMapping("/sql-directory/list")
    public ApiEnvelope<Object> listSqlDirectory(@RequestBody Map<String, Object> input) {
        String directory = stringValue(input, "path", "directory");
        return ApiEnvelope.ok(appCompatibilityService.listSqlDirectory(directory));
    }

    @PostMapping("/sql-file/read")
    public ApiEnvelope<Object> readSqlFile(@RequestBody Map<String, Object> input) {
        String filePath = stringValue(input, "path", "filePath");
        return ApiEnvelope.ok(appCompatibilityService.readSqlFile(filePath));
    }

    @PostMapping("/sql-file/write")
    public ApiEnvelope<Map<String, Object>> writeSqlFile(@RequestBody Map<String, Object> input) {
        String filePath = stringValue(input, "path", "filePath");
        String content = stringValue(input, "content", "sql");
        return ApiEnvelope.ok(appCompatibilityService.writeSqlFile(filePath, content));
    }

    @PostMapping("/connections/export-package")
    public ApiEnvelope<Map<String, Object>> exportConnectionsPackage(@RequestBody Map<String, Object> input) {
        Boolean includeSecrets = input == null ? false : Boolean.TRUE.equals(input.get("includeSecrets"));
        String filePassword = input == null || input.get("filePassword") == null ? "" : String.valueOf(input.get("filePassword"));
        return ApiEnvelope.ok(appCompatibilityService.exportConnectionsPackage(includeSecrets, filePassword));
    }

    @PostMapping("/connections/import-payload")
    public ApiEnvelope<List<SavedConnectionViewDto>> importConnectionsPayload(@RequestBody Map<String, Object> input) {
        String raw = stringValue(input, "raw", "payload", "content");
        String password = stringValue(input, "password", "filePassword");
        return ApiEnvelope.ok(appCompatibilityService.importConnectionsPayload(raw, password));
    }

    @PostMapping("/unsupported")
    public ApiEnvelope<Map<String, Object>> unsupported(@RequestBody AppCompatInvokeRequestDto request) {
        String method = request == null ? null : request.method();
        return ApiEnvelope.failKey(messages, "compat.unsupported", "method", method == null ? "" : method);
    }

    private static String stringValue(Map<String, Object> input, String... keys) {
        if (input == null) {
            return "";
        }
        for (String key : keys) {
            Object value = input.get(key);
            if (value != null) {
                return String.valueOf(value);
            }
        }
        return "";
    }
}
