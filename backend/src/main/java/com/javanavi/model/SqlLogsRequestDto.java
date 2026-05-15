package com.javanavi.model;

import java.util.List;

public record SqlLogsRequestDto(
        List<SqlLogDto> logs
) {
}
