package com.javanavi.events;

import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.CompatEventDto;
import com.javanavi.model.CompatEventReplayRequestDto;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Component
public class CompatEventFixtures {
    private static final Set<String> SUPPORTED_FAMILIES = Set.of("sync", "sqlfile", "import", "driver", "ai");

    private final I18nMessages messages;

    public CompatEventFixtures(I18nMessages messages) {
        this.messages = messages;
    }

    public List<String> supportedFamilies() {
        return SUPPORTED_FAMILIES.stream().sorted().toList();
    }

    public Map<String, List<CompatEventDto>> allFixtures() {
        Map<String, List<CompatEventDto>> fixtures = new LinkedHashMap<>();
        supportedFamilies().forEach(family -> fixtures.put(family, fixturesFor(new CompatEventReplayRequestDto(family, family + "-fixture", null, Map.of()))));
        return fixtures;
    }

    public List<CompatEventDto> fixturesFor(CompatEventReplayRequestDto request) {
        String family = normalizeFamily(request == null ? null : request.family());
        if (!SUPPORTED_FAMILIES.contains(family)) {
            throw new IllegalArgumentException("Unsupported compatibility event fixture family: " + family);
        }
        String correlationId = textOrDefault(request == null ? null : request.correlationId(), family + "-" + Instant.now().toEpochMilli());
        Map<String, Object> overrides = request == null || request.payload() == null ? Map.of() : request.payload();
        return switch (family) {
            case "sync" -> syncFixtures(correlationId, overrides);
            case "sqlfile" -> sqlFileFixtures(correlationId, overrides);
            case "import" -> importFixtures(correlationId, overrides);
            case "driver" -> driverFixtures(correlationId, overrides);
            case "ai" -> aiFixtures(correlationId, request == null ? null : request.eventName(), overrides);
            default -> List.of();
        };
    }

    private List<CompatEventDto> syncFixtures(String jobId, Map<String, Object> overrides) {
        String table = stringValue(overrides, "table", "demo_connections");
        return List.of(
                event("sync:log", "sync", jobId, "started", "JavaNavi sync fixture started", map(
                        "jobId", jobId,
                        "level", "info",
                        "message", "JavaNavi sync fixture started",
                        "ts", Instant.now().toEpochMilli()
                )),
                event("sync:progress", "sync", jobId, "running", "Sync fixture progress", map(
                        "jobId", jobId,
                        "percent", 25,
                        "current", 1,
                        "total", 4,
                        "table", table,
                        "stage", messages.message("events.readSource")
                )),
                event("sync:progress", "sync", jobId, "running", "Sync fixture progress", map(
                        "jobId", jobId,
                        "percent", 75,
                        "current", 3,
                        "total", 4,
                        "table", table,
                        "stage", messages.message("events.writeTarget")
                )),
                event("sync:progress", "sync", jobId, "completed", "Sync fixture completed", map(
                        "jobId", jobId,
                        "percent", 100,
                        "current", 4,
                        "total", 4,
                        "table", table,
                        "stage", messages.message("events.complete")
                )),
                event("sync:log", "sync", jobId, "completed", "JavaNavi sync fixture completed", map(
                        "jobId", jobId,
                        "level", "info",
                        "message", "JavaNavi sync fixture completed",
                        "ts", Instant.now().toEpochMilli()
                ))
        );
    }

    private List<CompatEventDto> sqlFileFixtures(String jobId, Map<String, Object> overrides) {
        String currentSql = stringValue(overrides, "currentSQL", "select * from demo_connections;");
        return List.of(
                event("sqlfile:progress", "sqlfile", jobId, "running", "SQL file fixture started", map(
                        "jobId", jobId,
                        "status", "running",
                        "executed", 0,
                        "failed", 0,
                        "total", 2,
                        "percent", 0,
                        "currentSQL", currentSql
                )),
                event("sqlfile:progress", "sqlfile", jobId, "running", "SQL file fixture progress", map(
                        "jobId", jobId,
                        "status", "running",
                        "executed", 1,
                        "failed", 0,
                        "total", 2,
                        "percent", 50,
                        "currentSQL", currentSql
                )),
                event("sqlfile:progress", "sqlfile", jobId, "completed", "SQL file fixture completed", map(
                        "jobId", jobId,
                        "status", "done",
                        "executed", 2,
                        "failed", 0,
                        "total", 2,
                        "percent", 100,
                        "currentSQL", ""
                ))
        );
    }

    private List<CompatEventDto> importFixtures(String jobId, Map<String, Object> overrides) {
        int total = intValue(overrides, "total", 3);
        return List.of(
                event("import:progress", "import", jobId, "running", "Import fixture progress", map(
                        "current", 1,
                        "total", total,
                        "success", 1,
                        "errors", 0
                )),
                event("import:progress", "import", jobId, "completed", "Import fixture completed", map(
                        "current", total,
                        "total", total,
                        "success", total,
                        "errors", 0
                ))
        );
    }

    private List<CompatEventDto> driverFixtures(String driverType, Map<String, Object> overrides) {
        String normalizedDriver = stringValue(overrides, "driverType", textOrDefault(driverType, "mysql")).toLowerCase(Locale.ROOT);
        return List.of(
                event("driver:download-progress", "driver", normalizedDriver, "started", "Driver fixture started", map(
                        "driverType", normalizedDriver,
                        "status", "start",
                        "message", "Preparing JavaNavi driver fixture download",
                        "percent", 0
                )),
                event("driver:download-progress", "driver", normalizedDriver, "running", "Driver fixture progress", map(
                        "driverType", normalizedDriver,
                        "status", "downloading",
                        "message", "Downloading JavaNavi driver fixture",
                        "percent", 64
                )),
                event("driver:download-progress", "driver", normalizedDriver, "completed", "Driver fixture completed", map(
                        "driverType", normalizedDriver,
                        "status", "done",
                        "message", "JavaNavi driver fixture completed",
                        "percent", 100
                ))
        );
    }

    private List<CompatEventDto> aiFixtures(String sessionId, String eventName, Map<String, Object> overrides) {
        String resolvedEventName = textOrDefault(eventName, "ai:stream:" + sessionId);
        String content = stringValue(overrides, "content", "JavaNavi AI streaming fixture: backend event bridge is connected.");
        return List.of(
                event(resolvedEventName, "ai", sessionId, "generating", "AI stream fixture content", map(
                        "content", content
                )),
                event(resolvedEventName, "ai", sessionId, "completed", "AI stream fixture completed", map(
                        "done", true
                ))
        );
    }


    private static CompatEventDto event(String eventName, String family, String correlationId, String phase, String message, Map<String, Object> payload) {
        return new CompatEventDto(
                UUID.randomUUID().toString(),
                eventName,
                family,
                "javanavi-backend",
                correlationId,
                phase,
                message,
                Instant.now(),
                payload
        );
    }

    private static String normalizeFamily(String family) {
        return textOrDefault(family, "").toLowerCase(Locale.ROOT).trim();
    }

    private static String textOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static String stringValue(Map<String, Object> values, String key, String fallback) {
        Object value = values.get(key);
        return value == null ? fallback : textOrDefault(String.valueOf(value), fallback);
    }

    private static int intValue(Map<String, Object> values, String key, int fallback) {
        Object value = values.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text) {
            try {
                return Integer.parseInt(text);
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private static Map<String, Object> map(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }
}
