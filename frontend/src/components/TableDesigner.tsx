import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Table, Tabs, Button, message, Input, Checkbox, Modal, AutoComplete, Tooltip, Select, Empty, Space, Tag, type TableColumnType } from 'antd';
import { ReloadOutlined, SaveOutlined, PlusOutlined, DeleteOutlined, MenuOutlined, FileTextOutlined, EyeOutlined, EditOutlined, ExclamationCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Editor from '@monaco-editor/react';
import { TabData, ColumnDefinition, IndexDefinition, ForeignKeyDefinition, TriggerDefinition } from '../types';
import { useStore } from '../store';
import { DBGetColumns, DBGetIndexes, DBQuery, DBGetForeignKeys, DBGetTriggers, DBShowCreateTable, type QueryResult } from '@compat/javanaviApp';
import { hasIndexFormChanged, normalizeIndexFormFromRow, shouldRestoreOriginalIndex, toggleIndexSelection as getNextIndexSelection, type IndexDisplaySnapshot } from './tableDesignerIndexUtils';
import { buildAlterTablePreviewSql, buildCreateTablePreviewSql, hasAlterTableDraftChanges } from './tableDesignerSchemaSql';
import TableDesignerSqlPreview from './TableDesignerSqlPreview';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { noAutoCapInputProps } from '../utils/inputAutoCap';
import { translate, type I18nKey, type I18nParams } from '../i18n';
import {
    isMysqlFamilyDialect as isMysqlFamilySqlDialect,
    isOracleLikeDialect as isOracleLikeSqlDialect,
    isPgLikeDialect as isPgLikeSqlDialect,
    isSqlServerDialect as isSqlServerSqlDialect,
    quoteSqlIdentifierPart,
    quoteSqlIdentifierPath,
    resolveColumnTypeOptions,
    resolveSqlDialect,
} from '../utils/sqlDialect';

interface EditableColumn extends ColumnDefinition {
    _key: string;
    isNew?: boolean;
    isAutoIncrement?: boolean; // Virtual field for UI
}

type EditableColumnValue = EditableColumn[keyof EditableColumn];
type ResizableColumn<RecordType extends object> = TableColumnType<RecordType> & {
    width?: number | string;
};
type ResizableColumnSetter<RecordType extends object> = React.Dispatch<React.SetStateAction<ResizableColumn<RecordType>[]>>;
type ResizeHeaderCellProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
    width?: number | string;
    onResizeStart?: (event: React.MouseEvent) => void;
};
type ResizeDragState = {
    startX: number;
    startWidth: number;
    index: number;
    containerLeft: number;
    updateWidth: (index: number, width: number) => void;
};
type TableMetadataResults = [
    QueryResult,
    QueryResult,
    QueryResult,
    QueryResult,
    QueryResult | null,
];


interface IndexDisplayRow {
    key: string;
    name: string;
    indexType: string;
    nonUnique: number;
    columnNames: string[];
}

interface ForeignKeyDisplayRow {
    key: string;
    name: string;
    constraintName: string;
    refTableName: string;
    columnNames: string[];
    refColumnNames: string[];
}

type IndexKind = 'NORMAL' | 'UNIQUE' | 'PRIMARY' | 'FULLTEXT' | 'SPATIAL';

interface IndexFormState {
    name: string;
    columnNames: string[];
    kind: IndexKind;
    indexType: string;
}

interface ForeignKeyFormState {
    constraintName: string;
    columnNames: string[];
    refTableName: string;
    refColumnNames: string[];
}

interface SchemaExecutionResult {
    ok: boolean;
    message?: string;
    failedStatementIndex?: number;
    statementCount: number;
}

const COMMON_DEFAULTS = [
    { value: 'CURRENT_TIMESTAMP' },
    { value: 'NULL' },
    { value: '0' },
    { value: "''" },
];

type IndexTypeOption = {
    value: string;
    label?: string;
    labelKey?: I18nKey;
};

const PGLIKE_INDEX_TYPE_OPTIONS: IndexTypeOption[] = [
    { labelKey: 'common.default', value: 'DEFAULT' },
    { label: 'BTREE', value: 'BTREE' },
    { label: 'HASH', value: 'HASH' },
    { label: 'GIN', value: 'GIN' },
    { label: 'GIST', value: 'GIST' },
    { label: 'BRIN', value: 'BRIN' },
    { label: 'SPGIST', value: 'SPGIST' },
];

const SQLSERVER_INDEX_TYPE_OPTIONS: IndexTypeOption[] = [
    { labelKey: 'common.default', value: 'DEFAULT' },
    { label: 'CLUSTERED', value: 'CLUSTERED' },
    { label: 'NONCLUSTERED', value: 'NONCLUSTERED' },
];

const CHARSETS = [
    { label: 'utf8mb4 (Recommended)', value: 'utf8mb4' },
    { label: 'utf8', value: 'utf8' },
    { label: 'latin1', value: 'latin1' },
    { label: 'ascii', value: 'ascii' },
];

type CollationOption = { label: string; value: string };
type CharsetKey = 'utf8mb4' | 'utf8';

const COLLATIONS: Record<CharsetKey, CollationOption[]> = {
    'utf8mb4': [
        { label: 'utf8mb4_unicode_ci (Default)', value: 'utf8mb4_unicode_ci' },
        { label: 'utf8mb4_general_ci', value: 'utf8mb4_general_ci' },
        { label: 'utf8mb4_bin', value: 'utf8mb4_bin' },
        { label: 'utf8mb4_0900_ai_ci', value: 'utf8mb4_0900_ai_ci' },
    ],
    'utf8': [
        { label: 'utf8_unicode_ci', value: 'utf8_unicode_ci' },
        { label: 'utf8_general_ci', value: 'utf8_general_ci' },
        { label: 'utf8_bin', value: 'utf8_bin' },
    ]
};

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const getCollationOptions = (value: string): CollationOption[] => (
    Object.prototype.hasOwnProperty.call(COLLATIONS, value)
        ? COLLATIONS[value as CharsetKey]
        : []
);

// --- Resizable Header Component (Native, same interaction as DataGrid) ---
const ResizableTitle = (props: ResizeHeaderCellProps) => {
  const { onResizeStart, width, ...restProps } = props;
  const nextStyle = { ...(restProps.style || {}) } as React.CSSProperties;

  if (width) {
    nextStyle.width = width;
  }

  if (!onResizeStart) {
    return <th {...restProps} style={nextStyle} />;
  }

  return (
    <th {...restProps} style={{ ...nextStyle, position: 'relative' }}>
      {restProps.children}
      <span
        className="react-resizable-handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          if (typeof onResizeStart === 'function') {
            onResizeStart(e);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          top: 0,
          width: 10,
          cursor: 'col-resize',
          zIndex: 10,
          touchAction: 'none',
        }}
      />
    </th>
  );
};

// --- Sortable Row Component ---
interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string;
}

const SortableRow = ({ children, ...props }: RowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props['data-row-key'],
  });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'move',
    ...(isDragging ? { position: 'relative', zIndex: 9999 } : {}),
  };

  return (
    <tr {...props} ref={setNodeRef} style={style} {...attributes}>
      {React.Children.map(children, child => {
        if ((child as React.ReactElement).key === 'sort') {
          return React.cloneElement(child as React.ReactElement, {
            children: (
                <MenuOutlined
                    style={{ cursor: 'grab', color: '#999' }}
                    {...listeners}
                />
            ),
          });
        }
        return child;
      })}
    </tr>
  );
};

