export type JVMRuntimeMode = 'jmx' | 'endpoint' | 'agent';
export type JVMTabKind = 'overview' | 'resource' | 'audit' | 'diagnostic' | 'monitoring';

export type JVMModeMeta = {
  mode: string;
  label: string;
  color: string;
  backgroundColor: string;
};

export const JVM_RUNTIME_MODES: JVMRuntimeMode[] = ['jmx', 'endpoint', 'agent'];

const JVM_MODE_META_MAP: Record<JVMRuntimeMode, JVMModeMeta> = {
  jmx: {
    mode: 'jmx',
    label: 'JMX',
    color: '#1D39C4',
    backgroundColor: 'rgba(29, 57, 196, 0.12)',
  },
  endpoint: {
    mode: 'endpoint',
    label: 'Endpoint',
    color: '#1677FF',
    backgroundColor: 'rgba(22, 119, 255, 0.12)',
  },
  agent: {
    mode: 'agent',
    label: 'Agent',
    color: '#FA8C16',
    backgroundColor: 'rgba(250, 140, 22, 0.12)',
  },
};

const JVM_TAB_KIND_LABELS: Record<JVMTabKind, string> = {
  overview: 'JVM 概览',
  resource: 'JVM 资源',
  audit: 'JVM 审计',
  diagnostic: 'JVM 诊断',
  monitoring: 'JVM 监控',
};

const normalizeMode = (mode: string): string => String(mode || '').trim().toLowerCase();

const toTitleCase = (value: string): string => {
  if (!value) {
    return 'Unknown';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const resolveJVMModeMeta = (mode: string): JVMModeMeta => {
  const normalizedMode = normalizeMode(mode);
  if (normalizedMode in JVM_MODE_META_MAP) {
    return JVM_MODE_META_MAP[normalizedMode as JVMRuntimeMode];
  }

  return {
    mode: normalizedMode || 'unknown',
    label: toTitleCase(normalizedMode || 'unknown'),
    color: '#8C8C8C',
    backgroundColor: 'rgba(140, 140, 140, 0.12)',
  };
};

export const buildJVMTabTitle = (
  connectionName: string,
  tabKind: JVMTabKind,
  mode: string,
): string => {
  const trimmedConnectionName = String(connectionName || '').trim();
  const tabLabel = JVM_TAB_KIND_LABELS[tabKind] || 'JVM';
  const modeLabel = resolveJVMModeMeta(mode).label;
  const prefix = trimmedConnectionName ? `[${trimmedConnectionName}] ` : '';

  return `${prefix}${tabLabel} · ${modeLabel}`;
};
