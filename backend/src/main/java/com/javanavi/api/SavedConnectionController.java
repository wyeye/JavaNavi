package com.javanavi.api;

import com.javanavi.connections.SavedConnectionService;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.SavedConnectionDeleteResultDto;
import com.javanavi.model.SavedConnectionIdRequestDto;
import com.javanavi.model.SavedConnectionInputDto;
import com.javanavi.model.SavedConnectionViewDto;
import com.javanavi.model.SavedConnectionsImportRequestDto;
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
