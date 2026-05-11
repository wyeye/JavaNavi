package com.javanavi.api;

import com.javanavi.app.AppCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.GlobalProxyConfigDto;
import com.javanavi.model.SavedConnectionViewDto;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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

    @GetMapping("/global-proxy")
    public ApiEnvelope<Map<String, Object>> getGlobalProxy() {
        return ApiEnvelope.ok(appCompatibilityService.getGlobalProxy());
    }

    @GetMapping("/language")
    public ApiEnvelope<Map<String, Object>> getLanguage() {
        return ApiEnvelope.ok(appCompatibilityService.getLanguage());
    }

    @PostMapping("/global-proxy")
    public ApiEnvelope<Map<String, Object>> saveGlobalProxy(@RequestBody GlobalProxyConfigDto input) {
        return ApiEnvelope.ok(appCompatibilityService.saveGlobalProxy(input));
    }

    @PostMapping("/language")
    public ApiEnvelope<Map<String, Object>> saveLanguage(@RequestBody Map<String, Object> input) {
        String rawLanguage = input == null || input.get("language") == null ? "" : String.valueOf(input.get("language"));
        return ApiEnvelope.ok(appCompatibilityService.saveLanguage(rawLanguage));
    }

    @PostMapping("/diagnostics/window")
    public ApiEnvelope<Map<String, Object>> logWindowDiagnostic(@RequestBody Map<String, Object> input) {
        String stage = input == null || input.get("stage") == null ? "" : String.valueOf(input.get("stage"));
        String payload = input == null || input.get("payload") == null ? "" : String.valueOf(input.get("payload"));
        appCompatibilityService.logWindowDiagnostic(stage, payload);
        return ApiEnvelope.ok(Map.of("logged", true));
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

    @PostMapping("/sql-workspace/resolve")
    public ApiEnvelope<Map<String, Object>> resolveSqlWorkspace(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(appCompatibilityService.resolveDatabaseSqlWorkspace(
                stringValue(input, "connectionId"),
                stringValue(input, "dbName", "database")
        ));
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

    @PostMapping(value = "/sql-file/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiEnvelope<Map<String, Object>> uploadSqlFile(
            @RequestParam(value = "directoryPath", required = false) String directoryPath,
            @RequestParam(value = "path", required = false) String path,
            @RequestParam(value = "file", required = false) MultipartFile file
    ) {
        return ApiEnvelope.ok(appCompatibilityService.uploadSqlFile(firstText(directoryPath, path), file));
    }

    @PostMapping("/sql-directory/create")
    public ApiEnvelope<Map<String, Object>> createSqlDirectory(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(appCompatibilityService.createSqlDirectory(
                stringValue(input, "parentPath", "path", "directoryPath"),
                stringValue(input, "name", "directoryName")
        ));
    }

    @PostMapping("/sql-path/rename")
    public ApiEnvelope<Map<String, Object>> renameSqlPath(@RequestBody Map<String, Object> input) {
        return ApiEnvelope.ok(appCompatibilityService.renameSqlPath(
                stringValue(input, "path", "filePath"),
                stringValue(input, "newName", "name")
        ));
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

    private static String firstText(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }
}
