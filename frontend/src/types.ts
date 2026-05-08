export interface SSHConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  keyPath?: string;
}

export interface ProxyConfig {
  type: "socks5" | "http";
  host: string;
  port: number;
  user?: string;
  password?: string;
}

export interface HTTPTunnelConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
}

export interface JVMJMXConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  domainAllowlist?: string[];
}

export interface JVMEndpointConfig {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  timeoutSeconds?: number;
}

export interface JVMAgentConfig {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  timeoutSeconds?: number;
}

export type JVMDiagnosticTransport = "agent-bridge" | "arthas-tunnel";

export interface JVMDiagnosticConfig {
  enabled?: boolean;
  transport?: JVMDiagnosticTransport;
  baseUrl?: string;
  targetId?: string;
  apiKey?: string;
  allowObserveCommands?: boolean;
  allowTraceCommands?: boolean;
  allowMutatingCommands?: boolean;
  timeoutSeconds?: number;
}

export interface JVMDiagnosticCapability {
  transport: JVMDiagnosticTransport;
  canOpenSession: boolean;
  canStream: boolean;
  canCancel: boolean;
  allowObserveCommands: boolean;
  allowTraceCommands: boolean;
  allowMutatingCommands: boolean;
  reason?: string;
}

export interface JVMDiagnosticSessionRequest {
  title?: string;
  reason?: string;
}

export interface JVMDiagnosticSessionHandle {
  sessionId: string;
  transport: string;
  startedAt: number;
}

export interface JVMDiagnosticCommandRequest {
  sessionId: string;
  commandId: string;
  command: string;
  source?: string;
  reason?: string;
}

