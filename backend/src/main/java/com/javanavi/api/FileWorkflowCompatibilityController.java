package com.javanavi.api;

import com.javanavi.files.FileWorkflowCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.security.SecretRedactor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/files")
public class FileWorkflowCompatibilityController {
    private final FileWorkflowCompatibilityService fileWorkflowCompatibilityService;
    private final I18nMessages messages;

    public FileWorkflowCompatibilityController(FileWorkflowCompatibilityService fileWorkflowCompatibilityService, I18nMessages messages) {
        this.fileWorkflowCompatibilityService = fileWorkflowCompatibilityService;
        this.messages = messages;
    }

    @PostMapping("/sql/open")
    public ApiEnvelope<Object> openSqlFile() {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.openSqlFile());
    }

    @PostMapping("/database-file/select")
    public ApiEnvelope<Map<String, Object>> selectDatabaseFile(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.selectDatabaseFile(
                stringValue(input, "currentPath", "path"),
                stringValue(input, "driverType")
        ));
    }

    @PostMapping("/ssh-key/select")
    public ApiEnvelope<Map<String, Object>> selectSshKeyFile(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.selectSshKeyFile(stringValue(input, "currentPath", "path")));
    }

    @PostMapping("/config/import")
    public ApiEnvelope<Object> importConfigFile() {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.importConfigFile());
    }

    @PostMapping("/import/select")
    public ApiEnvelope<Map<String, Object>> importData(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.importData(input));
    }

    @PostMapping(value = "/import/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiEnvelope<Map<String, Object>> uploadImportFile(
            @RequestParam(value = "table", required = false) String table,
            @RequestParam(value = "tableName", required = false) String tableName,
            @RequestParam(value = "file", required = false) MultipartFile file
    ) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.uploadImportFile(firstText(table, tableName), file));
    }

    @PostMapping("/import/preview")
    public ApiEnvelope<Map<String, Object>> previewImportFile(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.previewImportFile(stringValue(input, "filePath", "path")));
    }

    @PostMapping("/import/run")
    public ApiEnvelope<Map<String, Object>> importDataWithProgress(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.importDataWithProgress(input));
    }

    @SuppressWarnings("unchecked")
    @PostMapping("/export/data")
    public ApiEnvelope<Map<String, Object>> exportData(@RequestBody(required = false) Map<String, Object> input) {
        Object rows = input == null ? null : input.get("rows");
        Object columns = input == null ? null : input.get("columns");
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportData(
                rows instanceof List<?> list ? (List<Map<String, Object>>) (List<?>) list : List.of(),
                columns instanceof List<?> list ? list.stream().map(String::valueOf).toList() : List.of(),
                stringValue(input, "defaultName", "name"),
                stringValue(input, "format")
        ));
    }

    @PostMapping("/export/query")
    public ApiEnvelope<Map<String, Object>> exportQuery(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportQuery(input));
    }

    @PostMapping("/export/table")
    public ApiEnvelope<Map<String, Object>> exportTable(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportTable(input));
    }

    @PostMapping("/export/tables-sql")
    public ApiEnvelope<Map<String, Object>> exportTablesSql(@RequestBody(required = false) Map<String, Object> input) {
        boolean includeData = input != null && Boolean.TRUE.equals(input.get("includeData"));
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportTablesSql(input, true, includeData));
    }

    @PostMapping("/export/tables-data-sql")
    public ApiEnvelope<Map<String, Object>> exportTablesDataSql(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportTablesSql(input, false, true));
    }

    @PostMapping("/export/database-sql")
    public ApiEnvelope<Map<String, Object>> exportDatabaseSql(@RequestBody(required = false) Map<String, Object> input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportDatabaseSql(input));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> badRequest(IllegalArgumentException error) {
        return ApiEnvelope.failKey(messages, "files.invalidRequest", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
    }

    @ExceptionHandler(IllegalStateException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiEnvelope<Void> illegalState(IllegalStateException error) {
        return ApiEnvelope.failKey(messages, "files.state", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
    }

    private static String firstText(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) {
                return value.trim();
            }
        }
        return "";
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
