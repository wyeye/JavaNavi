import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Form, Select, Input, Button, message, Steps, Transfer, Card, Alert, Divider, Typography, Progress, Checkbox, Table, Drawer, Tabs, theme as antdTheme, Tag, Collapse } from 'antd';
import { DatabaseOutlined, RocketOutlined, SwapOutlined, TableOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { translate, type I18nKey } from '../i18n';
import { DBGetDatabases, DBGetTables, DataSync, DataSyncAnalyze, DataSyncPreview, DataSyncCancel, SchemaSyncAnalyze, SchemaSyncPreview, SchemaSyncRun, SchemaSyncCancel } from '@compat/javanaviApp';
import { SavedConnection } from '../types';
import { EventsOn } from '@compat/runtime';
import { isMacLikePlatform, normalizeOpacityForPlatform, resolveAppearanceValues, resolveTextInputSafeBackdropFilter } from '../utils/appearance';
import { resolveDataSourceType } from '../utils/dataSourceCapabilities';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { buildDataSyncExecutionRiskSummary, buildSchemaSyncExecutionRiskSummary, type DataModificationRiskSummary } from '../utils/dataModificationRisk';
import { formatLocalDateTimeLiteral, normalizeTemporalLiteralText } from './dataGrid/dataGridCopyInsert';
import { buildDataSyncRequest, type DataSyncRequestPayload, type SourceDatasetMode, validateDataSyncSelection } from './dataSyncRequest';
import { buildSchemaSyncAnalyzeRequest, buildSchemaSyncPreviewRequest, buildSchemaSyncRunRequest, type SchemaSyncRequestPayload, validateSchemaSyncSelection } from './schemaSyncRequest';
import type { connection, schemaSync, sync } from '@compat/models';

const { Title, Text } = Typography;
const { Step } = Steps;
const { Option } = Select;
const { TextArea } = Input;

const RELATIONAL_SYNC_TYPES = new Set([
  'demo', 'h2', 'mysql', 'mariadb', 'diros', 'sphinx', 'postgres', 'kingbase', 'highgo', 'vastbase',
  'sqlserver', 'sqlite', 'duckdb', 'oracle', 'dameng', 'tdengine', 'clickhouse',
]);

type SyncLogEvent = { jobId: string; level?: string; message?: string; ts?: number };
type SyncProgressEvent = { jobId: string; percent?: number; current?: number; total?: number; table?: string; stage?: string };
type SyncLogItem = { level: string; message: string; ts?: number };
type JsonRecord = Record<string, unknown>;
type SqlLiteralValue = string | number | boolean | bigint | Date | JsonRecord | null | undefined;
type QueryRow = Record<string, SqlLiteralValue>;
type QueryResultWithData<T> = Omit<connection.QueryResult, 'data'> & { data: T };
type DatabaseRow = { Database?: string; database?: string; username?: string };
type TableRow = { Table?: string; table?: string; TABLE_NAME?: string } & Record<string, unknown>;
type TableDiffSummary = {
  table: string;
  pkColumn?: string;
  canSync?: boolean;
  inserts?: number;
  updates?: number;
  deletes?: number;
  same?: number;
  schemaDiffCount?: number;
  message?: string;
  targetTableExists?: boolean;
  plannedAction?: string;
  warnings?: string[];
  unsupportedObjects?: string[];
  indexesToCreate?: number;
  indexesSkipped?: number;
};
type TableOps = {
  insert: boolean;
  update: boolean;
  delete: boolean;
  selectedInsertPks?: string[];
  selectedUpdatePks?: string[];
  selectedDeletePks?: string[];
};
type TableOpsValue = TableOps[keyof TableOps];

type WorkflowType = 'sync' | 'migration';
type SyncDomain = 'data' | 'schema';
type SchemaDiffItem = schemaSync.DiffItem;
type SchemaDiffTable = schemaSync.TableDiff;
type SchemaDiffRow = SchemaDiffItem & { table: string; targetTableExists?: boolean };
type DataPreviewInsertRow = { pk: string | number; row: QueryRow; key?: string | number };
type DataPreviewUpdateRow = { pk: string | number; changedColumns?: string[]; source: QueryRow; target: QueryRow; key?: string | number };
type DataPreviewDeleteRow = { pk: string | number; row: QueryRow; key?: string | number };
type DataPreviewData = {
  table?: string;
  pkColumn?: string;
  columnTypes?: Record<string, string>;
  schemaSummary?: string;
  schemaWarnings?: string[];
  schemaStatements?: string[];
  totalInserts?: number;
  totalUpdates?: number;
  totalDeletes?: number;
  inserts?: DataPreviewInsertRow[];
  updates?: DataPreviewUpdateRow[];
  deletes?: DataPreviewDeleteRow[];
  insertRows?: DataPreviewInsertRow[];
  updateRows?: DataPreviewUpdateRow[];
  deleteRows?: DataPreviewDeleteRow[];
  limit?: number;
  hasMore?: boolean;
  message?: string;
};
type SchemaPreviewData = {
  success?: boolean;
  message?: string;
  table?: string;
  schemaSummary?: string;
  schemaStatements?: string[];
  items?: SchemaDiffItem[];
  selectedItemIds?: string[];
  deleteItemIds?: string[];
  warnings?: string[];
  hasMore?: boolean;
};
type SyncExecutionRiskSummary = DataModificationRiskSummary;

type SyncExecutionResult = {
  success: boolean;
  message: string;
  logs: string[];
  cancelled?: boolean;
  tablesSynced?: number;
  rowsInserted?: number;
  rowsUpdated?: number;
  rowsDeleted?: number;
  totalRows?: number;
  syncedRows?: number;
  jobId?: string;
  tables?: string[];
  dryRun?: boolean;
  fixtureBacked?: boolean;
  warnings?: string[];
  itemsExecuted?: number;
  itemsSkipped?: number;
  missingDeleteConfirmItemIds?: string[];
};

const quoteSqlIdent = (dbType: string, ident: string): string => {
  const raw = String(ident || '').trim();
  if (!raw) return raw;
  const t = String(dbType || '').toLowerCase();
  if (t === 'mysql' || t === 'mariadb' || t === 'diros' || t === 'sphinx' || t === 'clickhouse' || t === 'tdengine') {
    return `\`${raw.replace(/`/g, '``')}\``;
  }
  if (t === 'sqlserver') {
    return `[${raw.replace(/]/g, ']]')}]`;
  }
  return `"${raw.replace(/"/g, '""')}"`;
};

const quoteSqlTable = (dbType: string, tableName: string): string => {
  const raw = String(tableName || '').trim();
  if (!raw) return raw;
  if (!raw.includes('.')) return quoteSqlIdent(dbType, raw);
  return raw
    .split('.')
    .map((part) => quoteSqlIdent(dbType, part))
    .join('.');
};

