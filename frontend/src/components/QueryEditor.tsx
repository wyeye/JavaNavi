import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Button, message, Modal, Input, Form, Dropdown, MenuProps, Tooltip, Select, Tabs } from 'antd';
import { PlayCircleOutlined, SaveOutlined, FormatPainterOutlined, SettingOutlined, CloseOutlined, StopOutlined, RobotOutlined } from '@ant-design/icons';
import { format } from 'sql-formatter';
import { v4 as uuidv4 } from 'uuid';
import { TabData, ColumnDefinition, IndexDefinition } from '../types';
import { useStore } from '../store';
import { DBQueryWithCancel, DBQueryMulti, DBGetTables, DBGetAllColumns, DBGetDatabases, DBGetColumns, DBGetIndexes, CancelQuery, GenerateQueryID, WriteSQLFile } from '@compat/javanaviApp';
import DataGrid, { JAVANAVI_ROW_KEY } from './DataGrid';
import { applyQueryAutoLimit } from '../utils/queryAutoLimit';
import { resolveEditRowLocator, type EditRowLocator } from '../utils/rowLocator';
import { getDataSourceCapabilities } from '../utils/dataSourceCapabilities';
import { convertMongoShellToJsonCommand } from '../utils/mongodb';
import { getShortcutDisplay, isEditableElement, isQuerySaveShortcutMatch, isShortcutMatch } from '../utils/shortcuts';
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { resolveSqlDialect, resolveSqlFunctions, resolveSqlKeywords } from '../utils/sqlDialect';

const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'LIMIT', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'LEFT', 'RIGHT',
    'INNER', 'OUTER', 'ON', 'GROUP BY', 'ORDER BY', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS',
    'IN', 'VALUES', 'SET', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'MODIFY', 'CHANGE',
    'COLUMN', 'KEY', 'PRIMARY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'AUTO_INCREMENT',
    'COMMENT', 'SHOW', 'DESCRIBE', 'EXPLAIN',
];

