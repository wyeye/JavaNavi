package com.javanavi.security;

import java.util.Optional;

public interface SecretStore {
    SecretStoreStatus status();

    void put(String key, String secret);

    Optional<String> get(String key);

    void delete(String key);
}
