import { connection } from '@compat/models';

export type RpcConnectionConfig = connection.ConnectionConfig & { id?: string };
type ConnectionConfigInput = {
  id?: string;
  ssh?: Record<string, any>;
  proxy?: Record<string, any>;
  httpTunnel?: Record<string, any>;
  [key: string]: any;
};
type SSHConfigInput = Record<string, any>;
type ProxyConfigInput = Record<string, any>;
type HttpTunnelConfigInput = Record<string, any>;

const isInternalOptionKey = (key: string): boolean => {
  const normalized = key.replace(/[-_\s]/g, '').toLowerCase();
  return normalized.startsWith('customdatasource') || normalized.startsWith('javanavi');
};

const toStringValue = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
};

const normalizeDriverOptions = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const options = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, optionValue]) => [toStringValue(key).trim(), toStringValue(optionValue).trim()])
      .filter(([key, optionValue]) => key && optionValue && !isInternalOptionKey(key)),
  );
  return Object.keys(options).length > 0 ? options : undefined;
};

const toOptionalStringValue = (value: unknown): string | undefined => {
  const text = toStringValue(value).trim();
  return text ? text : undefined;
};

const toOptionalInteger = (value: unknown, fallback?: number): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.trunc(parsed);
};

const normalizeProxyType = (value: unknown): 'socks5' | 'http' => {
  return toStringValue(value).toLowerCase() === 'http' ? 'http' : 'socks5';
};

const normalizeSSHConfig = (value: unknown): connection.SSHConfig => {
  const raw = (value ?? {}) as SSHConfigInput;
  return new connection.SSHConfig({
    host: toStringValue(raw.host),
    port: toOptionalInteger(raw.port, 22) ?? 22,
    user: toStringValue(raw.user),
    password: toStringValue(raw.password),
    keyPath: toStringValue(raw.keyPath),
  });
};

const normalizeProxyConfig = (value: unknown): connection.ProxyConfig => {
  const raw = (value ?? {}) as ProxyConfigInput;
  const type = normalizeProxyType(raw.type);
  return new connection.ProxyConfig({
    type,
    host: toStringValue(raw.host),
    port: toOptionalInteger(raw.port, type === 'http' ? 8080 : 1080) ?? (type === 'http' ? 8080 : 1080),
    user: toStringValue(raw.user),
    password: toStringValue(raw.password),
  });
};

const normalizeHttpTunnelConfig = (value: unknown): connection.HTTPTunnelConfig => {
  const raw = (value ?? {}) as HttpTunnelConfigInput;
  return new connection.HTTPTunnelConfig({
    host: toStringValue(raw.host),
    port: toOptionalInteger(raw.port, 8080) ?? 8080,
    user: toStringValue(raw.user),
    password: toStringValue(raw.password),
  });
};

export function buildRpcConnectionConfig(
  config: ConnectionConfigInput,
  overrides: ConnectionConfigInput = {},
): RpcConnectionConfig {
  const mergedSSH = {
    ...(config.ssh ?? {}),
    ...(overrides.ssh ?? {}),
  };
  const mergedProxy = {
    ...(config.proxy ?? {}),
    ...(overrides.proxy ?? {}),
  };
  const mergedHttpTunnel = {
    ...(config.httpTunnel ?? {}),
    ...(overrides.httpTunnel ?? {}),
  };
  const merged: ConnectionConfigInput = {
    ...config,
    ...overrides,
    ssh: mergedSSH,
    proxy: mergedProxy,
    httpTunnel: mergedHttpTunnel,
  };
  const baseId = toStringValue(config.id).trim() || toStringValue(overrides.id).trim() || undefined;
  const timeout = toOptionalInteger(merged.timeout, toOptionalInteger(config.timeout));
  const redisDB = toOptionalInteger(merged.redisDB, toOptionalInteger(config.redisDB));

  const rpcConfig = new connection.ConnectionConfig({
    ...merged,
    type: toStringValue(merged.type),
    host: toStringValue(merged.host),
    port: toOptionalInteger(merged.port, toOptionalInteger(config.port, 0)) ?? 0,
    user: toStringValue(merged.user),
    password: toStringValue(merged.password),
    database: toStringValue(merged.database),
    useSSL: merged.useSSL === true,
    sslMode: toOptionalStringValue(merged.sslMode),
    useSSH: merged.useSSH === true,
    ssh: normalizeSSHConfig(merged.ssh),
    useProxy: merged.useProxy === true,
    proxy: normalizeProxyConfig(merged.proxy),
    useHttpTunnel: merged.useHttpTunnel === true,
    httpTunnel: normalizeHttpTunnelConfig(merged.httpTunnel),
    driver: toOptionalStringValue(merged.driver),
    dsn: toOptionalStringValue(merged.dsn),
    options: normalizeDriverOptions(merged.options),
    timeout,
    redisDB,
    uri: toOptionalStringValue(merged.uri),
    hosts: Array.isArray(merged.hosts) ? merged.hosts : undefined,
    topology: toOptionalStringValue(merged.topology),
    replicaSet: toOptionalStringValue(merged.replicaSet ?? merged.mongoReplicaSet),
    authSource: toOptionalStringValue(merged.authSource),
    readPreference: toOptionalStringValue(merged.readPreference),
    mongoSrv: merged.mongoSrv === true || merged.mongoSRV === true,
    mongoAuthMechanism: toOptionalStringValue(merged.mongoAuthMechanism),
    mongoReplicaUser: toOptionalStringValue(merged.mongoReplicaUser),
    mongoReplicaPassword: toOptionalStringValue(merged.mongoReplicaPassword),
  }) as RpcConnectionConfig;

  rpcConfig.id = baseId;
  return rpcConfig;
}