const toSqlLiteral = (value: SqlLiteralValue, dbType: string): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') {
    const t = String(dbType || '').toLowerCase();
    if (t === 'sqlserver') return value ? '1' : '0';
    return value ? 'TRUE' : 'FALSE';
  }
  if (value instanceof Date) {
    return `'${formatLocalDateTimeLiteral(value).replace(/'/g, "''")}'`;
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (typeof value === 'object') {
    try {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    } catch {
      return `'${String(value).replace(/'/g, "''")}'`;
    }
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

const toTypedSqlLiteral = (value: SqlLiteralValue, dbType: string, columnType?: string): string => {
  if (typeof value === 'string') {
    const normalized = normalizeTemporalLiteralText(value, columnType, false);
    return toSqlLiteral(normalized, dbType);
  }
  if (value instanceof Date) {
    const normalized = String(columnType || '').trim()
      ? formatLocalDateTimeLiteral(value)
      : value.toISOString();
    return toSqlLiteral(normalized, dbType);
  }
  return toSqlLiteral(value, dbType);
};

const resolveRedisDbIndex = (raw?: string): number => {
  const value = Number(String(raw || '').trim());
  return Number.isInteger(value) && value >= 0 && value <= 15 ? value : 0;
};

const buildSqlPreview = (
  previewData: DataPreviewData | null,
  tableName: string,
  dbType: string,
  ops?: TableOps,
): { sqlText: string; statementCount: number } => {
  if (!previewData || !tableName) return { sqlText: '', statementCount: 0 };
  const tableExpr = quoteSqlTable(dbType, tableName);
  const pkCol = String(previewData.pkColumn || 'id');
  const columnTypesByLowerName = previewData?.columnTypes && typeof previewData.columnTypes === 'object'
    ? previewData.columnTypes as Record<string, string>
    : {};
  const statements: string[] = [];
  const schemaStatements = Array.isArray(previewData.schemaStatements)
    ? previewData.schemaStatements
        .map((item) => String(item || '').trim())
        .filter((item: string) => item.length > 0)
    : [];

  schemaStatements.forEach((statement: string) => {
    statements.push(statement.endsWith(';') ? statement : `${statement};`);
  });

  const insertRows = Array.isArray(previewData.inserts) ? previewData.inserts : [];
  const updateRows = Array.isArray(previewData.updates) ? previewData.updates : [];
  const deleteRows = Array.isArray(previewData.deletes) ? previewData.deletes : [];

  const selectedInsert = new Set((ops?.selectedInsertPks || []).map((v) => String(v)));
  const selectedUpdate = new Set((ops?.selectedUpdatePks || []).map((v) => String(v)));
  const selectedDelete = new Set((ops?.selectedDeletePks || []).map((v) => String(v)));

  if (ops?.insert !== false) {
    insertRows.forEach((rowWrap: DataPreviewInsertRow) => {
      const pk = String(rowWrap?.pk ?? '');
      if (selectedInsert.size > 0 && !selectedInsert.has(pk)) return;
      const row = rowWrap?.row || {};
      const columns = Object.keys(row);
      if (columns.length === 0) return;
      const colExpr = columns.map((c) => quoteSqlIdent(dbType, c)).join(', ');
      const valExpr = columns.map((c) => toTypedSqlLiteral(row[c], dbType, columnTypesByLowerName[String(c).toLowerCase()])).join(', ');
      statements.push(`INSERT INTO ${tableExpr} (${colExpr}) VALUES (${valExpr});`);
    });
  }

  if (ops?.update !== false) {
    updateRows.forEach((rowWrap: DataPreviewUpdateRow) => {
      const pk = String(rowWrap?.pk ?? '');
      if (selectedUpdate.size > 0 && !selectedUpdate.has(pk)) return;
      const source = rowWrap?.source || {};
      const changedColumns = Array.isArray(rowWrap?.changedColumns)
        ? rowWrap.changedColumns
        : Object.keys(source).filter((k) => k !== pkCol);
      const setCols = changedColumns.filter((c: string) => String(c) !== pkCol);
      if (setCols.length === 0) return;
      const setExpr = setCols
        .map((c: string) => `${quoteSqlIdent(dbType, c)} = ${toTypedSqlLiteral(source[c], dbType, columnTypesByLowerName[String(c).toLowerCase()])}`)
        .join(', ');
      statements.push(
        `UPDATE ${tableExpr} SET ${setExpr} WHERE ${quoteSqlIdent(dbType, pkCol)} = ${toTypedSqlLiteral(pk, dbType, columnTypesByLowerName[String(pkCol).toLowerCase()])};`,
      );
    });
  }

  if (ops?.delete) {
    deleteRows.forEach((rowWrap: DataPreviewDeleteRow) => {
      const pk = String(rowWrap?.pk ?? '');
      if (selectedDelete.size > 0 && !selectedDelete.has(pk)) return;
      statements.push(
        `DELETE FROM ${tableExpr} WHERE ${quoteSqlIdent(dbType, pkCol)} = ${toTypedSqlLiteral(pk, dbType, columnTypesByLowerName[String(pkCol).toLowerCase()])};`,
      );
    });
  }

  return {
    sqlText: statements.join('\n'),
    statementCount: statements.length,
  };
};

const DataSyncModal: React.FC<{ open: boolean; initialDomain?: SyncDomain; onClose: () => void }> = ({ open, initialDomain = 'data', onClose }) => {
  const connections = useStore((state) => state.connections);
  const themeMode = useStore((state) => state.theme);
  const appearance = useStore((state) => state.appearance);
  const language = useStore((state) => state.language);
  const t = useMemo(() => (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const { token } = antdTheme.useToken();
  const darkMode = themeMode === 'dark';
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const effectiveOpacity = normalizeOpacityForPlatform(resolvedAppearance.opacity);
  const disableLocalBackdropFilter = isMacLikePlatform();
  
  // Step 1: Config
  const [sourceConnId, setSourceConnId] = useState<string>('');
  const [targetConnId, setTargetConnId] = useState<string>('');
  const [sourceDb, setSourceDb] = useState<string>('');
  const [targetDb, setTargetDb] = useState<string>('');
  
  const [sourceDbs, setSourceDbs] = useState<string[]>([]);
  const [targetDbs, setTargetDbs] = useState<string[]>([]);

  // Step 2: Tables
  const [allTables, setAllTables] = useState<string[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [sourceDatasetMode, setSourceDatasetMode] = useState<SourceDatasetMode>('table');
  const [sourceQuery, setSourceQuery] = useState<string>('');

  // Options
  const [workflowType, setWorkflowType] = useState<WorkflowType>('sync');
  const [syncDomain, setSyncDomain] = useState<SyncDomain>('data');
  const [syncContent, setSyncContent] = useState<'data' | 'schema' | 'both'>('data');
  const [syncMode, setSyncMode] = useState<string>('insert_update');
  const [autoAddColumns, setAutoAddColumns] = useState<boolean>(true);
  const [targetTableStrategy, setTargetTableStrategy] = useState<'existing_only' | 'auto_create_if_missing' | 'smart'>('existing_only');
  const [createIndexes, setCreateIndexes] = useState<boolean>(false);
  const [showSameTables, setShowSameTables] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [diffTables, setDiffTables] = useState<TableDiffSummary[]>([]);
  const [tableOptions, setTableOptions] = useState<Record<string, TableOps>>({});
  const [schemaDiffTables, setSchemaDiffTables] = useState<SchemaDiffTable[]>([]);
  const [schemaSelectedItemIds, setSchemaSelectedItemIds] = useState<string[]>([]);
  const [schemaConfirmedDeleteItemIds, setSchemaConfirmedDeleteItemIds] = useState<string[]>([]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTable, setPreviewTable] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewActiveTab, setPreviewActiveTab] = useState<string>('insert');
  const [previewData, setPreviewData] = useState<DataPreviewData | null>(null);
  const [schemaPreviewData, setSchemaPreviewData] = useState<SchemaPreviewData | null>(null);

  // Step 3: Result
  const [syncResult, setSyncResult] = useState<SyncExecutionResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [schemaRunning, setSchemaRunning] = useState(false);
  const [syncLogs, setSyncLogs] = useState<SyncLogItem[]>([]);
  const [syncProgress, setSyncProgress] = useState<{ percent: number; current: number; total: number; table: string; stage: string }>({
      percent: 0,
      current: 0,
      total: 0,
      table: '',
      stage: ''
  });
  const jobIdRef = useRef<string>('');
  const logBoxRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const normalizeConnConfig = (conn: SavedConnection, database?: string) => (
      buildRpcConnectionConfig(conn.config, {
          database: typeof database === 'string' ? database : (conn.config.database || ''),
      })
  );

  const dataSyncConfig = (config: DataSyncRequestPayload): sync.SyncConfig => config;
  const schemaSyncConfig = (config: SchemaSyncRequestPayload): schemaSync.RunConfig => config;
  const databaseNames = (rows: unknown): string[] => (
      Array.isArray(rows) ? rows as DatabaseRow[] : []
  )
      .map((row) => row.Database || row.database || row.username)
      .filter((name): name is string => typeof name === 'string' && name.trim() !== '');
  const tableNames = (rows: unknown): string[] => (
      Array.isArray(rows) ? rows as TableRow[] : []
  )
      .map((row) => row.Table || row.table || row.TABLE_NAME || Object.values(row || {})[0])
      .filter((name): name is string => typeof name === 'string' && name.trim() !== '');
  const syncLogsFromResult = (logs: unknown, level: SyncLogItem['level']): SyncLogItem[] => (
      Array.isArray(logs) ? logs : []
  ).map((log) => ({ level, message: String(log || '') }));

  const logErrorTokens = useMemo(() => t('dataSync.log.errorTokens')
      .split('|')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean), [t]);
  const logWarnTokens = useMemo(() => t('dataSync.log.warnTokens')
      .split('|')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean), [t]);

  useEffect(() => {
      if (!open) return;

      const offLog = EventsOn('sync:log', (event: SyncLogEvent) => {
          if (!event || event.jobId !== jobIdRef.current) return;
          const msg = String(event.message || '').trim();
          if (!msg) return;
          setSyncLogs(prev => [...prev, { level: String(event.level || 'info'), message: msg, ts: event.ts }]);
      });

      const offProgress = EventsOn('sync:progress', (event: SyncProgressEvent) => {
          if (!event || event.jobId !== jobIdRef.current) return;
          setSyncProgress(prev => ({
              percent: typeof event.percent === 'number' ? event.percent : prev.percent,
              current: typeof event.current === 'number' ? event.current : prev.current,
              total: typeof event.total === 'number' ? event.total : prev.total,
              table: typeof event.table === 'string' ? event.table : prev.table,
              stage: typeof event.stage === 'string' ? event.stage : prev.stage,
          }));
      });

      return () => {
          offLog();
          offProgress();
      };
  }, [open]);

  useEffect(() => {
      if (!logBoxRef.current) return;
      if (!autoScrollRef.current) return;
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [syncLogs]);

  useEffect(() => {
    if (open) {
        setCurrentStep(0);
        setSourceConnId('');
        setTargetConnId('');
        setSourceDb('');
        setTargetDb('');
        setAllTables([]);
        setSelectedTables([]);
        setSourceDatasetMode('table');
        setSourceQuery('');
        setWorkflowType('sync');
        setSyncDomain(initialDomain);
        setSyncContent(initialDomain);
        setSyncMode('insert_update');
        setAutoAddColumns(true);
        setTargetTableStrategy('existing_only');
        setCreateIndexes(false);
        setShowSameTables(false);
        setAnalyzing(false);
        setDiffTables([]);
        setTableOptions({});
        setSchemaDiffTables([]);
        setSchemaSelectedItemIds([]);
        setSchemaConfirmedDeleteItemIds([]);
        setPreviewOpen(false);
        setPreviewTable('');
        setPreviewLoading(false);
        setPreviewActiveTab('insert');
        setPreviewData(null);
        setSchemaPreviewData(null);
        setSyncResult(null);
        setSyncing(false);
        setSchemaRunning(false);
        setSyncLogs([]);
        setSyncProgress({ percent: 0, current: 0, total: 0, table: '', stage: '' });
        jobIdRef.current = '';
        autoScrollRef.current = true;
    }
  }, [open, initialDomain]);

  useEffect(() => {
      if (workflowType === 'migration') {
          if (syncMode === 'insert_update') {
              setSyncMode('insert_only');
          }
          if (syncContent === 'schema') {
              setSyncContent('both');
          }
          if (targetTableStrategy === 'existing_only') {
              setTargetTableStrategy('smart');
          }
          if (!createIndexes) {
              setCreateIndexes(true);
          }
      } else {
          if (targetTableStrategy !== 'existing_only') {
              setTargetTableStrategy('existing_only');
          }
          if (createIndexes) {
              setCreateIndexes(false);
          }
      }
  }, [workflowType]);

  useEffect(() => {
      if (sourceDatasetMode !== 'query') return;
      if (workflowType !== 'sync') {
          setWorkflowType('sync');
      }
      if (syncContent !== 'data') {
          setSyncContent('data');
      }
      if (targetTableStrategy !== 'existing_only') {
          setTargetTableStrategy('existing_only');
      }
      if (createIndexes) {
          setCreateIndexes(false);
      }
      if (autoAddColumns) {
          setAutoAddColumns(false);
      }
      if (selectedTables.length > 1) {
          setSelectedTables(selectedTables.slice(0, 1));
      }
  }, [sourceDatasetMode, workflowType, syncContent, targetTableStrategy, createIndexes, autoAddColumns, selectedTables]);

  const handleSourceConnChange = async (connId: string) => {
      setSourceConnId(connId);
      setSourceDb('');
      const conn = connections.find(c => c.id === connId);
	  if (conn) {
	      setLoading(true);
	      try {
	        const res = await DBGetDatabases(normalizeConnConfig(conn));
	        if (res.success) {
	            setSourceDbs(databaseNames(res.data));
	        }
	      } catch(e) { message.error(t('dataSync.error.fetchSourceDatabases')); }
	      setLoading(false);
	  }
  };

  const handleTargetConnChange = async (connId: string) => {
      setTargetConnId(connId);
      setTargetDb('');
      const conn = connections.find(c => c.id === connId);
	  if (conn) {
	      setLoading(true);
	      try {
	        const res = await DBGetDatabases(normalizeConnConfig(conn));
	        if (res.success) {
	            setTargetDbs(databaseNames(res.data));
	        }
	      } catch(e) { message.error(t('dataSync.error.fetchTargetDatabases')); }
	      setLoading(false);
	  }
  };

  const nextToTables = async (advance = true) => {
      if (!sourceConnId || !targetConnId) return message.error(t('dataSync.error.selectConnectionsFirst'));
      if (!sourceDb) return message.error(t('dataSync.error.selectSourceDatabase'));
      if (!targetDb) return message.error(t('dataSync.error.selectTargetDatabase'));
      if (!selectedConnectionsAreRelational) return message.error(t('dataSync.error.relationalOnly'));

      setLoading(true);
      try {
          const connId = isSourceQueryMode ? targetConnId : sourceConnId;
          const dbName = isSourceQueryMode ? targetDb : sourceDb;
          const conn = connections.find(c => c.id === connId);
          if (conn) {
	          const config = normalizeConnConfig(conn, dbName);
	          const res = await DBGetTables(config, dbName);
	          if (res.success) {
	              // DBGetTables returns [{Table: "name"}, ...]
	              const tables = tableNames(res.data);
	              setAllTables(tables as string[]);
                  setSelectedTables(prev => {
                      const existing = prev.filter((name) => tables.includes(name));
                      if (isSourceQueryMode) {
                          return existing.slice(0, 1);
                      }
                      return existing;
                  });
                  if (advance) {
                      setCurrentStep(1);
                  }
	          } else {
                  message.error(res.message);
              }
          }
      } catch (e) { message.error(t('dataSync.error.fetchTables')); }
      setLoading(false);
  };

  const updateTableOption = (table: string, key: keyof TableOps, value: TableOpsValue) => {
      setTableOptions(prev => ({
          ...prev,
          [table]: { ...(prev[table] || { insert: true, update: true, delete: false }), [key]: value }
      }));
  };

  const updateSchemaItemSelection = (itemId: string, checked: boolean) => {
      setSchemaSelectedItemIds(prev => {
          if (checked) {
              return prev.includes(itemId) ? prev : [...prev, itemId];
          }
          return prev.filter((item) => item !== itemId);
      });
      if (!checked) {
          setSchemaConfirmedDeleteItemIds(prev => prev.filter((item) => item !== itemId));
      }
  };

  const renderRiskSummary = (riskSummary: SyncExecutionRiskSummary) => (
      <div style={{ lineHeight: 1.7 }}>
          {riskSummary.lines.map((line) => <div key={line}>{line}</div>)}
          {riskSummary.requiresExplicitConfirm && (
              <div style={{ marginTop: 8, color: '#cf1322' }}>{t('dataSync.confirm.riskWarning')}</div>
          )}
      </div>
  );

  const confirmExecutionRisk = async (title: string, riskSummary: SyncExecutionRiskSummary): Promise<boolean> => (
      new Promise<boolean>((resolve) => {
          Modal.confirm({
              title,
              content: renderRiskSummary(riskSummary),
              okText: t('dataSync.confirm.execute'),
              cancelText: t('common.cancel'),
              okButtonProps: { danger: riskSummary.level === 'high' },
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
          });
      })
  );

  const analyzeSchemaDiff = async () => {
      const selectionError = validateSchemaSyncSelection({ selectedTables });
      if (selectionError) return message.error(t(selectionError));
      if (!sourceConnId || !targetConnId) return message.error(t('dataSync.error.selectConnectionsFirst'));
      if (!sourceDb || !targetDb) return message.error(t('dataSync.error.selectDatabasesFirst'));
      if (!selectedConnectionsAreRelational) return message.error(t('dataSync.error.relationalOnly'));

      setLoading(true);
      setAnalyzing(true);
      setSchemaDiffTables([]);
      setSchemaSelectedItemIds([]);
      setSchemaConfirmedDeleteItemIds([]);
      setSyncLogs([]);

      const sConn = connections.find(c => c.id === sourceConnId)!;
      const tConn = connections.find(c => c.id === targetConnId)!;
      const jobId = `schema-analyze-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      jobIdRef.current = jobId;
      autoScrollRef.current = true;
      setSyncProgress({ percent: 0, current: 0, total: selectedTables.length, table: '', stage: t('schemaSync.progress.diffAnalysis') });

      const config = buildSchemaSyncAnalyzeRequest({
          sourceConfig: normalizeConnConfig(sConn, sourceDb),
          targetConfig: normalizeConnConfig(tConn, targetDb),
          sourceDatabase: sourceDb,
          targetDatabase: targetDb,
          selectedTables,
          jobId,
      });

      try {
          const res = await SchemaSyncAnalyze(schemaSyncConfig(config));
          if (res.success) {
              const tables = ((res.data as { tables?: SchemaDiffTable[] })?.tables || []) as SchemaDiffTable[];
              const defaultSelected = tables.flatMap((table) => Array.isArray(table.selectedItemIds) ? table.selectedItemIds : []);
              setSchemaDiffTables(tables);
              setSchemaSelectedItemIds(defaultSelected);
              setCurrentStep(1);
              message.success(t('schemaSync.diff.analysisComplete'));
          } else {
              message.error(res.message || t('schemaSync.diff.analysisFailed'));
          }
      } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('schemaSync.diff.analysisFailed'));
      }

      setLoading(false);
      setAnalyzing(false);
  };

  const openSchemaPreview = async (table: string, activeTab: string = 'schema') => {
      if (!table) return;
      const sConn = connections.find(c => c.id === sourceConnId)!;
      const tConn = connections.find(c => c.id === targetConnId)!;

      setPreviewOpen(true);
      setPreviewTable(table);
      setPreviewActiveTab(activeTab);
      setPreviewLoading(true);
      setPreviewData(null);
      setSchemaPreviewData(null);

      const config = buildSchemaSyncPreviewRequest({
          sourceConfig: normalizeConnConfig(sConn, sourceDb),
          targetConfig: normalizeConnConfig(tConn, targetDb),
          sourceDatabase: sourceDb,
          targetDatabase: targetDb,
          selectedTables,
          selectedItemIds: schemaSelectedItemIds,
      });

      try {
          const res = await SchemaSyncPreview(schemaSyncConfig(config), table);
          if (res.success) {
              setSchemaPreviewData(res.data as SchemaPreviewData);
          } else {
              message.error(res.message || t('schemaSync.preview.loadFailed'));
          }
      } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('schemaSync.preview.loadFailed'));
      }

      setPreviewLoading(false);
  };

  const runSchemaSync = async () => {
      const selectionError = validateSchemaSyncSelection({ selectedTables });
      if (selectionError) {
          message.error(t(selectionError));
          return;
      }
      if (schemaDiffTables.length === 0) {
          message.error(t('schemaSync.run.compareBeforeRun'));
          return;
      }
      const selectedDeleteIds = schemaDiffTables
          .flatMap((table) => Array.isArray(table.items) ? table.items : [])
          .filter((item) => schemaSelectedItemIds.includes(item.id) && item.requiresDeleteConfirm)
          .map((item) => item.id);
      const missingDeleteConfirm = selectedDeleteIds.filter((item) => !schemaConfirmedDeleteItemIds.includes(item));
      const riskSummary = buildSchemaSyncExecutionRiskSummary({
          language,
          targetDatabase: targetDb,
          schemaDiffTables,
          selectedItemIds: schemaSelectedItemIds,
      });
      const ok = await confirmExecutionRisk(t('schemaSync.confirm.executeSchemaSync'), riskSummary);
      if (!ok) return;
      if (missingDeleteConfirm.length > 0) {
          setSchemaConfirmedDeleteItemIds(prev => Array.from(new Set([...prev, ...missingDeleteConfirm])));
      }

      setLoading(true);
      setSchemaRunning(true);
      setCurrentStep(2);
      setSyncResult(null);
      setSyncLogs([]);

      const sConn = connections.find(c => c.id === sourceConnId)!;
      const tConn = connections.find(c => c.id === targetConnId)!;
      const jobId = `schema-run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      jobIdRef.current = jobId;
      autoScrollRef.current = true;
      setSyncProgress({
          percent: 0,
          current: 0,
          total: selectedTables.length,
          table: '',
          stage: t('dataSync.progress.preparing'),
      });

      const config = buildSchemaSyncRunRequest({
          sourceConfig: normalizeConnConfig(sConn, sourceDb),
          targetConfig: normalizeConnConfig(tConn, targetDb),
          sourceDatabase: sourceDb,
          targetDatabase: targetDb,
          selectedTables,
          selectedItemIds: schemaSelectedItemIds,
          confirmedDeleteItemIds: Array.from(new Set([...schemaConfirmedDeleteItemIds, ...selectedDeleteIds])),
          jobId,
      });

      try {
          const res = await SchemaSyncRun(schemaSyncConfig(config));
          if (res?.cancelled) {
              setSyncResult(res as SyncExecutionResult);
              setSyncLogs(syncLogsFromResult(res.logs, 'warn'));
              setLoading(false);
              setSchemaRunning(false);
              return;
          }
          setSyncResult(res as SyncExecutionResult);
          if (Array.isArray(res?.logs) && res.logs.length > 0) {
              setSyncLogs(syncLogsFromResult(res.logs, 'info'));
          }
          if (res?.success) {
              message.success(t('schemaSync.run.success'));
          }
      } catch (e: unknown) {
          const messageText = e instanceof Error ? e.message : t('schemaSync.run.failed');
          message.error(messageText);
          setSyncResult({ success: false, message: messageText, logs: [], cancelled: false });
      }
      setLoading(false);
      setSchemaRunning(false);
  };

  const analyzeDiff = async () => {
      if (allTables.length === 0) {
          await nextToTables(false);
      }
      const selectionError = validateDataSyncSelection({ sourceDatasetMode, selectedTables, sourceQuery, syncContent });
      if (selectionError) return message.error(t(selectionError));
      if (!sourceConnId || !targetConnId) return message.error(t('dataSync.error.selectConnectionsFirst'));
      if (!sourceDb || !targetDb) return message.error(t('dataSync.error.selectDatabasesFirst'));
      if (!selectedConnectionsAreRelational) return message.error(t('dataSync.error.relationalOnly'));

      setLoading(true);
      setAnalyzing(true);
      setDiffTables([]);
      setTableOptions({});
      setSyncLogs([]);

      const sConn = connections.find(c => c.id === sourceConnId)!;
      const tConn = connections.find(c => c.id === targetConnId)!;
      const jobId = `analyze-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      jobIdRef.current = jobId;
      autoScrollRef.current = true;
      setSyncProgress({ percent: 0, current: 0, total: selectedTables.length, table: '', stage: t('dataSync.progress.diffAnalysis') });

      const config = buildDataSyncRequest({
          sourceConfig: normalizeConnConfig(sConn, sourceDb),
          targetConfig: normalizeConnConfig(tConn, targetDb),
          selectedTables,
          sourceDatasetMode,
          sourceQuery,
          syncContent,
          syncMode: "insert_update",
          autoAddColumns,
          targetTableStrategy,
          createIndexes,
          jobId,
      });

      try {
          const res = await DataSyncAnalyze(dataSyncConfig(config));
          if (res.success) {
              const tables = ((res.data as { tables?: TableDiffSummary[] })?.tables || []) as TableDiffSummary[];
              setDiffTables(tables);
              const init: Record<string, TableOps> = {};
              tables.forEach(t => {
                  const can = !!t.canSync;
                  init[t.table] = {
                      insert: can,
                      update: can,
                      delete: false,
                      selectedInsertPks: [],
                      selectedUpdatePks: [],
                      selectedDeletePks: [],
                  };
              });
              setTableOptions(init);
              setCurrentStep(1);
              message.success(t('dataSync.diff.analysisComplete'));
          } else {
              message.error(res.message || t('dataSync.diff.analysisFailed'));
          }
      } catch (e: unknown) {
          message.error(t('dataSync.diff.analysisFailedWithMessage', { message: e instanceof Error ? e.message : '' }));
      }

      setLoading(false);
      setAnalyzing(false);
  };

  const openPreview = async (table: string, activeTab: string = 'insert') => {
      if (!table) return;
      const sConn = connections.find(c => c.id === sourceConnId)!;
      const tConn = connections.find(c => c.id === targetConnId)!;

      setPreviewOpen(true);
      setPreviewTable(table);
      setPreviewActiveTab(activeTab);
      setPreviewLoading(true);
      setPreviewData(null);

      const config = buildDataSyncRequest({
          sourceConfig: normalizeConnConfig(sConn, sourceDb),
          targetConfig: normalizeConnConfig(tConn, targetDb),
          selectedTables,
          sourceDatasetMode,
          sourceQuery,
          syncContent,
          syncMode: "insert_update",
          autoAddColumns,
          targetTableStrategy,
          createIndexes,
      });

      try {
          const res = await DataSyncPreview(dataSyncConfig(config), table, 200);
          if (res.success) {
              setPreviewData(res.data as DataPreviewData);
          } else {
              message.error(res.message || t('dataSync.preview.loadFailed'));
          }
      } catch (e: unknown) {
          message.error(t('dataSync.preview.loadFailedWithMessage', { message: e instanceof Error ? e.message : '' }));
      }

      setPreviewLoading(false);
  };

  const runSync = async () => {
      const selectionError = validateDataSyncSelection({ sourceDatasetMode, selectedTables, sourceQuery, syncContent });
      if (selectionError) {
          message.error(t(selectionError));
          return;
      }
      if (!selectedConnectionsAreRelational) {
          message.error(t('dataSync.error.relationalOnly'));
          return;
      }
      if (syncContent !== 'schema' && diffTables.length === 0) {
          message.error(t('dataSync.selection.compareBeforeSync'));
          return;
      }
      const riskSummary = buildDataSyncExecutionRiskSummary({
          language,
          syncMode,
          syncContent,
          targetDatabase: targetDb,
          diffTables,
          tableOptions,
      });
      const ok = await confirmExecutionRisk(t('dataSync.confirm.executeDataSync'), riskSummary);
      if (!ok) return;

      setLoading(true);
      setSyncing(true);
      setCurrentStep(2);
      setSyncResult(null);
      setSyncLogs([]);

      const sConn = connections.find(c => c.id === sourceConnId)!;
      const tConn = connections.find(c => c.id === targetConnId)!;

      const jobId = `sync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      jobIdRef.current = jobId;
      autoScrollRef.current = true;
      setSyncProgress({
          percent: 0,
          current: 0,
          total: selectedTables.length,
          table: '',
          stage: t('dataSync.progress.preparing'),
      });
      
      const config = buildDataSyncRequest({
          sourceConfig: normalizeConnConfig(sConn, sourceDb),
          targetConfig: normalizeConnConfig(tConn, targetDb),
          selectedTables,
          sourceDatasetMode,
          sourceQuery,
          syncContent,
          syncMode,
          autoAddColumns,
          targetTableStrategy,
          createIndexes,
          tableOptions,
          jobId,
      });

      try {
          const res = await DataSync(dataSyncConfig(config));
          if (res?.cancelled) {
              setSyncResult(res as SyncExecutionResult);
              setSyncLogs(syncLogsFromResult(res.logs, 'warn'));
              setLoading(false);
              setSyncing(false);
              return;
          }
          setSyncResult(res as SyncExecutionResult);
          if (Array.isArray(res?.logs) && res.logs.length > 0) {
              setSyncLogs(prev => {
                  if (prev.length > 0) return prev;
                  return (res.logs as string[]).map((log) => {
                      const msg = String(log || '').trim();
                      if (logErrorTokens.some((token) => msg.toLowerCase().includes(token))) return { level: 'error', message: msg };
                      if (logWarnTokens.some((token) => msg.toLowerCase().includes(token))) return { level: 'warn', message: msg };
                      return { level: 'info', message: msg };
                  });
              });
          }
      } catch (e) {
          message.error(t('dataSync.error.executionFailed'));
          setSyncResult({ success: false, message: t('dataSync.error.executionFailed'), logs: [] });
      }
      setLoading(false);
      setSyncing(false);
  };

  const handleCancelSync = async () => {
      if (!jobIdRef.current) return;
      try {
          const res = syncDomain === 'schema'
              ? await SchemaSyncCancel(jobIdRef.current)
              : await DataSyncCancel(jobIdRef.current);
          if (res?.cancelled) {
              setSyncResult(res as SyncExecutionResult);
              setSyncLogs(syncLogsFromResult(res.logs, 'warn'));
              setLoading(false);
              setSyncing(false);
              setSchemaRunning(false);
          }
      } catch {
          message.error(t('dataSync.error.executionFailed'));
      }
  };

  const renderSyncLogItem = (item: SyncLogItem) => {
      const level = String(item.level || 'info').toLowerCase();
      const color = level === 'error' ? '#ff4d4f' : (level === 'warn' ? '#faad14' : '#595959');
      const label = level === 'error' ? t('dataSync.log.level.error') : (level === 'warn' ? t('dataSync.log.level.warn') : t('dataSync.log.level.info'));
      const timeText = typeof item.ts === 'number' ? new Date(item.ts).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour12: false }) : '';
      return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color, flex: '0 0 auto' }}>● {label}</span>
              {timeText && <span style={{ color: '#8c8c8c', flex: '0 0 auto' }}>{timeText}</span>}
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.message}</span>
          </div>
      );
  };

  const previewSql = useMemo(() => {
      if (syncDomain === 'schema') {
          const statements = Array.isArray(schemaPreviewData?.schemaStatements) ? schemaPreviewData.schemaStatements : [];
          return {
              sqlText: statements.join('\n'),
              statementCount: statements.length,
          };
      }
      if (!previewData || !previewTable) return { sqlText: '', statementCount: 0 };
      const targetType = String(connections.find(c => c.id === targetConnId)?.config?.type || '');
      const ops = tableOptions[previewTable] || { insert: true, update: true, delete: false };
      return buildSqlPreview(previewData, previewTable, targetType, ops);
  }, [syncDomain, schemaPreviewData, previewData, previewTable, targetConnId, connections, tableOptions]);
  const previewHasSchemaStatements = useMemo(
      () => syncDomain === 'schema'
          ? Array.isArray(schemaPreviewData?.schemaStatements) && schemaPreviewData.schemaStatements.length > 0
          : Array.isArray(previewData?.schemaStatements) && previewData.schemaStatements.length > 0,
      [syncDomain, schemaPreviewData, previewData],
  );
  const previewSchemaWarnings = useMemo(
      () => syncDomain === 'schema'
          ? (Array.isArray(schemaPreviewData?.warnings) ? schemaPreviewData.warnings : [])
          : (Array.isArray(previewData?.schemaWarnings) ? previewData.schemaWarnings : []),
      [syncDomain, schemaPreviewData, previewData],
  );
  const previewHasDataDiff = useMemo(
      () => syncDomain === 'schema'
          ? false
          : Number(previewData?.totalInserts || 0) + Number(previewData?.totalUpdates || 0) + Number(previewData?.totalDeletes || 0) > 0,
      [syncDomain, previewData],
  );
  const previewTabKeys = useMemo(() => {
      const keys: string[] = [];
      if (previewHasSchemaStatements) {
          keys.push('schema');
      }
      if (previewHasDataDiff) {
          keys.push('insert', 'update', 'delete');
      }
      keys.push('sql');
      return keys;
  }, [previewHasSchemaStatements, previewHasDataDiff]);
  const resolvedPreviewActiveTab = previewTabKeys.includes(previewActiveTab) ? previewActiveTab : previewTabKeys[0];

  const dataExecutionRiskSummary = useMemo(() => buildDataSyncExecutionRiskSummary({
      language,
      syncMode,
      syncContent,
      targetDatabase: targetDb,
      diffTables,
      tableOptions,
  }), [language, syncMode, syncContent, targetDb, diffTables, tableOptions]);

  const schemaExecutionRiskSummary = useMemo(() => buildSchemaSyncExecutionRiskSummary({
      language,
      targetDatabase: targetDb,
      schemaDiffTables,
      selectedItemIds: schemaSelectedItemIds,
  }), [language, targetDb, schemaDiffTables, schemaSelectedItemIds]);

  const currentExecutionRiskSummary = syncDomain === 'schema' ? schemaExecutionRiskSummary : dataExecutionRiskSummary;

  const analysisWarnings = useMemo(() => {
      const items: string[] = [];
      if (syncDomain === 'schema') {
          schemaDiffTables.forEach((table) => {
              (table.warnings || []).forEach((warning) => items.push(`${table.table}: ${warning}`));
              (table.items || []).forEach((item) => {
                  (item.warnings || []).forEach((warning) => items.push(`${table.table}: ${warning}`));
                  if (!item.supported && item.unsupportedReason) {
                      items.push(`${table.table}: ${item.unsupportedReason}`);
                  }
              });
          });
      } else {
          diffTables.forEach((table) => {
              (table.warnings || []).forEach((warning) => items.push(`${table.table}: ${warning}`));
              (table.unsupportedObjects || []).forEach((warning) => items.push(`${table.table}: ${warning}`));
          });
      }
      return Array.from(new Set(items));
  }, [syncDomain, diffTables, schemaDiffTables]);


  const renderRiskWarningSummary = () => {
      if (analysisWarnings.length === 0) return null;
      return (
          <Collapse
              size="small"
              style={{ marginBottom: 12 }}
              items={[{
                  key: 'risk-summary',
                  label: t('dataSync.risk.precheckSummary', { count: analysisWarnings.length }),
                  children: (
                      <div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {analysisWarnings.slice(0, 2).map((item) => <li key={item}>{item}</li>)}
                              {analysisWarnings.length > 2 && <li>{t('dataSync.risk.moreItems', { count: analysisWarnings.length - 2 })}</li>}
                          </ul>
                          <Button
                              size="small"
                              style={{ marginTop: 8 }}
                              onClick={() => {
                                  Modal.info({
                                      title: t('dataSync.risk.detailTitle'),
                                      width: 760,
                                      content: (
                                          <div style={{ maxHeight: 520, overflow: 'auto' }}>
                                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                                  {analysisWarnings.map((item) => <li key={item}>{item}</li>)}
                                              </ul>
                                          </div>
                                      ),
                                  });
                              }}
                          >
                              {t('dataSync.risk.viewDetails')}
                          </Button>
                      </div>
                  ),
              }]}
          />
      );
  };

  const isSourceQueryMode = sourceDatasetMode === 'query';
  const isMigrationWorkflow = workflowType === 'migration';
  const sourceConn = useMemo(() => connections.find(c => c.id === sourceConnId), [connections, sourceConnId]);
  const targetConn = useMemo(() => connections.find(c => c.id === targetConnId), [connections, targetConnId]);
  const sourceType = resolveDataSourceType(sourceConn?.config);
  const targetType = resolveDataSourceType(targetConn?.config);
  const sourceIsRelational = !sourceConn || RELATIONAL_SYNC_TYPES.has(sourceType);
  const targetIsRelational = !targetConn || RELATIONAL_SYNC_TYPES.has(targetType);
  const selectedConnectionsAreRelational = sourceIsRelational && targetIsRelational;
  const canCompareDiff = selectedConnectionsAreRelational
      && !!sourceConnId
      && !!targetConnId
      && !!sourceDb
      && !!targetDb
      && selectedTables.length > 0
      && !analyzing
      && (!isSourceQueryMode || !!sourceQuery.trim());
  const currentPreviewData: DataPreviewData = previewData ?? {};
  const currentSchemaPreviewData: SchemaPreviewData = schemaPreviewData ?? {};

  const modalPanelStyle = useMemo(() => ({
      background: darkMode
          ? 'linear-gradient(180deg, rgba(16,22,34,0.96) 0%, rgba(10,14,24,0.98) 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,248,252,0.98) 100%)',
      border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(16,24,40,0.08)',
      boxShadow: darkMode ? '0 24px 56px rgba(0,0,0,0.36)' : '0 18px 44px rgba(15,23,42,0.14)',
      backdropFilter: resolveTextInputSafeBackdropFilter(darkMode ? 'blur(18px)' : 'none', disableLocalBackdropFilter),
  }), [darkMode, disableLocalBackdropFilter]);

  const shellCardStyle = useMemo<React.CSSProperties>(() => ({
      borderRadius: 18,
      border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.08)',
      background: darkMode ? 'rgba(255,255,255,0.03)' : `rgba(255,255,255,${Math.max(effectiveOpacity, 0.88)})`,
      boxShadow: darkMode ? '0 12px 32px rgba(0,0,0,0.22)' : '0 10px 24px rgba(15,23,42,0.08)',
      overflow: 'hidden',
  }), [darkMode, effectiveOpacity]);

  const heroPanelStyle = useMemo<React.CSSProperties>(() => ({
      padding: 18,
      borderRadius: 18,
      border: darkMode ? '1px solid rgba(255,214,102,0.12)' : '1px solid rgba(24,144,255,0.12)',
      background: darkMode
          ? 'linear-gradient(135deg, rgba(255,214,102,0.10) 0%, rgba(255,255,255,0.03) 100%)'
          : 'linear-gradient(135deg, rgba(24,144,255,0.10) 0%, rgba(255,255,255,0.95) 100%)',
      marginBottom: 18,
  }), [darkMode]);

  const badgeStyle = useMemo<React.CSSProperties>(() => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      borderRadius: 999,
      border: darkMode ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(15,23,42,0.08)',
      background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.86)',
      color: darkMode ? 'rgba(255,255,255,0.88)' : '#334155',
      fontSize: 12,
      fontWeight: 600,
  }), [darkMode]);

  const quietPanelStyle = useMemo<React.CSSProperties>(() => ({
      padding: 14,
      borderRadius: 16,
      border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.08)',
      background: darkMode ? 'rgba(255,255,255,0.025)' : 'rgba(248,250,252,0.92)',
  }), [darkMode]);

  const modalWorkspaceStyle = useMemo<React.CSSProperties>(() => ({
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
  }), []);

  const modalScrollableContentStyle = useMemo<React.CSSProperties>(() => ({
      flex: 1,
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingRight: 4,
      overscrollBehavior: 'contain',
  }), []);

  const modalFooterBarStyle = useMemo<React.CSSProperties>(() => ({
      marginTop: 18,
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      paddingTop: 12,
      borderTop: darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)',
      flex: '0 0 auto',
  }), [darkMode]);

  const modalTitle = syncDomain === 'schema'
      ? t('schemaSync.modal.title')
      : (isMigrationWorkflow ? t('dataSync.modal.migrationTitle') : t('dataSync.modal.syncTitle'));
  const modalDescription = syncDomain === 'schema'
      ? t('schemaSync.modal.description')
      : (isMigrationWorkflow ? t('dataSync.modal.migrationDescription') : t('dataSync.modal.syncDescription'));
  const heroTitle = syncDomain === 'schema'
      ? t('schemaSync.workflow.title')
      : (isMigrationWorkflow ? t('dataSync.workflow.migrationTitle') : t('dataSync.workflow.syncTitle'));
  const heroDescription = syncDomain === 'schema'
      ? t('schemaSync.workflow.description')
      : isMigrationWorkflow
      ? t('dataSync.workflow.migrationDescription')
      : t('dataSync.workflow.syncDescription');
  const workflowBadgeText = syncDomain === 'schema' ? t('schemaSync.workflow.badge') : (isMigrationWorkflow ? t('dataSync.workflow.migrationBadge') : t('dataSync.workflow.syncBadge'));
  const workflowBadgeIcon = isMigrationWorkflow ? <RocketOutlined /> : <SwapOutlined />;

  const renderModalTitle = (title: string, description: string) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              display: 'grid',
              placeItems: 'center',
              background: darkMode ? 'rgba(255,214,102,0.12)' : 'rgba(24,144,255,0.10)',
              color: darkMode ? '#ffd666' : token.colorPrimary,
              flexShrink: 0,
          }}>
              {workflowBadgeIcon}
          </div>
          <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: darkMode ? '#f8fafc' : '#0f172a' }}>{title}</div>
              <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6, color: darkMode ? 'rgba(255,255,255,0.56)' : 'rgba(15,23,42,0.58)' }}>{description}</div>
          </div>
      </div>
  );

  return (
    <>
    <Modal
        title={renderModalTitle(modalTitle, modalDescription)}
        open={open}
        onCancel={() => {
            if (syncing) {
                message.warning(t('dataSync.close.syncRunning'));
                return;
            }
            onClose();
        }}
        width={920}
        footer={null}
        destroyOnHidden
        closable={!syncing}
        maskClosable={!syncing}
        styles={{
            content: modalPanelStyle,
            header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 },
            body: {
                paddingTop: 8,
                height: 760,
                maxHeight: 'calc(100vh - 120px)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            },
            footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 },
        }}
    >
      <div style={modalWorkspaceStyle}>
      <div style={{ flex: '0 0 auto' }}>
      <div style={heroPanelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: darkMode ? '#f8fafc' : '#0f172a' }}>
                      {heroTitle}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: darkMode ? 'rgba(255,255,255,0.62)' : 'rgba(15,23,42,0.62)' }}>
                      {heroDescription}
                  </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span style={badgeStyle}>{workflowBadgeIcon} {workflowBadgeText}</span>
                  <span style={badgeStyle}><DatabaseOutlined /> {sourceConnId ? t('dataSync.workflow.sourceSelected') : t('dataSync.workflow.sourcePending')}</span>
                  <span style={badgeStyle}><TableOutlined /> {t('dataSync.workflow.tableCount', { count: selectedTables.length || 0 })}</span>
              </div>
          </div>
      </div>
      <Steps current={currentStep} style={{ marginBottom: 24 }}>
        <Step title={t('dataSync.steps.selectTables')} />
        <Step title={t('dataSync.steps.compareDiffs')} />
        <Step title={t('dataSync.steps.executionResult')} />
      </Steps>
      </div>

      <div style={modalScrollableContentStyle}>
      {/* STEP 1: CONFIG */}
      {currentStep === 0 && (
          <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px minmax(0, 1fr)', gap: 18, alignItems: 'stretch' }}>
                  <Card
                      title={t('dataSync.form.sourceDatabase')}
                      style={shellCardStyle}
                      styles={{ header: { borderBottom: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.06)', fontWeight: 700 }, body: { padding: 18 } }}
                  >
                      <Form layout="vertical">
                          <Form.Item label={t('dataSync.form.connection')}>
                              <Select value={sourceConnId} onChange={handleSourceConnChange}>
                                  {connections.map(c => <Option key={c.id} value={c.id}>{c.name} ({c.config.type})</Option>)}
                              </Select>
                          </Form.Item>
                          <Form.Item label={t('dataSync.form.database')}>
                              <Select value={sourceDb} onChange={setSourceDb} showSearch>
                                  {sourceDbs.map(d => <Option key={d} value={d}>{d}</Option>)}
                              </Select>
                          </Form.Item>
                      </Form>
                  </Card>
                  <div style={{ display: 'grid', placeItems: 'center' }}>
                      <div style={{ ...badgeStyle, width: 44, height: 44, borderRadius: 14, justifyContent: 'center', padding: 0 }}>
                          <SwapOutlined />
                      </div>
                  </div>
                  <Card
                      title={t('dataSync.form.targetDatabase')}
                      style={shellCardStyle}
                      styles={{ header: { borderBottom: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.06)', fontWeight: 700 }, body: { padding: 18 } }}
                  >
                      <Form layout="vertical">
                          <Form.Item label={t('dataSync.form.connection')}>
                              <Select value={targetConnId} onChange={handleTargetConnChange}>
                                  {connections.map(c => <Option key={c.id} value={c.id}>{c.name} ({c.config.type})</Option>)}
                              </Select>
                          </Form.Item>
                          <Form.Item label={t('dataSync.form.database')}>
                              <Select value={targetDb} onChange={setTargetDb} showSearch>
                                  {targetDbs.map(d => <Option key={d} value={d}>{d}</Option>)}
                              </Select>
                          </Form.Item>
                      </Form>
                  </Card>
              </div>

              {syncDomain === 'data' && (
                  <Card
                      title={isMigrationWorkflow ? t('dataSync.form.migrationOptions') : t('dataSync.form.syncOptions')}
                      style={{ ...shellCardStyle, marginTop: 18 }}
                      styles={{ header: { borderBottom: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.06)', fontWeight: 700 }, body: { padding: 18 } }}
                  >
                  <div style={{ ...quietPanelStyle, marginBottom: 14 }}>
                      <Text style={{ color: darkMode ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.68)', lineHeight: 1.7 }}>
                          {t('dataSync.form.optionsHint')}
                      </Text>
                  </div>
                  <Form layout="vertical">
                      <Form.Item label={t('dataSync.form.workflowType')}>
                          <Select value={workflowType} onChange={setWorkflowType}>
                              <Option value="sync">{t('dataSync.form.workflowSyncOption')}</Option>
                              <Option value="migration" disabled={isSourceQueryMode}>{t('dataSync.form.workflowMigrationOption')}</Option>
                          </Select>
                      </Form.Item>
                      <Form.Item label={t('dataSync.form.sourceDatasetMode')}>
                          <Select value={sourceDatasetMode} onChange={setSourceDatasetMode}>
                              <Option value="table">{t('dataSync.form.sourceDatasetTableOption')}</Option>
                              <Option value="query">{t('dataSync.form.sourceDatasetQueryOption')}</Option>
                          </Select>
                      </Form.Item>
                      <Alert
                          type={isMigrationWorkflow ? 'info' : 'success'}
                          showIcon
                          style={{ marginBottom: 12 }}
                          message={isMigrationWorkflow
                              ? t('dataSync.form.migrationModeNotice')
                              : t('dataSync.form.syncModeNotice')}
                      />
                      {isSourceQueryMode && (
                          <Alert
                              type="info"
                              showIcon
                              style={{ marginBottom: 12 }}
                              message={t('dataSync.form.queryModeNotice')}
                          />
                      )}
                      {!selectedConnectionsAreRelational && (
                          <Alert
                              type="warning"
                              showIcon
                              style={{ marginBottom: 12 }}
                              message={t('dataSync.error.relationalOnly')}
                          />
                      )}
                      <Form.Item label={isMigrationWorkflow ? t('dataSync.form.migrationContent') : t('dataSync.form.syncContent')}>
                          <Select value={syncContent} onChange={setSyncContent}>
                              <Option value="data">{t('dataSync.form.contentDataOnly')}</Option>
                              <Option value="schema" disabled={isSourceQueryMode}>{t('dataSync.form.contentSchemaOnly')}</Option>
                              <Option value="both" disabled={isSourceQueryMode}>{t('dataSync.form.contentBoth')}</Option>
                          </Select>
                      </Form.Item>
                      <Form.Item label={isMigrationWorkflow ? t('dataSync.form.migrationMode') : t('dataSync.form.syncMode')}>
                          <Select value={syncMode} onChange={setSyncMode} disabled={syncContent === 'schema'}>
                              <Option value="insert_update">{t('dataSync.form.modeInsertUpdate')}</Option>
                              <Option value="insert_only">{t('dataSync.form.modeInsertOnly')}</Option>
                              <Option value="full_overwrite">{t('dataSync.form.modeFullOverwrite')}</Option>
                          </Select>
                      </Form.Item>
                      <Form.Item label={isMigrationWorkflow ? t('dataSync.form.targetTableStrategy') : t('dataSync.form.targetTableRequirement')}>
                          <Select value={targetTableStrategy} onChange={setTargetTableStrategy} disabled={!isMigrationWorkflow || isSourceQueryMode}>
                              <Option value="existing_only">{t('dataSync.form.strategyExistingOnly')}</Option>
                              <Option value="auto_create_if_missing">{t('dataSync.form.strategyAutoCreate')}</Option>
                              <Option value="smart">{t('dataSync.form.strategySmart')}</Option>
                          </Select>
                      </Form.Item>
                      <Form.Item>
                          <Checkbox checked={autoAddColumns} onChange={(e) => setAutoAddColumns(e.target.checked)} disabled={isSourceQueryMode}>
                              {t('dataSync.form.autoAddColumns')}
                          </Checkbox>
                      </Form.Item>
                      <Form.Item>
                          <Checkbox checked={createIndexes} onChange={(e) => setCreateIndexes(e.target.checked)} disabled={!isMigrationWorkflow || targetTableStrategy === 'existing_only' || isSourceQueryMode}>
                              {t('dataSync.form.createIndexes')}
                          </Checkbox>
                      </Form.Item>
                      {isMigrationWorkflow && targetTableStrategy !== 'existing_only' && (
                          <Alert
                              type="info"
                              showIcon
                              message={t('dataSync.form.autoCreateSupportNotice')}
                              style={{ marginBottom: 12 }}
                          />
                      )}
                      {!isMigrationWorkflow && (
                          <Alert
                              type="info"
                              showIcon
                              message={t('dataSync.form.existingTableModeNotice')}
                              style={{ marginBottom: 12 }}
                          />
                      )}
                      {syncContent !== 'schema' && syncMode === 'full_overwrite' && (
                          <Alert
                              type="warning"
                              showIcon
                              message={t('dataSync.form.fullOverwriteNotice')}
                          />
                      )}
                  </Form>
                  </Card>
              )}
          </div>
      )}

      {/* STEP 2: TABLES */}
      {(currentStep === 0 || currentStep === 1) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={quietPanelStyle}>
                  {!isSourceQueryMode && (
                      <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <Text type="secondary">{t('dataSync.form.selectTablesHint')}</Text>
                              <Checkbox checked={showSameTables} onChange={(e) => setShowSameTables(e.target.checked)}>
                                  {t('dataSync.form.showSameTables')}
                              </Checkbox>
                          </div>
                          <Transfer
                              dataSource={allTables.map(t => ({ key: t, title: t }))}
                              titles={[t('dataSync.form.sourceTable'), t('dataSync.form.selectedTable')]}
                              targetKeys={selectedTables}
                              onChange={(keys) => setSelectedTables(keys as string[])}
                              render={item => item.title}
                              listStyle={{ width: 390, height: 320, marginTop: 0, borderRadius: 14, overflow: 'hidden' }}
                              locale={{ itemUnit: t('dataSync.form.transferItemUnit'), itemsUnit: t('dataSync.form.transferItemsUnit'), searchPlaceholder: t('dataSync.form.searchTablePlaceholder'), notFoundContent: t('dataSync.form.noData') }}
                          />
                      </>
                  )}
                  {isSourceQueryMode && (
                      <Form layout="vertical">
                          <Alert
                              type="info"
                              showIcon
                              style={{ marginBottom: 12 }}
                              message={t('dataSync.form.queryModeHint')}
                          />
                          <Form.Item label={t('dataSync.form.sourceQuerySql')}>
                              <TextArea
                                  value={sourceQuery}
                                  onChange={(e) => setSourceQuery(e.target.value)}
                                  rows={8}
                                  placeholder={t('dataSync.form.sourceQueryPlaceholder')}
                                  spellCheck={false}
                              />
                          </Form.Item>
                          <Form.Item label={t('dataSync.form.targetTable')}>
                              <Select
                                  value={selectedTables[0]}
                                  onChange={(value) => setSelectedTables(value ? [value] : [])}
                                  showSearch
                                  allowClear
                                  placeholder={t('dataSync.form.targetTablePlaceholder')}
                                  optionFilterProp="children"
                              >
                                  {allTables.map((table) => <Option key={table} value={table}>{table}</Option>)}
                              </Select>
                          </Form.Item>
                      </Form>
                  )}
              </div>

              {currentStep === 1 && syncDomain === 'data' && diffTables.length > 0 && (
                  <div style={quietPanelStyle}>
                      <Divider orientation="left" style={{ marginTop: 0 }}>{t('dataSync.diff.resultTitle')}</Divider>
                      {renderRiskWarningSummary()}
                      <Alert
                          type={currentExecutionRiskSummary.level === 'high' ? 'warning' : 'info'}
                          showIcon
                          message={t('dataSync.risk.executionSummary', { summary: currentExecutionRiskSummary.shortText })}
                          description={
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {currentExecutionRiskSummary.lines.map((line) => <li key={line}>{line}</li>)}
                              </ul>
                          }
                          style={{ marginBottom: 12 }}
                      />
                      <Table<TableDiffSummary>
                          size="small"
                          pagination={false}
                          rowKey={(r) => r.table}
                          dataSource={diffTables.filter(t => {
                              const ins = Number(t.inserts || 0);
                              const upd = Number(t.updates || 0);
                              const del = Number(t.deletes || 0);
                              const same = Number(t.same || 0);
                              const msg = String(t.message || '').trim();
                              const can = !!t.canSync;
                              const warns = Array.isArray(t.warnings) ? t.warnings.length : 0;
                              const unsupported = Array.isArray(t.unsupportedObjects) ? t.unsupportedObjects.length : 0;
                              if (showSameTables) return true;
                              if (!can) return true;
                              if (msg || warns > 0 || unsupported > 0) return true;
                              return ins > 0 || upd > 0 || del > 0 || same === 0;
                          })}
                          columns={[
                              { title: t('dataSync.columns.tableName'), dataIndex: 'table', key: 'table', ellipsis: true },
                              {
                                  title: t('dataSync.columns.targetTable'),
                                  key: 'targetTableExists',
                                  width: 90,
                                  render: (_: unknown, r: TableDiffSummary) => r.targetTableExists ? t('dataSync.status.exists') : t('dataSync.status.notExists')
                              },
                              {
                                  title: t('dataSync.columns.plan'),
                                  dataIndex: 'plannedAction',
                                  key: 'plannedAction',
                                  width: 220,
                                  ellipsis: true,
                                  render: (v: unknown) => String(v || '')
                              },
                              {
                                  title: t('dataSync.columns.insert'),
                                  key: 'inserts',
                                  width: 90,
                                  render: (_: unknown, r: TableDiffSummary) => {
                                      const ops = tableOptions[r.table] || { insert: true, update: true, delete: false };
                                      const disabled = !r.canSync || analyzing || Number(r.inserts || 0) === 0;
                                      return (
                                          <Checkbox checked={!!ops.insert} disabled={disabled} onChange={(e) => updateTableOption(r.table, 'insert', e.target.checked)}>
                                              {Number(r.inserts || 0)}
                                          </Checkbox>
                                      );
                                  }
                              },
                              {
                                  title: t('dataSync.columns.update'),
                                  key: 'updates',
                                  width: 90,
                                  render: (_: unknown, r: TableDiffSummary) => {
                                      const ops = tableOptions[r.table] || { insert: true, update: true, delete: false };
                                      const disabled = !r.canSync || analyzing || Number(r.updates || 0) === 0;
                                      return (
                                          <Checkbox checked={!!ops.update} disabled={disabled} onChange={(e) => updateTableOption(r.table, 'update', e.target.checked)}>
                                              {Number(r.updates || 0)}
                                          </Checkbox>
                                      );
                                  }
                              },
                              {
                                  title: t('dataSync.columns.delete'),
                                  key: 'deletes',
                                  width: 90,
                                  render: (_: unknown, r: TableDiffSummary) => {
                                      const ops = tableOptions[r.table] || { insert: true, update: true, delete: false };
                                      const disabled = !r.canSync || analyzing || Number(r.deletes || 0) === 0;
                                      return (
                                          <Checkbox checked={!!ops.delete} disabled={disabled} onChange={(e) => updateTableOption(r.table, 'delete', e.target.checked)}>
                                              {Number(r.deletes || 0)}
                                          </Checkbox>
                                      );
                                  }
                              },
                              { title: t('dataSync.columns.same'), dataIndex: 'same', key: 'same', width: 70, render: (v: unknown) => Number(v || 0) },
                              {
                                  title: t('dataSync.columns.risk'),
                                  key: 'warnings',
                                  width: 220,
                                  render: (_: unknown, r: TableDiffSummary) => {
                                      const warns = [...(Array.isArray(r.warnings) ? r.warnings : []), ...(Array.isArray(r.unsupportedObjects) ? r.unsupportedObjects : [])];
                                      if (warns.length === 0) return '-';
                                      return (
                                          <div style={{ color: '#d48806', fontSize: 12, lineHeight: 1.5 }}>
                                              {warns.slice(0, 2).map((item: string) => <div key={item}>{item}</div>)}
                                              {warns.length > 2 && <div>{t('dataSync.risk.moreItems', { count: warns.length - 2 })}</div>}
                                          </div>
                                      );
                                  }
                              },
                              {
                                  title: t('dataSync.columns.preview'),
                                  key: 'preview',
                                  width: 150,
                                  render: (_: unknown, r: TableDiffSummary) => {
                                      const can = !!r.canSync;
                                      const hasDiff = Number(r.inserts || 0) + Number(r.updates || 0) + Number(r.deletes || 0) > 0;
                                      const hasSchemaDiff = Number(r.schemaDiffCount || 0) > 0;
                                      return (
                                          <div style={{ display: 'flex', gap: 6 }}>
                                              <Button size="small" disabled={!can || !(hasDiff || hasSchemaDiff) || analyzing} onClick={() => openPreview(r.table)}>{t('dataSync.actions.view')}</Button>
                                              <Button size="small" disabled={!can || !(hasDiff || hasSchemaDiff) || analyzing} onClick={() => openPreview(r.table, 'sql')}>{t('dataSync.actions.sqlPreview')}</Button>
                                          </div>
                                      );
                                  }
                              }
                          ]}
                      />
                  </div>
              )}
              {currentStep === 1 && syncDomain === 'schema' && schemaDiffTables.length > 0 && (
                  <div style={quietPanelStyle}>
                      <Divider orientation="left" style={{ marginTop: 0 }}>{t('schemaSync.diff.title')}</Divider>
                      {renderRiskWarningSummary()}
                      <Alert
                          type={currentExecutionRiskSummary.level === 'high' ? 'warning' : 'info'}
                          showIcon
                          message={t('dataSync.risk.executionSummary', { summary: currentExecutionRiskSummary.shortText })}
                          description={
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                  {currentExecutionRiskSummary.lines.map((line) => <li key={line}>{line}</li>)}
                              </ul>
                          }
                          style={{ marginBottom: 12 }}
                      />
                      <Table<SchemaDiffRow>
                          size="small"
                          pagination={false}
                          rowKey={(r) => `${r.table}-${r.id}`}
                          dataSource={schemaDiffTables.flatMap((table) => (table.items || []).map((item) => ({ ...item, table: table.table, targetTableExists: table.targetTableExists })))}
                          columns={[
                              { title: t('dataSync.columns.tableName'), dataIndex: 'table', key: 'table', width: 160, ellipsis: true },
                              { title: t('dataSync.columns.objectType'), dataIndex: 'objectType', key: 'objectType', width: 120 },
                              { title: t('dataSync.columns.objectName'), dataIndex: 'objectName', key: 'objectName', ellipsis: true },
                              {
                                  title: t('dataSync.columns.change'),
                                  key: 'changeType',
                                  width: 100,
                                  render: (_: unknown, r: SchemaDiffRow) => (
                                      <Tag color={r.changeType === 'DROP' ? 'red' : (r.changeType === 'ALTER' ? 'gold' : 'blue')}>{r.changeType}</Tag>
                                  ),
                              },
                              { title: t('dataSync.columns.description'), dataIndex: 'summary', key: 'summary', ellipsis: true },
                              {
                                  title: t('dataSync.columns.execute'),
                                  key: 'selected',
                                  width: 90,
                                  render: (_: unknown, r: SchemaDiffRow) => (
                                      <Checkbox
                                          checked={schemaSelectedItemIds.includes(r.id)}
                                          disabled={!r.supported || analyzing}
                                          onChange={(e) => updateSchemaItemSelection(r.id, e.target.checked)}
                                      />
                                  ),
                              },
                              {
                                  title: t('dataSync.columns.status'),
                                  key: 'supported',
                                  width: 180,
                                  render: (_: unknown, r: SchemaDiffRow) => r.supported ? t('dataSync.status.supported') : (r.unsupportedReason || t('dataSync.status.unsupported')),
                              },
                              {
                                  title: t('dataSync.columns.preview'),
                                  key: 'preview',
                                  width: 150,
                                  render: (_: unknown, r: SchemaDiffRow) => (
                                      <div style={{ display: 'flex', gap: 6 }}>
                                          <Button size="small" disabled={analyzing} onClick={() => openSchemaPreview(r.table)}>{t('dataSync.actions.view')}</Button>
                                          <Button size="small" disabled={analyzing} onClick={() => openSchemaPreview(r.table, 'sql')}>{t('dataSync.actions.sqlPreview')}</Button>
                                      </div>
                                  ),
                              },
                          ]}
                      />
                  </div>
              )}
          </div>
      )}

      {/* STEP 3: RESULT */}
      {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={quietPanelStyle}>
              <Alert
                  message={(syncing || schemaRunning) ? t('dataSync.result.syncing') : (syncResult?.success ? t('dataSync.result.completed') : t('dataSync.result.failed'))}
                  description={
                      (syncing || schemaRunning)
                          ? (syncProgress.table ? t('dataSync.result.currentStageWithTable', { stage: syncProgress.stage || t('dataSync.result.executing'), table: syncProgress.table }) : t('dataSync.result.currentStage', { stage: syncProgress.stage || t('dataSync.result.executing') }))
                          : (syncResult?.message || t('dataSync.result.successSummary', { tables: syncResult?.tablesSynced || 0, inserted: syncResult?.rowsInserted || 0, updated: syncResult?.rowsUpdated || 0 }))
                  }
                  type={(syncing || schemaRunning) ? "info" : (syncResult?.success ? "success" : "error")}
                  showIcon
              />

              <div style={{ marginTop: 14 }}>
                  <Progress
                      percent={syncProgress.percent}
                      status={(syncing || schemaRunning) ? "active" : (syncResult?.success ? "success" : "exception")}
                      format={() => `${syncProgress.current}/${syncProgress.total}`}
                  />
              </div>

              </div>
              <div style={quietPanelStyle}>
              <Divider orientation="left" style={{ marginTop: 0 }}>{t('dataSync.result.executionLogs')}</Divider>
              <div
                  ref={logBoxRef}
                  onScroll={() => {
                      const el = logBoxRef.current;
                      if (!el) return;
                      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                      autoScrollRef.current = nearBottom;
                  }}
                  style={{
                      background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(248,250,252,0.92)',
                      border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.06)',
                      borderRadius: 14,
                      padding: 12,
                      height: 300,
                      overflowY: 'auto',
                      fontFamily: 'SFMono-Regular, ui-monospace, Menlo, Consolas, monospace'
                  }}
              >
                  {syncLogs.map((item, i: number) => <div key={i}>{renderSyncLogItem(item)}</div>)}
              </div>
              </div>
          </div>
      )}

      </div>

      <div style={modalFooterBarStyle}>
          {currentStep === 0 && (
              <Button
                  type="primary"
                  onClick={allTables.length === 0 ? () => nextToTables(false) : (syncDomain === 'schema' ? analyzeSchemaDiff : analyzeDiff)}
                  loading={loading}
                  disabled={!selectedConnectionsAreRelational || !sourceConnId || !targetConnId || !sourceDb || !targetDb || (allTables.length > 0 && !canCompareDiff)}
              >
                  {allTables.length === 0 ? t('dataSync.actions.loadTables') : t('dataSync.actions.compareDiffs')}
              </Button>
          )}
	          {currentStep === 1 && (
	              <>
	                <Button onClick={() => setCurrentStep(0)} style={{ marginRight: 8 }}>{t('dataSync.actions.previousStep')}</Button>
	                <Button
                        onClick={syncDomain === 'schema' ? analyzeSchemaDiff : analyzeDiff}
                        loading={loading}
                        disabled={!canCompareDiff || (syncDomain === 'data' && syncContent === 'schema')}
                        style={{ marginRight: 8 }}
                    >
	                    {t('dataSync.actions.compareDiffs')}
	                </Button>
	                <Button
	                    type="primary"
	                    onClick={syncDomain === 'schema' ? runSchemaSync : runSync}
                        loading={loading}
                        disabled={!canCompareDiff
                            || (syncDomain === 'schema' ? schemaDiffTables.length === 0 : (syncContent !== 'schema' && diffTables.length === 0))}
                    >
                        {syncDomain === 'schema' ? t('schemaSync.actions.startSync') : t('dataSync.actions.startSync')}
                    </Button>
              </>
          )}
          {currentStep === 2 && (
              <>
                  <Button disabled={syncing || schemaRunning} onClick={() => setCurrentStep(1)} style={{ marginRight: 8 }}>{t('dataSync.actions.continueSync')}</Button>
                  <Button disabled={!(syncing || schemaRunning)} onClick={() => void handleCancelSync()} style={{ marginRight: 8 }}>{t('dataSync.actions.cancelSync')}</Button>
                  <Button type="primary" disabled={syncing || schemaRunning} onClick={onClose}>{t('common.close')}</Button>
              </>
          )}
      </div>
      </div>
    </Modal>
    <Drawer
        title={previewTable ? t('dataSync.preview.diffTitleWithTable', { table: previewTable }) : t('dataSync.preview.diffTitle')}
        styles={{ body: { background: darkMode ? 'rgba(9,13,20,0.98)' : '#f8fafc' } }}
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewTable(''); setPreviewActiveTab('insert'); setPreviewData(null); setSchemaPreviewData(null); }}
        width={900}
    >
        {previewLoading && <Alert type="info" showIcon message={t('dataSync.preview.loading')} />}
        {!previewLoading && (syncDomain === 'schema' ? currentSchemaPreviewData : currentPreviewData) && (
            <div>
                <div style={{ marginBottom: 12, fontWeight: 600 }}>{t('dataSync.preview.tableName', { table: previewTable })}</div>
                <Alert
                    type="info"
                    showIcon
                    message={
                        previewHasDataDiff
                            ? t('dataSync.preview.dataSummary', { inserts: currentPreviewData.totalInserts || 0, updates: currentPreviewData.totalUpdates || 0, deletes: currentPreviewData.totalDeletes || 0 })
                            : ((syncDomain === 'schema' ? currentSchemaPreviewData?.schemaSummary : currentPreviewData?.schemaSummary) || t('schemaSync.preview.statementSummary', { count: previewSql.statementCount }))
                    }
                />
                {previewSchemaWarnings.length > 0 && (
                    <Alert
                        style={{ marginTop: 12 }}
                        type="warning"
                        showIcon
                        message={t('schemaSync.preview.warningTitle')}
                        description={
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {previewSchemaWarnings.slice(0, 8).map((item) => <li key={item}>{item}</li>)}
                                {previewSchemaWarnings.length > 8 && <li>{t('dataSync.risk.moreItemsCollapsed', { count: previewSchemaWarnings.length - 8 })}</li>}
                            </ul>
                        }
                    />
                )}
                <Divider />
                <Tabs
                    activeKey={resolvedPreviewActiveTab}
                    onChange={setPreviewActiveTab}
                    items={[
                        ...(previewHasSchemaStatements ? (() => {
                            const schemaStatements = syncDomain === 'schema'
                                ? currentSchemaPreviewData.schemaStatements || []
                                : currentPreviewData.schemaStatements || [];
                            const schemaSummary = syncDomain === 'schema'
                                ? currentSchemaPreviewData.schemaSummary
                                : currentPreviewData.schemaSummary;
                            return [{
                                key: 'schema',
                                label: t('schemaSync.preview.tabLabel', { count: schemaStatements.length }),
                                children: (
                                    <div>
                                        <Text type="secondary">
                                            {schemaSummary || t('schemaSync.preview.descriptionFallback')}
                                        </Text>
                                        <pre
                                            style={{
                                                marginTop: 8,
                                                marginBottom: 0,
                                                padding: 10,
                                                border: '1px solid #f0f0f0',
                                                borderRadius: 6,
                                                background: '#fafafa',
                                                maxHeight: 420,
                                                overflow: 'auto',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word'
                                            }}
                                        >
                                            {schemaStatements.length > 0
                                                ? schemaStatements.join('\n')
                                                : t('schemaSync.preview.noExecutableChanges')}
                                        </pre>
                                    </div>
                                )
                            }];
                        })() : []),
                        ...(previewHasDataDiff ? [{
                            key: 'insert',
                            label: t('dataSync.preview.insertTab', { count: currentPreviewData.totalInserts || 0 }),
                            children: (
                                <div>
                                    <Text type="secondary">{t('dataSync.preview.insertSelectionHint')}</Text>
                                    <Table<DataPreviewInsertRow>
                                        size="small"
                                        style={{ marginTop: 8 }}
                                        rowKey={(r) => r.pk}
                                        dataSource={(currentPreviewData.inserts || []).map((r) => ({ ...r, key: r.pk }))}
                                        pagination={false}
                                        rowSelection={{
                                            selectedRowKeys: tableOptions[previewTable]?.selectedInsertPks || [],
                                            onChange: (keys) => updateTableOption(previewTable, 'selectedInsertPks', keys as string[]),
                                            getCheckboxProps: () => ({ disabled: !tableOptions[previewTable]?.insert }),
                                        }}
                                        columns={[
                                            { title: currentPreviewData.pkColumn || t('dataSync.columns.primaryKey'), dataIndex: 'pk', key: 'pk', width: 200, ellipsis: true },
                                            { title: t('dataSync.columns.data'), dataIndex: 'row', key: 'row', render: (v: QueryRow) => <pre style={{ margin: 0, maxHeight: 140, overflow: 'auto' }}>{JSON.stringify(v, null, 2)}</pre> }
                                        ]}
                                    />
                                </div>
                            )
                        },
                        {
                            key: 'update',
                            label: t('dataSync.preview.updateTab', { count: currentPreviewData.totalUpdates || 0 }),
                            children: (
                                <div>
                                    <Text type="secondary">{t('dataSync.preview.updateSelectionHint')}</Text>
                                    <Table<DataPreviewUpdateRow>
                                        size="small"
                                        style={{ marginTop: 8 }}
                                        rowKey={(r) => r.pk}
                                        dataSource={(currentPreviewData.updates || []).map((r) => ({ ...r, key: r.pk }))}
                                        pagination={false}
                                        rowSelection={{
                                            selectedRowKeys: tableOptions[previewTable]?.selectedUpdatePks || [],
                                            onChange: (keys) => updateTableOption(previewTable, 'selectedUpdatePks', keys as string[]),
                                            getCheckboxProps: () => ({ disabled: !tableOptions[previewTable]?.update }),
                                        }}
                                        columns={[
                                            { title: currentPreviewData.pkColumn || t('dataSync.columns.primaryKey'), dataIndex: 'pk', key: 'pk', width: 200, ellipsis: true },
                                            { title: t('dataSync.columns.changedColumns'), dataIndex: 'changedColumns', key: 'changedColumns', render: (v: string[] | undefined) => Array.isArray(v) ? v.join(', ') : '' },
                                            {
                                                title: t('dataSync.columns.detail'),
                                                key: 'detail',
                                                width: 80,
                                                render: (_: unknown, r: DataPreviewUpdateRow) => (
                                                    <Button size="small" onClick={() => {
                                                        Modal.info({
                                                            title: t('dataSync.preview.updateDetailTitle', { table: previewTable, pk: r.pk }),
                                                            width: 900,
                                                            content: (
                                                                <div style={{ display: 'flex', gap: 12 }}>
                                                                    <div style={{ flex: 1 }}>
                                                                        <Title level={5}>{t('dataSync.preview.source')}</Title>
                                                                        <pre style={{ maxHeight: 360, overflow: 'auto', background: '#f5f5f5', padding: 8 }}>{JSON.stringify(r.source, null, 2)}</pre>
                                                                    </div>
                                                                    <div style={{ flex: 1 }}>
                                                                        <Title level={5}>{t('dataSync.preview.target')}</Title>
                                                                        <pre style={{ maxHeight: 360, overflow: 'auto', background: '#f5f5f5', padding: 8 }}>{JSON.stringify(r.target, null, 2)}</pre>
                                                                    </div>
                                                                </div>
                                                            )
                                                        });
                                                    }}>{t('dataSync.actions.view')}</Button>
                                                )
                                            }
                                        ]}
                                    />
                                </div>
                            )
                        },
                        {
                            key: 'delete',
                            label: t('dataSync.preview.deleteTab', { count: currentPreviewData.totalDeletes || 0 }),
                            children: (
                                <div>
                                    <Alert type="warning" showIcon message={t('dataSync.preview.deleteWarning')} />
                                    <Text type="secondary">{t('dataSync.preview.deleteSelectionHint')}</Text>
                                    <Table<DataPreviewDeleteRow>
                                        size="small"
                                        style={{ marginTop: 8 }}
                                        rowKey={(r) => r.pk}
                                        dataSource={(currentPreviewData.deletes || []).map((r) => ({ ...r, key: r.pk }))}
                                        pagination={false}
                                        rowSelection={{
                                            selectedRowKeys: tableOptions[previewTable]?.selectedDeletePks || [],
                                            onChange: (keys) => updateTableOption(previewTable, 'selectedDeletePks', keys as string[]),
                                            getCheckboxProps: () => ({ disabled: !tableOptions[previewTable]?.delete }),
                                        }}
                                        columns={[
                                            { title: currentPreviewData.pkColumn || t('dataSync.columns.primaryKey'), dataIndex: 'pk', key: 'pk', width: 200, ellipsis: true },
                                            { title: t('dataSync.columns.data'), dataIndex: 'row', key: 'row', render: (v: QueryRow) => <pre style={{ margin: 0, maxHeight: 140, overflow: 'auto' }}>{JSON.stringify(v, null, 2)}</pre> }
                                        ]}
                                    />
                                </div>
                            )
                        }] : []),
                        {
                            key: 'sql',
                            label: t('dataSync.sqlTabLabel', { count: previewSql.statementCount }),
                            children: (
                                <div>
                                    <Alert
                                        type="info"
                                        showIcon
                                        message={
                                            previewHasDataDiff
                                                ? t('dataSync.preview.sqlDataNotice')
                                                : t('dataSync.preview.sqlSchemaNotice')
                                        }
                                    />
                                    <div style={{ marginTop: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text type="secondary">
                                            {previewHasDataDiff
                                                ? t('dataSync.preview.sqlDataSummary', { count: previewSql.statementCount })
                                                : t('dataSync.preview.sqlSchemaSummary', { count: previewSql.statementCount })}
                                        </Text>
                                        <Button
                                            size="small"
                                            disabled={!previewSql.sqlText}
                                            onClick={async () => {
                                                try {
                                                    await navigator.clipboard.writeText(previewSql.sqlText || '');
                                                    message.success(t('dataSync.sql.copySuccess'));
                                                } catch {
                                                    message.error(t('dataSync.sql.copyFailed'));
                                                }
                                            }}
                                        >
                                            {t('dataSync.preview.copySql')}
                                        </Button>
                                    </div>
                                    <pre
                                        style={{
                                            margin: 0,
                                            padding: 10,
                                            border: '1px solid #f0f0f0',
                                            borderRadius: 6,
                                            background: '#fafafa',
                                            maxHeight: 420,
                                            overflow: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word'
                                        }}
                                    >
                                        {previewSql.sqlText || (previewHasDataDiff ? t('dataSync.preview.noSqlForSelection') : t('schemaSync.preview.noExecutableChanges'))}
                                    </pre>
                                </div>
                            )
                        }
                    ]}
                />
            </div>
        )}
    </Drawer>
    </>
  );
};

export default DataSyncModal;
