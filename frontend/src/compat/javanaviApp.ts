import { resolveEffectiveSSLMode } from '../utils/sslMode';
import { connection, sync, app, redis, schemaSync } from './models';
import type { DataRow, RedisCursor, RedisHashFieldsInput, RedisListPushOptions } from './contracts';
import { localSessionHeaders as baseLocalSessionHeaders } from './localSession';
import { DEFAULT_LANGUAGE, currentLanguageHeaderValue, getRuntimeLanguage, sanitizeLanguage, translateBackendFallback, type AppLanguage } from '../i18n';

export type QueryResult = connection.QueryResult;

const API_BASE = '/api/v1';

type PostJsonOptions = {
  requestSource?: string;
};

function requestSourceHeaders(source?: string): Record<string, string> {
  if (!source) return {};
  return { 'X-JavaNavi-Request-Source': source };
}

function currentAppLanguage(): AppLanguage {
  const runtimeLanguage = getRuntimeLanguage();
  if (runtimeLanguage !== DEFAULT_LANGUAGE) return runtimeLanguage;
  if (typeof localStorage === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const payload = localStorage.getItem('lite-db-storage');
    if (!payload) return DEFAULT_LANGUAGE;
    const parsed = JSON.parse(payload);
    const state = parsed?.state && typeof parsed.state === 'object' ? parsed.state : parsed;
    return sanitizeLanguage(state?.language);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

async function localSessionHeaders(): Promise<Record<string, string>> {
  const language = currentAppLanguage();
  return {
    ...(await baseLocalSessionHeaders()),
    'X-JavaNavi-Language': currentLanguageHeaderValue(language),
    'Accept-Language': currentLanguageHeaderValue(language),
  };
}

function driverTypeOf(config: any): string {
  return config?.driverType || config?.type || config?.driver || 'demo';
}

function browserMockConnectionPassword(config: any = {}): string | undefined {
  const id = config?.id || config?.connectionId;
  if (!id || typeof window === 'undefined') return undefined;
  const resolver = window.__javanaviBrowserSecrets?.getConnectionPassword;
  if (typeof resolver !== 'function') return undefined;
  const value = resolver(String(id));
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function isInternalConnectionOptionKey(key: string): boolean {
  const normalized = String(key || '').replace(/[-_\s]/g, '').toLowerCase();
  if (isRememberedMetadataOptionKey(normalized)) return false;
  return normalized.startsWith('customdatasource') || normalized.startsWith('javanavi');
}

function isRememberedMetadataOptionKey(normalizedKey: string): boolean {
  return normalizedKey === 'javanavimetadatacatalog' || normalizedKey === 'javanavimetadataschema';
}

function runtimeConnectionOptions(options: any): Record<string, string> | undefined {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return undefined;
  }
  const filtered = Object.fromEntries(
    Object.entries(options)
      .map(([key, value]) => [String(key || '').trim(), String(value ?? '').trim()])
      .filter(([key, value]) => key && value && !isInternalConnectionOptionKey(key)),
  );
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function toConnectionPayload(config: any = {}): Record<string, any> {
  return {
    id: config?.id || config?.connectionId || 'demo-h2',
    name: config?.name || config?.database || config?.host || 'Demo',
    driverType: driverTypeOf(config),
    driver: config?.driver,
    host: config?.host,
    port: config?.port,
    database: config?.database,
    username: config?.username || config?.user,
    password: config?.password || browserMockConnectionPassword(config),
    options: runtimeConnectionOptions(config?.options),
    timeout: config?.timeout,
    redisDB: config?.redisDB,
    uri: config?.uri,
    dsn: config?.dsn,
    hosts: config?.hosts,
    topology: config?.topology,
    replicaSet: config?.replicaSet || config?.mongoReplicaSet,
    authSource: config?.authSource,
    readPreference: config?.readPreference,
    mongoSrv: config?.mongoSrv || config?.mongoSRV,
    mongoAuthMechanism: config?.mongoAuthMechanism,
    mongoReplicaUser: config?.mongoReplicaUser,
    mongoReplicaPassword: config?.mongoReplicaPassword,
    useSSL: config?.useSSL,
    sslMode: resolveEffectiveSSLMode(config?.sslMode, config?.useSSL === true),
    useSSH: config?.useSSH,
    useProxy: config?.useProxy,
    useHttpTunnel: config?.useHttpTunnel,
  };
}

function tableMetadataPayload(config: any, database: string, table: string): Record<string, any> {
  return { connection: toConnectionPayload(config), database, table };
}

function localizeBackendMessage(message: unknown, fallbackMessage = 'Request failed'): string {
  const raw = String(message || fallbackMessage || 'Request failed');
  return translateBackendFallback(currentAppLanguage(), raw);
}

async function postJson(path: string, body: unknown, options: PostJsonOptions = {}): Promise<any> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(await localSessionHeaders()), ...requestSourceHeaders(options.requestSource) },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { success: false, message: localizeBackendMessage(payload?.error?.message || response.statusText), data: null };
  }
  return payload;
}

