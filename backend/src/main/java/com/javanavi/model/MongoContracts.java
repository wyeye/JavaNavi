package com.javanavi.model;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MongoContracts {
    private MongoContracts() {
    }

    public record DiscoverMembersRequest(ConnectionConfigDto connection) {
        public Map<String, Object> toCompatibilityMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            if (connection != null) {
                map.put("connection", CompatibilityRequestMaps.connectionConfig(connection));
            }
            return map;
        }
    }

    public record DiscoverMembersResponse(
            String replicaSet,
            List<MemberInfo> members,
            boolean dryRun,
            boolean driverAvailable,
            boolean wireProbe,
            AuthProfile authProfile,
            TlsProfile tlsProfile,
            String checkedAt,
            String message
    ) {
    }

    public record MemberInfo(
            String host,
            String role,
            String state,
            int stateCode,
            boolean healthy,
            boolean isSelf,
            String source
    ) {
    }

    public record AuthProfile(
            boolean usernamePresent,
            boolean passwordPresent,
            String authSource,
            String mechanism,
            boolean replicaUserPresent,
            boolean authDisabled
    ) {
    }

    public record TlsProfile(
            boolean enabled,
            String mode,
            boolean insecureSkipVerify,
            boolean preferredFallbackToPlain,
            boolean srvDefaultTls
    ) {
    }
}
