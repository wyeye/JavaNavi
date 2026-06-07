package com.javanavi.api;

import com.javanavi.app.AppCompatibilityService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.AppContracts;
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
    public ApiEnvelope<AppContracts.AppInfoResponse> appInfo() {
        return ApiEnvelope.ok(appCompatibilityService.appInfo());
    }

    @GetMapping("/data-root")
    public ApiEnvelope<AppContracts.DataRootInfoResponse> dataRootInfo() {
        return ApiEnvelope.ok(appCompatibilityService.dataRootInfo());
    }

    @GetMapping("/language")
    public ApiEnvelope<AppContracts.LanguageResponse> getLanguage() {
        return ApiEnvelope.ok(appCompatibilityService.getLanguage());
    }

    @PostMapping("/language")
    public ApiEnvelope<AppContracts.LanguageResponse> saveLanguage(@RequestBody(required = false) AppContracts.LanguageRequest input) {
        String rawLanguage = input == null ? "" : input.language();
        return ApiEnvelope.ok(appCompatibilityService.saveLanguage(rawLanguage));
    }

    @PostMapping("/diagnostics/window")
    public ApiEnvelope<AppContracts.WindowDiagnosticResponse> logWindowDiagnostic(@RequestBody(required = false) AppContracts.WindowDiagnosticRequest input) {
        String stage = input == null ? "" : input.stage();
        String payload = input == null ? "" : input.payload();
        appCompatibilityService.logWindowDiagnostic(stage, payload);
        return ApiEnvelope.ok(new AppContracts.WindowDiagnosticResponse(true));
    }

    @PostMapping("/local-file/select")
    public ApiEnvelope<AppContracts.LocalFileSelectionResponse> selectLocalFile(@RequestBody(required = false) AppContracts.LocalFileSelectRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.selectLocalFile(input));
    }

    @PostMapping("/local-file/read")
    public ApiEnvelope<AppContracts.LocalFileReadResponse> readLocalFile(@RequestBody(required = false) AppContracts.SqlFileReadRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.readLocalFile(input == null ? "" : input.value()));
    }

    @PostMapping("/sql-directory/select")
    public ApiEnvelope<AppContracts.SqlWorkspaceResponse> selectSqlDirectory(@RequestBody(required = false) AppContracts.PathRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.selectSqlDirectory(input == null ? "" : input.directoryValue()));
    }

    @PostMapping("/sql-directory/list")
    public ApiEnvelope<List<AppContracts.SqlDirectoryEntryResponse>> listSqlDirectory(@RequestBody(required = false) AppContracts.PathRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.listSqlDirectory(input == null ? "" : input.directoryValue()));
    }

    @PostMapping("/sql-workspace/resolve")
    public ApiEnvelope<AppContracts.SqlWorkspaceResponse> resolveSqlWorkspace(@RequestBody(required = false) AppContracts.SqlWorkspaceRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.resolveDatabaseSqlWorkspace(
                input == null ? "" : input.connectionId(),
                input == null ? "" : input.databaseValue()
        ));
    }

    @PostMapping("/sql-file/read")
    public ApiEnvelope<AppContracts.SqlFileReadResponse> readSqlFile(@RequestBody(required = false) AppContracts.SqlFileReadRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.readSqlFile(input == null ? "" : input.value()));
    }

    @PostMapping("/sql-file/write")
    public ApiEnvelope<AppContracts.SqlFileInfoResponse> writeSqlFile(@RequestBody(required = false) AppContracts.SqlFileWriteRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.writeSqlFile(
                input == null ? "" : input.pathValue(),
                input == null ? "" : input.contentValue()
        ));
    }

    @PostMapping(value = "/sql-file/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiEnvelope<AppContracts.SqlFileInfoResponse> uploadSqlFile(
            @RequestParam(value = "directoryPath", required = false) String directoryPath,
            @RequestParam(value = "path", required = false) String path,
            @RequestParam(value = "file", required = false) MultipartFile file
    ) {
        return ApiEnvelope.ok(appCompatibilityService.uploadSqlFile(firstText(directoryPath, path), file));
    }

    @PostMapping("/sql-directory/create")
    public ApiEnvelope<AppContracts.SqlDirectoryEntryResponse> createSqlDirectory(@RequestBody(required = false) AppContracts.SqlDirectoryCreateRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.createSqlDirectory(
                input == null ? "" : input.parentValue(),
                input == null ? "" : input.nameValue()
        ));
    }

    @PostMapping("/sql-path/rename")
    public ApiEnvelope<AppContracts.SqlDirectoryEntryResponse> renameSqlPath(@RequestBody(required = false) AppContracts.SqlPathRenameRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.renameSqlPath(
                input == null ? "" : input.pathValue(),
                input == null ? "" : input.nameValue()
        ));
    }

    @PostMapping("/connections/export-package")
    public ApiEnvelope<AppContracts.ConnectionExportPackageResponse> exportConnectionsPackage(@RequestBody(required = false) AppContracts.ConnectionExportPackageRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.exportConnectionsPackage(
                input != null && input.includeSecretsValue(),
                input == null ? "" : input.filePassword(),
                input == null ? "" : input.targetPath()
        ));
    }

    @PostMapping("/connections/import-payload")
    public ApiEnvelope<List<SavedConnectionViewDto>> importConnectionsPayload(@RequestBody(required = false) AppContracts.ConnectionImportPayloadRequest input) {
        return ApiEnvelope.ok(appCompatibilityService.importConnectionsPayload(
                input == null ? "" : input.rawValue(),
                input == null ? "" : input.passwordValue()
        ));
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
