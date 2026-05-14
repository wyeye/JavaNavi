package com.javanavi.api;

import com.javanavi.connections.SavedConnectionService;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.ConnectionTagDto;
import com.javanavi.model.SavedConnectionDeleteResultDto;
import com.javanavi.model.SavedConnectionIdRequestDto;
import com.javanavi.model.SavedConnectionInputDto;
import com.javanavi.model.SavedConnectionTagsRequestDto;
import com.javanavi.model.SavedConnectionViewDto;
import com.javanavi.model.SavedConnectionsImportRequestDto;
import com.javanavi.model.SavedQueriesRequestDto;
import com.javanavi.model.SavedQueryDto;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/connections/saved")
public class SavedConnectionController {
    private final SavedConnectionService savedConnectionService;

    public SavedConnectionController(SavedConnectionService savedConnectionService) {
        this.savedConnectionService = savedConnectionService;
    }

    @PostMapping("/list")
    public ApiEnvelope<List<SavedConnectionViewDto>> list() {
        return ApiEnvelope.ok(savedConnectionService.list());
    }

    @PostMapping("/tags/list")
    public ApiEnvelope<List<ConnectionTagDto>> listTags() {
        return ApiEnvelope.ok(savedConnectionService.listTags());
    }

    @PostMapping("/tags/save")
    public ApiEnvelope<List<ConnectionTagDto>> saveTags(@RequestBody(required = false) SavedConnectionTagsRequestDto input) {
        return ApiEnvelope.ok(savedConnectionService.saveTags(input));
    }

    @PostMapping("/queries/list")
    public ApiEnvelope<List<SavedQueryDto>> listSavedQueries() {
        return ApiEnvelope.ok(savedConnectionService.listSavedQueries());
    }

    @PostMapping("/queries/save")
    public ApiEnvelope<List<SavedQueryDto>> saveSavedQueries(@RequestBody(required = false) SavedQueriesRequestDto input) {
        return ApiEnvelope.ok(savedConnectionService.saveSavedQueries(input));
    }

    @PostMapping("/queries/save-one")
    public ApiEnvelope<List<SavedQueryDto>> saveSavedQuery(@RequestBody(required = false) SavedQueryDto input) {
        return ApiEnvelope.ok(savedConnectionService.saveSavedQuery(input));
    }

    @PostMapping("/queries/delete")
    public ApiEnvelope<List<SavedQueryDto>> deleteSavedQuery(@RequestBody SavedConnectionIdRequestDto request) {
        return ApiEnvelope.ok(savedConnectionService.deleteSavedQuery(request == null ? null : request.resolvedId()));
    }

    @PostMapping("/save")
    public ApiEnvelope<SavedConnectionViewDto> save(@RequestBody SavedConnectionInputDto input) {
        return ApiEnvelope.ok(savedConnectionService.save(input));
    }

    @PostMapping("/delete")
    public ApiEnvelope<SavedConnectionDeleteResultDto> delete(@RequestBody SavedConnectionIdRequestDto request) {
        String id = request == null ? null : request.resolvedId();
        boolean deleted = savedConnectionService.delete(id);
        return ApiEnvelope.ok(new SavedConnectionDeleteResultDto(id, deleted));
    }

    @PostMapping("/duplicate")
    public ApiEnvelope<SavedConnectionViewDto> duplicate(@RequestBody SavedConnectionIdRequestDto request) {
        return ApiEnvelope.ok(savedConnectionService.duplicate(request == null ? null : request.resolvedId()));
    }

    @PostMapping("/import")
    public ApiEnvelope<List<SavedConnectionViewDto>> importConnections(@RequestBody SavedConnectionsImportRequestDto request) {
        List<SavedConnectionInputDto> inputs = request == null || request.connections() == null ? List.of() : request.connections();
        return ApiEnvelope.ok(inputs.stream().map(savedConnectionService::save).toList());
    }

}