// SQL 常用内置函数（通用，适用于 MySQL/PostgreSQL/Oracle/SQL Server 等主流数据源）
const SQL_FUNCTIONS: { name: string; detail: string }[] = [
    // 聚合函数
    { name: 'COUNT', detail: '聚合 - 计数' },
    { name: 'SUM', detail: '聚合 - 求和' },
    { name: 'AVG', detail: '聚合 - 平均值' },
    { name: 'MAX', detail: '聚合 - 最大值' },
    { name: 'MIN', detail: '聚合 - 最小值' },
    { name: 'GROUP_CONCAT', detail: '聚合 - 拼接分组值' },
    // 字符串函数
    { name: 'CONCAT', detail: '字符串 - 拼接' },
    { name: 'CONCAT_WS', detail: '字符串 - 带分隔符拼接' },
    { name: 'SUBSTRING', detail: '字符串 - 截取子串' },
    { name: 'SUBSTR', detail: '字符串 - 截取子串' },
    { name: 'LEFT', detail: '字符串 - 从左截取' },
    { name: 'RIGHT', detail: '字符串 - 从右截取' },
    { name: 'LENGTH', detail: '字符串 - 字节长度' },
    { name: 'CHAR_LENGTH', detail: '字符串 - 字符长度' },
    { name: 'UPPER', detail: '字符串 - 转大写' },
    { name: 'LOWER', detail: '字符串 - 转小写' },
    { name: 'TRIM', detail: '字符串 - 去空格' },
    { name: 'LTRIM', detail: '字符串 - 去左空格' },
    { name: 'RTRIM', detail: '字符串 - 去右空格' },
    { name: 'REPLACE', detail: '字符串 - 替换' },
    { name: 'REVERSE', detail: '字符串 - 反转' },
    { name: 'REPEAT', detail: '字符串 - 重复' },
    { name: 'LPAD', detail: '字符串 - 左填充' },
    { name: 'RPAD', detail: '字符串 - 右填充' },
    { name: 'INSTR', detail: '字符串 - 查找位置' },
    { name: 'LOCATE', detail: '字符串 - 查找位置' },
    { name: 'FIND_IN_SET', detail: '字符串 - 在集合中查找' },
    { name: 'FORMAT', detail: '字符串 - 数字格式化' },
    { name: 'SPACE', detail: '字符串 - 生成空格' },
    { name: 'INSERT', detail: '字符串 - 插入替换' },
    { name: 'FIELD', detail: '字符串 - 返回位置索引' },
    { name: 'ELT', detail: '字符串 - 按索引返回' },
    { name: 'HEX', detail: '字符串 - 十六进制编码' },
    { name: 'UNHEX', detail: '字符串 - 十六进制解码' },
    // 数学函数
    { name: 'ABS', detail: '数学 - 绝对值' },
    { name: 'CEIL', detail: '数学 - 向上取整' },
    { name: 'CEILING', detail: '数学 - 向上取整' },
    { name: 'FLOOR', detail: '数学 - 向下取整' },
    { name: 'ROUND', detail: '数学 - 四舍五入' },
    { name: 'TRUNCATE', detail: '数学 - 截断小数' },
    { name: 'MOD', detail: '数学 - 取模' },
    { name: 'RAND', detail: '数学 - 随机数' },
    { name: 'SIGN', detail: '数学 - 符号' },
    { name: 'POWER', detail: '数学 - 幂运算' },
    { name: 'POW', detail: '数学 - 幂运算' },
    { name: 'SQRT', detail: '数学 - 平方根' },
    { name: 'LOG', detail: '数学 - 对数' },
    { name: 'LOG2', detail: '数学 - 以2为底对数' },
    { name: 'LOG10', detail: '数学 - 以10为底对数' },
    { name: 'LN', detail: '数学 - 自然对数' },
    { name: 'EXP', detail: '数学 - e的次方' },
    { name: 'PI', detail: '数学 - 圆周率' },
    { name: 'GREATEST', detail: '数学 - 返回最大值' },
    { name: 'LEAST', detail: '数学 - 返回最小值' },
    // 日期时间函数
    { name: 'NOW', detail: '日期 - 当前日期时间' },
    { name: 'CURDATE', detail: '日期 - 当前日期' },
    { name: 'CURRENT_DATE', detail: '日期 - 当前日期' },
    { name: 'CURTIME', detail: '日期 - 当前时间' },
    { name: 'CURRENT_TIME', detail: '日期 - 当前时间' },
    { name: 'CURRENT_TIMESTAMP', detail: '日期 - 当前时间戳' },
    { name: 'SYSDATE', detail: '日期 - 系统当前时间' },
    { name: 'DATE', detail: '日期 - 提取日期部分' },
    { name: 'TIME', detail: '日期 - 提取时间部分' },
    { name: 'YEAR', detail: '日期 - 提取年份' },
    { name: 'MONTH', detail: '日期 - 提取月份' },
    { name: 'DAY', detail: '日期 - 提取天' },
    { name: 'DAYOFWEEK', detail: '日期 - 星期几(1=周日)' },
    { name: 'DAYOFYEAR', detail: '日期 - 年中第几天' },
    { name: 'HOUR', detail: '日期 - 提取小时' },
    { name: 'MINUTE', detail: '日期 - 提取分钟' },
    { name: 'SECOND', detail: '日期 - 提取秒' },
    { name: 'DATE_FORMAT', detail: '日期 - 格式化' },
    { name: 'DATE_ADD', detail: '日期 - 加日期' },
    { name: 'DATE_SUB', detail: '日期 - 减日期' },
    { name: 'DATEDIFF', detail: '日期 - 日期差(天)' },
    { name: 'TIMEDIFF', detail: '日期 - 时间差' },
    { name: 'TIMESTAMPDIFF', detail: '日期 - 时间戳差' },
    { name: 'TIMESTAMPADD', detail: '日期 - 时间戳加' },
    { name: 'STR_TO_DATE', detail: '日期 - 字符串转日期' },
    { name: 'UNIX_TIMESTAMP', detail: '日期 - Unix时间戳' },
    { name: 'FROM_UNIXTIME', detail: '日期 - 从Unix时间戳转换' },
    { name: 'LAST_DAY', detail: '日期 - 月末日期' },
    { name: 'WEEK', detail: '日期 - 第几周' },
    { name: 'QUARTER', detail: '日期 - 第几季度' },
    { name: 'ADDDATE', detail: '日期 - 加日期' },
    { name: 'SUBDATE', detail: '日期 - 减日期' },
    // 条件/流程控制函数
    { name: 'IF', detail: '条件 - 如果' },
    { name: 'IFNULL', detail: '条件 - NULL替换' },
    { name: 'NULLIF', detail: '条件 - 相等返回NULL' },
    { name: 'COALESCE', detail: '条件 - 返回第一个非NULL' },
    { name: 'CASE', detail: '条件 - 分支表达式' },
    // 类型转换
    { name: 'CAST', detail: '转换 - 类型转换' },
    { name: 'CONVERT', detail: '转换 - 类型/字符集转换' },
    // JSON 函数
    { name: 'JSON_EXTRACT', detail: 'JSON - 提取值' },
    { name: 'JSON_UNQUOTE', detail: 'JSON - 去引号' },
    { name: 'JSON_SET', detail: 'JSON - 设置值' },
    { name: 'JSON_INSERT', detail: 'JSON - 插入值' },
    { name: 'JSON_REPLACE', detail: 'JSON - 替换值' },
    { name: 'JSON_REMOVE', detail: 'JSON - 删除值' },
    { name: 'JSON_CONTAINS', detail: 'JSON - 包含判断' },
    { name: 'JSON_OBJECT', detail: 'JSON - 构建对象' },
    { name: 'JSON_ARRAY', detail: 'JSON - 构建数组' },
    { name: 'JSON_LENGTH', detail: 'JSON - 元素个数' },
    { name: 'JSON_TYPE', detail: 'JSON - 值类型' },
    { name: 'JSON_VALID', detail: 'JSON - 验证' },
    { name: 'JSON_KEYS', detail: 'JSON - 获取键列表' },
    // 加密/哈希函数
    { name: 'MD5', detail: '加密 - MD5哈希' },
    { name: 'SHA1', detail: '加密 - SHA1哈希' },
    { name: 'SHA2', detail: '加密 - SHA2哈希' },
    { name: 'UUID', detail: '工具 - 生成UUID' },
    // 信息函数
    { name: 'DATABASE', detail: '信息 - 当前数据库' },
    { name: 'USER', detail: '信息 - 当前用户' },
    { name: 'VERSION', detail: '信息 - MySQL版本' },
    { name: 'CONNECTION_ID', detail: '信息 - 连接ID' },
    { name: 'LAST_INSERT_ID', detail: '信息 - 最后插入ID' },
    { name: 'ROW_COUNT', detail: '信息 - 影响行数' },
    { name: 'FOUND_ROWS', detail: '信息 - 匹配总行数' },
    { name: 'CHARSET', detail: '信息 - 字符集' },
    { name: 'COLLATION', detail: '信息 - 排序规则' },
    // 窗口函数
    { name: 'ROW_NUMBER', detail: '窗口 - 行号' },
    { name: 'RANK', detail: '窗口 - 排名(有间隔)' },
    { name: 'DENSE_RANK', detail: '窗口 - 排名(无间隔)' },
    { name: 'NTILE', detail: '窗口 - 分桶' },
    { name: 'LAG', detail: '窗口 - 前一行' },
    { name: 'LEAD', detail: '窗口 - 后一行' },
    { name: 'FIRST_VALUE', detail: '窗口 - 第一个值' },
    { name: 'LAST_VALUE', detail: '窗口 - 最后一个值' },
    { name: 'NTH_VALUE', detail: '窗口 - 第N个值' },
    // 其他
    { name: 'DISTINCT', detail: '修饰 - 去重' },
    { name: 'EXISTS', detail: '修饰 - 存在判断' },
    { name: 'BETWEEN', detail: '修饰 - 范围判断' },
    { name: 'LIKE', detail: '修饰 - 模式匹配' },
    { name: 'REGEXP', detail: '修饰 - 正则匹配' },
    { name: 'BENCHMARK', detail: '工具 - 性能测试' },
    { name: 'SLEEP', detail: '工具 - 延时' },
];

