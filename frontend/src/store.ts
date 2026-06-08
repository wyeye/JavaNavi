import * as AIService from '@compat/aiService';
import { ClearSqlLogs, DeleteSavedQuery, SaveConnectionTags, SaveSavedQueries, SaveSavedQuery, SaveSqlLog, SaveSqlLogs } from '@compat/javanaviApp';
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ConnectionConfig,
  ProxyConfig,
  SavedConnection,
  TabData,
  SavedQuery,
  ConnectionTag,
  AIChatMessage,
  AIContextItem,
} from "./types";
import {
  ShortcutAction,
  ShortcutBinding,
  ShortcutOptions,
  DEFAULT_SHORTCUT_OPTIONS,
  cloneShortcutOptions,
  sanitizeShortcutOptions,
} from "./utils/shortcuts";
import {
  DEFAULT_DATA_GRID_DISPLAY_SETTINGS,
  sanitizeDataGridDisplaySettings,
  type DataGridDisplaySettings,
} from "./utils/dataGridDisplay";
import { DEFAULT_LANGUAGE, sanitizeLanguage, setRuntimeLanguage, type AppLanguage } from "./i18n";
import { resolveEffectiveSSLMode } from "./utils/sslMode";

export interface AppearanceSettings extends DataGridDisplaySettings {
  enabled: boolean;
  opacity: number;
  blur: number;
  useNativeMacWindowControls: boolean;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  enabled: true,
  opacity: 1.0,
  blur: 0,
  useNativeMacWindowControls: false,
  ...DEFAULT_DATA_GRID_DISPLAY_SETTINGS,
};
const DEFAULT_UI_SCALE = 1.0;
const MIN_UI_SCALE = 0.8;
const MAX_UI_SCALE = 1.25;
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;
const DEFAULT_STARTUP_FULLSCREEN = false;
const LEGACY_DEFAULT_OPACITY = 0.95;
const OPACITY_EPSILON = 1e-6;
const MAX_URI_LENGTH = 4096;
const MAX_HOST_ENTRY_LENGTH = 512;
const MAX_HOST_ENTRIES = 64;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 3600;
const PERSIST_VERSION = 9;
const PERSIST_STORAGE_KEY = "lite-db-storage";
const MAX_SQL_LOGS = 1000;
const DEFAULT_CONNECTION_TYPE = "mysql";
const SUPPORTED_CONNECTION_TYPES = new Set([
  "mysql",
  "mariadb",
  "doris",
  "diros",
  "sphinx",
  "clickhouse",
  "postgres",
  "redis",
  "tdengine",
  "oracle",
  "dameng",
  "kingbase",
  "sqlserver",
  "mongodb",
  "highgo",
  "vastbase",
  "sqlite",
  "duckdb",
  "custom",
]);
const SSL_SUPPORTED_CONNECTION_TYPES = new Set([
  "mysql",
  "mariadb",
  "diros",
  "sphinx",
  "dameng",
  "clickhouse",
  "postgres",
  "sqlserver",
  "oracle",
  "kingbase",
  "highgo",
  "vastbase",
  "mongodb",
  "redis",
  "tdengine",
]);

const getDefaultPortByType = (type: string): number => {
  switch (type) {
    case "mysql":
    case "mariadb":
      return 3306;
    case "doris":
    case "diros":
      return 9030;
    case "duckdb":
      return 0;
    case "sphinx":
      return 9306;
    case "clickhouse":
      return 9000;
    case "postgres":
    case "vastbase":
      return 5432;
    case "redis":
      return 6379;
    case "tdengine":
      return 6041;
    case "oracle":
      return 1521;
    case "dameng":
      return 5236;
    case "kingbase":
      return 54321;
    case "sqlserver":
      return 1433;
    case "mongodb":
      return 27017;
    case "highgo":
      return 5866;
    default:
      return 3306;
  }
};

const toTrimmedString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return fallback;
};

const toUnknownRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const normalizePort = (value: unknown, fallbackPort: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackPort;
  const port = Math.trunc(parsed);
  if (port <= 0 || port > 65535) return fallbackPort;
  return port;
};

const normalizeIntegerInRange = (
  value: unknown,
  fallbackValue: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const normalized = Math.trunc(parsed);
  if (normalized < min || normalized > max) return fallbackValue;
  return normalized;
};

const normalizeFloatInRange = (
  value: unknown,
  fallbackValue: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  if (parsed < min || parsed > max) return fallbackValue;
  return parsed;
};

const isValidHostEntry = (entry: string): boolean => {
  if (!entry) return false;
  if (entry.length > MAX_HOST_ENTRY_LENGTH) return false;
  if (/[()\\/\s]/.test(entry)) return false;
  return true;
};