const TableDesigner: React.FC<{ tab: TabData }> = ({ tab }) => {
  const isNewTable = !tab.tableName;

  const [columns, setColumns] = useState<EditableColumn[]>([]);
  const [originalColumns, setOriginalColumns] = useState<EditableColumn[]>([]);
  const [indexes, setIndexes] = useState<IndexDefinition[]>([]);
  const [fks, setFks] = useState<ForeignKeyDefinition[]>([]);
  const [triggers, setTriggers] = useState<TriggerDefinition[]>([]);
  const [ddl, setDdl] = useState<string>('');

  // New Table State
  const [newTableName, setNewTableName] = useState('');
  const [charset, setCharset] = useState('utf8mb4');
  const [collation, setCollation] = useState('utf8mb4_unicode_ci');

  const [loading, setLoading] = useState(false);
  const [previewSql, setPreviewSql] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(tab.initialTab || "columns");
  const [selectedColumnRowKeys, setSelectedColumnRowKeys] = useState<string[]>([]);
  const [isCopyColumnsModalOpen, setIsCopyColumnsModalOpen] = useState(false);
  const [copyTableName, setCopyTableName] = useState('');
  const [copyCharset, setCopyCharset] = useState('utf8mb4');
  const [copyCollation, setCopyCollation] = useState('utf8mb4_unicode_ci');
  const [copyExecuting, setCopyExecuting] = useState(false);
  const [tableComment, setTableComment] = useState('');
  const [tableCommentDraft, setTableCommentDraft] = useState('');
  const [isTableCommentModalOpen, setIsTableCommentModalOpen] = useState(false);
  const [tableCommentSaving, setTableCommentSaving] = useState(false);
  const [selectedIndexKeys, setSelectedIndexKeys] = useState<string[]>([]);
  const [isIndexModalOpen, setIsIndexModalOpen] = useState(false);
  const [indexModalMode, setIndexModalMode] = useState<'create' | 'edit'>('create');
  const [indexSaving, setIndexSaving] = useState(false);
  const [indexForm, setIndexForm] = useState<IndexFormState>({
      name: '',
      columnNames: [],
      kind: 'NORMAL',
      indexType: 'DEFAULT',
  });
  const [selectedForeignKey, setSelectedForeignKey] = useState<ForeignKeyDisplayRow | null>(null);
  const [isForeignKeyModalOpen, setIsForeignKeyModalOpen] = useState(false);
  const [foreignKeyModalMode, setForeignKeyModalMode] = useState<'create' | 'edit'>('create');
  const [foreignKeySaving, setForeignKeySaving] = useState(false);
  const [foreignKeyForm, setForeignKeyForm] = useState<ForeignKeyFormState>({
      constraintName: '',
      columnNames: [],
      refTableName: '',
      refColumnNames: [],
  });
  const [selectedTrigger, setSelectedTrigger] = useState<TriggerDefinition | null>(null);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [isTriggerEditModalOpen, setIsTriggerEditModalOpen] = useState(false);
  const [triggerEditMode, setTriggerEditMode] = useState<'create' | 'edit'>('create');
  const [triggerEditSql, setTriggerEditSql] = useState<string>('');
  const [triggerExecuting, setTriggerExecuting] = useState(false);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [commentEditorColumnKey, setCommentEditorColumnKey] = useState('');
  const [commentEditorColumnName, setCommentEditorColumnName] = useState('');
  const [commentEditorValue, setCommentEditorValue] = useState('');

  const connections = useStore(state => state.connections);
  const language = useStore(state => state.language);
  const theme = useStore(state => state.theme);
  const t = useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
  const darkMode = theme === 'dark';
  const resizeGuideColor = darkMode ? '#f6c453' : '#1890ff';
  const readOnly = !!tab.readOnly;
  const panelRadius = 10;
  const panelFrameColor = darkMode ? 'rgba(0, 0, 0, 0.18)' : 'rgba(0, 0, 0, 0.12)';
  const panelToolbarBorder = darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.10)';
  const panelToolbarBg = darkMode ? 'rgba(20, 20, 20, 0.35)' : 'rgba(255, 255, 255, 0.72)';
  const panelBodyBg = darkMode ? 'rgba(0, 0, 0, 0.24)' : 'rgba(255, 255, 255, 0.82)';
  const focusRowBg = darkMode ? 'rgba(246, 196, 83, 0.22)' : 'rgba(24, 144, 255, 0.12)';

  const [tableHeight, setTableHeight] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const pendingFocusColumnKeyRef = useRef<string | null>(null);
  const focusHighlightTimerRef = useRef<number | null>(null);
  const [focusColumnKey, setFocusColumnKey] = useState('');
  const defaultIndexTypeOption = useMemo(() => ({ label: t('common.default'), value: 'DEFAULT' }), [t]);

  const openCommentEditor = useCallback((record: EditableColumn) => {
      if (!record?._key) return;
      setCommentEditorColumnKey(record._key);
      setCommentEditorColumnName(record.name || '');
      setCommentEditorValue(record.comment || '');
      setIsCommentModalOpen(true);
  }, []);

  const closeCommentEditor = useCallback(() => {
      setIsCommentModalOpen(false);
      setCommentEditorColumnKey('');
      setCommentEditorColumnName('');
      setCommentEditorValue('');
  }, []);

  // 透明 Monaco Editor 主题已在 main.tsx 全局注册（含 stickyScroll 不透明背景）

  // 监听字段 Tab 容器高度，为所有 Tab 内表格计算 scroll.y
  // 当 Tab 切换时，字段 Tab 被 display:none 导致 height=0，跳过该次更新保持有效值
  useEffect(() => {
      if (!containerRef.current) return;
      const resizeObserver = new ResizeObserver(entries => {
          for (let entry of entries) {
              const h = entry.contentRect.height;
              // 跳过零高度观测（Tab 面板被隐藏时）
              if (h <= 0) return;
              setTableHeight(Math.max(200, h - 40));
          }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
  }, []); // 不依赖 activeKey，仅挂载一次，通过零高度守卫避免 Tab 切换异常

  // --- Resizable Columns State ---
  const [tableColumns, setTableColumns] = useState<ResizableColumn<EditableColumn>[]>([]);
  const [indexColumns, setIndexColumns] = useState<ResizableColumn<IndexDisplayRow>[]>([]);
  const resizeDragRef = useRef<ResizeDragState | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const latestResizeXRef = useRef<number | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const resizeListenerRef = useRef<{ move: ((e: MouseEvent) => void) | null; up: ((e: MouseEvent) => void) | null }>({
    move: null,
    up: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
      if (tab.initialTab) {
          setActiveKey(tab.initialTab);
      }
  }, [tab.initialTab]);

  useEffect(() => {
      setSelectedColumnRowKeys(prev => prev.filter(key => columns.some(c => c._key === key)));
  }, [columns]);

  useEffect(() => {
      return () => {
          if (focusHighlightTimerRef.current !== null) {
              window.clearTimeout(focusHighlightTimerRef.current);
          }
      };
  }, []);

  const focusColumnRow = useCallback((targetKey: string): boolean => {
      if (activeKey !== 'columns') return false;
      const tableBody = containerRef.current?.querySelector('.ant-table-body') as HTMLElement | null;
      if (!tableBody) return false;
      const row = tableBody.querySelector(`tr[data-row-key="${targetKey}"]`) as HTMLTableRowElement | null;
      if (!row) return false;

      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setFocusColumnKey(targetKey);
      if (focusHighlightTimerRef.current !== null) {
          window.clearTimeout(focusHighlightTimerRef.current);
      }
      focusHighlightTimerRef.current = window.setTimeout(() => {
          setFocusColumnKey(prev => (prev === targetKey ? '' : prev));
      }, 1600);

      if (!readOnly) {
          const firstInput = row.querySelector('input') as HTMLInputElement | null;
          if (firstInput) {
              firstInput.focus();
              firstInput.select();
          }
      }
      return true;
  }, [activeKey, readOnly]);

  useEffect(() => {
      const pendingKey = pendingFocusColumnKeyRef.current;
      if (!pendingKey || activeKey !== 'columns') return;

      let cancelled = false;
      const tryFocus = () => {
          if (cancelled) return;
          if (focusColumnRow(pendingKey)) {
              pendingFocusColumnKeyRef.current = null;
          }
      };

      const timerA = window.setTimeout(tryFocus, 0);
      const timerB = window.setTimeout(tryFocus, 96);
      return () => {
          cancelled = true;
          window.clearTimeout(timerA);
          window.clearTimeout(timerB);
      };
  }, [activeKey, columns, focusColumnRow]);

  // Initial Columns Definition
  useEffect(() => {
      const columnTypeOptions = resolveColumnTypeOptions(getDbType());
      const initialCols: ResizableColumn<EditableColumn>[] = [
          {
              title: t('designer.columns.name'),
              dataIndex: 'name',
              key: 'name',
              width: 180,
              render: (text: string, record: EditableColumn) => readOnly ? text : (
                  <Input {...noAutoCapInputProps} value={text} onChange={e => handleColumnChange(record._key, 'name', e.target.value)} variant="borderless" />
              )
          },
          {
              title: t('designer.columns.type'),
              dataIndex: 'type',
              key: 'type',
              width: 150,
              render: (text: string, record: EditableColumn) => readOnly ? text : (
                  <AutoComplete options={columnTypeOptions} value={text} onChange={val => handleColumnChange(record._key, 'type', val)} style={{ width: '100%' }} variant="borderless" />
              )
          },
          {
              title: t('designer.columns.primaryKey'),
              dataIndex: 'key',
              key: 'key',
              width: 60,
              align: 'center',
              render: (text: string, record: EditableColumn) => (
                  <Checkbox checked={text === 'PRI'} disabled={readOnly} onChange={e => handleColumnChange(record._key, 'key', e.target.checked ? 'PRI' : '')} />
              )
          },
          {
              title: t('designer.columns.autoIncrement'),
              dataIndex: 'isAutoIncrement',
              key: 'isAutoIncrement',
              width: 60,
              align: 'center',
              render: (val: boolean, record: EditableColumn) => (
                  <Checkbox checked={val} disabled={readOnly} onChange={e => handleColumnChange(record._key, 'isAutoIncrement', e.target.checked)} />
              )
          },
          {
              title: t('designer.columns.notNull'),
              dataIndex: 'nullable',
              key: 'nullable',
              width: 80,
              align: 'center',
              render: (text: string, record: EditableColumn) => (
                  <Checkbox checked={text === 'NO'} disabled={readOnly || record.key === 'PRI'} onChange={e => handleColumnChange(record._key, 'nullable', e.target.checked ? 'NO' : 'YES')} />
              )
          },
          {
              title: t('designer.columns.default'),
              dataIndex: 'default',
              key: 'default',
              width: 180, // Increased default width
              render: (text: string, record: EditableColumn) => readOnly ? text : (
                  <AutoComplete options={COMMON_DEFAULTS} value={text} onChange={val => handleColumnChange(record._key, 'default', val)} style={{ width: '100%' }} variant="borderless" placeholder="NULL" />
              )
          },
          {
              title: t('designer.columns.comment'),
              dataIndex: 'comment',
              key: 'comment',
              width: 200,
              render: (text: string, record: EditableColumn) => readOnly ? (
                  <Tooltip title={text || ''}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text || ''}</div>
                  </Tooltip>
              ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Input
                          value={text}
                          onChange={e => handleColumnChange(record._key, 'comment', e.target.value)}
                          onDoubleClick={() => openCommentEditor(record)}
                          variant="borderless"
                      />
                      <Tooltip title={t('designer.commentEditor.tooltip')}>
                          <Button
                              type="text"
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openCommentEditor(record)}
                          />
                      </Tooltip>
                  </div>
              )
          },
          ...(readOnly ? [] : [{
              title: t('designer.columns.actions'),
              key: 'action',
              width: 60,
              render: (_: unknown, record: EditableColumn) => (
                  <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDeleteColumn(record._key)} />
              )
          }])
      ];
      setTableColumns(initialCols);
  }, [connections, openCommentEditor, readOnly, t, tab.connectionId]); // Re-create when datasource dialect or readonly state changes

  const flushResizeGhost = useCallback(() => {
    resizeRafRef.current = null;
    if (!resizeDragRef.current || !ghostRef.current) return;
    if (latestResizeXRef.current === null) return;
    const relativeLeft = latestResizeXRef.current - resizeDragRef.current.containerLeft;
    ghostRef.current.style.transform = `translateX(${relativeLeft}px)`;
  }, []);

  const detachResizeListeners = useCallback(() => {
    if (resizeListenerRef.current.move) {
      document.removeEventListener('mousemove', resizeListenerRef.current.move);
      resizeListenerRef.current.move = null;
    }
    if (resizeListenerRef.current.up) {
      document.removeEventListener('mouseup', resizeListenerRef.current.up);
      resizeListenerRef.current.up = null;
    }
  }, []);

  const cleanupResizeState = useCallback(() => {
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
    latestResizeXRef.current = null;
    resizeDragRef.current = null;
    if (ghostRef.current) {
      ghostRef.current.style.display = 'none';
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const createResizeStartHandler = useCallback(<RecordType extends object>(columns: ResizableColumn<RecordType>[], setter: ResizableColumnSetter<RecordType>) => (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const currentWidth = Number(columns[index]?.width || 200);
    const containerLeft = shellRef.current?.getBoundingClientRect().left ?? 0;
    resizeDragRef.current = {
      startX,
      startWidth: currentWidth,
      index,
      containerLeft,
      updateWidth: (dragIndex, newWidth) => {
        setter((prevColumns) => {
          if (!prevColumns[dragIndex]) return prevColumns;
          const nextColumns = [...prevColumns];
          nextColumns[dragIndex] = {
            ...nextColumns[dragIndex],
            width: newWidth,
          };
          return nextColumns;
        });
      },
    };
    latestResizeXRef.current = startX;

    if (ghostRef.current && shellRef.current) {
      const relativeLeft = startX - containerLeft;
      ghostRef.current.style.transform = `translateX(${relativeLeft}px)`;
      ghostRef.current.style.display = 'block';
    }

    detachResizeListeners();

    const onMove = (event: MouseEvent) => {
      if (!resizeDragRef.current) return;
      latestResizeXRef.current = event.clientX;
      if (resizeRafRef.current !== null) return;
      resizeRafRef.current = requestAnimationFrame(flushResizeGhost);
    };

    const onUp = (event: MouseEvent) => {
      if (resizeDragRef.current) {
        const { startX: dragStartX, startWidth, index: dragIndex, updateWidth } = resizeDragRef.current;
        const deltaX = event.clientX - dragStartX;
        const newWidth = Math.max(50, startWidth + deltaX);
        updateWidth(dragIndex, newWidth);
      }

      detachResizeListeners();
      cleanupResizeState();
    };

    resizeListenerRef.current = { move: onMove, up: onUp };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [cleanupResizeState, detachResizeListeners, flushResizeGhost]);

  const handleResizeStart = useMemo(() => createResizeStartHandler(tableColumns, setTableColumns), [createResizeStartHandler, tableColumns]);
  const handleIndexResizeStart = useMemo(() => createResizeStartHandler(indexColumns, setIndexColumns), [createResizeStartHandler, indexColumns]);

  useEffect(() => {
    return () => {
      detachResizeListeners();
      cleanupResizeState();
    };
  }, [cleanupResizeState, detachResizeListeners]);

  const fetchData = async () => {
    if (isNewTable) return; // Don't fetch for new table

    setLoading(true);
    const conn = connections.find(c => c.id === tab.connectionId);
    if (!conn) {
        message.error("Connection not found");
        setLoading(false);
        return;
    }

    const config = {
        ...conn.config,
        port: Number(conn.config.port),
        password: conn.config.password || "",
        database: conn.config.database || "",
        useSSH: conn.config.useSSH || false,
        ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
    };

    const rpcConfig = buildRpcConnectionConfig(config);
    const results: TableMetadataResults = await Promise.all([
        DBGetColumns(rpcConfig, tab.dbName || '', tab.tableName || ''),
        DBGetIndexes(rpcConfig, tab.dbName || '', tab.tableName || ''),
        DBGetForeignKeys(rpcConfig, tab.dbName || '', tab.tableName || ''),
        DBGetTriggers(rpcConfig, tab.dbName || '', tab.tableName || ''),
        isNewTable ? Promise.resolve(null) : DBShowCreateTable(rpcConfig, tab.dbName || '', tab.tableName || ''),
    ]);
    const [colsRes, idxRes, fkRes, trigRes, ddlRes] = results;

    if (colsRes.success) {
        const colsWithKey = (colsRes.data as ColumnDefinition[]).map((c, index) => ({
            ...c,
            _key: `col-${index}-${Date.now()}`,
            isAutoIncrement: c.extra && c.extra.toLowerCase().includes('auto_increment')
        }));
        setColumns(JSON.parse(JSON.stringify(colsWithKey)));
        setOriginalColumns(JSON.parse(JSON.stringify(colsWithKey)));
        setSelectedColumnRowKeys([]);
    } else {
        message.error("Failed to load columns: " + colsRes.message);
    }

    if (idxRes.success) {
        setIndexes(Array.isArray(idxRes.data) ? idxRes.data : []);
    } else {
        setIndexes([]);
    }
    if (fkRes.success) {
        setFks(Array.isArray(fkRes.data) ? fkRes.data : []);
    } else {
        setFks([]);
    }
    if (trigRes.success) {
        setTriggers(Array.isArray(trigRes.data) ? trigRes.data : []);
    } else {
        setTriggers([]);
    }
    if (ddlRes && ddlRes.success) {
        const ddlText = String(ddlRes.data || '');
        setDdl(ddlText);
        const commentMatch = ddlText.replace(/\r?\n/g, ' ').match(/COMMENT\s*=\s*'((?:\\'|''|[^'])*)'/i);
        const parsedTableComment = commentMatch ? commentMatch[1].replace(/\\'/g, "'").replace(/''/g, "'") : '';
        setTableComment(parsedTableComment);
        if (!isTableCommentModalOpen) {
            setTableCommentDraft(parsedTableComment);
        }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [tab]);

  // --- Trigger Handlers ---

  const normalizeDbType = (rawType: string): string => {
      const normalized = String(rawType || '').trim().toLowerCase();
      if (normalized === 'postgresql' || normalized === 'pg') return 'postgres';
      if (normalized === 'mssql' || normalized === 'sql_server' || normalized === 'sql-server') return 'sqlserver';
      if (normalized === 'doris') return 'diros';
      return normalized;
  };

  const inferDialectFromCustomDriver = (driver: string): string => {
      const customDriver = normalizeDbType(driver);
      if (!customDriver) return 'custom';
      if (
          customDriver === 'mariadb'
          || customDriver === 'diros'
          || customDriver === 'sphinx'
          || customDriver === 'tidb'
          || customDriver === 'oceanbase'
          || customDriver === 'starrocks'
          || customDriver.includes('mysql')
      ) {
          return 'mysql';
      }
      if (customDriver === 'dameng') return 'dm';
      return customDriver;
  };

  const getDbType = (): string => {
    const conn = connections.find(c => c.id === tab.connectionId);
    const rawType = String(conn?.config?.type || '').trim();
    if (!rawType) return '';
    return resolveSqlDialect(rawType, String(conn?.config?.driver || ''));
  };

  const generateTriggerTemplate = (): string => {
    const dbType = getDbType();
    const tblName = tab.tableName || 'table_name';
    const triggerLogicComment = `-- ${t('designer.trigger.templateLogic')}`;

    switch (dbType) {
      case 'mysql':
      case 'mariadb':
      case 'diros':
        return `CREATE TRIGGER trigger_name
BEFORE INSERT ON \`${tblName}\`
FOR EACH ROW
BEGIN
    ${triggerLogicComment}
END;`;
      case 'postgres':
      case 'kingbase':
      case 'highgo':
      case 'vastbase':
        return `CREATE OR REPLACE FUNCTION trigger_function_name()
RETURNS TRIGGER AS $$
BEGIN
    ${triggerLogicComment}
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_name
BEFORE INSERT ON "${tblName}"
FOR EACH ROW
EXECUTE FUNCTION trigger_function_name();`;
      case 'sqlserver':
        return `CREATE TRIGGER trigger_name
ON [${tblName}]
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    ${triggerLogicComment}
END;`;
      case 'oracle':
      case 'dameng':
      case 'dm':
        return `CREATE OR REPLACE TRIGGER trigger_name
BEFORE INSERT ON "${tblName}"
FOR EACH ROW
BEGIN
    ${triggerLogicComment}
    NULL;
END;`;
      case 'sqlite':
        return `CREATE TRIGGER trigger_name
AFTER INSERT ON "${tblName}"
BEGIN
    ${triggerLogicComment}
END;`;
      default:
        return `-- ${t('designer.trigger.enterCreateStatement')}`;
    }
  };

  const buildDropTriggerSql = (triggerName: string): string => {
    const dbType = getDbType();
    const tblName = tab.tableName || '';

    switch (dbType) {
      case 'mysql':
      case 'mariadb':
      case 'diros':
        return `DROP TRIGGER IF EXISTS \`${triggerName}\``;
      case 'postgres':
      case 'kingbase':
      case 'highgo':
      case 'vastbase':
        return `DROP TRIGGER IF EXISTS "${triggerName}" ON "${tblName}"`;
      case 'sqlserver':
        return `DROP TRIGGER IF EXISTS [${triggerName}]`;
      case 'oracle':
      case 'dameng':
      case 'dm':
        return `DROP TRIGGER "${triggerName}"`;
      case 'sqlite':
        return `DROP TRIGGER IF EXISTS "${triggerName}"`;
      default:
        return `DROP TRIGGER ${triggerName}`;
    }
  };

  const handleCreateTrigger = () => {
    setTriggerEditMode('create');
    setTriggerEditSql(generateTriggerTemplate());
    setIsTriggerEditModalOpen(true);
  };

  const handleEditTrigger = () => {
    if (!selectedTrigger) return;
    setTriggerEditMode('edit');
    // 构建完整的 CREATE TRIGGER 语句
    const dbType = getDbType();
    const tblName = tab.tableName || '';
    let createSql = '';

    if (dbType === 'mysql') {
      createSql = `CREATE TRIGGER \`${selectedTrigger.name}\`
${selectedTrigger.timing} ${selectedTrigger.event} ON \`${tblName}\`
FOR EACH ROW
${selectedTrigger.statement}`;
    } else {
      createSql = selectedTrigger.statement || `-- ${t('designer.trigger.definitionUnavailable')}`;
    }

    setTriggerEditSql(createSql);
    setIsTriggerEditModalOpen(true);
  };

  const handleDeleteTrigger = () => {
    if (!selectedTrigger) return;

    Modal.confirm({
      title: t('designer.trigger.deleteTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('designer.trigger.deleteContent', { name: selectedTrigger.name }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        const conn = connections.find(c => c.id === tab.connectionId);
        if (!conn) {
          message.error(t('designer.connectionNotFound'));
          return;
        }

        const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
        };

        const dropSql = buildDropTriggerSql(selectedTrigger.name);

        try {
          const res = await DBQuery(buildRpcConnectionConfig(config), tab.dbName || '', dropSql);
          if (res.success) {
            message.success(t('designer.triggerDeleted'));
            setSelectedTrigger(null);
            fetchData(); // 刷新列表
          } else {
            message.error(t('designer.deleteFailed', { message: res.message }));
          }
        } catch (e: unknown) {
          message.error(t('designer.deleteFailed', { message: getErrorMessage(e) }));
        }
      }
    });
  };

  const handleExecuteTriggerSql = async () => {
    const conn = connections.find(c => c.id === tab.connectionId);
    if (!conn) {
      message.error(t('designer.connectionNotFound'));
      return;
    }

    const config = {
      ...conn.config,
      port: Number(conn.config.port),
      password: conn.config.password || "",
      database: conn.config.database || "",
      useSSH: conn.config.useSSH || false,
      ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
    };

    setTriggerExecuting(true);

    try {
      // 如果是编辑模式，先删除旧触发器
      if (triggerEditMode === 'edit' && selectedTrigger) {
        const dropSql = buildDropTriggerSql(selectedTrigger.name);
        const dropRes = await DBQuery(buildRpcConnectionConfig(config), tab.dbName || '', dropSql);
        if (!dropRes.success) {
          message.error(t('designer.trigger.deleteOldFailed', { message: dropRes.message }));
          setTriggerExecuting(false);
          return;
        }
      }

      // 执行创建语句
      const res = await DBQuery(buildRpcConnectionConfig(config), tab.dbName || '', triggerEditSql);
      if (res.success) {
        message.success(triggerEditMode === 'create' ? t('designer.triggerCreated') : t('designer.triggerUpdated'));
        setIsTriggerEditModalOpen(false);
        setSelectedTrigger(null);
        fetchData(); // 刷新列表
      } else {
        message.error(t('designer.executeFailed', { message: res.message }));
      }
    } catch (e: unknown) {
      message.error(t('designer.executeFailed', { message: getErrorMessage(e) }));
    } finally {
      setTriggerExecuting(false);
    }
  };

  // --- Handlers ---

  const handleColumnChange = (key: string, field: keyof EditableColumn, value: EditableColumnValue) => {
      setColumns(prev => prev.map(col => {
          if (col._key === key) {
              const newCol = { ...col, [field]: value };
              if (field === 'key' && value === 'PRI') newCol.nullable = 'NO';
              if (field === 'isAutoIncrement' && value === true) {
                  newCol.key = 'PRI';
                  newCol.nullable = 'NO';
                  newCol.type = 'int'; // Suggest INT
              }
              return newCol;
          }
          return col;
      }));
  };

  const createNewColumn = useCallback((indexHint: number): EditableColumn => ({
      name: isNewTable ? 'new_column' : `new_col_${indexHint}`,
      type: 'varchar(255)',
      nullable: 'YES',
      key: '',
      extra: '',
      comment: '',
      default: '',
      _key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      isNew: true,
      isAutoIncrement: false
  }), [isNewTable]);

  const handleAddColumn = useCallback((insertAfterKey?: string) => {
      const newCol = createNewColumn(columns.length + 1);
      setColumns(prev => {
          const next = [...prev];
          if (insertAfterKey) {
              const insertIndex = next.findIndex(col => col._key === insertAfterKey);
              if (insertIndex >= 0) {
                  next.splice(insertIndex + 1, 0, newCol);
                  return next;
              }
          }
          next.push(newCol);
          return next;
      });
      setSelectedColumnRowKeys([newCol._key]);
      pendingFocusColumnKeyRef.current = newCol._key;
  }, [columns.length, createNewColumn]);

  const handleAddColumnAfterSelected = useCallback(() => {
      const selectedSet = new Set(selectedColumnRowKeys);
      const anchor = columns.find(col => selectedSet.has(col._key));
      if (!anchor) {
          message.warning(t('designer.selectFieldFirst'));
          return;
      }
      handleAddColumn(anchor._key);
  }, [columns, handleAddColumn, selectedColumnRowKeys]);

  const handleDeleteColumn = (key: string) => {
      setColumns(prev => prev.filter(c => c._key !== key));
  };

  const selectedColumns = useMemo(() => {
      if (selectedColumnRowKeys.length === 0) return [];
      const selectedSet = new Set(selectedColumnRowKeys);
      return columns.filter(col => selectedSet.has(col._key));
  }, [columns, selectedColumnRowKeys]);

  const groupedIndexes = useMemo<IndexDisplayRow[]>(() => {
      type IndexFieldItem = {
          name: string;
          seq: number;
          order: number;
      };
      type IndexBucket = {
          key: string;
          name: string;
          indexType: string;
          nonUnique: number;
          order: number;
          fields: IndexFieldItem[];
      };

      const buckets = new Map<string, IndexBucket>();

      const safeIndexes = Array.isArray(indexes) ? indexes : [];
      safeIndexes.forEach((idx, order) => {
          const rawName = String(idx.name || '').trim();
          const key = rawName || `__unnamed_${order}`;
          const indexType = String(idx.indexType || '').trim() || '-';
          const displayName = rawName || t('designer.index.unnamed');

          if (!buckets.has(key)) {
              buckets.set(key, {
                  key,
                  name: displayName,
                  indexType,
                  nonUnique: idx.nonUnique === 0 ? 0 : 1,
                  order,
                  fields: [],
              });
          }

          const bucket = buckets.get(key);
          if (!bucket) return;

          if (bucket.indexType === '-' && indexType !== '-') {
              bucket.indexType = indexType;
          }
          if (idx.nonUnique === 0) {
              bucket.nonUnique = 0;
          }

          const columnName = String(idx.columnName || '').trim();
          if (!columnName) return;

          const rawSeq = Number(idx.seqInIndex);
          const seq = Number.isFinite(rawSeq) ? rawSeq : 0;
          bucket.fields.push({
              name: columnName,
              seq,
              order,
          });
      });

      return Array.from(buckets.values())
          .sort((a, b) => a.order - b.order)
          .map((bucket) => {
              const sortedFieldNames = bucket.fields
                  .slice()
                  .sort((a, b) => {
                      const aSeq = a.seq > 0 ? a.seq : Number.MAX_SAFE_INTEGER;
                      const bSeq = b.seq > 0 ? b.seq : Number.MAX_SAFE_INTEGER;
                      if (aSeq !== bSeq) return aSeq - bSeq;
                      return a.order - b.order;
                  })
                  .map(field => field.name);

              const uniqueFieldNames = Array.from(new Set(sortedFieldNames));

              return {
                  key: bucket.key,
                  name: bucket.name,
                  indexType: bucket.indexType,
                  nonUnique: bucket.nonUnique,
                  columnNames: uniqueFieldNames,
              };
          });
  }, [indexes]);

  const selectedIndex = useMemo(() => {
      if (selectedIndexKeys.length === 0) return null;
      return groupedIndexes.find(idx => selectedIndexKeys.includes(idx.key)) || null;
  }, [selectedIndexKeys, groupedIndexes]);

  const groupedIndexFieldCount = useMemo(
      () => groupedIndexes.reduce((total, row) => total + row.columnNames.length, 0),
      [groupedIndexes]
  );

  const groupedForeignKeys = useMemo<ForeignKeyDisplayRow[]>(() => {
      type FieldItem = { name: string; order: number };
      type FkBucket = {
          key: string;
          constraintName: string;
          refTableName: string;
          order: number;
          columns: FieldItem[];
          refColumns: FieldItem[];
      };

      const buckets = new Map<string, FkBucket>();

      const safeFks = Array.isArray(fks) ? fks : [];
      safeFks.forEach((fk, order) => {
          const rawConstraint = String(fk.constraintName || fk.name || '').trim();
          const key = rawConstraint || `__unnamed_fk_${order}`;
          const constraintName = rawConstraint || t('designer.fk.unnamed');
          const refTableName = String(fk.refTableName || '').trim() || '-';

          if (!buckets.has(key)) {
              buckets.set(key, {
                  key,
                  constraintName,
                  refTableName,
                  order,
                  columns: [],
                  refColumns: [],
              });
          }

          const bucket = buckets.get(key);
          if (!bucket) return;

          if (bucket.refTableName === '-' && refTableName !== '-') {
              bucket.refTableName = refTableName;
          }

          const colName = String(fk.columnName || '').trim();
          const refColName = String(fk.refColumnName || '').trim();
          if (colName) bucket.columns.push({ name: colName, order });
          if (refColName) bucket.refColumns.push({ name: refColName, order });
      });

      return Array.from(buckets.values())
          .sort((a, b) => a.order - b.order)
          .map((bucket) => {
              const columnNames = bucket.columns
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map(item => item.name);
              const refColumnNames = bucket.refColumns
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map(item => item.name);

              return {
                  key: bucket.key,
                  name: bucket.constraintName,
                  constraintName: bucket.constraintName,
                  refTableName: bucket.refTableName,
                  columnNames: Array.from(new Set(columnNames)),
                  refColumnNames: Array.from(new Set(refColumnNames)),
              };
          });
  }, [fks]);

  const localColumnOptions = useMemo(
      () => columns.map(col => ({ label: col.name, value: col.name })),
      [columns]
  );

  useEffect(() => {
      if (selectedIndexKeys.length === 0) return;
      const validKeys = selectedIndexKeys.filter(key => groupedIndexes.some(idx => idx.key === key));
      if (validKeys.length !== selectedIndexKeys.length) {
          setSelectedIndexKeys(validKeys);
      }
  }, [groupedIndexes, selectedIndexKeys]);

  useEffect(() => {
      if (!selectedForeignKey) return;
      if (!groupedForeignKeys.some(fk => fk.key === selectedForeignKey.key)) {
          setSelectedForeignKey(null);
      }
  }, [groupedForeignKeys, selectedForeignKey]);

  const escapeBacktickIdentifier = (name: string) => String(name || '').replace(/`/g, '``');
  const escapeBracketIdentifier = (name: string) => String(name || '').replace(/]/g, ']]');
  const escapeDoubleQuoteIdentifier = (name: string) => String(name || '').replace(/"/g, '""');
  const escapeSqlString = (value: string) => String(value || '').replace(/'/g, "''");

  const stripIdentifierQuotes = (part: string): string => {
      const text = String(part || '').trim();
      if (!text) return '';
      if ((text.startsWith('`') && text.endsWith('`')) || (text.startsWith('"') && text.endsWith('"'))) {
          return text.slice(1, -1).trim();
      }
      if (text.startsWith('[') && text.endsWith(']')) {
          return text.slice(1, -1).trim();
      }
      return text;
  };

  const splitQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
      const raw = String(qualifiedName || '').trim();
      if (!raw) return { schemaName: '', objectName: '' };
      const idx = raw.lastIndexOf('.');
      if (idx <= 0 || idx >= raw.length - 1) return { schemaName: '', objectName: raw };
      return {
          schemaName: stripIdentifierQuotes(raw.substring(0, idx)),
          objectName: stripIdentifierQuotes(raw.substring(idx + 1)),
      };
  };

  const isPgLikeDialect = (dbType: string): boolean => isPgLikeSqlDialect(dbType);
  const isOracleLikeDialect = (dbType: string): boolean => isOracleLikeSqlDialect(dbType);
  const isSqlServerDialect = (dbType: string): boolean => isSqlServerSqlDialect(dbType);
  const isMysqlLikeDialect = (dbType: string): boolean => isMysqlFamilySqlDialect(dbType);
  const isNonRelationalDialect = (dbType: string): boolean => dbType === 'redis' || dbType === 'mongodb';
  const lacksAlterForeignKeySupport = (dbType: string): boolean => dbType === 'sqlite' || dbType === 'duckdb' || dbType === 'tdengine';
  const lacksTableCommentSupport = (dbType: string): boolean => dbType === 'sqlite';

  const quoteIdentifierPartByDialect = (part: string, dbType: string): string => {
      return quoteSqlIdentifierPart(dbType, part);
  };

  const quoteIdentifierPathByDialect = (path: string, dbType: string): string => {
      return quoteSqlIdentifierPath(dbType, path);
  };

  const resolveTableInfo = () => {
      const dbType = getDbType();
      const rawTable = String(tab.tableName || '').trim();
      const rawDb = String(tab.dbName || '').trim();
      const parsed = splitQualifiedName(rawTable);
      const table = parsed.objectName || stripIdentifierQuotes(rawTable);
      let schema = parsed.schemaName;

      if (!schema) {
          if (isPgLikeDialect(dbType)) {
              schema = rawDb || 'public';
          } else if (isSqlServerDialect(dbType)) {
              schema = 'dbo';
          } else if (isOracleLikeDialect(dbType)) {
              schema = rawDb;
          } else {
              schema = rawDb;
          }
      }

      const qualifiedName = schema ? `${schema}.${table}` : table;
      return {
          dbType,
          schema: stripIdentifierQuotes(schema),
          table: stripIdentifierQuotes(table),
          qualifiedName,
          tableRef: quoteIdentifierPathByDialect(qualifiedName, dbType),
      };
  };

  const hasUnsavedDraftChanges = useMemo(() => {
      if (isNewTable || readOnly) {
          return false;
      }
      const tableInfo = resolveTableInfo();
      return hasAlterTableDraftChanges({
          dbType: tableInfo.dbType,
          tableName: tableInfo.qualifiedName,
          originalColumns,
          columns,
      });
  }, [columns, connections, isNewTable, originalColumns, readOnly, tab.connectionId, tab.dbName, tab.tableName]);

  const supportsIndexSchemaOps = (): boolean => {
      const dbType = getDbType();
      if (!dbType) return false;
      if (isNonRelationalDialect(dbType)) return false;
      return true;
  };

  const supportsForeignKeySchemaOps = (): boolean => {
      const dbType = getDbType();
      if (!dbType) return false;
      if (isNonRelationalDialect(dbType)) return false;
      if (lacksAlterForeignKeySupport(dbType)) return false;
      return true;
  };

  const supportsTableCommentOps = (): boolean => {
      const dbType = getDbType();
      if (!dbType) return false;
      if (isNonRelationalDialect(dbType)) return false;
      if (lacksTableCommentSupport(dbType)) return false;
      return true;
  };

  const getIndexKindOptions = () => {
      const dbType = getDbType();
      if (isMysqlLikeDialect(dbType)) {
          return [
              { label: t('designer.index.kind.normalNonClustered'), value: 'NORMAL' },
              { label: t('designer.index.kind.unique'), value: 'UNIQUE' },
              { label: t('designer.index.kind.primaryClustered'), value: 'PRIMARY' },
              { label: t('designer.index.kind.fulltext'), value: 'FULLTEXT' },
              { label: t('designer.index.kind.spatial'), value: 'SPATIAL' },
          ];
      }
      return [
          { label: t('designer.index.kind.normal'), value: 'NORMAL' },
          { label: t('designer.index.kind.unique'), value: 'UNIQUE' },
      ];
  };

  const getIndexTypeOptions = (kind?: IndexKind) => {
      const dbType = getDbType();
      const k = kind || 'NORMAL';
      const resolveIndexTypeOption = (item: IndexTypeOption) => ({
          label: item.labelKey ? t(item.labelKey) : (item.label || item.value),
          value: item.value,
      });
      if (isMysqlLikeDialect(dbType)) {
          // MySQL InnoDB: 所有索引均为固定方法类型
          if (k === 'FULLTEXT') return [{ label: 'FULLTEXT', value: 'FULLTEXT' }];
          if (k === 'SPATIAL') return [{ label: 'RTREE', value: 'RTREE' }];
          return [{ label: 'BTREE', value: 'BTREE' }];
      }
      if (isPgLikeDialect(dbType)) {
          if (k === 'PRIMARY' || k === 'UNIQUE') return [{ label: 'BTREE', value: 'BTREE' }];
          return PGLIKE_INDEX_TYPE_OPTIONS.map(resolveIndexTypeOption);
      }
      if (isSqlServerDialect(dbType)) {
          return SQLSERVER_INDEX_TYPE_OPTIONS.map(resolveIndexTypeOption);
      }
      return [defaultIndexTypeOption];
  };

  /** 根据索引类别返回固定的索引方法类型，可选类别返回 undefined */
  const getFixedIndexType = (kind: IndexKind): string | undefined => {
      const dbType = getDbType();
      if (isMysqlLikeDialect(dbType)) {
          if (kind === 'PRIMARY') return 'BTREE';
          if (kind === 'FULLTEXT') return 'FULLTEXT';
          if (kind === 'SPATIAL') return 'RTREE';
      }
      if (isPgLikeDialect(dbType)) {
          if (kind === 'PRIMARY') return 'BTREE';
      }
      return undefined;
  };

  const buildCreateTableSql = (targetTableName: string, targetColumns: EditableColumn[], targetCharset: string, targetCollation: string) => {
      return buildCreateTablePreviewSql({
          language,
          dbType: getDbType(),
          tableName: targetTableName,
          columns: targetColumns,
          charset: targetCharset,
          collation: targetCollation,
      });
  };

  const openCopySelectedColumnsModal = () => {
      if (selectedColumns.length === 0) {
          message.warning(t('designer.selectFieldsToCopy'));
          return;
      }
      const sourceName = (tab.tableName || 'new_table').trim();
      setCopyTableName(`${sourceName}_copy`);
      setCopyCharset(charset);
      const charsetCollations = getCollationOptions(charset);
      setCopyCollation(
          charsetCollations.some((item) => item.value === collation)
              ? collation
              : (charsetCollations[0]?.value || 'utf8mb4_unicode_ci')
      );
      setIsCopyColumnsModalOpen(true);
  };

  const handleExecuteCopySelectedColumns = async () => {
      if (!copyTableName.trim()) {
          message.error(t('designer.enterTargetTableName'));
          return;
      }
      if (selectedColumns.length === 0) {
          message.error(t('designer.noFieldsToCopy'));
          return;
      }
      const conn = connections.find(c => c.id === tab.connectionId);
      if (!conn) {
          message.error(t('designer.connectionNotFound'));
          return;
      }
      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };
      const sql = buildCreateTableSql(copyTableName.trim(), selectedColumns, copyCharset, copyCollation);
      setCopyExecuting(true);
      try {
          const res = await DBQuery(buildRpcConnectionConfig(config), tab.dbName || '', sql);
          if (res.success) {
              message.success(t('designer.fieldsCopiedToNewTable', { count: selectedColumns.length, name: copyTableName.trim() }));
              setIsCopyColumnsModalOpen(false);
          } else {
              message.error(t('designer.executeFailed', { message: res.message }));
          }
      } finally {
          setCopyExecuting(false);
      }
  };

  const executeSchemaStatements = async (sqlText: string): Promise<SchemaExecutionResult> => {
      const conn = connections.find(c => c.id === tab.connectionId);
      if (!conn) {
          return { ok: false, message: t('designer.connectionNotFound'), statementCount: 0 };
      }
      const config = {
          ...conn.config,
          port: Number(conn.config.port),
          password: conn.config.password || "",
          database: conn.config.database || "",
          useSSH: conn.config.useSSH || false,
          ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
      };
      const statements = sqlText.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < statements.length; i++) {
          let stmt = statements[i];
          if (!stmt.endsWith(';')) stmt += ';';
          const res = await DBQuery(buildRpcConnectionConfig(config), tab.dbName || '', stmt);
          if (!res.success) {
              const prefix = statements.length > 1
                  ? `[#${i + 1}/${statements.length}] ${t('designer.executeFailed', { message: '' })}`
                  : '';
              return {
                  ok: false,
                  message: prefix ? `${prefix}${res.message}` : t('designer.executeFailed', { message: res.message }),
                  failedStatementIndex: i,
                  statementCount: statements.length,
              };
          }
      }
      return { ok: true, statementCount: statements.length };
  };

  const buildIndexFormFromRow = (row: IndexDisplayRow): IndexFormState => {
      return normalizeIndexFormFromRow(
          row as IndexDisplaySnapshot,
          getIndexKindOptions().map(item => item.value as IndexKind),
      );
  };

  const executeIndexEditSql = async (dropSql: string, addSql: string, previousIndex: IndexDisplayRow): Promise<boolean> => {
      const result = await executeSchemaStatements(`${dropSql}\n${addSql}`);
      if (result.ok) {
          message.success(t('designer.indexModified'));
          await fetchData();
          return true;
      }

      const oldCreateSql = buildIndexCreateSql(buildIndexFormFromRow(previousIndex));
      if (!oldCreateSql) {
          message.error(t('designer.indexModifyFailed', { message: result.message || t('designer.executeFailed', { message: '' }).replace(/: $/, '') }));
          await fetchData();
          return false;
      }

      if (!shouldRestoreOriginalIndex(result)) {
          message.error(result.message || t('designer.executeFailed', { message: '' }).replace(/: $/, ''));
          return false;
      }

      const restoreResult = await executeSchemaStatements(oldCreateSql);
      if (restoreResult.ok) {
          message.error(t('designer.indexModifyFailedRestored', { message: result.message || t('designer.executeFailed', { message: '' }).replace(/: $/, '') }));
      } else {
          message.error(t('designer.indexModifyFailedRestoreFailed', {
              message: result.message || t('designer.executeFailed', { message: '' }).replace(/: $/, ''),
              restoreError: restoreResult.message || t('common.unknown'),
          }));
      }
      await fetchData();
      return false;
  };

  const executeSchemaSql = async (sql: string, successMessage: string): Promise<boolean> => {
      try {
          const result = await executeSchemaStatements(sql);
          if (!result.ok) {
              message.error(result.message || t('designer.executeFailed', { message: '' }).replace(/: $/, ''));
              if ((result.failedStatementIndex ?? 0) > 0) await fetchData();
              return false;
          }
          message.success(successMessage);
          await fetchData();
          return true;
      } catch (e: unknown) {
          message.error(t('designer.executeFailed', { message: getErrorMessage(e) }));
          return false;
      }
  };

  const openTableCommentModal = () => {
      setTableCommentDraft(tableComment || '');
      setIsTableCommentModalOpen(true);
  };

  const buildTableCommentSql = (nextComment: string): string | null => {
      const tableInfo = resolveTableInfo();
      const dbType = tableInfo.dbType;
      const escapedComment = escapeSqlString(nextComment);
      if (isNonRelationalDialect(dbType)) return null;
      if (isMysqlLikeDialect(dbType)) {
          return `ALTER TABLE ${tableInfo.tableRef} COMMENT = '${escapedComment}';`;
      }
      if (isPgLikeDialect(dbType) || isOracleLikeDialect(dbType)) {
          return `COMMENT ON TABLE ${tableInfo.tableRef} IS '${escapedComment}';`;
      }
      if (isSqlServerDialect(dbType)) {
          const schemaName = escapeSqlString(tableInfo.schema || 'dbo');
          const tableName = escapeSqlString(tableInfo.table);
          return `IF EXISTS (
    SELECT 1
    FROM sys.extended_properties ep
    JOIN sys.tables t ON ep.major_id = t.object_id AND ep.minor_id = 0
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE ep.name = N'MS_Description'
      AND s.name = N'${schemaName}'
      AND t.name = N'${tableName}'
)
BEGIN
    EXEC sp_updateextendedproperty
        @name = N'MS_Description',
        @value = N'${escapedComment}',
        @level0type = N'SCHEMA', @level0name = N'${schemaName}',
        @level1type = N'TABLE', @level1name = N'${tableName}';
END
ELSE
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'${escapedComment}',
        @level0type = N'SCHEMA', @level0name = N'${schemaName}',
        @level1type = N'TABLE', @level1name = N'${tableName}';
END;`;
      }
      return `COMMENT ON TABLE ${tableInfo.tableRef} IS '${escapedComment}';`;
  };

  const handleSaveTableComment = async () => {
      if (!supportsTableCommentOps()) {
          message.warning(t('designer.commentNotSupported'));
          return;
      }
      if (!tab.tableName) return;
      const sql = buildTableCommentSql(tableCommentDraft);
      if (!sql) {
          message.warning(t('designer.commentNotSupported'));
          return;
      }
      setTableCommentSaving(true);
      const ok = await executeSchemaSql(sql, t('designer.tableComment.updated'));
      setTableCommentSaving(false);
      if (ok) {
          setTableComment(tableCommentDraft);
          setIsTableCommentModalOpen(false);
      }
  };

  const openCreateIndexModal = () => {
      setIndexModalMode('create');
      setIndexForm({
          name: '',
          columnNames: [],
          kind: 'NORMAL',
          indexType: 'DEFAULT',
      });
      setIsIndexModalOpen(true);
  };

  const openEditIndexModal = () => {
      if (!selectedIndex) {
          message.warning(t('designer.selectIndexFirst'));
          return;
      }
      setIndexModalMode('edit');
      setIndexForm(buildIndexFormFromRow(selectedIndex));
      setIsIndexModalOpen(true);
  };

  const buildIndexCreateSql = (form: IndexFormState): string | null => {
      const tableInfo = resolveTableInfo();
      const dbType = tableInfo.dbType;
      const kind: IndexKind = form.kind || 'NORMAL';
      const indexName = String(form.name || '').trim();
      const cleanedCols = form.columnNames.map(col => String(col || '').trim()).filter(Boolean);
      if (cleanedCols.length === 0) {
          message.error(t('designer.selectAtLeastOneField'));
          return null;
      }
      const colSql = cleanedCols
          .map(col => quoteIdentifierPartByDialect(col, dbType))
          .join(', ');

      if (isMysqlLikeDialect(dbType)) {
          if (kind === 'PRIMARY') {
              return `ALTER TABLE ${tableInfo.tableRef}\nADD PRIMARY KEY (${colSql});`;
          }

          if (!indexName) {
              message.error(t('designer.enterIndexName'));
              return null;
          }

          const indexRef = quoteIdentifierPartByDialect(indexName, dbType);
          if (kind === 'FULLTEXT') {
              return `ALTER TABLE ${tableInfo.tableRef}\nADD FULLTEXT INDEX ${indexRef} (${colSql});`;
          }
          if (kind === 'SPATIAL') {
              return `ALTER TABLE ${tableInfo.tableRef}\nADD SPATIAL INDEX ${indexRef} (${colSql});`;
          }

          const normalizedType = String(form.indexType || '').trim().toUpperCase() || 'DEFAULT';
          if (normalizedType === 'FULLTEXT' || normalizedType === 'SPATIAL') {
              message.error(t('designer.switchIndexCategory', { type: normalizedType }));
              return null;
          }
          const usingSql = normalizedType !== 'DEFAULT' ? ` USING ${normalizedType}` : '';
          const prefix = kind === 'UNIQUE' ? 'ADD UNIQUE INDEX' : 'ADD INDEX';
          return `ALTER TABLE ${tableInfo.tableRef}\n${prefix} ${indexRef}${usingSql} (${colSql});`;
      }

      if (kind === 'PRIMARY' || kind === 'FULLTEXT' || kind === 'SPATIAL') {
          message.warning(t('designer.indexTypeLimited'));
          return null;
      }
      if (!indexName) {
          message.error(t('designer.enterIndexName'));
          return null;
      }

      const indexRef = quoteIdentifierPartByDialect(indexName, dbType);
      const normalizedType = String(form.indexType || '').trim().toUpperCase() || 'DEFAULT';
      const uniquePrefix = kind === 'UNIQUE' ? 'UNIQUE ' : '';

      if (isPgLikeDialect(dbType)) {
          const usingSql = normalizedType !== 'DEFAULT' ? ` USING ${normalizedType}` : '';
          return `CREATE ${uniquePrefix}INDEX ${indexRef} ON ${tableInfo.tableRef}${usingSql} (${colSql});`;
      }

      if (isSqlServerDialect(dbType)) {
          const methodSql = normalizedType === 'CLUSTERED' || normalizedType === 'NONCLUSTERED'
              ? `${normalizedType} `
              : '';
          return `CREATE ${uniquePrefix}${methodSql}INDEX ${indexRef} ON ${tableInfo.tableRef} (${colSql});`;
      }

      if (isOracleLikeDialect(dbType) || dbType === 'sqlite') {
          return `CREATE ${uniquePrefix}INDEX ${indexRef} ON ${tableInfo.tableRef} (${colSql});`;
      }

      if (isNonRelationalDialect(dbType)) {
          message.warning(t('designer.indexNotSupported'));
          return null;
      }
      return `CREATE ${uniquePrefix}INDEX ${indexRef} ON ${tableInfo.tableRef} (${colSql});`;
  };

  const buildIndexDropSql = (indexName: string): string | null => {
      const tableInfo = resolveTableInfo();
      const dbType = tableInfo.dbType;
      const name = String(indexName || '').trim();
      if (!name) return null;

      if (isMysqlLikeDialect(dbType)) {
          if (name.toUpperCase() === 'PRIMARY') {
              return `ALTER TABLE ${tableInfo.tableRef}\nDROP PRIMARY KEY;`;
          }
          const indexRef = quoteIdentifierPartByDialect(name, dbType);
          return `DROP INDEX ${indexRef} ON ${tableInfo.tableRef};`;
      }

      if (isSqlServerDialect(dbType)) {
          const indexRef = quoteIdentifierPartByDialect(name, dbType);
          return `DROP INDEX ${indexRef} ON ${tableInfo.tableRef};`;
      }

      if (isPgLikeDialect(dbType) || isOracleLikeDialect(dbType) || dbType === 'sqlite') {
          const fullIndexName = name.includes('.') || !tableInfo.schema
              ? name
              : `${tableInfo.schema}.${name}`;
          const indexRef = quoteIdentifierPathByDialect(fullIndexName, dbType);
          return `DROP INDEX ${indexRef};`;
      }

      if (isNonRelationalDialect(dbType)) {
          return null;
      }
      const fullIndexName = name.includes('.') || !tableInfo.schema
          ? name
          : `${tableInfo.schema}.${name}`;
      const indexRef = quoteIdentifierPathByDialect(fullIndexName, dbType);
      return `DROP INDEX ${indexRef};`;
  };

  const handleSubmitIndex = async () => {
      if (!supportsIndexSchemaOps()) {
          message.warning(t('designer.indexMaintainNotSupported'));
          return;
      }
      if (!tab.tableName) return;
      const supportedKinds = new Set(getIndexKindOptions().map(item => item.value));
      if (!supportedKinds.has(indexForm.kind)) {
          message.warning(t('designer.indexTypeNotSupported'));
          return;
      }
      const nextName = indexForm.kind === 'PRIMARY' ? 'PRIMARY' : String(indexForm.name || '').trim();
      if (indexForm.kind !== 'PRIMARY' && !nextName) {
          message.error(t('designer.enterIndexName'));
          return;
      }
      if (indexForm.columnNames.length === 0) {
          message.error(t('designer.selectAtLeastOneField'));
          return;
      }

      const upperName = nextName.toUpperCase();
      const duplicate = groupedIndexes.some(idx => {
          if (indexModalMode === 'edit' && selectedIndex && idx.key === selectedIndex.key) return false;
          return idx.name.toUpperCase() === upperName;
      });
      if (duplicate) {
          message.error(t('designer.indexNameExists', { name: nextName }));
          return;
      }

      setIndexSaving(true);
      const addSql = buildIndexCreateSql({ ...indexForm, name: nextName });
      if (!addSql) {
          setIndexSaving(false);
          return;
      }
      let sql = addSql;

      if (indexModalMode === 'edit' && selectedIndex) {
          const previousForm = buildIndexFormFromRow(selectedIndex);
          const nextForm: IndexFormState = {
              name: indexForm.kind === 'PRIMARY' ? 'PRIMARY' : nextName,
              columnNames: [...indexForm.columnNames],
              kind: indexForm.kind,
              indexType: indexForm.kind === 'NORMAL' || indexForm.kind === 'UNIQUE'
                  ? (String(indexForm.indexType || '').trim().toUpperCase() || 'DEFAULT')
                  : 'DEFAULT',
          };
          if (!hasIndexFormChanged(previousForm, nextForm)) {
              setIndexSaving(false);
              message.info(t('designer.noIndexChanges'));
              return;
          }
          const dropSql = buildIndexDropSql(selectedIndex.name);
          if (!dropSql) {
              setIndexSaving(false);
              message.warning(t('designer.cannotDeleteIndex'));
              return;
          }
          const ok = await executeIndexEditSql(dropSql, addSql, selectedIndex);
          setIndexSaving(false);
          if (ok) {
              setIsIndexModalOpen(false);
          }
          return;
      }

      const ok = await executeSchemaSql(sql, indexModalMode === 'create' ? t('designer.index.created') : t('designer.indexModified'));
      setIndexSaving(false);
      if (ok) {
          setIsIndexModalOpen(false);
      }
  };

  const handleDeleteIndex = () => {
      if (selectedIndexKeys.length === 0) {
          message.warning(t('designer.selectIndexToDelete'));
          return;
      }
      if (!supportsIndexSchemaOps()) {
          message.warning(t('designer.indexMaintainNotSupported'));
          return;
      }
      // 根据选中的 key 找到对应的索引对象
      const toDelete = groupedIndexes.filter(idx => selectedIndexKeys.includes(idx.key));
      if (toDelete.length === 0) {
          message.warning(t('designer.selectIndexToDelete'));
          return;
      }
      const names = toDelete.map(idx => `"${idx.name}"`).join(t('ai.welcome.tableJoiner'));
      Modal.confirm({
          title: t('designer.index.deleteTitle'),
          icon: <ExclamationCircleOutlined />,
          content: toDelete.length === 1
              ? t('designer.index.deleteContentSingle', { names })
              : t('designer.index.deleteContentMultiple', { count: toDelete.length, names }),
          okText: t('common.delete'),
          okType: 'danger',
          cancelText: t('common.cancel'),
          onOk: async () => {
              const sqls: string[] = [];
              for (const idx of toDelete) {
                  const sql = buildIndexDropSql(idx.name);
                  if (!sql) {
                      message.warning(t('designer.cannotDeleteIndexName', { name: idx.name }));
                      return;
                  }
                  sqls.push(sql);
              }
              const ok = await executeSchemaSql(
                  sqls.join('\n'),
                  toDelete.length === 1
                      ? t('designer.index.deleted')
                      : t('designer.index.deletedMultiple', { count: toDelete.length }),
              );
              if (ok) {
                  setSelectedIndexKeys([]);
              }
          }
      });
  };

  const openCreateForeignKeyModal = () => {
      setForeignKeyModalMode('create');
      setForeignKeyForm({
          constraintName: '',
          columnNames: [],
          refTableName: '',
          refColumnNames: [],
      });
      setIsForeignKeyModalOpen(true);
  };

  const openEditForeignKeyModal = () => {
      if (!selectedForeignKey) {
          message.warning(t('designer.selectFkFirst'));
          return;
      }
      setForeignKeyModalMode('edit');
      setForeignKeyForm({
          constraintName: selectedForeignKey.constraintName,
          columnNames: [...selectedForeignKey.columnNames],
          refTableName: selectedForeignKey.refTableName === '-' ? '' : selectedForeignKey.refTableName,
          refColumnNames: [...selectedForeignKey.refColumnNames],
      });
      setIsForeignKeyModalOpen(true);
  };

  const buildForeignKeyAddSql = (form: ForeignKeyFormState): string | null => {
      const tableInfo = resolveTableInfo();
      const dbType = tableInfo.dbType;
      if (!supportsForeignKeySchemaOps()) return null;

      const localColsSql = form.columnNames
          .map(col => quoteIdentifierPartByDialect(col, dbType))
          .join(', ');
      const refColsSql = form.refColumnNames
          .map(col => quoteIdentifierPartByDialect(col, dbType))
          .join(', ');
      const refParts = splitQualifiedName(form.refTableName);
      const refObjectName = refParts.objectName || String(form.refTableName || '').trim();
      const refTableName = !refParts.schemaName && tableInfo.schema && (isPgLikeDialect(dbType) || isSqlServerDialect(dbType) || isOracleLikeDialect(dbType))
          ? `${tableInfo.schema}.${refObjectName}`
          : String(form.refTableName || '').trim();
      const refTableSql = quoteIdentifierPathByDialect(refTableName, dbType);
      const constraintSql = quoteIdentifierPartByDialect(form.constraintName, dbType);
      return `ALTER TABLE ${tableInfo.tableRef}\nADD CONSTRAINT ${constraintSql} FOREIGN KEY (${localColsSql}) REFERENCES ${refTableSql} (${refColsSql});`;
  };

  const buildForeignKeyDropSql = (constraintName: string): string | null => {
      const tableInfo = resolveTableInfo();
      const dbType = tableInfo.dbType;
      if (!supportsForeignKeySchemaOps()) return null;
      const constraintSql = quoteIdentifierPartByDialect(constraintName, dbType);
      if (isMysqlLikeDialect(dbType)) {
          return `ALTER TABLE ${tableInfo.tableRef}\nDROP FOREIGN KEY ${constraintSql};`;
      }
      return `ALTER TABLE ${tableInfo.tableRef}\nDROP CONSTRAINT ${constraintSql};`;
  };

  const handleSubmitForeignKey = async () => {
      if (!supportsForeignKeySchemaOps()) {
          message.warning(t('designer.fkNotSupported'));
          return;
      }
      if (!tab.tableName) return;
      const nextConstraint = String(foreignKeyForm.constraintName || '').trim();
      const refTable = String(foreignKeyForm.refTableName || '').trim();
      const refCols = foreignKeyForm.refColumnNames.map(v => String(v || '').trim()).filter(Boolean);
      const localCols = foreignKeyForm.columnNames.map(v => String(v || '').trim()).filter(Boolean);

      if (!nextConstraint) {
          message.error(t('designer.enterFkName'));
          return;
      }
      if (localCols.length === 0) {
          message.error(t('designer.selectLocalFields'));
          return;
      }
      if (!refTable) {
          message.error(t('designer.enterRefTable'));
          return;
      }
      if (refCols.length === 0) {
          message.error(t('designer.enterRefFields'));
          return;
      }
      if (localCols.length !== refCols.length) {
          message.error(t('designer.fkFieldCountMismatch'));
          return;
      }

      const duplicate = groupedForeignKeys.some(item => {
          if (foreignKeyModalMode === 'edit' && selectedForeignKey && item.key === selectedForeignKey.key) return false;
          return item.constraintName.toUpperCase() === nextConstraint.toUpperCase();
      });
      if (duplicate) {
          message.error(t('designer.fkNameExists', { name: nextConstraint }));
          return;
      }

      setForeignKeySaving(true);
      const addSql = buildForeignKeyAddSql({
          ...foreignKeyForm,
          constraintName: nextConstraint,
          columnNames: localCols,
          refTableName: refTable,
          refColumnNames: refCols,
      });
      if (!addSql) {
          setForeignKeySaving(false);
          message.warning(t('designer.fkNotSupported'));
          return;
      }
      let sql = addSql;
      if (foreignKeyModalMode === 'edit' && selectedForeignKey) {
          const dropSql = buildForeignKeyDropSql(selectedForeignKey.constraintName);
          if (!dropSql) {
              setForeignKeySaving(false);
              message.warning(t('designer.cannotDeleteFk'));
              return;
          }
          sql = `${dropSql}\n${addSql}`;
      }

      const ok = await executeSchemaSql(sql, foreignKeyModalMode === 'create' ? t('designer.fk.created') : t('designer.fk.updated'));
      setForeignKeySaving(false);
      if (ok) {
          setIsForeignKeyModalOpen(false);
      }
  };

  const handleDeleteForeignKey = () => {
      if (!selectedForeignKey) {
          message.warning(t('designer.selectFkToDelete'));
          return;
      }
      if (!supportsForeignKeySchemaOps()) {
          message.warning(t('designer.fkNotSupported'));
          return;
      }
      Modal.confirm({
          title: t('designer.fk.deleteTitle'),
          icon: <ExclamationCircleOutlined />,
          content: t('designer.fk.deleteContent', { name: selectedForeignKey.constraintName }),
          okText: t('common.delete'),
          okType: 'danger',
          cancelText: t('common.cancel'),
          onOk: async () => {
              const sql = buildForeignKeyDropSql(selectedForeignKey.constraintName);
              if (!sql) {
                  message.warning(t('designer.cannotDeleteFk'));
                  return;
              }
              await executeSchemaSql(sql, t('designer.fk.deleted'));
          }
      });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (active.id !== over?.id) {
      setColumns((previous) => {
        const activeIndex = previous.findIndex((i) => i._key === active.id);
        const overIndex = previous.findIndex((i) => i._key === over?.id);
        return arrayMove(previous, activeIndex, overIndex);
      });
    }
  };

  const generateDDL = () => {
      if (isNewTable && !newTableName.trim()) {
          message.error(t('designer.enterTableName'));
          return;
      }
      if (columns.length === 0) {
          message.error(t('designer.addAtLeastOneField'));
          return;
      }

      if (isNewTable) {
          // CREATE TABLE
          const sql = buildCreateTableSql(isNewTable ? newTableName : tab.tableName || '', columns, charset, collation);
          setPreviewSql(sql);
          setIsPreviewOpen(true);
      } else {
          const tableInfo = resolveTableInfo();
          const sql = buildAlterTablePreviewSql({
              language,
              dbType: tableInfo.dbType,
              tableName: tableInfo.qualifiedName,
              originalColumns,
              columns,
          });

          if (!sql.trim()) {
              message.info(t('designer.noChanges'));
              return;
          }
          setPreviewSql(sql);
          setIsPreviewOpen(true);
      }
  };

  const handleRefreshDesigner = useCallback(() => {
      if (!hasUnsavedDraftChanges) {
          void fetchData();
          return;
      }

      Modal.confirm({
          title: t('designer.refresh.confirmTitle'),
          icon: <ExclamationCircleOutlined />,
          content: t('designer.refresh.confirmContent'),
          okText: t('designer.refresh.confirmOk'),
          cancelText: t('common.cancel'),
          onOk: async () => {
              await fetchData();
          },
      });
  }, [fetchData, hasUnsavedDraftChanges, t]);

  useEffect(() => {
      const handleRefreshActiveDesign = () => {
          if (useStore.getState().activeTabId !== tab.id) {
              return;
          }
          handleRefreshDesigner();
      };

      window.addEventListener('javanavi:refresh-active-design', handleRefreshActiveDesign as EventListener);
      return () => {
          window.removeEventListener('javanavi:refresh-active-design', handleRefreshActiveDesign as EventListener);
      };
  }, [handleRefreshDesigner, tab.id]);

	  const handleExecuteSave = async () => {
	      const result = await executeSchemaStatements(previewSql);
	      if (!result.ok) {
	          message.error(result.message || t('designer.executeFailed', { message: '' }).replace(/: $/, ''));
	          return;
	      }
	      message.success(isNewTable ? t('designer.tableCreated') : t('designer.tableModified'));
	      setIsPreviewOpen(false);
	      if (!isNewTable) {
              fetchData();
          } else {
              void fetchData();
          }
	  };

  // Merge columns with resize handler
  const resizableColumns = useMemo(() => tableColumns.map((col, index) => ({
    ...col,
    onHeaderCell: (column: ResizableColumn<EditableColumn>) => ({
      width: column.width,
      onResizeStart: handleResizeStart(index),
    }),
  })), [tableColumns]);

  // 字段表 Checkbox 选择列（不参与 resize，支持全选）
  const allColumnKeys = useMemo(() => columns.map(c => c._key), [columns]);
  const isAllColumnsSelected = allColumnKeys.length > 0 && selectedColumnRowKeys.length === allColumnKeys.length;
  const isColumnsIndeterminate = selectedColumnRowKeys.length > 0 && selectedColumnRowKeys.length < allColumnKeys.length;

  const columnSelectCol = useMemo(() => ({
      title: () => (
          <Checkbox
              checked={isAllColumnsSelected}
              indeterminate={isColumnsIndeterminate}
              onChange={(e) => setSelectedColumnRowKeys(e.target.checked ? allColumnKeys : [])}
              style={{ margin: 0 }}
          />
      ),
      dataIndex: '_select',
      key: '_select',
      width: 48,
      render: (_: unknown, record: EditableColumn) => (
          <Checkbox
              checked={selectedColumnRowKeys.includes(record._key)}
              onChange={(e) => {
                  e.stopPropagation();
                  setSelectedColumnRowKeys(prev =>
                      e.target.checked
                          ? [...prev, record._key]
                          : prev.filter(k => k !== record._key)
                  );
              }}
              style={{ margin: 0 }}
          />
      ),
  }), [selectedColumnRowKeys, allColumnKeys, isAllColumnsSelected, isColumnsIndeterminate]);

  // sort 拖拽列（不参与 resize）
  const sortColumn = useMemo(() => ({
      key: 'sort',
      width: 40,
      render: () => <MenuOutlined style={{ cursor: 'grab', color: '#999' }} />,
  }), []);

  const columnsWithSelect = useMemo(() =>
      readOnly
          ? resizableColumns
          : [columnSelectCol, sortColumn, ...resizableColumns],
      [readOnly, columnSelectCol, sortColumn, resizableColumns]
  );

  // --- Index Columns Init ---
  useEffect(() => {
      setIndexColumns([
          {
              title: t('designer.index.name'),
              dataIndex: 'name',
              key: 'name',
              width: 240,
              render: (text: string) => (
                  <Tooltip title={text}>
                      <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {text}
                      </span>
                  </Tooltip>
              ),
          },
          {
              title: t('designer.index.columns'),
              dataIndex: 'columnNames',
              key: 'columnNames',
              width: 320,
              render: (columnNames: string[]) => {
                  if (!columnNames || columnNames.length === 0) {
                      return '-';
                  }
                  return (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {columnNames.map((columnName: string, idx: number) => (
                              <Tag key={`${columnName}-${idx}`}>
                                  {columnName}
                              </Tag>
                          ))}
                      </div>
                  );
              }
          },
          {
              title: t('designer.index.indexType'),
              dataIndex: 'indexType',
              key: 'indexType',
              width: 140,
              render: (text: string) => text || '-',
          },
          {
              title: t('designer.index.uniqueness'),
              dataIndex: 'nonUnique',
              key: 'nonUnique',
              width: 110,
              render: (v: number) => (
                  <Tag color={v === 0 ? 'gold' : 'default'}>
                      {v === 0 ? t('designer.index.unique') : t('designer.index.regular')}
                  </Tag>
              ),
          },
      ]);
  }, [t]);

  // Checkbox 选择列（不参与 resize，支持全选）
  const allIndexKeys = groupedIndexes.map(idx => idx.key);
  const isAllSelected = allIndexKeys.length > 0 && selectedIndexKeys.length === allIndexKeys.length;
  const isIndeterminate = selectedIndexKeys.length > 0 && selectedIndexKeys.length < allIndexKeys.length;
  const toggleIndexSelection = (key: string, checked?: boolean) => {
      setSelectedIndexKeys(prev => getNextIndexSelection(prev, key, checked));
  };

  const selectColumn = {
      title: () => (
          <Checkbox
              checked={isAllSelected}
              indeterminate={isIndeterminate}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                  setSelectedIndexKeys(e.target.checked ? allIndexKeys : []);
              }}
              style={{ margin: 0 }}
          />
      ),
      dataIndex: '_select',
      key: '_select',
      width: 48,
      render: (_: unknown, record: IndexDisplayRow) => (
          <span
              onClick={(e) => {
                  e.stopPropagation();
                  toggleIndexSelection(record.key);
              }}
              style={{ display: 'inline-flex' }}
          >
              <Checkbox
                  checked={selectedIndexKeys.includes(record.key)}
                  onChange={() => undefined}
                  style={{ margin: 0, pointerEvents: 'none' }}
              />
          </span>
      ),
  };

  const resizableIndexColumns = [
      selectColumn,
      ...indexColumns.map((col, index) => ({
        ...col,
        onHeaderCell: (column: ResizableColumn<IndexDisplayRow>) => ({
          width: column.width,
          onResizeStart: handleIndexResizeStart(index),
        }),
      })),
  ];

  const columnsTabContent = (
      <div
          ref={containerRef}
          className="table-designer-wrapper"
          style={{
              height: '100%',
              overflow: 'hidden',
              position: 'relative',
              background: panelBodyBg
          }}
      >
        <style>{`
           .table-designer-wrapper .ant-table-body {
               max-height: ${tableHeight}px !important;
            }
            .table-designer-wrapper .table-designer-focus-row > .ant-table-cell {
                background: ${focusRowBg} !important;
            }
        `}</style>
        {readOnly ? (
        <Table<EditableColumn>
            dataSource={columns}
            columns={columnsWithSelect}
            rowKey="_key"
            rowClassName={(record: EditableColumn) => record._key === focusColumnKey ? 'table-designer-focus-row' : ''}
            size="small"
            pagination={false}
            loading={loading}
            scroll={{ y: tableHeight }}
            bordered={false}
            components={{
              header: {
                cell: ResizableTitle,
              },
            }}
        />
  ) : (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={columns.map(c => c._key)} strategy={verticalListSortingStrategy}>
            <Table<EditableColumn>
                dataSource={columns}
                columns={columnsWithSelect}
                rowKey="_key"
                rowClassName={(record: EditableColumn) => record._key === focusColumnKey ? 'table-designer-focus-row' : ''}
                size="small"
                pagination={false}
                loading={loading}
                scroll={{ y: tableHeight }}
                bordered={false}
                components={{
                    body: { row: SortableRow },
                    header: { cell: ResizableTitle }
                }}
            />
        </SortableContext>
      </DndContext>
  )}
  </div>
  );

  return (
    <div ref={shellRef} className="table-designer-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: '6px 0', position: 'relative' }}>
        <style>{`
            .table-designer-shell .ant-table,
            .table-designer-shell .ant-table-wrapper,
            .table-designer-shell .ant-table-container {
                background: transparent !important;
            }
            .table-designer-shell .ant-table-wrapper {
                border: none !important;
                overflow: hidden !important;
            }
            .table-designer-shell .ant-table-container {
                border: none !important;
            }
            .table-designer-shell .ant-table-thead > tr > th {
                background: transparent !important;
                border-bottom: 1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} !important;
                border-inline-end: 1px solid transparent !important;
            }
            .table-designer-shell .ant-table-tbody > tr > td,
            .table-designer-shell .ant-table-tbody .ant-table-row > .ant-table-cell {
                background: transparent !important;
                border-bottom: 1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} !important;
                border-inline-end: 1px solid transparent !important;
            }
            .table-designer-shell .ant-table-tbody td .ant-input {
                padding-left: 0 !important;
                padding-right: 0 !important;
            }
            .table-designer-shell .ant-table-tbody td .ant-select .ant-select-selector {
                padding-left: 0 !important;
            }
            .table-designer-shell .ant-table-thead > tr > th::before {
                display: none !important;
            }
            .table-designer-shell .ant-table-thead > tr > th {
                cursor: default !important;
                user-select: none !important;
                -webkit-user-select: none !important;
            }
            .table-designer-shell .ant-table-tbody > tr:hover > td,
            .table-designer-shell .ant-table-tbody .ant-table-row:hover > .ant-table-cell {
                background: ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.02)'} !important;
            }
            .table-designer-shell .ant-tabs-nav {
                margin-bottom: 8px !important;
            }
            .table-designer-shell .ant-tabs-nav::before {
                border-bottom-color: ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} !important;
            }
            .table-designer-shell .ant-tabs-nav-wrap {
                padding: 2px;
            }
            .table-designer-shell .ant-tabs-nav-list {
                gap: 8px;
            }
            .table-designer-shell .ant-tabs-ink-bar {
                display: none !important;
                will-change: transform;
                transition: width 0.15s ease, left 0.15s ease, transform 0.15s ease !important;
            }
            .table-designer-shell .ant-tabs-tab {
                margin: 0 !important;
                padding: 7px 14px !important;
                border-radius: 999px !important;
                border: 1px solid transparent !important;
                background: ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.56)'} !important;
                color: ${darkMode ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.62)'} !important;
                transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease !important;
            }
            .table-designer-shell .ant-tabs-tab:hover {
                background: ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(24,144,255,0.08)'} !important;
                color: ${darkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.82)'} !important;
            }
            .table-designer-shell .ant-tabs-tab .ant-tabs-tab-btn {
                color: inherit !important;
                font-weight: 500;
            }
            .table-designer-shell .ant-tabs-tab.ant-tabs-tab-active {
                background: ${darkMode ? 'rgba(246,196,83,0.18)' : 'rgba(24,144,255,0.14)'} !important;
                border-color: ${darkMode ? 'rgba(246,196,83,0.34)' : 'rgba(24,144,255,0.26)'} !important;
                box-shadow: ${darkMode ? '0 4px 12px rgba(0,0,0,0.18)' : '0 4px 12px rgba(24,144,255,0.12)'} !important;
                color: ${darkMode ? '#f6c453' : '#1677ff'} !important;
            }
            .table-designer-shell .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn {
                font-weight: 600;
            }
            .table-designer-shell .ant-tabs-content-holder,
            .table-designer-shell .ant-tabs-content,
            .table-designer-shell .ant-tabs-tabpane {
                height: 100%;
            }
            .table-designer-shell .react-resizable-handle {
                position: absolute !important;
                right: 0 !important;
                top: 0 !important;
                bottom: 0 !important;
                width: 10px !important;
                height: auto !important;
                background-position: top right !important;
                cursor: col-resize !important;
                z-index: 10;
                touch-action: none;
            }

        `}</style>
        <div
          ref={ghostRef}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: '2px',
            background: resizeGuideColor,
            zIndex: 9999,
            display: 'none',
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        />
        <div
            style={{
                padding: '10px 12px 8px 12px',
                borderBottom: `1px solid ${panelToolbarBorder}`,
                borderTopLeftRadius: panelRadius,
                borderTopRightRadius: panelRadius,
                borderLeft: `1px solid ${panelFrameColor}`,
                borderRight: `1px solid ${panelFrameColor}`,
                borderTop: `1px solid ${panelFrameColor}`,
                background: panelToolbarBg,
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
            }}
        >
            {isNewTable && (
                <>
                    <Input
                        {...noAutoCapInputProps}
                        placeholder={t('designer.enterTableName')}
                        value={newTableName}
                        onChange={e => setNewTableName(e.target.value)}
                        style={{ width: 150 }}
                    />
                    <Select
                        value={charset}
                        onChange={v => {
                            setCharset(v);
                            // Set default collation
                            const cols = getCollationOptions(v);
                            if (cols && cols.length > 0) setCollation(cols[0].value);
                        }}
                        options={CHARSETS}
                        style={{ width: 120 }}
                    />
                    <Select
                        value={collation}
                        onChange={setCollation}
                        options={getCollationOptions(charset)}
                        style={{ width: 150 }}
                    />
                </>
            )}
            {!readOnly && <Button size="small" icon={<SaveOutlined />} type="primary" onClick={generateDDL}>{t('common.save')}</Button>}
            {!isNewTable && <Button size="small" icon={<ReloadOutlined />} onClick={handleRefreshDesigner}>{t('common.refresh')}</Button>}
            {!isNewTable && !readOnly && supportsTableCommentOps() && (
                <Button size="small" icon={<EditOutlined />} onClick={openTableCommentModal}>{t('designer.tableComment.button')}</Button>
            )}
            {!readOnly && <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddColumn()}>{t('designer.button.addColumn')}</Button>}
            {!readOnly && (
                <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={handleAddColumnAfterSelected}
                    disabled={selectedColumnRowKeys.length === 0}
                >
                    {t('designer.button.addAfterSelected')}
                </Button>
            )}
            {!readOnly && (
                <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={openCopySelectedColumnsModal}
                    disabled={selectedColumns.length === 0}
                >
                    {t('designer.button.copySelectedToNewTable')}
                </Button>
            )}
            <div style={{ flex: 1 }} />
        </div>
        <Tabs
            activeKey={activeKey}
            onChange={(key) => React.startTransition(() => setActiveKey(key))}
            style={{
                flex: 1,
                minHeight: 0,
                padding: '8px 10px 10px 10px',
                borderBottomLeftRadius: panelRadius,
                borderBottomRightRadius: panelRadius,
                borderLeft: `1px solid ${panelFrameColor}`,
                borderRight: `1px solid ${panelFrameColor}`,
                borderBottom: `1px solid ${panelFrameColor}`,
                background: panelBodyBg
            }}
            items={[
                {
                    key: 'columns',
                    label: t('designer.tab.columns'),
                    children: columnsTabContent
                },
                ...(!isNewTable ? [
                    {
                        key: 'indexes',
                        label: t('designer.tab.indexes'),
                        children: (
                            <div className="index-table-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {!readOnly && (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Button size="small" icon={<PlusOutlined />} disabled={!supportsIndexSchemaOps()} onClick={openCreateIndexModal}>{t('common.create')}</Button>
                                        <Button size="small" icon={<EditOutlined />} disabled={!supportsIndexSchemaOps() || selectedIndexKeys.length !== 1} onClick={openEditIndexModal}>{t('common.edit')}</Button>
                                        <Button size="small" icon={<DeleteOutlined />} danger disabled={!supportsIndexSchemaOps() || selectedIndexKeys.length === 0} onClick={handleDeleteIndex}>{t('common.delete')}</Button>
                                        {!supportsIndexSchemaOps() && (
                                            <span style={{ marginLeft: 'auto', color: '#faad14', fontSize: 12, alignSelf: 'center' }}>
                                                {t('designer.index.viewOnly')}
                                            </span>
                                        )}
                                        {supportsIndexSchemaOps() && selectedIndexKeys.length > 0 && (
                                            <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12, alignSelf: 'center' }}>
                                                {t('designer.index.selectedCount', { count: selectedIndexKeys.length })}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div style={{ color: '#888', fontSize: 12 }}>
                                    {t('designer.index.summary', { indexCount: groupedIndexes.length, columnCount: groupedIndexFieldCount })}
                                </div>
                                <Table<IndexDisplayRow>
                                    dataSource={groupedIndexes}
                                    columns={resizableIndexColumns}
                                    rowKey="key"
                                    size="small"
                                    pagination={false}
                                    loading={loading}
                                    scroll={{ x: 960, y: tableHeight }}
                                    components={{
                                        header: { cell: ResizableTitle },
                                    }}
                                    onRow={(record) => ({
                                        onClick: () => {
                                            toggleIndexSelection(record.key);
                                        },
                                        style: { cursor: 'pointer' }
                                    })}
                                />
                            </div>
                        )
                    },
                    {
                        key: 'foreignKeys',
                        label: t('designer.tab.foreignKeys'),
                        children: (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {!readOnly && (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Button size="small" icon={<PlusOutlined />} disabled={!supportsForeignKeySchemaOps()} onClick={openCreateForeignKeyModal}>{t('common.create')}</Button>
                                        <Button size="small" icon={<EditOutlined />} disabled={!supportsForeignKeySchemaOps() || !selectedForeignKey} onClick={openEditForeignKeyModal}>{t('common.edit')}</Button>
                                        <Button size="small" icon={<DeleteOutlined />} danger disabled={!supportsForeignKeySchemaOps() || !selectedForeignKey} onClick={handleDeleteForeignKey}>{t('common.delete')}</Button>
                                        {!supportsForeignKeySchemaOps() && (
                                            <span style={{ marginLeft: 'auto', color: '#faad14', fontSize: 12, alignSelf: 'center' }}>
                                                {t('designer.fk.viewOnly')}
                                            </span>
                                        )}
                                        {supportsForeignKeySchemaOps() && selectedForeignKey && (
                                            <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12, alignSelf: 'center' }}>
                                                {t('designer.fk.selected', { name: selectedForeignKey.constraintName })}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <Table<ForeignKeyDisplayRow>
                                    dataSource={groupedForeignKeys}
                                    columns={[
                                        { title: t('designer.fk.constraintName'), dataIndex: 'constraintName', key: 'constraintName', width: 220 },
                                        {
                                            title: t('designer.fk.columns'),
                                            dataIndex: 'columnNames',
                                            key: 'columnNames',
                                            render: (vals: string[]) => vals?.length ? vals.join(', ') : '-',
                                        },
                                        { title: t('designer.fk.refTable'), dataIndex: 'refTableName', key: 'refTableName', width: 220 },
                                        {
                                            title: t('designer.fk.refColumns'),
                                            dataIndex: 'refColumnNames',
                                            key: 'refColumnNames',
                                            render: (vals: string[]) => vals?.length ? vals.join(', ') : '-',
                                        },
                                    ]}
                                    rowKey="key"
                                    size="small"
                                    pagination={false}
                                    loading={loading}
                                    scroll={{ x: 980, y: tableHeight }}
                                    rowSelection={{
                                        type: 'radio',
                                        selectedRowKeys: selectedForeignKey ? [selectedForeignKey.key] : [],
                                        onChange: (_, selectedRows) => setSelectedForeignKey((selectedRows[0] as ForeignKeyDisplayRow) || null),
                                    }}
                                    onRow={(record) => ({
                                        onClick: () => {
                                            if (selectedForeignKey?.key === record.key) {
                                                setSelectedForeignKey(null);
                                            } else {
                                                setSelectedForeignKey(record);
                                            }
                                        },
                                        style: { cursor: 'pointer' }
                                    })}
                                />
                            </div>
                        )
                    },
                    {
                        key: 'triggers',
                        label: t('designer.tab.triggers'),
                        children: (
                            <div>
                                <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                                    <Button
                                        size="small"
                                        icon={<EyeOutlined />}
                                        disabled={!selectedTrigger}
                                        onClick={() => setIsTriggerModalOpen(true)}
                                    >
                                        {t('designer.trigger.viewSql')}
                                    </Button>
                                    <Button size="small" icon={<PlusOutlined />} onClick={handleCreateTrigger}>{t('common.create')}</Button>
                                    <Button size="small" icon={<EditOutlined />} disabled={!selectedTrigger} onClick={handleEditTrigger}>{t('common.edit')}</Button>
                                    <Button size="small" icon={<DeleteOutlined />} danger disabled={!selectedTrigger} onClick={handleDeleteTrigger}>{t('common.delete')}</Button>
                                    <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12, alignSelf: 'center' }}>
                                        {selectedTrigger ? t('designer.trigger.selected', { name: selectedTrigger.name }) : t('designer.trigger.selectPrompt')}
                                    </span>
                                </div>
                                <Table<TriggerDefinition>
                                    dataSource={triggers}
                                    columns={[
                                        { title: t('designer.trigger.name'), dataIndex: 'name', key: 'name' },
                                        { title: t('designer.trigger.timing'), dataIndex: 'timing', key: 'timing', width: 100 },
                                        { title: t('designer.trigger.event'), dataIndex: 'event', key: 'event', width: 100 },
                                    ]}
                                    rowKey="name"
                                    size="small"
                                    pagination={false}
                                    loading={loading}
                                    scroll={{ y: tableHeight }}
                                    locale={{ emptyText: <Empty description={t('designer.trigger.none')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                                    rowSelection={{
                                        type: 'radio',
                                        selectedRowKeys: selectedTrigger ? [selectedTrigger.name] : [],
                                        onChange: (_, selectedRows) => setSelectedTrigger(selectedRows[0] || null),
                                        onSelect: (record, selected) => {
                                            // 点击单选按钮时，如果已选中则取消
                                            if (selectedTrigger?.name === record.name) {
                                                setSelectedTrigger(null);
                                            } else {
                                                setSelectedTrigger(record);
                                            }
                                        },
                                    }}
                                    onRow={(record) => ({
                                        onClick: () => {
                                            // 点击已选中的行时取消选择
                                            if (selectedTrigger?.name === record.name) {
                                                setSelectedTrigger(null);
                                            } else {
                                                setSelectedTrigger(record);
                                            }
                                        },
                                        style: { cursor: 'pointer' }
                                    })}
                                />
                            </div>
                        )
                    }
                ] : []),
                ...(!isNewTable ? [{
                    key: 'ddl',
                    label: t('designer.tab.ddl'),
                    icon: <FileTextOutlined />,
                    children: (
                        <div style={{ height: 'calc(100vh - 200px)', border: `1px solid ${panelFrameColor}`, borderRadius: panelRadius, background: panelBodyBg }}>
                            <Editor
                                height="100%"
                                language="sql"
                                theme={darkMode ? 'transparent-dark' : 'transparent-light'}
                                value={ddl}
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: true,
                                    wordWrap: 'on',
                                    automaticLayout: true,
                                    padding: { top: 8, bottom: 24 },
                                }}
                            />
                        </div>
                    )
                }] : [])
            ]}
        />

        <Modal
            title={t('designer.commentEditor.title', { suffix: commentEditorColumnName ? ` - ${commentEditorColumnName}` : '' })}
            open={isCommentModalOpen}
            onCancel={closeCommentEditor}
            onOk={() => {
                if (commentEditorColumnKey) {
                    handleColumnChange(commentEditorColumnKey, 'comment', commentEditorValue);
                }
                closeCommentEditor();
            }}
            okText={t('common.apply')}
            cancelText={t('common.cancel')}
            width={640}
            destroyOnHidden
        >
            <Input.TextArea
                value={commentEditorValue}
                onChange={(e) => setCommentEditorValue(e.target.value)}
                autoSize={{ minRows: 8, maxRows: 18 }}
                placeholder={t('designer.commentEditor.placeholder')}
                maxLength={2000}
            />
        </Modal>

        <Modal
            title={t('designer.modal.copyColumns')}
            open={isCopyColumnsModalOpen}
            onCancel={() => setIsCopyColumnsModalOpen(false)}
            onOk={handleExecuteCopySelectedColumns}
            okText={t('designer.copy.createTable')}
            cancelText={t('common.cancel')}
            confirmLoading={copyExecuting}
            width={560}
        >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ color: '#666' }}>
                    {t('designer.copy.selectedCount', { count: selectedColumns.length })}
                </div>
                <Input
                    {...noAutoCapInputProps}
                    placeholder={t('designer.copy.targetTablePlaceholder')}
                    value={copyTableName}
                    onChange={e => setCopyTableName(e.target.value)}
                    maxLength={128}
                />
                <Space wrap>
                    <Select
                        value={copyCharset}
                        onChange={v => {
                            setCopyCharset(v);
                            const cols = getCollationOptions(v);
                            if (cols && cols.length > 0) setCopyCollation(cols[0].value);
                        }}
                        options={CHARSETS}
                        style={{ width: 160 }}
                    />
                    <Select
                        value={copyCollation}
                        onChange={setCopyCollation}
                        options={getCollationOptions(copyCharset)}
                        style={{ width: 220 }}
                    />
                </Space>
            </Space>
        </Modal>

        <Modal
            title={t('designer.modal.tableComment')}
            open={isTableCommentModalOpen}
            onCancel={() => setIsTableCommentModalOpen(false)}
            onOk={handleSaveTableComment}
            okText={t('common.save')}
            cancelText={t('common.cancel')}
            confirmLoading={tableCommentSaving}
            width={640}
        >
            <Input.TextArea
                value={tableCommentDraft}
                onChange={(e) => setTableCommentDraft(e.target.value)}
                autoSize={{ minRows: 5, maxRows: 12 }}
                placeholder={t('designer.tableComment.placeholder')}
                maxLength={2048}
            />
            <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
                {t('designer.tableComment.current', { value: tableComment || t('designer.tableComment.empty') })}
            </div>
        </Modal>

        <Modal
            title={indexModalMode === 'create' ? t('designer.index.modal.createTitle') : t('designer.index.modal.editTitle')}
            open={isIndexModalOpen}
            onCancel={() => setIsIndexModalOpen(false)}
            onOk={handleSubmitIndex}
            okText={indexModalMode === 'create' ? t('common.create') : t('common.save')}
            cancelText={t('common.cancel')}
            confirmLoading={indexSaving}
            width={620}
        >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Input
                    {...noAutoCapInputProps}
                    placeholder={indexForm.kind === 'PRIMARY' ? t('designer.index.modal.primaryNamePlaceholder') : t('designer.index.modal.namePlaceholder')}
                    value={indexForm.name}
                    onChange={(e) => setIndexForm(prev => ({ ...prev, name: e.target.value }))}
                    maxLength={128}
                    disabled={indexForm.kind === 'PRIMARY'}
                />
                <Select
                    mode="multiple"
                    allowClear
                    placeholder={t('designer.index.modal.columnsPlaceholder')}
                    value={indexForm.columnNames}
                    onChange={(vals) => setIndexForm(prev => ({ ...prev, columnNames: vals }))}
                    options={localColumnOptions}
                    style={{ width: '100%' }}
                />
                <Space wrap>
                    <Select
                        value={indexForm.kind}
                        options={getIndexKindOptions()}
                        onChange={(val: IndexKind) => {
                            const fixedType = getFixedIndexType(val);
                            if (fixedType) {
                                // 固定类型（PRIMARY/FULLTEXT/SPATIAL）直接设置对应的索引方法
                                setIndexForm(prev => ({
                                    ...prev,
                                    kind: val,
                                    name: val === 'PRIMARY' ? 'PRIMARY' : (prev.name === 'PRIMARY' ? '' : prev.name),
                                    indexType: fixedType,
                                }));
                            } else {
                                const nextTypeOptions = getIndexTypeOptions(val);
                                const currentType = indexForm.indexType || 'DEFAULT';
                                const isCurrentTypeValid = nextTypeOptions.some(opt => opt.value === currentType);
                                setIndexForm(prev => ({
                                    ...prev,
                                    kind: val,
                                    name: val === 'PRIMARY' ? 'PRIMARY' : (prev.name === 'PRIMARY' ? '' : prev.name),
                                    indexType: isCurrentTypeValid ? currentType : 'DEFAULT',
                                }));
                            }
                        }}
                        style={{ width: 220 }}
                    />
                    <Select
                        value={indexForm.indexType}
                        onChange={(val) => setIndexForm(prev => ({ ...prev, indexType: val }))}
                        options={getIndexTypeOptions(indexForm.kind)}
                        style={{ width: 160 }}
                        disabled={indexForm.kind === 'PRIMARY' || indexForm.kind === 'FULLTEXT' || indexForm.kind === 'SPATIAL'}
                    />
                </Space>
                <div style={{ color: '#888', fontSize: 12 }}>
                    {t('designer.index.modal.restoreHint')}
                </div>
            </Space>
        </Modal>

        <Modal
            title={foreignKeyModalMode === 'create' ? t('designer.fk.modal.createTitle') : t('designer.fk.modal.editTitle')}
            open={isForeignKeyModalOpen}
            onCancel={() => setIsForeignKeyModalOpen(false)}
            onOk={handleSubmitForeignKey}
            okText={foreignKeyModalMode === 'create' ? t('common.create') : t('common.save')}
            cancelText={t('common.cancel')}
            confirmLoading={foreignKeySaving}
            width={700}
        >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Input
                    {...noAutoCapInputProps}
                    placeholder={t('designer.fk.modal.constraintPlaceholder')}
                    value={foreignKeyForm.constraintName}
                    onChange={(e) => setForeignKeyForm(prev => ({ ...prev, constraintName: e.target.value }))}
                    maxLength={128}
                />
                <Select
                    mode="multiple"
                    allowClear
                    placeholder={t('designer.fk.modal.localColumnsPlaceholder')}
                    value={foreignKeyForm.columnNames}
                    onChange={(vals) => setForeignKeyForm(prev => ({ ...prev, columnNames: vals }))}
                    options={localColumnOptions}
                    style={{ width: '100%' }}
                />
                <Input
                    {...noAutoCapInputProps}
                    placeholder={t('designer.fk.modal.refTablePlaceholder')}
                    value={foreignKeyForm.refTableName}
                    onChange={(e) => setForeignKeyForm(prev => ({ ...prev, refTableName: e.target.value }))}
                    maxLength={256}
                />
                <Select
                    mode="tags"
                    tokenSeparators={[',', ' ']}
                    placeholder={t('designer.fk.modal.refColumnsPlaceholder')}
                    value={foreignKeyForm.refColumnNames}
                    onChange={(vals) => setForeignKeyForm(prev => ({ ...prev, refColumnNames: vals }))}
                    style={{ width: '100%' }}
                />
                <div style={{ color: '#888', fontSize: 12 }}>
                    {t('designer.fk.modal.recreateHint')}
                </div>
            </Space>
        </Modal>

        <Modal
            title={t('designer.sqlPreview.confirmChanges')}
            open={isPreviewOpen}
            onOk={handleExecuteSave}
            onCancel={() => setIsPreviewOpen(false)}
            width={700}
            okText={t('common.execute')}
            cancelText={t('common.cancel')}
        >
            <TableDesignerSqlPreview sql={previewSql} darkMode={darkMode} />
            <p style={{ marginTop: 10, color: '#faad14' }}>{t('designer.sqlPreview.reviewBeforeExecute')}</p>
        </Modal>

        <Modal
            title={selectedTrigger ? t('designer.trigger.detailTitleWithName', { name: selectedTrigger.name }) : t('designer.trigger.detailTitle')}
            open={isTriggerModalOpen}
            onCancel={() => setIsTriggerModalOpen(false)}
            footer={null}
            width={700}
        >
            {selectedTrigger && (
                <div>
                    <div style={{ marginBottom: 12, display: 'flex', gap: 24 }}>
                        <span><strong>{t('designer.trigger.timing')}:</strong> {selectedTrigger.timing}</span>
                        <span><strong>{t('designer.trigger.event')}:</strong> {selectedTrigger.event}</span>
                    </div>
                    <div style={{ border: `1px solid ${panelFrameColor}`, borderRadius: panelRadius, background: panelBodyBg }}>
                        <Editor
                            height="350px"
                            language="sql"
                            theme={darkMode ? 'transparent-dark' : 'transparent-light'}
                            value={selectedTrigger.statement}
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                fontSize: 14,
                                lineNumbers: 'on',
                                scrollBeyondLastLine: false,
                                wordWrap: 'on',
                                automaticLayout: true,
                            }}
                        />
                    </div>
                </div>
            )}
        </Modal>

        <Modal
            title={triggerEditMode === 'create' ? t('designer.trigger.createTitle') : t('designer.trigger.editTitle')}
            open={isTriggerEditModalOpen}
            onCancel={() => setIsTriggerEditModalOpen(false)}
            width={800}
            okText={triggerEditMode === 'create' ? t('common.create') : t('common.save')}
            cancelText={t('common.cancel')}
            confirmLoading={triggerExecuting}
            onOk={handleExecuteTriggerSql}
        >
            <div style={{ marginBottom: 8, color: '#888', fontSize: 12 }}>
                {triggerEditMode === 'edit' && selectedTrigger && (
                    <span>{t('designer.trigger.recreateHint')}</span>
                )}
            </div>
            <div style={{ border: `1px solid ${panelFrameColor}`, borderRadius: panelRadius, background: panelBodyBg }}>
                <Editor
                    height="350px"
                    language="sql"
                    theme={darkMode ? 'vs-dark' : 'light'}
                    value={triggerEditSql}
                    onChange={(val) => setTriggerEditSql(val || '')}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        automaticLayout: true,
                    }}
                />
            </div>
            <p style={{ marginTop: 10, color: '#faad14' }}>{t('designer.sqlPreview.reviewSqlBeforeExecute')}</p>
        </Modal>
    </div>
  );
};

export default TableDesigner;
