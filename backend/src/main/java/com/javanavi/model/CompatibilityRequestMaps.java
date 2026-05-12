package com.javanavi.model;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class CompatibilityRequestMaps {
    private CompatibilityRequestMaps() {
    }

    static Map<String, Object> connectionConfig(ConnectionConfigDto config) {
        if (config == null) {
            return Map.of();
        }
        Map<String, Object> map = new LinkedHashMap<>();
        putIfNotNull(map, "id", config.id());
        putIfNotNull(map, "name", config.name());
        putIfNotNull(map, "driverType", config.driverType());
        putIfNotNull(map, "driver", config.driver());
        putIfNotNull(map, "host", config.host());
        putIfNotNull(map, "port", config.port());
        putIfNotNull(map, "database", config.database());
        putIfNotNull(map, "username", config.username());
        putIfNotNull(map, "password", config.password());
        putIfNotNull(map, "options", config.options());
        putIfNotNull(map, "timeout", config.timeout());
        putIfNotNull(map, "useSSL", config.useSSL());
        putIfNotNull(map, "sslMode", config.sslMode());
        putIfNotNull(map, "sslCertPath", config.sslCertPath());
        putIfNotNull(map, "sslKeyPath", config.sslKeyPath());
        putIfNotNull(map, "ssh", config.ssh());
        putIfNotNull(map, "sshConfig", config.sshConfig());
        putIfNotNull(map, "proxy", config.proxy());
        putIfNotNull(map, "httpTunnel", config.httpTunnel());
        putIfNotNull(map, "globalProxy", config.globalProxy());
        putIfNotNull(map, "uri", config.uri());
        putIfNotNull(map, "dsn", config.dsn());
        putIfNotNull(map, "hosts", config.hosts());
        putIfNotNull(map, "topology", config.topology());
        putIfNotNull(map, "replicaSet", config.replicaSet());
        putIfNotNull(map, "authSource", config.authSource());
        putIfNotNull(map, "readPreference", config.readPreference());
        putIfNotNull(map, "mongoSrv", config.mongoSrv());
        putIfNotNull(map, "mongoAuthMechanism", config.mongoAuthMechanism());
        putIfNotNull(map, "mongoReplicaUser", config.mongoReplicaUser());
        putIfNotNull(map, "mongoReplicaPassword", config.mongoReplicaPassword());
        putIfNotNull(map, "useSSH", config.useSSH());
        putIfNotNull(map, "useProxy", config.useProxy());
        putIfNotNull(map, "useHttpTunnel", config.useHttpTunnel());
        return map;
    }

    static List<String> stringList(List<String> values) {
        return values == null ? List.of() : values;
    }

    static void putIfNotNull(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }
}