const sanitizeStringArray = (value: unknown, maxLength = 256): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  value.forEach((entry) => {
    const normalized = toTrimmedString(entry);
    if (!normalized || normalized.length > maxLength) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

const sanitizeNumberArray = (
  value: unknown,
  min: number,
  max: number,
): number[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  value.forEach((entry) => {
    const parsed = Number(entry);
    if (!Number.isFinite(parsed)) return;
    const num = Math.trunc(parsed);
    if (num < min || num > max) return;
    if (seen.has(num)) return;
    seen.add(num);
    result.push(num);
  });
  return result;
};

const sanitizeAddressList = (value: unknown): string[] => {
  const all = sanitizeStringArray(value, MAX_HOST_ENTRY_LENGTH).filter(
    (entry) => isValidHostEntry(entry),
  );
  return all.slice(0, MAX_HOST_ENTRIES);
};

const sanitizeConnectionIconType = (value: unknown): string | undefined => {
  const iconType = toTrimmedString(value).toLowerCase();
  return iconType || undefined;
};

const sanitizeConnectionIconColor = (value: unknown): string | undefined => {
  const color = toTrimmedString(value);
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)
    ? color
    : undefined;
};

const normalizeConnectionType = (value: unknown): string => {
  const type = toTrimmedString(value).toLowerCase();
  if (type === "doris") {
    return "diros";
  }
  return SUPPORTED_CONNECTION_TYPES.has(type) ? type : DEFAULT_CONNECTION_TYPE;
};

const sanitizeConnectionConfig = (value: unknown): ConnectionConfig => {
  const raw = toUnknownRecord(value);
  const type = normalizeConnectionType(raw.type);
  const defaultPort = getDefaultPortByType(type);
  const savePassword =
    typeof raw.savePassword === "boolean" ? raw.savePassword : true;
  const mongoSrv = !!raw.mongoSrv;
  const sslCapable = SSL_SUPPORTED_CONNECTION_TYPES.has(type);
  const useSSL = sslCapable && raw.useSSL === true;
  const sslMode = resolveEffectiveSSLMode(raw.sslMode, useSSL);

  const sshRaw = toUnknownRecord(raw.ssh);
  const ssh = {
    host: toTrimmedString(sshRaw.host),
    port: normalizePort(sshRaw.port, 22),
    user: toTrimmedString(sshRaw.user),
    password: toTrimmedString(sshRaw.password),
    keyPath: toTrimmedString(sshRaw.keyPath),
  };
  const proxyRaw = toUnknownRecord(raw.proxy);
  const proxyTypeRaw = toTrimmedString(proxyRaw.type, "socks5").toLowerCase();
  const proxyType: "socks5" | "http" =
    proxyTypeRaw === "http" ? "http" : "socks5";
  const proxy = {
    type: proxyType,
    host: toTrimmedString(proxyRaw.host),
    port: normalizePort(proxyRaw.port, proxyTypeRaw === "http" ? 8080 : 1080),
    user: toTrimmedString(proxyRaw.user),
    password: toTrimmedString(proxyRaw.password),
  };
  const supportsNetworkTunnel = type !== "sqlite" && type !== "duckdb";
  const useProxy = supportsNetworkTunnel && !!raw.useProxy;

  const safeConfig: ConnectionConfig & Record<string, unknown> = {
    ...raw,
    id: toTrimmedString(raw.id ?? raw.ID),
    type,
    host: toTrimmedString(raw.host, "localhost") || "localhost",
    port: normalizePort(raw.port, defaultPort),
    user: toTrimmedString(raw.user),
    password: savePassword ? toTrimmedString(raw.password) : "",
    savePassword,
    database: toTrimmedString(raw.database),
    useSSL,
    sslMode: sslCapable ? sslMode : "disable",
    sslCertPath: sslCapable ? toTrimmedString(raw.sslCertPath) : "",
    sslKeyPath: sslCapable ? toTrimmedString(raw.sslKeyPath) : "",
    useSSH: !!raw.useSSH,
    ssh,
    useProxy,
    proxy,
    uri: toTrimmedString(raw.uri).slice(0, MAX_URI_LENGTH),
    hosts: sanitizeAddressList(raw.hosts),
    topology:
      raw.topology === "replica"
        ? "replica"
        : raw.topology === "cluster"
          ? "cluster"
          : "single",
    mysqlReplicaUser: toTrimmedString(raw.mysqlReplicaUser),
    mysqlReplicaPassword: savePassword
      ? toTrimmedString(raw.mysqlReplicaPassword)
      : "",
    replicaSet: toTrimmedString(raw.replicaSet),
    authSource: toTrimmedString(raw.authSource),
    readPreference: toTrimmedString(raw.readPreference),
    mongoSrv,
    mongoAuthMechanism: toTrimmedString(raw.mongoAuthMechanism),
    mongoReplicaUser: toTrimmedString(raw.mongoReplicaUser),
    mongoReplicaPassword: savePassword
      ? toTrimmedString(raw.mongoReplicaPassword)
      : "",
    timeout: normalizeIntegerInRange(
      raw.timeout,
      DEFAULT_TIMEOUT_SECONDS,
      1,
      MAX_TIMEOUT_SECONDS,
    ),
  };

  if (type === "redis") {
    safeConfig.redisDB = normalizeIntegerInRange(raw.redisDB, 0, 0, 15);
  }

  if (type === "custom") {
    safeConfig.driver = toTrimmedString(raw.driver);
    safeConfig.dsn = toTrimmedString(raw.dsn).slice(0, MAX_URI_LENGTH);
    const optionRaw =
      raw.options && typeof raw.options === "object"
        ? (raw.options as Record<string, unknown>)
        : {};
    safeConfig.options = Object.fromEntries(
      Object.entries(optionRaw)
        .map(([key, value]) => [toTrimmedString(key), toTrimmedString(value)])
        .filter(
          ([key, value]) =>
            key && value && key.length <= 128 && value.length <= 4096,
        ),
    );
  }

  return safeConfig;
};

const resolveConnectionConfigPayload = (
  raw: Record<string, unknown>,
): unknown => {
  if (raw.config && typeof raw.config === "object") {
    return raw.config;
  }
  const hasLegacyFlatConfig =
    raw.type !== undefined ||
    raw.host !== undefined ||
    raw.port !== undefined ||
    raw.user !== undefined ||
    raw.database !== undefined;
  if (hasLegacyFlatConfig) {
    return raw;
  }
  return undefined;
};

const sanitizeSavedConnection = (
  value: unknown,
  index: number,
): SavedConnection | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const config = sanitizeConnectionConfig(resolveConnectionConfigPayload(raw));
  const id =
    toTrimmedString(raw.id, `conn-${index + 1}`) || `conn-${index + 1}`;
  const displayType = config.type === "diros" ? "doris" : config.type;
  const fallbackName = config.host
    ? `${displayType}-${config.host}`
    : `Connection-${index + 1}`;
  const name = toTrimmedString(raw.name, fallbackName) || fallbackName;
  const includeDatabases = sanitizeStringArray(raw.includeDatabases, 256);
  const includeRedisDatabases = sanitizeNumberArray(
    raw.includeRedisDatabases,
    0,
    15,
  );

  return {
    id,
    name,
    config: { ...config, id: config.id || id },
    secretRef: toTrimmedString(raw.secretRef) || undefined,
    hasPrimaryPassword: raw.hasPrimaryPassword === true,
    hasSSHPassword: raw.hasSSHPassword === true,
    hasProxyPassword: raw.hasProxyPassword === true,
    hasMySQLReplicaPassword: raw.hasMySQLReplicaPassword === true,
    hasMongoReplicaPassword: raw.hasMongoReplicaPassword === true,
    hasOpaqueURI: raw.hasOpaqueURI === true,
    hasOpaqueDSN: raw.hasOpaqueDSN === true,
    includeDatabases:
      includeDatabases.length > 0 ? includeDatabases : undefined,
    includeRedisDatabases:
      includeRedisDatabases.length > 0 ? includeRedisDatabases : undefined,
    iconType: sanitizeConnectionIconType(raw.iconType),
    iconColor: sanitizeConnectionIconColor(raw.iconColor),
  };
};

const sanitizeConnections = (value: unknown): SavedConnection[] => {
  if (!Array.isArray(value)) return [];
  const result: SavedConnection[] = [];
  const idSet = new Set<string>();

  value.forEach((entry, index) => {
    const conn = sanitizeSavedConnection(entry, index);
    if (!conn) return;
    let nextId = conn.id;
    if (idSet.has(nextId)) {
      nextId = `${nextId}-${index + 1}`;
    }
    idSet.add(nextId);
    result.push({ ...conn, id: nextId });
  });

  return result;
};

const sanitizeConnectionTags = (value: unknown): ConnectionTag[] => {
  if (!Array.isArray(value)) return [];
  const result: ConnectionTag[] = [];
  const idSet = new Set<string>();

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const id =
      toTrimmedString(raw.id, `tag-${index + 1}`) || `tag-${index + 1}`;
    if (idSet.has(id)) return;
    idSet.add(id);

    const name =
      toTrimmedString(raw.name, `Tag-${index + 1}`) || `Tag-${index + 1}`;
    const connectionIds = sanitizeStringArray(raw.connectionIds, 256);

    result.push({ id, name, connectionIds });
  });

  return result;
};

const isLegacyDefaultAppearance = (
  appearance: Partial<{ opacity: number; blur: number }> | undefined,
): boolean => {
  if (!appearance) {
    return true;
  }
  const opacity =
    typeof appearance.opacity === "number"
      ? appearance.opacity
      : LEGACY_DEFAULT_OPACITY;
  const blur = typeof appearance.blur === "number" ? appearance.blur : 0;
  return (
    Math.abs(opacity - LEGACY_DEFAULT_OPACITY) < OPACITY_EPSILON && blur === 0
  );
};

export interface SqlLog {
  id: string;
  timestamp: number;
  sql: string;
  status: "success" | "error";
  duration: number;
  message?: string;
  dbName?: string;
  affectedRows?: number;
}

export interface QueryOptions {
  maxRows: number;
  showColumnComment: boolean;
  showColumnType: boolean;
  autoCommit: boolean;
}

interface AppState {
  connections: SavedConnection[];
  connectionTags: ConnectionTag[];
  tabs: TabData[];
  activeTabId: string | null;
  activeContext: { connectionId: string; dbName: string } | null;
  savedQueries: SavedQuery[];
  theme: "light" | "dark";
  language: AppLanguage;
  appearance: AppearanceSettings;
  uiScale: number;
  fontSize: number;
  startupFullscreen: boolean;
  sqlFormatOptions: { keywordCase: "upper" | "lower" };
  queryOptions: QueryOptions;
  shortcutOptions: ShortcutOptions;
  sqlLogs: SqlLog[];
  tableAccessCount: Record<string, number>;
  tableSortPreference: Record<string, "name" | "frequency">;
  tableColumnOrders: Record<string, string[]>;
  enableColumnOrderMemory: boolean;
  tableHiddenColumns: Record<string, string[]>;
  enableHiddenColumnMemory: boolean;
  tableColumnWidths: Record<string, Record<string, number>>;
  windowBounds: { width: number; height: number; x: number; y: number } | null;
  windowState: "normal" | "fullscreen" | "maximized";
  sidebarWidth: number;

