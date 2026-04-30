import type { JVMDiagnosticEventChunk } from "../types";

export type JVMDiagnosticPresetCategory = "observe" | "trace" | "mutating";

export interface JVMDiagnosticCommandPreset {
  key: string;
  label: string;
  category: JVMDiagnosticPresetCategory;
  command: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
}

export const JVM_DIAGNOSTIC_COMMAND_PRESETS: JVMDiagnosticCommandPreset[] = [
  {
    key: "thread-top",
    label: "thread",
    category: "observe",
    command: "thread -n 5",
    description: "查看最繁忙线程，快速定位阻塞或高 CPU 线程。",
    riskLevel: "low",
  },
  {
    key: "dashboard",
    label: "dashboard",
    category: "observe",
    command: "dashboard",
    description: "查看 JVM 运行总览。",
    riskLevel: "low",
  },
  {
    key: "trace-slow-method",
    label: "trace",
    category: "trace",
    command: "trace com.foo.OrderService submitOrder '#cost > 100'",
    description: "跟踪慢方法调用路径。",
    riskLevel: "medium",
  },
  {
    key: "watch-return",
    label: "watch",
    category: "trace",
    command: "watch com.foo.OrderService submitOrder '{params,returnObj}' -x 2",
    description: "观察入参与返回值。",
    riskLevel: "medium",
  },
  {
    key: "ognl-sample",
    label: "ognl",
    category: "mutating",
    command: "ognl '@java.lang.System@getProperty(\"user.dir\")'",
    description: "高风险表达式命令，默认只作示意。",
    riskLevel: "high",
  },
];

const CATEGORY_LABELS: Record<JVMDiagnosticPresetCategory, string> = {
  observe: "观察类命令",
  trace: "跟踪类命令",
  mutating: "高风险命令",
};

const RISK_COLORS: Record<"low" | "medium" | "high", string> = {
  low: "green",
  medium: "gold",
  high: "red",
};

const PHASE_LABELS: Record<string, string> = {
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
  canceling: "取消中",
  diagnostic: "诊断事件",
};

const EVENT_LABELS: Record<string, string> = {
  diagnostic: "诊断输出",
  chunk: "输出片段",
  done: "执行结束",
};

const TRANSPORT_LABELS: Record<string, string> = {
  "agent-bridge": "Agent Bridge",
  "arthas-tunnel": "Arthas Tunnel",
};

const RISK_LABELS: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const COMMAND_TYPE_LABELS: Record<string, string> = {
  observe: "观察类",
  trace: "跟踪类",
  mutating: "高风险类",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "手动输入",
  "ai-plan": "AI 计划",
};

const JVM_DIAGNOSTIC_REDACTION_MASK = "********";
const JVM_DIAGNOSTIC_SENSITIVE_KEY_PATTERN =
  "(?:password|passwd|pwd|secret|token|credential|authorization|api[_.\\- \\t]*key|access[_.\\- \\t]*key|private[_.\\- \\t]*key|secret[_.\\- \\t]*key|auth[_.\\- \\t]*key|access[_.\\- \\t]*token|refresh[_.\\- \\t]*token)";
const JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY =
  `[A-Za-z0-9_.\\- \\t]*${JVM_DIAGNOSTIC_SENSITIVE_KEY_PATTERN}[A-Za-z0-9_.\\- \\t]*`;
