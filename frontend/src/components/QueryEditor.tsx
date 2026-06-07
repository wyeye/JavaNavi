import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor, { OnMount, type Monaco } from '@monaco-editor/react';
import type { editor, Position } from 'monaco-editor';
import type { ColumnsType } from 'antd/es/table';
import { Button, message, Modal, Input, Form, Dropdown, MenuProps, Tooltip, Select, Tabs, Switch, Table } from 'antd';
import { PlayCircleOutlined, SaveOutlined, FormatPainterOutlined, SettingOutlined, CloseOutlined, StopOutlined, RobotOutlined } from '@ant-design/icons';
import { format } from 'sql-formatter';
import { v4 as uuidv4 } from 'uuid';
import type { TabData, ColumnDefinition, IndexDefinition, SavedConnection } from '../types';
import { useStore } from '../store';
import { DBQueryWithCancel, DBQueryMulti, DBQueryMultiStream, DBGetTables, DBGetAllColumns, DBGetDatabases, DBGetColumns, DBGetIndexes, CancelQuery, GenerateQueryID, WriteSQLFile, type QueryResult, type QueryStreamEvent } from '@compat/javanaviApp';
import DataGrid, { JAVANAVI_ROW_KEY } from './DataGrid';
import ExecutionPlanResultView from './ExecutionPlanResultView';
import { applyQueryAutoLimit } from '../utils/queryAutoLimit';
import { resolveEditRowLocator, type EditRowLocator } from '../utils/rowLocator';
import { getDataSourceCapabilities } from '../utils/dataSourceCapabilities';
import { convertMongoShellToJsonCommand } from '../utils/mongodb';
import { getShortcutDisplay, isEditableElement, isQuerySaveShortcutMatch, isShortcutMatch } from '../utils/shortcuts';
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { resolveSqlDialect, resolveSqlFunctions, resolveSqlKeywords } from '../utils/sqlDialect';
import { isExecutionPlanSql } from '../utils/executionPlanPresentation';
import { translate, type I18nKey } from '../i18n';
import { buildQueryResultGroups, type ExecutionSummaryRow } from '../utils/queryResultGrouping';

const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'LIMIT', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'LEFT', 'RIGHT',
    'INNER', 'OUTER', 'ON', 'GROUP BY', 'ORDER BY', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS',
    'IN', 'VALUES', 'SET', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'MODIFY', 'CHANGE',
    'COLUMN', 'KEY', 'PRIMARY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'AUTO_INCREMENT',
    'COMMENT', 'SHOW', 'DESCRIBE', 'EXPLAIN',
];

// 模块级标志：确保 SQL completion provider 全局只注册一次
let sqlCompletionRegistered = false;

// 模块级共享变量：completion provider 从这些变量读取当前活跃 Tab 的状态。
// 每个 QueryEditor 实例在成为活跃 Tab 时更新这些变量，确保 provider 始终使用正确的上下文。
type QueryRow = Record<string, unknown> & Partial<Record<typeof JAVANAVI_ROW_KEY, string | number>>;
type TableMeta = { dbName: string; tableName: string };
type ColumnMeta = { dbName: string; tableName: string; name: string; type: string };
type QueryResultSetData = { columns?: string[]; rows?: QueryRow[]; statementIndex?: number; startLine?: number; endLine?: number; sql?: string; status?: string; message?: string; transactionRolledBack?: boolean };
type AffectedRowsPayload = { affectedRows?: number };
type StatementExecutionStatus = 'success' | 'error' | 'pending' | 'rolledBack';
type DatabaseRow = { Database?: unknown; database?: unknown };
type SlashCommandDef = { cmd: string; label: string; desc: string; prompt: string; useSelection?: boolean };
type InsertSqlEventDetail = { tabId?: string; sql?: string; connectionId?: string; dbName?: string; runImmediately?: boolean };
type InsertSqlEvent = CustomEvent<InsertSqlEventDetail>;
type QueryEditorMonaco = Monaco;
type QueryEditorModel = editor.ITextModel;
type QueryEditorPosition = Position;
type QueryEditorInstance = editor.IStandaloneCodeEditor;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
);

const getErrorMessage = (error: unknown, fallback = 'Unknown error'): string => {
    if (error instanceof Error) return error.message || fallback;
    if (typeof error === 'string') return error || fallback;
    if (isRecord(error) && typeof error.message === 'string' && error.message) return error.message;
    if (error === null || error === undefined) return fallback;
    return String(error) || fallback;
};

const queryArrayData = <T,>(result: QueryResult): T[] => (
    Array.isArray(result.data) ? result.data as T[] : []
);

const toQueryRows = (value: unknown): QueryRow[] => (
    Array.isArray(value) ? value.filter((row): row is QueryRow => isRecord(row)) : []
);

const firstRecordValue = (row: unknown): unknown => (
    isRecord(row) ? Object.values(row)[0] : undefined
);

const affectedRowsOf = (value: unknown): number | undefined => {
    if (!isRecord(value)) return undefined;
    const affectedRows = Number((value as AffectedRowsPayload).affectedRows);
    return Number.isFinite(affectedRows) ? affectedRows : undefined;
};

const affectedRowsRow = (affected: number): QueryRow => ({ affectedRows: affected, [JAVANAVI_ROW_KEY]: 0 });

const statementExecutionSummaryRow = (input: {
    statementIndex: number;
    startLine: number;
    endLine: number;
    status: StatementExecutionStatus;
    message: string;
    affectedRows?: number;
    statusText: string;
}): QueryRow => ({
    statementIndex: input.statementIndex,
    startLine: input.startLine,
    endLine: input.endLine,
    status: input.statusText,
    message: input.message,
    ...(Number.isFinite(Number(input.affectedRows)) ? { affectedRows: Number(input.affectedRows) } : {}),
    [JAVANAVI_ROW_KEY]: `statement-${input.statementIndex}`,
});

