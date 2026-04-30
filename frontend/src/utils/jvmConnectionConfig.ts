import type { ConnectionConfig } from "../types";

const DEFAULT_JMX_PORT = 9010;
const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_DIAGNOSTIC_TIMEOUT_SECONDS = 15;
const DEFAULT_ENVIRONMENT = "dev";
const JVM_MODES = ["jmx", "endpoint", "agent"] as const;
export const JVM_EDITABLE_MODES = ["jmx", "endpoint", "agent"] as const;
const JVM_DIAGNOSTIC_TRANSPORTS = ["agent-bridge", "arthas-tunnel"] as const;

type JVMMode = (typeof JVM_MODES)[number];
type JVMEditableMode = (typeof JVM_EDITABLE_MODES)[number];
type JVMDiagnosticTransport = (typeof JVM_DIAGNOSTIC_TRANSPORTS)[number];
type JVMEnvironment = "dev" | "uat" | "prod";
type JVMConnectionFormValues = Record<string, unknown>;

const isJVMMode = (value: string): value is JVMMode =>
  JVM_MODES.includes(value as JVMMode);
const isJVMEditableMode = (value: string): value is JVMEditableMode =>
  JVM_EDITABLE_MODES.includes(value as JVMEditableMode);
const isJVMDiagnosticTransport = (
  value: string,
): value is JVMDiagnosticTransport =>
  JVM_DIAGNOSTIC_TRANSPORTS.includes(value as JVMDiagnosticTransport);

const toStringValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
};

const toInteger = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const intValue = Math.trunc(parsed);
  return intValue > 0 ? intValue : fallback;
};

const normalizeModes = (value: unknown): JVMMode[] => {
  if (!Array.isArray(value)) {
    return ["jmx"];
  }

  const result: JVMMode[] = [];
  const seen = new Set<JVMMode>();
  for (const item of value) {
    const mode = toStringValue(item).toLowerCase();
    if (!isJVMMode(mode) || seen.has(mode)) {
      continue;
    }
    seen.add(mode);
    result.push(mode);
  }
  return result.length > 0 ? result : ["jmx"];
};

export const normalizeEditableJVMModes = (
  value: unknown,
): JVMEditableMode[] => {
  if (!Array.isArray(value)) {
    return ["jmx"];
  }

  const result: JVMEditableMode[] = [];
  const seen = new Set<JVMEditableMode>();
  for (const item of value) {
    const mode = toStringValue(item).toLowerCase();
    if (!isJVMEditableMode(mode) || seen.has(mode)) {
      continue;
    }
    seen.add(mode);
    result.push(mode);
  }
  return result.length > 0 ? result : ["jmx"];
};

export const hasUnsupportedJVMEditableModes = ({
  allowedModes,
  preferredMode,
}: {
  allowedModes: unknown;
  preferredMode: unknown;
}): boolean => {
  const allowed = Array.isArray(allowedModes)
    ? allowedModes
        .map((item) => toStringValue(item).toLowerCase())
        .filter((item) => item !== "")
    : [];
  const preferred = toStringValue(preferredMode).toLowerCase();

  return (
    allowed.some((mode) => !isJVMEditableMode(mode)) ||
    (preferred !== "" && !isJVMEditableMode(preferred))
  );
};

export const hasUnsupportedJVMDiagnosticTransport = (
  value: unknown,
): boolean => {
  const transport = toStringValue(value).toLowerCase();
  return transport !== "" && !isJVMDiagnosticTransport(transport);
};

export const resolveEditableJVMModeSelection = ({
  allowedModes,
  preferredMode,
}: {
  allowedModes: unknown;
  preferredMode: unknown;
}): { allowedModes: string[]; preferredMode: string } => {
  const normalizedAllowedModes = Array.isArray(allowedModes)
    ? allowedModes
        .map((item) => toStringValue(item).toLowerCase())
        .filter((item) => item !== "")
    : [];
  const normalizedPreferredMode = toStringValue(preferredMode).toLowerCase();
  const resolvedAllowedModes =
    normalizedAllowedModes.length > 0
      ? Array.from(new Set(normalizedAllowedModes))
      : normalizedPreferredMode
        ? [normalizedPreferredMode]
        : ["jmx"];

  return {
    allowedModes: resolvedAllowedModes,
    preferredMode: normalizedPreferredMode || resolvedAllowedModes[0],
  };
};

const normalizePreferredMode = (
  value: unknown,
  allowedModes: JVMMode[],
): JVMMode => {
  const preferred = toStringValue(value).toLowerCase();
  if (isJVMMode(preferred) && allowedModes.includes(preferred)) {
    return preferred;
  }
  return allowedModes[0];
};