// 模块级标志：确保 SQL completion provider 全局只注册一次
let sqlCompletionRegistered = false;

// 模块级共享变量：completion provider 从这些变量读取当前活跃 Tab 的状态。
// 每个 QueryEditor 实例在成为活跃 Tab 时更新这些变量，确保 provider 始终使用正确的上下文。
let sharedCurrentDb = '';
let sharedCurrentConnectionId = '';
let sharedConnections: any[] = [];
let sharedTablesData: {dbName: string, tableName: string}[] = [];
let sharedAllColumnsData: {dbName: string, tableName: string, name: string, type: string}[] = [];
let sharedVisibleDbs: string[] = [];
let sharedColumnsCacheData: Record<string, any[]> = {};

type RunMode = 'all' | 'current' | 'selected';
type RunRequest = RunMode | { sql: string; source?: 'executionPlan' };

const QueryEditor: React.FC<{ tab: TabData; isActive?: boolean }> = ({ tab, isActive = true }) => {
  const [query, setQuery] = useState(tab.query || 'SELECT * FROM ');
  
  type ResultSet = {
      key: string;
      sql: string;
      exportSql?: string;
      rows: any[];
      columns: string[];
      tableName?: string;
      pkColumns: string[];
      editLocator?: EditRowLocator;
      readOnly: boolean;
      truncated?: boolean;
      pkLoading?: boolean;
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
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const lastExternalQueryRef = useRef<string>(tab.query || '');
  const dragRef = useRef<{ startY: number, startHeight: number } | null>(null);
  const queryEditorRootRef = useRef<HTMLDivElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const tablesRef = useRef<{dbName: string, tableName: string}[]>([]); // Store tables for autocomplete (cross-db)
  const allColumnsRef = useRef<{dbName: string, tableName: string, name: string, type: string}[]>([]); // Store all columns (cross-db)
  const visibleDbsRef = useRef<string[]>([]); // Store visible databases for cross-db intellisense

  const connections = useStore(state => state.connections);
  const queryCapableConnections = useMemo(
      () => connections.filter(c => getDataSourceCapabilities(c.config).supportsQueryEditor),
      [connections]
  );
  const addSqlLog = useStore(state => state.addSqlLog);
  const addTab = useStore(state => state.addTab);
  const savedQueries = useStore(state => state.savedQueries);
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

          const res = await DBGetDatabases(buildRpcConnectionConfig(config) as any);
          if (res.success && Array.isArray(res.data)) {
              let dbs = res.data.map((row: any) => row.Database || row.database);

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
              const resTables = await DBGetTables(buildRpcConnectionConfig(config) as any, dbName);
              if (resTables.success && Array.isArray(resTables.data)) {
                  const tableNames = resTables.data.map((row: any) => Object.values(row)[0] as string);
                  tableNames.forEach((tableName: string) => {
                      allTables.push({ dbName, tableName });
                  });
              }

              // 获取列 (所有数据库类型都支持 DBGetAllColumns)
              const resCols = await DBGetAllColumns(buildRpcConnectionConfig(config) as any, dbName);
              if (resCols.success && Array.isArray(resCols.data)) {
                  resCols.data.forEach((col: any) => {
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
          { id: 'ai.generateSQL', label: '🤖 AI 生成 SQL', prompt: '请根据当前数据库表结构生成查询语句：' },
          { id: 'ai.explainSQL', label: '🤖 AI 解释 SQL', useSelection: true, prompt: '请解释以下 SQL 语句的执行逻辑：\n```sql\n{SQL}\n```' },
          { id: 'ai.optimizeSQL', label: '🤖 AI 优化 SQL', useSelection: true, prompt: '请分析以下 SQL 语句的性能并给出优化建议：\n```sql\n{SQL}\n```' },
      ];

      aiActions.forEach(action => {
          editor.addAction({
              id: action.id,
              label: action.label,
              contextMenuGroupId: '9_ai',
              contextMenuOrder: 1,
              run: (ed: any) => {
                  const selection = ed.getModel()?.getValueInRange(ed.getSelection());
                  const conn = connectionsRef.current.find(c => c.id === currentConnectionIdRef.current);
                  const ctxText = conn ? `【上下文环境：${conn.config?.type || '数据库'} "${conn.name}", 当前库选定为 "${currentDbRef.current || '默认'}"】\n` : '';
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
          provideCompletionItems: async (model: any, position: any) => {
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

                  const res = await DBGetColumns(buildRpcConnectionConfig(config) as any, dbName, tableIdent);
                  if (res?.success && Array.isArray(res.data)) {
                      const cols = res.data as ColumnDefinition[];
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
          { cmd: '/query',    label: '🔍 自然语言查询',  desc: '用中文描述你想查什么',   prompt: '帮我写一条 SQL 查询：' },
          { cmd: '/sql',      label: '📝 生成 SQL',      desc: '描述需求自动生成语句',   prompt: '请根据以下需求生成 SQL：' },
          { cmd: '/explain',  label: '💡 解释 SQL',      desc: '解释选中 SQL 的逻辑',    prompt: '请解释以下 SQL 的执行逻辑和每一步的作用：\n```sql\n{SQL}\n```', useSelection: true },
          { cmd: '/optimize', label: '⚡ 优化分析',      desc: '分析 SQL 性能瓶颈',      prompt: '请分析以下 SQL 的性能问题，并给出优化后的版本：\n```sql\n{SQL}\n```', useSelection: true },
          { cmd: '/schema',   label: '🏗️ 表设计评审',    desc: '评审表结构设计质量',     prompt: '请全面评审当前关联表的设计，包括字段类型、范式、索引策略等方面的改进建议：' },
          { cmd: '/index',    label: '📊 索引建议',      desc: '推荐最优索引方案',       prompt: '请基于当前表结构和常见查询场景，推荐最优的索引方案并给出建表语句：' },
          { cmd: '/diff',     label: '🔄 表对比',        desc: '对比两表差异生成变更',   prompt: '请对比以下两张表的结构差异，并生成从旧版本迁移到新版本的 ALTER 语句：' },
          { cmd: '/mock',     label: '🎲 造测试数据',    desc: '生成 INSERT 测试数据',   prompt: '请为当前关联的表生成 10 条符合业务语义的测试数据 INSERT 语句：' },
      ];
      // 全局变量存储命令定义，供 onDidChangeModelContent 使用
      (window as any).__javanaviSlashCmdDefs = slashCmdDefs;

      monaco.languages.registerCompletionItemProvider('sql', {
          triggerCharacters: ['/'],
          provideCompletionItems: (model: any, position: any) => {
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
          const defs = (window as any).__javanaviSlashCmdDefs || [];
          const cmdDef = defs.find((c: any) => c.cmd === `/${cmdKey}`);
          if (!cmdDef) return;

          // 清除标记文本（带递归保护）
          _handlingSlash = true;
          const fullText = model.getValue();
          const newText = fullText.replace(markerMatch[0], '').replace(/^\s*\n/, '');
          model.setValue(newText);
          _handlingSlash = false;

          // 组装 prompt
          const conn = connectionsRef.current.find(c => c.id === currentConnectionIdRef.current);
          const ctxText = conn ? `【上下文环境：${conn.config?.type || '数据库'} "${conn.name}", 当前库选定为 "${currentDbRef.current || '默认'}"】\n` : '';
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
          void message.error("格式化失败: SQL 语法可能有误");
      }
  };

  const handleAIAction = (action: 'generate' | 'explain' | 'optimize' | 'schema') => {
      const editor = editorRef.current;
      const selection = editor?.getModel()?.getValueInRange(editor.getSelection()) || '';
      const fullSQL = getCurrentQuery();

      const conn = connections.find(c => c.id === currentConnectionId);
      const ctxText = conn ? `【上下文环境：${conn.config?.type || '数据库'} "${conn.name}", 当前库选定为 "${currentDb || '默认'}"】\n` : '';

      const prompts: Record<string, string> = {
          generate: `${ctxText}请根据当前数据库表结构生成查询语句：`,
          explain: `${ctxText}请解释以下 SQL 语句的执行逻辑：\n\`\`\`sql\n${selection || fullSQL}\n\`\`\``,
          optimize: `${ctxText}请分析以下 SQL 语句的性能并给出优化建议：\n\`\`\`sql\n${selection || fullSQL}\n\`\`\``,
          schema: `${ctxText}请针对当前数据库的表结构进行系统分析，并给出性能和设计上的优化建议。`,
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
          label: '关键字大写', 
          icon: sqlFormatOptions.keywordCase === 'upper' ? '✓' : undefined,
          onClick: () => setSqlFormatOptions({ keywordCase: 'upper' }) 
      },
      { 
          key: 'lower', 
          label: '关键字小写', 
          icon: sqlFormatOptions.keywordCase === 'lower' ? '✓' : undefined,
          onClick: () => setSqlFormatOptions({ keywordCase: 'lower' }) 
      },
      { type: 'divider' },
      {
          key: 'shortcut-settings',
          label: '快捷键管理...',
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
          label: '运行当前语句',
          onClick: () => handleRun('current'),
      },
      {
          key: 'selected',
          label: '运行已选择',
          onClick: () => handleRun('selected'),
      },
  ];

  const buildExplainSQL = (sourceSql: string, dbType: string, driver = ''): { sql: string; error?: string } => {
      const statements = splitSQLStatements(sourceSql);
      if (statements.length === 0) {
          return { sql: '', error: '没有可生成执行计划的 SQL。' };
      }
      if (statements.length > 1) {
          return { sql: '', error: '执行计划一次只支持一条 SQL，请先选中一条语句。' };
      }

      const statement = statements[0].trim().replace(/[;；]\s*$/u, '');
      if (!statement) {
          return { sql: '', error: '没有可生成执行计划的 SQL。' };
      }

      const dialect = String(resolveSqlDialect(dbType, driver)).toLowerCase();
      if (dialect === 'mongodb' || dialect === 'redis') {
          return { sql: '', error: '当前数据源不支持 SQL 执行计划。' };
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
          const res = await DBQueryMulti(buildRpcConnectionConfig(config) as any, currentDb, sql, queryId);
          if (!res?.success) {
              message.error('刷新失败: ' + (res?.message || '未知错误'));
              return;
          }

          // 取第一个结果集（单条 SQL 只有一个结果集）
          const resultSetDataArray = Array.isArray(res.data) ? (res.data as any[]) : [];
          if (resultSetDataArray.length === 0) return;
          const rsData = resultSetDataArray[0];
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
          rows.forEach((row: any, i: number) => {
              if (row && typeof row === 'object') row[JAVANAVI_ROW_KEY] = i;
          });

          // 只更新匹配的结果集；若列集合变化，则重新收紧为只读，避免沿用旧定位列误提交。
          setResultSets(prev => prev.map(rs => {
              if (rs.key !== resultKey) return rs;
              const previousColumnKey = rs.columns.join('\u0001');
              const nextColumnKey = cols.join('\u0001');
              if (previousColumnKey !== nextColumnKey) {
                  const readOnlyLocator = resolveEditRowLocator({ resultColumns: cols, primaryKeys: [], indexes: [] });
                  return { ...rs, rows, columns: cols, editLocator: readOnlyLocator, pkColumns: [], readOnly: true, pkLoading: false, truncated };
              }
              return { ...rs, rows, columns: cols, truncated };
          }));
      } catch (err: any) {
          message.error('刷新失败: ' + (err?.message || '未知错误'));
      } finally {
          setLoading(false);
      }
  };

  const handleRun = async (request?: RunRequest) => {
    const explicitSQL = typeof request === 'object' && typeof request.sql === 'string' ? request.sql : '';
    const mode = request === 'selected' || request === 'current' || request === 'all' ? request : 'all';
    const runSQL = explicitSQL || resolveRunnableSQL(mode);
    if (!runSQL.trim()) return;
    if (!currentDb) {
        message.error("请先选择数据库");
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
        message.error("当前数据源不支持 SQL 查询编辑器，请使用对应专用页面。");
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
        const rpcConfig = buildRpcConnectionConfig(config, { queryTimeout: 120 }) as any;
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
                message.info('没有可执行的 SQL。');
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
                        const prefix = statements.length > 1 ? `第 ${idx + 1} 条语句执行失败：` : '';
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

                const res = await DBQueryWithCancel(rpcConfig, currentDb, executedSql, queryId);
                const duration = Date.now() - startTime;
                addSqlLog({
                    id: `log-${Date.now()}-query-${idx + 1}`,
                    timestamp: Date.now(),
                    sql: executedSql,
                    status: res.success ? 'success' : 'error',
                    duration,
                    message: res.success ? '' : res.message,
                    affectedRows: (res.success && !Array.isArray(res.data)) ? (res.data as any).affectedRows : (Array.isArray(res.data) ? res.data.length : undefined),
                    dbName: currentDb
                });
                if (!res.success) {
                    const prefix = statements.length > 1 ? `第 ${idx + 1} 条语句执行失败：` : '';
                    setExecutionError(prefix + res.message);
                    setResultSets([]);
                    setActiveResultKey('');
                    return;
                }
                if (Array.isArray(res.data)) {
                    let rows = (res.data as any[]) || [];
                    let truncated = false;
                    if (wantsLimitProbe && Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
                        truncated = true;
                        anyTruncated = true;
                        rows = rows.slice(0, maxRows);
                    }
                    const cols = (res.fields && res.fields.length > 0)
                        ? (res.fields as string[])
                        : (rows.length > 0 ? Object.keys(rows[0]) : []);
                    rows.forEach((row: any, i: number) => {
                        if (row && typeof row === 'object') row[JAVANAVI_ROW_KEY] = i;
                    });
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: rawStatement,
                        exportSql: rawStatement,
                        rows,
                        columns: cols,
                        pkColumns: [],
                        readOnly: true,
                        truncated
                    });
                } else {
                    const affected = Number((res.data as any)?.affectedRows);
                    if (Number.isFinite(affected)) {
                        const row = { affectedRows: affected };
                        (row as any)[JAVANAVI_ROW_KEY] = 0;
                        nextResultSets.push({
                            key: `result-${idx + 1}`,
                            sql: rawStatement,
                            exportSql: rawStatement,
                            rows: [row],
                            columns: ['affectedRows'],
                            pkColumns: [],
                            readOnly: true
                        });
                    }
                }
            }
            setResultSets(nextResultSets);
            setActiveResultKey(nextResultSets[0]?.key || '');
            if (anyTruncated) {
                message.warning(`结果超过 ${maxRows} 行，已按设置截断显示。`);
            }
            if (statements.length > 1) {
                message.success(`已执行 ${statements.length} 条语句，生成 ${nextResultSets.length} 个结果集。`);
            } else if (nextResultSets.length === 0) {
                message.success('执行成功。');
            }

        } else {
            // 非 MongoDB：使用 DBQueryMulti 一次性执行多条 SQL，后端返回多结果集
            let fullSQL = normalizedRawSQL;
            if (!fullSQL.trim()) {
                message.info('没有可执行的 SQL。');
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
                    const result = applyQueryAutoLimit(s, normalizedDbType, maxRowsForLimit, String((rpcConfig as any).driver || ''));
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

            const res = await DBQueryMulti(rpcConfig, currentDb, fullSQL, queryId);
            const duration = Date.now() - startTime;

            addSqlLog({
                id: `log-${Date.now()}-query-multi`,
                timestamp: Date.now(),
                sql: fullSQL,
                status: res.success ? 'success' : 'error',
                duration,
                message: res.success ? '' : res.message,
                dbName: currentDb
            });

            if (!res.success) {
                const errorMsg = res.message.toLowerCase();
                const isCancelledError = errorMsg.includes('context canceled') ||
                                         errorMsg.includes('查询已取消') ||
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

            // res.data 是 ResultSetData[] 数组
            const resultSetDataArray = Array.isArray(res.data) ? (res.data as any[]) : [];
            const nextResultSets: ResultSet[] = [];
            const maxRows = Number(queryOptions?.maxRows) || 0;
            const forceReadOnlyResult = connCaps.forceReadOnlyQueryResult;
            let anyTruncated = false;
            const pendingPk: Array<{ resultKey: string; tableName: string }> = [];

            // 前端也拆分语句用于匹配原始 SQL（展示和表名检测）
            const statements = splitSQLStatements(fullSQL);

            for (let idx = 0; idx < resultSetDataArray.length; idx++) {
                const rsData = resultSetDataArray[idx];
                const rawStatement = (idx < statements.length) ? statements[idx] : '';

                // 检查是否为 affectedRows 类结果集
                const isAffectedResult = Array.isArray(rsData.rows) && rsData.rows.length === 1
                    && rsData.columns && rsData.columns.length === 1
                    && rsData.columns[0] === 'affectedRows';

                if (isAffectedResult) {
                    const affected = Number(rsData.rows[0]?.affectedRows);
                    const row = { affectedRows: Number.isFinite(affected) ? affected : 0 };
                    (row as any)[JAVANAVI_ROW_KEY] = 0;
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: rawStatement,
                        exportSql: rawStatement,
                        rows: [row],
                        columns: ['affectedRows'],
                        pkColumns: [],
                        readOnly: true
                    });
                } else {
                    let rows = Array.isArray(rsData.rows) ? rsData.rows : [];
                    let truncated = false;
                    // 仅当前端自动注入了 LIMIT 时才做兜底截断；用户手写 LIMIT 时尊重原始结果
                    if (anyLimitApplied && Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
                        truncated = true;
                        anyTruncated = true;
                        rows = rows.slice(0, maxRows);
                    }
                    const cols = (rsData.columns && rsData.columns.length > 0)
                        ? rsData.columns
                        : (rows.length > 0 ? Object.keys(rows[0]) : []);

                    rows.forEach((row: any, i: number) => {
                        if (row && typeof row === 'object') row[JAVANAVI_ROW_KEY] = i;
                    });

                    let simpleTableName: string | undefined = undefined;
                    if (rawStatement) {
                        // 支持多行 SQL：SELECT [cols] FROM [schema.]table [WHERE...] [ORDER BY...] [LIMIT...] 等
                        // JOIN 查询表名歧义，不提取。Oracle 无主键结果需要 ROWID 时，只在用户已显式选出 ROWID 时启用编辑。
                        const hasJoin = /\bJOIN\b/i.test(rawStatement);
                        const tableMatch = !hasJoin
                            ? rawStatement.match(/^\s*SELECT\s+.+?\s+FROM\s+(?:[\w`"\[\].]+\.)?[`"\[]?(\w+)[`"\]]?\s*(?:$|[\s;])/im)
                            : null;
                        if (tableMatch) {
                            simpleTableName = tableMatch[1];
                            if (!forceReadOnlyResult && !anyLimitApplied) {
                                pendingPk.push({ resultKey: `result-${idx + 1}`, tableName: simpleTableName });
                            }
                        }
                    }

                    const canResolveLocator = !!simpleTableName && !forceReadOnlyResult && !anyLimitApplied;
                    const initialEditLocator = canResolveLocator
                        ? undefined
                        : resolveEditRowLocator({ resultColumns: cols, primaryKeys: [], indexes: [], dbType: normalizedDbType });
                    nextResultSets.push({
                        key: `result-${idx + 1}`,
                        sql: rawStatement,
                        exportSql: rawStatement,
                        rows,
                        columns: cols,
                        tableName: simpleTableName,
                        pkColumns: [],
                        editLocator: initialEditLocator,
                        readOnly: true,
                        pkLoading: canResolveLocator,
                        truncated
                    });
                }
            }

            setResultSets(nextResultSets);
            setActiveResultKey(nextResultSets[0]?.key || '');

            pendingPk.forEach(({ resultKey, tableName }) => {
                Promise.all([
                    DBGetColumns(rpcConfig, currentDb, tableName),
                    DBGetIndexes(rpcConfig, currentDb, tableName).catch(() => ({ success: false, data: [] } as any)),
                ])
                    .then(([resCols, resIndexes]: any[]) => {
                        if (runSeqRef.current !== runSeq) return;
                        if (!resCols?.success || !Array.isArray(resCols.data)) {
                            const readOnlyLocator = resolveEditRowLocator({
                                dbType: normalizedDbType,
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
                            resultColumns: [],
                            primaryKeys: [],
                            indexes: [],
                        });
                        setResultSets(prev => prev.map(rs => rs.key === resultKey ? { ...rs, editLocator: readOnlyLocator, pkLoading: false, readOnly: true } : rs));
                    });
            });

            if (anyTruncated) {
                message.warning(`结果超过 ${maxRows} 行，已按设置截断显示。`);
            }
            // 后端附带的提示信息（如数据源不支持原生多语句执行的回退提示）
            if (res.message) {
                message.info(res.message);
            }
            if (resultSetDataArray.length > 1) {
                message.success(`已执行完成，生成 ${nextResultSets.length} 个结果集。`);
            } else if (nextResultSets.length === 0) {
                message.success('执行成功。');
            }

        }
    } catch (e: any) {
        message.error("Error executing query: " + e.message);
        addSqlLog({
            id: `log-${Date.now()}-error`,
            timestamp: Date.now(),
            sql: runSQL || query,
            status: 'error',
            duration: Date.now() - runStartTime,
            message: e.message,
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
        message.error("请先选择数据库");
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
    }) as any;
    const plan = buildExplainSQL(sourceSQL, String(rpcConfig.type || conn.config.type || 'mysql'), String((rpcConfig as any).driver || conn.config.driver || ''));
    if (plan.error) {
        message.warning(plan.error);
        return;
    }
    await handleRun({ sql: plan.sql, source: 'executionPlan' });
  };

  const handleCancel = async () => {
    if (!currentQueryIdRef.current) {
      message.warning('没有正在运行的查询可取消');
      return;
    }
    const queryIdToCancel = currentQueryIdRef.current;
    try {
      const res = await CancelQuery(queryIdToCancel);
      if (res.success) {
        message.success('查询已取消');
        // Clear query ID after successful cancellation
        if (currentQueryIdRef.current === queryIdToCancel) {
          clearQueryId()
        }
      } else {
        message.warning(res.message);
      }
    } catch (error: any) {
      message.error('取消查询失败: ' + error.message);
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
      const handleInsertSql = (e: any) => {
          if (e.detail?.tabId !== tab.id || !e.detail?.sql) return;
          const { sql: sqlText, connectionId, dbName } = e.detail;

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
              if (e.detail.runImmediately && existingContent.trim() === sqlText.trim()) {
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
                  
                  if (!e.detail.runImmediately) {
                      message.success('代码已在当前光标处成功插入');
                  }

                  if (e.detail.runImmediately) {
                      const endPosition = editor.getPosition();
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
              message.success('代码已追加');
          }
      };
      window.addEventListener('javanavi:insert-sql-to-tab', handleInsertSql as EventListener);
      return () => window.removeEventListener('javanavi:insert-sql-to-tab', handleInsertSql as EventListener);
  }, [tab.id, handleRun]);

  const resolveDefaultQueryName = () => {
      const rawTitle = String(tab.title || '').trim();
      if (!rawTitle || rawTitle.startsWith('新建查询')) {
          return '未命名查询';
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
                  message.error('保存 SQL 文件失败: ' + (res.message || '未知错误'));
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
              message.success('SQL 文件已保存！');
          } catch (error) {
              message.error('保存 SQL 文件失败: ' + (error instanceof Error ? error.message : String(error)));
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
      message.success('查询已保存！');
  };

  const handleSave = async () => {
      try {
          const values = await saveForm.validateFields();
          const existed = currentSavedQuery || null;
          const fallbackSavedId = String(tab.savedQueryId || '').trim();
          const nextSavedId = existed?.id || fallbackSavedId || `saved-${Date.now()}`;
          persistQuery({
              id: nextSavedId,
              name: String(values.name || '').trim() || '未命名查询',
              createdAt: existed?.createdAt,
          });
          message.success('查询已保存！');
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
            placeholder="选择连接"
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
            placeholder="选择数据库"
            value={currentDb}
            onChange={setCurrentDb}
            options={dbList.map(db => ({ label: db, value: db }))}
            showSearch
        />
        <Tooltip title="最大返回行数（会对 SELECT 自动加 LIMIT，防止大结果集卡死）">
            <Select
                style={{ width: 170 }}
                value={queryOptions?.maxRows ?? 5000}
                onChange={(val) => setQueryOptions({ maxRows: Number(val) })}
                options={[
                    { label: '最大行数：500', value: 500 },
                    { label: '最大行数：1000', value: 1000 },
                    { label: '最大行数：5000', value: 5000 },
                    { label: '最大行数：20000', value: 20000 },
                    { label: '最大行数：不限', value: 0 },
                ]}
            />
        </Tooltip>
        <Button.Group>
          <Tooltip
              title={
                  shortcutOptions.runQuery?.enabled && shortcutOptions.runQuery?.combo
                      ? `运行全部（${getShortcutDisplay(shortcutOptions.runQuery.combo)}）`
                      : '运行全部'
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
                运行
              </Dropdown.Button>
          </Tooltip>
          {loading && (
            <Button type="primary" danger icon={<StopOutlined />} onClick={handleCancel}>
              停止
            </Button>
          )}
        </Button.Group>
        <Button onClick={handleExplainPlan} disabled={loading}>
          执行计划
        </Button>
        <Tooltip
            title={
                shortcutOptions.saveQuery?.enabled && shortcutOptions.saveQuery?.combo
                    ? `保存（${getShortcutDisplay(shortcutOptions.saveQuery.combo)}）`
                    : '保存'
            }
        >
            <Button icon={<SaveOutlined />} onClick={handleQuickSave}>
              保存
            </Button>
        </Tooltip>
        
        <Button.Group>
            <Tooltip title="美化 SQL">
                <Button icon={<FormatPainterOutlined />} onClick={handleFormat}>美化</Button>
            </Tooltip>
            <Dropdown menu={{ items: formatSettingsMenu }} placement="bottomRight">
                <Button icon={<SettingOutlined />} />
            </Dropdown>
        </Button.Group>

        <Dropdown menu={{ items: [
            { key: 'ai-generate', label: '生成 SQL', icon: <RobotOutlined />, onClick: () => handleAIAction('generate') },
            { key: 'ai-explain', label: '解释 SQL', icon: <RobotOutlined />, onClick: () => handleAIAction('explain') },
            { key: 'ai-optimize', label: '优化 SQL', icon: <RobotOutlined />, onClick: () => handleAIAction('optimize') },
            { type: 'divider' as const },
            { key: 'ai-schema', label: 'Schema 分析', icon: <RobotOutlined />, onClick: () => handleAIAction('schema') },
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
        title="拖动调整高度"
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
                          <span>{(() => {
                              const isAffected = rs.columns.length === 1 && rs.columns[0] === 'affectedRows';
                              if (isAffected) return `结果 ${idx + 1} ✓`;
                              return `结果 ${idx + 1}${Array.isArray(rs.rows) ? ` (${rs.rows.length})` : ''}`;
                          })()}</span>
                          </Tooltip>
                          <Tooltip title="关闭结果">
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
                      // affectedRows 类型结果集（UPDATE/INSERT/DELETE）：简洁提示
                      const isAffectedResult = rs.columns.length === 1 && rs.columns[0] === 'affectedRows';
                      if (isAffectedResult) {
                          const affected = Number(rs.rows[0]?.affectedRows ?? 0);
                          return (
                              <div style={{
                                  flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexDirection: 'column', gap: 8, color: '#666', userSelect: 'text',
                              }}>
                                  <span style={{ fontSize: 36, color: '#52c41a' }}>✓</span>
                                  <span style={{ fontSize: 14, fontWeight: 500 }}>执行成功</span>
                                  <span style={{ fontSize: 13, color: '#999' }}>影响行数：{affected}</span>
                              </div>
                          );
                      }
                      return (
                          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                              <DataGrid
                                  data={rs.rows}
                                  columnNames={rs.columns}
                                  loading={loading}
                                  tableName={rs.tableName}
                                  exportScope="queryResult"
                                  resultSql={rs.exportSql || rs.sql}
                                  dbName={currentDb}
                                  connectionId={currentConnectionId}
                                  pkColumns={rs.pkColumns}
                                  editLocator={rs.editLocator}
                                  onReload={() => handleReloadResult(rs.key, rs.sql)}
                                  readOnly={rs.readOnly}
                              />
                          </div>
                      );
                  })()
              }))}
          />
        ) : executionError ? (
          <div style={{ flex: 1, minHeight: 0, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, background: darkMode ? '#1e1e1e' : '#fafafa', overflow: 'auto' }}>
              <div style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloseOutlined />
                  <span>执行失败</span>
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
                          const prompt = `我在执行以下 SQL 时遇到了错误：\n\`\`\`sql\n${errSql}\n\`\`\`\n\n数据库报错信息如下：\n\`\`\`text\n${executionError}\n\`\`\`\n\n请帮我分析错误原因，并给出修改建议。`;
                          const store = useStore.getState();
                          const wasClosed = !store.aiPanelVisible;
                          if (wasClosed) store.setAIPanelVisible(true);
                          setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('javanavi:ai:inject-prompt', { detail: { prompt } }));
                          }, wasClosed ? 350 : 0);
                      }}
                  >
                      一键 AI 诊断
                  </Button>
              </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }} />
        )}
      </div>

      <Modal 
        title="保存查询" 
        open={isSaveModalOpen} 
        onOk={handleSave} 
        onCancel={() => setIsSaveModalOpen(false)}
        okText="确认"
        cancelText="取消"
      >
          <Form form={saveForm} layout="vertical">
              <Form.Item name="name" label="查询名称" rules={[{ required: true, message: '请输入查询名称' }]}>
                  <Input placeholder="例如：查询所有用户" />
              </Form.Item>
          </Form>
      </Modal>
    </div>
  );
};

export default QueryEditor;