async function postMultipart(path: string, body: FormData): Promise<any> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...(await localSessionHeaders()) },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { success: false, message: localizeBackendMessage(payload?.error?.message || response.statusText), data: null };
  }
  return payload;
}

async function getJson(path: string): Promise<any> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { ...(await localSessionHeaders()) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return { success: false, message: localizeBackendMessage(payload?.error?.message || response.statusText), data: null };
  }
  return payload;
}

function dataOrThrow<T = any>(payload: any, fallbackMessage: string): T {
  if (!payload || payload.success === false) {
    throw new Error(localizeBackendMessage(payload?.error?.message || payload?.message, fallbackMessage));
  }
  return (payload.data ?? payload) as T;
}

function javaNaviTableName(row: any, driver: string): string {
  const table = row?.Table || row?.table || row?.tableName || row?.TABLE_NAME || Object.values(row || {})[0];
  const schema = row?.schemaName || row?.tableSchema || row?.TABLE_SCHEM || row?.schema;
  const tableText = typeof table === 'string' ? table.trim() : String(table || '').trim();
  const schemaText = typeof schema === 'string' ? schema.trim() : String(schema || '').trim();
  if (!tableText) return '';
  if ((driver === 'postgresql' || driver === 'postgres' || driver === 'pg') && schemaText && !tableText.includes('.')) {
    return `${schemaText}.${tableText}`;
  }
  return tableText;
}

