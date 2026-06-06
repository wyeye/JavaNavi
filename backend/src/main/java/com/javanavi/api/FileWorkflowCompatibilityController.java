package com.javanavi.api;

import com.javanavi.app.ErrorLogService;
import com.javanavi.files.FileWorkflowCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.FileWorkflowContracts;
import com.javanavi.security.SecretRedactor;
import org.springframework.beans.factory.annotation.Autowired;
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

@RestController
@RequestMapping("/api/v1/files")
public class FileWorkflowCompatibilityController {
    private final FileWorkflowCompatibilityService fileWorkflowCompatibilityService;
    private final I18nMessages messages;
    private final ErrorLogService errorLogService;

    public FileWorkflowCompatibilityController(FileWorkflowCompatibilityService fileWorkflowCompatibilityService, I18nMessages messages) {
        this(fileWorkflowCompatibilityService, messages, null);
    }

    @Autowired
    public FileWorkflowCompatibilityController(FileWorkflowCompatibilityService fileWorkflowCompatibilityService, I18nMessages messages, ErrorLogService errorLogService) {
        this.fileWorkflowCompatibilityService = fileWorkflowCompatibilityService;
        this.messages = messages;
        this.errorLogService = errorLogService;
    }

    @PostMapping("/sql/open")
    public ApiEnvelope<FileWorkflowContracts.SqlFileOpenResponse> openSqlFile() {
        return ApiEnvelope.ok(FileWorkflowContracts.SqlFileOpenResponse.from(fileWorkflowCompatibilityService.openSqlFile()));
    }

    @PostMapping("/ssh-key/select")
    public ApiEnvelope<FileWorkflowContracts.ImportSelectionResponse> selectSshKeyFile(@RequestBody(required = false) FileWorkflowContracts.SshKeySelectRequest input) {
        return ApiEnvelope.ok(FileWorkflowContracts.ImportSelectionResponse.from(fileWorkflowCompatibilityService.selectSshKeyFile(input == null ? "" : input.value())));
    }

    @PostMapping(value = "/import/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiEnvelope<FileWorkflowContracts.ImportSelectionResponse> uploadImportFile(
            @RequestParam(value = "table", required = false) String table,
            @RequestParam(value = "tableName", required = false) String tableName,
            @RequestParam(value = "file", required = false) MultipartFile file
    ) {
        return ApiEnvelope.ok(FileWorkflowContracts.ImportSelectionResponse.from(fileWorkflowCompatibilityService.uploadImportFile(firstText(table, tableName), file)));
    }

    @PostMapping("/import/preview")
    public ApiEnvelope<FileWorkflowContracts.ImportPreviewResponse> previewImportFile(@RequestBody(required = false) FileWorkflowContracts.ImportPreviewRequest input) {
        return ApiEnvelope.ok(FileWorkflowContracts.ImportPreviewResponse.from(fileWorkflowCompatibilityService.previewImportFile(input == null ? "" : input.value())));
    }

    @PostMapping("/import/run")
    public ApiEnvelope<FileWorkflowContracts.ImportRunResponse> importDataWithProgress(@RequestBody(required = false) FileWorkflowContracts.ImportRunRequest input) {
        return ApiEnvelope.ok(FileWorkflowContracts.ImportRunResponse.from(fileWorkflowCompatibilityService.importDataWithProgress(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload())));
    }

    @PostMapping("/export/data")
    public ApiEnvelope<FileWorkflowContracts.ExportResultResponse> exportData(@RequestBody(required = false) FileWorkflowContracts.ExportDataRequest input) {
        return ApiEnvelope.ok(FileWorkflowContracts.ExportResultResponse.from(fileWorkflowCompatibilityService.exportData(
                input == null || input.rows() == null ? List.of() : input.rows(),
                input == null || input.columns() == null ? List.of() : input.columns(),
                input == null ? "" : input.defaultName(),
                input == null ? "" : input.format(),
                input == null ? "" : input.targetPath()
        )));
    }

    @PostMapping("/export/query")
    public ApiEnvelope<FileWorkflowContracts.ExportResultResponse> exportQuery(@RequestBody(required = false) FileWorkflowContracts.ExportQueryRequest input) {
        return ApiEnvelope.ok(FileWorkflowContracts.ExportResultResponse.from(fileWorkflowCompatibilityService.exportQuery(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload())));
    }

    @PostMapping("/export/table")
    public ApiEnvelope<FileWorkflowContracts.ExportResultResponse> exportTable(@RequestBody(required = false) FileWorkflowContracts.ExportTableRequest input) {
        return ApiEnvelope.ok(FileWorkflowContracts.ExportResultResponse.from(fileWorkflowCompatibilityService.exportTable(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload())));
    }

    @PostMapping("/export/tables-sql")
    public ApiEnvelope<FileWorkflowContracts.ExportResultResponse> exportTablesSql(@RequestBody(required = false) FileWorkflowContracts.ExportTablesSqlRequest input) {
        boolean includeData = input != null && Boolean.TRUE.equals(input.includeData());
        return ApiEnvelope.ok(FileWorkflowContracts.ExportResultResponse.from(fileWorkflowCompatibilityService.exportTablesSql(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload(), true, includeData)));
    }

    @PostMapping("/export/tables-data-sql")
    public ApiEnvelope<FileWorkflowContracts.ExportResultResponse> exportTablesDataSql(@RequestBody(required = false) FileWorkflowContracts.ExportTablesSqlRequest input) {
        return ApiEnvelope.ok(FileWorkflowContracts.ExportResultResponse.from(fileWorkflowCompatibilityService.exportTablesSql(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload(), false, true)));
    }

    @PostMapping("/export/database-sql")
    public ApiEnvelope<FileWorkflowContracts.ExportResultResponse> exportDatabaseSql(@RequestBody(required = false) FileWorkflowContracts.ExportTablesSqlRequest input) {
        return ApiEnvelope.ok(FileWorkflowContracts.ExportResultResponse.from(fileWorkflowCompatibilityService.exportDatabaseSql(input == null ? new FileWorkflowContracts.RequestPayload() : input.toPayload())));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> badRequest(IllegalArgumentException error) {
        return fail(error, "files.invalidRequest");
    }

    @ExceptionHandler(IllegalStateException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiEnvelope<Void> illegalState(IllegalStateException error) {
        return fail(error, "files.state");
    }

    private ApiEnvelope<Void> fail(Throwable error, String code) {
        String message = messages.message(code, "message", SecretRedactor.redact(error == null ? "" : String.valueOf(error.getMessage())));
        if (errorLogService == null) {
            return ApiEnvelope.fail(code, message);
        }
        String errorId = errorLogService.record(error, code, message);
        return ApiEnvelope.fail(code, message, errorId);
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
