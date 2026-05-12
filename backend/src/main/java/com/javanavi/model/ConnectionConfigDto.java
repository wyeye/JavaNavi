package com.javanavi.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;

public record ConnectionConfigDto(
        String id,
        String name,
        @JsonAlias({"type"}) @NotBlank String driverType,
        String driver,
        String host,
        Integer port,
        String database,
        @JsonAlias({"user"}) String username,
        String password,
        Map<String, String> options,
        Integer timeout,
        @JsonAlias({"useSSL"}) Boolean useSSL,
        String sslMode,
        String uri,
        String dsn,
        List<String> hosts,
        String topology,
        String replicaSet,
        String authSource,
        String readPreference,
        @JsonAlias({"mongoSRV"}) Boolean mongoSrv,
        String mongoAuthMechanism,
        String mongoReplicaUser,
        String mongoReplicaPassword,
        Boolean useSSH,
        Boolean useProxy,
        Boolean useHttpTunnel
) {
    public ConnectionConfigDto(
            String id,
            String name,
            String driverType,
            String host,
            Integer port,
            String database,
            String username,
            String password,
            Map<String, String> options,
            Integer timeout
    ) {
        this(
                id,
                name,
                driverType,
                null,
                host,
                port,
                database,
                username,
                password,
                options,
                timeout,
                null,
                null,
                null,
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );
    }

    public ConnectionConfigDto(
            String id,
            String name,
            String driverType,
            String host,
            Integer port,
            String database,
            String username,
            String password,
            Map<String, String> options
    ) {
        this(id, name, driverType, host, port, database, username, password, options, null);
    }

    public boolean isDemoConnection() {
        return driverType() == null || "h2".equalsIgnoreCase(driverType()) || "demo".equalsIgnoreCase(driverType());
    }

    public ConnectionConfigDto withDatabase(String database) {
        return new ConnectionConfigDto(
                id,
                name,
                driverType,
                driver,
                host,
                port,
                database,
                username,
                password,
                options,
                timeout,
                useSSL,
                sslMode,
                uri,
                dsn,
                hosts,
                topology,
                replicaSet,
                authSource,
                readPreference,
                mongoSrv,
                mongoAuthMechanism,
                mongoReplicaUser,
                mongoReplicaPassword,
                useSSH,
                useProxy,
                useHttpTunnel
        );
    }
}