function firstNonEmptyText(...values: unknown[]): string {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function apiEnvelopeToTableResult(payload: any, config: any): QueryResult {
  const result = apiEnvelopeToQueryResult(payload, 'Tables loaded');
  if (!result.success || !Array.isArray(result.data)) return result;
  const driver = driverTypeOf(config).toLowerCase();
  result.data = result.data
    .map((row: any) => {
      const tableName = javaNaviTableName(row, driver);
      const comment = firstNonEmptyText(row?.comment, row?.tableComment, row?.TABLE_COMMENT, row?.remarks, row?.REMARKS);
      return tableName ? {
        Table: tableName,
        tableName: row?.tableName || tableName,
        schemaName: row?.schemaName || '',
        tableType: row?.tableType || row?.table_type || row?.TABLE_TYPE || '',
        comment,
        tableComment: comment,
      } : null;
    })
    .filter(Boolean);
  return result;
}

function apiEnvelopeToQueryResult(payload: any, fallbackMessage = 'OK'): QueryResult {
  const language = currentAppLanguage();
  const localizedFallback = translateBackendFallback(language, fallbackMessage);
  if (!payload) return { success: false, message: translateBackendFallback(language, 'Empty response'), data: null } as QueryResult;
  if (payload.success === false) return { success: false, message: localizeBackendMessage(payload.error?.message || payload.message, 'Request failed'), data: payload.data ?? null } as QueryResult;
  const data = payload.data ?? payload;
  const fields = Array.isArray(data?.columns) ? data.columns : undefined;
  const revealFields = {
    revealMessage: data?.revealMessage,
    revealTargetPath: data?.revealTargetPath,
    revealDirectory: data?.revealDirectory,
    revealMethod: data?.revealMethod,
    revealed: data?.revealed,
    revealSelected: data?.revealSelected,
  };
  if (Array.isArray(data?.rows) && Array.isArray(data?.columns)) {
    const affectedRow = data.columns.length === 1 && data.columns[0] === 'affectedRows' && data.rows.length > 0;
    return {
      success: true,
      message: payload.message || localizedFallback,
      data: affectedRow ? data.rows[0] : data.rows,
      fields,
      queryId: data.queryId,
      ...revealFields,
    } as QueryResult;
  }
  return { success: true, message: payload.message || localizedFallback, data, fields, queryId: data?.queryId, ...revealFields } as QueryResult;
}

export function GenerateQueryID(): Promise<string> {
  return Promise.resolve(`query-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export async function ApplyChanges(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:connection.ChangeSet): Promise<connection.QueryResult> {
  const payload = await postJson('/apply-changes', {
    connection: toConnectionPayload(arg1),
    database: arg2,
    table: arg3,
    changes: arg4,
  });
  return apiEnvelopeToQueryResult(payload, 'Transaction committed successfully');
}

export async function CancelQuery(arg1: string): Promise<connection.QueryResult> {
  const payload = await postJson('/query/cancel', { queryId: arg1 });
  return apiEnvelopeToQueryResult(payload, 'Query cancelled');
}

export async function CancelSQLFileExecution(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/query/cancel', { queryId: arg1 });
  return apiEnvelopeToQueryResult(payload, 'SQL file execution cancelled');
}

export async function CheckDriverNetworkStatus(): Promise<connection.QueryResult> {
  const payload = await getJson('/drivers/network-status');
  return apiEnvelopeToQueryResult(payload, 'Driver network status loaded');
}

export async function ClearTables(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string>): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/clear-tables', { connection: toConnectionPayload(arg1), database: arg2, tables: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Tables cleared');
}

export async function ConfigureDriverRuntimeDirectory(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/runtime-directory', { path: arg1 });
  return apiEnvelopeToQueryResult(payload, 'Driver runtime directory configured');
}

export async function ConfigureDriverRepositoryURL(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/repository/configure', { repositoryURL: arg1 });
  return apiEnvelopeToQueryResult(payload, 'Driver Maven repository configured');
}

export async function ConfigureDefaultDriver(arg1:string,arg2:string,arg3:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/default-driver', { databaseType: arg1, driverType: arg2, downloadDir: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Default driver configured');
}

export async function ConfigureGlobalProxy(arg1:boolean,arg2:connection.ProxyConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/app/global-proxy', { enabled: arg1, ...(arg2 || {}) });
  return apiEnvelopeToQueryResult(payload, 'Global proxy saved');
}

export async function CreateDatabase(arg1:connection.ConnectionConfig,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/create-database', { connection: toConnectionPayload(arg1), name: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Database created');
}

export async function DBConnect(arg1: connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/connections/open', toConnectionPayload(arg1));
  return apiEnvelopeToQueryResult(payload, 'Connection pool opened');
}

export async function DBGetAllColumns(arg1: connection.ConnectionConfig, arg2: string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/columns/all', { connection: toConnectionPayload(arg1), database: arg2 });
  return apiEnvelopeToQueryResult(payload, 'All columns loaded');
}

export async function DBGetColumns(arg1: connection.ConnectionConfig, arg2: string, arg3: string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/columns', tableMetadataPayload(arg1, arg2, arg3));
  return apiEnvelopeToQueryResult(payload, 'Columns loaded');
}

export async function DBGetDatabases(arg1: connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/databases', { connection: toConnectionPayload(arg1) });
  const result = apiEnvelopeToQueryResult(payload, 'Databases loaded');
  if (result.success && Array.isArray(result.data)) {
    result.data = result.data.map((row: any) => {
      if (typeof row === 'string') {
        return { Database: row, database: row };
      }
      const name = row?.Database || row?.database || row?.name || row?.schemaName;
      return name ? { ...row, Database: row.Database || name, database: row.database || name } : row;
    });
  }
  return result;
}

export async function DBGetForeignKeys(arg1:connection.ConnectionConfig,arg2:string,arg3:string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/foreign-keys', tableMetadataPayload(arg1, arg2, arg3));
  return apiEnvelopeToQueryResult(payload, 'Foreign keys loaded');
}

export async function DBGetIndexes(arg1:connection.ConnectionConfig,arg2:string,arg3:string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/indexes', tableMetadataPayload(arg1, arg2, arg3));
  return apiEnvelopeToQueryResult(payload, 'Indexes loaded');
}

export async function DBGetTables(arg1: connection.ConnectionConfig, arg2: string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/tables', { connection: toConnectionPayload(arg1), database: arg2 });
  return apiEnvelopeToTableResult(payload, arg1);
}

export async function DBGetSchemaObjects(arg1: connection.ConnectionConfig, arg2: string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/objects', { connection: toConnectionPayload(arg1), database: arg2 });
  return apiEnvelopeToTableResult(payload, arg1);
}

export async function DBGetTriggers(arg1:connection.ConnectionConfig,arg2:string,arg3:string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/triggers', tableMetadataPayload(arg1, arg2, arg3));
  return apiEnvelopeToQueryResult(payload, 'Triggers loaded');
}

export async function DBQuery(arg1: connection.ConnectionConfig, arg2: string, arg3: string): Promise<connection.QueryResult> {
  const payload = await postJson('/query', { connection: toConnectionPayload(arg1), database: arg2, sql: arg3 }, { requestSource: 'query' });
  return apiEnvelopeToQueryResult(payload, 'Query executed');
}

export async function DBQueryIsolated(arg1: connection.ConnectionConfig, arg2: string, arg3: string): Promise<connection.QueryResult> {
  return DBQuery(arg1, arg2, arg3);
}

export async function DBQueryMulti(arg1: connection.ConnectionConfig, arg2: string, arg3: string, arg4: string, requestSource = 'query'): Promise<connection.QueryResult> {
  const payload = await postJson('/query/multi', { connection: toConnectionPayload(arg1), database: arg2, sql: arg3, queryId: arg4 }, { requestSource });
  const result = apiEnvelopeToQueryResult(payload, 'Query batch executed');
  if (result.success && !Array.isArray(result.data)) {
    result.data = [];
  }
  result.queryId = arg4;
  return result;
}

export async function DBQueryWithCancel(arg1: connection.ConnectionConfig, arg2: string, arg3: string, arg4: string, requestSource = 'query'): Promise<connection.QueryResult> {
  const payload = await postJson('/query', { connection: toConnectionPayload(arg1), database: arg2, sql: arg3, queryId: arg4 }, { requestSource });
  const result = apiEnvelopeToQueryResult(payload, 'Query executed');
  result.queryId = result.queryId || arg4;
  return result;
}

export async function DBShowCreateTable(arg1: connection.ConnectionConfig, arg2: string, arg3: string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema/show-create-table', tableMetadataPayload(arg1, arg2, arg3));
  return apiEnvelopeToQueryResult(payload, 'Create table SQL loaded');
}

export async function DataSync(arg1:sync.SyncConfig): Promise<sync.SyncResult> {
  return dataOrThrow<sync.SyncResult>(await postJson('/data-sync/run', arg1 || {}), 'Data sync failed.');
}

export async function DataSyncAnalyze(arg1:sync.SyncConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/data-sync/analyze', arg1 || {});
  return apiEnvelopeToQueryResult(payload, 'Data sync analysis completed');
}

export async function DataSyncPreview(arg1:sync.SyncConfig,arg2:string,arg3:number): Promise<connection.QueryResult> {
  const payload = await postJson('/data-sync/preview', { ...(arg1 || {}), table: arg2, limit: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Data sync preview loaded');
}

export async function DataSyncCancel(jobId: string): Promise<Record<string, any>> {
  return dataOrThrow<Record<string, any>>(await postJson('/data-sync/cancel', { jobId }), 'Data sync cancel failed.');
}

export async function SchemaSyncAnalyze(arg1: schemaSync.RunConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/schema-sync/analyze', arg1 || {});
  return apiEnvelopeToQueryResult(payload, 'Schema sync analysis completed');
}

export async function SchemaSyncPreview(arg1: schemaSync.RunConfig, arg2: string): Promise<connection.QueryResult> {
  const payload = await postJson('/schema-sync/preview', { ...(arg1 || {}), table: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Schema sync preview loaded');
}

export async function SchemaSyncRun(arg1: schemaSync.RunConfig): Promise<Record<string, any>> {
  return dataOrThrow<Record<string, any>>(await postJson('/schema-sync/run', arg1 || {}), 'Schema sync failed.');
}

export async function SchemaSyncCancel(jobId: string): Promise<Record<string, any>> {
  return dataOrThrow<Record<string, any>>(await postJson('/schema-sync/cancel', { jobId }), 'Schema sync cancel failed.');
}

export async function CloseConnection(arg1:string): Promise<void> {
  const payload = await postJson('/connections/close', { connectionId: arg1 });
  if (payload?.success === false) {
    throw new Error(localizeBackendMessage(payload?.error?.message, 'Failed to close JavaNavi connection pool.'));
  }
}

export async function DeleteConnection(arg1:string): Promise<void> {
  const payload = await postJson('/connections/saved/delete', { connectionId: arg1 });
  if (payload?.success === false) {
    throw new Error(localizeBackendMessage(payload?.error?.message, 'Failed to delete JavaNavi saved connection.'));
  }
}

export async function DeleteSavedConnection(arg1:string): Promise<void> {
  return DeleteConnection(arg1);
}

export async function DownloadDriverPackage(arg1:string,arg2:string,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/download', { driverType: arg1, version: arg2, downloadURL: arg3, downloadDir: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Driver package registered');
}

export async function UploadLocalDriverPackage(arg1:string,arg2:Array<File>|FileList,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const form = new FormData();
  form.append('driverType', arg1);
  form.append('downloadDir', arg3 || '');
  form.append('version', arg4 || '');
  Array.from(arg2 || []).forEach((file) => {
    form.append('files', file, file.name);
  });
  const payload = await postMultipart('/drivers/upload-local', form);
  return apiEnvelopeToQueryResult(payload, 'Driver package uploaded');
}

export async function GetCustomDriverDefinitions(arg1:string = ''): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/custom-definitions', { downloadDir: arg1 });
  return apiEnvelopeToQueryResult(payload, 'Custom driver definitions loaded');
}

export async function ValidateCustomDriverDefinition(arg1:string,arg2:string = ''): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/custom-definitions/validate', { driverType: arg1, downloadDir: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Custom driver definition validated');
}


export async function DropDatabase(arg1:connection.ConnectionConfig,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/drop-database', { connection: toConnectionPayload(arg1), name: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Database dropped');
}

export async function DropFunction(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/drop-function', { connection: toConnectionPayload(arg1), database: arg2, name: arg4 || arg3 });
  return apiEnvelopeToQueryResult(payload, 'Function dropped');
}

export async function DropTable(arg1:connection.ConnectionConfig,arg2:string,arg3:string): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/drop-table', { connection: toConnectionPayload(arg1), database: arg2, name: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Table dropped');
}

export async function DropView(arg1:connection.ConnectionConfig,arg2:string,arg3:string): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/drop-view', { connection: toConnectionPayload(arg1), database: arg2, name: arg3 });
  return apiEnvelopeToQueryResult(payload, 'View dropped');
}

export async function DuplicateConnection(arg1:string): Promise<connection.SavedConnectionView> {
  const payload = await postJson('/connections/saved/duplicate', { connectionId: arg1 });
  if (payload?.success === false) {
    throw new Error(localizeBackendMessage(payload?.error?.message, 'Failed to duplicate JavaNavi connection.'));
  }
  return payload.data as connection.SavedConnectionView;
}

export async function ExecuteSQLFile(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/query/multi', {
    connection: toConnectionPayload(arg1),
    database: arg2,
    sql: arg3,
    queryId: arg4,
  }, { requestSource: 'sql-file' });
  const result = apiEnvelopeToQueryResult(payload, 'SQL file executed');
  if (result.success && !Array.isArray(result.data)) {
    result.data = [];
  }
  result.queryId = arg4;
  return result;
}

export async function ExportConnectionsPackage(arg1:app.ConnectionExportOptions): Promise<connection.QueryResult> {
  const payload = await postJson('/app/connections/export-package', arg1 || {});
  return apiEnvelopeToQueryResult(payload, 'Connections package exported');
}

export async function ExportData(arg1:DataRow[],arg2:Array<string>,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/files/export/data', { rows: arg1 || [], columns: arg2 || [], defaultName: arg3, format: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Data exported');
}

export async function ExportDatabaseSQL(arg1:connection.ConnectionConfig,arg2:string,arg3:boolean): Promise<connection.QueryResult> {
  const payload = await postJson('/files/export/database-sql', { connection: toConnectionPayload(arg1), database: arg2, includeData: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Database SQL exported');
}

export async function ExportQuery(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:string,arg5:string): Promise<connection.QueryResult> {
  const payload = await postJson('/files/export/query', { connection: toConnectionPayload(arg1), database: arg2, query: arg3, defaultName: arg4, format: arg5 });
  return apiEnvelopeToQueryResult(payload, 'Query exported');
}

export async function ExportTable(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/files/export/table', { connection: toConnectionPayload(arg1), database: arg2, table: arg3, format: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Table exported');
}

export async function ExportTablesDataSQL(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string>): Promise<connection.QueryResult> {
  const payload = await postJson('/files/export/tables-data-sql', { connection: toConnectionPayload(arg1), database: arg2, tables: arg3 || [] });
  return apiEnvelopeToQueryResult(payload, 'Tables data SQL exported');
}

export async function ExportTablesSQL(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string>,arg4:boolean): Promise<connection.QueryResult> {
  const payload = await postJson('/files/export/tables-sql', { connection: toConnectionPayload(arg1), database: arg2, tables: arg3 || [], includeData: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Tables SQL exported');
}

export async function GetAppInfo(): Promise<connection.QueryResult> {
  const payload = await getJson('/app/info');
  return apiEnvelopeToQueryResult(payload, 'App info loaded');
}

export async function GetDataRootDirectoryInfo(): Promise<connection.QueryResult> {
  const payload = await getJson('/app/data-root');
  return apiEnvelopeToQueryResult(payload, 'Data root loaded');
}

export async function GetDriverStatusList(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/status', { downloadDir: arg1, manifestURL: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Driver status loaded');
}

export async function GetDriverVersionList(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/versions', { driverType: arg1, repositoryURL: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Driver versions loaded');
}

export async function GetDriverVersionPackageSize(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/package-size', { driverType: arg1, version: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Driver package size loaded');
}

export async function GetGlobalProxyConfig(): Promise<connection.QueryResult> {
  const payload = await getJson('/app/global-proxy');
  return apiEnvelopeToQueryResult(payload, 'Global proxy loaded');
}

export async function GetLanguage(): Promise<connection.QueryResult> {
  const payload = await getJson('/app/language');
  return apiEnvelopeToQueryResult(payload, 'Language loaded');
}

export async function GetSavedConnections(): Promise<Array<connection.SavedConnectionView>> {
  const payload = await postJson('/connections/saved/list', {});
  if (payload?.success === false) {
    throw new Error(localizeBackendMessage(payload?.error?.message, 'Failed to load JavaNavi saved connections.'));
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function ImportConnectionsPayload(arg1:string,arg2:string): Promise<Array<connection.SavedConnectionView>> {
  const payload = await postJson('/app/connections/import-payload', {
    raw: arg1 || '',
    password: arg2 || '',
  });
  if (payload?.success === false) {
    throw new Error(localizeBackendMessage(payload?.error?.message, 'Failed to import JavaNavi saved connections.'));
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function UploadImportFile(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:File): Promise<connection.QueryResult> {
  const body = new FormData();
  body.append('database', arg2 || '');
  body.append('table', arg3 || '');
  body.append('tableName', arg3 || '');
  body.append('file', arg4);
  const payload = await postMultipart('/files/import/upload', body);
  return apiEnvelopeToQueryResult(payload, 'Import file uploaded');
}

export async function ImportDataWithProgress(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:string,arg5 = false): Promise<connection.QueryResult> {
  const payload = await postJson('/files/import/run', { connection: toConnectionPayload(arg1), database: arg2, table: arg3, filePath: arg4, applyToDatabase: arg5 });
  return apiEnvelopeToQueryResult(payload, 'Import completed');
}

export async function InstallLocalDriverPackage(arg1:string,arg2:string,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/install-local', { driverType: arg1, filePath: arg2, downloadDir: arg3, version: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Local driver package registered');
}

export async function ResolveSQLWorkspace(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/app/sql-workspace/resolve', { connectionId: arg1, dbName: arg2 });
  return apiEnvelopeToQueryResult(payload, 'SQL workspace resolved');
}

export async function ListSQLDirectory(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/app/sql-directory/list', { path: arg1 });
  return apiEnvelopeToQueryResult(payload, 'SQL directory loaded');
}

export async function LogWindowDiagnostic(arg1: string, arg2: string): Promise<void> {
  const payload = await postJson('/app/diagnostics/window', { stage: arg1, payload: arg2 });
  if (payload?.success === false) {
    throw new Error(localizeBackendMessage(payload?.error?.message, 'Failed to log JavaNavi window diagnostic.'));
  }
}

export async function MongoDiscoverMembers(arg1:connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/mongodb/discover-members', { connection: toConnectionPayload(arg1) });
  return apiEnvelopeToQueryResult(payload, 'MongoDB members discovered');
}

export async function MySQLConnect(arg1: connection.ConnectionConfig): Promise<connection.QueryResult> {
  return DBConnect(arg1);
}

export async function MySQLGetDatabases(arg1: connection.ConnectionConfig): Promise<connection.QueryResult> {
  return DBGetDatabases(arg1);
}

export async function MySQLGetTables(arg1: connection.ConnectionConfig, arg2: string): Promise<connection.QueryResult> {
  return DBGetTables(arg1, arg2);
}

export async function MySQLQuery(arg1: connection.ConnectionConfig, arg2: string, arg3: string): Promise<connection.QueryResult> {
  return DBQuery(arg1, arg2, arg3);
}

export async function MySQLShowCreateTable(arg1: connection.ConnectionConfig, arg2: string, arg3: string): Promise<connection.QueryResult> {
  return DBShowCreateTable(arg1, arg2, arg3);
}

export async function OpenDriverDownloadDirectory(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/download-directory/open', { path: arg1 });
  return apiEnvelopeToQueryResult(payload, 'Driver download directory resolved');
}

export async function OpenSQLFile(): Promise<connection.QueryResult> {
  const payload = await postJson('/files/sql/open', {});
  return apiEnvelopeToQueryResult(payload, 'SQL file opened');
}

export async function PreviewImportFile(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/files/import/preview', { filePath: arg1 });
  return apiEnvelopeToQueryResult(payload, 'Import preview loaded');
}

export async function ReadSQLFile(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/app/sql-file/read', { path: arg1 });
  return apiEnvelopeToQueryResult(payload, 'SQL file loaded');
}

export async function UploadSQLFile(arg1:string,arg2:File): Promise<connection.QueryResult> {
  const body = new FormData();
  body.append('directoryPath', arg1 || '');
  body.append('file', arg2);
  const payload = await postMultipart('/app/sql-file/upload', body);
  return apiEnvelopeToQueryResult(payload, 'SQL file uploaded');
}

export async function WriteSQLFile(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/app/sql-file/write', { path: arg1, content: arg2 });
  return apiEnvelopeToQueryResult(payload, 'SQL file saved');
}

export async function CreateSQLDirectory(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/app/sql-directory/create', { parentPath: arg1, name: arg2 });
  return apiEnvelopeToQueryResult(payload, 'SQL directory created');
}

export async function RenameSQLWorkspacePath(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/app/sql-path/rename', { path: arg1, newName: arg2 });
  return apiEnvelopeToQueryResult(payload, 'SQL workspace path renamed');
}

export async function RedisConnect(arg1:connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/connect', { connection: toConnectionPayload(arg1) });
  return apiEnvelopeToQueryResult(payload, 'Redis connection tested');
}

export async function RedisDeleteHashField(arg1:connection.ConnectionConfig,arg2:string,arg3:RedisHashFieldsInput): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/hash/field/delete', { connection: toConnectionPayload(arg1), key: arg2, fields: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Redis hash field deleted');
}

export async function RedisDeleteKeys(arg1:connection.ConnectionConfig,arg2:Array<string>): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/keys/delete', { connection: toConnectionPayload(arg1), keys: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Redis keys deleted');
}

export async function RedisExecuteCommand(arg1:connection.ConnectionConfig,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/command/execute', { connection: toConnectionPayload(arg1), command: arg2 });
  const result = apiEnvelopeToQueryResult(payload, 'Redis command executed');
  if (result.success && result.data && Object.prototype.hasOwnProperty.call(result.data, 'result')) result.data = result.data.result;
  return result;
}

export async function RedisFlushDB(arg1:connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/flush-db', { connection: toConnectionPayload(arg1) });
  return apiEnvelopeToQueryResult(payload, 'Redis database flushed');
}

export async function RedisGetDatabases(arg1:connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/databases', { connection: toConnectionPayload(arg1) });
  return apiEnvelopeToQueryResult(payload, 'Redis databases loaded');
}

export async function RedisGetServerInfo(arg1:connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/server-info', { connection: toConnectionPayload(arg1) });
  return apiEnvelopeToQueryResult(payload, 'Redis server info loaded');
}

export async function RedisGetValue(arg1:connection.ConnectionConfig,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/value', { connection: toConnectionPayload(arg1), key: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Redis value loaded');
}

export async function RedisKeyExists(arg1:connection.ConnectionConfig,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/key-exists', { connection: toConnectionPayload(arg1), key: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Redis key existence checked');
}

export async function RedisListPush(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string> | RedisListPushOptions): Promise<connection.QueryResult> {
  const valuesArg = arg3;
  const payload = await postJson('/redis/list/push', { connection: toConnectionPayload(arg1), key: arg2, values: Array.isArray(valuesArg) ? valuesArg : valuesArg.values, position: Array.isArray(valuesArg) ? 'right' : valuesArg.position });
  return apiEnvelopeToQueryResult(payload, 'Redis list item added');
}

export async function RedisListSet(arg1:connection.ConnectionConfig,arg2:string,arg3:number,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/list/set', { connection: toConnectionPayload(arg1), key: arg2, index: arg3, value: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Redis list item updated');
}

export async function RedisRenameKey(arg1:connection.ConnectionConfig,arg2:string,arg3:string): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/key/rename', { connection: toConnectionPayload(arg1), oldKey: arg2, newKey: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Redis key renamed');
}

export async function RedisScanKeys(arg1:connection.ConnectionConfig,arg2:string,arg3:RedisCursor,arg4:number): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/keys/scan', { connection: toConnectionPayload(arg1), pattern: arg2, cursor: arg3, count: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Redis keys scanned');
}

export async function RedisSelectDB(arg1:connection.ConnectionConfig,arg2:number): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/select-db', { connection: toConnectionPayload(arg1), dbIndex: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Redis database selected');
}

export async function RedisSetAdd(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string>): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/set/add', { connection: toConnectionPayload(arg1), key: arg2, members: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Redis set members added');
}

export async function RedisSetHashField(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/hash/field/set', { connection: toConnectionPayload(arg1), key: arg2, field: arg3, value: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Redis hash field set');
}

export async function RedisSetRemove(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string>): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/set/remove', { connection: toConnectionPayload(arg1), key: arg2, members: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Redis set members removed');
}

export async function RedisSetString(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:number): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/string/set', { connection: toConnectionPayload(arg1), key: arg2, value: arg3, ttl: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Redis string set');
}

export async function RedisSetTTL(arg1:connection.ConnectionConfig,arg2:string,arg3:number): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/ttl/set', { connection: toConnectionPayload(arg1), key: arg2, ttl: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Redis TTL set');
}

export async function RedisStreamAdd(arg1:connection.ConnectionConfig,arg2:string,arg3:Record<string, string>,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/stream/add', { connection: toConnectionPayload(arg1), key: arg2, fields: arg3, id: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Redis stream entry added');
}

export async function RedisStreamDelete(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string>): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/stream/delete', { connection: toConnectionPayload(arg1), key: arg2, ids: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Redis stream entries deleted');
}

export async function RedisTestConnection(arg1:connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/test', { connection: toConnectionPayload(arg1) });
  return apiEnvelopeToQueryResult(payload, 'Redis connection tested');
}

export async function RedisZSetAdd(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<redis.ZSetMember>): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/zset/add', { connection: toConnectionPayload(arg1), key: arg2, members: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Redis sorted set members added');
}

export async function RedisZSetRemove(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string>): Promise<connection.QueryResult> {
  const payload = await postJson('/redis/zset/remove', { connection: toConnectionPayload(arg1), key: arg2, members: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Redis sorted set members removed');
}

export async function RemoveDriverPackage(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/remove', { driverType: arg1, downloadDir: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Driver package removed');
}

export async function RenameDatabase(arg1:connection.ConnectionConfig,arg2:string,arg3:string): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/rename-database', { connection: toConnectionPayload(arg1), name: arg2, newName: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Database renamed');
}

export async function RenameTable(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/rename-table', { connection: toConnectionPayload(arg1), database: arg2, name: arg3, newName: arg4 });
  return apiEnvelopeToQueryResult(payload, 'Table renamed');
}

export async function RenameView(arg1:connection.ConnectionConfig,arg2:string,arg3:string,arg4:string): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/rename-view', { connection: toConnectionPayload(arg1), database: arg2, name: arg3, newName: arg4 });
  return apiEnvelopeToQueryResult(payload, 'View renamed');
}

export async function ResolveDriverDownloadDirectory(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/download-directory/resolve', { path: arg1 });
  return apiEnvelopeToQueryResult(payload, 'Driver download directory resolved');
}

export async function ResolveDriverPackageDownloadURL(arg1:string,arg2:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/package-url/resolve', { driverType: arg1, repositoryURL: arg2 });
  return apiEnvelopeToQueryResult(payload, 'Driver package URL resolved');
}

export async function ResolveDriverRepositoryURL(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/drivers/repository/resolve', { repositoryURL: arg1 });
  return apiEnvelopeToQueryResult(payload, 'Driver repository URL resolved');
}

export async function SaveConnection(arg1:connection.SavedConnectionInput): Promise<connection.SavedConnectionView> {
  const payload = await postJson('/connections/saved/save', arg1);
  if (payload?.success === false) {
    throw new Error(localizeBackendMessage(payload?.error?.message, 'Failed to save JavaNavi connection.'));
  }
  return payload.data as connection.SavedConnectionView;
}

export async function SaveGlobalProxy(arg1:connection.SaveGlobalProxyInput): Promise<connection.GlobalProxyView> {
  return dataOrThrow<connection.GlobalProxyView>(await postJson('/app/global-proxy', arg1 || {}), 'Failed to save global proxy.');
}

export async function SaveLanguage(arg1:string): Promise<connection.QueryResult> {
  return apiEnvelopeToQueryResult(await postJson('/app/language', { language: arg1 }), 'Language saved');
}

export async function SelectSQLDirectory(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/app/sql-directory/select', { currentPath: arg1 });
  return apiEnvelopeToQueryResult(payload, 'SQL workspace directory selected');
}

export async function SelectSSHKeyFile(arg1:string): Promise<connection.QueryResult> {
  const payload = await postJson('/files/ssh-key/select', { currentPath: arg1 });
  return apiEnvelopeToQueryResult(payload, 'SSH key file placeholder selected');
}

export async function SetMacNativeWindowControls(arg1: boolean): Promise<void> {
  return;
}

export async function SetWindowTranslucency(arg1: number, arg2: number): Promise<void> {
  return;
}

export async function TestConnection(arg1: connection.ConnectionConfig): Promise<connection.QueryResult> {
  const payload = await postJson('/connections/test', toConnectionPayload(arg1));
  return apiEnvelopeToQueryResult(payload, 'Connection test completed');
}

export async function TruncateTables(arg1:connection.ConnectionConfig,arg2:string,arg3:Array<string>): Promise<connection.QueryResult> {
  const payload = await postJson('/ddl/truncate-tables', { connection: toConnectionPayload(arg1), database: arg2, tables: arg3 });
  return apiEnvelopeToQueryResult(payload, 'Tables truncated');
}