const statementResultTitle = (t: (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string, statementIndex?: number, startLine?: number, endLine?: number): string => {
    const indexText = Number.isFinite(Number(statementIndex))
        ? t('queryEditor.statement.index', { index: Number(statementIndex) })
        : t('queryEditor.statement.generic');
    const start = Number(startLine);
    const end = Number(endLine);
    if (!Number.isFinite(start) || start <= 0) return indexText;
    if (Number.isFinite(end) && end > start) return t('queryEditor.statement.lineRange', { title: indexText, start, end });
    return t('queryEditor.statement.lineSingle', { title: indexText, line: start });
};

const queryResultSetDataArray = (result: QueryResult): QueryResultSetData[] => (
    Array.isArray(result.data) ? result.data as QueryResultSetData[] : []
);

let sharedCurrentDb = '';
let sharedCurrentConnectionId = '';
let sharedConnections: SavedConnection[] = [];
let sharedTablesData: TableMeta[] = [];
let sharedAllColumnsData: ColumnMeta[] = [];
let sharedVisibleDbs: string[] = [];
let sharedColumnsCacheData: Record<string, ColumnDefinition[]> = {};


declare global {
    interface Window {
        __javanaviSlashCmdDefs?: SlashCommandDef[];
    }
}

type RunMode = 'all' | 'current' | 'selected';
type RunSource = 'executionPlan' | 'reload' | 'query';
type RunRequest = RunMode | { sql: string; source?: RunSource };

const QueryEditor: React.FC<{ tab: TabData; isActive?: boolean }> = ({ tab, isActive = true }) => {
  const [query, setQuery] = useState(tab.query || 'SELECT * FROM ');

  type ResultSet = {
      kind?: 'executionSummary' | 'queryResult';
      key: string;
      sql: string;
      exportSql?: string;
      rows: QueryRow[];
      columns: string[];
      tableName?: string;
      pkColumns: string[];
      editLocator?: EditRowLocator;
      readOnly: boolean;
      truncated?: boolean;
      pkLoading?: boolean;
      source?: RunSource;
      statementIndex?: number;
      startLine?: number;
      endLine?: number;
      status?: StatementExecutionStatus;
      message?: string;
      statementSummary?: boolean;
      transactionRolledBack?: boolean;
  };

  // Result Sets
  const [resultSets, setResultSets] = useState<ResultSet[]>([]);
  const [activeResultKey, setActiveResultKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string>('');
  const [, setCurrentQueryId] = useState<string>('');
  const runSeqRef = useRef(0);
  const currentQueryIdRef = useRef('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveForm] = Form.useForm();

  // Database Selection
  const [currentConnectionId, setCurrentConnectionId] = useState<string>(tab.connectionId);
  const [currentDb, setCurrentDb] = useState<string>(tab.dbName || '');
  const [dbList, setDbList] = useState<string[]>([]);

  // Resizing state
  const [editorHeight, setEditorHeight] = useState(300);
  const editorRef = useRef<QueryEditorInstance | null>(null);
  const monacoRef = useRef<QueryEditorMonaco | null>(null);
  const lastExternalQueryRef = useRef<string>(tab.query || '');
  const dragRef = useRef<{ startY: number, startHeight: number } | null>(null);
  const queryEditorRootRef = useRef<HTMLDivElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const tablesRef = useRef<TableMeta[]>([]); // Store tables for autocomplete (cross-db)
  const allColumnsRef = useRef<ColumnMeta[]>([]); // Store all columns (cross-db)
  const visibleDbsRef = useRef<string[]>([]); // Store visible databases for cross-db intellisense

  const connections = useStore(state => state.connections);
  const queryCapableConnections = useMemo(
      () => connections.filter(c => getDataSourceCapabilities(c.config).supportsQueryEditor),
      [connections]
  );
  const addSqlLog = useStore(state => state.addSqlLog);
  const addTab = useStore(state => state.addTab);
  const savedQueries = useStore(state => state.savedQueries);
  const language = useStore(state => state.language);
  const t = useMemo(() => (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
  const buildAiContextText = useMemo(() => (conn: SavedConnection | undefined | null, dbName: string): string => {
      if (!conn) return '';
      return t('queryEditor.ai.context', {
          dbType: String(conn.config?.type || 'Database'),
          connectionName: conn.name,
          dbName: dbName || t('queryEditor.ai.defaultDatabase'),
      });
  }, [t]);
  const currentConnectionIdRef = useRef(currentConnectionId);
  const currentDbRef = useRef(currentDb);
  const connectionsRef = useRef(connections);
  const columnsCacheRef = useRef<Record<string, ColumnDefinition[]>>({});
  const saveQuery = useStore(state => state.saveQuery);
  const theme = useStore(state => state.theme);
  const darkMode = theme === 'dark';
  const sqlFormatOptions = useStore(state => state.sqlFormatOptions);
  const setSqlFormatOptions = useStore(state => state.setSqlFormatOptions);
  const queryOptions = useStore(state => state.queryOptions);
  const queryExecutionOptions = useMemo(() => ({ autoCommit: queryOptions?.autoCommit ?? true }), [queryOptions?.autoCommit]);
  const setQueryOptions = useStore(state => state.setQueryOptions);
  const shortcutOptions = useStore(state => state.shortcutOptions);
  const activeTabId = useStore(state => state.activeTabId);
  const autoFetchVisible = useAutoFetchVisibility();

  const currentSavedQuery = useMemo(() => {
      const savedId = String(tab.savedQueryId || '').trim();
      if (savedId) {
          return savedQueries.find((item) => item.id === savedId) || null;
      }
      const tabId = String(tab.id || '').trim();
      if (!tabId) {
          return null;
      }
      return savedQueries.find((item) => item.id === tabId) || null;
  }, [savedQueries, tab.id, tab.savedQueryId]);

  useEffect(() => {
      currentConnectionIdRef.current = currentConnectionId;
  }, [currentConnectionId]);

  useEffect(() => {
      if (!queryCapableConnections.some(c => c.id === currentConnectionId)) {
          const fallback = queryCapableConnections[0]?.id || '';
          if (fallback && fallback !== currentConnectionId) {
              setCurrentConnectionId(fallback);
              setCurrentDb('');
          }
      }
  }, [queryCapableConnections, currentConnectionId]);

  useEffect(() => {
      currentDbRef.current = currentDb;
  }, [currentDb]);

  // 当此 Tab 成为活跃 Tab 时，将本实例的状态同步到模块级共享变量
  // 确保 completion provider 始终使用当前活跃 Tab 的上下文
  useEffect(() => {
      if (activeTabId !== tab.id) return;
      sharedCurrentDb = currentDb;
      sharedCurrentConnectionId = currentConnectionId;
      sharedConnections = connections;
      sharedTablesData = tablesRef.current;
      sharedAllColumnsData = allColumnsRef.current;
      sharedVisibleDbs = visibleDbsRef.current;
      sharedColumnsCacheData = columnsCacheRef.current;
  }, [activeTabId, tab.id, currentDb, currentConnectionId, connections]);

  useEffect(() => {
      connectionsRef.current = connections;
  }, [connections]);

  const getCurrentQuery = () => {
      const val = editorRef.current?.getValue?.();
      if (typeof val === 'string') return val;
      return query || '';
  };

  const syncQueryToEditor = (sql: string) => {
      const next = sql || '';
      setQuery(next);
      const editor = editorRef.current;
      if (editor && editor.getValue?.() !== next) {
          editor.setValue(next);
      }
  };

  // If opening a saved query, load its SQL
  useEffect(() => {
      const incoming = tab.query || '';
      if (incoming === lastExternalQueryRef.current) {
          return;
      }
      lastExternalQueryRef.current = incoming;
      syncQueryToEditor(incoming || 'SELECT * FROM ');
  }, [tab.id, tab.query]);

  // Fetch Database List
  useEffect(() => {
      if (!autoFetchVisible) {
          return;
      }

      const fetchDbs = async () => {
          const conn = connections.find(c => c.id === currentConnectionId);
          if (!conn) return;

          const config = {
            ...conn.config,
            port: Number(conn.config.port),
            password: conn.config.password || "",
            database: conn.config.database || "",
            useSSH: conn.config.useSSH || false,
            ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
          };

          const res = await DBGetDatabases(buildRpcConnectionConfig(config));
          if (res.success && Array.isArray(res.data)) {
              let dbs = queryArrayData<DatabaseRow>(res)
                  .map((row) => String(row.Database || row.database || ''))
                  .filter(Boolean);

              // 过滤只显示 includeDatabases 中配置的数据库
              const includeDbs = conn.includeDatabases;
              if (includeDbs && includeDbs.length > 0) {
                  dbs = dbs.filter((db: string) => includeDbs.includes(db));
              }

              // 存储可见数据库列表用于跨库智能提示
              visibleDbsRef.current = dbs;
              if (activeTabId === tab.id) {
                  sharedVisibleDbs = dbs;
              }

              setDbList(dbs);
              if (!currentDbRef.current) {
                  if (conn.config.database && dbs.includes(conn.config.database)) setCurrentDb(conn.config.database);
                  else if (dbs.length > 0 && dbs[0] !== 'information_schema') setCurrentDb(dbs[0]);
              }
          } else {
              visibleDbsRef.current = [];
              if (activeTabId === tab.id) {
                  sharedVisibleDbs = [];
              }
              setDbList([]);
          }
      };
      void fetchDbs();
  }, [autoFetchVisible, currentConnectionId, connections]);

  // Fetch Metadata for Autocomplete (Cross-database)
  useEffect(() => {
      if (!autoFetchVisible) {
          return;
      }

      const fetchMetadata = async () => {
          const conn = connections.find(c => c.id === currentConnectionId);
          if (!conn) return;

          const visibleDbs = visibleDbsRef.current;
          if (!visibleDbs || visibleDbs.length === 0) return;

          const config = {
            ...conn.config,
            port: Number(conn.config.port),
            password: conn.config.password || "",
            database: conn.config.database || "",
            useSSH: conn.config.useSSH || false,
            ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
          };

          // 加载所有可见数据库的表
          const allTables: {dbName: string, tableName: string}[] = [];
          const allColumns: {dbName: string, tableName: string, name: string, type: string}[] = [];

          for (const dbName of visibleDbs) {
              // 获取表
              const resTables = await DBGetTables(buildRpcConnectionConfig(config), dbName);
              if (resTables.success && Array.isArray(resTables.data)) {
                  const tableNames = queryArrayData<Record<string, unknown>>(resTables)
                      .map((row) => String(firstRecordValue(row) || ''))
                      .filter(Boolean);
                  tableNames.forEach((tableName: string) => {
                      allTables.push({ dbName, tableName });
                  });
              }

              // 获取列 (所有数据库类型都支持 DBGetAllColumns)
              const resCols = await DBGetAllColumns(buildRpcConnectionConfig(config), dbName);
              if (resCols.success && Array.isArray(resCols.data)) {
                  queryArrayData<ColumnMeta>(resCols).forEach((col) => {
                      allColumns.push({
                          dbName,
                          tableName: col.tableName,
                          name: col.name,
                          type: col.type
                      });
                  });
              }
          }

          tablesRef.current = allTables;
          allColumnsRef.current = allColumns;
          // 如果当前 Tab 是活跃 Tab，同步更新共享变量
          if (activeTabId === tab.id) {
              sharedTablesData = allTables;
              sharedAllColumnsData = allColumns;
          }
      };
      void fetchMetadata();
  }, [autoFetchVisible, currentConnectionId, connections, dbList]); // dbList 变化时触发重新加载

  // Query ID management helpers
  const setQueryId = (id: string) => {
      currentQueryIdRef.current = id;
      setCurrentQueryId(id);
  };

  const clearQueryId = () => {
      currentQueryIdRef.current = '';
      setCurrentQueryId('');
  };

  // Handle Resizing
  const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startHeight: editorHeight };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientY - dragRef.current.startY;
      const newHeight = Math.max(100, Math.min(window.innerHeight - 200, dragRef.current.startHeight + delta));
      setEditorHeight(newHeight);
  };

  const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
  };

  // Setup Autocomplete and Editor
  const handleEditorDidMount: OnMount = (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // 应用透明主题（主题已在 main.tsx 全局注册）
      monaco.editor.setTheme(darkMode ? 'transparent-dark' : 'transparent-light');

      // 注册 AI 右键菜单操作
      const aiActions = [
          { id: 'ai.generateSQL', label: t('queryEditor.ai.generateSQL.label'), prompt: t('queryEditor.ai.generateSQL.prompt') },
          { id: 'ai.explainSQL', label: t('queryEditor.ai.explainSQL.label'), useSelection: true, prompt: t('queryEditor.ai.explainSQL.prompt') },
          { id: 'ai.optimizeSQL', label: t('queryEditor.ai.optimizeSQL.label'), useSelection: true, prompt: t('queryEditor.ai.optimizeSQL.prompt') },
      ];

      aiActions.forEach(action => {
          editor.addAction({
              id: action.id,
              label: action.label,
              contextMenuGroupId: '9_ai',
              contextMenuOrder: 1,
              run: (ed: editor.ICodeEditor) => {
                  const selectionRange = ed.getSelection();
                  const selection = selectionRange ? ed.getModel()?.getValueInRange(selectionRange) : '';
                  const conn = connectionsRef.current.find(c => c.id === currentConnectionIdRef.current);
                  const ctxText = buildAiContextText(conn, currentDbRef.current);
                  let prompt = ctxText + action.prompt;
                  if (action.useSelection && selection) {
                      prompt = prompt.replace('{SQL}', selection);
                  }
                  // 打开 AI 面板并填入 prompt
                  const store = useStore.getState();
                  if (!store.aiPanelVisible) {
                      store.setAIPanelVisible(true);
                  }
                  // 通过自定义事件将 prompt 发送到 AI 面板
                  window.dispatchEvent(new CustomEvent('javanavi:ai:inject-prompt', { detail: { prompt } }));
              },
          });
      });

      // 全局只注册一次 SQL completion provider，避免多 tab 重复注册导致补全项重复
      if (!sqlCompletionRegistered) {
      sqlCompletionRegistered = true;
      monaco.languages.registerCompletionItemProvider('sql', {
          triggerCharacters: ['.'],
          provideCompletionItems: async (model: QueryEditorModel, position: QueryEditorPosition) => {
              const word = model.getWordUntilPosition(position);
              const range = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: word.startColumn,
                  endColumn: word.endColumn,
              };
              const activeConnection = sharedConnections.find(c => c.id === sharedCurrentConnectionId);
              const activeDialect = resolveSqlDialect(
                  String(activeConnection?.config?.type || ''),
                  String(activeConnection?.config?.driver || ''),
              );
              const dialectKeywords = resolveSqlKeywords(activeDialect);
              const dialectFunctions = resolveSqlFunctions(activeDialect);

              const stripQuotes = (ident: string) => {
                  let raw = (ident || '').trim();
                  if (!raw) return raw;
                  const first = raw[0];
                  const last = raw[raw.length - 1];
                  if ((first === '`' && last === '`') || (first === '"' && last === '"')) {
                      raw = raw.slice(1, -1);
                  }
                  return raw.trim();
              };

              const normalizeQualifiedName = (ident: string) => {
                  const raw = (ident || '').trim();
                  if (!raw) return raw;
                  return raw
                      .split('.')
                      .map(p => stripQuotes(p.trim()))
                      .filter(Boolean)
                      .join('.');
              };

              const getLastPart = (qualified: string) => {
                  const raw = normalizeQualifiedName(qualified);
                  if (!raw) return raw;
                  const parts = raw.split('.').filter(Boolean);
                  return parts[parts.length - 1] || raw;
              };

              const splitSchemaAndTable = (qualified: string): { schema: string; table: string } => {
                  const raw = normalizeQualifiedName(qualified);
                  if (!raw) return { schema: '', table: '' };
                  const parts = raw.split('.').filter(Boolean);
                  if (parts.length >= 2) {
                      return {
                          schema: parts[parts.length - 2] || '',
                          table: parts[parts.length - 1] || '',
                      };
                  }
                  return { schema: '', table: parts[0] || '' };
              };

              const buildConnConfig = () => {
                  const connId = sharedCurrentConnectionId;
                  const conn = sharedConnections.find(c => c.id === connId);
                  if (!conn) return null;
                  return {
                      ...conn.config,
                      port: Number(conn.config.port),
                      password: conn.config.password || "",
                      database: conn.config.database || "",
                      useSSH: conn.config.useSSH || false,
                      ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
                  };
              };

              const getColumnsByDB = async (tableIdent: string) => {
                  const connId = sharedCurrentConnectionId;
                  const dbName = sharedCurrentDb;
                  if (!connId || !dbName) return [] as ColumnDefinition[];
                  const key = `${connId}|${dbName}|${tableIdent}`;
                  const cached = sharedColumnsCacheData[key];
                  if (cached) return cached;

                  const config = buildConnConfig();
                  if (!config) return [] as ColumnDefinition[];

                  const res = await DBGetColumns(buildRpcConnectionConfig(config), dbName, tableIdent);
                  if (res?.success && Array.isArray(res.data)) {
                      const cols = queryArrayData<ColumnDefinition>(res);
                      sharedColumnsCacheData[key] = cols;
                      return cols;
                  }
                  return [] as ColumnDefinition[];
              };

              const fullText = model.getValue();

              // 获取当前行光标前的内容
              const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);

              // 0) 三段式 db.table.column 格式：当输入 db.table. 时提示列
              const threePartMatch = linePrefix.match(/([`"]?\w+[`"]?)\.([`"]?\w+[`"]?)\.(\w*)$/);
              if (threePartMatch) {
                  const dbPart = stripQuotes(threePartMatch[1]);
                  const tablePart = stripQuotes(threePartMatch[2]);
                  const colPrefix = (threePartMatch[3] || '').toLowerCase();

                  // 在 allColumnsRef 中查找匹配的列
                  const cols = sharedAllColumnsData.filter(c =>
                      (c.dbName || '').toLowerCase() === dbPart.toLowerCase() &&
                      (c.tableName || '').toLowerCase() === tablePart.toLowerCase()
                  );

                  const filtered = colPrefix
                      ? cols.filter(c => (c.name || '').toLowerCase().startsWith(colPrefix))
                      : cols;

                  const suggestions = filtered.map(c => ({
                      label: c.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: c.name,
                      detail: `${c.type} (${c.dbName}.${c.tableName})`,
                      range,
                      sortText: '0' + c.name
                  }));
                  return { suggestions };
              }

              // 1) 两段式 qualifier.xxx 格式
              const qualifierMatch = linePrefix.match(/([`"]?[A-Za-z_]\w*[`"]?)\.(\w*)$/);
              if (qualifierMatch) {
                  const qualifier = stripQuotes(qualifierMatch[1]);
                  const prefix = (qualifierMatch[2] || '').toLowerCase();
                  const qualifierLower = qualifier.toLowerCase();

                  // 首先检查 qualifier 是否是数据库名（跨库表提示）
                  const visibleDbs = sharedVisibleDbs;
                  if (visibleDbs.some(db => db.toLowerCase() === qualifierLower)) {
                      // qualifier 是数据库名，提示该库的表
                      const tables = sharedTablesData.filter(t =>
                          (t.dbName || '').toLowerCase() === qualifierLower
                      );
                      const filtered = prefix
                          ? tables.filter(t => (t.tableName || '').toLowerCase().startsWith(prefix))
                          : tables;

                      const suggestions = filtered.map(t => ({
                          label: t.tableName,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: t.tableName,
                          detail: `Table (${t.dbName})`,
                          range,
                          sortText: '0' + t.tableName
                      }));
                      return { suggestions };
                  }

                  // qualifier 是 schema（如 dbo/public）时，仅补全表名，避免输入 dbo. 后再补成 dbo.dbo.table
                  const schemaTables = sharedTablesData
                      .map(t => {
                          const parsed = splitSchemaAndTable(t.tableName || '');
                          return {
                              dbName: t.dbName || '',
                              schema: parsed.schema,
                              table: parsed.table,
                          };
                      })
                      .filter(t => t.schema.toLowerCase() === qualifierLower && !!t.table);

                  if (schemaTables.length > 0) {
                      const filtered = prefix
                          ? schemaTables.filter(t => t.table.toLowerCase().startsWith(prefix))
                          : schemaTables;

                      const suggestions = filtered.map(t => ({
                          label: t.table,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: t.table,
                          detail: `Table (${t.dbName}${t.schema ? '.' + t.schema : ''})`,
                          range,
                          sortText: '0' + t.table
                      }));
                      return { suggestions };
                  }

                  // 否则检查是否是表别名或表名，提示列
                  const reserved = new Set([
                      'where', 'on', 'group', 'order', 'limit', 'having',
                      'left', 'right', 'inner', 'outer', 'full', 'cross', 'join',
                      'union', 'except', 'intersect', 'as', 'set', 'values', 'returning',
                  ]);

                  const aliasMap: Record<string, {dbName: string, tableName: string}> = {};
                  // Capture table and optional alias, support db.table format
                  const aliasRegex = /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+([`"]?\w+[`"]?(?:\s*\.\s*[`"]?\w+[`"]?)?)(?:\s+(?:AS\s+)?([`"]?\w+[`"]?))?/gi;
                  let m;
                  while ((m = aliasRegex.exec(fullText)) !== null) {
                      const tableIdent = normalizeQualifiedName(m[1] || '');
                      if (!tableIdent) continue;

                      // 解析 db.table 或 table 格式
                      const parts = tableIdent.split('.');
                      let dbName = sharedCurrentDb || '';
                      let tableName = tableIdent;
                      if (parts.length === 2) {
                          dbName = parts[0];
                          tableName = parts[1];
                      }

                      const shortTable = getLastPart(tableIdent);
                      // 用表名作为 qualifier
                      if (shortTable) aliasMap[shortTable.toLowerCase()] = { dbName, tableName };

                      const a = stripQuotes(m[2] || '').trim();
                      if (!a) continue;
                      const al = a.toLowerCase();
                      if (reserved.has(al)) continue;
                      aliasMap[al] = { dbName, tableName };
                  }

                  const tableInfo = aliasMap[qualifier.toLowerCase()];
                  if (tableInfo) {
                      // Prefer preloaded MySQL all-columns cache
                      let cols: { name: string, type?: string, tableName?: string, dbName?: string }[];
                      if (sharedAllColumnsData.length > 0) {
                          const tiTableLower = (tableInfo.tableName || '').toLowerCase();
                          cols = sharedAllColumnsData
                              .filter(c => {
                                  if ((c.dbName || '').toLowerCase() !== (tableInfo.dbName || '').toLowerCase()) return false;
                                  const cTableLower = (c.tableName || '').toLowerCase();
                                  if (cTableLower === tiTableLower) return true;
                                  // schema.table 格式匹配纯表名
                                  const parsed = splitSchemaAndTable(c.tableName || '');
                                  return (parsed.table || '').toLowerCase() === tiTableLower;
                              })
                              .map(c => ({ name: c.name, type: c.type, tableName: c.tableName, dbName: c.dbName }));
                      } else {
                          const dbCols = await getColumnsByDB(tableInfo.tableName);
                          cols = dbCols.map(c => ({ name: c.name, type: c.type, tableName: tableInfo.tableName }));
                      }

                      const filtered = prefix
                          ? cols.filter(c => (c.name || '').toLowerCase().startsWith(prefix))
                          : cols;

                      const suggestions = filtered.map(c => ({
                          label: c.name,
                          kind: monaco.languages.CompletionItemKind.Field,
                          insertText: c.name,
                          detail: c.type ? `${c.type} (${c.dbName ? c.dbName + '.' : ''}${c.tableName})` : (c.tableName ? `(${c.tableName})` : ''),
                          range,
                          sortText: '0' + c.name
                      }));
                      return { suggestions };
                  }
              }

              // 2) global/table/column completion
              const tableRegex = /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+([`"]?\w+[`"]?(?:\s*\.\s*[`"]?\w+[`"]?)?)/gi;
              const foundTables = new Set<string>();
              let match;
              while ((match = tableRegex.exec(fullText)) !== null) {
                  const t = normalizeQualifiedName(match[1] || '');
                  if (!t) continue;
                  // 存储完整标识 db.table 或 table
                  foundTables.add(t.toLowerCase());
              }

              const currentDatabase = sharedCurrentDb || '';
              const wordPrefix = (word.word || '').toLowerCase();
              const startsWithPrefix = (candidate: string) => !wordPrefix || candidate.toLowerCase().startsWith(wordPrefix);
              const expectsTableName = /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM|TABLE|DESCRIBE|DESC|EXPLAIN)\s+[`"]?[\w.]*$/i.test(linePrefix.trim());
              const shouldBoostKeywords = !expectsTableName
                  && wordPrefix.length > 0
                  && dialectKeywords.some((keyword) => keyword.toLowerCase().startsWith(wordPrefix));
              const sortGroups = shouldBoostKeywords
                  ? { keyword: '00', func: '05', columnCurrent: '10', columnOther: '11', tableCurrent: '20', tableOther: '21', db: '30' }
                  : expectsTableName
                      ? { keyword: '20', func: '25', columnCurrent: '10', columnOther: '11', tableCurrent: '00', tableOther: '01', db: '30' }
                      : { keyword: '30', func: '25', columnCurrent: '00', columnOther: '01', tableCurrent: '10', tableOther: '11', db: '20' };

              // 相关列提示：匹配 SQL 中引用的表（FROM/JOIN 等）
              // 权重最高，输入 WHERE 条件时优先显示
              const relevantColumns = sharedAllColumnsData
                  .filter(c => {
                      const fullIdent = `${c.dbName}.${c.tableName}`.toLowerCase();
                      const shortIdent = (c.tableName || '').toLowerCase();
                      // 对 schema.table 格式，也用纯表名部分匹配（如 public.users → users）
                      const parsed = splitSchemaAndTable(c.tableName || '');
                      const pureIdent = (parsed.table || '').toLowerCase();
                      return (foundTables.has(fullIdent) || foundTables.has(shortIdent) || (pureIdent && foundTables.has(pureIdent))) && startsWithPrefix(c.name || '');
                  })
                  .map(c => {
                      // 当前库的表字段优先级更高
                      const isCurrentDb = (c.dbName || '').toLowerCase() === currentDatabase.toLowerCase();
                      return {
                          label: c.name,
                          kind: monaco.languages.CompletionItemKind.Field,
                          insertText: c.name,
                          detail: `${c.type} (${c.dbName}.${c.tableName})`,
                          range,
                          sortText: isCurrentDb ? sortGroups.columnCurrent + c.name : sortGroups.columnOther + c.name,
                      };
                  });

              // 表提示：当前库智能处理 schema.table 格式
              // 1. 构建纯表名到 schema 列表的映射，检测同名表
              const currentDbTables = sharedTablesData.filter(t =>
                  (t.dbName || '').toLowerCase() === currentDatabase.toLowerCase()
              );
              const tableNameToSchemas = new Map<string, string[]>();
              for (const t of currentDbTables) {
                  const parsed = splitSchemaAndTable(t.tableName || '');
                  const pureTable = (parsed.table || t.tableName || '').toLowerCase();
                  const schemas = tableNameToSchemas.get(pureTable) || [];
                  schemas.push(parsed.schema || '');
                  tableNameToSchemas.set(pureTable, schemas);
              }

              const tableSuggestions = sharedTablesData
                .filter(t => {
                    const isCurrentDb = (t.dbName || '').toLowerCase() === currentDatabase.toLowerCase();
                    if (!isCurrentDb) {
                        // 跨库：用 db.table 格式匹配
                        return startsWithPrefix(`${t.dbName}.${t.tableName}`);
                    }
                    // 当前库：同时用完整名和纯表名匹配
                    const parsed = splitSchemaAndTable(t.tableName || '');
                    const pureTable = parsed.table || t.tableName || '';
                    return startsWithPrefix(t.tableName || '') || startsWithPrefix(pureTable);
                })
                .map(t => {
                  const isCurrentDb = (t.dbName || '').toLowerCase() === currentDatabase.toLowerCase();
                  if (!isCurrentDb) {
                      const label = `${t.dbName}.${t.tableName}`;
                      return {
                          label,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: label,
                          detail: `Table (${t.dbName})`,
                          range,
                          sortText: sortGroups.tableOther + t.tableName,
                      };
                  }
                  // 当前库：检查是否有跨 schema 同名表
                  const parsed = splitSchemaAndTable(t.tableName || '');
                  const pureTable = parsed.table || t.tableName || '';
                  const schemas = tableNameToSchemas.get(pureTable.toLowerCase()) || [];
                  const hasDuplicate = schemas.length > 1;
                  // 同名表存在于多个 schema → 显示 schema.table；否则只显示纯表名
                  const label = hasDuplicate ? t.tableName : pureTable;
                  const insertText = hasDuplicate ? t.tableName : pureTable;
                  const schemaInfo = parsed.schema ? ` (${parsed.schema})` : '';
                  return {
                      label,
                      kind: monaco.languages.CompletionItemKind.Class,
                      insertText,
                      detail: `Table${schemaInfo}`,
                      range,
                      sortText: sortGroups.tableCurrent + pureTable,
                  };
              });

              // 数据库提示
              const dbSuggestions = sharedVisibleDbs
                  .filter((db) => startsWithPrefix(db))
                  .map(db => ({
                      label: db,
                      kind: monaco.languages.CompletionItemKind.Module,
                      insertText: db,
                      detail: 'Database',
                      range,
                      sortText: sortGroups.db + db,
                  }));

              // 关键字提示
              const keywordSuggestions = dialectKeywords
                  .filter((k) => startsWithPrefix(k))
                  .map(k => ({
                  label: k,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: k,
                  range,
                  sortText: sortGroups.keyword + k,
              }));

              // 内置函数提示
              const funcSuggestions = dialectFunctions
                  .filter((f) => startsWithPrefix(f.name))
                  .map(f => ({
                      label: f.name,
                      kind: monaco.languages.CompletionItemKind.Function,
                      insertText: f.name + '($0)',
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                      detail: f.detail,
                      range,
                      sortText: sortGroups.func + f.name,
                  }));

              const suggestions = [
                  ...relevantColumns,   // FROM 表的列最优先
                  ...tableSuggestions,  // 表次之
                  ...dbSuggestions,     // 数据库
                  ...funcSuggestions,   // 内置函数
                  ...keywordSuggestions // 关键字最后
              ];
              return { suggestions };
          }
      });
      // 注册 / 斜杠命令 AI 快捷补全
      const slashCmdDefs = [
          { cmd: '/query',    label: t('queryEditor.ai.slash.query.label'),    desc: t('queryEditor.ai.slash.query.desc'),    prompt: t('queryEditor.ai.slash.query.prompt') },
          { cmd: '/sql',      label: t('queryEditor.ai.slash.sql.label'),      desc: t('queryEditor.ai.slash.sql.desc'),      prompt: t('queryEditor.ai.slash.sql.prompt') },
          { cmd: '/explain',  label: t('queryEditor.ai.slash.explain.label'),  desc: t('queryEditor.ai.slash.explain.desc'),  prompt: t('queryEditor.ai.slash.explain.prompt'), useSelection: true },
          { cmd: '/optimize', label: t('queryEditor.ai.slash.optimize.label'), desc: t('queryEditor.ai.slash.optimize.desc'), prompt: t('queryEditor.ai.slash.optimize.prompt'), useSelection: true },
          { cmd: '/schema',   label: t('queryEditor.ai.slash.schema.label'),   desc: t('queryEditor.ai.slash.schema.desc'),   prompt: t('queryEditor.ai.slash.schema.prompt') },
          { cmd: '/index',    label: t('queryEditor.ai.slash.index.label'),    desc: t('queryEditor.ai.slash.index.desc'),    prompt: t('queryEditor.ai.slash.index.prompt') },
          { cmd: '/diff',     label: t('queryEditor.ai.slash.diff.label'),     desc: t('queryEditor.ai.slash.diff.desc'),     prompt: t('queryEditor.ai.slash.diff.prompt') },
          { cmd: '/mock',     label: t('queryEditor.ai.slash.mock.label'),     desc: t('queryEditor.ai.slash.mock.desc'),     prompt: t('queryEditor.ai.slash.mock.prompt') },
      ];
      // 全局变量存储命令定义，供 onDidChangeModelContent 使用
      window.__javanaviSlashCmdDefs = slashCmdDefs;

      monaco.languages.registerCompletionItemProvider('sql', {
          triggerCharacters: ['/'],
          provideCompletionItems: (model: QueryEditorModel, position: QueryEditorPosition) => {
              const lineContent = model.getLineContent(position.lineNumber);
              const textBefore = lineContent.substring(0, position.column - 1).trimStart();
              if (!textBefore.startsWith('/')) {
                  return { suggestions: [] };
              }

              const range = {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: position.column - textBefore.length,
                  endColumn: position.column,
              };

              return {
                  suggestions: slashCmdDefs.map((c, i) => ({
                      label: `${c.cmd}  ${c.label}`,
                      kind: monaco.languages.CompletionItemKind.Event,
                      detail: c.desc,
                      insertText: `__AI_${c.cmd.slice(1).toUpperCase()}__`,
                      range,
                      sortText: String(i).padStart(2, '0'),
                  })),
              };
          },
      });

      } // end sqlCompletionRegistered guard

      // 每个编辑器实例都注册内容变化监听（检测斜杠命令标记）
      let _handlingSlash = false;
      editor.onDidChangeModelContent(() => {
          if (_handlingSlash) return;
          const model = editor.getModel();
          if (!model) return;
          const content = model.getValue();
          const markerMatch = content.match(/__AI_(\w+)__/);
          if (!markerMatch) return;

          const cmdKey = markerMatch[1].toLowerCase();
          const defs = window.__javanaviSlashCmdDefs || [];
          const cmdDef = defs.find((c) => c.cmd === `/${cmdKey}`);
          if (!cmdDef) return;

          // 清除标记文本（带递归保护）
          _handlingSlash = true;
          const fullText = model.getValue();
          const newText = fullText.replace(markerMatch[0], '').replace(/^\s*\n/, '');
          model.setValue(newText);
          _handlingSlash = false;

          // 组装 prompt
          const conn = connectionsRef.current.find(c => c.id === currentConnectionIdRef.current);
          const ctxText = buildAiContextText(conn, currentDbRef.current);
          let finalPrompt = ctxText + cmdDef.prompt;
          if (cmdDef.useSelection) {
              const sel = editor.getSelection();
              const selText = sel ? model.getValueInRange(sel) : '';
              finalPrompt = finalPrompt.replace('{SQL}', selText || getCurrentQuery());
          }

          // 打开 AI 面板并注入 prompt
          const store = useStore.getState();
          if (!store.aiPanelVisible) {
              store.setAIPanelVisible(true);
          }
          setTimeout(() => {
              window.dispatchEvent(new CustomEvent('javanavi:ai:inject-prompt', { detail: { prompt: finalPrompt } }));
          }, store.aiPanelVisible ? 0 : 350);
      });
  };

  const handleFormat = () => {
      try {
          const formatted = format(getCurrentQuery(), { language: 'mysql', keywordCase: sqlFormatOptions.keywordCase });
          syncQueryToEditor(formatted);
      } catch (e) {
          void message.error(t('queryEditor.format.failed'));
      }
  };

  const handleAIAction = (action: 'generate' | 'explain' | 'optimize' | 'schema') => {
      const editor = editorRef.current;
      const selectionRange = editor?.getSelection();
      const selection = editor && selectionRange ? editor.getModel()?.getValueInRange(selectionRange) || '' : '';
      const fullSQL = getCurrentQuery();

      const conn = connections.find(c => c.id === currentConnectionId);
      const ctxText = buildAiContextText(conn, currentDb);

      const prompts: Record<string, string> = {
          generate: `${ctxText}${t('queryEditor.ai.generateSQL.prompt')}`,
          explain: `${ctxText}${t('queryEditor.ai.explainSQL.prompt', { SQL: selection || fullSQL })}`,
          optimize: `${ctxText}${t('queryEditor.ai.optimizeSQL.prompt', { SQL: selection || fullSQL })}`,
          schema: `${ctxText}${t('queryEditor.ai.schemaPrompt')}`,
      };

      const store = useStore.getState();
      if (!store.aiPanelVisible) {
          store.setAIPanelVisible(true);
      }
      window.dispatchEvent(new CustomEvent('javanavi:ai:inject-prompt', { detail: { prompt: prompts[action] } }));
  };

  const formatSettingsMenu: MenuProps['items'] = [
      {
          key: 'upper',
          label: t('queryEditor.format.keywordUpper'),
          icon: sqlFormatOptions.keywordCase === 'upper' ? '✓' : undefined,
          onClick: () => setSqlFormatOptions({ keywordCase: 'upper' })
      },
      {
          key: 'lower',
          label: t('queryEditor.format.keywordLower'),
          icon: sqlFormatOptions.keywordCase === 'lower' ? '✓' : undefined,
          onClick: () => setSqlFormatOptions({ keywordCase: 'lower' })
      },
      { type: 'divider' },
      {
          key: 'shortcut-settings',
          label: t('queryEditor.format.shortcutSettings'),
          onClick: () => window.dispatchEvent(new CustomEvent('javanavi:open-shortcut-settings')),
      },
  ];

  const splitSQLStatements = (sql: string): string[] => {
    const text = (sql || '').replace(/\r\n/g, '\n');
    const statements: string[] = [];

    let cur = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let escaped = false;
    let inLineComment = false;
    let inBlockComment = false;
    let dollarTag: string | null = null; // postgres/kingbase: $$...$$ or $tag$...$tag$

    const push = () => {
        const s = cur.trim();
        if (s) statements.push(s);
        cur = '';
    };

    const isWS = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = i + 1 < text.length ? text[i + 1] : '';
        const prev = i > 0 ? text[i - 1] : '';
        const next2 = i + 2 < text.length ? text[i + 2] : '';

        if (!inSingle && !inDouble && !inBacktick) {
            if (inLineComment) {
                cur += ch;
                if (ch === '\n') inLineComment = false;
                continue;
            }

            if (inBlockComment) {
                cur += ch;
                if (ch === '*' && next === '/') {
                    cur += next;
                    i++;
                    inBlockComment = false;
                }
                continue;
            }

            // Start comments
            if (ch === '/' && next === '*') {
                cur += ch + next;
                i++;
                inBlockComment = true;
                continue;
            }
            if (ch === '#') {
                cur += ch;
                inLineComment = true;
                continue;
            }
            if (ch === '-' && next === '-' && (i === 0 || isWS(prev)) && (next2 === '' || isWS(next2))) {
                cur += ch + next;
                i++;
                inLineComment = true;
                continue;
            }

            // Dollar-quoted strings (PG/Kingbase)
            if (dollarTag) {
                if (text.startsWith(dollarTag, i)) {
                    cur += dollarTag;
                    i += dollarTag.length - 1;
                    dollarTag = null;
                } else {
                    cur += ch;
                }
                continue;
            }
            if (ch === '$') {
                const m = text.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
                if (m && m[0]) {
                    dollarTag = m[0];
                    cur += dollarTag;
                    i += dollarTag.length - 1;
                    continue;
                }
            }
        }

        if (escaped) {
            cur += ch;
            escaped = false;
            continue;
        }

        if ((inSingle || inDouble) && ch === '\\') {
            cur += ch;
            escaped = true;
            continue;
        }

        if (!inDouble && !inBacktick && ch === '\'') {
            inSingle = !inSingle;
            cur += ch;
            continue;
        }
        if (!inSingle && !inBacktick && ch === '"') {
            inDouble = !inDouble;
            cur += ch;
            continue;
        }
        if (!inSingle && !inDouble && ch === '`') {
            inBacktick = !inBacktick;
            cur += ch;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && !dollarTag && (ch === ';' || ch === '；')) {
            push();
            continue;
        }

        cur += ch;
    }

    push();
    return statements;
  };

  const getSelectedSQL = (): string => {
      const editor = editorRef.current;
      if (!editor) return '';
      const model = editor.getModel?.();
      const selection = editor.getSelection?.();
      if (!model || !selection) return '';

      const selected = model.getValueInRange?.(selection) || '';
      if (typeof selected !== 'string') return '';
      if (!selected.trim()) return '';
      return selected;
  };

  const resolveCurrentStatementSQL = (): string => {
      const editor = editorRef.current;
      const fullSQL = getCurrentQuery();
      if (!editor || !fullSQL.trim()) return fullSQL;

      const model = editor.getModel?.();
      const position = editor.getPosition?.();
      if (!model || !position) return fullSQL;

      const offset = model.getOffsetAt?.(position);
      if (typeof offset !== 'number') return fullSQL;

      const statements = splitSQLStatements(fullSQL);
      let searchFrom = 0;
      for (const statement of statements) {
          const start = fullSQL.indexOf(statement, searchFrom);
          if (start < 0) continue;
          const end = start + statement.length;
          searchFrom = end;
          if (offset >= start && offset <= end) {
              return statement;
          }
      }

      return fullSQL;
  };

  const resolveRunnableSQL = (mode: RunMode): string => {
      const fullSQL = getCurrentQuery();
      if (mode === 'all') return fullSQL;
      if (mode === 'current') return resolveCurrentStatementSQL();
      return getSelectedSQL();
  };

  const runMenuItems: MenuProps['items'] = [
      {
          key: 'current',
          label: t('queryEditor.runCurrentStatement'),
          onClick: () => handleRun('current'),
      },
      {
          key: 'selected',
          label: t('queryEditor.runSelected'),
          onClick: () => handleRun('selected'),
      },
  ];

  const buildExplainSQL = (sourceSql: string, dbType: string, driver = ''): { sql: string; error?: string } => {
      const statements = splitSQLStatements(sourceSql);
      if (statements.length === 0) {
          return { sql: '', error: t('queryEditor.explain.noSql') };
      }
      if (statements.length > 1) {
          return { sql: '', error: t('queryEditor.explain.singleOnly') };
      }

      const statement = statements[0].trim().replace(/[;；]\s*$/u, '');
      if (!statement) {
          return { sql: '', error: t('queryEditor.explain.noSql') };
      }

      const dialect = String(resolveSqlDialect(dbType, driver)).toLowerCase();
      if (dialect === 'mongodb' || dialect === 'redis') {
          return { sql: '', error: t('queryEditor.explain.unsupported') };
      }

      const withoutLeadingComments = statement.replace(/^\s*(?:(?:\/\*[\s\S]*?\*\/)\s*|(?:--[^\n]*(?:\n|$))\s*|(?:#[^\n]*(?:\n|$))\s*)+/u, '');
      if (/^explain\b/i.test(withoutLeadingComments)) {
          return { sql: statement };
      }

      if (dialect === 'sqlite') {
          return { sql: `EXPLAIN QUERY PLAN ${statement}` };
      }
      if (dialect === 'oracle' || dialect === 'dameng' || dialect === 'dm') {
          return { sql: `EXPLAIN PLAN FOR ${statement};\nSELECT * FROM TABLE(DBMS_XPLAN.DISPLAY())` };
      }
      if (dialect === 'sqlserver') {
          return { sql: `SET SHOWPLAN_TEXT ON;\n${statement};\nSET SHOWPLAN_TEXT OFF` };
      }
      return { sql: `EXPLAIN ${statement}` };
  };

  // 精准重查询单个结果集（提交事务 / 刷新按钮使用），不会重跑整个编辑器 SQL
  const handleReloadResult = async (resultKey: string, sql: string) => {
      if (!sql?.trim() || !currentDb) return;
      const conn = connections.find(c => c.id === currentConnectionId);
      if (!conn) return;

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      try {
          setLoading(true);
          // 使用 DBQueryMulti 保持和首次查询一致的后端路径
          let queryId: string;
          try {
              queryId = await GenerateQueryID();
          } catch {
              queryId = 'reload-' + Date.now();
          }
          const res = await DBQueryMulti(buildRpcConnectionConfig(config), currentDb, sql, queryId, 'reload', queryExecutionOptions);
          if (!res?.success) {
              message.error(t('queryEditor.reload.failed', { message: res?.message || t('queryEditor.error.unknown') }));
              return;
          }

          // 取第一个结果集（单条 SQL 只有一个结果集）
          const resultSetDataArray = queryResultSetDataArray(res);
          if (resultSetDataArray.length === 0) return;
          const rsData = resultSetDataArray[0];
          if (rsData.status === 'error') {
              const title = statementResultTitle(t, rsData.statementIndex, rsData.startLine, rsData.endLine);
              message.error(t('queryEditor.reload.statementFailed', { title, message: rsData.message || t('queryEditor.sqlExecutionFailed') }));
              return;
          }
          const isAffectedResult = Array.isArray(rsData.rows) && rsData.rows.length === 1
              && rsData.columns && rsData.columns.length === 1
              && rsData.columns[0] === 'affectedRows';
          if (isAffectedResult) return; // 不应该出现，但保险起见

          let rows = Array.isArray(rsData.rows) ? rsData.rows : [];
          const maxRows = Number(queryOptions?.maxRows) || 0;
          let truncated = false;
          if (Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
              truncated = true;
              rows = rows.slice(0, maxRows);
          }
          const cols = (rsData.columns && rsData.columns.length > 0)
              ? rsData.columns
              : (rows.length > 0 ? Object.keys(rows[0]) : []);
          rows.forEach((row, i) => {
              row[JAVANAVI_ROW_KEY] = i;
          });

          // 只更新匹配的结果集；若列集合变化，则重新收紧为只读，避免沿用旧定位列误提交。
          setResultSets(prev => prev.map(rs => {
              if (rs.key !== resultKey) return rs;
              const previousColumnKey = rs.columns.join('\u0001');
              const nextColumnKey = cols.join('\u0001');
              if (previousColumnKey !== nextColumnKey) {
                  const readOnlyLocator = resolveEditRowLocator({ resultColumns: cols, primaryKeys: [], indexes: [], language });
                  return { ...rs, rows, columns: cols, editLocator: readOnlyLocator, pkColumns: [], readOnly: true, pkLoading: false, truncated };
              }
              return { ...rs, rows, columns: cols, truncated };
          }));
      } catch (err: unknown) {
          message.error(t('queryEditor.reload.failed', { message: getErrorMessage(err, t('queryEditor.error.unknown')) }));
      } finally {
          setLoading(false);
      }
  };

  const handleRun = async (request?: RunRequest) => {
    const explicitSQL = typeof request === 'object' && typeof request.sql === 'string' ? request.sql : '';
    const runSource = typeof request === 'object' ? request.source : undefined;
    const mode = request === 'selected' || request === 'current' || request === 'all' ? request : 'all';
    const runSQL = explicitSQL || resolveRunnableSQL(mode);
    if (!runSQL.trim()) return;
    if (!currentDb) {
        message.error(t('queryEditor.selectDatabaseFirst'));
        return;
    }
    // 如果已有查询在运行，先取消它
    if (currentQueryIdRef.current) {
        try {
            await CancelQuery(currentQueryIdRef.current);
        } catch (error) {
            // 忽略取消错误，可能查询已完成
        }
        // 清除旧查询ID
        clearQueryId();
    }
      const runSeq = ++runSeqRef.current;
      setLoading(true);
      setExecutionError('');
      const runStartTime = Date.now();
    const conn = connections.find(c => c.id === currentConnectionId);
    if (!conn) {
        message.error("Connection not found");
        if (runSeqRef.current === runSeq) setLoading(false);
        return;
    }
    const connCaps = getDataSourceCapabilities(conn.config);
    if (!connCaps.supportsQueryEditor) {
        message.error(t('queryEditor.unsupportedDataSource'));
        if (runSeqRef.current === runSeq) setLoading(false);
        return;
    }

    const config = {
        ...conn.config,
        port: Number(conn.config.port),
        password: conn.config.password || "",
        database: conn.config.database || "",
        useSSH: conn.config.useSSH || false,
        ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" },
    };

    try {
        const rawSQL = runSQL;
        const rpcConfig = buildRpcConnectionConfig(config, { queryTimeout: 120 });
        const dbType = String(rpcConfig.type || 'mysql');
        const normalizedDbType = dbType.trim().toLowerCase();
        const normalizedRawSQL = String(rawSQL || '').replace(/；/g, ';');

        // MongoDB 仍走逐条执行的旧路径
        const isMongoDB = normalizedDbType === 'mongodb';

        if (isMongoDB) {
            // MongoDB: 保持逐条执行
            const splitInput = normalizedRawSQL
                .replace(/^\s*\/\/.*$/gm, '')
                .replace(/^\s*#.*$/gm, '');
            const statements = splitSQLStatements(splitInput);
            if (statements.length === 0) {
                message.info(t('queryEditor.noExecutableSql'));
                setResultSets([]);
                setActiveResultKey('');
                return;
            }

            const nextResultSets: ResultSet[] = [];
            const maxRows = Number(queryOptions?.maxRows) || 0;
            const wantsLimitProbe = Number.isFinite(maxRows) && maxRows > 0;
            let anyTruncated = false;

            for (let idx = 0; idx < statements.length; idx++) {
                const rawStatement = statements[idx];
                let executedSql = rawStatement;
                const shellConvert = convertMongoShellToJsonCommand(executedSql);
                if (shellConvert.recognized) {
                    if (shellConvert.error) {
                        const prefix = statements.length > 1 ? t('queryEditor.mongo.statementFailedPrefix', { index: idx + 1 }) : '';
                        setExecutionError(prefix + shellConvert.error);
                        setResultSets([]);
                        setActiveResultKey('');
                        return;
                    }
                    if (shellConvert.command) {
                        executedSql = shellConvert.command;
                    }
                }
                const startTime = Date.now();
                let queryId: string;
                try {
                    queryId = await GenerateQueryID();
                } catch (error) {
                    console.warn('GenerateQueryID failed, using local UUID fallback:', error);
                    queryId = 'query-' + uuidv4();
                }
                setQueryId(queryId);

                const res = await DBQueryWithCancel(rpcConfig, currentDb, executedSql, queryId, runSource || 'query', queryExecutionOptions);
                const duration = Date.now() - startTime;
                addSqlLog({
                    id: `log-${Date.now()}-query-${idx + 1}`,
                    timestamp: Date.now(),
                    sql: executedSql,
                    status: res.success ? 'success' : 'error',
                    duration,
                    message: res.success ? '' : res.message,
                    affectedRows: (res.success && !Array.isArray(res.data)) ? affectedRowsOf(res.data) : (Array.isArray(res.data) ? res.data.length : undefined),
                    dbName: currentDb
                });
                if (!res.success) {
                    const prefix = statements.length > 1 ? t('queryEditor.mongo.statementFailedPrefix', { index: idx + 1 }) : '';
                    setExecutionError(prefix + res.message);
                    setResultSets([]);
                    setActiveResultKey('');
                    return;
                }
                if (Array.isArray(res.data)) {
                    let rows = toQueryRows(res.data);
                    let truncated = false;
                    if (wantsLimitProbe && Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
                        truncated = true;
                        anyTruncated = true;
                        rows = rows.slice(0, maxRows);
                    }
                    const cols = (res.fields && res.fields.length > 0)
                        ? (res.fields as string[])
                        : (rows.length > 0 ? Object.keys(rows[0]) : []);
                    rows.forEach((row, i) => {
                        row[JAVANAVI_ROW_KEY] = i;
                    });
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: rawStatement,
                        exportSql: rawStatement,
                        rows,
                        columns: cols,
                        pkColumns: [],
                        readOnly: true,
                        truncated,
                        source: runSource
                    });
                } else {
                    const affected = affectedRowsOf(res.data);
                    if (affected !== undefined) {
                        nextResultSets.push({
                            key: `result-${idx + 1}`,
                            sql: rawStatement,
                            exportSql: rawStatement,
                            rows: [affectedRowsRow(affected)],
                            columns: ['affectedRows'],
                            pkColumns: [],
                            readOnly: true,
                            source: runSource
                        });
                    }
                }
            }
            setResultSets(nextResultSets);
            setActiveResultKey(nextResultSets[0]?.key || '');
            if (anyTruncated) {
                message.warning(t('queryEditor.result.truncated', { maxRows }));
            }
            if (statements.length > 1) {
                message.success(t('queryEditor.multiStatementExecuted', { statementCount: statements.length, resultSetCount: nextResultSets.length }));
            } else if (nextResultSets.length === 0) {
                message.success(t('queryEditor.executionSucceeded'));
            }

        } else {
            // 非 MongoDB：一次提交 SQL，后端逐条流式返回结果集
            let fullSQL = normalizedRawSQL;
            if (!fullSQL.trim()) {
                message.info(t('queryEditor.noExecutableSql'));
                setResultSets([]);
                setActiveResultKey('');
                return;
            }

            // 自动给 SELECT 语句注入行数限制（防止大结果集卡死）
            const maxRowsForLimit = Number(queryOptions?.maxRows) || 0;
            let anyLimitApplied = false;
            if (Number.isFinite(maxRowsForLimit) && maxRowsForLimit > 0) {
                const stmts = splitSQLStatements(fullSQL);
                const limitedStmts = stmts.map(s => {
                    const result = applyQueryAutoLimit(s, normalizedDbType, maxRowsForLimit, String(rpcConfig.driver || ''));
                    if (result.applied) anyLimitApplied = true;
                    return result.sql;
                });
                fullSQL = limitedStmts.join(';\n');
            }

            const startTime = Date.now();
            let queryId: string;
            try {
                queryId = await GenerateQueryID();
            } catch (error) {
                console.warn('GenerateQueryID failed, using local UUID fallback:', error);
                queryId = 'query-' + uuidv4();
            }
            setQueryId(queryId);

            const maxRows = Number(queryOptions?.maxRows) || 0;
            const forceReadOnlyResult = connCaps.forceReadOnlyQueryResult;
            // 前端也拆分语句用于匹配原始 SQL（展示和表名检测）
            const statements = splitSQLStatements(fullSQL);

            const resolveSimpleResultTableName = (rawStatement: string): string | undefined => {
                if (!rawStatement) return undefined;
                // 支持多行 SQL：SELECT [cols] FROM [schema.]table [WHERE...] [ORDER BY...] [LIMIT...] 等
                // JOIN 查询表名歧义，不提取。Oracle 无主键结果需要 ROWID 时，只在用户已显式选出 ROWID 时启用编辑。
                const hasJoin = /\bJOIN\b/i.test(rawStatement);
                const tableMatch = !hasJoin
                    ? rawStatement.match(/^\s*SELECT\s+.+?\s+FROM\s+(?:[\w`"\[\].]+\.)?[`"\[]?(\w+)[`"\]]?\s*(?:$|[\s;])/im)
                    : null;
                return tableMatch ? tableMatch[1] : undefined;
            };
            const canLoadPrimaryKeysForResult = (tableName: string): boolean => !!tableName && !forceReadOnlyResult && !anyLimitApplied;
            const buildGroupedResult = (input: QueryResultSetData[], allowPrimaryKeys: boolean) => buildQueryResultGroups<RunSource, EditRowLocator>({
                resultSetDataArray: input,
                statements,
                maxRows,
                anyLimitApplied,
                source: runSource,
                rowKeyField: JAVANAVI_ROW_KEY,
                successText: t('queryEditor.status.success'),
                errorText: t('queryEditor.status.error'),
                pendingText: t('queryEditor.status.pendingCommit'),
                rolledBackText: t('queryEditor.status.rolledBack'),
                operationSucceededText: t('queryEditor.executionSucceededBare'),
                operationFailedText: t('queryEditor.executionFailed'),
                resolveReadOnlyLocator: (cols) => resolveEditRowLocator({ resultColumns: cols, primaryKeys: [], indexes: [], dbType: normalizedDbType, language }),
                resolveSimpleTableName: resolveSimpleResultTableName,
                canLoadPrimaryKeys: (tableName) => allowPrimaryKeys && canLoadPrimaryKeysForResult(tableName),
            });
            const publishStreamResultSets = (input: QueryResultSetData[]) => {
                const grouped = buildGroupedResult(input, false);
                const next = grouped.resultGroups.map((group) => ({ ...group, source: group.source as RunSource | undefined })) as ResultSet[];
                setResultSets(next);
                setActiveResultKey(prev => prev || next[0]?.key || '');
            };

            let streamedResultSetDataArray: QueryResultSetData[] = [];
            const res = await DBQueryMultiStream(
                rpcConfig,
                currentDb,
                fullSQL,
                queryId,
                runSource || 'query',
                queryExecutionOptions,
                (event: QueryStreamEvent) => {
                    if (runSeqRef.current !== runSeq) return;
                    if (event.type === 'statementResult' && event.resultSet && isRecord(event.resultSet)) {
                        streamedResultSetDataArray = [...streamedResultSetDataArray, event.resultSet as QueryResultSetData];
                        publishStreamResultSets(streamedResultSetDataArray);
                        return;
                    }
                    if (event.type === 'transactionCommitted') {
                        streamedResultSetDataArray = streamedResultSetDataArray.map(item => (
                            item.status === 'pending'
                                ? { ...item, status: 'success', message: event.message || t('queryEditor.executionSucceededBare') }
                                : item
                        ));
                        publishStreamResultSets(streamedResultSetDataArray);
                        return;
                    }
                    if (event.type === 'transactionRolledBack') {
                        streamedResultSetDataArray = streamedResultSetDataArray.map(item => (
                            item.status === 'pending' || item.status === 'success'
                                ? { ...item, status: 'rolledBack', message: event.message || t('queryEditor.status.rolledBack'), transactionRolledBack: true }
                                : item
                        ));
                        publishStreamResultSets(streamedResultSetDataArray);
                    }
                },
            );
            const duration = Date.now() - startTime;

            const resultSetDataArray = streamedResultSetDataArray.length > 0 ? streamedResultSetDataArray : queryResultSetDataArray(res);
            if (!res.success && resultSetDataArray.length === 0) {
                addSqlLog({
                    id: `log-${Date.now()}-query-multi`,
                    timestamp: Date.now(),
                    sql: fullSQL,
                    status: 'error',
                    duration,
                    message: res.message,
                    dbName: currentDb
                });
                const errorMsg = res.message.toLowerCase();
                const isCancelledError = errorMsg.includes('context canceled') ||
                                         errorMsg.includes('查询已取消') ||
                                         errorMsg.includes(t('queryEditor.cancel.success').toLowerCase()) ||
                                         errorMsg.includes('canceled') ||
                                         errorMsg.includes('cancelled') ||
                                         errorMsg.includes('statement canceled') ||
                                         errorMsg.includes('sql: statement canceled');
                const isTimeoutError = errorMsg.includes('context deadline exceeded') ||
                                       errorMsg.includes('timeout') ||
                                       errorMsg.includes('超时') ||
                                       errorMsg.includes('deadline exceeded');

                if (isCancelledError && !isTimeoutError) {
                    setResultSets([]);
                    setActiveResultKey('');
                    if (currentQueryIdRef.current) {
                        clearQueryId();
                    }
                    return;
                }

                setExecutionError(res.message);
                setResultSets([]);
                setActiveResultKey('');
                return;
            }

            const backendFailedResult = resultSetDataArray.find(item => item.status === 'error');
            const failureLogMessage = backendFailedResult
                ? t(backendFailedResult.transactionRolledBack ? 'queryEditor.statement.failedWithRollback' : 'queryEditor.statement.failedWithMessage', {
                    title: statementResultTitle(t, backendFailedResult.statementIndex, backendFailedResult.startLine, backendFailedResult.endLine),
                    message: backendFailedResult.message || t('queryEditor.sqlExecutionFailed')
                })
                : '';
            addSqlLog({
                id: `log-${Date.now()}-query-multi`,
                timestamp: Date.now(),
                sql: fullSQL,
                status: backendFailedResult || !res.success ? 'error' : 'success',
                duration,
                message: failureLogMessage || (!res.success ? res.message : ''),
                dbName: currentDb
            });
            const pendingPk: Array<{ resultKey: string; tableName: string }> = [];
            const groupedResult = buildGroupedResult(resultSetDataArray, true);
            const nextResultSets = groupedResult.resultGroups.map((group) => ({ ...group, source: group.source as RunSource | undefined })) as ResultSet[];
            let anyTruncated = groupedResult.anyTruncated;
            pendingPk.push(...groupedResult.pendingPk);

            setResultSets(nextResultSets);
            setActiveResultKey(nextResultSets[0]?.key || '');

            pendingPk.forEach(({ resultKey, tableName }) => {
                Promise.all([
                    DBGetColumns(rpcConfig, currentDb, tableName),
                    DBGetIndexes(rpcConfig, currentDb, tableName).catch(() => ({ success: false, message: t('queryEditor.indexLoadFailed'), data: [] } as QueryResult)),
                ])
                    .then(([resCols, resIndexes]: [QueryResult, QueryResult]) => {
                        if (runSeqRef.current !== runSeq) return;
                        if (!resCols?.success || !Array.isArray(resCols.data)) {
                            const readOnlyLocator = resolveEditRowLocator({
                                dbType: normalizedDbType,
                                language,
                                resultColumns: [],
                                primaryKeys: [],
                                indexes: [],
                            });
                            setResultSets(prev => prev.map(rs => rs.key === resultKey ? { ...rs, editLocator: readOnlyLocator, pkLoading: false, readOnly: true } : rs));
                            return;
                        }
                        const primaryKeys = (resCols.data as ColumnDefinition[]).filter(c => c.key === 'PRI').map(c => c.name);
                        const indexes = resIndexes?.success && Array.isArray(resIndexes.data) ? (resIndexes.data as IndexDefinition[]) : [];
                        setResultSets(prev => prev.map(rs => {
                            if (rs.key !== resultKey) return rs;
                            const locator = resolveEditRowLocator({
                                dbType: normalizedDbType,
                                language,
                                resultColumns: rs.columns,
                                primaryKeys,
                                indexes,
                            });
                            return { ...rs, pkColumns: primaryKeys, editLocator: locator, pkLoading: false, readOnly: locator.readOnly };
                        }));
                    })
                    .catch(() => {
                        if (runSeqRef.current !== runSeq) return;
                        const readOnlyLocator = resolveEditRowLocator({
                            dbType: normalizedDbType,
                            language,
                            resultColumns: [],
                            primaryKeys: [],
                            indexes: [],
                        });
                        setResultSets(prev => prev.map(rs => rs.key === resultKey ? { ...rs, editLocator: readOnlyLocator, pkLoading: false, readOnly: true } : rs));
                    });
            });

            if (anyTruncated) {
                message.warning(t('queryEditor.result.truncated', { maxRows }));
            }
            const failedStatement = nextResultSets.find(rs => rs.status === 'error');
            // 后端附带的提示信息（如数据源不支持原生多语句执行的回退提示）
            if (res.message && !failedStatement) {
                message.info(res.message);
            }
            if (failedStatement) {
                const title = statementResultTitle(t, failedStatement.statementIndex, failedStatement.startLine, failedStatement.endLine);
                setActiveResultKey(failedStatement.key);
                setExecutionError(t(failedStatement.transactionRolledBack ? 'queryEditor.statement.failedWithRollback' : 'queryEditor.statement.failedWithMessage', { title, message: failedStatement.message || t('queryEditor.sqlExecutionFailed') }));
                message.error(t('queryEditor.statement.failed', { title }));
            } else if (resultSetDataArray.length > 1) {
                message.success(t('queryEditor.multiStatementCompleted', { resultSetCount: nextResultSets.length }));
            } else if (nextResultSets.length === 0) {
                message.success(t('queryEditor.executionSucceeded'));
            }

        }
    } catch (e: unknown) {
        const errorMessage = getErrorMessage(e);
        message.error(t('queryEditor.sqlExecutionFailed') + ': ' + errorMessage);
        addSqlLog({
            id: `log-${Date.now()}-error`,
            timestamp: Date.now(),
            sql: runSQL || query,
            status: 'error',
            duration: Date.now() - runStartTime,
            message: errorMessage,
            dbName: currentDb
        });
        setResultSets([]);
        setActiveResultKey('');
    } finally {
        if (runSeqRef.current === runSeq) setLoading(false);
        // Clear query ID after execution completes
        clearQueryId();
    }
  };

  const handleExplainPlan = async () => {
    const selectedSQL = getSelectedSQL();
    const sourceSQL = selectedSQL || resolveCurrentStatementSQL();
    if (!sourceSQL.trim()) return;
    if (!currentDb) {
        message.error(t('queryEditor.selectDatabaseFirst'));
        return;
    }
    const conn = connections.find(c => c.id === currentConnectionId);
    if (!conn) {
        message.error("Connection not found");
        return;
    }
    const rpcConfig = buildRpcConnectionConfig({
        ...conn.config,
        port: Number(conn.config.port),
        password: conn.config.password || "",
        database: conn.config.database || "",
        useSSH: conn.config.useSSH || false,
        ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" },
    });
    const plan = buildExplainSQL(sourceSQL, String(rpcConfig.type || conn.config.type || 'mysql'), String(rpcConfig.driver || conn.config.driver || ''));
    if (plan.error) {
        message.warning(plan.error);
        return;
    }
    await handleRun({ sql: plan.sql, source: 'executionPlan' });
  };

  const handleCancel = async () => {
    if (!currentQueryIdRef.current) {
      message.warning(t('queryEditor.cancel.noRunningQuery'));
      return;
    }
    const queryIdToCancel = currentQueryIdRef.current;
    try {
      const res = await CancelQuery(queryIdToCancel);
      if (res.success) {
        message.success(t('queryEditor.cancel.success'));
        // Clear query ID after successful cancellation
        if (currentQueryIdRef.current === queryIdToCancel) {
          clearQueryId()
        }
      } else {
        message.warning(res.message);
      }
    } catch (error: unknown) {
      message.error(t('queryEditor.cancel.failed', { message: getErrorMessage(error, t('queryEditor.error.unknown')) }));
    }
  };

  useEffect(() => {
      const handleSelectAllInEditor = (event: KeyboardEvent) => {
          if (activeTabId !== tab.id) {
              return;
          }
          if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'a') {
              return;
          }

          const editor = editorRef.current;
          if (!editor) {
              return;
          }

          const targetNode = event.target instanceof Node ? event.target : null;
          const editorHasFocus = !!editor.hasTextFocus?.();
          const inEditorPane = !!(targetNode && editorPaneRef.current?.contains(targetNode));
          const inQueryEditor = !!(targetNode && queryEditorRootRef.current?.contains(targetNode));
          if (!editorHasFocus && !inEditorPane) {
              return;
          }
          if (!editorHasFocus && isEditableElement(event.target) && !inEditorPane) {
              return;
          }
          if (!editorHasFocus && !inQueryEditor) {
              return;
          }

          event.preventDefault();
          event.stopPropagation();
          editor.focus?.();
          editor.trigger('keyboard', 'editor.action.selectAll', null);
      };

      window.addEventListener('keydown', handleSelectAllInEditor, true);
      return () => {
          window.removeEventListener('keydown', handleSelectAllInEditor, true);
      };
  }, [activeTabId, tab.id]);

  useEffect(() => {
      const binding = shortcutOptions.runQuery;
      if (!binding?.enabled || !binding.combo) {
          return;
      }

      const handleRunShortcut = (event: KeyboardEvent) => {
          if (activeTabId !== tab.id) {
              return;
          }
          if (!isShortcutMatch(event, binding.combo)) {
              return;
          }
          const editorHasFocus = !!editorRef.current?.hasTextFocus?.();
          if (!editorHasFocus && !isEditableElement(event.target)) {
              return;
          }
          event.preventDefault();
          event.stopPropagation();
          void handleRun('all');
      };

      window.addEventListener('keydown', handleRunShortcut);
      return () => {
          window.removeEventListener('keydown', handleRunShortcut);
      };
  }, [activeTabId, tab.id, shortcutOptions.runQuery, handleRun]);

  useEffect(() => {
      const handleRunActiveQuery = () => {
          if (activeTabId !== tab.id) {
              return;
          }
          void handleRun('all');
      };

      window.addEventListener('javanavi:run-active-query', handleRunActiveQuery as EventListener);
      return () => {
          window.removeEventListener('javanavi:run-active-query', handleRunActiveQuery as EventListener);
      };
  }, [activeTabId, tab.id, handleRun]);

  // 监听由 TabManager 分发的专用注入事件
  useEffect(() => {
      const handleInsertSql = (e: Event) => {
          const detail = (e as InsertSqlEvent).detail || {};
          if (detail.tabId !== tab.id || !detail.sql) return;
          const { sql: sqlText, connectionId, dbName } = detail;

          // 同步更新 ref，防止异步 fetchDbs 竞态覆盖正确的 dbName
          if (connectionId && connectionId !== currentConnectionId) {
              if (dbName) {
                  currentDbRef.current = dbName;
                  setCurrentDb(dbName);
              }
              setCurrentConnectionId(connectionId);
          } else if (dbName && dbName !== currentDb) {
              currentDbRef.current = dbName;
              setCurrentDb(dbName);
          }


          const editor = editorRef.current;
          const monaco = monacoRef.current;
          if (editor && monaco) {
              const model = editor.getModel();
              const existingContent = editor.getValue?.() || '';

              // runImmediately 模式下，如果编辑器内容已是待注入的 SQL（TabManager 创建时已传入），
              // 跳过追加，直接选中全部内容并执行
              if (detail.runImmediately && existingContent.trim() === sqlText.trim()) {
                  if (model) {
                      const lineCount = model.getLineCount();
                      const maxCol = model.getLineMaxColumn(lineCount);
                      editor.setSelection(new monaco.Range(1, 1, lineCount, maxCol));
                      editor.focus();
                      setTimeout(() => handleRun('all'), 500);
                  }
              } else {
              let position = editor.getPosition();
              if (!position && model) {
                  const lineCount = model.getLineCount();
                  const maxCol = model.getLineMaxColumn(lineCount);
                  position = new monaco.Position(lineCount, maxCol);
              }

              if (position) {
                  const mText = (sqlText.endsWith('\n') ? sqlText : sqlText + '\n');
                  const startRange = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column);

                  editor.executeEdits('ai-insert', [{
                      range: startRange,
                      text: (position.column > 1 ? '\n' : '') + mText,
                      forceMoveMarkers: true
                  }]);

                  // 定位并滚动到可见区域
                  const targetLine = position.lineNumber + (position.column > 1 ? 1 : 0);
                  editor.revealLineInCenterIfOutsideViewport(targetLine);
                  editor.setPosition({ lineNumber: targetLine + mText.split('\n').length - 1, column: 1 });
                  editor.focus();

                  if (!detail.runImmediately) {
                      message.success(t('queryEditor.insert.success'));
                  }

                  if (detail.runImmediately) {
                      const endPosition = editor.getPosition();
                      if (!endPosition) return;
                      editor.setSelection(new monaco.Range(
                          targetLine, 1,
                          endPosition.lineNumber, endPosition.column
                      ));
                      // 🔧 延迟 500ms 等待连接/数据库切换的 setState 生效后再执行
                      setTimeout(() => handleRun('all'), 500);
                  }
              }
              }
          } else {
              setQuery((prev: string) => prev ? prev + '\n' + sqlText : sqlText);
              message.success(t('queryEditor.append.success'));
          }
      };
      window.addEventListener('javanavi:insert-sql-to-tab', handleInsertSql as EventListener);
      return () => window.removeEventListener('javanavi:insert-sql-to-tab', handleInsertSql as EventListener);
  }, [tab.id, handleRun]);

  const resolveDefaultQueryName = () => {
      const rawTitle = String(tab.title || '').trim();
      if (!rawTitle || rawTitle.startsWith(t('generic.fallback.newQuery')) || rawTitle.startsWith('新建查询')) {
          return t('queryEditor.untitledQuery');
      }
      return rawTitle;
  };

  const persistQuery = (payload: { id: string; name: string; createdAt?: number }) => {
      const sql = getCurrentQuery();
      const saved = {
          id: payload.id,
          name: payload.name,
          sql,
          connectionId: currentConnectionId,
          dbName: currentDb || tab.dbName || '',
          createdAt: payload.createdAt ?? Date.now(),
      };
      saveQuery(saved);
      addTab({
          ...tab,
          title: payload.name,
          query: sql,
          connectionId: currentConnectionId,
          dbName: currentDb || tab.dbName || '',
          savedQueryId: payload.id,
      });
      return saved;
  };

  const handleQuickSave = async () => {
      const filePath = String(tab.filePath || '').trim();
      if (filePath) {
          const sql = getCurrentQuery();
          try {
              const res = await WriteSQLFile(filePath, sql);
              if (!res.success) {
                  message.error(t('queryEditor.saveSqlFile.failed', { message: res.message || t('queryEditor.error.unknown') }));
                  return;
              }
              addTab({
                  ...tab,
                  query: sql,
                  connectionId: currentConnectionId,
                  dbName: currentDb || tab.dbName || '',
                  filePath,
                  savedQueryId: undefined,
              });
              message.success(t('queryEditor.saveSqlFile.success'));
          } catch (error) {
              message.error(t('queryEditor.saveSqlFile.failed', { message: getErrorMessage(error, t('queryEditor.error.unknown')) }));
          }
          return;
      }

      const existed = currentSavedQuery || null;
      const fallbackSavedId = String(tab.savedQueryId || '').trim();
      const saveId = existed?.id || fallbackSavedId || '';
      if (!saveId) {
          saveForm.setFieldsValue({ name: resolveDefaultQueryName() });
          setIsSaveModalOpen(true);
          return;
      }
      const saveName = existed?.name || resolveDefaultQueryName();
      persistQuery({ id: saveId, name: saveName, createdAt: existed?.createdAt });
      message.success(t('queryEditor.saveQuery.success'));
  };

  const handleSave = async () => {
      try {
          const values = await saveForm.validateFields();
          const existed = currentSavedQuery || null;
          const fallbackSavedId = String(tab.savedQueryId || '').trim();
          const nextSavedId = existed?.id || fallbackSavedId || `saved-${Date.now()}`;
          persistQuery({
              id: nextSavedId,
              name: String(values.name || '').trim() || t('queryEditor.untitledQuery'),
              createdAt: existed?.createdAt,
          });
          message.success(t('queryEditor.saveQuery.success'));
          setIsSaveModalOpen(false);
      } catch (e) {
      }
  };

  useEffect(() => {
      const binding = shortcutOptions.saveQuery;
      if (!binding?.enabled || !binding.combo) {
          return;
      }

      const handleSaveShortcut = (event: KeyboardEvent) => {
          if (activeTabId !== tab.id) {
              return;
          }
          if (!isQuerySaveShortcutMatch(event, binding.combo)) {
              return;
          }

          const editor = editorRef.current;
          const targetNode = event.target instanceof Node ? event.target : null;
          const editorHasFocus = !!editor?.hasTextFocus?.();
          const inEditorPane = !!(targetNode && editorPaneRef.current?.contains(targetNode));
          const inQueryEditor = !!(targetNode && queryEditorRootRef.current?.contains(targetNode));

          if (!editorHasFocus && !inEditorPane) {
              return;
          }
          if (!editorHasFocus && isEditableElement(event.target) && !inEditorPane) {
              return;
          }
          if (!editorHasFocus && !inQueryEditor) {
              return;
          }

          event.preventDefault();
          event.stopPropagation();
          void handleQuickSave();
      };

      window.addEventListener('keydown', handleSaveShortcut, true);
      return () => {
          window.removeEventListener('keydown', handleSaveShortcut, true);
      };
  }, [activeTabId, tab.id, shortcutOptions.saveQuery, handleQuickSave]);

  const handleCloseResult = (key: string) => {
      setResultSets(prev => {
          const idx = prev.findIndex(r => r.key === key);
          if (idx < 0) return prev;
          const next = prev.filter(r => r.key !== key);

          setActiveResultKey(prevActive => {
              if (prevActive && prevActive !== key) return prevActive;
              return next[idx]?.key || next[idx - 1]?.key || next[0]?.key || '';
          });

          return next;
      });
  };


  const renderExecutionSummaryTable = (rs: ResultSet) => {
      const rows = rs.rows as ExecutionSummaryRow[];
      const columns: ColumnsType<ExecutionSummaryRow> = [
          {
              title: t('queryEditor.executionSummary.lineRange'),
              dataIndex: 'editorLineRange',
              key: 'editorLineRange',
              width: 140,
          },
          {
              title: t('queryEditor.executionSummary.sqlType'),
              dataIndex: 'sqlType',
              key: 'sqlType',
              width: 110,
          },
          {
              title: t('queryEditor.executionSummary.sqlContent'),
              dataIndex: 'sqlSummary',
              key: 'sqlSummary',
              ellipsis: true,
              render: (_value, row) => (
                  <Tooltip
                      title={<pre style={{ maxWidth: 720, maxHeight: 360, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>{row.sql}</pre>}
                  >
                      <span style={{ display: 'block', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' }}>
                          {row.sqlSummary || row.sql}
                      </span>
                  </Tooltip>
              ),
          },
          {
              title: t('queryEditor.executionSummary.result'),
              dataIndex: 'statusText',
              key: 'statusText',
              width: 140,
              render: (_value, row) => {
                  const ok = row.status !== 'error';
                  return (
                      <Tooltip title={row.message || row.statusText}>
                          <span style={{ color: ok ? '#389e0d' : '#cf1322', fontWeight: 500 }}>{row.statusText}</span>
                      </Tooltip>
                  );
              },
          },
          {
              title: t('queryEditor.executionSummary.affectedRows'),
              dataIndex: 'affectedRows',
              key: 'affectedRows',
              width: 120,
              align: 'right',
              render: (value) => Number.isFinite(Number(value)) ? Number(value) : '-',
          },
      ];
      return (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
              <Table<ExecutionSummaryRow>
                  size="small"
                  rowKey={(row) => String(row[JAVANAVI_ROW_KEY] ?? row.statementIndex)}
                  columns={columns}
                  dataSource={rows}
                  pagination={false}
                  scroll={{ x: 900 }}
              />
          </div>
      );
  };

  return (
    <div ref={queryEditorRootRef} style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        .query-result-tabs {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .query-result-tabs .ant-tabs-nav {
          flex: 0 0 auto;
        }
        .query-result-tabs .ant-tabs-content-holder {
          flex: 1 1 auto;
          overflow: hidden;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .query-result-tabs .ant-tabs-content {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .query-result-tabs .ant-tabs-tabpane {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .query-result-tabs .ant-tabs-tabpane > div {
          flex: 1 1 auto;
          min-height: 0;
        }
        .query-result-tabs .ant-tabs-tabpane-hidden {
          display: none !important;
        }
        .query-result-tabs .ant-tabs-ink-bar {
          transition: none !important;
        }
      `}</style>
      <div ref={editorPaneRef}>
      <div style={{ padding: '8px', display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
        <Select
            style={{ width: 150 }}
            placeholder={t('queryEditor.selectConnection.placeholder')}
            value={currentConnectionId}
            onChange={(val) => {
                setCurrentConnectionId(val);
                setCurrentDb('');
            }}
            options={queryCapableConnections.map(c => ({ label: c.name, value: c.id }))}
            showSearch
        />
        <Select
            style={{ width: 200 }}
            placeholder={t('queryEditor.selectDatabase.placeholder')}
            value={currentDb}
            onChange={setCurrentDb}
            options={dbList.map(db => ({ label: db, value: db }))}
            showSearch
        />
        <Tooltip title={t('queryEditor.maxRows.tooltip')}>
            <Select
                style={{ width: 170 }}
                value={queryOptions?.maxRows ?? 5000}
                onChange={(val) => setQueryOptions({ maxRows: Number(val) })}
                options={[
                    { label: t('queryEditor.maxRows.option', { count: 500 }), value: 500 },
                    { label: t('queryEditor.maxRows.option', { count: 1000 }), value: 1000 },
                    { label: t('queryEditor.maxRows.option', { count: 5000 }), value: 5000 },
                    { label: t('queryEditor.maxRows.option', { count: 20000 }), value: 20000 },
                    { label: t('queryEditor.maxRows.unlimited'), value: 0 },
                ]}
            />
        </Tooltip>
        <Tooltip title={t('queryEditor.autoCommit.tooltip')}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                <span style={{ color: darkMode ? '#e5e7eb' : '#334155' }}>{t('queryEditor.autoCommit.label')}</span>
                <Switch
                    size="small"
                    checked={queryOptions?.autoCommit ?? true}
                    checkedChildren={t('queryEditor.autoCommit.on')}
                    unCheckedChildren={t('queryEditor.autoCommit.off')}
                    onChange={(checked) => setQueryOptions({ autoCommit: checked })}
                />
            </div>
        </Tooltip>
        <Button.Group>
          <Tooltip
              title={
                  shortcutOptions.runQuery?.enabled && shortcutOptions.runQuery?.combo
                      ? t('queryEditor.runAllWithShortcut', { shortcut: getShortcutDisplay(shortcutOptions.runQuery.combo) })
                      : t('queryEditor.runAll')
              }
          >
              <Dropdown.Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handleRun('all')}
                  loading={loading}
                  disabled={loading}
                  menu={{ items: runMenuItems }}
              >
                {t('queryEditor.run')}
              </Dropdown.Button>
          </Tooltip>
          {loading && (
            <Button type="primary" danger icon={<StopOutlined />} onClick={handleCancel}>
              {t('queryEditor.stop')}
            </Button>
          )}
        </Button.Group>
        <Button onClick={handleExplainPlan} disabled={loading}>
          {t('queryEditor.executionPlan')}
        </Button>
        <Tooltip
            title={
                shortcutOptions.saveQuery?.enabled && shortcutOptions.saveQuery?.combo
                    ? t('queryEditor.saveWithShortcut', { shortcut: getShortcutDisplay(shortcutOptions.saveQuery.combo) })
                    : t('queryEditor.save')
            }
        >
            <Button icon={<SaveOutlined />} onClick={handleQuickSave}>
              {t('queryEditor.save')}
            </Button>
        </Tooltip>

        <Button.Group>
            <Tooltip title={t('queryEditor.format.tooltip')}>
                <Button icon={<FormatPainterOutlined />} onClick={handleFormat}>{t('queryEditor.format.action')}</Button>
            </Tooltip>
            <Dropdown menu={{ items: formatSettingsMenu }} placement="bottomRight">
                <Button icon={<SettingOutlined />} />
            </Dropdown>
        </Button.Group>

        <Dropdown menu={{ items: [
            { key: 'ai-generate', label: t('queryEditor.ai.generate.menu'), icon: <RobotOutlined />, onClick: () => handleAIAction('generate') },
            { key: 'ai-explain', label: t('queryEditor.ai.explain.menu'), icon: <RobotOutlined />, onClick: () => handleAIAction('explain') },
            { key: 'ai-optimize', label: t('queryEditor.ai.optimize.menu'), icon: <RobotOutlined />, onClick: () => handleAIAction('optimize') },
            { type: 'divider' as const },
            { key: 'ai-schema', label: t('queryEditor.ai.schema.menu'), icon: <RobotOutlined />, onClick: () => handleAIAction('schema') },
        ] }} placement="bottomRight">
            <Button icon={<RobotOutlined />} style={{ color: '#818cf8' }}>AI</Button>
        </Dropdown>
      </div>

      <div style={{ height: editorHeight, minHeight: '100px' }}>
        <Editor
          height="100%"
          defaultLanguage="sql"
          theme={darkMode ? "transparent-dark" : "transparent-light"}
          defaultValue={query}
          onChange={(val) => setQuery(val || '')}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            automaticLayout: true,
            scrollBeyondLastLine: false,
            fontSize: 14
          }}
        />
      </div>

      <div
        onMouseDown={handleMouseDown}
        style={{
            height: '5px',
            cursor: 'row-resize',
            background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
            flexShrink: 0,
            zIndex: 10
        }}
        title={t('queryEditor.resizeHandle.title')}
      />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 0, display: 'flex', flexDirection: 'column' }}>
        {resultSets.length > 0 ? (
          <Tabs
              className="query-result-tabs"
              activeKey={activeResultKey || resultSets[0]?.key}
              onChange={setActiveResultKey}
              animated={false}
              style={{ flex: 1, minHeight: 0 }}
              items={resultSets.map((rs, idx) => ({
                  key: rs.key,
                  label: (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Tooltip title={rs.sql}>
                          <span>{t('queryEditor.result.index', { index: idx + 1 })}</span>
                          </Tooltip>
                          <Tooltip title={t('queryEditor.closeResult.tooltip')}>
                              <span
                                  onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleCloseResult(rs.key);
                                  }}
                                  style={{ display: 'inline-flex', alignItems: 'center', color: '#999', cursor: 'pointer' }}
                              >
                                  <CloseOutlined style={{ fontSize: 12 }} />
                              </span>
                          </Tooltip>
                      </div>
                  ),
                  children: (() => {
                      if (rs.kind === 'executionSummary') {
                          return renderExecutionSummaryTable(rs);
                      }
                      // affectedRows 类型结果集（UPDATE/INSERT/DELETE）：简洁提示
                      const isAffectedResult = rs.columns.length === 1 && rs.columns[0] === 'affectedRows';
                      const isStatementSummaryResult = rs.statementSummary === true;
                      if (isAffectedResult) {
                          const affected = Number(rs.rows[0]?.affectedRows ?? 0);
                          const affectedStatus = rs.status || 'success';
                          const affectedOk = affectedStatus !== 'error' && affectedStatus !== 'rolledBack';
                          const title = statementResultTitle(t, rs.statementIndex, rs.startLine, rs.endLine);
                          const statusText = affectedStatus === 'pending'
                              ? t('queryEditor.statement.pendingWithMessage', { title, message: rs.message || t('queryEditor.status.pendingCommit') })
                              : (affectedStatus === 'rolledBack'
                                  ? t('queryEditor.statement.rolledBackWithMessage', { title, message: rs.message || t('queryEditor.status.rolledBack') })
                                  : t('queryEditor.statement.succeeded', { title }));
                          return (
                              <div style={{
                                  flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexDirection: 'column', gap: 8, color: '#666', userSelect: 'text',
                              }}>
                                  <span style={{ fontSize: 36, color: affectedOk ? '#52c41a' : '#cf1322' }}>{affectedOk ? '✓' : '×'}</span>
                                  <span style={{ fontSize: 14, fontWeight: 500 }}>{statusText}</span>
                                  <span style={{ fontSize: 13, color: '#999' }}>{t('queryEditor.affectedRows', { affectedRows: affected })}</span>
                              </div>
                          );
                      }
                      if (isStatementSummaryResult) {
                          const ok = rs.status !== 'error' && rs.status !== 'rolledBack';
                          const title = statementResultTitle(t, rs.statementIndex, rs.startLine, rs.endLine);
                          const summaryText = rs.status === 'pending'
                              ? t('queryEditor.statement.pendingWithMessage', { title, message: rs.message || t('queryEditor.status.pendingCommit') })
                              : (rs.status === 'rolledBack'
                                  ? t('queryEditor.statement.rolledBackWithMessage', { title, message: rs.message || t('queryEditor.status.rolledBack') })
                                  : (ok
                                      ? t('queryEditor.statement.succeededWithMessage', { title, message: rs.message || t('queryEditor.executionSucceededBare') })
                                      : t(rs.transactionRolledBack ? 'queryEditor.statement.failedWithRollback' : 'queryEditor.statement.failedWithMessage', { title, message: rs.message || t('queryEditor.executionFailed') })));
                          return (
                              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                  <div style={{ padding: '10px 12px', color: ok ? '#389e0d' : '#cf1322', background: ok ? '#f6ffed' : '#fff2f0', borderBottom: `1px solid ${ok ? '#b7eb8f' : '#ffccc7'}` }}>
                                      {summaryText}
                                  </div>
                                  <DataGrid
                                      data={rs.rows}
                                      columnNames={rs.columns}
                                      loading={false}
                                      exportScope="queryResult"
                                      resultSql={rs.exportSql || rs.sql}
                                      dbName={currentDb}
                                      connectionId={currentConnectionId}
                                      pkColumns={[]}
                                      editLocator={{ strategy: 'none', columns: [], valueColumns: [], readOnly: true, reason: 'statement-summary' }}
                                      readOnly={true}
                                  />
                              </div>
                          );
                      }
                      const isExecutionPlanResult = rs.source === 'executionPlan' || isExecutionPlanSql(rs.sql);
                      const grid = (
                          <DataGrid
                              data={rs.rows}
                              columnNames={rs.columns}
                              loading={false}
                              tableName={rs.tableName}
                              exportScope="queryResult"
                              resultSql={rs.exportSql || rs.sql}
                              dbName={currentDb}
                              connectionId={currentConnectionId}
                              pkColumns={rs.pkColumns}
                              editLocator={rs.editLocator}
                              onReload={isExecutionPlanResult ? undefined : () => handleReloadResult(rs.key, rs.sql)}
                              readOnly={rs.readOnly}
                          />
                      );
                      if (isExecutionPlanResult) {
                          return (
                              <ExecutionPlanResultView rows={rs.rows} columns={rs.columns} sql={rs.sql} darkMode={darkMode}>
                                  {grid}
                              </ExecutionPlanResultView>
                          );
                      }
                      const resultOk = rs.status !== 'error' && rs.status !== 'rolledBack';
                      const title = statementResultTitle(t, rs.statementIndex, rs.startLine, rs.endLine);
                      const resultMessage = rs.status === 'pending'
                          ? t('queryEditor.statement.pendingWithMessage', { title, message: rs.message || t('queryEditor.status.pendingCommit') })
                          : (rs.status === 'rolledBack'
                              ? t('queryEditor.statement.rolledBackWithMessage', { title, message: rs.message || t('queryEditor.status.rolledBack') })
                              : t('queryEditor.statement.succeededWithMessage', { title, message: rs.message || t('queryEditor.executionSucceededBare') }));
                      return (
                          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                              <div style={{ padding: '10px 12px', color: resultOk ? '#389e0d' : '#cf1322', background: resultOk ? '#f6ffed' : '#fff2f0', borderBottom: `1px solid ${resultOk ? '#b7eb8f' : '#ffccc7'}` }}>
                                  {resultMessage}
                              </div>
                              {grid}
                          </div>
                      );
                  })()
              }))}
          />
        ) : executionError ? (
          <div style={{ flex: 1, minHeight: 0, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, background: darkMode ? '#1e1e1e' : '#fafafa', overflow: 'auto' }}>
              <div style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloseOutlined />
                  <span>{t('queryEditor.error.title')}</span>
              </div>
              <div className="custom-scrollbar" style={{ padding: 16, background: darkMode ? '#2d1a1a' : '#fff2f0', border: `1px solid ${darkMode ? '#5c2020' : '#ffccc7'}`, borderRadius: 6, color: darkMode ? '#ffa39e' : '#cf1322', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '40vh', overflow: 'auto' }}>
                  {executionError}
              </div>
              <div style={{ marginTop: 8 }}>
                  <Button
                      type="primary"
                      icon={<RobotOutlined />}
                      style={{ background: '#818cf8', borderColor: '#818cf8', boxShadow: '0 2px 0 rgba(129, 140, 248, 0.2)' }}
                      onClick={() => {
                          const errSql = getCurrentQuery();
                          const prompt = t('queryEditor.ai.diagnose.prompt', { sql: errSql, error: executionError });
                          const store = useStore.getState();
                          const wasClosed = !store.aiPanelVisible;
                          if (wasClosed) store.setAIPanelVisible(true);
                          setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('javanavi:ai:inject-prompt', { detail: { prompt } }));
                          }, wasClosed ? 350 : 0);
                      }}
                  >
                      {t('queryEditor.ai.diagnose.action')}
                  </Button>
              </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }} />
        )}
      </div>

      <Modal
        title={t('queryEditor.saveModal.title')}
        open={isSaveModalOpen}
        onOk={handleSave}
        onCancel={() => setIsSaveModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
          <Form form={saveForm} layout="vertical">
              <Form.Item name="name" label={t('queryEditor.saveModal.nameLabel')} rules={[{ required: true, message: t('queryEditor.saveModal.nameRequired') }]}>
                  <Input placeholder={t('queryEditor.saveModal.namePlaceholder')} />
              </Form.Item>
          </Form>
      </Modal>
    </div>
  );
};

export default QueryEditor;