  // AI 运行时与持久化状态
  aiPanelVisible: boolean;
  aiChatHistory: Record<string, AIChatMessage[]>; // sessionId -> messages
  replaceAIChatHistory: (sessionId: string, messages: AIChatMessage[]) => void;
  aiChatSessions: { id: string; title: string; updatedAt: number }[]; // 历史会话列表
  aiActiveSessionId: string | null;
  updateAISessionTitle: (sessionId: string, title: string) => void;

  aiContexts: Record<string, AIContextItem[]>;
  addAIContext: (connectionKey: string, context: AIContextItem) => void;
  removeAIContext: (
    connectionKey: string,
    dbName: string,
    tableName: string,
  ) => void;
  clearAIContexts: (connectionKey: string) => void;


  addConnection: (conn: SavedConnection) => void;
  updateConnection: (conn: SavedConnection) => void;
  removeConnection: (id: string) => void;
  replaceConnections: (connections: SavedConnection[]) => void;

  addConnectionTag: (tag: ConnectionTag) => void;
  updateConnectionTag: (tag: ConnectionTag) => void;
  removeConnectionTag: (id: string) => void;
  replaceConnectionTags: (tags: ConnectionTag[]) => void;
  replaceSavedQueries: (queries: SavedQuery[]) => void;
  moveConnectionToTag: (
    connectionId: string,
    targetTagId: string | null,
  ) => void;
  reorderTags: (tagIds: string[]) => void;

  addTab: (tab: TabData) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToLeft: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  closeTabsByConnection: (connectionId: string) => void;
  closeTabsByDatabase: (connectionId: string, dbName: string) => void;
  moveTab: (sourceId: string, targetId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
  setActiveContext: (
    context: { connectionId: string; dbName: string } | null,
  ) => void;

  saveQuery: (query: SavedQuery) => void;
  deleteQuery: (id: string) => void;

  setTheme: (theme: "light" | "dark") => void;
  setLanguage: (language: AppLanguage) => void;
  setAppearance: (appearance: Partial<AppearanceSettings>) => void;
  setUiScale: (scale: number) => void;
  setFontSize: (size: number) => void;
  setStartupFullscreen: (enabled: boolean) => void;
  setSqlFormatOptions: (options: { keywordCase: "upper" | "lower" }) => void;
  setQueryOptions: (options: Partial<QueryOptions>) => void;
  updateShortcut: (
    action: ShortcutAction,
    binding: Partial<ShortcutBinding>,
  ) => void;
  resetShortcutOptions: () => void;

  addSqlLog: (log: SqlLog) => void;
  clearSqlLogs: () => void;
  replaceSqlLogs: (logs: SqlLog[]) => void;

  recordTableAccess: (
    connectionId: string,
    dbName: string,
    tableName: string,
  ) => void;
  setTableSortPreference: (
    connectionId: string,
    dbName: string,
    sortBy: "name" | "frequency",
  ) => void;
  setTableColumnOrder: (
    connectionId: string,
    dbName: string,
    tableName: string,
    order: string[],
  ) => void;
  setEnableColumnOrderMemory: (enabled: boolean) => void;
  clearTableColumnOrder: (
    connectionId: string,
    dbName: string,
    tableName: string,
  ) => void;

  setTableHiddenColumns: (
    connectionId: string,
    dbName: string,
    tableName: string,
    hiddenColumns: string[],
  ) => void;
  setEnableHiddenColumnMemory: (enabled: boolean) => void;
  clearTableHiddenColumns: (
    connectionId: string,
    dbName: string,
    tableName: string,
  ) => void;
  setTableColumnWidths: (
    connectionId: string,
    dbName: string,
    tableName: string,
    widths: Record<string, number>,
  ) => void;
  clearTableColumnWidths: (
    connectionId: string,
    dbName: string,
    tableName: string,
  ) => void;
  setWindowBounds: (bounds: {
    width: number;
    height: number;
    x: number;
    y: number;
  }) => void;
  setWindowState: (state: "normal" | "fullscreen" | "maximized") => void;
  setSidebarWidth: (width: number) => void;

  // AI actions
  toggleAIPanel: () => void;
  setAIPanelVisible: (visible: boolean) => void;
  addAIChatMessage: (sessionId: string, message: AIChatMessage) => void;
  updateAIChatMessage: (
    sessionId: string,
    messageId: string,
    updates: Partial<AIChatMessage>,
  ) => void;
  deleteAIChatMessage: (sessionId: string, messageId: string) => void;
  truncateAIChatMessages: (sessionId: string, upToMessageId: string) => void;
  clearAIChatHistory: (sessionId: string) => void;
  deleteAISession: (sessionId: string) => void;
  createNewAISession: () => void;
  setAIActiveSessionId: (sessionId: string | null) => void;
}

const sanitizeSavedQueries = (value: unknown): SavedQuery[] => {
  if (!Array.isArray(value)) return [];
  const result: SavedQuery[] = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    const id =
      toTrimmedString(raw.id, `query-${index + 1}`) || `query-${index + 1}`;
    const sql = toTrimmedString(raw.sql);
    const connectionId = toTrimmedString(raw.connectionId);
    const dbName = toTrimmedString(raw.dbName);
    if (!sql || !connectionId || !dbName) return;
    result.push({
      id,
      name:
        toTrimmedString(raw.name, `Query-${index + 1}`) || `Query-${index + 1}`,
      sql,
      connectionId,
      dbName,
      createdAt: Number.isFinite(Number(raw.createdAt))
        ? Number(raw.createdAt)
        : Date.now(),
    });
  });
  return result;
};

const hasLegacyConnectionSecrets = (
  connections: SavedConnection[],
): boolean => {
  return connections.some((connection) => {
    const config = toUnknownRecord(connection?.config);
    const ssh = toUnknownRecord(config.ssh);
    const proxy = toUnknownRecord(config.proxy);

    return (
      toTrimmedString(config.password) !== "" ||
      toTrimmedString(ssh.password) !== "" ||
      toTrimmedString(proxy.password) !== "" ||
      toTrimmedString(config.mysqlReplicaPassword) !== "" ||
      toTrimmedString(config.mongoReplicaPassword) !== "" ||
      toTrimmedString(config.uri) !== "" ||
      toTrimmedString(config.dsn) !== ""
    );
  });
};

const sanitizeTheme = (value: unknown): "light" | "dark" =>
  value === "dark" ? "dark" : "light";

const sanitizeAppLanguage = sanitizeLanguage;

const sanitizeSqlFormatOptions = (
  value: unknown,
): { keywordCase: "upper" | "lower" } => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return { keywordCase: raw.keywordCase === "lower" ? "lower" : "upper" };
};

const sanitizeSqlLogs = (value: unknown): SqlLog[] => {
  if (!Array.isArray(value)) return [];
  const result: SqlLog[] = [];
  value.forEach((entry, index) => {
    const raw = toUnknownRecord(entry);
    const sql = toTrimmedString(raw.sql).slice(0, 200_000);
    if (!sql) return;
    const timestamp = Number(raw.timestamp);
    const duration = Number(raw.duration);
    const status = raw.status === 'error' ? 'error' : 'success';
    const affectedRows = Number(raw.affectedRows);
    result.push({
      id: toTrimmedString(raw.id, `sql-log-${index + 1}`) || `sql-log-${index + 1}`,
      timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
      sql,
      status,
      duration: Number.isFinite(duration) && duration >= 0 ? Math.trunc(duration) : 0,
      message: toTrimmedString(raw.message) || undefined,
      dbName: toTrimmedString(raw.dbName) || undefined,
      affectedRows: Number.isFinite(affectedRows) ? Math.trunc(affectedRows) : undefined,
    });
  });
  return result.slice(0, MAX_SQL_LOGS);
};

const sanitizeQueryOptions = (value: unknown): QueryOptions => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const maxRows = Number(raw.maxRows);
  const showColumnComment =
    typeof raw.showColumnComment === "boolean" ? raw.showColumnComment : true;
  const showColumnType =
    typeof raw.showColumnType === "boolean" ? raw.showColumnType : true;
  const autoCommit = typeof raw.autoCommit === "boolean" ? raw.autoCommit : true;
  if (!Number.isFinite(maxRows) || maxRows <= 0) {
    return { maxRows: 5000, showColumnComment, showColumnType, autoCommit };
  }
  return {
    maxRows: Math.min(50000, Math.trunc(maxRows)),
    showColumnComment,
    showColumnType,
    autoCommit,
  };
};