const JVM_DIAGNOSTIC_PEM_BEGIN_PATTERN =
  /-----BEGIN [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----/i;
const JVM_DIAGNOSTIC_PEM_END_PATTERN =
  /-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----/i;
const JVM_DIAGNOSTIC_PEM_BEGIN_PREFIX_PATTERN = /-----BEGIN[\s\S]*$/i;
const JVM_DIAGNOSTIC_PEM_END_CONTINUATION_PATTERN =
  /^[\s\S]*?-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----/i;
const JVM_DIAGNOSTIC_COMPLETE_PEM_PATTERN =
  /-----BEGIN [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[\s\S]*?-----END [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[^-]*-----/gi;
const JVM_DIAGNOSTIC_PARTIAL_PEM_PATTERN =
  /-----BEGIN [^-]*(?:PRIVATE KEY|SECRET|TOKEN|CREDENTIAL)[\s\S]*$/gi;
const JVM_DIAGNOSTIC_SENSITIVE_PEM_LABELS = [
  "PRIVATE KEY",
  "RSA PRIVATE KEY",
  "DSA PRIVATE KEY",
  "EC PRIVATE KEY",
  "OPENSSH PRIVATE KEY",
  "ENCRYPTED PRIVATE KEY",
  "SECRET",
  "TOKEN",
  "CREDENTIAL",
];
const JVM_DIAGNOSTIC_DOUBLE_QUOTED_VALUE_PATTERN = new RegExp(
  `(")(${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY})(")([ \\t]*:[ \\t]*)(")((?:\\\\.|[^"\\\\])*)(")`,
  "gi",
);
const JVM_DIAGNOSTIC_SINGLE_QUOTED_VALUE_PATTERN = new RegExp(
  `(')(${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY})(')([ \\t]*:[ \\t]*)(')((?:\\\\.|[^'\\\\])*)(')`,
  "gi",
);
const JVM_DIAGNOSTIC_UNQUOTED_SCALAR_PATTERN = new RegExp(
  `(["']?)(${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY})(\\1)([ \\t]*:[ \\t]*)(true|false|null|-?\\d+(?:\\.\\d+)?)`,
  "gi",
);
const JVM_DIAGNOSTIC_UNQUOTED_KEY_VALUE_PATTERN = new RegExp(
  `(^|[\\r\\n,;{\\[?&]|\\s)(${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY})([ \\t]*[:=][ \\t]*)([^\\r\\n&]*)`,
  "gi",
);

const redactJVMDiagnosticKeyValues = (value: string): string =>
  value
    .replace(
      JVM_DIAGNOSTIC_DOUBLE_QUOTED_VALUE_PATTERN,
      (_match, keyOpen: string, key: string, keyClose: string, separator: string, valueOpen: string, _rawValue: string, valueClose: string) =>
        `${keyOpen}${key}${keyClose}${separator}${valueOpen}${JVM_DIAGNOSTIC_REDACTION_MASK}${valueClose}`,
    )
    .replace(
      JVM_DIAGNOSTIC_SINGLE_QUOTED_VALUE_PATTERN,
      (_match, keyOpen: string, key: string, keyClose: string, separator: string, valueOpen: string, _rawValue: string, valueClose: string) =>
        `${keyOpen}${key}${keyClose}${separator}${valueOpen}${JVM_DIAGNOSTIC_REDACTION_MASK}${valueClose}`,
    )
    .replace(
      JVM_DIAGNOSTIC_UNQUOTED_SCALAR_PATTERN,
      (_match, keyOpen: string, key: string, keyClose: string, separator: string) =>
        `${keyOpen}${key}${keyClose}${separator}${JVM_DIAGNOSTIC_REDACTION_MASK}`,
    )
    .replace(
      JVM_DIAGNOSTIC_UNQUOTED_KEY_VALUE_PATTERN,
      (_match, prefix: string, key: string, separator: string) =>
        `${prefix}${key}${separator}${JVM_DIAGNOSTIC_REDACTION_MASK}`,
    );

export type JVMDiagnosticRedactionState = {
  insideSensitivePem: boolean;
  sawSensitivePem: boolean;
};

export const createJVMDiagnosticRedactionState = (): JVMDiagnosticRedactionState => ({
  insideSensitivePem: false,
  sawSensitivePem: false,
});

const hasSensitivePemBeginPrefix = (value: string): boolean => {
  const match = value.match(JVM_DIAGNOSTIC_PEM_BEGIN_PREFIX_PATTERN);
  if (!match) {
    return false;
  }
  const prefix = match[0];
  const label = prefix
    .replace(/^-----BEGIN\s*/i, "")
    .replace(/-+$/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (
    !label ||
    JVM_DIAGNOSTIC_SENSITIVE_PEM_LABELS.some(
      (item) => item.startsWith(label) || label.startsWith(item),
    )
  ) {
    return true;
  }
  return new RegExp(
    `${JVM_DIAGNOSTIC_SENSITIVE_KEY_BODY}[ \t]*[:=][ \t]*-----BEGIN[\\s\\S]*$`,
    "i",
  ).test(value);
};

const redactJVMDiagnosticOutputWithState = (
  value: string,
  state: JVMDiagnosticRedactionState,
): string => {
  let text = value;
  if (state.insideSensitivePem) {
    const pemEnd = text.search(JVM_DIAGNOSTIC_PEM_END_PATTERN);
    if (pemEnd < 0) {
      return JVM_DIAGNOSTIC_REDACTION_MASK;
    }
    state.insideSensitivePem = false;
    state.sawSensitivePem = true;
    text = `${JVM_DIAGNOSTIC_REDACTION_MASK}${text.slice(pemEnd).replace(JVM_DIAGNOSTIC_PEM_END_PATTERN, "")}`;
  } else if (state.sawSensitivePem && JVM_DIAGNOSTIC_PEM_END_PATTERN.test(text)) {
    text = text.replace(
      JVM_DIAGNOSTIC_PEM_END_CONTINUATION_PATTERN,
      JVM_DIAGNOSTIC_REDACTION_MASK,
    );
  }

  text = text
    .replace(JVM_DIAGNOSTIC_COMPLETE_PEM_PATTERN, () => {
      state.sawSensitivePem = true;
      return JVM_DIAGNOSTIC_REDACTION_MASK;
    })
    .replace(JVM_DIAGNOSTIC_PARTIAL_PEM_PATTERN, (match) => {
      state.sawSensitivePem = true;
      state.insideSensitivePem = !JVM_DIAGNOSTIC_PEM_END_PATTERN.test(match);
      return JVM_DIAGNOSTIC_REDACTION_MASK;
    });

  if (!state.insideSensitivePem && hasSensitivePemBeginPrefix(text)) {
    state.insideSensitivePem = true;
    state.sawSensitivePem = true;
    text = text.replace(
      JVM_DIAGNOSTIC_PEM_BEGIN_PREFIX_PATTERN,
      JVM_DIAGNOSTIC_REDACTION_MASK,
    );
  }

  return redactJVMDiagnosticKeyValues(text);
};

export const redactJVMDiagnosticChunkContent = (
  value?: string | null,
  state: JVMDiagnosticRedactionState = createJVMDiagnosticRedactionState(),
): string => redactJVMDiagnosticOutputWithState(String(value || ""), state);

export const redactJVMDiagnosticOutput = (value?: string | null): string =>
  redactJVMDiagnosticChunkContent(value);

export const formatJVMDiagnosticPresetCategory = (
  category: JVMDiagnosticPresetCategory,
): string => CATEGORY_LABELS[category];

export const resolveJVMDiagnosticRiskColor = (
  riskLevel: "low" | "medium" | "high",
): string => RISK_COLORS[riskLevel];

const normalizeLabelKey = (value?: string | null): string =>
  String(value || "").trim().toLowerCase();

const formatWithFallback = (
  value: string | undefined | null,
  labels: Record<string, string>,
  fallback = "未知",
): string => {
  const normalized = normalizeLabelKey(value);
  if (!normalized) {
    return fallback;
  }
  return labels[normalized] || String(value || "").trim();
};

export const formatJVMDiagnosticPhaseLabel = (phase?: string | null): string =>
  formatWithFallback(phase, PHASE_LABELS);

export const formatJVMDiagnosticEventLabel = (event?: string | null): string =>
  formatWithFallback(event, EVENT_LABELS);

export const formatJVMDiagnosticTransportLabel = (
  transport?: string | null,
): string => formatWithFallback(transport, TRANSPORT_LABELS);

export const formatJVMDiagnosticRiskLabel = (risk?: string | null): string =>
  formatWithFallback(risk, RISK_LABELS);

export const formatJVMDiagnosticCommandTypeLabel = (
  type?: string | null,
): string => formatWithFallback(type, COMMAND_TYPE_LABELS);

export const formatJVMDiagnosticSourceLabel = (source?: string | null): string =>
  formatWithFallback(source, SOURCE_LABELS);

export const groupJVMDiagnosticPresets = (
  presets: JVMDiagnosticCommandPreset[] = JVM_DIAGNOSTIC_COMMAND_PRESETS,
): Array<{
  category: JVMDiagnosticPresetCategory;
  label: string;
  items: JVMDiagnosticCommandPreset[];
}> =>
  (["observe", "trace", "mutating"] as const).map((category) => ({
    category,
    label: formatJVMDiagnosticPresetCategory(category),
    items: presets.filter((item) => item.category === category),
  }));

const formatJVMDiagnosticChunkTextWithContent = (
  chunk: JVMDiagnosticEventChunk,
  content: string,
): string => {
  const rawPhase = String(chunk.phase || chunk.event || "").trim();
  const phase = chunk.phase
    ? formatJVMDiagnosticPhaseLabel(chunk.phase)
    : formatJVMDiagnosticEventLabel(chunk.event);
  if (!rawPhase && !content) {
    return "空事件";
  }
  if (!rawPhase) {
    return content;
  }
  if (!content) {
    return phase;
  }
  return `${phase}：${content}`;
};

export const formatJVMDiagnosticChunkText = (
  chunk: JVMDiagnosticEventChunk,
): string =>
  formatJVMDiagnosticChunkTextWithContent(
    chunk,
    redactJVMDiagnosticOutput(chunk.content).trim(),
  );

export const formatJVMDiagnosticChunksForDisplay = (
  chunks: JVMDiagnosticEventChunk[],
): string[] => {
  const state = createJVMDiagnosticRedactionState();
  return chunks.map((chunk) =>
    formatJVMDiagnosticChunkTextWithContent(
      chunk,
      redactJVMDiagnosticChunkContent(chunk.content, state).trim(),
    ),
  );
};
