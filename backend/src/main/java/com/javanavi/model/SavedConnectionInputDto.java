package com.javanavi.model;

import java.util.List;
import java.util.Map;

public record SavedConnectionInputDto(
        String id,
        String name,
        Map<String, Object> config,
        List<String> includeDatabases,
        List<Integer> includeRedisDatabases,
        String iconType,
        String iconColor,
        Boolean clearPrimaryPassword,
        Boolean clearSSHPassword,
        Boolean clearProxyPassword,
        Boolean clearHttpTunnelPassword,
        Boolean clearMySQLReplicaPassword,
        Boolean clearMongoReplicaPassword,
        Boolean clearOpaqueURI,
        Boolean clearOpaqueDSN
) {
}
