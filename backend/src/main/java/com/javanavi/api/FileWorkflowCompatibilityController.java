package com.javanavi.api;

import com.javanavi.files.FileWorkflowCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.FileWorkflowContracts;
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

    @PostMapping("/ssh-key/select")
    public ApiEnvelope<Map<String, Object>> selectSshKeyFile(@RequestBody(required = false) FileWorkflowContracts.SshKeySelectRequest input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.selectSshKeyFile(input == null ? "" : input.value()));
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
    public ApiEnvelope<Map<String, Object>> previewImportFile(@RequestBody(required = false) FileWorkflowContracts.ImportPreviewRequest input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.previewImportFile(input == null ? "" : input.value()));
    }

    @PostMapping("/import/run")
    public ApiEnvelope<Map<String, Object>> importDataWithProgress(@RequestBody(required = false) FileWorkflowContracts.ImportRunRequest input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.importDataWithProgress(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload()));
    }

    @PostMapping("/export/data")
    public ApiEnvelope<Map<String, Object>> exportData(@RequestBody(required = false) FileWorkflowContracts.ExportDataRequest input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportData(
                input == null || input.rows() == null ? List.of() : input.rows(),
                input == null || input.columns() == null ? List.of() : input.columns(),
                input == null ? "" : input.defaultName(),
                input == null ? "" : input.format()
        ));
    }

    @PostMapping("/export/query")
    public ApiEnvelope<Map<String, Object>> exportQuery(@RequestBody(required = false) FileWorkflowContracts.ExportQueryRequest input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportQuery(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload()));
    }

    @PostMapping("/export/table")
    public ApiEnvelope<Map<String, Object>> exportTable(@RequestBody(required = false) FileWorkflowContracts.ExportTableRequest input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportTable(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload()));
    }

    @PostMapping("/export/tables-sql")
    public ApiEnvelope<Map<String, Object>> exportTablesSql(@RequestBody(required = false) FileWorkflowContracts.ExportTablesSqlRequest input) {
        boolean includeData = input != null && Boolean.TRUE.equals(input.includeData());
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportTablesSql(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload(), true, includeData));
    }

    @PostMapping("/export/tables-data-sql")
    public ApiEnvelope<Map<String, Object>> exportTablesDataSql(@RequestBody(required = false) FileWorkflowContracts.ExportTablesSqlRequest input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportTablesSql(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload(), false, true));
    }

    @PostMapping("/export/database-sql")
    public ApiEnvelope<Map<String, Object>> exportDatabaseSql(@RequestBody(required = false) FileWorkflowContracts.ExportTablesSqlRequest input) {
        return ApiEnvelope.ok(fileWorkflowCompatibilityService.exportDatabaseSql(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload()));
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
}
