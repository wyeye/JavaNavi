import type {
  JVMActionDefinition,
  JVMChangePreview,
  JVMChangeRequest,
  JVMValueSnapshot,
} from "../types";

type JVMActionDisplay = {
  action: string;
  label: string;
  description?: string;
};

const ACTION_FALLBACK_META: Record<
  string,
  { label: string; description?: string }
> = {
  set: {
    label: "设置属性",
    description: "更新当前资源暴露的可写属性值。",
  },
  invoke: {
    label: "调用操作",
    description: "调用当前资源暴露的管理操作。",
  },
  put: {
    label: "写入资源",
    description: "将 payload 内容写入当前 JVM 资源。",
  },
  clear: {
    label: "清空资源",
    description: "清空当前 JVM 资源里的数据或状态。",
  },
  evict: {
    label: "驱逐缓存",
    description: "将目标缓存项从当前 JVM 运行时中驱逐。",
  },
  remove: {
    label: "删除条目",
    description: "删除当前资源中的指定条目。",
  },
  delete: {
    label: "删除资源",
    description: "删除或注销当前资源。",
  },
  refresh: {
    label: "刷新资源",
    description: "刷新当前资源的运行时状态。",
  },
  reload: {
    label: "重新加载",
    description: "重新加载当前资源或其配置。",
  },
  reset: {
    label: "重置状态",
    description: "将当前资源恢复到初始或默认状态。",
  },
};

const normalizeText = (value: unknown): string => String(value || "").trim();

const looksLikeStructuredJSONText = (value: string): boolean => {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return false;
  }
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
};

export const resolveJVMActionDisplay = (
  value?: Partial<JVMActionDefinition> | string | null,
): JVMActionDisplay => {
  const action = normalizeText(
    typeof value === "string" ? value : value?.action,
  );
  const fallback = ACTION_FALLBACK_META[action.toLowerCase()] || null;
  const label =
    normalizeText(typeof value === "string" ? "" : value?.label) ||
    fallback?.label ||
    action ||
    "未命名动作";
  const description =
    normalizeText(typeof value === "string" ? "" : value?.description) ||
    fallback?.description ||
    "";

  return {
    action,
    label,
    description: description || undefined,
  };
};

export const formatJVMActionDisplayText = (
  value?: Partial<JVMActionDefinition> | string | null,
): string => {
  const resolved = resolveJVMActionDisplay(value);
  if (!resolved.action || resolved.label === resolved.action) {
    return resolved.label;
  }
  return `${resolved.label}（${resolved.action}）`;
};

export const formatJVMActionSummary = (
  actions?: JVMActionDefinition[] | null,
): string => {
  if (!Array.isArray(actions) || actions.length === 0) {
    return "-";
  }
  return actions
    .map((item) => formatJVMActionDisplayText(item))
    .filter((item) => item !== "")
    .join(", ");
};

export const formatJVMRiskLevelText = (value?: string | null): string => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "low") {
    return "低";
  }
  if (normalized === "medium") {
    return "中";
  }
  if (normalized === "high") {
    return "高";
  }
  return normalizeText(value) || "未知";
};

export const resolveJVMAuditResultColor = (value?: string | null): string => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "applied" ||
    normalized.includes("success") ||
    normalized.includes("ok") ||
    normalized.includes("done")
  ) {
    return "green";
  }
  if (normalized.includes("warn")) {
    return "gold";
  }
  if (
    normalized.includes("block") ||
    normalized.includes("deny") ||
    normalized.includes("forbid") ||
    normalized.includes("fail") ||
    normalized.includes("error")
  ) {
    return "red";
  }
  return "default";
};

export const formatJVMAuditResultLabel = (value?: string | null): string => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return "未知";
  }
  if (normalized === "applied") {
    return "已执行";
  }
  if (
    normalized.includes("success") ||
    normalized.includes("ok") ||
    normalized.includes("done")
  ) {
    return "成功";
  }
  if (normalized.includes("warn")) {
    return "警告";
  }
  if (
    normalized.includes("block") ||
    normalized.includes("deny") ||
    normalized.includes("forbid")
  ) {
    return "已阻断";
  }
  if (normalized.includes("fail") || normalized.includes("error")) {
    return "失败";
  }
  return normalizeText(value);
};

export const JVM_SENSITIVE_VALUE_MASK = "********";
export const JVM_DEFAULT_PAYLOAD_TEMPLATE = "{\n  \n}";

const formatRawJVMValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const formatJVMValueForDisplay = (
  snapshot?: JVMValueSnapshot | null,
): string => {
  if (snapshot?.sensitive) {
    return JVM_SENSITIVE_VALUE_MASK;
  }
  return formatRawJVMValue(snapshot?.value);
};

export const formatJVMMetadataForDisplay = (
  snapshot?: Pick<JVMValueSnapshot, "metadata" | "sensitive"> | null,
): string => {
  if (!snapshot?.metadata || Object.keys(snapshot.metadata).length === 0) {
    return "";
  }
  if (snapshot.sensitive) {
    return JVM_SENSITIVE_VALUE_MASK;
  }
  return formatRawJVMValue(snapshot.metadata);
};

export const buildJVMActionPayloadTemplate = (
  definition?: JVMActionDefinition | null,
  sensitive = false,
): string => {
  if (sensitive || !definition?.payloadExample) {
    return JVM_DEFAULT_PAYLOAD_TEMPLATE;
  }
  try {
    return JSON.stringify(definition.payloadExample, null, 2);
  } catch {
    return JVM_DEFAULT_PAYLOAD_TEMPLATE;
  }
};

export const buildJVMPreviewApplyRequest = (
  previewRequest: JVMChangeRequest,
  preview: JVMChangePreview,
): JVMChangeRequest => {
  const confirmationToken = String(preview.confirmationToken || "").trim();
  if (preview.requiresConfirmation && !confirmationToken) {
    throw new Error("确认令牌缺失，请重新预览后再执行");
  }
  return {
    ...previewRequest,
    confirmationToken: confirmationToken || undefined,
  };
};

export const resolveJVMValueEditorLanguage = (
  format: string,
  value: unknown,
): string => {
  const normalizedFormat = normalizeText(format).toLowerCase();
  if (
    ["json", "array", "object", "number", "boolean", "null"].includes(
      normalizedFormat,
    )
  ) {
    return "json";
  }
  if (normalizedFormat === "sql") {
    return "sql";
  }
  if (normalizedFormat === "xml") {
    return "xml";
  }
  if (normalizedFormat === "yaml" || normalizedFormat === "yml") {
    return "yaml";
  }
  if (typeof value === "string") {
    return looksLikeStructuredJSONText(value) ? "json" : "plaintext";
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    return "json";
  }
  if (value && typeof value === "object") {
    return "json";
  }
  return "plaintext";
};

export const estimateJVMResourceEditorHeight = (value: unknown): number => {
  const text = String(value ?? "");
  const lineCount = Math.max(1, text.split(/\r?\n/).length);
  return Math.min(420, Math.max(180, lineCount * 22 + 24));
};

export type { JVMActionDisplay };