export interface JVMDiagnosticEventChunk {
  sessionId: string;
  commandId?: string;
  event?: string;
  phase?: string;
  content?: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface JVMDiagnosticAuditRecord {
  timestamp: number;
  connectionId: string;
  sessionId?: string;
  commandId?: string;
  transport: string;
  command: string;
  commandType?: string;
  source?: string;
  reason?: string;
  riskLevel?: string;
  status: string;
}

export interface JVMDiagnosticPlan {
  intent: string;
  transport: JVMDiagnosticTransport;
  command: string;
  riskLevel: "low" | "medium" | "high";
  reason: string;
  expectedSignals?: string[];
}

export interface JVMDiagnosticCommandDraft {
  sessionId?: string;
  command: string;
  source?: "manual" | "ai-plan";
  reason?: string;
}

export interface JVMConfig {
  environment?: "dev" | "uat" | "prod";
  readOnly?: boolean;
  allowedModes?: Array<"jmx" | "endpoint" | "agent">;
  preferredMode?: "jmx" | "endpoint" | "agent";
  jmx?: JVMJMXConfig;
  endpoint?: JVMEndpointConfig;
  agent?: JVMAgentConfig;
  diagnostic?: JVMDiagnosticConfig;
}

export interface JVMCapability {
  mode: "jmx" | "endpoint" | "agent";
  canBrowse: boolean;
  canWrite: boolean;
  canPreview: boolean;
  reason?: string;
  displayLabel: string;
}

export interface JVMMonitoringPoint {
  timestamp: number;
  heapUsedBytes?: number;
  heapCommittedBytes?: number;
  heapMaxBytes?: number;
  nonHeapUsedBytes?: number;
  nonHeapCommittedBytes?: number;
  gcCollectionCount?: number;
  gcCollectionTimeMs?: number;
  gcDeltaCount?: number;
  gcDeltaTimeMs?: number;
  threadCount?: number;
  daemonThreadCount?: number;
  peakThreadCount?: number;
  threadStateCounts?: Record<string, number>;
  loadedClassCount?: number;
  unloadedClassCount?: number;
  classLoadDelta?: number;
  processCpuLoad?: number;
  systemCpuLoad?: number;
  processRssBytes?: number;
  committedVirtualMemoryBytes?: number;
}

export interface JVMMonitoringRecentGCEvent {
  timestamp: number;
  name?: string;
  cause?: string;
  action?: string;
  durationMs?: number;
  beforeUsedBytes?: number;
  afterUsedBytes?: number;
}

export interface JVMMonitoringSessionState {
  connectionId: string;
  providerMode: "jmx" | "endpoint" | "agent";
  running: boolean;
  points?: JVMMonitoringPoint[];
  recentGcEvents?: JVMMonitoringRecentGCEvent[];
  availableMetrics?: string[];
  missingMetrics?: string[];
  providerWarnings?: string[];
}

export interface JVMResourceSummary {
  id: string;
  parentId?: string;
  kind: string;
  name: string;
  path: string;
  providerMode: "jmx" | "endpoint" | "agent";
  canRead: boolean;
  canWrite: boolean;
  hasChildren: boolean;
  sensitive?: boolean;
}

export interface JVMActionPayloadField {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}

export interface JVMActionDefinition {
  action: string;
  label?: string;
  description?: string;
  dangerous?: boolean;
  payloadFields?: JVMActionPayloadField[];
  payloadExample?: Record<string, any>;
}

export interface JVMValueSnapshot {
  resourceId: string;
  kind: string;
  format: string;
  version?: string;
  value: any;
  description?: string;
  sensitive?: boolean;
  supportedActions?: JVMActionDefinition[];
  metadata?: Record<string, any>;
}

export interface JVMChangePreview {
  allowed: boolean;
  requiresConfirmation?: boolean;
  confirmationToken?: string;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  blockingReason?: string;
  before: JVMValueSnapshot;
  after: JVMValueSnapshot;
}

export interface JVMChangeRequest {
  providerMode: "jmx" | "endpoint" | "agent";
  resourceId: string;
  action: string;
  reason: string;
  source?: "manual" | "ai-plan";
  expectedVersion?: string;
  confirmationToken?: string;
  payload?: Record<string, any>;
}

export interface JVMApplyResult {
  status: string;
  message?: string;
  updatedValue: JVMValueSnapshot;
}

export interface JVMAuditRecord {
  timestamp: number;
  connectionId: string;
  providerMode: string;
  resourceId: string;
  action: string;
  reason: string;
  source?: string;
  result: string;
}

export interface ConnectionConfig {
  id?: string;
  type: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  savePassword?: boolean;
  database?: string;
  useSSL?: boolean;
  sslMode?: "preferred" | "required" | "skip-verify" | "disable";
  sslCertPath?: string;
  sslKeyPath?: string;
  useSSH?: boolean;
  ssh?: SSHConfig;
  useProxy?: boolean;
  proxy?: ProxyConfig;
  useHttpTunnel?: boolean;
  httpTunnel?: HTTPTunnelConfig;
  driver?: string;
  dsn?: string;
  options?: Record<string, string>;
  timeout?: number;
  redisDB?: number; // Redis database index (0-15)
  uri?: string; // Connection URI for copy/paste
  hosts?: string[]; // Multi-host addresses: host:port
  topology?: "single" | "replica" | "cluster";
  mysqlReplicaUser?: string;
  mysqlReplicaPassword?: string;
  replicaSet?: string;
  authSource?: string;
  readPreference?: string;
  mongoSrv?: boolean;
  mongoAuthMechanism?: string;
  mongoReplicaUser?: string;
  mongoReplicaPassword?: string;
  jvm?: JVMConfig;
}

export interface MongoMemberInfo {
  host: string;
  role: string;
  state: string;
  stateCode?: number;
  healthy: boolean;
  isSelf?: boolean;
}

export interface SavedConnection {
  id: string;
  name: string;
  config: ConnectionConfig;
  secretRef?: string;
  hasPrimaryPassword?: boolean;
  hasSSHPassword?: boolean;
  hasProxyPassword?: boolean;
  hasHttpTunnelPassword?: boolean;
  hasMySQLReplicaPassword?: boolean;
  hasMongoReplicaPassword?: boolean;
  hasOpaqueURI?: boolean;
  hasOpaqueDSN?: boolean;
  includeDatabases?: string[];
  includeRedisDatabases?: number[]; // Redis databases to show (0-15)
  iconType?: string; // 自定义图标类型（如 'mysql','postgres'），不填则取 config.type
  iconColor?: string; // 自定义图标颜色（十六进制），不填则取类型默认色
}

export interface GlobalProxyConfig extends ProxyConfig {
  enabled: boolean;
  hasPassword?: boolean;
  secretRef?: string;
}

export interface ConnectionTag {
  id: string;
  name: string;
  connectionIds: string[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: string;
  key: string;
  default?: string;
  extra: string;
  comment: string;
}

export interface IndexDefinition {
  name: string;
  columnName: string;
  nonUnique: number;
  seqInIndex: number;
  indexType: string;
}

export interface ForeignKeyDefinition {
  name: string;
  columnName: string;
  refTableName: string;
  refColumnName: string;
  constraintName: string;
}

export interface TriggerDefinition {
  name: string;
  timing: string;
  event: string;
  statement: string;
}

export interface TabData {
  id: string;
  title: string;
  type:
    | "query"
    | "table"
    | "design"
    | "redis-keys"
    | "redis-command"
    | "redis-monitor"
    | "trigger"
    | "view-def"
    | "routine-def"
    | "table-overview"
    | "jvm-overview"
    | "jvm-resource"
    | "jvm-audit"
    | "jvm-diagnostic"
    | "jvm-monitoring";
  connectionId: string;
  dbName?: string;
  tableName?: string;
  query?: string;
  filePath?: string;
  initialTab?: string;
  readOnly?: boolean;
  providerMode?: "jmx" | "endpoint" | "agent";
  resourcePath?: string;
  resourceKind?: string;
  redisDB?: number; // Redis database index for redis tabs
  triggerName?: string; // Trigger name for trigger tabs
  viewName?: string; // View name for view definition tabs
  routineName?: string; // Routine name for function/procedure definition tabs
  routineType?: string; // 'FUNCTION' or 'PROCEDURE'
  savedQueryId?: string; // Saved query identity for quick-save behavior
}

export interface JVMAIPlanContext {
  tabId: string;
  connectionId: string;
  providerMode: "jmx" | "endpoint" | "agent";
  resourcePath: string;
}

export interface JVMDiagnosticPlanContext {
  tabId: string;
  connectionId: string;
  transport: JVMDiagnosticTransport;
}

export interface DatabaseNode {
  title: string;
  key: string;
  isLeaf?: boolean;
  children?: DatabaseNode[];
  icon?: any;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  connectionId: string;
  dbName: string;
  createdAt: number;
}

export interface ExternalSQLDirectory {
  id: string;
  name: string;
  path: string;
  connectionId: string;
  dbName: string;
  createdAt: number;
}

export interface ExternalSQLTreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: ExternalSQLTreeEntry[];
}

// Redis types
export interface RedisKeyInfo {
  key: string;
  type: string;
  ttl: number;
}

export interface RedisScanResult {
  keys: RedisKeyInfo[];
  cursor: string;
}

export interface RedisValue {
  type: "string" | "hash" | "list" | "set" | "zset" | "stream";
  ttl: number;
  value: any;
  length: number;
}

export interface RedisDBInfo {
  index: number;
  keys: number;
}

export interface ZSetMember {
  member: string;
  score: number;
}

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

// --- AI Types ---

export type AIProviderType = "openai" | "anthropic" | "gemini" | "custom";
export type AISafetyLevel = "readonly" | "readwrite" | "full";
export type AIContextLevel = "schema_only" | "with_samples" | "with_results";

export interface AIContextItem {
  dbName: string;
  tableName: string;
  ddl: string;
}

export interface AIProviderConfig {
  id: string;
  type: AIProviderType;
  name: string;
  apiKey: string;
  secretRef?: string;
  hasSecret?: boolean;
  baseUrl: string;
  model: string;
  models?: string[];
  apiFormat?: string; // custom 专用: openai | anthropic | gemini | claude-cli
  headers?: Record<string, string>;
  transportEnabled?: boolean;
  transportCapability?: string;
  modelDiscoverySupported?: boolean;
  maxTokens: number;
  temperature: number;
}

export interface AIToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export type ChatPhase =
  | "idle"
  | "connecting"
  | "thinking"
  | "generating"
  | "tool_calling";

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  phase?: ChatPhase;
  content: string;
  thinking?: string;
  timestamp: number;
  loading?: boolean;
  images?: string[]; // base64 encoded images with data URI prefix
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  tool_name?: string; // used for UI display
  rawError?: string; // 存储未清洗的原始错误信息，用于用户复制排查
  success?: boolean; // 标记探针执行是否成功
  jvmPlanContext?: JVMAIPlanContext;
  jvmDiagnosticPlanContext?: JVMDiagnosticPlanContext;
}

export interface AISafetyResult {
  allowed: boolean;
  operationType: "query" | "dml" | "ddl" | "other";
  requiresConfirm: boolean;
  warningMessage?: string;
}
