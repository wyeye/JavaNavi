package com.javanavi.model;

import java.util.List;

public record CompatEventStatusDto(
        String bridge,
        int subscriberCount,
        List<String> fixtureFamilies
) {
}
