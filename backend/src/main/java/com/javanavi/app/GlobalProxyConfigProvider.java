package com.javanavi.app;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.model.ConnectionConfigDto;
import com.javanavi.security.SecretStore;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

@Component
public class GlobalProxyConfigProvider {
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final ObjectMapper objectMapper;
    private final SecretStore secretStore;
    private final Path globalProxyFile;

    public GlobalProxyConfigProvider(SecurityProperties securityProperties, ObjectMapper objectMapper, SecretStore secretStore) {
        this.objectMapper = objectMapper;
        this.secretStore = secretStore;
        this.globalProxyFile = Path.of(securityProperties.getDataDirectory()).toAbsolutePath().normalize().resolve("global-proxy.json");
    }

    public Optional<ConnectionConfigDto.NetworkProxyConfigDto> activeProxy() {
        Map<String, Object> stored = readMap();
        if (!Boolean.TRUE.equals(stored.get("enabled"))) {
            return Optional.empty();
        }
        String host = text(stored.get("host"));
        if (host.isBlank()) {
            return Optional.empty();
        }
        String type = "http".equalsIgnoreCase(text(stored.get("type"))) ? "http" : "socks5";
        Integer port = port(stored.get("port"), "http".equals(type) ? 8080 : 1080);
        return Optional.of(new ConnectionConfigDto.NetworkProxyConfigDto(
                type,
                host,
                port,
                text(stored.get("user")),
                secretStore.get(AppCompatibilityService.GLOBAL_PROXY_SECRET_KEY).orElse("")
        ));
    }

    private Map<String, Object> readMap() {
        if (!Files.isRegularFile(globalProxyFile)) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(globalProxyFile.toFile(), MAP_TYPE);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to read JavaNavi global proxy settings.", error);
        }
    }

    private static Integer port(Object value, int fallback) {
        int parsed;
        if (value instanceof Number number) {
            parsed = number.intValue();
        } else {
            try {
                parsed = Integer.parseInt(text(value));
            } catch (NumberFormatException error) {
                return fallback;
            }
        }
        return parsed < 1 || parsed > 65535 ? fallback : parsed;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
