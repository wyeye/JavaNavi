import type {
  JVMMonitoringPoint,
  JVMMonitoringRecentGCEvent,
  JVMMonitoringSessionState,
} from "../types";

const METRIC_LABELS: Record<string, string> = {
  "heap.used": "堆内存",
  "heap.non_heap": "非堆内存",
  "gc.count": "垃圾回收次数",
  "gc.time": "垃圾回收耗时",
  "gc.events": "最近垃圾回收事件",
  "thread.count": "线程数",
  "thread.states": "线程状态",
  "class.loading": "类加载",
  "cpu.process": "进程 CPU",
  "cpu.system": "系统 CPU",
  "memory.rss": "进程物理内存",
  "memory.virtual": "进程虚拟内存",
};

export type JVMMonitoringProviderMode = JVMMonitoringSessionState["providerMode"];

const MONITORING_PROVIDER_MODES: JVMMonitoringProviderMode[] = [
  "jmx",
  "endpoint",
  "agent",
];

const THREAD_STATE_LABELS: Record<string, string> = {
  NEW: "新建",
  RUNNABLE: "可运行",
  BLOCKED: "阻塞",
  WAITING: "等待中",
  TIMED_WAITING: "限时等待",
  TERMINATED: "已终止",
};

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export type MonitoringChartPoint = JVMMonitoringPoint & {
  timeLabel: string;
};

export const resolveMonitoringMetricLabel = (metric: string): string =>
  METRIC_LABELS[String(metric || "").trim()] || String(metric || "").trim();

export const resolveThreadStateLabel = (state?: string | null): string => {
  const normalized = String(state || "").trim().toUpperCase();
  return THREAD_STATE_LABELS[normalized] || String(state || "").trim();
};

export const formatMonitoringTime = (timestamp?: number): string => {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "--";
  }
  return timeFormatter.format(new Date(timestamp));
};

export const formatBytes = (value?: number): string => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "--";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let next = value;
  let unitIndex = 0;
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024;
    unitIndex += 1;
  }
  const precision = next >= 100 || unitIndex === 0 ? 0 : next >= 10 ? 1 : 2;
  return `${next.toFixed(precision)} ${units[unitIndex]}`;
};

export const formatMonitoringAxisBytes = (value?: number): string => formatBytes(value);

export const formatPercent = (value?: number): string => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "--";
  }
  return `${(value * 100).toFixed(1)}%`;
};

export const formatCompactNumber = (value?: number): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return value.toLocaleString("zh-CN");
};

export const formatDurationMs = (value?: number): string => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "--";
  }
  return `${Math.round(value)}ms`;
};

export const normalizeMonitoringProviderMode = (
  value: unknown,
  fallback: JVMMonitoringProviderMode = "jmx",
): JVMMonitoringProviderMode => {
  const normalized = String(value || "").trim().toLowerCase();
  if (MONITORING_PROVIDER_MODES.includes(normalized as JVMMonitoringProviderMode)) {
    return normalized as JVMMonitoringProviderMode;
  }
  return MONITORING_PROVIDER_MODES.includes(fallback) ? fallback : "jmx";
};

export const buildMonitoringAvailabilityText = ({
  missingMetrics,
  providerWarnings,
}: Pick<JVMMonitoringSessionState, "missingMetrics" | "providerWarnings">): string => {
  const fragments: string[] = [];

  if (Array.isArray(missingMetrics) && missingMetrics.length > 0) {
    fragments.push(
      `缺失指标：${missingMetrics
        .map((metric) => resolveMonitoringMetricLabel(metric))
        .join("、")}`,
    );
  }

  if (Array.isArray(providerWarnings) && providerWarnings.length > 0) {
    fragments.push(`监控来源告警：${providerWarnings.join("；")}`);
  }

  if (fragments.length === 0) {
    return "当前监控会话未发现明显降级。";
  }

  return fragments.join(" | ");
};

export const formatRecentGCLabel = (
  event: JVMMonitoringRecentGCEvent,
): string => {
  const parts = [
    formatMonitoringTime(event.timestamp),
    String(event.name || "").trim(),
    typeof event.durationMs === "number" ? `${event.durationMs}ms` : "",
    String(event.cause || "").trim(),
  ].filter(Boolean);

  return parts.join(" · ");
};

export const buildMonitoringChartPoints = (
  points: JVMMonitoringPoint[] = [],
): MonitoringChartPoint[] =>
  points.map((point) => ({
    ...point,
    timeLabel: formatMonitoringTime(point.timestamp),
  }));

export const extractThreadStateRows = (
  point?: JVMMonitoringPoint,
): Array<{ state: string; label: string; count: number }> =>
  Object.entries(point?.threadStateCounts || {})
    .map(([state, count]) => ({
      state,
      label: resolveThreadStateLabel(state),
      count: Number(count) || 0,
    }))
    .sort((left, right) => right.count - left.count);

export const monitoringMetricAvailable = (
  session: Pick<JVMMonitoringSessionState, "availableMetrics"> | undefined,
  metric: string,
): boolean =>
  Array.isArray(session?.availableMetrics) &&
  session.availableMetrics.includes(metric);
