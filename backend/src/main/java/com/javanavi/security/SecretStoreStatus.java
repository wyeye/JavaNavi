package com.javanavi.security;

public record SecretStoreStatus(
        boolean enabled,
        String mode,
        String location,
        boolean encrypted
) {
}