const normalizeEnvironment = (value: unknown): JVMEnvironment => {
  const env = toStringValue(value).toLowerCase();
  if (env === "uat" || env === "prod") {
    return env;
  }
  return DEFAULT_ENVIRONMENT;
};

const normalizeReadOnly = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  return true;
};

const normalizeDiagnosticTransport = (
  value: unknown,
): JVMDiagnosticTransport => {
  const transport = toStringValue(value).toLowerCase();
  if (isJVMDiagnosticTransport(transport)) {
    return transport;
  }
  return "agent-bridge";
};

export const buildDefaultJVMConnectionValues = () => ({
  type: "jvm",
  host: "localhost",
  port: DEFAULT_JMX_PORT,
  jvmReadOnly: true,
  jvmAllowedModes: ["jmx"],
  jvmPreferredMode: "jmx",
  jvmEnvironment: DEFAULT_ENVIRONMENT,
  jvmEndpointEnabled: false,
  jvmEndpointBaseUrl: "",
  jvmEndpointApiKey: "",
  jvmAgentEnabled: false,
  jvmAgentBaseUrl: "",
  jvmAgentApiKey: "",
  jvmDiagnosticEnabled: false,
  jvmDiagnosticTransport: "agent-bridge",
  jvmDiagnosticBaseUrl: "",
  jvmDiagnosticTargetId: "",
  jvmDiagnosticApiKey: "",
  jvmDiagnosticAllowObserveCommands: true,
  jvmDiagnosticAllowTraceCommands: false,
  jvmDiagnosticAllowMutatingCommands: false,
  jvmDiagnosticTimeoutSeconds: DEFAULT_DIAGNOSTIC_TIMEOUT_SECONDS,
});

export const buildJVMConnectionConfig = (
  values: JVMConnectionFormValues,
): ConnectionConfig => {
  const allowedModes = normalizeModes(values.jvmAllowedModes);
  const preferredMode = normalizePreferredMode(
    values.jvmPreferredMode,
    allowedModes,
  );
  const port = toInteger(values.port, DEFAULT_JMX_PORT);
  const timeout =
    values.timeout === undefined ||
    values.timeout === null ||
    values.timeout === ""
      ? toInteger(values.jvmEndpointTimeoutSeconds, DEFAULT_TIMEOUT_SECONDS)
      : toInteger(values.timeout, DEFAULT_TIMEOUT_SECONDS);
  const diagnosticTimeout = toInteger(
    values.jvmDiagnosticTimeoutSeconds,
    DEFAULT_DIAGNOSTIC_TIMEOUT_SECONDS,
  );

  return {
    type: "jvm",
    host: toStringValue(values.host),
    port,
    user: "",
    password: "",
    timeout,
    jvm: {
      environment: normalizeEnvironment(values.jvmEnvironment),
      readOnly: normalizeReadOnly(values.jvmReadOnly),
      allowedModes,
      preferredMode,
      jmx: {
        enabled: allowedModes.includes("jmx"),
        host: toStringValue(values.jvmJmxHost) || toStringValue(values.host),
        port: toInteger(values.jvmJmxPort, port),
        username: toStringValue(values.jvmJmxUsername),
        password: toStringValue(values.jvmJmxPassword),
      },
      endpoint: {
        enabled: values.jvmEndpointEnabled === true,
        baseUrl: toStringValue(values.jvmEndpointBaseUrl),
        apiKey: toStringValue(values.jvmEndpointApiKey),
        timeoutSeconds: timeout,
      },
      agent: {
        enabled: values.jvmAgentEnabled === true,
        baseUrl: toStringValue(values.jvmAgentBaseUrl),
        apiKey: toStringValue(values.jvmAgentApiKey),
        timeoutSeconds: timeout,
      },
      diagnostic: {
        enabled: values.jvmDiagnosticEnabled === true,
        transport: normalizeDiagnosticTransport(values.jvmDiagnosticTransport),
        baseUrl: toStringValue(values.jvmDiagnosticBaseUrl),
        targetId: toStringValue(values.jvmDiagnosticTargetId),
        apiKey: toStringValue(values.jvmDiagnosticApiKey),
        allowObserveCommands: values.jvmDiagnosticAllowObserveCommands !== false,
        allowTraceCommands: values.jvmDiagnosticAllowTraceCommands === true,
        allowMutatingCommands:
          values.jvmDiagnosticAllowMutatingCommands === true,
        timeoutSeconds: diagnosticTimeout,
      },
    },
  };
};
