package com.javanavi.model;

public record TriggerDefinitionDto(
        String name,
        String timing,
        String event,
        String statement
) {
}