const sanitizeTableAccessCount = (value: unknown): Record<string, number> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, number> = {};
  Object.entries(raw).forEach(([key, count]) => {
    const parsed = Number(count);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    result[key] = Math.trunc(parsed);
  });
  return result;
};

const sanitizeTableSortPreference = (
  value: unknown,
): Record<string, "name" | "frequency"> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, "name" | "frequency"> = {};
  Object.entries(raw).forEach(([key, preference]) => {
    result[key] = preference === "frequency" ? "frequency" : "name";
  });
  return result;
};

const sanitizeTableColumnOrders = (
  value: unknown,
): Record<string, string[]> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, string[]> = {};
  Object.entries(raw).forEach(([key, orderArray]) => {
    if (Array.isArray(orderArray)) {
      result[key] = orderArray.map((col) => String(col));
    }
  });
  return result;
};

const sanitizeTableHiddenColumns = (
  value: unknown,
): Record<string, string[]> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, string[]> = {};
  Object.entries(raw).forEach(([key, hiddenArray]) => {
    if (Array.isArray(hiddenArray)) {
      result[key] = hiddenArray.map((col) => String(col));
    }
  });
  return result;
};

const sanitizeTableColumnWidths = (
  value: unknown,
): Record<string, Record<string, number>> => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, Record<string, number>> = {};
  Object.entries(raw).forEach(([key, widths]) => {
    if (!widths || typeof widths !== "object" || Array.isArray(widths)) {
      return;
    }
    const safeWidths: Record<string, number> = {};
    Object.entries(widths as Record<string, unknown>).forEach(
      ([columnName, rawWidth]) => {
        const width =
          typeof rawWidth === "number" ? rawWidth : Number(rawWidth);
        if (Number.isFinite(width) && width >= 50 && width <= 5000) {
          safeWidths[String(columnName)] = Math.round(width);
        }
      },
    );
    if (Object.keys(safeWidths).length > 0) {
      result[key] = safeWidths;
    }
  });
  return result;
};

const sanitizeAppearance = (
  appearance: Partial<AppearanceSettings> | undefined,
  version: number,
): AppearanceSettings => {
  if (!appearance || typeof appearance !== "object") {
    return { ...DEFAULT_APPEARANCE };
  }
  const dataGridDisplaySettings = sanitizeDataGridDisplaySettings(appearance);
  const nextAppearance = {
    enabled:
      typeof appearance.enabled === "boolean"
        ? appearance.enabled
        : DEFAULT_APPEARANCE.enabled,
    opacity:
      typeof appearance.opacity === "number"
        ? appearance.opacity
        : DEFAULT_APPEARANCE.opacity,
    blur:
      typeof appearance.blur === "number"
        ? appearance.blur
        : DEFAULT_APPEARANCE.blur,
    useNativeMacWindowControls:
      typeof appearance.useNativeMacWindowControls === "boolean"
        ? appearance.useNativeMacWindowControls
        : DEFAULT_APPEARANCE.useNativeMacWindowControls,
    showDataTableVerticalBorders:
      dataGridDisplaySettings.showDataTableVerticalBorders,
    dataTableColumnWidthMode: dataGridDisplaySettings.dataTableColumnWidthMode,
  };
  if (version < 2 && isLegacyDefaultAppearance(appearance)) {
    return { ...DEFAULT_APPEARANCE };
  }
  return nextAppearance;
};

const sanitizeStartupFullscreen = (value: unknown): boolean => {
  return value === true;
};

const sanitizeUiScale = (value: unknown): number => {
  return normalizeFloatInRange(
    value,
    DEFAULT_UI_SCALE,
    MIN_UI_SCALE,
    MAX_UI_SCALE,
  );
};

const sanitizeFontSize = (value: unknown): number => {
  return normalizeIntegerInRange(
    value,
    DEFAULT_FONT_SIZE,
    MIN_FONT_SIZE,
    MAX_FONT_SIZE,
  );
};

const sanitizeWindowState = (
  value: unknown,
): "normal" | "fullscreen" | "maximized" => {
  if (value === "fullscreen" || value === "maximized") return value;
  return "normal";
};

const sanitizeSidebarWidth = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 330;
  return Math.max(200, Math.min(600, Math.trunc(parsed)));
};

const sanitizeWindowBounds = (
  value: unknown,
): { width: number; height: number; x: number; y: number } | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const width = Number(raw.width);
  const height = Number(raw.height);
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return null;
  if (width < 400 || height < 300) return null;
  return {
    width: Math.trunc(width),
    height: Math.trunc(height),
    x: Math.trunc(x),
    y: Math.trunc(y),
  };
};

const unwrapPersistedAppState = (
  persistedState: unknown,
): Record<string, unknown> => {
  if (!persistedState || typeof persistedState !== "object") {
    return {};
  }
  const raw = persistedState as Record<string, unknown>;
  if (raw.state && typeof raw.state === "object") {
    return raw.state as Record<string, unknown>;
  }
  return raw;
};

let shortcutOptionsExplicitlySet = false;
let connectionTagsHydratingFromBackend = false;
let connectionTagsPersistTimer: ReturnType<typeof setTimeout> | null = null;
let savedQueriesHydratingFromBackend = false;
let sqlLogsHydratingFromBackend = false;
let sqlLogsPersistTimer: ReturnType<typeof setTimeout> | null = null;

const readPersistedShortcutOptions = (): ShortcutOptions | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const payload = localStorage.getItem(PERSIST_STORAGE_KEY);
    if (!payload) {
      return null;
    }
    const state = unwrapPersistedAppState(JSON.parse(payload));
    if (state.shortcutOptions === undefined) {
      return null;
    }
    return sanitizeShortcutOptions(state.shortcutOptions);
  } catch {
    return null;
  }
};

const resolveShortcutOptionsForPersistence = (
  shortcutOptions: ShortcutOptions,
): ShortcutOptions => {
  const safeOptions = sanitizeShortcutOptions(shortcutOptions);
  if (shortcutOptionsExplicitlySet) {
    return safeOptions;
  }
  return readPersistedShortcutOptions() ?? safeOptions;
};

const runWithExplicitShortcutPersistence = (callback: () => void): void => {
  shortcutOptionsExplicitlySet = true;
  try {
    callback();
  } finally {
    shortcutOptionsExplicitlySet = false;
  }
};

const persistConnectionTagsToBackend = (tags: ConnectionTag[]): void => {
  if (connectionTagsHydratingFromBackend) {
    return;
  }
  const safeTags = sanitizeConnectionTags(tags);
  if (connectionTagsPersistTimer) {
    clearTimeout(connectionTagsPersistTimer);
  }
  connectionTagsPersistTimer = setTimeout(() => {
    connectionTagsPersistTimer = null;
    SaveConnectionTags(safeTags).catch((error: unknown) => {
      console.error("[Connection Tags Persist] save failed:", error);
    });
  }, 250);
};

export const replaceConnectionTagsFromBackend = (tags: ConnectionTag[]): void => {
  connectionTagsHydratingFromBackend = true;
  try {
    useStore.getState().replaceConnectionTags(tags);
  } finally {
    connectionTagsHydratingFromBackend = false;
  }
};

const persistSavedQueryToBackend = (query: SavedQuery): void => {
  if (savedQueriesHydratingFromBackend) {
    return;
  }
  const safeQuery = sanitizeSavedQueries([query])[0];
  if (!safeQuery) {
    return;
  }
  SaveSavedQuery(safeQuery).catch((error: unknown) => {
    console.error("[Saved Query Persist] save failed:", error);
  });
};

const deleteSavedQueryFromBackend = (id: string): void => {
  if (savedQueriesHydratingFromBackend) {
    return;
  }
  const queryId = toTrimmedString(id);
  if (!queryId) {
    return;
  }
  DeleteSavedQuery(queryId).catch((error: unknown) => {
    console.error("[Saved Query Persist] delete failed:", error);
  });
};

