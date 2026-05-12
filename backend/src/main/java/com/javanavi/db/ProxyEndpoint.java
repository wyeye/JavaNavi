package com.javanavi.db;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Properties;

record ProxyEndpoint(String type, String host, int port, String user, String password) {
    static ProxyEndpoint decode(String encoded) {
        String text = trimToNull(encoded);
        if (text == null) {
            throw new IllegalArgumentException("Proxy endpoint config is required.");
        }
        String decoded = new String(Base64.getUrlDecoder().decode(text), StandardCharsets.UTF_8);
        String[] parts = decoded.split("\n", -1);
        if (parts.length < 3) {
            throw new IllegalArgumentException("Proxy endpoint config is invalid.");
        }
        return fromValues(
                parts[0],
                parts[1],
                parts[2],
                parts.length > 3 ? parts[3] : null,
                parts.length > 4 ? parts[4] : null
        );
    }

    static ProxyEndpoint from(Properties properties) {
        if (properties == null) {
            return null;
        }
        String encoded = firstText(properties.getProperty("socketFactoryArg"), properties.getProperty("socketFactoryConstructorArg"));
        if (encoded != null) {
            return decode(encoded);
        }
        return fromValues(
                properties.getProperty("javanavi.proxy.type"),
                properties.getProperty("javanavi.proxy.host"),
                properties.getProperty("javanavi.proxy.port"),
                properties.getProperty("javanavi.proxy.user"),
                properties.getProperty("javanavi.proxy.password")
        );
    }

    static ProxyEndpoint fromValues(String type, String host, String port, String user, String password) {
        String endpointHost = requireText(host, "Proxy host");
        String endpointType = normalizeType(type);
        int endpointPort = parsePort(port, defaultPort(endpointType));
        return new ProxyEndpoint(endpointType, endpointHost, endpointPort, trimToNull(user), trimToNull(password));
    }

    private static String normalizeType(String value) {
        String type = value == null ? "socks5" : value.toLowerCase().replace("_", "-").trim();
        return switch (type) {
            case "", "socks", "socks5" -> "socks5";
            case "http", "http-connect", "https" -> "http";
            default -> throw new IllegalArgumentException("Proxy type must be socks5 or http.");
        };
    }

    private static int defaultPort(String type) {
        return "http".equals(type) ? 8080 : 1080;
    }

    private static int parsePort(String value, int fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            int port = Integer.parseInt(value.trim());
            if (port < 1 || port > 65535) {
                throw new IllegalArgumentException("Proxy port must be in 1-65535.");
            }
            return port;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException("Proxy port is invalid.", error);
        }
    }

    private static String requireText(String value, String label) {
        String text = trimToNull(value);
        if (text == null) {
            throw new IllegalArgumentException(label + " is required.");
        }
        return text;
    }

    private static String firstText(String... values) {
        for (String value : values) {
            String text = trimToNull(value);
            if (text != null) {
                return text;
            }
        }
        return null;
    }

    private static String trimToNull(String value) {
        return value == null || value.trim().isBlank() ? null : value.trim();
    }
}
