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
        @JsonAlias({"useSSH"}) Boolean useSSH,
        NetworkCredentialConfigDto ssh,
        NetworkCredentialConfigDto sshConfig,
        @JsonAlias({"useProxy"}) Boolean useProxy,
        NetworkProxyConfigDto proxy,
        @JsonAlias({"useHttpTunnel"}) Boolean useHttpTunnel,
        NetworkHttpTunnelConfigDto httpTunnel,
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
        String mongoReplicaPassword
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
                null,
                null,
                null,
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

    public ConnectionConfigDto(
            String id,
            String name,
            String driverType,
            String driver,
            String host,
            Integer port,
            String database,
            String username,
            String password,
            Map<String, String> options,
            Integer timeout,
            Boolean useSSL,
            String sslMode,
            String uri,
            String dsn,
            List<String> hosts,
            String topology,
            String replicaSet,
            String authSource,
            String readPreference,
            Boolean mongoSrv,
            String mongoAuthMechanism,
            String mongoReplicaUser,
            String mongoReplicaPassword
    ) {
        this(
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
                null,
                null,
                null,
                null,
                null,
                null,
                null,
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
                mongoReplicaPassword
        );
    }

    public boolean isDemoConnection() {
        return driverType() == null || "h2".equalsIgnoreCase(driverType()) || "demo".equalsIgnoreCase(driverType());
    }

    public boolean sshEnabled() {
        NetworkCredentialConfigDto value = effectiveSsh();
        return Boolean.TRUE.equals(useSSH) && value != null && text(value.host()) != null && text(value.user()) != null;
    }

    public ConnectionConfigDto withEndpoint(String host, Integer port) {
        return new ConnectionConfigDto(
                id, name, driverType, driver, host, port, database, username, password, options, timeout,
                useSSL, sslMode, useSSH, ssh, sshConfig, useProxy, proxy, useHttpTunnel, httpTunnel,
                uri, dsn, hosts, topology, replicaSet, authSource, readPreference, mongoSrv,
                mongoAuthMechanism, mongoReplicaUser, mongoReplicaPassword
        );
    }

    public NetworkCredentialConfigDto effectiveSsh() {
        return ssh != null ? ssh : sshConfig;
    }

    public boolean proxyEnabled() {
        return Boolean.TRUE.equals(useProxy) && proxy != null && text(proxy.host()) != null;
    }

    public boolean httpTunnelEnabled() {
        return Boolean.TRUE.equals(useHttpTunnel) && httpTunnel != null && text(httpTunnel.host()) != null;
    }

    private static String text(String value) {
        return value == null || value.trim().isBlank() ? null : value.trim();
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
                useSSH,
                ssh,
                sshConfig,
                useProxy,
                proxy,
                useHttpTunnel,
                httpTunnel,
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
                mongoReplicaPassword
        );
    }

    public record NetworkCredentialConfigDto(
            String host,
            Integer port,
            @JsonAlias({"user"}) String user,
            String password,
            String keyPath
    ) {
    }

    public record NetworkProxyConfigDto(
            String type,
            String host,
            Integer port,
            @JsonAlias({"user"}) String user,
            String password
    ) {
    }

    public record NetworkHttpTunnelConfigDto(
            String host,
            Integer port,
            @JsonAlias({"user"}) String user,
            String password
    ) {
    }
}
