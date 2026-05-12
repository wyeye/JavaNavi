import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Tree, message, Dropdown, MenuProps, Input, Button, Modal, Form, Badge, Checkbox, Space, Select, Popover, Tooltip, Progress, type InputRef } from 'antd';
import type RcTree from 'rc-tree';
import type { EventDataNode } from 'rc-tree/lib/interface';
	import {
	  DatabaseOutlined,
	  TableOutlined,
	  EyeOutlined,
	  ConsoleSqlOutlined,
  HddOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  CopyOutlined,
  ExportOutlined,
  SaveOutlined,
  EditOutlined,
  DownOutlined,
  SearchOutlined,
  KeyOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FunctionOutlined,
  LinkOutlined,
  FileAddOutlined,
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  CloudOutlined,
  CheckSquareOutlined,
  CodeOutlined,
  TagOutlined,
  CheckOutlined,
  FilterOutlined,
  DashboardOutlined,
  WarningOutlined,
  CompressOutlined,
  AimOutlined
	} from '@ant-design/icons';
import { useStore } from '../store';
import { buildOverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
	import { SavedConnection, ExternalSQLTreeEntry, type ConnectionTag, type TabData } from '../types';
import { getDbIcon } from './DatabaseIcons';
	import { DBGetDatabases, DBGetTables, DBGetSchemaObjects, DBQuery, DBShowCreateTable, ExportTable, OpenSQLFile, isJavaNaviDesktopRuntime, ExecuteSQLFile, CancelSQLFileExecution, CreateDatabase, RenameDatabase, DropDatabase, RenameTable, DropTable, DropView, DropFunction, RenameView, ListSQLDirectory, ReadSQLFile, ResolveSQLWorkspace, UploadSQLFile, CreateSQLDirectory, RenameSQLWorkspacePath, CloseConnection, RedisGetDatabases, DuplicateConnection, DeleteConnection, ExportDatabaseSQL, ExportTablesSQL, ExportTablesDataSQL, ClearTables, TruncateTables } from '@compat/javanaviApp';
import { supportsTableTruncateAction, type TableDataDangerActionKind } from './tableDataDangerActions';
  import { EventsOn } from '@compat/runtime';
  import { isMacLikePlatform, normalizeOpacityForPlatform, resolveAppearanceValues } from '../utils/appearance';
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import FindInDatabaseModal from './FindInDatabaseModal';
import { buildRpcConnectionConfig, type RpcConnectionConfig } from '../utils/connectionRpcConfig';
import { noAutoCapInputProps } from '../utils/inputAutoCap';
import {
  buildDuckDBMacroDDL,
  buildFunctionsMetadataQuerySpecs,
  buildQualifiedName,
  buildTriggersMetadataQuerySpecs,
  buildViewsMetadataQuerySpecs,
  escapeSQLLiteral,
  getCaseInsensitiveRawValue,
  getCaseInsensitiveValue,
  getFirstRowValue,
  getMetadataDialect,
  getMySQLShowTablesName,
  getSidebarTableDisplayName,
  isSphinxConnection,
  normalizeMetadataQuerySpecs,
  normalizeSidebarViewName,
  resolveSidebarRuntimeDatabase,
  shouldHideSchemaPrefix,
  splitQualifiedName,
  type MetadataQueryResult,
  type MetadataQuerySpec,
  type MetadataRow,
 } from '../utils/sidebarMetadata';
import { resolveConnectionAccentColor, resolveConnectionIconType } from '../utils/connectionVisual';
import { buildTableSelectQuery } from '../utils/objectQueryTemplates';
import { buildTableHoverTitle } from '../utils/tableHoverTitle';
import { buildExternalSQLRootNode, buildExternalSQLTabId, type ExternalSQLTreeNode } from '../utils/externalSqlTree';
import { exportSuccessMessage } from '../utils/exportResultMessage';
import { filterSidebarTree, normalizeMySQLViewDDLForEditing, resolveCopyableSidebarNodeName, type SearchScope, type TreeNode } from './sidebarSearch';
import { locateActiveSidebarTable } from './sidebarTreeNavigation';
import { translate, type I18nKey, type I18nParams } from '../i18n';

const { Search } = Input;

type BatchTableExportMode = 'schema' | 'backup' | 'dataOnly';
type BatchObjectType = 'table' | 'view';
type BatchObjectFilterType = 'all' | BatchObjectType;
type BatchSelectionScope = 'filtered' | 'all';
type TableOverviewTabData = Extract<TabData, { type: 'table-overview' }> & { schemaName?: string };
type SchemaObjectRow = Record<string, unknown> & {
  Table?: unknown;
  tableName?: unknown;
  table?: unknown;
  tableType?: unknown;
  table_type?: unknown;
  TABLE_TYPE?: unknown;
};

type SidebarDatabaseRow = Record<string, unknown> & { Database?: unknown; database?: unknown; index?: unknown; keys?: unknown };
type SidebarRedisDatabaseRow = Record<string, unknown> & { index?: unknown; keys?: unknown };
type SidebarWorkspacePayload = { path?: unknown; name?: unknown };
type SidebarExecutionResultData = { executedSQLs?: unknown; count?: unknown };
type SidebarLargeFilePayload = { isLargeFile?: unknown; filePath?: unknown; path?: unknown; fileSizeMB?: unknown };
type SidebarSqlFileProgressEvent = { jobId?: unknown; status?: unknown; executed?: unknown; failed?: unknown; total?: unknown; percent?: unknown; currentSQL?: unknown };
type SidebarQueryRecord = Record<string, unknown>;
type SidebarRoutineType = 'FUNCTION' | 'PROCEDURE';
type SidebarLoadTreeNode = { key?: React.Key; dataRef?: object };
type SidebarDataRef = Record<string, unknown>;
type SidebarSavedQueryData = SidebarDataRef & { id: string; name: string; sql: string; connectionId: string; dbName: string };
type SidebarTagData = SidebarDataRef & ConnectionTag;
type SidebarNodeData = SidebarDataRef & SavedConnection & {
  dbName?: string;
  tableName?: string;
  viewName?: string;
  triggerName?: string;
  triggerTableName?: string;
  routineName?: string;
  routineType?: string;
  schemaName?: string;
  groupKey?: string;
  connectionId?: string;
  redisDB?: number;
  path?: string;
  name?: string;
  connectionIds?: string[];
  comment?: string;
  tableComment?: string;
};
type SidebarAvailableDatabase = { title: string; key: string; dbName: string };
type SidebarBatchDatabase = SidebarAvailableDatabase & { dataRef: SavedConnection & { dbName: string } };
type SidebarBatchDbContext = { conn: SavedConnection; dbName: string } | null;
type SidebarRuntimeNodeData = SidebarDataRef & SavedConnection & {
  dbName: string;
  tableName?: string;
  viewName?: string;
  routineName?: string;
  routineType?: string;
  triggerName?: string;
  groupKey?: string;
};
type SidebarEventNode = EventDataNode<TreeNode>;
type SidebarMenuNode = TreeNode | SidebarEventNode;
type SidebarSelectInfo = {
  selected: boolean;
  node: SidebarEventNode;
  selectedNodes: TreeNode[];
};
type SidebarDropInfo = {
  node: SidebarEventNode;
  dragNode: SidebarEventNode;
  dropPosition: number;
};
type SidebarRightClickInfo = {
  event: React.MouseEvent;
  node: SidebarEventNode;
};

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const getSidebarDataRef = <T extends SidebarDataRef = SidebarDataRef>(node: { dataRef?: object } | null | undefined): T => (
  node?.dataRef && typeof node.dataRef === 'object' ? node.dataRef as T : {} as T
);

const getSidebarNodeKeyText = (node: { key?: React.Key } | null | undefined): string => String(node?.key ?? '').trim();

interface BatchObjectItem {
  title: string;
  key: string;
  objectName: string;
  objectType: BatchObjectType;
  dataRef: SidebarNodeData;
}

const schemaObjectName = (row: SchemaObjectRow): string => (
  String(row.Table || row.tableName || row.table || Object.values(row)[0] || '').trim()
);

const isSchemaViewObject = (row: SchemaObjectRow): boolean => (
  String(row.tableType || row.table_type || row.TABLE_TYPE || '').toUpperCase().includes('VIEW')
);

const SEARCH_SCOPE_OPTIONS: Array<{ value: SearchScope; labelKey: I18nKey }> = [
  { value: 'smart', labelKey: 'sidebar.searchScope.smart' },
  { value: 'object', labelKey: 'sidebar.searchScope.object' },
  { value: 'database', labelKey: 'sidebar.searchScope.database' },
  { value: 'host', labelKey: 'sidebar.searchScope.host' },
  { value: 'tag', labelKey: 'sidebar.searchScope.tag' },
];

const CANCELLED_MESSAGE = '\u5df2\u53d6\u6d88';


const SEARCH_SCOPE_ICON_MAP: Record<SearchScope, React.ReactNode> = {
  smart: <ThunderboltOutlined />,
  object: <TableOutlined />,
  database: <DatabaseOutlined />,
  host: <CloudOutlined />,
  tag: <TagOutlined />,
};

const Sidebar: React.FC<{ onEditConnection?: (conn: SavedConnection) => void }> = ({ onEditConnection }) => {
  const connections = useStore(state => state.connections);
  const savedQueries = useStore(state => state.savedQueries);
  const deleteQuery = useStore(state => state.deleteQuery);
  const addConnection = useStore(state => state.addConnection);
  const addTab = useStore(state => state.addTab);
  const tabs = useStore(state => state.tabs);
  const activeTabId = useStore(state => state.activeTabId);
  const setActiveContext = useStore(state => state.setActiveContext);
  const removeConnection = useStore(state => state.removeConnection);
  const connectionTags = useStore(state => state.connectionTags);
  const addConnectionTag = useStore(state => state.addConnectionTag);
  const updateConnectionTag = useStore(state => state.updateConnectionTag);
  const removeConnectionTag = useStore(state => state.removeConnectionTag);
  const moveConnectionToTag = useStore(state => state.moveConnectionToTag);
  const reorderTags = useStore(state => state.reorderTags);
  const closeTabsByConnection = useStore(state => state.closeTabsByConnection);
  const closeTabsByDatabase = useStore(state => state.closeTabsByDatabase);
  const theme = useStore(state => state.theme);
  const appearance = useStore(state => state.appearance);
  const tableAccessCount = useStore(state => state.tableAccessCount);
  const tableSortPreference = useStore(state => state.tableSortPreference);
  const recordTableAccess = useStore(state => state.recordTableAccess);
  const setTableSortPreference = useStore(state => state.setTableSortPreference);
  const addSqlLog = useStore(state => state.addSqlLog);
  const language = useStore(state => state.language);
  const t = useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
  const isCancelledMessage = (value: unknown) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      return normalized.includes(CANCELLED_MESSAGE) || normalized.includes('cancelled') || normalized.includes('query cancelled');
  };
  const getTableDangerActionText = (action: TableDataDangerActionKind) => (
      action === 'truncate'
          ? {
              label: t('sidebar.action.truncate'),
              progressLabel: t('sidebar.action.truncating'),
              successLabel: t('sidebar.action.truncated'),
          }
          : {
              label: t('sidebar.action.clear'),
              progressLabel: t('sidebar.action.clearing'),
              successLabel: t('sidebar.action.cleared'),
          }
  );
  const showExportSuccess = (res: unknown, fallback?: string) => {
      message.success(exportSuccessMessage(res, language, fallback));
  };
  const darkMode = theme === 'dark';
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const opacity = normalizeOpacityForPlatform(resolvedAppearance.opacity);
  const disableLocalBackdropFilter = isMacLikePlatform();
  const autoFetchVisible = useAutoFetchVisibility();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);

  // Background Helper (Duplicate logic for now, ideally shared)
  const getBg = (darkHex: string) => {
      if (!darkMode) return `rgba(255, 255, 255, ${opacity})`;
      const hex = darkHex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };
  const bgMain = getBg('#141414');
  const overlayTheme = useMemo(
      () => buildOverlayWorkbenchTheme(darkMode, { disableBackdropFilter: disableLocalBackdropFilter }),
      [darkMode, disableLocalBackdropFilter],
  );
  const modalPanelStyle = useMemo(() => ({
      background: overlayTheme.shellBg,
      border: overlayTheme.shellBorder,
      boxShadow: overlayTheme.shellShadow,
      backdropFilter: overlayTheme.shellBackdropFilter,
  }), [overlayTheme]);
  const modalSectionStyle = useMemo(() => ({
      padding: 14,
      borderRadius: 14,
      border: overlayTheme.sectionBorder,
      background: overlayTheme.sectionBg,
  }), [overlayTheme]);
  const modalScrollSectionStyle = useMemo(() => ({
      maxHeight: 400,
      overflow: 'auto' as const,
      border: overlayTheme.sectionBorder,
      borderRadius: 14,
      padding: 12,
      background: overlayTheme.sectionBg,
  }), [overlayTheme]);
  const modalHintTextStyle = useMemo(() => ({
      color: overlayTheme.mutedText,
      fontSize: 12,
      lineHeight: 1.6,
  }), [overlayTheme]);
  const renderSidebarModalTitle = (icon: React.ReactNode, title: string, description: string) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 12, display: 'grid', placeItems: 'center', background: overlayTheme.iconBg, color: overlayTheme.iconColor, flexShrink: 0 }}>
              {icon}
          </div>
          <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>{title}</div>
              <div style={{ marginTop: 4, color: overlayTheme.mutedText, fontSize: 12, lineHeight: 1.6 }}>{description}</div>
          </div>
      </div>
  );
  const [searchValue, setSearchValue] = useState('');
  const [searchScopes, setSearchScopes] = useState<SearchScope[]>(['smart']);
  const [isSearchScopePopoverOpen, setIsSearchScopePopoverOpen] = useState(false);
  const searchInputRef = useRef<InputRef>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const [loadedKeys, setLoadedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const selectedNodesRef = useRef<TreeNode[]>([]);
  const loadingNodesRef = useRef<Set<string>>(new Set());
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const externalSqlUploadInputRef = useRef<HTMLInputElement | null>(null);
  const openSqlUploadInputRef = useRef<HTMLInputElement | null>(null);
  const pendingExternalSqlUploadRef = useRef<{ connectionId: string; dbName: string; dbNodeKey: string; directoryPath: string } | null>(null);
  const pendingOpenSqlContextRef = useRef<{ connectionId: string; dbName?: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, items: MenuProps['items'] } | null>(null);
  
  // Virtual Scroll State
  const [treeHeight, setTreeHeight] = useState(500);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<RcTree>(null);

  useEffect(() => {
      if (!treeContainerRef.current) return;
      const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
              setTreeHeight(entry.contentRect.height);
          }
      });
      resizeObserver.observe(treeContainerRef.current);
      return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
      const handleFocusSidebarSearch = () => {
          const inputEl = searchInputRef.current?.input as HTMLInputElement | undefined;
          if (!inputEl) {
              return;
          }
          inputEl.focus();
          inputEl.select();
      };
      window.addEventListener('javanavi:focus-sidebar-search', handleFocusSidebarSearch as EventListener);
      return () => {
          window.removeEventListener('javanavi:focus-sidebar-search', handleFocusSidebarSearch as EventListener);
      };
  }, []);
  
  // Connection Status State: key -> 'success' | 'error'
  const [connectionStates, setConnectionStates] = useState<Record<string, 'success' | 'error'>>({});

  // Create Database Modal
  const [isCreateDbModalOpen, setIsCreateDbModalOpen] = useState(false);
  const [createDbForm] = Form.useForm();
  const [targetConnection, setTargetConnection] = useState<TreeNode | null>(null);
  const [isRenameDbModalOpen, setIsRenameDbModalOpen] = useState(false);
  const [renameDbForm] = Form.useForm();
  const [renameDbTarget, setRenameDbTarget] = useState<TreeNode | null>(null);
  const [isRenameTableModalOpen, setIsRenameTableModalOpen] = useState(false);
  const [renameTableForm] = Form.useForm();
  const [renameTableTarget, setRenameTableTarget] = useState<TreeNode | null>(null);
  const [isRenameViewModalOpen, setIsRenameViewModalOpen] = useState(false);
  const [renameViewForm] = Form.useForm();
  const [renameViewTarget, setRenameViewTarget] = useState<TreeNode | null>(null);

  // Connection Tag Modals
  const [isCreateTagModalOpen, setIsCreateTagModalOpen] = useState(false);
  const [createTagForm] = Form.useForm();

  // Batch Operations Modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchTables, setBatchTables] = useState<BatchObjectItem[]>([]);
  const [checkedTableKeys, setCheckedTableKeys] = useState<string[]>([]);
  const [batchDbContext, setBatchDbContext] = useState<SidebarBatchDbContext>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [availableDatabases, setAvailableDatabases] = useState<SidebarAvailableDatabase[]>([]);
  const [batchFilterKeyword, setBatchFilterKeyword] = useState<string>('');
  const [batchFilterType, setBatchFilterType] = useState<BatchObjectFilterType>('all');
  const [batchSelectionScope, setBatchSelectionScope] = useState<BatchSelectionScope>('filtered');
  const filteredBatchObjects = useMemo(() => {
      const keyword = batchFilterKeyword.trim().toLowerCase();
      return batchTables.filter((item) => {
          if (batchFilterType !== 'all' && item.objectType !== batchFilterType) {
              return false;
          }
          if (!keyword) {
              return true;
          }
          return item.title.toLowerCase().includes(keyword) || item.objectName.toLowerCase().includes(keyword);
      });
  }, [batchFilterKeyword, batchFilterType, batchTables]);
  const groupedBatchObjects = useMemo(() => {
      const tables = filteredBatchObjects.filter(item => item.objectType === 'table');
      const views = filteredBatchObjects.filter(item => item.objectType === 'view');
      return { tables, views };
  }, [filteredBatchObjects]);
  const allBatchObjectKeys = useMemo(() => batchTables.map(item => item.key), [batchTables]);
  const allBatchObjectKeysByType = useMemo(() => {
      if (batchFilterType === 'all') {
          return allBatchObjectKeys;
      }
      return batchTables
          .filter((item) => item.objectType === batchFilterType)
          .map((item) => item.key);
  }, [allBatchObjectKeys, batchFilterType, batchTables]);
  const filteredBatchObjectKeys = useMemo(() => filteredBatchObjects.map(item => item.key), [filteredBatchObjects]);
  const selectionScopeTargetKeys = useMemo(
      () => (batchSelectionScope === 'filtered' ? filteredBatchObjectKeys : allBatchObjectKeysByType),
      [allBatchObjectKeysByType, batchSelectionScope, filteredBatchObjectKeys]
  );
  useEffect(() => {
      if (batchFilterType === 'all') {
          return;
      }
      const allowed = new Set(allBatchObjectKeysByType);
      setCheckedTableKeys((prev) => prev.filter((key) => allowed.has(key)));
  }, [allBatchObjectKeysByType, batchFilterType]);

  // Batch Database Operations Modal
  const [isBatchDbModalOpen, setIsBatchDbModalOpen] = useState(false);
  const [batchDatabases, setBatchDatabases] = useState<SidebarBatchDatabase[]>([]);
  const [checkedDbKeys, setCheckedDbKeys] = useState<string[]>([]);
  const [batchConnContext, setBatchConnContext] = useState<SavedConnection | null>(null);
  const [selectedDbConnection, setSelectedDbConnection] = useState<string>('');

  // Find in Database Modal
  const [findInDbContext, setFindInDbContext] = useState<{ open: boolean; connectionId: string; dbName: string }>({ open: false, connectionId: '', dbName: '' });

  useEffect(() => {
      if (!autoFetchVisible) {
          return;
      }

      expandedKeys.forEach(key => {
          const node = findTreeNodeByKey(treeData, key);
          if (node && node.type === 'database') {
              loadTables(node);
          }
      });
  }, [autoFetchVisible, savedQueries]);

  useEffect(() => {
    setTreeData((prev) => {
      const prevMap = new Map<string, TreeNode>();

      // We need to recursively extract connections from old tag structures
      // so if a user expands a connection that was tagged, the state remains
      const recurseCollect = (nodes: TreeNode[]) => {
          nodes.forEach((node) => {
            if (node.type === 'tag') {
               if (node.children) recurseCollect(node.children);
            } else if (node.type === 'connection') {
               prevMap.set(String(node.key), node);
            }
          });
      };
      recurseCollect(prev);

      const buildConnectionNode = (conn: SavedConnection): TreeNode => {
        const existing = prevMap.get(conn.id);
        const iconType = resolveConnectionIconType(conn);
        const iconColor = resolveConnectionAccentColor(conn);
        return {
          title: conn.name,
          key: conn.id,
          icon: getDbIcon(iconType, iconColor, 22),
          type: 'connection',
          dataRef: conn,
          isLeaf: false,
          children: existing?.children,
        } as TreeNode;
      };

      const taggedConnIds = new Set<string>();
      const tagNodes: TreeNode[] = connectionTags.map((tag) => {
        tag.connectionIds.forEach(id => taggedConnIds.add(id));
        return {
          title: tag.name,
          key: `tag-${tag.id}`,
          icon: <FolderOutlined style={{ color: '#faad14' }} />,
          type: 'tag',
          dataRef: tag,
          isLeaf: false,
          children: tag.connectionIds
            .map(cid => connections.find(c => c.id === cid))
            .filter(Boolean)
            .map(conn => buildConnectionNode(conn!)),
        } as TreeNode;
      });

      const ungroupedNodes: TreeNode[] = connections
        .filter(c => !taggedConnIds.has(c.id))
        .map(conn => buildConnectionNode(conn));

      return [...tagNodes, ...ungroupedNodes];
    });
  }, [connections, connectionTags]);

  const handleDuplicateConnection = async (conn: SavedConnection) => {
    if (!conn?.id) return;

    try {
      const duplicatedConnection = await DuplicateConnection(conn.id);
      if (!duplicatedConnection) {
        throw new Error(t('sidebar.msg.copyConnError'));
      }
      addConnection(duplicatedConnection as SavedConnection);
      message.success(t('sidebar.msg.copyConnSuccess', { name: duplicatedConnection.name }));
    } catch (error: unknown) {
      message.error(getErrorMessage(error) || t('sidebar.msg.copyConnError'));
    }
  };
  const updateTreeData = (list: TreeNode[], key: React.Key, children: TreeNode[] | undefined): TreeNode[] => {
    return list.map(node => {
      if (node.key === key) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeData(node.children, key, children) };
      }
      return node;
    });
  };

  const findTreeNodeByKey = (nodes: TreeNode[], targetKey: React.Key): TreeNode | null => {
    for (const node of nodes) {
      if (node.key === targetKey) {
        return node;
      }
      if (node.children) {
        const child = findTreeNodeByKey(node.children, targetKey);
        if (child) {
          return child;
        }
      }
    }
    return null;
  };

  const decorateExternalSQLTreeNode = (node: ExternalSQLTreeNode): TreeNode => {
    const icon = (() => {
      switch (node.type) {
        case 'external-sql-root':
          return <FolderOpenOutlined />;
        case 'external-sql-folder':
          return <FolderOutlined />;
        default:
          return <FileTextOutlined />;
      }
    })();

    return {
      ...node,
      icon,
      children: node.children?.map((child) => decorateExternalSQLTreeNode(child)),
    };
  };

  const getNodeDatabaseContext = (node: TreeNode | SidebarEventNode | null | undefined): { connectionId: string; dbName: string; dbNodeKey: string } | null => {
    if (!node) return null;
    const dataRef = getSidebarDataRef(node);
    if (node.type === 'database') {
      return {
        connectionId: String(dataRef.id || '').trim(),
        dbName: String(dataRef.dbName || '').trim(),
        dbNodeKey: getSidebarNodeKeyText(node),
      };
    }

    if (
      node.type === 'external-sql-root'
      || node.type === 'external-sql-folder'
      || node.type === 'external-sql-file'
    ) {
      return {
        connectionId: String(dataRef.connectionId || '').trim(),
        dbName: String(dataRef.dbName || '').trim(),
        dbNodeKey: String(dataRef.dbNodeKey || '').trim(),
      };
    }

    return null;
  };

  const queryMetadataRowsBySpecs = async (
      conn: SavedConnection,
      dbName: string,
      specs: MetadataQuerySpec[]
  ): Promise<{ results: MetadataQueryResult[]; hasSuccessfulQuery: boolean }> => {
      const normalizedSpecs = normalizeMetadataQuerySpecs(specs);
      if (normalizedSpecs.length === 0) {
          return { results: [], hasSuccessfulQuery: false };
      }
      const config = buildRuntimeConfig(conn, dbName);
      const results: MetadataQueryResult[] = [];
      let hasSuccessfulQuery = false;

      for (const spec of normalizedSpecs) {
          try {
              const result = await DBQuery(config, dbName, spec.sql);
              if (!result.success || !Array.isArray(result.data)) {
                  continue;
              }
              hasSuccessfulQuery = true;
              results.push({
                  rows: result.data as MetadataRow[],
                  inferredType: spec.inferredType,
              });
          } catch {
              // 忽略单条查询失败，继续尝试后续回退语句
          }
      }
      return { results, hasSuccessfulQuery };
  };

  const loadViews = async (conn: SavedConnection, dbName: string): Promise<{ views: string[]; supported: boolean }> => {
      const dialect = getMetadataDialect(conn);
      const querySpecs = buildViewsMetadataQuerySpecs(dialect, dbName);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const views: string[] = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const tableType = getCaseInsensitiveValue(row, ['table_type', 'table type', 'type']);
              if (tableType && tableType.toUpperCase() !== 'VIEW') return;
              const schemaName = getCaseInsensitiveValue(row, ['schema_name', 'schemaname', 'owner', 'table_schema', 'db']);
              const viewName =
                  getCaseInsensitiveValue(row, ['view_name', 'viewname', 'table_name', 'name'])
                  || getMySQLShowTablesName(row)
                  || getFirstRowValue(row);
              const fullName = normalizeSidebarViewName(dialect, dbName, schemaName, viewName);
              if (!fullName || seen.has(fullName)) return;
              seen.add(fullName);
              views.push(fullName);
          });
      });
      return { views, supported: hasSuccessfulQuery };
  };

  const loadDatabaseTriggers = async (
      conn: SavedConnection,
      dbName: string
  ): Promise<{ triggers: Array<{ displayName: string; triggerName: string; tableName: string }>; supported: boolean }> => {
      const dialect = getMetadataDialect(conn);
      const querySpecs = buildTriggersMetadataQuerySpecs(dialect, dbName);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const triggers: Array<{ displayName: string; triggerName: string; tableName: string }> = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const rawTriggerName = getCaseInsensitiveValue(row, ['trigger_name', 'triggername', 'trigger', 'name']) || getFirstRowValue(row);
              if (!rawTriggerName) return;

              const rawSchemaName = getCaseInsensitiveValue(row, ['schema_name', 'schemaname', 'owner', 'event_object_schema', 'trigger_schema', 'db']);
              const rawTableName = getCaseInsensitiveValue(row, ['table_name', 'event_object_table', 'tbl_name', 'table']);

              const triggerParts = splitQualifiedName(rawTriggerName);
              const tableParts = splitQualifiedName(rawTableName);

              const resolvedSchema = (
                  rawSchemaName
                  || tableParts.schemaName
                  || triggerParts.schemaName
                  || dbName
              ).trim();
              const resolvedTriggerName = (triggerParts.objectName || rawTriggerName).trim();
              const resolvedTableName = (tableParts.objectName || rawTableName).trim();
              const fullTableName = buildQualifiedName(resolvedSchema, resolvedTableName);

              // MySQL 下 trigger 名在同 schema 内唯一，直接按 schema+trigger 去重可彻底规避多元数据查询导致的重复
              const uniqueKey = dialect === 'mysql'
                  ? `${resolvedSchema.toLowerCase()}@@${resolvedTriggerName.toLowerCase()}`
                  : `${resolvedSchema.toLowerCase()}@@${resolvedTriggerName.toLowerCase()}@@${resolvedTableName.toLowerCase()}`;
              if (seen.has(uniqueKey)) return;
              seen.add(uniqueKey);
              const displayName = fullTableName ? `${resolvedTriggerName} (${fullTableName})` : resolvedTriggerName;
              triggers.push({ displayName, triggerName: resolvedTriggerName, tableName: fullTableName || resolvedTableName });
          });
      });
      return { triggers, supported: hasSuccessfulQuery };
  };

  const loadFunctions = async (
      conn: SavedConnection,
      dbName: string
  ): Promise<{ routines: Array<{ displayName: string; routineName: string; routineType: string }>; supported: boolean }> => {
      const dialect = getMetadataDialect(conn);
      const querySpecs = buildFunctionsMetadataQuerySpecs(dialect, dbName);
      const { results, hasSuccessfulQuery } = await queryMetadataRowsBySpecs(conn, dbName, querySpecs);
      const seen = new Set<string>();
      const routines: Array<{ displayName: string; routineName: string; routineType: string }> = [];

      results.forEach((queryResult) => {
          queryResult.rows.forEach((row) => {
              const routineName = getCaseInsensitiveValue(row, ['routine_name', 'object_name', 'proname', 'name']);
              if (!routineName) return;
              const schemaName = getCaseInsensitiveValue(row, ['schema_name', 'nspname', 'owner', 'db', 'database']);
              const rawType = getCaseInsensitiveValue(row, ['routine_type', 'object_type', 'type']) || queryResult.inferredType || 'FUNCTION';
              const normalizedType = rawType.toUpperCase().includes('PROC') ? 'PROCEDURE' : 'FUNCTION';
              const fullName = buildQualifiedName(schemaName, routineName);
              const uniqueKey = `${fullName}@@${normalizedType}`;
              if (!fullName || seen.has(uniqueKey)) return;
              seen.add(uniqueKey);
              const typeLabel = normalizedType === 'PROCEDURE' ? 'P' : 'F';
              routines.push({ displayName: `${fullName} [${typeLabel}]`, routineName: fullName, routineType: normalizedType });
          });
      });
      return { routines, supported: hasSuccessfulQuery };
  };

	  const loadDatabases = async (node: SidebarLoadTreeNode) => {
	      if (node.key === undefined) return;
	      const nodeKey = node.key;
	      const conn = node.dataRef as SavedConnection;
	      const loadKey = `dbs-${conn.id}`;
	      if (loadingNodesRef.current.has(loadKey)) return;
	      loadingNodesRef.current.add(loadKey);
	      const config = {
	          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
	          useSSH: conn.config.useSSH || false,
	          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
	      };

          // Handle Redis connections differently
          if (conn.config.type === 'redis') {
              try {
                  const res = await RedisGetDatabases(buildRpcConnectionConfig(config));
                  if (res.success) {
                      setConnectionStates(prev => ({ ...prev, [conn.id]: 'success' }));
                      const redisRows: SidebarRedisDatabaseRow[] = Array.isArray(res.data) ? res.data as SidebarRedisDatabaseRow[] : [];
                      let dbs = redisRows.map((db) => {
                          const redisIndex = Number(db.index);
                          const redisKeys = Number(db.keys) || 0;
                          return {
                          title: `db${redisIndex}${redisKeys > 0 ? ` (${redisKeys})` : ''}`,
                          key: `${conn.id}-db${redisIndex}`,
                          icon: <DatabaseOutlined style={{ color: '#DC382D' }} />,
                          type: 'redis-db' as const,
                          dataRef: { ...conn, redisDB: redisIndex },
                          isLeaf: true,
                          dbIndex: redisIndex,
                      };
                      });
                      // Filter Redis databases if configured
                      if (conn.includeRedisDatabases && conn.includeRedisDatabases.length > 0) {
                          dbs = dbs.filter(db => conn.includeRedisDatabases!.includes(db.dbIndex));
                      }
	                      setTreeData(origin => updateTreeData(origin, nodeKey, dbs));
                  } else {
                      setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
                      message.error({ content: res.message, key: `conn-${conn.id}-dbs` });
                  }
              } catch (e: unknown) {
                  setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
                  message.error({ content: t('sidebar.msg.connFailed', { message: getErrorMessage(e) }), key: `conn-${conn.id}-dbs` });
              } finally {
                  loadingNodesRef.current.delete(loadKey);
              }
              return;
          }

	      try {
	          const res = await DBGetDatabases(buildRpcConnectionConfig(config));
	          if (res.success) {
	            setConnectionStates(prev => ({ ...prev, [conn.id]: 'success' }));
                const dbRows: SidebarDatabaseRow[] = Array.isArray(res.data) ? res.data as SidebarDatabaseRow[] : [];
	            let dbs = dbRows.map((row) => ({
	              title: String(row.Database || row.database || '').trim(),
              key: `${conn.id}-${String(row.Database || row.database || '').trim()}`,
              icon: <DatabaseOutlined />,
              type: 'database' as const,
              dataRef: { ...conn, dbName: String(row.Database || row.database || '').trim() },
              isLeaf: false,
            }));

            // Filter databases if configured
            if (conn.includeDatabases && conn.includeDatabases.length > 0) {
                dbs = dbs.filter(db => conn.includeDatabases!.includes(db.title));
            }

            if (dbs.length > 0) {
	                setTreeData(origin => updateTreeData(origin, nodeKey, dbs));
            } else {
                // 空列表：清理 loadedKeys 以允许重新加载，不设置 children = []
                setLoadedKeys(prev => prev.filter(k => k !== node.key));
                message.warning({ content: t('sidebar.msg.noVisibleDb'), key: `conn-${conn.id}-dbs` });
            }
	          } else {
	            setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
	            setLoadedKeys(prev => prev.filter(k => k !== node.key));
	            message.error({ content: res.message, key: `conn-${conn.id}-dbs` });
	          }
	      } catch (e: unknown) {
	          setConnectionStates(prev => ({ ...prev, [conn.id]: 'error' }));
	          setLoadedKeys(prev => prev.filter(k => k !== node.key));
	          message.error({ content: t('sidebar.msg.connFailed', { message: getErrorMessage(e) }), key: `conn-${conn.id}-dbs` });
	      } finally {
	          loadingNodesRef.current.delete(loadKey);
	      }
  };


	  const loadTables = async (node: SidebarLoadTreeNode) => {
	      if (node.key === undefined) return;
	      const conn = node.dataRef as SavedConnection & { dbName: string }; // has dbName
	      const dbName = conn.dbName;
      const key = node.key;
      const loadKey = `tables-${conn.id}-${dbName}`;
      if (loadingNodesRef.current.has(loadKey)) return;
      loadingNodesRef.current.add(loadKey);
      
      const dbQueries = savedQueries.filter(q => q.connectionId === conn.id && q.dbName === dbName);
      const queriesNode: TreeNode = {
          title: t('sidebar.tree.savedQuery'),
          key: `${key}-queries`,
          icon: <FolderOpenOutlined />,
          type: 'queries-folder',
          isLeaf: dbQueries.length === 0,
          children: dbQueries.map(q => ({
              title: q.name,
              key: q.id,
              icon: <FileTextOutlined />,
              type: 'saved-query',
              dataRef: q,
              isLeaf: true
          }))
      };

      const config = { 
          ...conn.config, 
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
	          useSSH: conn.config.useSSH || false,
	          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
	      };
	      try {
	          const res = await DBGetSchemaObjects(buildRpcConnectionConfig(config), conn.dbName);
	          if (res.success) {
	            setConnectionStates(prev => ({ ...prev, [key as string]: 'success' }));

                const objectRows: SchemaObjectRow[] = Array.isArray(res.data) ? res.data as SchemaObjectRow[] : [];
                const baseTableRows = objectRows.filter((row) => !isSchemaViewObject(row));
	            const tableEntries = baseTableRows.map((row) => {
	                const tableName = schemaObjectName(row);
	                const parsed = splitQualifiedName(tableName);
	                return { tableName, schemaName: parsed.schemaName || String(row?.schemaName || '').trim(), displayName: getSidebarTableDisplayName(conn, tableName), comment: String(row?.comment || row?.tableComment || '').trim() };
	            });

                const metadataViewRows = objectRows
                    .filter(isSchemaViewObject)
                    .map(schemaObjectName)
                    .filter(Boolean);
	            const [viewsResult, triggersResult, routinesResult] = await Promise.all([
	                loadViews(conn, conn.dbName),
	                loadDatabaseTriggers(conn, conn.dbName),
	                loadFunctions(conn, conn.dbName),
	            ]);
                const workspaceRes = await ResolveSQLWorkspace(String(conn.id), String(conn.dbName));
                const workspacePayload = workspaceRes.success && workspaceRes.data && typeof workspaceRes.data === 'object'
                    ? workspaceRes.data as SidebarWorkspacePayload
                    : {};
                const workspacePath = String(workspacePayload.path || '').trim();
                const workspaceName = String(workspacePayload.name || t('sidebar.tree.sqlWorkspace')).trim() || t('sidebar.tree.sqlWorkspace');

                let externalSQLTreeEntries: ExternalSQLTreeEntry[] = [];
                if (!workspaceRes.success) {
                    message.warning({
                        key: `external-sql-${conn.id}-${conn.dbName}`,
                        content: t('sidebar.msg.workspaceLoadFailed', { message: workspaceRes.message }),
                    });
                } else if (workspacePath) {
                    const directoryRes = await ListSQLDirectory(workspacePath);
                    if (!directoryRes.success) {
                        message.warning({
                            key: `external-sql-${conn.id}-${conn.dbName}`,
                            content: t('sidebar.msg.workspaceReadFailed', { message: directoryRes.message }),
                        });
                    } else {
                        externalSQLTreeEntries = Array.isArray(directoryRes.data) ? directoryRes.data as ExternalSQLTreeEntry[] : [];
                    }
                }
                const externalSQLRootNode = decorateExternalSQLTreeNode(buildExternalSQLRootNode({
                    dbNodeKey: String(key),
                    connectionId: String(conn.id),
                    dbName: String(conn.dbName),
                    workspacePath,
                    workspaceName,
                    directoryTree: externalSQLTreeEntries,
                    language,
                }));

            const viewRows: string[] = Array.from(new Set([
                ...metadataViewRows,
                ...(Array.isArray(viewsResult.views) ? viewsResult.views : []),
            ]));
            const triggerRows = Array.isArray(triggersResult.triggers) ? triggersResult.triggers as Array<{ displayName: string; triggerName: string; tableName: string }> : [];
            const routineRows = Array.isArray(routinesResult.routines) ? routinesResult.routines as Array<{ displayName: string; routineName: string; routineType: string }> : [];

            const viewEntries = viewRows.map((viewName: string) => {
                const parsed = splitQualifiedName(viewName);
                return {
                    viewName,
	                    schemaName: parsed.schemaName,
	                    displayName: getSidebarTableDisplayName(conn, viewName),
	                };
	            });

            const triggerEntries = (() => {
                const deduped: Array<{ displayName: string; triggerName: string; tableName: string; schemaName: string }> = [];
                const triggerSeen = new Set<string>();
                const metadataDialect = getMetadataDialect(conn as SavedConnection);

                triggerRows.forEach((trigger) => {
                    const triggerParsed = splitQualifiedName(trigger.triggerName);
                    const tableParsed = splitQualifiedName(trigger.tableName);
                    const schemaName = tableParsed.schemaName || triggerParsed.schemaName || String(conn.dbName || '').trim();
                    const triggerObjectName = (triggerParsed.objectName || trigger.triggerName).trim();
                    const tableObjectName = (tableParsed.objectName || trigger.tableName).trim();
                    const displayName = tableObjectName ? `${triggerObjectName} (${tableObjectName})` : triggerObjectName;
                    const dedupeKey = metadataDialect === 'mysql'
                        ? `${schemaName.toLowerCase()}@@${triggerObjectName.toLowerCase()}`
                        : `${schemaName.toLowerCase()}@@${triggerObjectName.toLowerCase()}@@${tableObjectName.toLowerCase()}`;

                    if (triggerSeen.has(dedupeKey)) return;
                    triggerSeen.add(dedupeKey);
                    deduped.push({
                        ...trigger,
                        schemaName,
                        triggerName: triggerObjectName,
                        tableName: buildQualifiedName(schemaName, tableObjectName) || tableObjectName,
                        displayName,
                    });
                });

                return deduped;
            })();

            const routineEntries = routineRows.map((routine) => {
                const parsed = splitQualifiedName(routine.routineName);
                const typeLabel = routine.routineType === 'PROCEDURE' ? 'P' : 'F';
                return {
	                    ...routine,
	                    schemaName: parsed.schemaName,
                    displayName: `${parsed.objectName || routine.routineName} [${typeLabel}]`,
                };
            });

            if (isSphinxConnection(conn as SavedConnection)) {
                const unsupportedObjects: string[] = [];
                if (!viewsResult.supported) unsupportedObjects.push(t('sidebar.tree.views'));
                if (!routinesResult.supported) unsupportedObjects.push(`${t('sidebar.tree.function')}/${t('sidebar.tree.procedure')}`);
                if (!triggersResult.supported) unsupportedObjects.push(t('sidebar.tree.triggers'));
                if (unsupportedObjects.length > 0) {
                    message.info({
                        key: `sphinx-capability-${conn.id}-${conn.dbName}`,
                        content: t('sidebar.msg.sphinxUnsupported', { objects: unsupportedObjects.join(t('ai.welcome.tableJoiner')) }),
                    });
                }
            }

	            // 获取当前数据库的排序偏好
	            const sortPreferenceKey = `${conn.id}-${conn.dbName}`;
	            const sortBy = tableSortPreference[sortPreferenceKey] || 'name';

	            // 根据排序偏好排序表
	            if (sortBy === 'frequency') {
	                // 按使用频率排序（降序）
	                tableEntries.sort((a, b) => {
	                    const keyA = `${conn.id}-${conn.dbName}-${a.tableName}`;
	                    const keyB = `${conn.id}-${conn.dbName}-${b.tableName}`;
	                    const countA = tableAccessCount[keyA] || 0;
	                    const countB = tableAccessCount[keyB] || 0;
	                    if (countA !== countB) {
	                        return countB - countA;
	                    }
	                    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
	                });
	            } else {
	                tableEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));
	            }

	            // Sort views by name (case-insensitive)
	            viewEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

	            // Sort triggers by display name (case-insensitive)
	            triggerEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

	            // Sort routines by display name (case-insensitive)
	            routineEntries.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

	            const buildTableNode = (entry: { tableName: string; schemaName: string; displayName: string; comment?: string }): TreeNode => ({
	                title: entry.displayName,
	                key: `${conn.id}-${conn.dbName}-${entry.tableName}`,
	                icon: <TableOutlined />,
	                type: 'table',
	                dataRef: { ...conn, tableName: entry.tableName, schemaName: entry.schemaName, comment: entry.comment },
	                isLeaf: false,
	            });

	            const buildViewNode = (entry: { viewName: string; schemaName: string; displayName: string }): TreeNode => ({
	                title: entry.displayName,
	                key: `${conn.id}-${conn.dbName}-view-${entry.viewName}`,
	                icon: <EyeOutlined />,
	                type: 'view',
	                dataRef: { ...conn, viewName: entry.viewName, tableName: entry.viewName, schemaName: entry.schemaName },
	                isLeaf: true,
	            });

	            const buildTriggerNode = (entry: { triggerName: string; tableName: string; schemaName: string; displayName: string }): TreeNode => ({
	                title: entry.displayName,
	                key: `${conn.id}-${conn.dbName}-trigger-${entry.triggerName}-${entry.tableName}`,
	                icon: <FunctionOutlined />,
	                type: 'db-trigger',
	                dataRef: { ...conn, triggerName: entry.triggerName, triggerTableName: entry.tableName, schemaName: entry.schemaName },
	                isLeaf: true,
	            });

	            const buildRoutineNode = (entry: { routineName: string; routineType: string; schemaName: string; displayName: string }): TreeNode => ({
	                title: entry.displayName,
	                key: `${conn.id}-${conn.dbName}-routine-${entry.routineName}`,
	                icon: <CodeOutlined />,
	                type: 'routine',
	                dataRef: { ...conn, routineName: entry.routineName, routineType: entry.routineType, schemaName: entry.schemaName },
	                isLeaf: true,
	            });

	            const buildObjectGroup = (
	                parentKey: string,
	                groupKey: string,
	                groupTitle: string,
	                groupIcon: React.ReactNode,
	                children: TreeNode[],
	                extraData: SidebarDataRef = {}
	            ): TreeNode => ({
	                title: `${groupTitle} (${children.length})`,
	                key: `${parentKey}-${groupKey}`,
	                icon: groupIcon,
	                type: 'object-group',
	                isLeaf: children.length === 0,
	                children: children.length > 0 ? children : undefined,
	                dataRef: { ...conn, dbName: conn.dbName, groupKey, ...extraData }
	            });

	            const shouldGroupBySchema = shouldHideSchemaPrefix(conn as SavedConnection);
	            if (shouldGroupBySchema) {
	                type SchemaBucket = {
	                    schemaName: string;
	                    tables: TreeNode[];
	                    views: TreeNode[];
	                    routines: TreeNode[];
	                    triggers: TreeNode[];
	                };

	                const schemaMap = new Map<string, SchemaBucket>();
	                const getSchemaBucket = (rawSchemaName: string): SchemaBucket => {
	                    const schemaName = String(rawSchemaName || '').trim();
	                    const schemaKey = schemaName || '__default__';
	                    let bucket = schemaMap.get(schemaKey);
	                    if (!bucket) {
	                        bucket = {
	                            schemaName,
	                            tables: [],
	                            views: [],
	                            routines: [],
	                            triggers: [],
	                        };
	                        schemaMap.set(schemaKey, bucket);
	                    }
	                    return bucket;
	                };

	                tableEntries.forEach((entry) => getSchemaBucket(entry.schemaName).tables.push(buildTableNode(entry)));
	                viewEntries.forEach((entry) => getSchemaBucket(entry.schemaName).views.push(buildViewNode(entry)));
	                routineEntries.forEach((entry) => getSchemaBucket(entry.schemaName).routines.push(buildRoutineNode(entry)));
	                triggerEntries.forEach((entry) => getSchemaBucket(entry.schemaName).triggers.push(buildTriggerNode(entry)));

	                const dialect = getMetadataDialect(conn as SavedConnection);
	                const isOracleLike = (dialect === 'oracle' || dialect === 'dm');

	                const schemaNodes: TreeNode[] = Array.from(schemaMap.values())
	                    .filter((bucket) => !(isOracleLike && !bucket.schemaName))
	                    .sort((a, b) => {
	                        if (!a.schemaName && !b.schemaName) return 0;
	                        if (!a.schemaName) return -1;
	                        if (!b.schemaName) return 1;
	                        return a.schemaName.toLowerCase().localeCompare(b.schemaName.toLowerCase());
	                    })
	                    .map((bucket) => {
	                    const schemaNodeKey = `${key}-schema-${bucket.schemaName || 'default'}`;
	                    const schemaTitle = bucket.schemaName || t('sidebar.tree.defaultSchema');
	                        const groupedNodes: TreeNode[] = [
	                            buildObjectGroup(schemaNodeKey, 'tables', t('sidebar.tree.tables'), <TableOutlined />, bucket.tables, { schemaName: bucket.schemaName }),
	                            buildObjectGroup(schemaNodeKey, 'views', t('sidebar.tree.views'), <EyeOutlined />, bucket.views, { schemaName: bucket.schemaName }),
	                            buildObjectGroup(schemaNodeKey, 'routines', t('sidebar.tree.routines'), <CodeOutlined />, bucket.routines, { schemaName: bucket.schemaName }),
	                            buildObjectGroup(schemaNodeKey, 'triggers', t('sidebar.tree.triggers'), <FunctionOutlined />, bucket.triggers, { schemaName: bucket.schemaName }),
	                        ];

	                        return {
	                            title: schemaTitle,
	                            key: schemaNodeKey,
	                            icon: <FolderOpenOutlined />,
	                            type: 'object-group' as const,
	                            isLeaf: groupedNodes.length === 0,
	                            children: groupedNodes,
	                            dataRef: { ...conn, dbName: conn.dbName, groupKey: 'schema', schemaName: bucket.schemaName }
	                        };
	                    });

	                setTreeData(origin => updateTreeData(origin, key, [queriesNode, externalSQLRootNode, ...schemaNodes]));
	            } else {
	                const groupedNodes: TreeNode[] = [
	                    buildObjectGroup(key as string, 'tables', t('sidebar.tree.tables'), <TableOutlined />, tableEntries.map(buildTableNode)),
	                    buildObjectGroup(key as string, 'views', t('sidebar.tree.views'), <EyeOutlined />, viewEntries.map(buildViewNode)),
	                    buildObjectGroup(key as string, 'routines', t('sidebar.tree.routines'), <CodeOutlined />, routineEntries.map(buildRoutineNode)),
	                    buildObjectGroup(key as string, 'triggers', t('sidebar.tree.triggers'), <FunctionOutlined />, triggerEntries.map(buildTriggerNode)),
	                ];

	                setTreeData(origin => updateTreeData(origin, key, [queriesNode, externalSQLRootNode, ...groupedNodes]));
	            }
	          } else {
	            setConnectionStates(prev => ({ ...prev, [key as string]: 'error' }));
	            message.error({ content: res.message, key: `db-${key}-tables` });
          }
	      } catch (e: unknown) {
	          setConnectionStates(prev => ({ ...prev, [key as string]: 'error' }));
	          message.error({ content: t('sidebar.msg.loadTablesFailed', { message: getErrorMessage(e) }), key: `db-${key}-tables` });
	      } finally {
	          loadingNodesRef.current.delete(loadKey);
	      }
  };

  const onLoadData = async ({ key, children, dataRef, type }: SidebarEventNode) => {
    if (type === 'tag') return;
    if (children) return;

    if (type === 'connection') {
        await loadDatabases({ key, dataRef });
    } else if (type === 'database') {
        await loadTables({ key, dataRef });
    } else if (type === 'table') {
        // Expand table to show object categories
        const conn = dataRef; 

        const folders: TreeNode[] = [
            {
                title: t('sidebar.tree.columns'),
                key: `${key}-columns`,
                icon: <UnorderedListOutlined />,
                type: 'folder-columns',
                isLeaf: true,
                dataRef: conn
            },
            {
                title: t('sidebar.tree.indexes'),
                key: `${key}-indexes`,
                icon: <KeyOutlined style={{ transform: 'rotate(45deg)' }} />,
                type: 'folder-indexes',
                isLeaf: true,
                dataRef: conn
            },
            {
                title: t('sidebar.tree.foreignKeys'),
                key: `${key}-fks`,
                icon: <LinkOutlined />,
                type: 'folder-fks',
                isLeaf: true,
                dataRef: conn
            },
            {
                title: t('sidebar.tree.triggers'),
                key: `${key}-triggers`,
                icon: <ThunderboltOutlined />,
                type: 'folder-triggers',
                isLeaf: true,
                dataRef: conn
            }
        ];
        
        setTreeData(origin => updateTreeData(origin, key, folders));
    }
  };

  const openDesign = (node: TreeNode | SidebarEventNode, initialTab: string, readOnly: boolean = false) => {
      const dataRef = getSidebarDataRef(node);
      const tableName = String(dataRef.tableName || '');
      const dbName = String(dataRef.dbName || '');
      const id = String(dataRef.id || '');
      addTab({
          id: `design-${id}-${dbName}-${tableName}`,
          title: readOnly ? t('sidebar.tree.tableStructure', { name: tableName }) : t('sidebar.tree.designTable', { name: tableName }),
          type: 'design',
          connectionId: id,
          dbName: dbName,
          tableName: tableName,
          initialTab: initialTab,
          readOnly: readOnly
      });
  };

  const openNewTableDesign = (node: TreeNode | SidebarEventNode) => {
      const dataRef = getSidebarDataRef(node);
      const dbName = String(dataRef.dbName || '');
      const id = String(dataRef.id || '');
      addTab({
          id: `new-table-${id}-${dbName}-${Date.now()}`,
          title: t('sidebar.tree.newTable', { name: dbName }),
          type: 'design',
          connectionId: id,
          dbName: dbName,
          tableName: '', // Empty tableName signals creation mode
          initialTab: 'columns',
          readOnly: false
      });
  };

  const onSelect = (keys: React.Key[], info: SidebarSelectInfo) => {
      setSelectedKeys(keys);
      selectedNodesRef.current = info.selectedNodes || [];

      if (keys.length === 0) {
          setActiveContext(null);
          return;
      }
      if (!info.selected) return;

      const { type, key } = info.node;
      const dataRef = getSidebarDataRef(info.node);

      // Update active context
      if (type === 'connection') {
          setActiveContext({ connectionId: String(key), dbName: '' });
      } else if (type === 'database') {
          setActiveContext({ connectionId: String(dataRef.id || ''), dbName: String(dataRef.dbName || '') });
      } else if (type === 'table') {
          setActiveContext({ connectionId: String(dataRef.id || ''), dbName: String(dataRef.dbName || '') });
      } else if (type === 'view' || type === 'db-trigger' || type === 'routine') {
          setActiveContext({ connectionId: String(dataRef.id || ''), dbName: String(dataRef.dbName || '') });
      } else if (type === 'saved-query') {
          setActiveContext({ connectionId: String(dataRef.connectionId || ''), dbName: String(dataRef.dbName || '') });
      } else if (type === 'external-sql-root' || type === 'external-sql-folder' || type === 'external-sql-file') {
          setActiveContext({ connectionId: String(dataRef.connectionId || ''), dbName: String(dataRef.dbName || '') });
      } else if (type === 'redis-db') {
          setActiveContext({ connectionId: String(dataRef.id || ''), dbName: `db${dataRef.redisDB}` });
      }

      if (type === 'folder-columns') openDesign(info.node, 'columns', false);
      else if (type === 'folder-indexes') openDesign(info.node, 'indexes', false);
      else if (type === 'folder-fks') openDesign(info.node, 'foreignKeys', false);
      else if (type === 'folder-triggers') openDesign(info.node, 'triggers', false);
      else if (type === 'object-group' && dataRef?.groupKey === 'tables') {
          // 单击延迟打开表概览，双击时会取消此定时器
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
          const id = String(dataRef.id || '');
          const gDbName = String(dataRef.dbName || '');
          const schemaName = String(dataRef.schemaName || '');
          clickTimerRef.current = setTimeout(() => {
              clickTimerRef.current = null;
              addTab({
                  id: `table-overview-${id}-${gDbName}${schemaName ? `-${schemaName}` : ''}`,
	                  title: t('sidebar.tree.tableOverview', { name: `${gDbName}${schemaName ? ` (${schemaName})` : ''}` }),
	                  type: 'table-overview',
	                  connectionId: id,
	                  dbName: gDbName,
	                  schemaName,
	              } as TableOverviewTabData);
          }, 250);
      }
  };

  const onExpand = (newExpandedKeys: React.Key[]) => {
    setExpandedKeys(newExpandedKeys);
    setAutoExpandParent(false);
  };

  const clearTreeClickTimer = () => { if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; } };   const handleCollapseTree = () => { clearTreeClickTimer(); setExpandedKeys([]); setAutoExpandParent(false); message.success(t('sidebar.treeCollapse.done')); };
  const handleLocateActiveTable = () => {
      clearTreeClickTimer();
      return locateActiveSidebarTable({
          activeTab: tabs.find(tab => tab.id === activeTabId), getTreeData: () => treeData, loadDatabases, loadTables,
          setExpandedKeys, setAutoExpandParent, setSelectedKeys, setSearchValue, setActiveContext,
          scrollToKey: (key) => treeRef.current?.scrollTo?.({ key, align: 'top' }),
          notify: { info: message.info, warning: message.warning, success: message.success }, t,
      });
  };

  const handleSidebarTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      const isCopy = (event.ctrlKey || event.metaKey)
          && !event.altKey
          && !event.shiftKey
          && String(event.key || '').toLowerCase() === 'c';

      if (!isCopy) return;

      const selectedKey = selectedKeys[0];
      const node = selectedKey == null ? null : findTreeNodeByKey(treeData, selectedKey);
      const copyName = resolveCopyableSidebarNodeName(node);
      if (!copyName) return;

      event.preventDefault();
      void navigator.clipboard.writeText(copyName)
          .then(() => message.success(t('sidebar.msg.copyNameSuccess', { name: copyName })))
          .catch(() => message.error(t('sidebar.msg.copyNameFailed')));
  };

  const onDoubleClick = (_event: React.MouseEvent | null, node: SidebarEventNode) => {
      // 双击时取消单击延迟动作（如表概览打开），让双击只触发展开/折叠
      if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
      }
      const { type, key: nodeKey } = node;
      const dataRef = getSidebarDataRef(node);
      if (type === 'connection') setActiveContext({ connectionId: String(nodeKey), dbName: '' });
      else if (type === 'database') setActiveContext({ connectionId: String(dataRef.id || ''), dbName: String(dataRef.dbName || '') });
      else if (type === 'table' || type === 'view' || type === 'db-trigger' || type === 'routine') setActiveContext({ connectionId: String(dataRef.id || ''), dbName: String(dataRef.dbName || '') });
      else if (type === 'saved-query') setActiveContext({ connectionId: String(dataRef.connectionId || ''), dbName: String(dataRef.dbName || '') });
      else if (type === 'external-sql-root' || type === 'external-sql-folder' || type === 'external-sql-file') setActiveContext({ connectionId: String(dataRef.connectionId || ''), dbName: String(dataRef.dbName || '') });
      else if (type === 'redis-db') setActiveContext({ connectionId: String(dataRef.id || ''), dbName: `db${dataRef.redisDB}` });

      if (node.type === 'table') {
          const tableName = String(dataRef.tableName || '');
          const dbName = String(dataRef.dbName || '');
          const id = String(dataRef.id || '');
          // 记录表访问
          recordTableAccess(id, dbName, tableName);
          addTab({
              id: node.key,
              title: tableName,
              type: 'table',
              connectionId: id,
              dbName,
              tableName,
          });
          return;
      } else if (node.type === 'view') {
          const viewName = String(dataRef.viewName || '');
          const dbName = String(dataRef.dbName || '');
          const id = String(dataRef.id || '');
          addTab({
              id: node.key,
              title: viewName,
              type: 'table',
              connectionId: id,
              dbName,
              tableName: viewName,
          });
          return;
      } else if (node.type === 'saved-query') {
          const q = dataRef;
          addTab({
              id: String(q.id || ''),
              title: String(q.name || ''),
              type: 'query',
              connectionId: String(q.connectionId || ''),
              dbName: String(q.dbName || ''),
              query: String(q.sql || ''),
              savedQueryId: String(q.id || ''),
          });
          return;
      } else if (node.type === 'external-sql-file') {
          void openExternalSQLFile(node);
          return;
      } else if (node.type === 'redis-db') {
          const id = String(dataRef.id || '');
          const redisDB = Number(dataRef.redisDB) || 0;
          addTab({
              id: `redis-keys-${id}-db${redisDB}`,
              title: `db${redisDB}`,
              type: 'redis-keys',
              connectionId: id,
              redisDB: redisDB
          });
          return;
      } else if (node.type === 'db-trigger') {
          const triggerName = String(dataRef.triggerName || '');
          const dbName = String(dataRef.dbName || '');
          const id = String(dataRef.id || '');
          addTab({
              id: `trigger-${node.key}`,
              title: t('sidebar.tree.triggerDef', { name: triggerName }),
              type: 'trigger',
              connectionId: id,
              dbName,
              triggerName
          });
          return;
      } else if (node.type === 'routine') {
          const routineName = String(dataRef.routineName || '');
          const routineType = String(dataRef.routineType || '');
          const dbName = String(dataRef.dbName || '');
          const id = String(dataRef.id || '');
          const typeLabel = routineType === 'PROCEDURE' ? t('sidebar.tree.procedure') : t('sidebar.tree.function');
          addTab({
              id: `routine-def-${node.key}`,
              title: t('sidebar.tree.editRoutine', { type: typeLabel, name: routineName }),
              type: 'routine-def',
              connectionId: id,
              dbName,
              routineName,
              routineType
          });
          return;
      }

      const key = node.key;
      const isExpanded = expandedKeys.includes(key);
      const newExpandedKeys = isExpanded
          ? expandedKeys.filter(k => k !== key)
          : [...expandedKeys, key];

      setExpandedKeys(newExpandedKeys);
      if (!isExpanded) setAutoExpandParent(false);
  };
  
  const handleCopyStructure = async (node: TreeNode) => {
      const { config, dbName, tableName } = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const res = await DBShowCreateTable(buildRpcConnectionConfig(config), dbName, tableName || '');
      if (res.success) {
          navigator.clipboard.writeText(res.data as string);
          message.success(t('sidebar.msg.schemaCopied'));
      } else {
          message.error(res.message);
      }
  };

  const handleExport = async (node: TreeNode, format: string) => {
      const { config, dbName, tableName } = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const hide = message.loading(t('sidebar.msg.exportingTable', { name: tableName || '', format: format.toUpperCase() }), 0);
      const res = await ExportTable(buildRpcConnectionConfig(config), dbName, tableName || '', format);
      hide();
      if (res.success) {
          showExportSuccess(res);
      } else if (!isCancelledMessage(res.message)) {
          message.error(t('sidebar.msg.exportFailed', { message: res.message }));
      }
  };

  const normalizeConnConfig = (raw: SavedConnection['config']) => (
      buildRpcConnectionConfig(raw)
  );

  const handleExportDatabaseSQL = async (node: TreeNode, includeData: boolean) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const dbName = conn.dbName || String(node.title || '');
      const hide = message.loading(includeData ? t('sidebar.msg.backingUpDb', { name: dbName }) : t('sidebar.msg.exportingDbSchema', { name: dbName }), 0);
      try {
          const res = await ExportDatabaseSQL(normalizeConnConfig(conn.config), dbName, includeData);
          hide();
          if (res.success) {
              showExportSuccess(res);
          } else if (!isCancelledMessage(res.message)) {
              message.error(t('sidebar.msg.exportFailed', { message: res.message }));
          }
      } catch (e: unknown) {
          hide();
          message.error(t('sidebar.msg.exportFailed', { message: getErrorMessage(e) }));
      }
  };

  const handleExportTablesSQL = async (nodes: TreeNode[], includeData: boolean) => {
      if (!nodes || nodes.length === 0) return;
      const first = getSidebarDataRef<SidebarRuntimeNodeData>(nodes[0]);
      const dbName = first.dbName;
      const connId = first.id;
      const allSame = nodes.every((node) => {
          const dataRef = getSidebarDataRef<SidebarRuntimeNodeData>(node);
          return dataRef.id === connId && dataRef.dbName === dbName;
      });
      if (!allSame) {
          message.error(t('sidebar.msg.selectSameDb'));
          return;
      }

      const tableNames = nodes.map((node) => getSidebarDataRef<SidebarRuntimeNodeData>(node).tableName).filter((name): name is string => Boolean(name));
      const hide = message.loading(includeData ? t('sidebar.msg.backingUpTables', { count: tableNames.length }) : t('sidebar.msg.exportingTableSchema', { count: tableNames.length }), 0);
      try {
          const res = await ExportTablesSQL(normalizeConnConfig(first.config), dbName, tableNames, includeData);
          hide();
          if (res.success) {
              showExportSuccess(res);
          } else if (!isCancelledMessage(res.message)) {
              message.error(t('sidebar.msg.exportFailed', { message: res.message }));
          }
      } catch (e: unknown) {
          hide();
          message.error(t('sidebar.msg.exportFailed', { message: getErrorMessage(e) }));
      }
  };

  const openBatchOperationModal = async () => {
      // Check if current selected node is database or table
      let connId = '';
      let dbName = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          if (node.type === 'database') {
              connId = String(getSidebarDataRef(node).id || '');
              dbName = String(node.title || '');
          } else if (node.type === 'table' || node.type === 'view') {
              const dataRef = getSidebarDataRef(node);
              connId = String(dataRef.id || '');
              dbName = String(dataRef.dbName || '');
          }
      }

      setSelectedConnection(connId);
      setSelectedDatabase(dbName);
      setBatchTables([]);
      setCheckedTableKeys([]);
      setAvailableDatabases([]);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      if (connId) {
          const conn = connections.find(c => c.id === connId);
          if (conn) {
              await loadDatabasesForBatch(conn);
              if (dbName) {
                  await loadTablesForBatch(conn, dbName);
              }
          }
      }

      setIsBatchModalOpen(true);
  };

  const loadDatabasesForBatch = async (conn: SavedConnection) => {
      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const res = await DBGetDatabases(buildRpcConnectionConfig(config));
      if (res.success) {
          const dbRows: SidebarDatabaseRow[] = Array.isArray(res.data) ? res.data as SidebarDatabaseRow[] : [];
          let dbs = dbRows.map((row): SidebarAvailableDatabase => {
              const dbName = String(row.Database || row.database || "").trim();
              return {
                  title: dbName,
                  key: `${conn.id}-${dbName}`,
                  dbName: dbName
              };
          });

          if (conn.includeDatabases && conn.includeDatabases.length > 0) {
              dbs = dbs.filter(db => conn.includeDatabases!.includes(db.dbName));
          }

          setAvailableDatabases(dbs);
      } else {
          message.error(t('sidebar.msg.fetchDbFailed', { message: res.message }));
      }
  };

  const loadTablesForBatch = async (conn: SavedConnection, dbName: string) => {
      setBatchDbContext({ conn, dbName });

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const [res, viewResult] = await Promise.all([
          DBGetSchemaObjects(buildRpcConnectionConfig(config), dbName),
          loadViews(conn, dbName).catch(() => ({ views: [], supported: false })),
      ]);

      if (!res.success) {
          message.error(t('sidebar.msg.fetchTableListFailed', { message: res.message }));
          return;
      }

      const objectRows: SchemaObjectRow[] = Array.isArray(res.data) ? res.data as SchemaObjectRow[] : [];
      const metadataViewRows = objectRows
          .filter(isSchemaViewObject)
          .map(schemaObjectName)
          .filter(Boolean);
      const viewRows: string[] = Array.from(new Set([
          ...metadataViewRows,
          ...(Array.isArray(viewResult.views) ? viewResult.views : []),
      ]));

      const tableObjects: BatchObjectItem[] = objectRows
          .filter((row) => !isSchemaViewObject(row))
          .map(schemaObjectName)
          .filter(Boolean)
          .map((tableName: string) => ({
              title: getSidebarTableDisplayName(conn, tableName),
              key: `${conn.id}-${dbName}-table-${tableName}`,
              objectName: tableName,
              objectType: 'table' as const,
              dataRef: { ...conn, tableName, dbName, objectType: 'table' },
          }));

      const viewObjects: BatchObjectItem[] = viewRows.map((viewName: string) => ({
          title: getSidebarTableDisplayName(conn, viewName),
          key: `${conn.id}-${dbName}-view-${viewName}`,
          objectName: viewName,
          objectType: 'view' as const,
          dataRef: { ...conn, tableName: viewName, dbName, objectType: 'view' },
      }));

      tableObjects.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
      viewObjects.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));

      setBatchTables([...tableObjects, ...viewObjects]);
      setCheckedTableKeys([]);
  };

  const handleConnectionChange = async (connId: string) => {
      setSelectedConnection(connId);
      setSelectedDatabase('');
      setBatchTables([]);
      setCheckedTableKeys([]);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      const conn = connections.find(c => c.id === connId);
      if (conn) {
          await loadDatabasesForBatch(conn);
      }
  };

  const handleDatabaseChange = async (dbName: string) => {
      setSelectedDatabase(dbName);
      setBatchFilterKeyword('');
      setBatchFilterType('all');
      setBatchSelectionScope('filtered');

      const conn = connections.find(c => c.id === selectedConnection);
      if (conn && dbName) {
          await loadTablesForBatch(conn, dbName);
      }
  };

  const handleBatchExport = async (mode: BatchTableExportMode) => {
      const selectedObjects = batchTables.filter(t => checkedTableKeys.includes(t.key));
      if (selectedObjects.length === 0) {
          message.warning(t('sidebar.msg.selectAtLeastOne'));
          return;
      }

      setIsBatchModalOpen(false);

      if (!batchDbContext) return;
      const { conn, dbName } = batchDbContext;
      const objectNames = selectedObjects.map(t => t.objectName);
      const selectedViewCount = selectedObjects.filter(item => item.objectType === 'view').length;

      const loadingText = mode === 'backup'
          ? t('sidebar.msg.backingUpTables', { count: objectNames.length })
          : mode === 'dataOnly'
              ? t('sidebar.msg.exportingSelectedDataOnly', { count: objectNames.length })
              : t('sidebar.msg.exportingTableSchema', { count: objectNames.length });
      const hide = message.loading(loadingText, 0);
      try {
          const res = mode === 'dataOnly'
              ? await ExportTablesDataSQL(normalizeConnConfig(conn.config), dbName, objectNames)
              : await ExportTablesSQL(normalizeConnConfig(conn.config), dbName, objectNames, mode === 'backup');
          hide();
          if (res.success) {
              if (mode !== 'schema' && selectedViewCount > 0) {
                  showExportSuccess(res, t('sidebar.msg.exportSuccessSkippedViews', { count: selectedViewCount }));
              } else {
                  showExportSuccess(res);
              }
          } else if (!isCancelledMessage(res.message)) {
              message.error(t('sidebar.msg.exportFailed', { message: res.message }));
          }
      } catch (e: unknown) {
          hide();
          message.error(t('sidebar.msg.exportFailed', { message: getErrorMessage(e) }));
      }
  };

  const handleBatchClear = async () => {
      const selectedObjects = batchTables.filter(t => checkedTableKeys.includes(t.key));
      if (selectedObjects.length === 0) {
          message.warning(t('sidebar.msg.selectAtLeastOne'));
          return;
      }

      if (!batchDbContext) return;
      const { conn, dbName } = batchDbContext;
      const objectNames = selectedObjects.map(t => t.objectName);

      const ok = await new Promise<boolean>((resolve) => {
          Modal.confirm({
              title: t('sidebar.modal.confirmClearTables'),
              content: t('sidebar.modal.clearTablesContent', { connection: conn.name, database: dbName }),
              okText: t('sidebar.modal.continue'),
              cancelText: t('common.cancel'),
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
          });
      });
      if (!ok) return;

      setIsBatchModalOpen(false);
      const hide = message.loading(t('sidebar.msg.clearingTables', { count: objectNames.length }), 0);
      const startTime = Date.now();
      try {
          const res = await ClearTables(normalizeConnConfig(conn.config), dbName, objectNames);
          hide();
          const duration = Date.now() - startTime;
          const resultData = res.data as SidebarExecutionResultData | undefined;
          const executedSQLs = Array.isArray(resultData?.executedSQLs)
              ? resultData.executedSQLs.map(String)
              : [];
          if (res.success) {
              message.success(t('sidebar.msg.clearSuccess'));
              // 构造 SQL 日志
              let logSql = `/* Clear Tables (${objectNames.length} tables) */\n`;
              if (executedSQLs.length > 0) {
                  logSql += executedSQLs.join(';\n') + ';';
              } else {
                  logSql += objectNames.map(name => name).join('; ');
              }
              addSqlLog({
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  sql: logSql,
                  status: 'success',
                  duration,
                  message: res.message,
                  dbName,
                  affectedRows: Number(resultData?.count || 0)
              });
          } else if (!isCancelledMessage(res.message)) {
              message.error(t('sidebar.msg.clearFailed', { message: res.message }));
              // 记录失败的日志
              let logSql = `/* Clear Tables (${objectNames.length} tables) - FAILED */\n`;
              if (executedSQLs.length > 0) {
                  logSql += executedSQLs.join(';\n') + ';';
              } else {
                  logSql += objectNames.map(name => name).join('; ');
              }
              addSqlLog({
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  sql: logSql,
                  status: 'error',
                  duration,
                  message: res.message,
                  dbName
              });
          }
      } catch (e: unknown) {
          const duration = Date.now() - startTime;
          hide();
          const errMsg = getErrorMessage(e);
          message.error(t('sidebar.msg.clearFailed', { message: errMsg }));
          // 记录异常的日志
          let logSql = `/* Clear Tables (${objectNames.length} tables) - ERROR */\n`;
          logSql += objectNames.map(name => name).join('; ');
          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: logSql,
              status: 'error',
              duration,
              message: errMsg,
              dbName
          });
      }
  };

  const handleCheckAll = (checked: boolean) => {
      if (batchSelectionScope === 'all') {
          setCheckedTableKeys(checked ? allBatchObjectKeys : []);
          return;
      }
      if (filteredBatchObjectKeys.length === 0) {
          return;
      }
      if (checked) {
          setCheckedTableKeys(prev => {
              const nextSet = new Set(prev);
              filteredBatchObjectKeys.forEach((key) => nextSet.add(key));
              return allBatchObjectKeys.filter((key) => nextSet.has(key));
          });
          return;
      }
      const filteredKeySet = new Set(filteredBatchObjectKeys);
      setCheckedTableKeys(prev => prev.filter((key) => !filteredKeySet.has(key)));
  };

  const handleInvertSelection = () => {
      if (batchSelectionScope === 'all') {
          setCheckedTableKeys(prev => allBatchObjectKeys.filter((key) => !prev.includes(key)));
          return;
      }
      if (filteredBatchObjectKeys.length === 0) {
          return;
      }
      setCheckedTableKeys(prev => {
          const nextSet = new Set(prev);
          filteredBatchObjectKeys.forEach((key) => {
              if (nextSet.has(key)) {
                  nextSet.delete(key);
              } else {
                  nextSet.add(key);
              }
          });
          return allBatchObjectKeys.filter((key) => nextSet.has(key));
      });
  };

  const openBatchDatabaseModal = async () => {
      // Check if current selected node is connection or database
      let connId = '';

      if (selectedNodesRef.current.length > 0) {
          const node = selectedNodesRef.current[0];
          const dataRef = getSidebarDataRef(node);
          const config = dataRef.config && typeof dataRef.config === 'object' ? dataRef.config as SidebarDataRef : {};
          if (node.type === 'connection' && config.type !== 'redis') {
              connId = String(node.key);
          } else if (node.type === 'database') {
              connId = String(dataRef.id || '');
          } else if (node.type === 'table') {
              connId = String(dataRef.id || '');
          }
      }

      setSelectedDbConnection(connId);
      setBatchDatabases([]);
      setCheckedDbKeys([]);

      if (connId) {
          const conn = connections.find(c => c.id === connId);
          if (conn) {
              await loadDatabasesForDbBatch(conn);
          }
      }

      setIsBatchDbModalOpen(true);
  };

  const loadDatabasesForDbBatch = async (conn: SavedConnection) => {
      setBatchConnContext(conn);

      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };

      const res = await DBGetDatabases(buildRpcConnectionConfig(config));
      if (res.success) {
          const dbRows: SidebarDatabaseRow[] = Array.isArray(res.data) ? res.data as SidebarDatabaseRow[] : [];
          let dbs = dbRows.map((row): SidebarBatchDatabase => {
              const dbName = String(row.Database || row.database || "").trim();
              return {
                  title: dbName,
                  key: `${conn.id}-${dbName}`,
                  dbName: dbName,
                  dataRef: { ...conn, dbName }
              };
          });

          if (conn.includeDatabases && conn.includeDatabases.length > 0) {
              dbs = dbs.filter(db => conn.includeDatabases!.includes(db.dbName));
          }

          setBatchDatabases(dbs);
          setCheckedDbKeys([]);
      } else {
          message.error(t('sidebar.msg.fetchDbFailed', { message: res.message }));
      }
  };

  const handleDbConnectionChange = async (connId: string) => {
      setSelectedDbConnection(connId);

      const conn = connections.find(c => c.id === connId);
      if (conn) {
          await loadDatabasesForDbBatch(conn);
      }
  };

  const handleBatchDbExport = async (includeData: boolean) => {
      const selectedDbs = batchDatabases.filter(db => checkedDbKeys.includes(db.key));
      if (selectedDbs.length === 0) {
          message.warning(t('sidebar.msg.selectAtLeastOneDb'));
          return;
      }

      setIsBatchDbModalOpen(false);

      for (const db of selectedDbs) {
          const hide = message.loading(includeData ? t('sidebar.msg.backingUpDb', { name: db.dbName }) : t('sidebar.msg.exportingDbSchema', { name: db.dbName }), 0);
          try {
              if (!batchConnContext) return;
              const res = await ExportDatabaseSQL(normalizeConnConfig(batchConnContext.config), db.dbName, includeData);
              hide();
              if (res.success) {
                  showExportSuccess(res, t('sidebar.msg.dbExportSuccess', { name: db.dbName }));
              } else if (!isCancelledMessage(res.message)) {
                  message.error(t('sidebar.msg.dbExportFailed', { name: db.dbName, message: res.message }));
                  break;
              } else {
                  break; // User cancelled
              }
          } catch (e: unknown) {
              hide();
              message.error(t('sidebar.msg.dbExportFailed', { name: db.dbName, message: getErrorMessage(e) }));
              break;
          }
      }
  };

  const handleCheckAllDb = (checked: boolean) => {
      if (checked) {
          setCheckedDbKeys(batchDatabases.map(db => db.key));
      } else {
          setCheckedDbKeys([]);
      }
  };

  const handleInvertSelectionDb = () => {
      const allKeys = batchDatabases.map(db => db.key);
      const newChecked = allKeys.filter(k => !checkedDbKeys.includes(k));
      setCheckedDbKeys(newChecked);
  };

  const handleRunSQLFile = async (node: TreeNode) => {
      const nodeData = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const connectionId = String(node.type === 'connection' ? getSidebarNodeKeyText(node) : nodeData.id || '').trim();
      const dbName = String(node.type === 'database' ? node.title : nodeData.dbName || '').trim() || undefined;
      if (!connectionId) {
          message.warning(t('sidebar.msg.selectConnOrDb'));
          return;
      }
      await openSQLFileForContext({ connectionId, dbName });
  };

  const handleOpenSQLFileFromToolbar = async () => {
      const ctx = useStore.getState().activeContext;
      if (!ctx?.connectionId) {
          message.warning(t('sidebar.msg.selectConnOrDb'));
          return;
      }
      await openSQLFileForContext({ connectionId: ctx.connectionId, dbName: ctx.dbName || undefined });
  };

  const openSQLFileForContext = async (context: { connectionId: string; dbName?: string }) => {
      if (isJavaNaviDesktopRuntime()) {
          const res = await OpenSQLFile();
          if (res.success) {
              const data = res.data;
              if (data && typeof data === 'object' && (data as SidebarLargeFilePayload).isLargeFile) {
                  const payload = data as SidebarLargeFilePayload;
                  const conn = connections.find(c => c.id === context.connectionId);
                  if (!conn) {
                      message.error(t('sidebar.msg.connConfigNotFound'));
                      return;
                  }
                  startSQLFileExecution(conn.config, context.dbName || '', String(payload.filePath || payload.path || ''), String(payload.fileSizeMB || ''));
                  return;
              }
              const payload = data && typeof data === 'object' ? data as { name?: unknown; content?: unknown } : {};
              addTab({
                  id: `query-${Date.now()}`,
                  title: String(payload.name || t('sidebar.menu.runExternalSql')),
                  type: 'query',
                  connectionId: context.connectionId,
                  dbName: context.dbName,
                  query: String(payload.content ?? data ?? '')
              });
          } else if (!isCancelledMessage(res.message)) {
              message.error(t('sidebar.msg.readFileFailed', { message: res.message }));
          }
          return;
      }
      pendingOpenSqlContextRef.current = context;
      openSqlUploadInputRef.current?.click();
  };

  const handleOpenSQLUploadSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const context = pendingOpenSqlContextRef.current;
      const file = event.target.files?.[0];
      event.target.value = '';
      pendingOpenSqlContextRef.current = null;
      if (!context || !file) return;
      if (!file.name.toLowerCase().endsWith('.sql')) {
          message.error(t('sidebar.msg.readSqlFailed', { message: '请选择 .sql 文件' }));
          return;
      }
      const text = await file.text();
      addTab({
          id: `query-${Date.now()}`,
          title: file.name || t('sidebar.menu.runExternalSql'),
          type: 'query',
          connectionId: context.connectionId,
          dbName: context.dbName,
          query: text
      });
  };

  // SQL 文件流式执行状态
  const [sqlFileExecState, setSqlFileExecState] = useState<{
      open: boolean;
      jobId: string;
      fileSizeMB: string;
      status: 'running' | 'done' | 'cancelled' | 'error';
      executed: number;
      failed: number;
      total: number;
      percent: number;
      currentSQL: string;
      resultMessage: string;
  }>({
      open: false, jobId: '', fileSizeMB: '', status: 'running',
      executed: 0, failed: 0, total: 0, percent: 0, currentSQL: '', resultMessage: ''
  });

  const startSQLFileExecution = (config: SavedConnection['config'], dbName: string, filePath: string, fileSizeMB: string) => {
      const jobId = `sqlfile-${Date.now()}`;
      setSqlFileExecState({
          open: true, jobId, fileSizeMB, status: 'running',
          executed: 0, failed: 0, total: 0, percent: 0, currentSQL: '', resultMessage: ''
      });

      // 监听进度事件
      const offProgress = EventsOn<[SidebarSqlFileProgressEvent]>('sqlfile:progress', (event) => {
          if (!event || event.jobId !== jobId) return;
          setSqlFileExecState(prev => ({
              ...prev,
              status: typeof event.status === 'string' ? event.status as typeof prev.status : prev.status,
              executed: typeof event.executed === 'number' ? event.executed : prev.executed,
              failed: typeof event.failed === 'number' ? event.failed : prev.failed,
              total: typeof event.total === 'number' ? event.total : prev.total,
              percent: typeof event.percent === 'number' ? Math.min(100, event.percent) : prev.percent,
              currentSQL: typeof event.currentSQL === 'string' ? event.currentSQL : prev.currentSQL,
          }));
      });

      // 异步执行
      ExecuteSQLFile(buildRpcConnectionConfig(config), dbName, filePath, jobId).then(res => {
          offProgress();
          setSqlFileExecState(prev => ({
              ...prev,
              status: res.success ? 'done' : (prev.status === 'cancelled' ? 'cancelled' : 'error'),
              percent: 100,
              resultMessage: res.message || '',
          }));
      }).catch(err => {
          offProgress();
          setSqlFileExecState(prev => ({
              ...prev,
              status: 'error',
              resultMessage: getErrorMessage(err),
          }));
      });
  };

  const refreshDatabaseNode = async (dbNodeKey: string) => {
      if (!dbNodeKey) {
          return;
      }
      const dbNode = findTreeNodeByKey(treeData, dbNodeKey);
      if (dbNode && dbNode.type === 'database') {
          await loadTables(dbNode);
      }
  };

  const openExternalSQLFile = async (fileNode: TreeNode) => {
      const dataRef = getSidebarDataRef(fileNode);
      const connectionId = String(dataRef.connectionId || '').trim();
      const dbName = String(dataRef.dbName || '').trim();
      const filePath = String(dataRef.path || '').trim();
      const fileName = String(dataRef.name || fileNode?.title || t('sidebar.sqlFile')).trim() || t('sidebar.sqlFile');
      if (!connectionId || !dbName || !filePath) {
          message.error(t('sidebar.msg.sqlContextIncomplete'));
          return;
      }

      const res = await ReadSQLFile(filePath);
      if (!res.success) {
          if (!isCancelledMessage(res.message)) {
              message.error(t('sidebar.msg.readSqlFailed', { message: res.message }));
          }
          return;
      }

      const data = res.data;
      if (data && typeof data === 'object' && (data as SidebarLargeFilePayload).isLargeFile) {
          const payload = data as SidebarLargeFilePayload;
          const conn = connections.find((item) => item.id === connectionId);
          if (!conn) {
              message.error(t('sidebar.msg.connConfigNotFound'));
              return;
          }
          startSQLFileExecution(conn.config, dbName, String(payload.filePath || ''), String(payload.fileSizeMB || ''));
          return;
      }

      addTab({
          id: buildExternalSQLTabId(connectionId, dbName, filePath),
          title: fileName,
          type: 'query',
          connectionId,
          dbName,
          query: String(data || ''),
          filePath,
      });
  };

  const resolveExternalSQLTargetDirectory = (node: TreeNode): string => {
      const dataRef = getSidebarDataRef(node);
      if (node?.type === 'external-sql-root' || node?.type === 'external-sql-folder') {
          return String(dataRef.path || '').trim();
      }
      if (node?.type === 'external-sql-file') {
          const currentPath = String(dataRef.path || '').trim();
          return currentPath.replace(/[\\/][^\\/]+$/, '');
      }
      return '';
  };

  const handleUploadExternalSQLFile = async (node: TreeNode) => {
      const context = getNodeDatabaseContext(node);
      const directoryPath = resolveExternalSQLTargetDirectory(node);
      if (!context?.connectionId || !context?.dbName || !context?.dbNodeKey || !directoryPath) {
          message.error(t('sidebar.msg.sqlUploadDirInvalid'));
          return;
      }
      pendingExternalSqlUploadRef.current = { ...context, directoryPath };
      externalSqlUploadInputRef.current?.click();
  };

  const handleExternalSQLFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const uploadContext = pendingExternalSqlUploadRef.current;
      const file = event.target.files?.[0];
      event.target.value = '';
      pendingExternalSqlUploadRef.current = null;
      if (!uploadContext || !file) {
          return;
      }
      const uploadRes = await UploadSQLFile(uploadContext.directoryPath, file);
      if (!uploadRes.success) {
          message.error(t('sidebar.msg.uploadSqlFailed', { message: uploadRes.message }));
          return;
      }
      const payload = uploadRes.data && typeof uploadRes.data === 'object' ? uploadRes.data as Record<string, unknown> : {};
      const uploadedPath = String(payload.path || payload.filePath || '').trim();
      const uploadedName = String(payload.name || file.name || t('sidebar.sqlFile')).trim() || t('sidebar.sqlFile');
      setExpandedKeys((prev) => Array.from(new Set([...prev, uploadContext.dbNodeKey, `${uploadContext.dbNodeKey}-external-sql`])));
      setAutoExpandParent(false);
      await refreshDatabaseNode(uploadContext.dbNodeKey);
      message.success(t('sidebar.msg.uploadSqlSuccess'));
      void openExternalSQLFile({
          title: uploadedName,
          key: `external-sql-file:${uploadedPath}`,
          type: 'external-sql-file',
          dataRef: {
              connectionId: uploadContext.connectionId,
              dbName: uploadContext.dbName,
              dbNodeKey: uploadContext.dbNodeKey,
              path: uploadedPath,
              name: uploadedName,
          },
      });
  };

  const handleCreateExternalSQLDirectory = async (node: TreeNode) => {
      const context = getNodeDatabaseContext(node);
      const targetPath = resolveExternalSQLTargetDirectory(node);
      if (!context?.dbNodeKey || !targetPath) {
          message.error(t('sidebar.msg.createDirTargetInvalid'));
          return;
      }
      let nextName = '';
      Modal.confirm({
          title: t('sidebar.menu.newDirectory'),
          content: <Input {...noAutoCapInputProps} placeholder={t('sidebar.modal.newDirectoryPlaceholder')} onChange={(event) => { nextName = event.target.value; }} />,
          onOk: async () => {
              const createRes = await CreateSQLDirectory(targetPath, nextName);
              if (!createRes.success) {
                  message.error(t('sidebar.msg.createDirFailed', { message: createRes.message }));
                  throw new Error(createRes.message || 'create directory failed');
              }
              setExpandedKeys((prev) => Array.from(new Set([...prev, context.dbNodeKey, `${context.dbNodeKey}-external-sql`, targetPath])));
              setAutoExpandParent(false);
              await refreshDatabaseNode(context.dbNodeKey);
              message.success(t('sidebar.msg.dirCreated'));
          },
      });
  };

  const handleRenameExternalSQLPath = async (node: TreeNode) => {
      const context = getNodeDatabaseContext(node);
      const dataRef = getSidebarDataRef(node);
      const currentPath = String(dataRef.path || '').trim();
      if (!context?.dbNodeKey || !currentPath) {
          message.error(t('sidebar.msg.renameTargetInvalid'));
          return;
      }
      let nextName = String(dataRef.name || node?.title || '').trim();
      Modal.confirm({
          title: t('sidebar.menu.rename'),
          content: <Input {...noAutoCapInputProps} defaultValue={nextName} onChange={(event) => { nextName = event.target.value; }} />,
          onOk: async () => {
              const renameRes = await RenameSQLWorkspacePath(currentPath, nextName);
              if (!renameRes.success) {
                  message.error(t('sidebar.msg.renameFailed', { message: renameRes.message }));
                  throw new Error(renameRes.message || 'rename failed');
              }
              await refreshDatabaseNode(context.dbNodeKey);
              message.success(t('sidebar.msg.renameSuccess'));
          },
      });
  };

  const handleRefreshExternalSQLDirectory = async (node: TreeNode) => {
      const dbNodeKey = String(getSidebarDataRef(node).dbNodeKey || '').trim();
      if (!dbNodeKey) {
          message.warning(t('sidebar.msg.noDbContext'));
          return;
      }
      await refreshDatabaseNode(dbNodeKey);
      message.success(t('sidebar.msg.sqlDirRefreshed'));
  };

  const handleCreateDatabase = async () => {
      if (!targetConnection) return;
      try {
          const values = await createDbForm.validateFields();
          const conn = getSidebarDataRef<SidebarRuntimeNodeData>(targetConnection);
          const config = {
              ...conn.config,
              port: Number(conn.config.port),
              password: conn.config.password || "",
              database: (conn.config.type === 'oracle' || conn.config.type === 'dameng') ? (conn.config.database || "") : "",
              useSSH: conn.config.useSSH || false,
              ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
          };

          const res = await CreateDatabase(buildRpcConnectionConfig(config), values.name);
          if (res.success) {
              message.success(t('sidebar.msg.dbCreateSuccess'));
              setIsCreateDbModalOpen(false);
              createDbForm.resetFields();
              await loadDatabases(targetConnection);
          } else {
              message.error(t('sidebar.msg.dbCreateFailed', { message: res.message }));
          }
      } catch (e) {
          // Validate failed
      }
  };

  const buildRuntimeConfig = (conn: SavedConnection, overrideDatabase?: string, clearDatabase: boolean = false): RpcConnectionConfig => {
      return buildRpcConnectionConfig(conn.config, {
          database: resolveSidebarRuntimeDatabase(
              conn?.config?.type,
              conn?.config?.driver || '',
              conn?.config?.database || '',
              overrideDatabase,
              clearDatabase,
          ),
      });
  };

  const getConnectionNodeRef = (connRef: SavedConnection): SidebarLoadTreeNode => {
      const latestConn = connections.find(c => c.id === connRef.id);
      return { key: connRef.id, dataRef: latestConn || connRef };
  };

  const getDatabaseNodeRef = (connRef: SavedConnection, dbName: string): SidebarLoadTreeNode => {
      const latestConn = connections.find(c => c.id === connRef.id);
      return {
          key: `${connRef.id}-${dbName}`,
          dataRef: { ...(latestConn || connRef), dbName }
      };
  };

  const extractObjectName = (fullName: string) => {
      const raw = String(fullName || '').trim();
      const idx = raw.lastIndexOf('.');
      if (idx >= 0 && idx < raw.length - 1) {
          return raw.substring(idx + 1);
      }
      return raw;
  };

  const handleRenameDatabase = async () => {
      if (!renameDbTarget) return;
      try {
          const values = await renameDbForm.validateFields();
          const conn = getSidebarDataRef<SidebarRuntimeNodeData>(renameDbTarget);
          const oldDbName = String(conn.dbName || '').trim();
          const newDbName = String(values.newName || '').trim();
          if (!oldDbName || !newDbName) {
              message.error(t('sidebar.msg.dbNameRequired'));
              return;
          }
          if (oldDbName === newDbName) {
              message.warning(t('sidebar.msg.sameDbName'));
              return;
          }

          const config = buildRuntimeConfig(conn, conn.dbName);
          const res = await RenameDatabase(config, oldDbName, newDbName);
          if (res.success) {
              message.success(t('sidebar.msg.dbRenameSuccess'));
              setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(`${conn.id}-${oldDbName}`)));
              setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(`${conn.id}-${oldDbName}`)));
              await loadDatabases(getConnectionNodeRef(conn));
              setIsRenameDbModalOpen(false);
              setRenameDbTarget(null);
              renameDbForm.resetFields();
          } else {
              message.error(t('sidebar.msg.dbRenameFailed', { message: res.message }));
          }
      } catch (e) {
          // Validate failed
      }
  };

  const handleDeleteDatabase = (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const dbName = String(conn.dbName || '').trim();
      if (!dbName) return;
      Modal.confirm({
          title: t('sidebar.modal.confirmDeleteDb'),
          content: t('sidebar.modal.deleteDbContent', { name: dbName }),
          okButtonProps: { danger: true },
          onOk: async () => {
              const config = buildRuntimeConfig(conn, conn.dbName);
              const res = await DropDatabase(config, dbName);
              if (res.success) {
                  message.success(t('sidebar.msg.dbDeleteSuccess'));
                  closeTabsByDatabase(conn.id, dbName);
                  setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(`${conn.id}-${dbName}`)));
                  setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(`${conn.id}-${dbName}`)));
                  await loadDatabases(getConnectionNodeRef(conn));
              } else {
                  message.error(t('sidebar.msg.dbDeleteFailed', { message: res.message }));
              }
          }
      });
  };

  const handleRenameTable = async () => {
      if (!renameTableTarget) return;
      try {
          const values = await renameTableForm.validateFields();
          const conn = getSidebarDataRef<SidebarRuntimeNodeData>(renameTableTarget);
          const oldTableName = String(conn.tableName || '').trim();
          const newTableName = String(values.newName || '').trim();
          if (!oldTableName || !newTableName) {
              message.error(t('sidebar.msg.tableNameRequired'));
              return;
          }
          if (extractObjectName(oldTableName) === newTableName || oldTableName === newTableName) {
              message.warning(t('sidebar.msg.sameTableName'));
              return;
          }
          const config = buildRuntimeConfig(conn, conn.dbName);
          const res = await RenameTable(config, conn.dbName, oldTableName, newTableName);
          if (res.success) {
              message.success(t('sidebar.msg.tableRenameSuccess'));
              await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              setIsRenameTableModalOpen(false);
              setRenameTableTarget(null);
              renameTableForm.resetFields();
          } else {
              message.error(t('sidebar.msg.tableRenameFailed', { message: res.message }));
          }
      } catch (e) {
          // Validate failed
      }
  };

  const handleDeleteTable = (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const tableName = String(conn.tableName || '').trim();
      if (!tableName) return;
      Modal.confirm({
          title: t('sidebar.modal.confirmDeleteTable'),
          content: t('sidebar.modal.deleteTableContent', { name: tableName }),
          okButtonProps: { danger: true },
          onOk: async () => {
              const config = buildRuntimeConfig(conn, conn.dbName);
              const res = await DropTable(config, conn.dbName, tableName);
              if (res.success) {
                  message.success(t('sidebar.msg.tableDeleteSuccess'));
                  await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              } else {
                  message.error(t('sidebar.msg.tableDeleteFailed', { message: res.message }));
              }
          }
      });
  };

  const handleTableDataDangerAction = async (node: SidebarMenuNode, action: TableDataDangerActionKind) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const tableName = String(conn.tableName || '').trim();
      if (!tableName) return;

      const { label, progressLabel, successLabel } = getTableDangerActionText(action);
      const confirmed = await new Promise<boolean>((resolve) => {
          Modal.confirm({
              title: t('sidebar.modal.confirmLabel', { label }),
              content: t('sidebar.modal.confirmTableActionContent', { label, name: tableName }),
              okText: t('sidebar.modal.continue'),
              cancelText: t('common.cancel'),
              okButtonProps: { danger: true },
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
          });
      });
      if (!confirmed) return;

      const config = buildRuntimeConfig(conn, conn.dbName);
      const method = action === 'truncate' ? TruncateTables : ClearTables;
      const hide = message.loading(t('sidebar.msg.processingTable', { label: progressLabel, name: tableName }), 0);
      const startTime = Date.now();
      try {
          const res = await method(config, conn.dbName, [tableName]);
          hide();
          const duration = Date.now() - startTime;
          const resultData = res.data as SidebarExecutionResultData | undefined;
          const executedSQLs = Array.isArray(resultData?.executedSQLs)
              ? resultData.executedSQLs.map(String)
              : [];
          const logSql = executedSQLs.length > 0
              ? executedSQLs.join(';\n') + ';'
              : `/* ${label} ${tableName} */`;

          if (res.success) {
              message.success(t('sidebar.msg.processSuccess', { label: successLabel }));
              addSqlLog({
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  sql: logSql,
                  status: 'success',
                  duration,
                  message: res.message,
                  dbName: conn.dbName,
                  affectedRows: Number(resultData?.count || 0),
              });
              await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              return;
          }

          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: logSql,
              status: 'error',
              duration,
              message: res.message,
              dbName: conn.dbName,
          });
          if (!isCancelledMessage(res.message)) {
              message.error(t('sidebar.msg.processFailed', { label: progressLabel, message: res.message }));
          }
      } catch (e: unknown) {
          const duration = Date.now() - startTime;
          const errMsg = getErrorMessage(e);
          hide();
          addSqlLog({
              id: Date.now().toString(),
              timestamp: Date.now(),
              sql: `/* ${label} ${tableName} - ERROR */`,
              status: 'error',
              duration,
              message: errMsg,
              dbName: conn.dbName,
          });
          message.error(t('sidebar.msg.processFailed', { label: progressLabel, message: errMsg }));
      }
  };

  // --- 视图操作 ---
  const openViewDefinition = (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const viewName = String(conn.viewName || '').trim();
      const dbName = conn.dbName;
      const id = conn.id;
      if (!viewName) return;
      addTab({
          id: `view-def-${id}-${dbName}-${viewName}`,
          title: t('sidebar.tree.viewDef', { name: viewName }),
          type: 'view-def',
          connectionId: id,
          dbName,
          viewName,
      });
  };

  const openEditView = async (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const viewName = String(conn.viewName || '').trim();
      const dbName = conn.dbName;
      const id = conn.id;
      if (!viewName) return;
      // 获取视图定义后打开查询编辑器
      const dialect = getMetadataDialect(conn as SavedConnection);
      let template = `${t('sidebar.template.editViewHeader', { name: viewName })}\n${t('sidebar.template.modifyThenExecute')}\nCREATE OR REPLACE VIEW ${viewName} AS\nSELECT * FROM your_table;`;

      try {
          const config = buildRuntimeConfig(conn, dbName);
          let query = '';
          switch (dialect) {
              case 'mysql':
                  query = `SHOW CREATE VIEW \`${viewName.replace(/`/g, '``')}\``;
                  break;
              case 'postgres': case 'kingbase': case 'highgo': case 'vastbase': {
                  const parts = viewName.split('.');
                  const schema = parts.length > 1 ? parts[0] : 'public';
                  const name = parts.length > 1 ? parts[1] : viewName;
                  query = `SELECT pg_get_viewdef('${escapeSQLLiteral(schema)}.${escapeSQLLiteral(name)}'::regclass, true) AS view_definition`;
                  break;
              }
              case 'sqlserver':
                  query = `SELECT OBJECT_DEFINITION(OBJECT_ID('${escapeSQLLiteral(viewName)}')) AS view_definition`;
                  break;
              case 'sqlite':
                  query = `SELECT sql AS view_definition FROM sqlite_master WHERE type='view' AND name='${escapeSQLLiteral(viewName)}'`;
                  break;
              case 'duckdb': {
                  const parts = splitQualifiedName(viewName);
                  const viewSchema = escapeSQLLiteral(parts.schemaName || 'main');
                  const viewObject = escapeSQLLiteral(parts.objectName || viewName);
                  query = `SELECT view_definition FROM information_schema.views WHERE table_schema='${viewSchema}' AND table_name='${viewObject}' LIMIT 1`;
                  break;
              }
          }
          if (query) {
              const result = await DBQuery(config, dbName, query);
              const rows = Array.isArray(result.data) ? result.data as SidebarQueryRecord[] : [];
              if (result.success && rows.length > 0) {
                  const row = rows[0];
                  const def = row.view_definition || row.VIEW_DEFINITION || Object.values(row).find(v => typeof v === 'string' && String(v).length > 10) || '';
                  if (def) {
                      if (dialect === 'mysql') {
                          template = `${t('sidebar.template.editViewHeader', { name: viewName })}\n${normalizeMySQLViewDDLForEditing(viewName, def)}`;
                      } else {
                          template = `${t('sidebar.template.editViewHeader', { name: viewName })}\nCREATE OR REPLACE VIEW ${viewName} AS\n${def}`;
                      }
                  }
              }
          }
      } catch { /* 降级使用模板 */ }

      addTab({
          id: `query-edit-view-${Date.now()}`,
          title: t('sidebar.tree.editView', { name: viewName }),
          type: 'query',
          connectionId: id,
          dbName,
          query: template
      });
  };

  const openCreateView = (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const { dbName, id } = conn;
      const dialect = getMetadataDialect(conn as SavedConnection);
      let template: string;
      switch (dialect) {
          case 'mysql':
              template = `CREATE VIEW \`view_name\` AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          case 'postgres': case 'kingbase': case 'highgo': case 'vastbase':
              template = `CREATE OR REPLACE VIEW view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          case 'sqlserver':
              template = `CREATE VIEW dbo.view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          case 'oracle': case 'dm':
              template = `CREATE OR REPLACE VIEW view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          case 'sqlite':
          case 'duckdb':
              template = `CREATE VIEW view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
              break;
          default:
              template = `CREATE VIEW view_name AS\nSELECT column1, column2\nFROM table_name\nWHERE condition;`;
      }
      addTab({
          id: `query-create-view-${Date.now()}`,
          title: t('sidebar.menu.newView'),
          type: 'query',
          connectionId: id,
          dbName,
          query: template
      });
  };

  const handleDropView = (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const viewName = String(conn.viewName || '').trim();
      if (!viewName) return;
      Modal.confirm({
          title: t('sidebar.modal.confirmDeleteView'),
          content: t('sidebar.modal.deleteViewContent', { name: viewName }),
          okButtonProps: { danger: true },
          onOk: async () => {
              const config = buildRuntimeConfig(conn, conn.dbName);
              const res = await DropView(config, conn.dbName, viewName);
              if (res.success) {
                  message.success(t('sidebar.msg.viewDeleteSuccess'));
                  await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              } else {
                  message.error(t('sidebar.msg.dbDeleteFailed', { message: res.message }));
              }
          }
      });
  };

  const handleRenameView = async () => {
      if (!renameViewTarget) return;
      try {
          const values = await renameViewForm.validateFields();
          const conn = getSidebarDataRef<SidebarRuntimeNodeData>(renameViewTarget);
          const oldViewName = String(conn.viewName || '').trim();
          const newViewName = String(values.newName || '').trim();
          if (!oldViewName || !newViewName) {
              message.error(t('sidebar.msg.viewNameRequired'));
              return;
          }
          if (extractObjectName(oldViewName) === newViewName || oldViewName === newViewName) {
              message.warning(t('sidebar.msg.sameViewName'));
              return;
          }
          const config = buildRuntimeConfig(conn, conn.dbName);
          const res = await RenameView(config, conn.dbName, oldViewName, newViewName);
          if (res.success) {
              message.success(t('sidebar.msg.viewRenameSuccess'));
              await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              setIsRenameViewModalOpen(false);
              setRenameViewTarget(null);
              renameViewForm.resetFields();
          } else {
              message.error(t('sidebar.msg.viewRenameFailed', { message: res.message }));
          }
      } catch (e) {
          // Validate failed
      }
  };

  // --- 函数/存储过程操作 ---
  const openRoutineDefinition = (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const routineName = String(conn.routineName || '').trim();
      const routineType: SidebarRoutineType = conn.routineType === 'PROCEDURE' ? 'PROCEDURE' : 'FUNCTION';
      const dbName = conn.dbName;
      const id = conn.id;
      if (!routineName) return;
      const typeLabel = routineType === 'PROCEDURE' ? t('sidebar.tree.procedure') : t('sidebar.tree.function');
      addTab({
          id: `routine-def-${id}-${dbName}-${routineName}`,
          title: t('sidebar.tree.routineDef', { type: typeLabel, name: routineName }),
          type: 'routine-def',
          connectionId: id,
          dbName,
          routineName,
          routineType
      });
  };

  const openEditRoutine = async (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const routineName = String(conn.routineName || '').trim();
      const routineType: SidebarRoutineType = conn.routineType === 'PROCEDURE' ? 'PROCEDURE' : 'FUNCTION';
      const dbName = conn.dbName;
      const id = conn.id;
      if (!routineName) return;
      const dialect = getMetadataDialect(conn as SavedConnection);
      const typeLabel = routineType === 'PROCEDURE' ? t('sidebar.tree.procedure') : t('sidebar.tree.function');
      let template = t('sidebar.template.editRoutineHeader', { type: typeLabel, name: routineName });

      try {
          const config = buildRuntimeConfig(conn, dbName);
          let query = '';
          const parsedRoutine = splitQualifiedName(routineName);
          const name = parsedRoutine.objectName || routineName;
          const schema = parsedRoutine.schemaName;

          switch (dialect) {
              case 'mysql':
                  query = `SHOW CREATE ${routineType} \`${name.replace(/`/g, '``')}\``;
                  break;
              case 'postgres': case 'kingbase': case 'highgo': case 'vastbase': {
                  const schemaRef = schema || 'public';
                  query = `SELECT pg_get_functiondef(p.oid) AS routine_definition FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '${escapeSQLLiteral(schemaRef)}' AND p.proname = '${escapeSQLLiteral(name)}' LIMIT 1`;
                  break;
              }
              case 'sqlserver':
                  query = `SELECT OBJECT_DEFINITION(OBJECT_ID('${escapeSQLLiteral(routineName)}')) AS routine_definition`;
                  break;
              case 'oracle': case 'dm': {
                  const owner = schema ? escapeSQLLiteral(schema).toUpperCase() : '';
                  if (owner) {
                      query = `SELECT TEXT FROM ALL_SOURCE WHERE OWNER = '${owner}' AND NAME = '${escapeSQLLiteral(name).toUpperCase()}' AND TYPE = '${routineType}' ORDER BY LINE`;
                  } else {
                      query = `SELECT TEXT FROM USER_SOURCE WHERE NAME = '${escapeSQLLiteral(name).toUpperCase()}' AND TYPE = '${routineType}' ORDER BY LINE`;
                  }
                  break;
              }
              case 'duckdb': {
                  const schemaRef = schema || 'main';
                  query = `SELECT schema_name, function_name, parameters, macro_definition FROM duckdb_functions() WHERE internal = false AND lower(function_type) = 'macro' AND schema_name = '${escapeSQLLiteral(schemaRef)}' AND function_name = '${escapeSQLLiteral(name)}' LIMIT 1`;
                  break;
              }
          }
          if (query) {
              const result = await DBQuery(config, dbName, query);
              const rows = Array.isArray(result.data) ? result.data as SidebarQueryRecord[] : [];
              if (result.success && rows.length > 0) {
                  if (dialect === 'oracle' || dialect === 'dm') {
                      const lines = rows.map((row) => row.text || row.TEXT || Object.values(row)[0] || '').join('');
                      if (lines) template = `${t('sidebar.template.editRoutineHeader', { type: typeLabel, name: routineName })}\nCREATE OR REPLACE ${lines}`;
                  } else if (dialect === 'duckdb') {
                      const row = rows[0];
                      const ddl = buildDuckDBMacroDDL(
                          String(getCaseInsensitiveRawValue(row, ['schema_name']) || schema || '').trim(),
                          String(getCaseInsensitiveRawValue(row, ['function_name']) || name || '').trim(),
                          getCaseInsensitiveRawValue(row, ['parameters']),
                          getCaseInsensitiveRawValue(row, ['macro_definition'])
                      );
                      if (ddl) template = `${t('sidebar.template.editRoutineHeader', { type: typeLabel, name: routineName })}\n${ddl}`;
                  } else {
                      const row = rows[0];
                      const def = row.routine_definition || row.ROUTINE_DEFINITION || Object.values(row).find(v => typeof v === 'string' && String(v).length > 10) || '';
                      if (def) template = `${t('sidebar.template.editRoutineHeader', { type: typeLabel, name: routineName })}\n${def}`;
                  }
              }
          }
      } catch { /* 降级使用模板 */ }

      addTab({
          id: `query-edit-routine-${Date.now()}`,
          title: t('sidebar.tree.editRoutine', { type: typeLabel, name: routineName }),
          type: 'query',
          connectionId: id,
          dbName,
          query: template
      });
  };

  const openCreateRoutine = (node: SidebarMenuNode, type: SidebarRoutineType) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const { dbName, id } = conn;
      const dialect = getMetadataDialect(conn as SavedConnection);
      const isProc = type === 'PROCEDURE';
      let template: string;

      switch (dialect) {
          case 'mysql':
              template = isProc
                  ? `DELIMITER $$\nCREATE PROCEDURE proc_name(IN param1 INT)\nBEGIN\n    SELECT * FROM table_name WHERE id = param1;\nEND$$\nDELIMITER ;`
                  : `DELIMITER $$\nCREATE FUNCTION func_name(param1 INT)\nRETURNS INT\nDETERMINISTIC\nBEGIN\n    RETURN param1 * 2;\nEND$$\nDELIMITER ;`;
              break;
          case 'postgres': case 'kingbase': case 'highgo': case 'vastbase':
              template = isProc
                  ? `CREATE OR REPLACE PROCEDURE proc_name(param1 integer)\nLANGUAGE plpgsql\nAS $$\nBEGIN\n    -- procedure body\nEND;\n$$;`
                  : `CREATE OR REPLACE FUNCTION func_name(param1 integer)\nRETURNS integer\nLANGUAGE plpgsql\nAS $$\nBEGIN\n    RETURN param1 * 2;\nEND;\n$$;`;
              break;
          case 'sqlserver':
              template = isProc
                  ? `CREATE PROCEDURE dbo.proc_name\n    @param1 INT\nAS\nBEGIN\n    SELECT * FROM table_name WHERE id = @param1;\nEND;`
                  : `CREATE FUNCTION dbo.func_name(@param1 INT)\nRETURNS INT\nAS\nBEGIN\n    RETURN @param1 * 2;\nEND;`;
              break;
          case 'oracle': case 'dm':
              template = isProc
                  ? `CREATE OR REPLACE PROCEDURE proc_name(param1 IN NUMBER)\nIS\nBEGIN\n    -- procedure body\n    NULL;\nEND;`
                  : `CREATE OR REPLACE FUNCTION func_name(param1 IN NUMBER)\nRETURN NUMBER\nIS\nBEGIN\n    RETURN param1 * 2;\nEND;`;
              break;
          case 'duckdb':
              template = isProc
                  ? t('sidebar.template.duckdbProcedureUnsupported')
                  : `CREATE MACRO func_name(param1) AS (param1 * 2);`;
              break;
          default:
              template = isProc
                  ? `CREATE PROCEDURE proc_name()\nBEGIN\n    -- procedure body\nEND;`
                  : `CREATE FUNCTION func_name()\nRETURNS INTEGER\nBEGIN\n    RETURN 0;\nEND;`;
      }

      addTab({
          id: `query-create-routine-${Date.now()}`,
          title: t('sidebar.tree.newRoutine', { type: isProc ? t('sidebar.tree.procedure') : t('sidebar.tree.function') }),
          type: 'query',
          connectionId: id,
          dbName,
          query: template
      });
  };

  const handleDropRoutine = (node: SidebarMenuNode) => {
      const conn = getSidebarDataRef<SidebarRuntimeNodeData>(node);
      const routineName = String(conn.routineName || '').trim();
      const routineType: SidebarRoutineType = conn.routineType === 'PROCEDURE' ? 'PROCEDURE' : 'FUNCTION';
      if (!routineName) return;
      const typeLabel = routineType === 'PROCEDURE' ? t('sidebar.tree.procedure') : t('sidebar.tree.function');
      Modal.confirm({
          title: t('sidebar.modal.confirmDeleteRoutine', { type: typeLabel }),
          content: t('sidebar.modal.deleteRoutineContent', { type: typeLabel, name: routineName }),
          okButtonProps: { danger: true },
          onOk: async () => {
              const config = buildRuntimeConfig(conn, conn.dbName);
              const res = await DropFunction(config, conn.dbName, routineName, routineType);
              if (res.success) {
                  message.success(t('sidebar.msg.routineDeleteSuccess', { typeLabel }));
                  await loadTables(getDatabaseNodeRef(conn, conn.dbName));
              } else {
                  message.error(t('sidebar.msg.dbDeleteFailed', { message: res.message }));
              }
          }
      });
  };

  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setSearchValue(value);
  };

  const toggleSearchScope = (scope: SearchScope) => {
      setSearchScopes((prev) => {
          if (scope === 'smart') {
              return ['smart'];
          }
          const withoutSmart = prev.filter((item) => item !== 'smart');
          if (withoutSmart.includes(scope)) {
              const next = withoutSmart.filter((item) => item !== scope);
              return next.length > 0 ? next : ['smart'];
          }
          return [...withoutSmart, scope];
      });
  };

  const setSearchScopeChecked = (scope: SearchScope, checked: boolean) => {
      if (scope === 'smart') {
          if (checked) {
              setSearchScopes(['smart']);
          } else if (searchScopes.length === 1 && searchScopes[0] === 'smart') {
              setSearchScopes(['smart']);
          } else {
              setSearchScopes((prev) => {
                  const next = prev.filter((item) => item !== 'smart');
                  return next.length > 0 ? next : ['smart'];
              });
          }
          return;
      }

      if (checked) {
          setSearchScopes((prev) => {
              const withoutSmart = prev.filter((item) => item !== 'smart');
              if (withoutSmart.includes(scope)) {
                  return withoutSmart;
              }
              return [...withoutSmart, scope];
          });
      } else {
          setSearchScopes((prev) => {
              const next = prev.filter((item) => item !== scope && item !== 'smart');
              return next.length > 0 ? next : ['smart'];
          });
      }
  };

  const searchScopeSummary = useMemo(() => {
      if (searchScopes.includes('smart')) {
          return t('sidebar.searchScope.smart');
      }
      return searchScopes.map((scope) => t(SEARCH_SCOPE_OPTIONS.find((option) => option.value === scope)?.labelKey || 'sidebar.searchScope.smart')).join(' + ');
  }, [searchScopes, t]);

  const searchScopePopoverContent = useMemo(() => {
      const smartSelected = searchScopes.includes('smart');
      const scopedOptions = SEARCH_SCOPE_OPTIONS.filter((option) => option.value !== 'smart');
      const borderColor = overlayTheme.sectionBorder.replace('1px solid ', '');
      const mutedTextColor = overlayTheme.mutedText;
      const titleColor = overlayTheme.titleText;
      const panelBg = overlayTheme.shellBg;
      const smartBg = smartSelected
          ? (darkMode ? 'linear-gradient(135deg, rgba(255,214,102,0.22) 0%, rgba(255,179,71,0.16) 100%)' : 'linear-gradient(135deg, rgba(255,214,102,0.26) 0%, rgba(255,244,204,0.92) 100%)')
          : (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)');
      const smartBorder = smartSelected
          ? (darkMode ? 'rgba(255,214,102,0.42)' : 'rgba(245,176,65,0.34)')
          : borderColor;
      const getOptionCardStyle = (checked: boolean) => ({
          display: 'flex',
          alignItems: 'center' as const,
          justifyContent: 'space-between' as const,
          gap: 12,
          padding: '10px 12px',
          borderRadius: 12,
          border: `1px solid ${checked ? (darkMode ? 'rgba(118,169,250,0.44)' : 'rgba(24,144,255,0.32)') : borderColor}`,
          background: checked
              ? (darkMode ? 'rgba(64,124,255,0.18)' : 'rgba(24,144,255,0.08)')
              : (darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.76)'),
          transition: 'all 120ms ease',
      });
      return (
          <div style={{ minWidth: 280, display: 'flex', flexDirection: 'column', background: panelBg, padding: 14, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: mutedTextColor, textTransform: 'uppercase' }}>{t('sidebar.searchScope.title')}</div>
                      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: mutedTextColor }}>{t('sidebar.searchScope.description')}</div>
                  </div>
                  <div style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(17,24,39,0.06)', color: darkMode ? '#ffd666' : '#1677ff', flexShrink: 0 }}>
                      <FilterOutlined />
                  </div>
              </div>

              <label style={{ display: 'block', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: `1px solid ${smartBorder}`, background: smartBg, boxShadow: smartSelected ? (darkMode ? '0 10px 24px rgba(0,0,0,0.24)' : '0 10px 24px rgba(245,176,65,0.14)') : 'none' }}>
                      <Checkbox
                          checked={smartSelected}
                          onChange={(e) => setSearchScopeChecked('smart', e.target.checked)}
                      />
                      <div style={{ width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center', background: darkMode ? 'rgba(255,214,102,0.16)' : 'rgba(255,214,102,0.3)', color: darkMode ? '#ffd666' : '#ad6800', flexShrink: 0 }}>
                          {SEARCH_SCOPE_ICON_MAP.smart}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: titleColor }}>{t('sidebar.searchScope.smart')}</span>
                              <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: darkMode ? '#ffe58f' : '#ad6800', background: darkMode ? 'rgba(255,214,102,0.16)' : 'rgba(255,214,102,0.35)' }}>{t('sidebar.searchScope.recommended')}</span>
                          </div>
                          <div style={{ marginTop: 3, fontSize: 12, lineHeight: 1.5, color: mutedTextColor }}>{t('sidebar.searchScope.smartDescription')}</div>
                      </div>
                  </div>
              </label>

              <div style={{ height: 1, background: overlayTheme.divider, opacity: 0.9 }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: mutedTextColor, textTransform: 'uppercase' }}>{t('sidebar.searchScope.manualTitle')}</div>
                  <div style={{ fontSize: 12, color: mutedTextColor }}>{t('sidebar.searchScope.multiSelect')}</div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                  {scopedOptions.map((option) => {
                      const checked = searchScopes.includes(option.value);
                      return (
                          <label key={option.value} style={{ display: 'block', cursor: 'pointer' }}>
                              <div style={getOptionCardStyle(checked)}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                      <Checkbox
                                          checked={checked}
                                          onChange={(e) => setSearchScopeChecked(option.value, e.target.checked)}
                                      />
                                      <div style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: checked ? (darkMode ? 'rgba(118,169,250,0.2)' : 'rgba(24,144,255,0.12)') : (darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(17,24,39,0.06)'), color: checked ? (darkMode ? '#91caff' : '#1677ff') : mutedTextColor, flexShrink: 0 }}>
                                          {SEARCH_SCOPE_ICON_MAP[option.value]}
                                      </div>
                                      <span style={{ fontSize: 14, fontWeight: 600, color: titleColor, whiteSpace: 'nowrap' }}>{t(option.labelKey)}</span>
                                  </div>
                                  <div style={{ width: 18, display: 'flex', justifyContent: 'center', color: checked ? (darkMode ? '#91caff' : '#1677ff') : 'transparent', flexShrink: 0 }}>
                                      <CheckOutlined />
                                  </div>
                              </div>
                          </label>
                      );
                  })}
              </div>

              <div style={{ padding: '10px 12px', borderRadius: 12, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(17,24,39,0.04)', color: mutedTextColor, fontSize: 12, lineHeight: 1.6 }}>
                  {t('sidebar.searchScope.footerHint')}
              </div>
          </div>
      );
  }, [darkMode, overlayTheme, searchScopes, t]);

  const displayTreeData = useMemo(() => {
      const keyword = searchValue.trim().toLowerCase();
      if (!keyword) return treeData;
      return filterSidebarTree(treeData, keyword, searchScopes);
  }, [searchValue, searchScopes, treeData]);

  const getNodeMenuItems = (node: SidebarEventNode): MenuProps['items'] => {
    const nodeData = getSidebarDataRef<SidebarNodeData>(node);
    const isRedis = nodeData.config?.type === 'redis';

    // 表分组节点的右键菜单
    if (node.type === 'object-group' && nodeData.groupKey === 'tables') {
        const groupData = getSidebarDataRef<SidebarRuntimeNodeData>(node);
        const sortPreferenceKey = `${groupData.id}-${groupData.dbName}`;
        const currentSort = tableSortPreference[sortPreferenceKey] || 'name';

        return [
            {
                key: 'sort-by-name',
                label: t('sidebar.menu.sortByName'),
                icon: currentSort === 'name' ? <CheckSquareOutlined /> : null,
                onClick: () => {
                    setTableSortPreference(groupData.id, groupData.dbName, 'name');
                    const dbNode = {
                        key: `${groupData.id}-${groupData.dbName}`,
                        dataRef: groupData
                    };
                    loadTables(dbNode);
                }
            },
            {
                key: 'sort-by-frequency',
                label: t('sidebar.menu.sortByUsage'),
                icon: currentSort === 'frequency' ? <CheckSquareOutlined /> : null,
                onClick: () => {
                    setTableSortPreference(groupData.id, groupData.dbName, 'frequency');
                    const dbNode = {
                        key: `${groupData.id}-${groupData.dbName}`,
                        dataRef: groupData
                    };
                    loadTables(dbNode);
                }
            }
        ];
    }

    // 视图分组节点的右键菜单
    if (node.type === 'object-group' && nodeData.groupKey === 'views') {
        return [
            {
                key: 'create-view',
                label: t('sidebar.menu.newView'),
                icon: <PlusOutlined />,
                onClick: () => openCreateView(node)
            },
        ];
    }

    // 函数分组节点的右键菜单
    if (node.type === 'object-group' && nodeData.groupKey === 'routines') {
        const dialect = getMetadataDialect(nodeData);
        const routineMenu: MenuProps['items'] = [
            {
                key: 'create-function',
                label: t('sidebar.menu.newFunction'),
                icon: <PlusOutlined />,
                onClick: () => openCreateRoutine(node, 'FUNCTION')
            },
        ];
        if (dialect !== 'duckdb') {
            routineMenu.push({
                key: 'create-procedure',
                label: t('sidebar.menu.newProcedure'),
                icon: <PlusOutlined />,
                onClick: () => openCreateRoutine(node, 'PROCEDURE')
            });
        }
        return routineMenu;
    }

    // Connection Tag Menu — must be BEFORE the connection check
    if (node.type === 'tag') {
        return [
            {
                key: 'edit-tag',
                label: t('sidebar.menu.editTag'),
                icon: <EditOutlined />,
                onClick: () => {
                    const tag = getSidebarDataRef<SidebarTagData>(node);
                    createTagForm.setFieldsValue({ name: node.title, connectionIds: tag.connectionIds });
                    setRenameViewTarget(node);
                    setIsCreateTagModalOpen(true);
                }
            },
            { type: 'divider' },
            {
                key: 'delete-tag',
                label: t('sidebar.menu.deleteTag'),
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                    Modal.confirm({
                        title: t('sidebar.modal.confirmDelete'),
                        content: t('sidebar.modal.deleteTagContent', { name: node.title }),
                        onOk: () => {
                            removeConnectionTag(getSidebarDataRef<SidebarTagData>(node).id);
                        }
                    });
                }
            }
        ];
    }

    if (node.type === 'connection') {
        // Redis connection menu
        if (isRedis) {
            return [
                {
                    key: 'refresh',
                    label: t('sidebar.menu.refresh'),
                    icon: <ReloadOutlined />,
                    onClick: () => {
                        const connKey = String(node.key);
                        // 清除子节点的展开/已加载状态，确保刷新后重新展开时能触发 onLoadData
                        setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(`${connKey}-`)));
                        setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(`${connKey}-`)));
                        // 清除 loadingNodesRef 中残留的子节点加载标记
                        Array.from(loadingNodesRef.current).forEach(lk => {
                            if (lk.startsWith(`tables-${connKey}-`)) loadingNodesRef.current.delete(lk);
                        });
                        loadDatabases(node);
                    }
                },
                { type: 'divider' },
                {
                    key: 'new-command',
                    label: t('sidebar.menu.newCommandWindow'),
                    icon: <ConsoleSqlOutlined />,
                    onClick: () => {
                        addTab({
                            id: `redis-cmd-${node.key}-${Date.now()}`,
                            title: t('sidebar.tree.commandDb', { db: 0 }),
                            type: 'redis-command',
                            connectionId: node.key,
                            redisDB: 0
                        });
                    }
                },
                {
                    key: 'open-monitor',
                    label: t('sidebar.menu.redisMonitor'),
                    icon: <DashboardOutlined />,
                    onClick: () => {
                        addTab({
                            id: `redis-monitor-${node.key}-${Date.now()}`,
                            title: t('sidebar.tree.monitorDb', { db: 0 }),
                            type: 'redis-monitor',
                            connectionId: node.key,
                            redisDB: 0
                        });
                    }
                },
                { type: 'divider' },
                {
                    key: 'edit',
                    label: t('sidebar.menu.editConnection'),
                    icon: <EditOutlined />,
                    onClick: () => {
                        if (onEditConnection) onEditConnection(getSidebarDataRef<SidebarDataRef & SavedConnection>(node));
                    }
                },
                {
                    key: 'copy-connection',
                    label: t('sidebar.menu.copyConnection'),
                    icon: <CopyOutlined />,
                    onClick: () => handleDuplicateConnection(getSidebarDataRef<SidebarDataRef & SavedConnection>(node))
                },
                {
                    key: 'disconnect',
                    label: t('sidebar.menu.disconnect'),
                    icon: <DisconnectOutlined />,
                    onClick: () => {
                        const connId = String(node.key || '');
                        setConnectionStates(prev => {
                            const next = { ...prev };
                            Object.keys(next).forEach(k => {
                                if (k === node.key || k.startsWith(`${node.key}-`)) {
                                    delete next[k];
                                }
                            });
                            return next;
                        });
                        setExpandedKeys(prev => prev.filter(k => k !== node.key && !k.toString().startsWith(`${node.key}-`)));
                        setLoadedKeys(prev => prev.filter(k => k !== node.key && !k.toString().startsWith(`${node.key}-`)));
                        setTreeData(origin => updateTreeData(origin, node.key, undefined));
                        closeTabsByConnection(connId);
                        if (connId) {
                            void CloseConnection(connId).catch(() => undefined);
                        }
                        message.success(t('sidebar.msg.disconnectSuccess'));
                    }
                },
                {
                    key: 'delete',
                    label: t('sidebar.menu.deleteConnection'),
                    icon: <DeleteOutlined />,
                    danger: true,
                    onClick: () => {
                        Modal.confirm({
                            title: t('sidebar.modal.confirmDelete'),
                            content: t('sidebar.confirm.deleteConnection', { name: node.title }),
                            onOk: async () => {
                                const connId = String(node.key);
                                try {
                                    await DeleteConnection(connId);
                                    closeTabsByConnection(connId);
                                    removeConnection(connId);
                                    message.success(t('sidebar.msg.connDeleted'));
                                } catch (error: unknown) {
                                    message.error(getErrorMessage(error) || t('sidebar.msg.deleteConnError'));
                                    throw error;
                                }
                            }
                        });
                    }
                }
            ];
        }

        // Tag submenu for connection
        const tagSubMenuItems: MenuProps['items'] = connectionTags.map(tag => ({
            key: `move-to-tag-${tag.id}`,
            label: tag.name,
            icon: <FolderOutlined />,
            onClick: () => moveConnectionToTag(getSidebarNodeKeyText(node), tag.id)
        }));
        if (connectionTags.length > 0) {
            tagSubMenuItems.push({ type: 'divider' });
        }
        tagSubMenuItems.push({
            key: 'move-to-ungrouped',
            label: t('sidebar.menu.removeFromTag'),
            onClick: () => moveConnectionToTag(getSidebarNodeKeyText(node), null)
        });

        // Regular database connection menu
        return [
            {
                key: 'new-db',
                label: t('sidebar.menu.newDatabase'),
                icon: <DatabaseOutlined />,
                onClick: () => {
                    setTargetConnection(node);
                    setIsCreateDbModalOpen(true);
                }
            },
            {
                key: 'refresh',
                label: t('sidebar.menu.refresh'),
                icon: <ReloadOutlined />,
                onClick: () => {
                    const connKey = String(node.key);
                    // 清除子节点的展开/已加载状态，确保刷新后重新展开时能触发 onLoadData
                    setExpandedKeys(prev => prev.filter(k => !k.toString().startsWith(`${connKey}-`)));
                    setLoadedKeys(prev => prev.filter(k => !k.toString().startsWith(`${connKey}-`)));
                    // 清除 loadingNodesRef 中残留的子节点加载标记
                    Array.from(loadingNodesRef.current).forEach(lk => {
                        if (lk.startsWith(`tables-${connKey}-`)) loadingNodesRef.current.delete(lk);
                    });
                    loadDatabases(node);
                }
            },
            { type: 'divider' },
            {
               key: 'new-query',
               label: t('sidebar.menu.newQuery'),
               icon: <ConsoleSqlOutlined />,
               onClick: () => {
                   addTab({
                       id: `query-${Date.now()}`,
                       title: t('sidebar.tree.newQueryTab'),
                       type: 'query',
                       connectionId: node.key,
                       dbName: undefined,
                       query: ''
                   });
               }
             },
             {
                 key: 'open-sql-file',
                 label: t('sidebar.menu.runExternalSql'),
                 icon: <FileAddOutlined />,
                 onClick: () => handleRunSQLFile(node)
             },
             { type: 'divider' },
             {
                 key: 'edit',
                 label: t('sidebar.menu.editConnection'),
                 icon: <EditOutlined />,
                 onClick: () => {
                     if (onEditConnection) onEditConnection(getSidebarDataRef<SidebarDataRef & SavedConnection>(node));
                 }
             },
             {
                 key: 'copy-connection',
                 label: t('sidebar.menu.copyConnection'),
                 icon: <CopyOutlined />,
                 onClick: () => handleDuplicateConnection(getSidebarDataRef<SidebarDataRef & SavedConnection>(node))
             },
             {
                 key: 'move-to-tag',
                 label: t('sidebar.menu.moveToTag'),
                 icon: <FolderOpenOutlined />,
                 children: tagSubMenuItems
             },
             {
                 key: 'disconnect',
                 label: t('sidebar.menu.disconnect'),
                 icon: <DisconnectOutlined />,
                 onClick: () => {
                     const connId = String(node.key || '');
                     // 强制清理该连接相关的 loading 标记，避免网络卡住后重连仍被短路。
                     Array.from(loadingNodesRef.current).forEach((loadingKey) => {
                         if (loadingKey === `dbs-${connId}` || loadingKey.startsWith(`tables-${connId}-`)) {
                             loadingNodesRef.current.delete(loadingKey);
                         }
                     });
                     // Reset status recursively
                     setConnectionStates(prev => {
                         const next = { ...prev };
                         Object.keys(next).forEach(k => {
                             if (k === node.key || k.startsWith(`${node.key}-`)) {
                                 delete next[k];
                             }
                         });
                         return next;
                     });
                     // Collapse node and children
                     setExpandedKeys(prev => prev.filter(k => k !== node.key && !k.toString().startsWith(`${node.key}-`)));
                     // Reset loaded state recursively
                     setLoadedKeys(prev => prev.filter(k => k !== node.key && !k.toString().startsWith(`${node.key}-`)));
                     // Clear children (undefined to trigger reload)
                     setTreeData(origin => updateTreeData(origin, node.key, undefined));
                     closeTabsByConnection(String(node.key));
                     if (connId) {
                         void CloseConnection(connId).catch(() => undefined);
                     }
                     message.success(t('sidebar.msg.disconnectSuccess'));
                 }
             },
             {
                 key: 'delete',
                 label: t('sidebar.menu.deleteConnection'),
                 icon: <DeleteOutlined />,
                 danger: true,
                 onClick: () => {
                     Modal.confirm({
                         title: t('sidebar.modal.confirmDelete'),
                         content: t('sidebar.confirm.deleteConnection', { name: node.title }),
                         onOk: async () => {
                             const connId = String(node.key);
                             try {
                                 await DeleteConnection(connId);
                                 closeTabsByConnection(connId);
                                 removeConnection(connId);
                                 message.success(t('sidebar.msg.connDeleted'));
                             } catch (error: unknown) {
                                 message.error(getErrorMessage(error) || t('sidebar.msg.deleteConnError'));
                                 throw error;
                             }
                         }
                     });
                 }
             }
        ];
    } else if (node.type === 'redis-db') {
        // Redis database menu
        const { id, redisDB } = getSidebarDataRef<SidebarNodeData>(node);
        return [
            {
                key: 'open-keys',
                label: t('sidebar.menu.browseKeys'),
                icon: <KeyOutlined />,
                onClick: () => {
                    addTab({
                        id: `redis-keys-${id}-db${redisDB}`,
                        title: `db${redisDB}`,
                        type: 'redis-keys',
                        connectionId: id,
                        redisDB: redisDB
                    });
                }
            },
            {
                key: 'new-command',
                label: t('sidebar.menu.newCommandWindow'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    addTab({
                        id: `redis-cmd-${id}-db${redisDB}-${Date.now()}`,
                        title: t('sidebar.tree.commandDb', { db: redisDB }),
                        type: 'redis-command',
                        connectionId: id,
                        redisDB: redisDB
                    });
                }
            },
            {
                key: 'open-monitor',
                label: t('sidebar.menu.redisMonitor'),
                icon: <DashboardOutlined />,
                onClick: () => {
                    addTab({
                        id: `redis-monitor-${id}-db${redisDB}-${Date.now()}`,
                        title: t('sidebar.tree.monitorDb', { db: redisDB }),
                        type: 'redis-monitor',
                        connectionId: id,
                        redisDB: redisDB
                    });
                }
            }
        ];
    } else if (node.type === 'database') {
       return [
           {
               key: 'new-table',
               label: t('sidebar.menu.newTable'),
               icon: <TableOutlined />,
               onClick: () => openNewTableDesign(node)
           },
           {
               key: 'rename-db',
               label: t('sidebar.menu.renameDatabase'),
               icon: <EditOutlined />,
               onClick: () => {
                   setRenameDbTarget(node);
                   renameDbForm.setFieldsValue({ newName: nodeData.dbName || '' });
                   setIsRenameDbModalOpen(true);
               }
           },
           {
               key: 'danger-zone',
               label: t('sidebar.menu.dangerOps'),
               icon: <WarningOutlined />,
               children: [
                   {
                       key: 'drop-db',
                       label: t('sidebar.menu.deleteDatabase'),
                       icon: <DeleteOutlined />,
                       danger: true,
                       onClick: () => handleDeleteDatabase(node)
                   }
               ]
           },
           {
               key: 'refresh',
               label: t('sidebar.menu.refresh'),
               icon: <ReloadOutlined />,
               onClick: () => loadTables(node)
           },
           {
               key: 'export-db-schema',
               label: t('sidebar.menu.exportAllSchema'),
               icon: <ExportOutlined />,
               onClick: () => handleExportDatabaseSQL(node, false)
           },
           {
               key: 'backup-db-sql',
               label: t('sidebar.menu.backupAllTables'),
               icon: <SaveOutlined />,
               onClick: () => handleExportDatabaseSQL(node, true)
           },
           { type: 'divider' },
           {
               key: 'disconnect-db',
               label: t('sidebar.menu.closeDatabase'),
               icon: <DisconnectOutlined />,
               onClick: () => {
                   const dbConnId = String(nodeData.id || '');
                   const dbName = String(nodeData.dbName || node.title || '').trim();
                   loadingNodesRef.current.delete(`tables-${dbConnId}-${dbName}`);
                   setConnectionStates(prev => {
                       const next = { ...prev };
                       delete next[node.key];
                       return next;
                   });
                   setExpandedKeys(prev => prev.filter(k => k !== node.key && !k.toString().startsWith(`${node.key}-`)));
                   setLoadedKeys(prev => prev.filter(k => k !== node.key && !k.toString().startsWith(`${node.key}-`)));
                   setTreeData(origin => updateTreeData(origin, node.key, undefined));
                   if (dbConnId && dbName) {
                       closeTabsByDatabase(dbConnId, dbName);
                   }
                   message.success(t('sidebar.msg.dbClosed'));
               }
           },
           {
               key: 'new-query',
               label: t('sidebar.menu.newQuery'),
               icon: <ConsoleSqlOutlined />,
               onClick: () => {
                   addTab({
                       id: `query-${Date.now()}`,
                       title: t('sidebar.tree.newQueryInDb', { name: node.title }),
                       type: 'query',
                       connectionId: nodeData.id,
                       dbName: nodeData.dbName || String(node.title || ''),
                       query: ''
                   });
               }
             },
             {
                 key: 'run-sql',
                 label: t('sidebar.menu.runExternalSql'),
                 icon: <FileAddOutlined />,
                 onClick: () => handleRunSQLFile(node)
             }
       ];
    } else if (node.type === 'view') {
        return [
            {
                key: 'open-view',
                label: t('sidebar.menu.browseViewData'),
                icon: <EyeOutlined />,
                onClick: () => onDoubleClick(null, node)
            },
            {
                key: 'view-definition',
                label: t('sidebar.menu.viewDefinition'),
                icon: <CodeOutlined />,
                onClick: () => openViewDefinition(node)
            },
            { type: 'divider' },
            {
                key: 'edit-view',
                label: t('sidebar.menu.editView'),
                icon: <EditOutlined />,
                onClick: () => openEditView(node)
            },
            {
                key: 'new-query',
                label: t('sidebar.menu.newQuery'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    addTab({
                        id: `query-${Date.now()}`,
                        title: t('sidebar.tree.newQueryTab'),
                        type: 'query',
                        connectionId: nodeData.id,
                        dbName: nodeData.dbName,
                        query: ''
                    });
                }
            },
            { type: 'divider' },
            {
                key: 'rename-view',
                label: t('sidebar.menu.renameView'),
                icon: <EditOutlined />,
                onClick: () => {
                    setRenameViewTarget(node);
                    renameViewForm.setFieldsValue({ newName: extractObjectName(nodeData.viewName || String(node.title || '')) });
                    setIsRenameViewModalOpen(true);
                }
            },
            {
                key: 'danger-zone',
                label: t('sidebar.menu.dangerOps'),
                icon: <WarningOutlined />,
                children: [
                    {
                        key: 'drop-view',
                        label: t('sidebar.menu.deleteView'),
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => handleDropView(node)
                    }
                ]
            },
        ];
    } else if (node.type === 'routine') {
        const routineType = nodeData.routineType || 'FUNCTION';
        const typeLabel = routineType === 'PROCEDURE' ? t('sidebar.tree.procedure') : t('sidebar.tree.function');
        return [
            {
                key: 'view-routine-def',
                label: t('sidebar.menu.viewRoutineDef'),
                icon: <CodeOutlined />,
                onClick: () => openRoutineDefinition(node)
            },
            {
                key: 'edit-routine',
                label: t('sidebar.menu.editRoutineDef'),
                icon: <EditOutlined />,
                onClick: () => openEditRoutine(node)
            },
            { type: 'divider' },
            {
                key: 'danger-zone',
                label: t('sidebar.menu.dangerOps'),
                icon: <WarningOutlined />,
                children: [
                    {
                        key: 'drop-routine',
                        label: t('sidebar.menu.deleteRoutine', { type: typeLabel }),
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => handleDropRoutine(node)
                    }
                ]
            },
        ];
    } else if (node.type === 'table') {
        return [
            {
                key: 'new-query',
                label: t('sidebar.menu.newQuery'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                   const tableName = String(nodeData.tableName || '').trim();
                   const queryTemplate = buildTableSelectQuery(getMetadataDialect(nodeData), tableName);
                   addTab({
                       id: `query-${Date.now()}`,
                       title: t('sidebar.tree.newQueryTab'),
                       type: 'query',
                       connectionId: nodeData.id,
                       dbName: nodeData.dbName,
                       query: queryTemplate
                   });
                }
            },
            { type: 'divider' },
            {
                key: 'design-table',
                label: t('sidebar.menu.designTable'),
                icon: <EditOutlined />,
                onClick: () => openDesign(node, 'columns', false)
            },
            {
                key: 'copy-structure',
                label: t('sidebar.menu.copyTableSchema'),
                icon: <CopyOutlined />,
                onClick: () => handleCopyStructure(node)
            },
            {
                key: 'backup-table',
                label: t('sidebar.menu.backupTable'),
                icon: <SaveOutlined />,
                onClick: () => handleExport(node, 'sql')
            },
            {
                key: 'rename-table',
                label: t('sidebar.menu.renameTable'),
                icon: <EditOutlined />,
                onClick: () => {
                    setRenameTableTarget(node);
                    renameTableForm.setFieldsValue({ newName: extractObjectName(nodeData.tableName || String(node.title || '')) });
                    setIsRenameTableModalOpen(true);
                }
            },
            {
                key: 'danger-zone',
                label: t('sidebar.menu.dangerOps'),
                icon: <WarningOutlined />,
                children: [
                    ...(supportsTableTruncateAction(nodeData.config?.type, nodeData.config?.driver) ? [{
                        key: 'truncate-table',
                        label: t('sidebar.menu.truncateTable'),
                        danger: true,
                        onClick: () => handleTableDataDangerAction(node, 'truncate')
                    }] : []),
                    {
                        key: 'clear-table',
                        label: t('sidebar.menu.clearTable'),
                        danger: true,
                        onClick: () => handleTableDataDangerAction(node, 'clear')
                    },
                    {
                        key: 'drop-table',
                        label: t('sidebar.menu.deleteTable'),
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => handleDeleteTable(node)
                    }
                ]
            },
            {
                type: 'divider'
            },
            {
                key: 'export',
                label: t('sidebar.menu.exportTableData'),
                icon: <ExportOutlined />,
                children: [
                    { key: 'export-csv', label: t('sidebar.menu.exportCsv'), onClick: () => handleExport(node, 'csv') },
                    { key: 'export-xlsx', label: t('sidebar.menu.exportExcel'), onClick: () => handleExport(node, 'xlsx') },
                    { key: 'export-json', label: t('sidebar.menu.exportJson'), onClick: () => handleExport(node, 'json') },
                    { key: 'export-md', label: t('sidebar.menu.exportMarkdown'), onClick: () => handleExport(node, 'md') },
                    { key: 'export-html', label: t('sidebar.menu.exportHtml'), onClick: () => handleExport(node, 'html') },
                ]
            }
        ];
    }

    // 已存查询节点的右键菜单
    if (node.type === 'saved-query') {
        const q = getSidebarDataRef<SidebarSavedQueryData>(node);
        return [
            {
                key: 'open-query',
                label: t('sidebar.menu.openQuery'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    addTab({
                        id: q.id,
                        title: q.name,
                        type: 'query',
                        connectionId: q.connectionId,
                        dbName: q.dbName,
                        query: q.sql,
                        savedQueryId: q.id,
                    });
                }
            },
            { type: 'divider' },
            {
                key: 'delete-query',
                label: t('sidebar.menu.deleteQuery'),
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                    Modal.confirm({
                        title: t('sidebar.modal.confirmDelete'),
                        content: t('sidebar.modal.deleteQueryContent', { name: q.name }),
                        okButtonProps: { danger: true },
                        onOk: () => {
                            deleteQuery(q.id);
                            // 从树中移除节点
                            setTreeData(origin => {
                                const removeNode = (list: TreeNode[]): TreeNode[] =>
                                    list
                                        .filter(n => n.key !== node.key)
                                        .map(n => n.children ? { ...n, children: removeNode(n.children) } : n);
                                return removeNode(origin);
                            });
                            message.success(t('sidebar.msg.queryDeleted'));
                        }
                    });
                }
            }
        ];
    }

    if (node.type === 'external-sql-root') {
        return [
            {
                key: 'upload-external-sql-file',
                label: t('sidebar.menu.uploadSql'),
                icon: <FileAddOutlined />,
                onClick: () => {
                    void handleUploadExternalSQLFile(node);
                }
            },
            {
                key: 'create-external-sql-directory',
                label: t('sidebar.menu.newDirectory'),
                icon: <PlusOutlined />,
                onClick: () => {
                    void handleCreateExternalSQLDirectory(node);
                }
            },
            {
                key: 'refresh-external-sql-directory',
                label: t('sidebar.menu.refresh'),
                icon: <ReloadOutlined />,
                onClick: () => {
                    void handleRefreshExternalSQLDirectory(node);
                }
            }
        ];
    }

    if (node.type === 'external-sql-folder') {
        return [
            {
                key: 'upload-external-sql-file',
                label: t('sidebar.menu.uploadSql'),
                icon: <FileAddOutlined />,
                onClick: () => {
                    void handleUploadExternalSQLFile(node);
                }
            },
            {
                key: 'create-external-sql-directory',
                label: t('sidebar.menu.newDirectory'),
                icon: <PlusOutlined />,
                onClick: () => {
                    void handleCreateExternalSQLDirectory(node);
                }
            },
            {
                key: 'rename-external-sql-path',
                label: t('sidebar.menu.rename'),
                icon: <EditOutlined />,
                onClick: () => {
                    void handleRenameExternalSQLPath(node);
                }
            },
            {
                key: 'refresh-external-sql-directory',
                label: t('sidebar.menu.refresh'),
                icon: <ReloadOutlined />,
                onClick: () => {
                    void handleRefreshExternalSQLDirectory(node);
                }
            }
        ];
    }

    if (node.type === 'external-sql-file') {
        return [
            {
                key: 'open-external-sql-file',
                label: t('sidebar.menu.openSqlFile'),
                icon: <ConsoleSqlOutlined />,
                onClick: () => {
                    void openExternalSQLFile(node);
                }
            },
            {
                key: 'rename-external-sql-path',
                label: t('sidebar.menu.rename'),
                icon: <EditOutlined />,
                onClick: () => {
                    void handleRenameExternalSQLPath(node);
                }
            }
        ];
    }

    return [];
  };

  const titleRender = (node: TreeNode) => {
    let status: 'success' | 'error' | 'default' = 'default';
    if (node.type === 'connection' || node.type === 'database') {
        if (connectionStates[node.key] === 'success') status = 'success';
        else if (connectionStates[node.key] === 'error') status = 'error';
    }

    const statusBadge = node.type === 'connection' || node.type === 'database' ? (
        <Badge status={status} className="sidebar-tree-node-status" />
    ) : null;

    const displayTitle = String(node.title ?? '');
    const dataRef = getSidebarDataRef(node);
    let hoverTitle = displayTitle;
    if (node.type === 'table' || node.type === 'view') {
        const rawTableName = String(dataRef.tableName || dataRef.viewName || '').trim();
        const tableComment = String(dataRef.comment || dataRef.tableComment || '').trim();
        hoverTitle = buildTableHoverTitle({ tableName: rawTableName || displayTitle, comment: tableComment, tableNameLabel: t('table.hover.name'), commentLabel: t('table.hover.comment') });
    } else if (node.type === 'external-sql-folder' || node.type === 'external-sql-file') {
        hoverTitle = String(dataRef.path || displayTitle);
    }

    if (node.type === 'external-sql-root') {
        return (
            <span title={hoverTitle} className="sidebar-tree-node-title">
                {statusBadge}
                <span className="sidebar-tree-node-label">{displayTitle}</span>
                <Button
                    className="sidebar-tree-node-action"
                    size="small"
                    type="text"
                    icon={<FileAddOutlined />}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleUploadExternalSQLFile(node);
                    }}
                    style={{ paddingInline: 4, height: 20 }}
                />
            </span>
        );
    }

    return (
        <span title={hoverTitle} className="sidebar-tree-node-title">
            {statusBadge}
            <span className="sidebar-tree-node-label">{displayTitle}</span>
        </span>
    );
  };

  const handleDrop = (info: SidebarDropInfo) => {
      const dropPos = info.node.pos.split('-');
      const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

      const dragNode = info.dragNode;
      const dropNode = info.node;

      // Tag to Tag reordering
      if (dragNode.type === 'tag') {
          // You can only drop tags onto the root level (before/after other tags or connections at root)
          if (dropNode.type === 'tag' || dropNode.type === 'connection') {
              // Get current order
              const currentTagOrder = connectionTags.map(t => t.id);
              const dragTagId = String(getSidebarDataRef(dragNode).id || '');

              // Filter out the dragging tag
              const newOrder = currentTagOrder.filter(id => id !== dragTagId);

              let insertIndex = newOrder.length;
              if (dropNode.type === 'tag') {
                  const dropTagId = String(getSidebarDataRef(dropNode).id || '');
                  const dropIndex = newOrder.indexOf(dropTagId);

                  if (dropPosition === -1) {
                      insertIndex = dropIndex;
                  } else {
                      insertIndex = dropIndex + 1;
                  }
              } else {
                  // Dropped onto a root connection, usually meaning moving to the end of tags
                  // Since tags are always displayed before ungrouped connections, just put it at the end
                  insertIndex = newOrder.length;
              }

              newOrder.splice(insertIndex, 0, dragTagId);
              reorderTags(newOrder);
          }
          return;
      }

      // Connection moving to tag (any drop position on a tag node counts as "into")
      if (dragNode.type === 'connection' && dropNode.type === 'tag') {
          moveConnectionToTag(String(dragNode.key), String(getSidebarDataRef(dropNode).id || ''));
          return;
      }

      // Connection moving to another connection inside a tag
      if (dragNode.type === 'connection' && dropNode.type === 'connection') {
          // Find if drop target is under a tag
          const targetTag = connectionTags.find(t => t.connectionIds.includes(String(dropNode.key)));
          if (targetTag) {
              moveConnectionToTag(String(dragNode.key), targetTag.id);
              return;
          }

          // Drop target is NOT under a tag (ungrouped) -> move OUT of tag
          const sourceTag = connectionTags.find(t => t.connectionIds.includes(String(dragNode.key)));
          if (sourceTag) {
              moveConnectionToTag(String(dragNode.key), null);
              return;
          }
      }
  };

  const onRightClick = ({ event, node }: SidebarRightClickInfo) => {
      const items = getNodeMenuItems(node);
      if (items && items.length > 0) {
          setContextMenu({
              x: event.clientX,
              y: event.clientY,
              items
          });
      }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}` }}>
            <Input
                {...noAutoCapInputProps}
                ref={searchInputRef}
                placeholder={t('sidebar.search.placeholder')}
                onChange={onSearch}
                size="small"
                prefix={<SearchOutlined style={{ color: darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', marginRight: 4 }} />}
                style={{
                    borderRadius: 6,
                    border: 'none',
                    background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.03)',
                    boxShadow: 'none',
                    padding: '4px 8px',
                    color: darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)',
                }}
                suffix={
                    <Popover
                        content={searchScopePopoverContent}
                        trigger="click"
                        placement="bottomRight"
                        open={isSearchScopePopoverOpen}
                        onOpenChange={setIsSearchScopePopoverOpen}
                        styles={{ body: { padding: 0, borderRadius: 16, overflow: 'hidden' } }}
                    >
                        <Tooltip title={t('sidebar.searchScope.tooltip', { scope: searchScopeSummary })}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    background: isSearchScopePopoverOpen
                                        ? (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)')
                                        : 'transparent',
                                    transition: 'background 0.2s',
                                    color: searchScopes.includes('smart')
                                        ? (darkMode ? '#ffd666' : '#1677ff')
                                        : (darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'),
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSearchScopePopoverOpen) {
                                      e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
                                      e.currentTarget.style.color = darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSearchScopePopoverOpen) {
                                      e.currentTarget.style.background = 'transparent';
                                      e.currentTarget.style.color = searchScopes.includes('smart')
                                          ? (darkMode ? '#ffd666' : '#1677ff')
                                          : (darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)');
                                    }
                                }}
                            >
                                <FilterOutlined style={{ fontSize: 13 }} />
                                <span style={{ fontSize: 12, fontWeight: 500 }}>
                                    {searchScopes.includes('smart') ? t('sidebar.searchScope.smartCompact') : searchScopes.length}
                                </span>
                            </div>
                        </Tooltip>
                    </Popover>
                }
            />
        </div>

        {/* Toolbar */}
        <div style={{ padding: '6px 16px', display: 'flex', gap: 8, justifyContent: 'space-between', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`, borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`, background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.015)' }}>
            <Tooltip title={t('sidebar.treeCollapse')}>
                <Button aria-label={t('sidebar.treeCollapse')} size="small" type="text" icon={<CompressOutlined />} onClick={handleCollapseTree} style={{ color: darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} />
            </Tooltip>
            <Tooltip title={t('sidebar.locateCurrentTable')}>
                <Button aria-label={t('sidebar.locateCurrentTable')} size="small" type="text" icon={<AimOutlined />} onClick={() => void handleLocateActiveTable()} style={{ color: darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} />
            </Tooltip>
            <Tooltip title={t('sidebar.tooltip.newGroup')}>
                <Button size="small" type="text" icon={<FolderOpenOutlined />} onClick={() => { setRenameViewTarget(null); createTagForm.resetFields(); setIsCreateTagModalOpen(true); }} style={{ color: darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} />
            </Tooltip>
            <Tooltip title={t('sidebar.tooltip.batchTables')}>
                <Button size="small" type="text" icon={<TableOutlined />} onClick={() => openBatchOperationModal()} style={{ color: darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} />
            </Tooltip>
            <Tooltip title={t('sidebar.tooltip.batchDbs')}>
                <Button size="small" type="text" icon={<DatabaseOutlined />} onClick={() => openBatchDatabaseModal()} style={{ color: darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} />
            </Tooltip>
            <Tooltip title={t('sidebar.tooltip.runExternalSql')}>
                <Button size="small" type="text" icon={<FileAddOutlined />} onClick={handleOpenSQLFileFromToolbar} style={{ color: darkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} />
            </Tooltip>
        </div>

        <div
            ref={treeContainerRef}
            className="sidebar-tree-scroll-shell"
            style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}
        >
            <div className="sidebar-tree-scroll-content">
                <Tree<TreeNode>
                    ref={treeRef}
                    showIcon
                    tabIndex={0}
                    onKeyDown={handleSidebarTreeKeyDown}
                    draggable={{
                        icon: false,
                        nodeDraggable: (node) => {
                            const sidebarNode = node as TreeNode;
                            return sidebarNode.type === 'connection' || sidebarNode.type === 'tag';
                        }
                    }}
                    onDrop={handleDrop}
                    loadData={onLoadData}
                    treeData={displayTreeData}
                    onDoubleClick={onDoubleClick}
                    onSelect={onSelect}
                    titleRender={titleRender}
                    expandedKeys={expandedKeys}
                    onExpand={onExpand}
                    loadedKeys={loadedKeys}
                    onLoad={setLoadedKeys}
                    autoExpandParent={autoExpandParent}
                    selectedKeys={selectedKeys}
                    blockNode
                    height={treeHeight}
                    onRightClick={onRightClick}
                />
            </div>
        </div>

        <input
            ref={externalSqlUploadInputRef}
            type="file"
            accept=".sql"
            style={{ display: 'none' }}
            onChange={handleExternalSQLFileSelected}
        />
        <input
            ref={openSqlUploadInputRef}
            type="file"
            accept=".sql"
            style={{ display: 'none' }}
            onChange={handleOpenSQLUploadSelected}
        />

        {contextMenu && (
            <Dropdown
                menu={{ items: contextMenu.items }}
                open={true}
                onOpenChange={(open) => { if (!open) setContextMenu(null); }}
                trigger={['contextMenu']}
            >
                <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, width: 1, height: 1 }} />
            </Dropdown>
        )}

        <Modal
            title={renderSidebarModalTitle(
                <FolderOpenOutlined />,
                renameViewTarget?.type === 'tag' ? t('sidebar.modal.editTagGroup') : t('sidebar.modal.newGroup'),
                renameViewTarget?.type === 'tag' ? t('sidebar.modal.editTagDesc') : t('sidebar.modal.newGroupDesc')
            )}
            open={isCreateTagModalOpen}
            centered
            styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
            onOk={() => {
                createTagForm.validateFields().then(values => {
                    if (renameViewTarget?.type === 'tag') {
                        const tag = getSidebarDataRef(renameViewTarget) as unknown as ConnectionTag;
                        updateConnectionTag({
                            ...tag,
                            name: String(values.name || ''),
                            connectionIds: values.connectionIds || []
                        });
                        // update cross-connections
                        const allOtherTagsIds = connectionTags.filter(t => t.id !== tag.id).flatMap(t => t.connectionIds);
                        (values.connectionIds || []).forEach((cid: string) => {
                           if (allOtherTagsIds.includes(cid)) {
                               moveConnectionToTag(cid, tag.id);
                           }
                        });
                    } else {
                        // Create
                        const tagId = Date.now().toString();
                        addConnectionTag({
                            id: tagId,
                            name: values.name,
                            connectionIds: values.connectionIds || []
                        });
                        (values.connectionIds || []).forEach((cid: string) => {
                            moveConnectionToTag(cid, tagId);
                        });
                    }
                    setIsCreateTagModalOpen(false);
                });
            }}
            onCancel={() => setIsCreateTagModalOpen(false)}
        >
            <Form form={createTagForm} layout="vertical">
                <div style={modalSectionStyle}>
                    <Form.Item name="name" label={t('sidebar.modal.tagName')} rules={[{ required: true, message: t('sidebar.modal.enterTagName') }]}>
                        <Input placeholder={t('sidebar.modal.tagPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="connectionIds" label={t('sidebar.modal.selectConnections')} style={{ marginBottom: 0 }}>
                        <Checkbox.Group style={{ width: '100%' }}>
                            <div style={modalScrollSectionStyle}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    {connections.map(conn => (
                                        <Checkbox key={conn.id} value={conn.id}>
                                            {conn.name} {conn.config.host ? `(${conn.config.host})` : ''}
                                        </Checkbox>
                                    ))}
                                </Space>
                            </div>
                        </Checkbox.Group>
                    </Form.Item>
                </div>
            </Form>
        </Modal>

        <Modal
            title={t('sidebar.modal.newDatabase')}
            open={isCreateDbModalOpen}
            onOk={handleCreateDatabase}
            onCancel={() => setIsCreateDbModalOpen(false)}
        >
            <Form form={createDbForm} layout="vertical">
                <Form.Item name="name" label={t('sidebar.modal.dbName')} rules={[{ required: true, message: t('sidebar.modal.enterDbName') }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
                {/* Charset option could be added here */}
            </Form>
        </Modal>

        <Modal
            title={t('sidebar.modal.renameDatabase', { suffix: getSidebarDataRef(renameDbTarget).dbName ? ` (${getSidebarDataRef(renameDbTarget).dbName})` : '' })}
            open={isRenameDbModalOpen}
            onOk={handleRenameDatabase}
            onCancel={() => {
                setIsRenameDbModalOpen(false);
                setRenameDbTarget(null);
                renameDbForm.resetFields();
            }}
        >
            <Form form={renameDbForm} layout="vertical">
                <Form.Item name="newName" label={t('sidebar.modal.newDbName')} rules={[{ required: true, message: t('sidebar.modal.enterNewDbName') }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={t('sidebar.modal.renameTable', { suffix: getSidebarDataRef(renameTableTarget).tableName ? ` (${getSidebarDataRef(renameTableTarget).tableName})` : '' })}
            open={isRenameTableModalOpen}
            onOk={handleRenameTable}
            onCancel={() => {
                setIsRenameTableModalOpen(false);
                setRenameTableTarget(null);
                renameTableForm.resetFields();
            }}
        >
            <Form form={renameTableForm} layout="vertical">
                <Form.Item name="newName" label={t('sidebar.modal.newTableName')} rules={[{ required: true, message: t('sidebar.modal.enterNewTableName') }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={t('sidebar.modal.renameView', { suffix: getSidebarDataRef(renameViewTarget).viewName ? ` (${getSidebarDataRef(renameViewTarget).viewName})` : '' })}
            open={isRenameViewModalOpen}
            onOk={handleRenameView}
            onCancel={() => {
                setIsRenameViewModalOpen(false);
                setRenameViewTarget(null);
                renameViewForm.resetFields();
            }}
        >
            <Form form={renameViewForm} layout="vertical">
                <Form.Item name="newName" label={t('sidebar.modal.newViewName')} rules={[{ required: true, message: t('sidebar.modal.enterNewViewName') }]}>
                    <Input {...noAutoCapInputProps} />
                </Form.Item>
            </Form>
        </Modal>

        <Modal
            title={renderSidebarModalTitle(<TableOutlined />, t('sidebar.modal.batchTables'), t('sidebar.modal.batchTablesDesc'))}
            open={isBatchModalOpen}
            onCancel={() => setIsBatchModalOpen(false)}
            width={720}
            centered
            styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Button key="cancel" onClick={() => setIsBatchModalOpen(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Space size={8} wrap style={{ marginLeft: 'auto' }}>
                        <Button
                            key="clear"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleBatchClear()}
                            disabled={checkedTableKeys.length === 0}
                        >
                            {t('sidebar.menu.clearTable')}
                        </Button>
                        <Button
                            key="export-schema"
                            icon={<ExportOutlined />}
                            onClick={() => handleBatchExport('schema')}
                            disabled={checkedTableKeys.length === 0}
                        >
                            {t('sidebar.modal.exportSchema')}
                        </Button>
                        <Button
                            key="export-data-only"
                            icon={<SaveOutlined />}
                            onClick={() => handleBatchExport('dataOnly')}
                            disabled={checkedTableKeys.length === 0}
                        >
                            {t('sidebar.modal.exportDataOnly')}
                        </Button>
                        <Button
                            key="backup"
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={() => handleBatchExport('backup')}
                            disabled={checkedTableKeys.length === 0}
                        >
                            {t('sidebar.modal.backup')}
                        </Button>
                    </Space>
                </div>
            }
        >
            <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('sidebar.modal.selectConnection')}</label>
                    <Select
                        value={selectedConnection}
                        onChange={handleConnectionChange}
                        style={{ width: '100%' }}
                        placeholder={t('sidebar.modal.selectConnectionPlaceholder')}
                    >
                        {connections.filter(c => c.config.type !== 'redis').map(conn => (
                            <Select.Option key={conn.id} value={conn.id}>
                                {conn.name}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
                <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('sidebar.modal.selectDatabase')}</label>
                    <Select
                        value={selectedDatabase}
                        onChange={handleDatabaseChange}
                        style={{ width: '100%' }}
                        placeholder={t('sidebar.modal.selectConnectionFirst')}
                        disabled={!selectedConnection}
                    >
                        {availableDatabases.map(db => (
                            <Select.Option key={db.key} value={db.dbName}>
                                {db.title}
                            </Select.Option>
                        ))}
                    </Select>
                </div>
                <div style={modalHintTextStyle}>{t('sidebar.modal.batchTablesHint')}</div>
            </div>

            {batchTables.length > 0 && (
                <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                    <Space wrap size={8} style={{ width: '100%' }}>
                        <Input
                            allowClear
                            value={batchFilterKeyword}
                            onChange={(e) => setBatchFilterKeyword(e.target.value)}
                            placeholder={t('sidebar.modal.filterObjectsPlaceholder')}
                            prefix={<SearchOutlined />}
                            style={{ width: 260 }}
                        />
                        <Select
                            value={batchFilterType}
                            onChange={(value) => setBatchFilterType(value as BatchObjectFilterType)}
                            style={{ width: 140 }}
                            options={[
                                { label: t('sidebar.modal.allObjects'), value: 'all' },
                                { label: t('sidebar.modal.tablesOnly'), value: 'table' },
                                { label: t('sidebar.modal.viewsOnly'), value: 'view' },
                            ]}
                        />
                        <Select
                            value={batchSelectionScope}
                            onChange={(value) => setBatchSelectionScope(value as BatchSelectionScope)}
                            style={{ width: 220 }}
                            options={[
                                { label: t('sidebar.modal.checkScopeFiltered'), value: 'filtered' },
                                { label: t('sidebar.modal.checkScopeAll'), value: 'all' },
                            ]}
                        />
                    </Space>
                    <div style={{ marginTop: 6, color: '#999', fontSize: 12 }}>
                        {t('sidebar.modal.filteredHitCount', { matched: filteredBatchObjects.length, total: batchTables.length })}
                    </div>
                </div>
            )}

            {batchTables.length > 0 && (
                <>
                    <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                        <Space>
                            <Button
                                size="small"
                                onClick={() => handleCheckAll(true)}
                                disabled={selectionScopeTargetKeys.length === 0}
                            >
                                {t('common.selectAll')}
                            </Button>
                            <Button
                                size="small"
                                onClick={() => handleCheckAll(false)}
                                disabled={selectionScopeTargetKeys.length === 0}
                            >
                                {t('common.deselectAll')}
                            </Button>
                            <Button
                                size="small"
                                onClick={handleInvertSelection}
                                disabled={selectionScopeTargetKeys.length === 0}
                            >
                                {t('common.invertSelection')}
                            </Button>
                            <span style={{ color: '#999' }}>
                                {t('sidebar.modal.selectedObjectCount', { selected: checkedTableKeys.length, total: batchTables.length })}
                            </span>
                        </Space>
                    </div>
                    <div style={modalScrollSectionStyle}>
                        <Checkbox.Group
                            value={checkedTableKeys}
                            onChange={(values) => setCheckedTableKeys(values as string[])}
                            style={{ width: '100%' }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {groupedBatchObjects.tables.length > 0 && (
                                    <div>
                                        <div style={{ marginBottom: 6, color: darkMode ? '#bfbfbf' : '#595959', fontSize: 12 }}>
                                            {t('sidebar.tree.tables')} ({groupedBatchObjects.tables.length})
                                        </div>
                                        <Space direction="vertical" style={{ width: '100%' }}>
                                            {groupedBatchObjects.tables.map(table => (
                                                <Checkbox key={table.key} value={table.key}>
                                                    <TableOutlined style={{ marginRight: 8 }} />
                                                    {table.title}
                                                </Checkbox>
                                            ))}
                                        </Space>
                                    </div>
                                )}
                                {groupedBatchObjects.views.length > 0 && (
                                    <div>
                                        <div style={{ marginBottom: 6, color: darkMode ? '#bfbfbf' : '#595959', fontSize: 12 }}>
                                            {t('sidebar.tree.views')} ({groupedBatchObjects.views.length})
                                        </div>
                                        <Space direction="vertical" style={{ width: '100%' }}>
                                            {groupedBatchObjects.views.map(view => (
                                                <Checkbox key={view.key} value={view.key}>
                                                    <EyeOutlined style={{ marginRight: 8 }} />
                                                    {view.title}
                                                </Checkbox>
                                            ))}
                                        </Space>
                                    </div>
                                )}
                                {groupedBatchObjects.tables.length === 0 && groupedBatchObjects.views.length === 0 && (
                                    <div style={{ color: '#999', padding: '8px 0' }}>
                                        {t('sidebar.modal.noMatchingObjects')}
                                    </div>
                                )}
                            </div>
                        </Checkbox.Group>
                    </div>
                </>
            )}
        </Modal>

        <Modal
            title={renderSidebarModalTitle(<DatabaseOutlined />, t('sidebar.modal.batchDbs'), t('sidebar.modal.batchDbsDesc'))}
            open={isBatchDbModalOpen}
            onCancel={() => setIsBatchDbModalOpen(false)}
            width={640}
            centered
            styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 10 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 12 } }}
            footer={[
                <Button key="cancel" onClick={() => setIsBatchDbModalOpen(false)}>
                    {t('common.cancel')}
                </Button>,
                <Button
                    key="export-schema"
                    icon={<ExportOutlined />}
                    onClick={() => handleBatchDbExport(false)}
                    disabled={checkedDbKeys.length === 0}
                >
                    {t('sidebar.modal.exportDbSchemaCount', { count: checkedDbKeys.length })}
                </Button>,
                <Button
                    key="backup"
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={() => handleBatchDbExport(true)}
                    disabled={checkedDbKeys.length === 0}
                >
                    {t('sidebar.modal.backupDbCount', { count: checkedDbKeys.length })}
                </Button>
            ]}
        >
            <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: darkMode ? '#f5f7ff' : '#162033' }}>{t('sidebar.modal.selectConnection')}</label>
                <Select
                    value={selectedDbConnection}
                    onChange={handleDbConnectionChange}
                    style={{ width: '100%' }}
                    placeholder={t('sidebar.modal.selectConnectionPlaceholder')}
                >
                    {connections.filter(c => c.config.type !== 'redis').map(conn => (
                        <Select.Option key={conn.id} value={conn.id}>
                            {conn.name}
                        </Select.Option>
                    ))}
                </Select>
                <div style={{ ...modalHintTextStyle, marginTop: 10 }}>{t('sidebar.modal.batchDbsHint')}</div>
            </div>

            {batchDatabases.length > 0 && (
                <>
                    <div style={{ ...modalSectionStyle, marginBottom: 16 }}>
                        <Space>
                            <Button
                                size="small"
                                onClick={() => handleCheckAllDb(true)}
                            >
                                {t('common.selectAll')}
                            </Button>
                            <Button
                                size="small"
                                onClick={() => handleCheckAllDb(false)}
                            >
                                {t('common.deselectAll')}
                            </Button>
                            <Button
                                size="small"
                                onClick={handleInvertSelectionDb}
                            >
                                {t('common.invertSelection')}
                            </Button>
                            <span style={{ color: '#999' }}>
                                {t('sidebar.modal.selectedDbCount', { selected: checkedDbKeys.length, total: batchDatabases.length })}
                            </span>
                        </Space>
                    </div>
                    <div style={modalScrollSectionStyle}>
                        <Checkbox.Group
                            value={checkedDbKeys}
                            onChange={(values) => setCheckedDbKeys(values as string[])}
                            style={{ width: '100%' }}
                        >
                            <Space direction="vertical" style={{ width: '100%' }}>
                                {batchDatabases.map(db => (
                                    <Checkbox key={db.key} value={db.key}>
                                        <DatabaseOutlined style={{ marginRight: 8 }} />
                                        {db.title}
                                    </Checkbox>
                                ))}
                            </Space>
                        </Checkbox.Group>
                    </div>
                </>
            )}
        </Modal>

        {/* SQL 文件流式执行进度 Modal */}
        <Modal
            title={t('sidebar.menu.runExternalSql')}
            open={sqlFileExecState.open}
            centered
            closable={sqlFileExecState.status !== 'running'}
            maskClosable={false}
            footer={sqlFileExecState.status === 'running' ? [
                <Button key="cancel" danger onClick={() => {
                    CancelSQLFileExecution(sqlFileExecState.jobId);
                    setSqlFileExecState(prev => ({ ...prev, status: 'cancelled' }));
                }}>
                    {t('sidebar.sqlExecution.cancel')}
                </Button>
            ] : [
                <Button key="close" type="primary" onClick={() => setSqlFileExecState(prev => ({ ...prev, open: false }))}>
                    {t('common.close')}
                </Button>
            ]}
            onCancel={() => {
                if (sqlFileExecState.status !== 'running') {
                    setSqlFileExecState(prev => ({ ...prev, open: false }));
                }
            }}
            styles={{ content: modalPanelStyle, header: { background: 'transparent', borderBottom: 'none' }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none' } }}
        >
            <div style={{ marginBottom: 16 }}>
                <Progress
                    percent={Math.round(sqlFileExecState.percent)}
                    status={sqlFileExecState.status === 'error' ? 'exception' : sqlFileExecState.status === 'done' ? 'success' : 'active'}
                    strokeColor={sqlFileExecState.status === 'cancelled' ? '#faad14' : undefined}
                />
            </div>
            <div style={{ fontSize: 13, lineHeight: '22px', marginBottom: 8 }}>
                <div>{t('sidebar.sqlExecution.fileSize')}：<strong>{sqlFileExecState.fileSizeMB} MB</strong></div>
                <div>{t('sidebar.sqlExecution.status')}：<strong>{
                    sqlFileExecState.status === 'running' ? t('sidebar.sqlExecution.running') :
                    sqlFileExecState.status === 'done' ? t('sidebar.sqlExecution.done') :
                    sqlFileExecState.status === 'cancelled' ? t('sidebar.sqlExecution.cancelled') : t('sidebar.sqlExecution.error')
                }</strong></div>
                <div>{t('sidebar.sqlExecution.executedFailed', { executed: sqlFileExecState.executed, failed: sqlFileExecState.failed })}</div>
            </div>
            {sqlFileExecState.currentSQL && sqlFileExecState.status === 'running' && (
                <div style={{ fontSize: 12, color: 'rgba(128,128,128,0.8)', background: 'rgba(128,128,128,0.06)', borderRadius: 6, padding: '6px 10px', marginTop: 8, fontFamily: 'monospace', wordBreak: 'break-all', maxHeight: 60, overflow: 'hidden' }}>
                    {sqlFileExecState.currentSQL}
                </div>
            )}
            {sqlFileExecState.resultMessage && sqlFileExecState.status !== 'running' && (
                <div style={{ fontSize: 12, marginTop: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'rgba(128,128,128,0.06)', borderRadius: 6, padding: '8px 12px' }}>
                    {sqlFileExecState.resultMessage}
                </div>
            )}
        </Modal>
        <FindInDatabaseModal
            open={findInDbContext.open}
            onClose={() => setFindInDbContext({ open: false, connectionId: '', dbName: '' })}
            connectionId={findInDbContext.connectionId}
            dbName={findInDbContext.dbName}
        />
    </div>
  );
};

export default Sidebar;
