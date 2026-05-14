import type { connection, redis } from './models';
import type { AIChatMessage, AIContextLevel, AIProviderConfig as AppAIProviderConfig, AISafetyLevel } from '../types';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };
export type UnknownRecord = Record<string, unknown>;
export type DataRow = Record<string, unknown>;

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: UnknownRecord;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: ApiErrorPayload;
}

export type ApiPayload<T> = ApiEnvelope<T> | T;

export interface AiToolFunction {
  name: string;
  description?: string;
  parameters?: UnknownRecord;
}

export interface AiTool {
  type: string;
  function: AiToolFunction;
}

export interface AiToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface AiMessage {
  role: string;
  content: string;
  images?: string[];
  tool_call_id?: string;
  tool_calls?: AIChatMessage['tool_calls'];
}

export interface AiProviderConfig extends AppAIProviderConfig {
  clearApiKey?: boolean;
}

export interface AiSafetyResult {
  allowed: boolean;
  operationType: string;
  requiresConfirm: boolean;
  warningMessage?: string | null;
}

export interface AiChatSendResult {
  success: boolean;
  error?: string;
  content: string;
  choices?: unknown[];
  providerId?: string;
  model?: string;
  transport?: string;
  transportCapability?: string;
  transportError?: boolean;
  usage?: UnknownRecord;
  responseId?: string;
}

export interface AiModelListResult {
  success: boolean;
  error?: string;
  models?: string[];
  byProvider?: Record<string, string[]>;
}

export interface AiSessionSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface AiSessionPayload extends AiSessionSummary {
  success: boolean;
  messages?: AIChatMessage[] | string;
  messagesJSON?: string;
}

export interface AiProviderTestResult extends Record<string, unknown> {
  success: boolean;
  message?: string;
  providerId?: string;
  networkTested?: boolean;
  transportEnabled?: boolean;
  transportRequested?: boolean;
  transportCapability?: string;
  modelDiscoverySupported?: boolean;
  modelsFetched?: boolean;
  models?: string[];
  modelCount?: number;
  transport?: UnknownRecord;
}

export interface RedisListPushOptions {
  values: string[];
  position?: 'left' | 'right';
}

export type RedisHashFieldsInput = string | string[];
export type RedisCursor = string | number;
export type RedisZSetMember = redis.ZSetMember;

export interface DriverDirectoryRequest { path: string; }
export interface DriverRepositoryRequest { url: string; }
export interface DriverPackageRequest { driverType: string; version?: string; downloadDir?: string; }

export interface ExportDataRequest {
  rows: DataRow[];
  columns: string[];
  defaultName: string;
  format: string;
  targetPath?: string;
}

export interface FileExportRequest {
  connection: connection.ConnectionConfig;
  database: string;
  table?: string;
  tables?: string[];
  query?: string;
  defaultName?: string;
  format?: string;
  includeData?: boolean;
  targetPath?: string;
}

export type AiSafetyLevelValue = AISafetyLevel;
export type AiContextLevelValue = AIContextLevel;