export const replaceSavedQueriesFromBackend = (queries: SavedQuery[]): void => {
  savedQueriesHydratingFromBackend = true;
  try {
    useStore.getState().replaceSavedQueries(queries);
  } finally {
    savedQueriesHydratingFromBackend = false;
  }
};

const persistSqlLogToBackend = (log: SqlLog): void => {
  if (sqlLogsHydratingFromBackend) {
    return;
  }
  const safeLog = sanitizeSqlLogs([log])[0];
  if (!safeLog) {
    return;
  }
  SaveSqlLog(safeLog).catch((error: unknown) => {
    console.error("[SQL Log Persist] save failed:", error);
  });
};

const persistSqlLogsToBackend = (logs: SqlLog[]): void => {
  if (sqlLogsHydratingFromBackend) {
    return;
  }
  const safeLogs = sanitizeSqlLogs(logs);
  if (sqlLogsPersistTimer) {
    clearTimeout(sqlLogsPersistTimer);
  }
  sqlLogsPersistTimer = setTimeout(() => {
    sqlLogsPersistTimer = null;
    SaveSqlLogs(safeLogs).catch((error: unknown) => {
      console.error("[SQL Log Persist] save failed:", error);
    });
  }, 250);
};

const clearSqlLogsFromBackend = (): void => {
  if (sqlLogsHydratingFromBackend) {
    return;
  }
  if (sqlLogsPersistTimer) {
    clearTimeout(sqlLogsPersistTimer);
    sqlLogsPersistTimer = null;
  }
  ClearSqlLogs().catch((error: unknown) => {
    console.error("[SQL Log Persist] clear failed:", error);
  });
};

export const replaceSqlLogsFromBackend = (logs: SqlLog[]): void => {
  sqlLogsHydratingFromBackend = true;
  try {
    useStore.getState().replaceSqlLogs(logs);
  } finally {
    sqlLogsHydratingFromBackend = false;
  }
};

// --- AI 会话文件持久化辅助函数 ---

/** 每个 session 独立防抖定时器（2秒） */
const _persistTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function _debouncedPersistSession(sessionId: string) {
  if (_persistTimers[sessionId]) clearTimeout(_persistTimers[sessionId]);
  _persistTimers[sessionId] = setTimeout(() => {
    delete _persistTimers[sessionId];
    const state = useStore.getState();
    const messages = state.aiChatHistory[sessionId];
    const sessionMeta = state.aiChatSessions.find((s) => s.id === sessionId);
    if (!messages && !sessionMeta) return; // session 已被删除，跳过
    const title = sessionMeta?.title || "New chat";
    const updatedAt = sessionMeta?.updatedAt || Date.now();
    const messagesJSON = JSON.stringify(messages || []);
    const Service = AIService;
    Service?.AISaveSession?.(sessionId, title, updatedAt, messagesJSON).catch(
      (e: unknown) => {
        console.error("[AI Session Persist] persist failed:", sessionId, e);
      },
    );
  }, 2000);
}

/** 从后端加载会话列表（仅元数据，不含消息体） */
export async function loadAISessionsFromBackend(): Promise<
  { id: string; title: string; updatedAt: number }[]
> {
  const Service = AIService;
  if (!Service?.AIGetSessions) return [];
  try {
    const sessions = await Service.AIGetSessions();
    if (Array.isArray(sessions)) {
      useStore.setState({ aiChatSessions: sessions });
      return sessions;
    }
  } catch (e) {
    console.error("[AI Session] load session list failed:", e);
  }
  return [];
}

