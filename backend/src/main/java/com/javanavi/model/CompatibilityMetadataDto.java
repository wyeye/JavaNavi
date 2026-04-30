package com.javanavi.model;

import java.util.List;

public record CompatibilityMetadataDto(
        String appName,
        String backend,
        String contractVersion,
        List<CapabilityDto> capabilities
) {
}
