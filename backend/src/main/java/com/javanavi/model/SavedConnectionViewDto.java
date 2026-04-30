package com.javanavi.model;

import java.util.List;
import java.util.Map;

public record SavedConnectionViewDto(
        String id,
        String name,
        Map<String, Object> config,
        List<String> includeDatabases,
        List<Integer> includeRedisDatabases,
        String iconType,
        String iconColor,
        String secretRef,
        boolean hasPrimaryPassword,
        boolean hasSSHPassword,
        boolean hasProxyPassword,
        boolean hasHttpTunnelPassword,
        boolean hasMySQLReplicaPassword,
        boolean hasMongoReplicaPassword,
        boolean hasOpaqueURI,
        boolean hasOpaqueDSN
) {
}
