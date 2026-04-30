package com.javanavi.security;

import java.util.List;
import java.util.regex.Pattern;

public final class SecretRedactor {
    public static final String REDACTION = "[REDACTED]";

    private static final List<Pattern> KEY_VALUE_PATTERNS = List.of(
            Pattern.compile("(?i)(\\\"?(?:password|passwd|pwd|token|access_token|refresh_token|api[-_]?key|secret|client_secret|ssh[-_]?key|private[-_]?key|proxy[-_]?password)\\\"?\\s*[:=]\\s*\\\"?)([^\\\"\\s,;}]+)(\\\"?)"),
            Pattern.compile("(?i)((?:password|passwd|pwd|token|access_token|refresh_token|api[-_]?key|secret|client_secret|ssh[-_]?key|private[-_]?key|proxy[-_]?password)=)([^&\\s]+)")
    );
    private static final Pattern USERINFO_URI_PATTERN = Pattern.compile("(?i)(//[^:/@\\s]+:)([^@/\\s]+)(@)");
    private static final Pattern JDBC_USERINFO_PATTERN = Pattern.compile("(?i)(jdbc:[a-z0-9]+://[^:/@\\s]+:)([^@/\\s]+)(@)");

    private SecretRedactor() {
    }

    public static String redact(String value) {
        if (value == null || value.isBlank()) {
            return value;
        }
        String redacted = value;
        for (Pattern pattern : KEY_VALUE_PATTERNS) {
            redacted = pattern.matcher(redacted).replaceAll(match ->
                    match.group(1) + REDACTION + (match.groupCount() >= 3 ? match.group(3) : "")
            );
        }
        redacted = USERINFO_URI_PATTERN.matcher(redacted).replaceAll("$1" + REDACTION + "$3");
        redacted = JDBC_USERINFO_PATTERN.matcher(redacted).replaceAll("$1" + REDACTION + "$3");
        return redacted;
    }
}
