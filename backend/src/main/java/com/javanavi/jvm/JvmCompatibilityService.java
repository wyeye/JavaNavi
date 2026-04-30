package com.javanavi.jvm;

import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.model.CompatEventReplayRequestDto;
import org.springframework.stereotype.Service;

import javax.management.MBeanServerConnection;
import javax.management.ObjectName;
import javax.management.remote.JMXConnector;
import javax.management.remote.JMXConnectorFactory;
import javax.management.remote.JMXServiceURL;
import java.lang.management.ClassLoadingMXBean;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.lang.management.RuntimeMXBean;
import java.lang.management.ThreadMXBean;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class JvmCompatibilityService {
    private final CompatEventPublisher publisher;
    private final CompatEventFixtures fixtures;
    private final ConcurrentMap<String, MonitoringSession> monitoringSessions = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Map<String, Object>> diagnosticSessions = new ConcurrentHashMap<>();
    private final Deque<Map<String, Object>> auditRecords = new LinkedList<>();
    private final Deque<Map<String, Object>> diagnosticAuditRecords = new LinkedList<>();

    public JvmCompatibilityService(CompatEventPublisher publisher, CompatEventFixtures fixtures) {
        this.publisher = publisher;
        this.fixtures = fixtures;
    }

    public Map<String, Object> testConnection(Map<String, Object> input) {
        if (hasRemoteJmxTarget(input)) {
            RemoteJmxTarget target = remoteJmxTarget(input);
            return withRemoteJmx(target, connection -> {
                RuntimeMXBean runtime = ManagementFactory.newPlatformMXBeanProxy(
                        connection,
                        ManagementFactory.RUNTIME_MXBEAN_NAME,
                        RuntimeMXBean.class
                );
                return orderedMap(
                        "connected", true,
                        "providerMode", "jmx",
                        "target", "remote-jmx",
                        "host", target.host(),
                        "port", target.port(),
                        "runtimeName", runtime.getName(),
                        "message", "JavaNavi JVM compatibility connected to the configured remote JMX endpoint."
                );
            });
        }
        return orderedMap(
                "connected", true,
                "providerMode", providerMode(input),
                "target", "local-java-process",
                "runtimeName", ManagementFactory.getRuntimeMXBean().getName(),
                "message", "JavaNavi JVM compatibility uses the local Java process via JDK management beans."
        );
    }

    public List<Map<String, Object>> probeCapabilities(Map<String, Object> input) {
        boolean remote = hasRemoteJmxTarget(input);
        return List.of(
                orderedMap(
                        "mode", "jmx",
                        "canBrowse", true,
                        "canWrite", false,
                        "canPreview", true,
                        "displayLabel", remote ? "Remote JMX Management Beans" : "Local JDK Management Beans",
                        "remote", remote,
                        "reason", remote
                                ? "JavaNavi can inspect the configured remote JMX endpoint through the JDK JMX connector."
                                : "JavaNavi can inspect the local backend JVM without extra dependencies."
                ),
                orderedMap("mode", "endpoint", "canBrowse", false, "canWrite", false, "canPreview", false, "displayLabel", "HTTP Endpoint", "reason", "No endpoint provider is configured in this Java Web slice."),
                orderedMap("mode", "agent", "canBrowse", false, "canWrite", false, "canPreview", false, "displayLabel", "Agent", "reason", "No agent provider is configured in this Java Web slice.")
        );
    }

    public List<Map<String, Object>> listResources(Map<String, Object> input) {
        String mode = providerMode(input);
        String parent = stringValue(input, "parentPath", "path", "resourceId");
        if (!parent.isBlank() && !"root".equals(parent)) {
            return List.of();
        }
        return List.of(
                resource("memory", "Memory", "memory", mode, false),
                resource("threads", "Threads", "threads", mode, false),
                resource("classes", "Classes", "classes", mode, false),
                resource("runtime", "Runtime", "runtime", mode, false),
                resource("gc", "Garbage Collectors", "gc", mode, false)
        );
    }

    public Map<String, Object> getValue(Map<String, Object> input) {
        String resourceId = firstText(stringValue(input, "resourceId", "path"), "memory");
        return snapshot(input, resourceId);
    }

    public Map<String, Object> previewChange(Map<String, Object> input) {
        String resourceId = firstText(stringValue(input, "resourceId"), "memory");
        Map<String, Object> before = snapshot(input, resourceId);
        Map<String, Object> after = new LinkedHashMap<>(before);
        String token = "jvm-preview-" + UUID.randomUUID();
        return orderedMap(
                "allowed", false,
                "requiresConfirmation", true,
                "confirmationToken", token,
                "summary", "JavaNavi Web currently supports JVM inspection only; mutating JVM actions remain blocked in the default slice.",
                "riskLevel", "medium",
                "blockingReason", "JVM write actions require a dedicated runtime profile and audit policy.",
                "before", before,
                "after", after
        );
    }

    public Map<String, Object> applyChange(Map<String, Object> input) {
        Map<String, Object> record = auditRecord(input, "blocked");
        addAudit(auditRecords, record);
        return orderedMap(
                "status", "blocked",
                "message", "JVM mutation was blocked by JavaNavi Web compatibility policy.",
                "updatedValue", snapshot(input, firstText(stringValue(input, "resourceId"), "memory")),
                "auditRecord", record
        );
    }

    public List<Map<String, Object>> listAuditRecords(String connectionId, int limit) {
        return limited(auditRecords, limit);
    }

    public Map<String, Object> startMonitoring(Map<String, Object> input) {
        String connectionId = connectionId(input);
        String mode = providerMode(input);
        String sessionId = "jvm-monitor-" + UUID.randomUUID();
        Map<String, Object> point = monitoringPoint(input);
        MonitoringSession session = new MonitoringSession(connectionId, mode, true, new ArrayList<>(List.of(point)));
        monitoringSessions.put(sessionId, session);
        return monitoringState(sessionId, session);
    }

    public Map<String, Object> stopMonitoring(Map<String, Object> input) {
        String sessionId = firstText(stringValue(input, "sessionId"), stringValue(input, "monitoringId"));
        MonitoringSession session = monitoringSessions.get(sessionId);
        if (session == null) {
            session = new MonitoringSession(connectionId(input), providerMode(input), false, new ArrayList<>(List.of(monitoringPoint())));
        } else {
            session.points().add(monitoringPoint(input));
            session = new MonitoringSession(session.connectionId(), session.providerMode(), false, session.points());
            monitoringSessions.put(sessionId, session);
        }
        return monitoringState(sessionId, session);
    }

    public Map<String, Object> monitoringHistory(Map<String, Object> input) {
        String sessionId = firstText(stringValue(input, "sessionId"), stringValue(input, "monitoringId"));
        MonitoringSession session = monitoringSessions.get(sessionId);
        List<Map<String, Object>> points = session == null ? List.of(monitoringPoint(input)) : session.points();
        return orderedMap("sessionId", sessionId, "points", points, "running", session != null && session.running());
    }

    public List<Map<String, Object>> probeDiagnosticCapabilities(Map<String, Object> input) {
        return List.of(orderedMap(
                "transport", "agent-bridge",
                "canOpenSession", true,
                "canStream", true,
                "canCancel", true,
                "allowObserveCommands", true,
                "allowTraceCommands", false,
                "allowMutatingCommands", false,
                "reason", "JavaNavi emits local diagnostic fixture chunks without external Arthas/tunnel runtime."
        ));
    }

    public Map<String, Object> startDiagnosticSession(Map<String, Object> input) {
        String sessionId = "jvm-diag-" + UUID.randomUUID();
        Map<String, Object> handle = orderedMap(
                "sessionId", sessionId,
                "transport", "agent-bridge",
                "startedAt", Instant.now().toEpochMilli(),
                "title", firstText(stringValue(input, "title"), "JavaNavi JVM diagnostic session")
        );
        diagnosticSessions.put(sessionId, handle);
        return handle;
    }

    public Map<String, Object> executeDiagnosticCommand(Map<String, Object> input) {
        String sessionId = firstText(stringValue(input, "sessionId"), "jvm-diag-adhoc");
        String commandId = firstText(stringValue(input, "commandId"), "cmd-" + UUID.randomUUID());
        String command = firstText(stringValue(input, "command"), "jvm.summary");
        publishJvmDiagnosticFixture(sessionId, commandId);
        Map<String, Object> chunk = orderedMap(
                "sessionId", sessionId,
                "commandId", commandId,
                "event", "stdout",
                "phase", "completed",
                "content", diagnosticContent(command),
                "timestamp", Instant.now().toEpochMilli(),
                "metadata", orderedMap("source", "javanavi-local-jdk")
        );
        Map<String, Object> record = diagnosticAuditRecord(input, command, sessionId, commandId, "completed");
        addAudit(diagnosticAuditRecords, record);
        return orderedMap("sessionId", sessionId, "commandId", commandId, "status", "completed", "chunks", List.of(chunk), "auditRecord", record);
    }

    public Map<String, Object> cancelDiagnosticCommand(Map<String, Object> input) {
        String sessionId = firstText(stringValue(input, "sessionId"), "jvm-diag-adhoc");
        String commandId = firstText(stringValue(input, "commandId"), "unknown");
        Map<String, Object> record = diagnosticAuditRecord(input, "cancel", sessionId, commandId, "cancelled");
        addAudit(diagnosticAuditRecords, record);
        return orderedMap("sessionId", sessionId, "commandId", commandId, "cancelled", true, "status", "cancelled", "auditRecord", record);
    }

    public List<Map<String, Object>> listDiagnosticAuditRecords(String connectionId, int limit) {
        return limited(diagnosticAuditRecords, limit);
    }

    private Map<String, Object> snapshot(Map<String, Object> input, String resourceId) {
        if (hasRemoteJmxTarget(input)) {
            RemoteJmxTarget target = remoteJmxTarget(input);
            return withRemoteJmx(target, connection -> remoteSnapshot(connection, target, resourceId));
        }
        return snapshot(resourceId);
    }

    private Map<String, Object> snapshot(String resourceId) {
        String id = firstText(resourceId, "memory");
        Object value = switch (id) {
            case "threads" -> threadValue();
            case "classes" -> classValue();
            case "runtime" -> runtimeValue();
            case "gc" -> gcValue();
            default -> memoryValue();
        };
        return orderedMap(
                "resourceId", id,
                "kind", id,
                "format", "json",
                "version", String.valueOf(Instant.now().toEpochMilli()),
                "value", value,
                "description", "Local JavaNavi backend JVM " + id + " snapshot",
                "sensitive", false,
                "supportedActions", List.of(),
                "metadata", orderedMap("providerMode", "jmx", "source", "java.lang.management")
        );
    }

    private Map<String, Object> remoteSnapshot(MBeanServerConnection connection, RemoteJmxTarget target, String resourceId) throws Exception {
        String id = firstText(resourceId, "memory");
        Object value = switch (id) {
            case "threads" -> remoteThreadValue(connection);
            case "classes" -> remoteClassValue(connection);
            case "runtime" -> remoteRuntimeValue(connection);
            case "gc" -> remoteGcValue(connection);
            default -> remoteMemoryValue(connection);
        };
        return orderedMap(
                "resourceId", id,
                "kind", id,
                "format", "json",
                "version", String.valueOf(Instant.now().toEpochMilli()),
                "value", value,
                "description", "Remote JVM " + target.host() + ":" + target.port() + " " + id + " snapshot",
                "sensitive", false,
                "supportedActions", List.of(),
                "metadata", orderedMap("providerMode", "jmx", "source", "remote-jmx", "host", target.host(), "port", target.port())
        );
    }

    private Map<String, Object> memoryValue() {
        MemoryMXBean bean = ManagementFactory.getMemoryMXBean();
        MemoryUsage heap = bean.getHeapMemoryUsage();
        MemoryUsage nonHeap = bean.getNonHeapMemoryUsage();
        return orderedMap(
                "heapUsedBytes", heap.getUsed(),
                "heapCommittedBytes", heap.getCommitted(),
                "heapMaxBytes", heap.getMax(),
                "nonHeapUsedBytes", nonHeap.getUsed(),
                "nonHeapCommittedBytes", nonHeap.getCommitted(),
                "pendingFinalizationCount", bean.getObjectPendingFinalizationCount()
        );
    }

    private Map<String, Object> threadValue() {
        ThreadMXBean bean = ManagementFactory.getThreadMXBean();
        return orderedMap("threadCount", bean.getThreadCount(), "daemonThreadCount", bean.getDaemonThreadCount(), "peakThreadCount", bean.getPeakThreadCount());
    }

    private Map<String, Object> classValue() {
        ClassLoadingMXBean bean = ManagementFactory.getClassLoadingMXBean();
        return orderedMap("loadedClassCount", bean.getLoadedClassCount(), "totalLoadedClassCount", bean.getTotalLoadedClassCount(), "unloadedClassCount", bean.getUnloadedClassCount());
    }

    private Map<String, Object> runtimeValue() {
        RuntimeMXBean bean = ManagementFactory.getRuntimeMXBean();
        return orderedMap("name", bean.getName(), "vmName", bean.getVmName(), "vmVendor", bean.getVmVendor(), "specVersion", bean.getSpecVersion(), "uptimeMs", bean.getUptime());
    }

    private List<Map<String, Object>> gcValue() {
        return ManagementFactory.getGarbageCollectorMXBeans().stream()
                .map(bean -> orderedMap("name", bean.getName(), "collectionCount", bean.getCollectionCount(), "collectionTimeMs", bean.getCollectionTime()))
                .toList();
    }

    private Map<String, Object> remoteMemoryValue(MBeanServerConnection connection) throws Exception {
        MemoryMXBean bean = ManagementFactory.newPlatformMXBeanProxy(connection, ManagementFactory.MEMORY_MXBEAN_NAME, MemoryMXBean.class);
        MemoryUsage heap = bean.getHeapMemoryUsage();
        MemoryUsage nonHeap = bean.getNonHeapMemoryUsage();
        return orderedMap(
                "heapUsedBytes", heap.getUsed(),
                "heapCommittedBytes", heap.getCommitted(),
                "heapMaxBytes", heap.getMax(),
                "nonHeapUsedBytes", nonHeap.getUsed(),
                "nonHeapCommittedBytes", nonHeap.getCommitted(),
                "pendingFinalizationCount", bean.getObjectPendingFinalizationCount()
        );
    }

    private Map<String, Object> remoteThreadValue(MBeanServerConnection connection) throws Exception {
        ThreadMXBean bean = ManagementFactory.newPlatformMXBeanProxy(connection, ManagementFactory.THREAD_MXBEAN_NAME, ThreadMXBean.class);
        return orderedMap("threadCount", bean.getThreadCount(), "daemonThreadCount", bean.getDaemonThreadCount(), "peakThreadCount", bean.getPeakThreadCount());
    }

    private Map<String, Object> remoteClassValue(MBeanServerConnection connection) throws Exception {
        ClassLoadingMXBean bean = ManagementFactory.newPlatformMXBeanProxy(connection, ManagementFactory.CLASS_LOADING_MXBEAN_NAME, ClassLoadingMXBean.class);
        return orderedMap("loadedClassCount", bean.getLoadedClassCount(), "totalLoadedClassCount", bean.getTotalLoadedClassCount(), "unloadedClassCount", bean.getUnloadedClassCount());
    }

    private Map<String, Object> remoteRuntimeValue(MBeanServerConnection connection) throws Exception {
        RuntimeMXBean bean = ManagementFactory.newPlatformMXBeanProxy(connection, ManagementFactory.RUNTIME_MXBEAN_NAME, RuntimeMXBean.class);
        return orderedMap("name", bean.getName(), "vmName", bean.getVmName(), "vmVendor", bean.getVmVendor(), "specVersion", bean.getSpecVersion(), "uptimeMs", bean.getUptime());
    }

    private List<Map<String, Object>> remoteGcValue(MBeanServerConnection connection) throws Exception {
        List<Map<String, Object>> collectors = new ArrayList<>();
        for (ObjectName name : connection.queryNames(new ObjectName(ManagementFactory.GARBAGE_COLLECTOR_MXBEAN_DOMAIN_TYPE + ",*"), null)) {
            GarbageCollectorMXBean bean = ManagementFactory.newPlatformMXBeanProxy(connection, name.toString(), GarbageCollectorMXBean.class);
            collectors.add(orderedMap("name", bean.getName(), "collectionCount", bean.getCollectionCount(), "collectionTimeMs", bean.getCollectionTime()));
        }
        return collectors;
    }

    private Map<String, Object> monitoringPoint() {
        Map<String, Object> memory = memoryValue();
        Map<String, Object> threads = threadValue();
        Map<String, Object> classes = classValue();
        long gcCount = ManagementFactory.getGarbageCollectorMXBeans().stream().mapToLong(GarbageCollectorMXBean::getCollectionCount).filter(value -> value > 0).sum();
        long gcTime = ManagementFactory.getGarbageCollectorMXBeans().stream().mapToLong(GarbageCollectorMXBean::getCollectionTime).filter(value -> value > 0).sum();
        return orderedMap(
                "timestamp", Instant.now().toEpochMilli(),
                "heapUsedBytes", memory.get("heapUsedBytes"),
                "heapCommittedBytes", memory.get("heapCommittedBytes"),
                "heapMaxBytes", memory.get("heapMaxBytes"),
                "nonHeapUsedBytes", memory.get("nonHeapUsedBytes"),
                "nonHeapCommittedBytes", memory.get("nonHeapCommittedBytes"),
                "gcCollectionCount", gcCount,
                "gcCollectionTimeMs", gcTime,
                "threadCount", threads.get("threadCount"),
                "daemonThreadCount", threads.get("daemonThreadCount"),
                "peakThreadCount", threads.get("peakThreadCount"),
                "loadedClassCount", classes.get("loadedClassCount"),
                "unloadedClassCount", classes.get("unloadedClassCount")
        );
    }

    private Map<String, Object> monitoringPoint(Map<String, Object> input) {
        if (!hasRemoteJmxTarget(input)) {
            return monitoringPoint();
        }
        RemoteJmxTarget target = remoteJmxTarget(input);
        return withRemoteJmx(target, connection -> {
            Map<String, Object> memory = remoteMemoryValue(connection);
            Map<String, Object> threads = remoteThreadValue(connection);
            Map<String, Object> classes = remoteClassValue(connection);
            List<Map<String, Object>> gc = remoteGcValue(connection);
            long gcCount = gc.stream().mapToLong(item -> longValue(item.get("collectionCount"))).filter(value -> value > 0).sum();
            long gcTime = gc.stream().mapToLong(item -> longValue(item.get("collectionTimeMs"))).filter(value -> value > 0).sum();
            return orderedMap(
                    "timestamp", Instant.now().toEpochMilli(),
                    "heapUsedBytes", memory.get("heapUsedBytes"),
                    "heapCommittedBytes", memory.get("heapCommittedBytes"),
                    "heapMaxBytes", memory.get("heapMaxBytes"),
                    "nonHeapUsedBytes", memory.get("nonHeapUsedBytes"),
                    "nonHeapCommittedBytes", memory.get("nonHeapCommittedBytes"),
                    "gcCollectionCount", gcCount,
                    "gcCollectionTimeMs", gcTime,
                    "threadCount", threads.get("threadCount"),
                    "daemonThreadCount", threads.get("daemonThreadCount"),
                    "peakThreadCount", threads.get("peakThreadCount"),
                    "loadedClassCount", classes.get("loadedClassCount"),
                    "unloadedClassCount", classes.get("unloadedClassCount"),
                    "source", "remote-jmx",
                    "host", target.host(),
                    "port", target.port()
            );
        });
    }

    private Map<String, Object> monitoringState(String sessionId, MonitoringSession session) {
        return orderedMap(
                "sessionId", sessionId,
                "connectionId", session.connectionId(),
                "providerMode", session.providerMode(),
                "running", session.running(),
                "points", session.points(),
                "availableMetrics", List.of("memory", "threads", "classes", "gc"),
                "missingMetrics", List.of("remote-process-cpu", "remote-rss"),
                "providerWarnings", List.of("Local JavaNavi JVM metrics only; remote JVM integration remains profile-gated.")
        );
    }

    private Map<String, Object> resource(String id, String name, String kind, String mode, boolean hasChildren) {
        return orderedMap("id", id, "kind", kind, "name", name, "path", id, "providerMode", mode, "canRead", true, "canWrite", false, "hasChildren", hasChildren, "sensitive", false);
    }

    private Map<String, Object> auditRecord(Map<String, Object> input, String result) {
        return orderedMap("timestamp", Instant.now().toEpochMilli(), "connectionId", connectionId(input), "providerMode", providerMode(input), "resourceId", firstText(stringValue(input, "resourceId"), "unknown"), "action", firstText(stringValue(input, "action"), "unknown"), "reason", stringValue(input, "reason"), "source", firstText(stringValue(input, "source"), "manual"), "result", result);
    }

    private Map<String, Object> diagnosticAuditRecord(Map<String, Object> input, String command, String sessionId, String commandId, String status) {
        return orderedMap("timestamp", Instant.now().toEpochMilli(), "connectionId", connectionId(input), "sessionId", sessionId, "commandId", commandId, "transport", "agent-bridge", "command", command, "commandType", "observe", "source", firstText(stringValue(input, "source"), "manual"), "reason", stringValue(input, "reason"), "riskLevel", "low", "status", status);
    }

    private void publishJvmDiagnosticFixture(String sessionId, String commandId) {
        try {
            fixtures.fixturesFor(new CompatEventReplayRequestDto("jvm", sessionId, null, Map.of("sessionId", sessionId, "commandId", commandId))).forEach(publisher::publish);
        } catch (RuntimeException ignored) {
        }
    }

    private String diagnosticContent(String command) {
        return "JavaNavi JVM diagnostic: " + command + "\n" + "memory=" + memoryValue() + "\nthreads=" + threadValue();
    }

    private void addAudit(Deque<Map<String, Object>> deque, Map<String, Object> record) {
        synchronized (deque) {
            deque.addFirst(record);
            while (deque.size() > 200) {
                deque.removeLast();
            }
        }
    }

    private List<Map<String, Object>> limited(Deque<Map<String, Object>> deque, int limit) {
        int resolvedLimit = limit <= 0 ? 50 : Math.min(limit, 200);
        synchronized (deque) {
            return deque.stream().limit(resolvedLimit).toList();
        }
    }

    @SuppressWarnings("unchecked")
    private String connectionId(Map<String, Object> input) {
        Object connection = input == null ? null : input.get("connection");
        if (connection instanceof Map<?, ?> map && map.get("id") != null) {
            return String.valueOf(map.get("id"));
        }
        return firstText(stringValue(input, "connectionId"), "jvm-local");
    }

    @SuppressWarnings("unchecked")
    private String providerMode(Map<String, Object> input) {
        String direct = stringValue(input, "providerMode", "mode");
        if (!direct.isBlank()) {
            return direct;
        }
        Object connection = input == null ? null : input.get("connection");
        if (connection instanceof Map<?, ?> map) {
            Object jvm = map.get("jvm");
            if (jvm instanceof Map<?, ?> jvmMap && jvmMap.get("preferredMode") != null) {
                return String.valueOf(jvmMap.get("preferredMode"));
            }
        }
        return "jmx";
    }

    private boolean hasRemoteJmxTarget(Map<String, Object> input) {
        RemoteJmxTarget target = remoteJmxTarget(input);
        return !target.host().isBlank() && target.port() > 0;
    }

    private RemoteJmxTarget remoteJmxTarget(Map<String, Object> input) {
        String host = firstText(stringValue(input, "host"), "127.0.0.1");
        int port = intValue(input == null ? null : input.get("port"), -1);
        Object connection = input == null ? null : input.get("connection");
        if (connection instanceof Map<?, ?> map) {
            Object jvm = map.get("jvm");
            if (jvm instanceof Map<?, ?> jvmMap) {
                host = firstText(text(jvmMap.get("host")), text(jvmMap.get("hostname")), host);
                port = intValue(firstNonNull(jvmMap.get("port"), jvmMap.get("jmxPort")), port);
            }
        }
        return new RemoteJmxTarget(host, port);
    }

    private <T> T withRemoteJmx(RemoteJmxTarget target, RemoteJmxWork<T> work) {
        try (JMXConnector connector = JMXConnectorFactory.connect(new JMXServiceURL(
                "service:jmx:rmi:///jndi/rmi://" + target.host() + ":" + target.port() + "/jmxrmi"
        ))) {
            return work.execute(connector.getMBeanServerConnection());
        } catch (Exception error) {
            throw new IllegalArgumentException("Remote JMX connection failed: " + error.getMessage(), error);
        }
    }

    private static String stringValue(Map<String, Object> input, String... keys) {
        if (input == null) return "";
        for (String key : keys) {
            Object value = input.get(key);
            if (value != null) return String.valueOf(value).trim();
        }
        return "";
    }

    private static String firstText(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static Object firstNonNull(Object... values) {
        for (Object value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static int intValue(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(text(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(text(value));
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static Map<String, Object> orderedMap(Object... entries) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            map.put(String.valueOf(entries[index]), entries[index + 1]);
        }
        return map;
    }

    private record RemoteJmxTarget(String host, int port) {}

    @FunctionalInterface
    private interface RemoteJmxWork<T> {
        T execute(MBeanServerConnection connection) throws Exception;
    }

    private record MonitoringSession(String connectionId, String providerMode, boolean running, List<Map<String, Object>> points) {}
}
