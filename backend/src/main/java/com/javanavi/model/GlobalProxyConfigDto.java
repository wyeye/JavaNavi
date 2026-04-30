package com.javanavi.model;

public record GlobalProxyConfigDto(
        Boolean enabled,
        String type,
        String host,
        Integer port,
        String user,
        String password,
        Boolean clearPassword
) {
}
