package com.javanavi.api;

import com.javanavi.app.SqlLogService;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.SqlLogDto;
import com.javanavi.model.SqlLogsRequestDto;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/sql-logs")
public class SqlLogController {
    private final SqlLogService sqlLogService;

    public SqlLogController(SqlLogService sqlLogService) {
        this.sqlLogService = sqlLogService;
    }

    @PostMapping("/list")
    public ApiEnvelope<List<SqlLogDto>> list() {
        return ApiEnvelope.ok(sqlLogService.list());
    }

    @PostMapping("/save")
    public ApiEnvelope<List<SqlLogDto>> save(@RequestBody(required = false) SqlLogsRequestDto input) {
        return ApiEnvelope.ok(sqlLogService.save(input));
    }

    @PostMapping("/save-one")
    public ApiEnvelope<List<SqlLogDto>> saveOne(@RequestBody(required = false) SqlLogDto input) {
        return ApiEnvelope.ok(sqlLogService.saveOne(input));
    }

    @PostMapping("/clear")
    public ApiEnvelope<List<SqlLogDto>> clear() {
        return ApiEnvelope.ok(sqlLogService.clear());
    }
}
