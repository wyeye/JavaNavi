import { GlobalProxyConfig } from '../types';

const toTrimmedString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
};

const normalizeProxyType = (value: unknown): 'socks5' | 'http' => {
  return toTrimmedString(value).toLowerCase() === 'http' ? 'http' : 'socks5';
};

const normalizePort = (value: unknown, fallbackPort: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackPort;
  }
  const port = Math.trunc(parsed);
  if (port <= 0 || port > 65535) {
    return fallbackPort;
  }
  return port;
};

export function createGlobalProxyDraft(value: Partial<GlobalProxyConfig> = {}): GlobalProxyConfig {
  const type = normalizeProxyType(value.type);
  return {
    enabled: value.enabled === true,
    type,
    host: toTrimmedString(value.host),
    port: normalizePort(value.port, type === 'http' ? 8080 : 1080),
    user: toTrimmedString(value.user),
    password: '',
    hasPassword: value.hasPassword === true,
    secretRef: toTrimmedString(value.secretRef) || undefined,
  };
}

export function toPersistedGlobalProxy(value: Partial<GlobalProxyConfig> = {}): Omit<GlobalProxyConfig, 'password'> {
  const draft = createGlobalProxyDraft(value);
  return {
    enabled: draft.enabled,
    type: draft.type,
    host: draft.host,
    port: draft.port,
    user: draft.user,
    hasPassword: draft.hasPassword,
    secretRef: draft.secretRef,
  };
}

export function toSaveGlobalProxyInput(value: Partial<GlobalProxyConfig> = {}): GlobalProxyConfig {
  const draft = createGlobalProxyDraft(value);
  return {
    ...draft,
    password: typeof value.password === 'string' ? value.password : '',
  };
}