/** 从后端加载指定会话的消息数据到内存 */
export async function loadAISessionFromBackend(
  sessionId: string,
): Promise<boolean> {
  const state = useStore.getState();
  // 如果内存中已有消息，跳过重复加载
  if (state.aiChatHistory[sessionId]?.length > 0) return true;

  const Service = AIService;
  if (!Service?.AILoadSession) return false;
  try {
    const result = await Service.AILoadSession(sessionId);
    if (result?.success) {
      let messages = result.messages;
      // messages 可能是 JSON string 或已解析的数组
      if (typeof messages === "string") {
        try {
          messages = JSON.parse(messages);
        } catch {
          messages = [];
        }
      }
      if (Array.isArray(messages)) {
        useStore.setState((prev) => ({
          aiChatHistory: { ...prev.aiChatHistory, [sessionId]: messages },
        }));
        return true;
      }
    }
  } catch (e) {
    console.error("[AI Session] load session messages failed:", sessionId, e);
  }
  return false;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      connections: [],
      connectionTags: [],
      tabs: [],
      activeTabId: null,
      activeContext: null,
      savedQueries: [],
      theme: "light",
      language: DEFAULT_LANGUAGE,
      appearance: { ...DEFAULT_APPEARANCE },
      uiScale: DEFAULT_UI_SCALE,
      fontSize: DEFAULT_FONT_SIZE,
      startupFullscreen: DEFAULT_STARTUP_FULLSCREEN,
      sqlFormatOptions: { keywordCase: "upper" },
      queryOptions: {
        maxRows: 5000,
        showColumnComment: true,
        showColumnType: true,
        autoCommit: true,
      },
      shortcutOptions: cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS),
      sqlLogs: [],
      tableAccessCount: {},
      tableSortPreference: {},
      tableColumnOrders: {},
      enableColumnOrderMemory: true,
      tableHiddenColumns: {},
      enableHiddenColumnMemory: true,
      tableColumnWidths: {},
      windowBounds: null,
      windowState: "normal" as const,
      sidebarWidth: 330,

      // AI 运行状态
      aiPanelVisible: false,
      aiChatHistory: {},
      aiChatSessions: [],
      aiActiveSessionId: null,
      aiContexts: {},

      addConnection: (conn) =>
        set((state) => ({ connections: [...state.connections, conn] })),
      updateConnection: (conn) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === conn.id ? conn : c,
          ),
        })),
      removeConnection: (id) =>
        set((state) => {
          const connectionTags = state.connectionTags.map((tag) => ({
            ...tag,
            connectionIds: tag.connectionIds.filter((cid) => cid !== id),
          }));
          persistConnectionTagsToBackend(connectionTags);
          return {
            connections: state.connections.filter((c) => c.id !== id),
            connectionTags,
          };
        }),
      replaceConnections: (connections) =>
        set((state) => ({
          connections: sanitizeConnections(connections),
          shortcutOptions: readPersistedShortcutOptions() ?? state.shortcutOptions,
        })),

      addConnectionTag: (tag) =>
        set((state) => {
          const connectionTags = sanitizeConnectionTags([
            ...state.connectionTags,
            tag,
          ]);
          persistConnectionTagsToBackend(connectionTags);
          return { connectionTags };
        }),
      updateConnectionTag: (tag) =>
        set((state) => {
          const connectionTags = sanitizeConnectionTags(
            state.connectionTags.map((t) => (t.id === tag.id ? tag : t)),
          );
          persistConnectionTagsToBackend(connectionTags);
          return { connectionTags };
        }),
      removeConnectionTag: (id) =>
        set((state) => {
          const connectionTags = state.connectionTags.filter((t) => t.id !== id);
          persistConnectionTagsToBackend(connectionTags);
          return { connectionTags };
        }),
      replaceConnectionTags: (tags) =>
        set(() => {
          const connectionTags = sanitizeConnectionTags(tags);
          persistConnectionTagsToBackend(connectionTags);
          return { connectionTags };
        }),
      moveConnectionToTag: (connectionId, targetTagId) =>
        set((state) => {
          const newTags = state.connectionTags.map((tag) => {
            //先从所有tag中移除该connection
            const filteredIds = tag.connectionIds.filter(
              (id) => id !== connectionId,
            );
            if (tag.id === targetTagId) {
              return { ...tag, connectionIds: [...filteredIds, connectionId] };
            }
            return { ...tag, connectionIds: filteredIds };
          });
          const connectionTags = sanitizeConnectionTags(newTags);
          persistConnectionTagsToBackend(connectionTags);
          return { connectionTags };
        }),
      reorderTags: (tagIds) =>
        set((state) => {
          const tagMap = new Map(state.connectionTags.map((t) => [t.id, t]));
          const newTags: ConnectionTag[] = [];
          tagIds.forEach((id) => {
            const tag = tagMap.get(id);
            if (tag) {
              newTags.push(tag);
              tagMap.delete(id);
            }
          });
          // 追加未指定的tag（如果有的话）
          newTags.push(...Array.from(tagMap.values()));
          const connectionTags = sanitizeConnectionTags(newTags);
          persistConnectionTagsToBackend(connectionTags);
          return { connectionTags };
        }),

      addTab: (tab) =>
        set((state) => {
          const index = state.tabs.findIndex((t) => t.id === tab.id);
          if (index !== -1) {
            // Update existing tab with new data (e.g. switch initialTab)
            const newTabs = [...state.tabs];
            newTabs[index] = { ...newTabs[index], ...tab };
            return { tabs: newTabs, activeTabId: tab.id };
          }
          // 语义去重：对 table/design 类型按 connectionId+dbName+tableName 匹配已有 Tab
          if (
            (tab.type === "table" || tab.type === "design") &&
            tab.tableName &&
            tab.connectionId &&
            tab.dbName
          ) {
            const semanticIndex = state.tabs.findIndex(
              (t) =>
                t.type === tab.type &&
                t.connectionId === tab.connectionId &&
                t.dbName === tab.dbName &&
                t.tableName === tab.tableName,
            );
            if (semanticIndex !== -1) {
              const existingTab = state.tabs[semanticIndex];
              const newTabs = [...state.tabs];
              newTabs[semanticIndex] = {
                ...existingTab,
                ...tab,
                id: existingTab.id,
              };
              return { tabs: newTabs, activeTabId: existingTab.id };
            }
          }
          // 语义去重：对 query 类型按 savedQueryId 匹配已有 Tab（避免保存后重复打开）
          if (tab.type === "query" && tab.savedQueryId) {
            const savedQueryIndex = state.tabs.findIndex(
              (t) =>
                t.type === "query" &&
                (t.savedQueryId === tab.savedQueryId ||
                  t.id === tab.savedQueryId),
            );
            if (savedQueryIndex !== -1) {
              const existingTab = state.tabs[savedQueryIndex];
              const newTabs = [...state.tabs];
              newTabs[savedQueryIndex] = {
                ...existingTab,
                ...tab,
                id: existingTab.id,
              };
              return { tabs: newTabs, activeTabId: existingTab.id };
            }
          }
          return { tabs: [...state.tabs, tab], activeTabId: tab.id };
        }),

      closeTab: (id) =>
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== id);
          let newActiveId = state.activeTabId;
          if (state.activeTabId === id) {
            newActiveId =
              newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
          }
          return { tabs: newTabs, activeTabId: newActiveId };
        }),

      closeOtherTabs: (id) =>
        set((state) => {
          const keep = state.tabs.find((t) => t.id === id);
          if (!keep) return state;
          return { tabs: [keep], activeTabId: id };
        }),

      closeTabsToLeft: (id) =>
        set((state) => {
          const index = state.tabs.findIndex((t) => t.id === id);
          if (index === -1) return state;
          const newTabs = state.tabs.slice(index);
          const activeStillExists = state.activeTabId
            ? newTabs.some((t) => t.id === state.activeTabId)
            : false;
          return {
            tabs: newTabs,
            activeTabId: activeStillExists ? state.activeTabId : id,
          };
        }),

      closeTabsToRight: (id) =>
        set((state) => {
          const index = state.tabs.findIndex((t) => t.id === id);
          if (index === -1) return state;
          const newTabs = state.tabs.slice(0, index + 1);
          const activeStillExists = state.activeTabId
            ? newTabs.some((t) => t.id === state.activeTabId)
            : false;
          return {
            tabs: newTabs,
            activeTabId: activeStillExists ? state.activeTabId : id,
          };
        }),

      closeTabsByConnection: (connectionId) =>
        set((state) => {
          const targetConnectionId = String(connectionId || "").trim();
          if (!targetConnectionId) return state;
          const newTabs = state.tabs.filter(
            (t) => String(t.connectionId || "").trim() !== targetConnectionId,
          );
          const activeStillExists = state.activeTabId
            ? newTabs.some((t) => t.id === state.activeTabId)
            : false;
          const nextActiveTabId = activeStillExists
            ? state.activeTabId
            : newTabs.length > 0
              ? newTabs[newTabs.length - 1].id
              : null;
          const nextActiveContext =
            state.activeContext?.connectionId === targetConnectionId
              ? null
              : state.activeContext;
          return {
            tabs: newTabs,
            activeTabId: nextActiveTabId,
            activeContext: nextActiveContext,
          };
        }),

      closeTabsByDatabase: (connectionId, dbName) =>
        set((state) => {
          const targetConnectionId = String(connectionId || "").trim();
          const targetDbName = String(dbName || "").trim();
          if (!targetConnectionId || !targetDbName) return state;
          const newTabs = state.tabs.filter((tab) => {
            const sameConnection =
              String(tab.connectionId || "").trim() === targetConnectionId;
            const sameDb = String(tab.dbName || "").trim() === targetDbName;
            return !(sameConnection && sameDb);
          });
          const activeStillExists = state.activeTabId
            ? newTabs.some((t) => t.id === state.activeTabId)
            : false;
          const nextActiveTabId = activeStillExists
            ? state.activeTabId
            : newTabs.length > 0
              ? newTabs[newTabs.length - 1].id
              : null;
          const sameActiveContext =
            state.activeContext &&
            state.activeContext.connectionId === targetConnectionId &&
            state.activeContext.dbName === targetDbName;
          return {
            tabs: newTabs,
            activeTabId: nextActiveTabId,
            activeContext: sameActiveContext ? null : state.activeContext,
          };
        }),

      moveTab: (sourceId, targetId) =>
        set((state) => {
          const fromId = String(sourceId || "").trim();
          const toId = String(targetId || "").trim();
          if (!fromId || !toId || fromId === toId) {
            return state;
          }
          const fromIndex = state.tabs.findIndex((tab) => tab.id === fromId);
          const toIndex = state.tabs.findIndex((tab) => tab.id === toId);
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
            return state;
          }
          const nextTabs = [...state.tabs];
          const [movingTab] = nextTabs.splice(fromIndex, 1);
          nextTabs.splice(toIndex, 0, movingTab);
          return { tabs: nextTabs };
        }),

      closeAllTabs: () => set(() => ({ tabs: [], activeTabId: null })),

      setActiveTab: (id) => set({ activeTabId: id }),
      setActiveContext: (context) => set({ activeContext: context }),

      saveQuery: (query) =>
        set((state) => {
          const safeQuery = sanitizeSavedQueries([query])[0];
          if (!safeQuery) return state;
          persistSavedQueryToBackend(safeQuery);
          const existing = state.savedQueries.find((q) => q.id === safeQuery.id);
          if (existing) {
            return {
              savedQueries: state.savedQueries.map((q) =>
                q.id === safeQuery.id ? safeQuery : q,
              ),
            };
          }
          return { savedQueries: [...state.savedQueries, safeQuery] };
        }),

      deleteQuery: (id) =>
        set((state) => {
          deleteSavedQueryFromBackend(id);
          return {
            savedQueries: state.savedQueries.filter((q) => q.id !== id),
          };
        }),

      replaceSavedQueries: (queries) =>
        set(() => {
          const savedQueries = sanitizeSavedQueries(queries);
          if (!savedQueriesHydratingFromBackend) {
            SaveSavedQueries(savedQueries).catch((error: unknown) => {
              console.error("[Saved Query Persist] save failed:", error);
            });
          }
          return { savedQueries };
        }),

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => {
        const nextLanguage = sanitizeAppLanguage(language);
        setRuntimeLanguage(nextLanguage);
        set({ language: nextLanguage });
      },
      setAppearance: (appearance) =>
        set((state) => ({
          appearance: { ...state.appearance, ...appearance },
        })),
      setUiScale: (scale) => set({ uiScale: sanitizeUiScale(scale) }),
      setFontSize: (size) => set({ fontSize: sanitizeFontSize(size) }),
      setStartupFullscreen: (enabled) => set({ startupFullscreen: !!enabled }),
      setSqlFormatOptions: (options) => set({ sqlFormatOptions: options }),
      setQueryOptions: (options) =>
        set((state) => ({
          queryOptions: { ...state.queryOptions, ...options },
        })),
      updateShortcut: (action, binding) => {
        runWithExplicitShortcutPersistence(() => {
          set((state) => ({
            shortcutOptions: {
              ...state.shortcutOptions,
              [action]: {
                ...state.shortcutOptions[action],
                ...binding,
              },
            },
          }));
        });
      },
      resetShortcutOptions: () => {
        runWithExplicitShortcutPersistence(() => {
          set({
            shortcutOptions: cloneShortcutOptions(DEFAULT_SHORTCUT_OPTIONS),
          });
        });
      },

      addSqlLog: (log) =>
        set((state) => {
          const sqlLogs = sanitizeSqlLogs([log, ...state.sqlLogs]);
          const safeLog = sqlLogs[0];
          if (safeLog) {
            persistSqlLogToBackend(safeLog);
          }
          return { sqlLogs };
        }),
      clearSqlLogs: () =>
        set(() => {
          clearSqlLogsFromBackend();
          return { sqlLogs: [] };
        }),
      replaceSqlLogs: (logs) =>
        set(() => {
          const sqlLogs = sanitizeSqlLogs(logs);
          persistSqlLogsToBackend(sqlLogs);
          return { sqlLogs };
        }),

      recordTableAccess: (connectionId, dbName, tableName) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          const currentCount = state.tableAccessCount[key] || 0;
          return {
            tableAccessCount: {
              ...state.tableAccessCount,
              [key]: currentCount + 1,
            },
          };
        }),

      setTableSortPreference: (connectionId, dbName, sortBy) =>
        set((state) => {
          const key = `${connectionId}-${dbName}`;
          return {
            tableSortPreference: {
              ...state.tableSortPreference,
              [key]: sortBy,
            },
          };
        }),

      setTableColumnOrder: (connectionId, dbName, tableName, order) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          return {
            tableColumnOrders: {
              ...state.tableColumnOrders,
              [key]: order,
            },
          };
        }),

      clearTableColumnOrder: (connectionId, dbName, tableName) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          const newOrders = { ...state.tableColumnOrders };
          delete newOrders[key];
          return { tableColumnOrders: newOrders };
        }),

      setEnableColumnOrderMemory: (enabled) =>
        set({ enableColumnOrderMemory: !!enabled }),

      setTableHiddenColumns: (connectionId, dbName, tableName, hiddenColumns) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          return {
            tableHiddenColumns: {
              ...state.tableHiddenColumns,
              [key]: hiddenColumns,
            },
          };
        }),

      clearTableHiddenColumns: (connectionId, dbName, tableName) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          const newHidden = { ...state.tableHiddenColumns };
          delete newHidden[key];
          return { tableHiddenColumns: newHidden };
        }),

      setEnableHiddenColumnMemory: (enabled) =>
        set({ enableHiddenColumnMemory: !!enabled }),

      setTableColumnWidths: (connectionId, dbName, tableName, widths) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          const safeWidths =
            sanitizeTableColumnWidths({ [key]: widths })[key] || {};
          return {
            tableColumnWidths: {
              ...state.tableColumnWidths,
              [key]: safeWidths,
            },
          };
        }),

      clearTableColumnWidths: (connectionId, dbName, tableName) =>
        set((state) => {
          const key = `${connectionId}-${dbName}-${tableName}`;
          const newWidths = { ...state.tableColumnWidths };
          delete newWidths[key];
          return { tableColumnWidths: newWidths };
        }),

      setWindowBounds: (bounds) =>
        set({
          windowBounds: {
            width: Math.max(400, Math.trunc(bounds.width)),
            height: Math.max(300, Math.trunc(bounds.height)),
            x: Math.trunc(bounds.x),
            y: Math.trunc(bounds.y),
          },
        }),

      setWindowState: (state) => set({ windowState: state }),

      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(200, Math.min(600, Math.trunc(width))) }),

      // AI actions
      toggleAIPanel: () =>
        set((state) => ({ aiPanelVisible: !state.aiPanelVisible })),
      setAIPanelVisible: (visible) => set({ aiPanelVisible: visible }),
      addAIChatMessage: (sessionId, message) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          const messages = history[sessionId] || [];
          history[sessionId] = [...messages, message];

          let newSessions = [...state.aiChatSessions];
          const existingSession = newSessions.find((s) => s.id === sessionId);

          if (!existingSession) {
            let title = message.role === "user" ? message.content : "New chat";
            if (title.length > 20) {
              title = title.substring(0, 20) + "...";
            }
            newSessions.unshift({
              id: sessionId,
              title,
              updatedAt: Date.now(),
            });
          } else {
            newSessions = newSessions.filter((s) => s.id !== sessionId);
            newSessions.unshift({ ...existingSession, updatedAt: Date.now() });
          }

          return { aiChatHistory: history, aiChatSessions: newSessions };
        });
        // 异步持久化到文件（fire-and-forget，防抖由外层控制）
        _debouncedPersistSession(sessionId);
      },
      updateAIChatMessage: (sessionId, messageId, updates) => {
        set((state) => {
          const messages = state.aiChatHistory[sessionId];
          if (!messages) return state;
          const idx = messages.findIndex((m) => m.id === messageId);
          if (idx < 0) return state;
          const newMessages = [...messages];
          newMessages[idx] = { ...newMessages[idx], ...updates };
          const history = { ...state.aiChatHistory, [sessionId]: newMessages };
          const isContentOnlyUpdate =
            Object.keys(updates).length === 1 && "content" in updates;
          if (!isContentOnlyUpdate) {
            let newSessions = [...state.aiChatSessions];
            const existingSession = newSessions.find((s) => s.id === sessionId);
            if (existingSession) {
              newSessions = newSessions.filter((s) => s.id !== sessionId);
              newSessions.unshift({
                ...existingSession,
                updatedAt: Date.now(),
              });
            }
            return { aiChatHistory: history, aiChatSessions: newSessions };
          }
          return { aiChatHistory: history };
        });
        // 流式打字高频调用，防抖 2 秒后才写磁盘
        _debouncedPersistSession(sessionId);
      },
      deleteAIChatMessage: (sessionId, messageId) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          if (history[sessionId]) {
            history[sessionId] = history[sessionId].filter(
              (m) => m.id !== messageId,
            );
          }
          return { aiChatHistory: history };
        });
        _debouncedPersistSession(sessionId);
      },
      truncateAIChatMessages: (sessionId, upToMessageId) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          const messages = history[sessionId];
          if (messages) {
            const idx = messages.findIndex((m) => m.id === upToMessageId);
            if (idx >= 0) {
              history[sessionId] = messages.slice(0, idx + 1);
            }
          }
          return { aiChatHistory: history };
        });
        _debouncedPersistSession(sessionId);
      },
      clearAIChatHistory: (sessionId) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          delete history[sessionId];
          return { aiChatHistory: history };
        });
        _debouncedPersistSession(sessionId);
      },
      replaceAIChatHistory: (sessionId, messages) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          history[sessionId] = messages;
          return { aiChatHistory: history };
        });
        _debouncedPersistSession(sessionId);
      },
      deleteAISession: (sessionId) => {
        set((state) => {
          const history = { ...state.aiChatHistory };
          delete history[sessionId];
          const newSessions = state.aiChatSessions.filter(
            (s) => s.id !== sessionId,
          );
          const newActive =
            state.aiActiveSessionId === sessionId
              ? null
              : state.aiActiveSessionId;
          return {
            aiChatHistory: history,
            aiChatSessions: newSessions,
            aiActiveSessionId: newActive,
          };
        });
        // 删除文件
        const Service = AIService;
        Service?.AIDeleteSession?.(sessionId).catch(() => {});
      },
      createNewAISession: () =>
        set(() => {
          const newId = `session-${Date.now()}`;
          return { aiActiveSessionId: newId };
        }),
      setAIActiveSessionId: (sessionId) =>
        set({ aiActiveSessionId: sessionId }),
      updateAISessionTitle: (sessionId, title) => {
        set((state) => {
          const newSessions = [...state.aiChatSessions];
          const session = newSessions.find((s) => s.id === sessionId);
          if (session) {
            session.title = title;
          }
          return { aiChatSessions: newSessions };
        });
        _debouncedPersistSession(sessionId);
      },
      addAIContext: (connectionKey, context) =>
        set((state) => {
          const contexts = state.aiContexts[connectionKey] || [];
          if (
            contexts.find(
              (c) =>
                c.dbName === context.dbName &&
                c.tableName === context.tableName,
            )
          ) {
            return state;
          }
          return {
            aiContexts: {
              ...state.aiContexts,
              [connectionKey]: [...contexts, context],
            },
          };
        }),
      removeAIContext: (connectionKey, dbName, tableName) =>
        set((state) => {
          const contexts = state.aiContexts[connectionKey] || [];
          return {
            aiContexts: {
              ...state.aiContexts,
              [connectionKey]: contexts.filter(
                (c) => !(c.dbName === dbName && c.tableName === tableName),
              ),
            },
          };
        }),
      clearAIContexts: (connectionKey) =>
        set((state) => {
          const { [connectionKey]: _, ...rest } = state.aiContexts;
          return { aiContexts: rest };
        }),
    }),
    {
      name: PERSIST_STORAGE_KEY, // name of the item in the storage (must be unique)
      version: PERSIST_VERSION,
      migrate: (persistedState: unknown, version: number) => {
        const state = unwrapPersistedAppState(
          persistedState,
        ) as Partial<AppState>;
        const nextState: Partial<AppState> = { ...state };
        nextState.connections = sanitizeConnections(state.connections);
        if (version < 5) {
          nextState.connectionTags = sanitizeConnectionTags(
            state.connectionTags,
          );
        } else {
          nextState.connectionTags = sanitizeConnectionTags(
            state.connectionTags,
          );
        }
        nextState.savedQueries = sanitizeSavedQueries(state.savedQueries);
        nextState.theme = sanitizeTheme(state.theme);
        nextState.language = sanitizeAppLanguage(state.language);
        nextState.appearance = sanitizeAppearance(state.appearance, version);
        nextState.uiScale = sanitizeUiScale(state.uiScale);
        nextState.fontSize = sanitizeFontSize(state.fontSize);
        nextState.startupFullscreen = sanitizeStartupFullscreen(
          state.startupFullscreen,
        );
        nextState.sqlFormatOptions = sanitizeSqlFormatOptions(
          state.sqlFormatOptions,
        );
        nextState.queryOptions = sanitizeQueryOptions(state.queryOptions);
        nextState.sqlLogs = sanitizeSqlLogs(state.sqlLogs);
        nextState.shortcutOptions = sanitizeShortcutOptions(
          state.shortcutOptions,
        );
        nextState.tableAccessCount = sanitizeTableAccessCount(
          state.tableAccessCount,
        );
        nextState.tableSortPreference = sanitizeTableSortPreference(
          state.tableSortPreference,
        );
        // 新增的列排序记忆状态不需要做版本特殊兼容，直接做基本的类型保护
        const safeOrders = sanitizeTableColumnOrders(state.tableColumnOrders);
        nextState.tableColumnOrders = safeOrders;
        nextState.enableColumnOrderMemory =
          state.enableColumnOrderMemory !== false;
        const safeHidden = sanitizeTableHiddenColumns(state.tableHiddenColumns);
        nextState.tableHiddenColumns = safeHidden;
        nextState.enableHiddenColumnMemory =
          state.enableHiddenColumnMemory !== false;
        nextState.tableColumnWidths = sanitizeTableColumnWidths(
          state.tableColumnWidths,
        );
        nextState.windowBounds = sanitizeWindowBounds(state.windowBounds);
        nextState.windowState = sanitizeWindowState(state.windowState);
        nextState.sidebarWidth = sanitizeSidebarWidth(state.sidebarWidth);

        // 保留原有的 AI 持久化记录，或者为空（版本兼容）
        nextState.aiChatHistory =
          state.aiChatHistory && typeof state.aiChatHistory === "object"
            ? state.aiChatHistory
            : {};
        nextState.aiChatSessions = Array.isArray(state.aiChatSessions)
          ? state.aiChatSessions
          : [];
        return nextState as AppState;
      },
      merge: (persistedState, currentState) => {
        const state = unwrapPersistedAppState(
          persistedState,
        ) as Partial<AppState>;
        return {
          ...currentState,
          ...state,
          connections: sanitizeConnections(state.connections),
          connectionTags: sanitizeConnectionTags(state.connectionTags),
          savedQueries: sanitizeSavedQueries(state.savedQueries),
          theme: sanitizeTheme(state.theme),
          language: sanitizeAppLanguage(state.language),
          appearance: sanitizeAppearance(state.appearance, PERSIST_VERSION),
          uiScale: sanitizeUiScale(state.uiScale),
          fontSize: sanitizeFontSize(state.fontSize),
          startupFullscreen: sanitizeStartupFullscreen(state.startupFullscreen),
          tableSortPreference: sanitizeTableSortPreference(
            state.tableSortPreference,
          ),
          tableColumnOrders: sanitizeTableColumnOrders(state.tableColumnOrders),
          enableColumnOrderMemory: state.enableColumnOrderMemory !== false,
          tableHiddenColumns: sanitizeTableHiddenColumns(
            state.tableHiddenColumns,
          ),
          enableHiddenColumnMemory: state.enableHiddenColumnMemory !== false,
          tableColumnWidths: sanitizeTableColumnWidths(
            state.tableColumnWidths,
          ),
          windowBounds: sanitizeWindowBounds(state.windowBounds),
          windowState: sanitizeWindowState(state.windowState),
          sidebarWidth: sanitizeSidebarWidth(state.sidebarWidth),

          sqlFormatOptions: sanitizeSqlFormatOptions(state.sqlFormatOptions),
          queryOptions: sanitizeQueryOptions(state.queryOptions),
          sqlLogs: sanitizeSqlLogs(state.sqlLogs),
          shortcutOptions: sanitizeShortcutOptions(state.shortcutOptions),
          tableAccessCount: sanitizeTableAccessCount(state.tableAccessCount),

          // AI 会话数据不再从 localStorage 恢复，改为从后端文件加载
          aiChatHistory: {},
          aiChatSessions: [],
        };
      },
      partialize: (state) => {
        const partialState: Partial<AppState> = {
          connectionTags: state.connectionTags,
          savedQueries: state.savedQueries,
          theme: state.theme,
          language: state.language,
          appearance: state.appearance,
          uiScale: state.uiScale,
          fontSize: state.fontSize,
          startupFullscreen: state.startupFullscreen,
          sqlFormatOptions: state.sqlFormatOptions,
          queryOptions: state.queryOptions,
          sqlLogs: sanitizeSqlLogs(state.sqlLogs),
          shortcutOptions: resolveShortcutOptionsForPersistence(state.shortcutOptions),
          tableAccessCount: state.tableAccessCount,
          tableSortPreference: state.tableSortPreference,
          tableColumnOrders: state.tableColumnOrders,
          enableColumnOrderMemory: state.enableColumnOrderMemory,
          tableHiddenColumns: state.tableHiddenColumns,
          enableHiddenColumnMemory: state.enableHiddenColumnMemory,
          tableColumnWidths: state.tableColumnWidths,
          windowBounds: state.windowBounds,
          windowState: state.windowState,
          sidebarWidth: state.sidebarWidth,
        };

        if (hasLegacyConnectionSecrets(state.connections)) {
          partialState.connections = state.connections;
        }

        // AI 会话数据已迁移到后端文件持久化（~/.javanavi/sessions/），不再写入 localStorage
        return partialState as AppState;
      },
    },
  ),
);
