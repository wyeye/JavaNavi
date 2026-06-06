import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Dropdown, Form, Input, DatePicker, TimePicker, InputNumber, Select } from 'antd';
import type { FormInstance, InputRef, MenuProps } from 'antd';
import type { PickerMode, PickerRef } from 'rc-picker/lib/interface';
import dayjs from 'dayjs';
import { ConsoleSqlOutlined, CopyOutlined, ExportOutlined, FileTextOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    TEMPORAL_FORMATS,
    getTemporalPickerType,
    parseToDayjs,
    resolveTemporalEditorSaveValue,
    shouldTemporalEditorSaveOnChange,
    shouldTemporalEditorUseConfirm,
    type TemporalPickerType,
} from './dataGridTemporal';
import {
    isCellValueEqualForDiff,
    normalizeDateTimeString,
} from './dataGridValue';
import { getDataGridScalarEditorType, toBooleanEditorValue } from './dataGridEditorType';
import { getDataGridPickerLocale } from './dataGridPickerLocale';
import { useStore } from '../../store';
import { translate, type I18nKey } from '../../i18n';

const DATA_GRID_BODY_FONT_WEIGHT = 400;

// 内部行标识字段：避免与真实业务字段（如 `key` 列）冲突。
export const JAVANAVI_ROW_KEY = '__javanavi_row_key__';

const INLINE_EDIT_MAX_CHARS = 2000;

const shouldOpenModalEditor = (val: unknown): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') {
        if (val.length > INLINE_EDIT_MAX_CHARS || val.includes('\n')) return true;
        const trimmed = val.trimStart();
        return trimmed.startsWith('{') || trimmed.startsWith('[');
    }
    return typeof val === 'object';
};

const getCellFieldName = (record: DataGridItem, dataIndex: string) => {
    const rowKey = record?.[JAVANAVI_ROW_KEY];
    if (rowKey === undefined || rowKey === null) return dataIndex;
    return [String(rowKey), dataIndex];
};

const setCellFieldValue = (form: FormInstance | null, fieldName: string | (string | number)[], value: unknown) => {
    if (!form) return;
    if (Array.isArray(fieldName)) {
        const [rowKey, colKey] = fieldName;
        form.setFieldsValue({ [rowKey]: { [colKey]: value } });
        return;
    }
    form.setFieldsValue({ [fieldName]: value });
};

type ResizableTitleProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  width?: number | string;
  onResizeStart?: (event: React.MouseEvent<HTMLElement>) => void;
  onResizeAutoFit?: (event: React.MouseEvent<HTMLElement>) => void;
};

const toDatePickerMode = (pickerType: TemporalPickerType): PickerMode | undefined => {
  if (!pickerType || pickerType === 'datetime' || pickerType === 'time') return undefined;
  return pickerType;
};

const removeCapturedWheelListener = (el: HTMLElement, handler: (event: WheelEvent) => void): void => {
  el.removeEventListener('wheel', handler, true);
};

// --- Resizable Header (Native Implementation) ---
export const ResizableTitle = React.forwardRef<HTMLTableCellElement, ResizableTitleProps>((props, ref) => {
  const { onResizeStart, onResizeAutoFit, width, ...restProps } = props;
  const language = useStore(state => state.language);
  const t = useCallback((key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);

  const nextStyle = { ...(restProps.style || {}) } as React.CSSProperties;
  if (width) {
    nextStyle.width = width;
  }

  // 注意：virtual table 模式下，rc-table 会依赖 header cell 的 width 样式来渲染选择列。
  // 若这里丢失 width，可能导致左上角“全选”checkbox 不显示。
  if (!width || typeof onResizeStart !== 'function') {
    return <th ref={ref} {...restProps} style={nextStyle} />;
  }

  return (
    <th ref={ref} {...restProps} style={{ ...nextStyle, position: 'relative' }}>
      {restProps.children}
      <span
        className="react-resizable-handle"
        onMouseDown={(e) => {
            e.stopPropagation();
            // Pass the header element reference implicitly via event target
            onResizeStart(e);
        }}
        onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onResizeAutoFit === 'function') {
                onResizeAutoFit(e);
            }
        }}
        onPointerDown={(e) => {
            // 阻止 pointerdown 冒泡到 @dnd-kit 的 PointerSensor，
            // 避免调整列宽时意外触发列拖拽排序
            e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        title={t('dataGrid.header.resizeColumn')}
        style={{
            position: 'absolute',
            right: 0, // Align to right edge
            bottom: 0,
            top: 0,
            width: 10,
            cursor: 'col-resize',
            zIndex: 10,
            touchAction: 'none'
        }}
      />
    </th>
  );
});

// --- Sortable Header Cell ---
interface SortableHeaderCellProps extends React.HTMLAttributes<HTMLTableCellElement> {
    id?: string;
}

// 静态 CSS 移到组件外，强制去除 th 内边距并确保指针穿透
const sortableHeaderStaticStyles = `
    .javanavi-sortable-header-cell {
        padding: 0 !important;
        overflow: hidden;
    }
    .javanavi-sortable-header-cell[data-cursor-grabbing="true"],
    .javanavi-sortable-header-cell[data-cursor-grabbing="true"] *,
    .javanavi-sortable-header-cell.is-dragging,
    .javanavi-sortable-header-cell.is-dragging * {
        cursor: grabbing !important;
    }
    .sortable-header-cell-drag-handle {
        display: flex;
        align-items: center;
        width: 100%;
        height: 100%;
        min-height: 44px;
        padding: 0 10px;
        user-select: none;
        cursor: inherit;
        overflow: hidden;
    }
`;

export const SortableHeaderCell: React.FC<SortableHeaderCellProps> = React.memo((props) => {
    const language = useStore(state => state.language);
    const t = useCallback((key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
    const { id, children, style: propStyle, className: propClassName, ...restProps } = props;
    const [isPressed, setIsPressed] = useState(false);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: id || '' });

    const style: React.CSSProperties = {
        ...propStyle,
        transform: CSS.Transform.toString(transform),
        transition,
        ...(isDragging ? { 
            position: 'relative', 
            zIndex: 9999, 
            opacity: 0.6, 
            backgroundColor: 'rgba(24, 144, 255, 0.15)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        } : {}),
        touchAction: 'none',
        willChange: 'transform',
        // 核心修复：将指针直接绑定到 th 级别，并由 isPressed 控制
        cursor: (isDragging || isPressed) ? 'grabbing' : 'pointer',
    };

    useEffect(() => {
        const handleGlobalMouseUp = () => setIsPressed(false);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    if (!id || id === 'JAVANAVI_SELECTION_COLUMN') {
        return <ResizableTitle {...restProps} style={{ ...propStyle, ...style }}>{children}</ResizableTitle>;
    }

    return (
        <ResizableTitle 
            ref={setNodeRef} 
            style={style} 
            className={`${propClassName || ''} ${isDragging ? 'is-dragging' : ''}`}
            data-cursor-grabbing={isDragging || isPressed}
            {...restProps} 
            {...attributes} 
            {...listeners}
            onPointerDown={(e: React.PointerEvent<HTMLTableCellElement>) => {
                setIsPressed(true);
                if (listeners?.onPointerDown) listeners.onPointerDown(e);
            }}
        >
            <style>{sortableHeaderStaticStyles}</style>
            <div className="sortable-header-cell-drag-handle" title={t('dataGrid.header.reorderColumn')}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, cursor: 'inherit' }}>
                    {children}
                </div>
            </div>
        </ResizableTitle>
    );
});

// --- Contexts ---
export const EditableContext = React.createContext<FormInstance | null>(null);
export const CellContextMenuContext = React.createContext<{
    showMenu: (e: React.MouseEvent, record: DataGridItem, dataIndex: string, title: React.ReactNode) => void;
    handleBatchFillToSelected: (record: DataGridItem, dataIndex: string) => void;
} | null>(null);
export const DataContext = React.createContext<{
    selectedRowKeysRef: React.MutableRefObject<React.Key[]>;
    displayDataRef: React.MutableRefObject<DataGridItem[]>;
    handleCopyInsert: (r: DataGridItem) => void;
    handleCopyUpdate: (r: DataGridItem) => void;
    handleCopyDelete: (r: DataGridItem) => void;
    handleCopyJson: (r: DataGridItem) => void;
    handleCopyCsv: (r: DataGridItem) => void;
    handleExportSelected: (format: string, r: DataGridItem) => Promise<void>;
    copyToClipboard: (t: string) => void;
    tableName?: string;
    enableRowContextMenu: boolean;
    supportsCopyInsert: boolean;
} | null>(null);


export interface DataGridItem {
  [key: string]: unknown;
}

const isReactKey = (value: unknown): value is React.Key => (
  typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
);

interface EditableCellProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title' | 'children'> {
  title: React.ReactNode;
  editable: boolean;
  children: React.ReactNode;
  dataIndex: string;
  record: DataGridItem;
  handleSave: (record: DataGridItem) => void;
  focusCell?: (record: DataGridItem, dataIndex: string, title: React.ReactNode) => void;
  columnType?: string;
  as?: React.ElementType;
}

export const EditableCell: React.FC<EditableCellProps> = React.memo(({
  title,
  editable,
  children,
  dataIndex,
  record,
  handleSave,
  focusCell,
  columnType,
  as: Component = 'td',
  onDoubleClick,
  ...restProps
}) => {
  const language = useStore(state => state.language);
  const t = useCallback((key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
  const [editing, setEditing] = useState(false);
  type FocusableEditorRef = Pick<InputRef, 'focus' | 'blur'> | Pick<PickerRef, 'focus' | 'blur'>;
  const inputRef = useRef<FocusableEditorRef | null>(null);
  const bindInputRef = useCallback((node: InputRef | null) => {
      inputRef.current = node;
  }, []);
  const bindPickerRef = useCallback((node: PickerRef | null) => {
      inputRef.current = node;
  }, []);
  const bindFocusableRef = useCallback((node: FocusableEditorRef | null) => {
      inputRef.current = node;
  }, []);
  const cellRef = useRef<HTMLElement>(null);
  const pickerOpenRef = useRef(false);
  const scrollLockRef = useRef<{ el: HTMLElement; handler: (e: WheelEvent) => void } | null>(null);
  const form = useContext(EditableContext);
  const cellContextMenuContext = useContext(CellContextMenuContext);

  /** DatePicker 面板打开时锁定表格滚动，关闭时恢复 */
  const lockTableScroll = useCallback((lock: boolean) => {
      if (lock) {
          // 查找虚拟滚动容器或常规滚动容器
          const tableWrapper = cellRef.current?.closest?.('.ant-table-wrapper') as HTMLElement | null;
          if (tableWrapper) {
              const handler = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); };
              tableWrapper.addEventListener('wheel', handler, { capture: true, passive: false });
              scrollLockRef.current = { el: tableWrapper, handler };
          }
      } else if (scrollLockRef.current) {
          const { el, handler } = scrollLockRef.current;
          removeCapturedWheelListener(el, handler);
          scrollLockRef.current = null;
      }
  }, []);

  useEffect(() => {
    if (editing) {
      // 每次进入编辑时强制设置表单值（覆盖 form store 中可能残留的旧值）
      const raw = record[dataIndex];
      const fieldName = getCellFieldName(record, dataIndex);
      if (isDateTimeField) {
        const dayjsVal = parseToDayjs(raw, pickerType);
        setCellFieldValue(form, fieldName, dayjsVal);
      } else if (scalarEditorType === 'boolean') {
        setCellFieldValue(form, fieldName, toBooleanEditorValue(raw));
      } else {
        const initialValue = typeof raw === 'string' ? normalizeDateTimeString(raw) : raw;
        setCellFieldValue(form, fieldName, initialValue);
      }
      inputRef.current?.focus();
    }
  }, [editing]);

  const toggleEdit = () => {
    setEditing(!editing);
  };

  const save = async (pickerValue?: dayjs.Dayjs | null) => {
    try {
      if (!form || !editing) return;
      const fieldName = getCellFieldName(record, dataIndex);
      await form.validateFields([fieldName]);
      let nextValue = form.getFieldValue(fieldName);
      if (isDateTimeField) {
        nextValue = resolveTemporalEditorSaveValue(nextValue, pickerValue, pickerType);
      }
      toggleEdit();
      // 仅当值发生变化时才标记为修改，避免“双击-失焦”导致整行进入 modified 状态（蓝色高亮不清除）。
      if (!isCellValueEqualForDiff(record?.[dataIndex], nextValue)) {
        handleSave({ ...record, [dataIndex]: nextValue });
      }
      // 保存后移除焦点
      if (inputRef.current) {
        inputRef.current.blur();
      }
    } catch {
      // 日期时间类型保存失败时兜底退出编辑，避免 DatePicker 卡在编辑态
      if (isDateTimeField && editing) setEditing(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!cellContextMenuContext) return;
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡到行级菜单
    cellContextMenuContext.showMenu(e, record, dataIndex, title);
  };

  let childNode = children;

  const pickerType = getTemporalPickerType(columnType);
  const scalarEditorType = getDataGridScalarEditorType(columnType);
  const pickerLocale = getDataGridPickerLocale(language);
  const isDateTimeField = !!pickerType && !(/^0{4}-0{2}-0{2}/.test(String(record?.[dataIndex] || '')));

  if (editable) {
    childNode = editing ? (
      <Form.Item style={{ margin: 0 }} name={getCellFieldName(record, dataIndex)}>
        {isDateTimeField ? (
          pickerType === 'time' ? (
            <TimePicker
              ref={bindPickerRef}
              style={{ width: '100%' }}
              locale={pickerLocale}
              format={TEMPORAL_FORMATS[pickerType]}
              onChange={(value) => setTimeout(() => { void save(value); }, 0)}
              onOpenChange={lockTableScroll}
              onBlur={() => setTimeout(() => { void save(); }, 0)}
              needConfirm={false}
            />
          ) : pickerType === 'datetime' ? (
            <DatePicker
              ref={bindPickerRef}
              style={{ width: '100%' }}
              locale={pickerLocale}
              showTime
              showNow={false}
              format={TEMPORAL_FORMATS[pickerType]}
              renderExtraFooter={() => (
                <a
                  style={{ padding: '0 2px' }}
                  onClick={() => {
                    // 自定义“此刻”：填入当前时间并立即保存。
                    const fieldName = getCellFieldName(record, dataIndex);
                    const now = dayjs();
                    setCellFieldValue(form, fieldName, now);
                    setTimeout(() => { void save(now); }, 0);
                  }}
                >{t('dataGrid.editor.now')}</a>
              )}
              onChange={(value) => {
                if (shouldTemporalEditorSaveOnChange(pickerType)) {
                  setTimeout(() => { void save(value); }, 0);
                }
              }}
              onOk={(value) => setTimeout(() => { void save((value as dayjs.Dayjs | null | undefined) ?? undefined); }, 0)}
              onOpenChange={(open) => {
                pickerOpenRef.current = open;
                lockTableScroll(open);
              }}
              onBlur={() => {
                // 兜底：面板未打开或已关闭时，点击外部通过 blur 保存并退出编辑。
                setTimeout(() => { if (editing && !pickerOpenRef.current) void save(); }, 150);
              }}
              needConfirm={shouldTemporalEditorUseConfirm(pickerType)}
            />
          ) : (
            <DatePicker
              ref={bindPickerRef}
              style={{ width: '100%' }}
              locale={pickerLocale}
              format={TEMPORAL_FORMATS[pickerType]}
              picker={toDatePickerMode(pickerType)}
              onChange={(value) => setTimeout(() => { void save(value); }, 0)}
              onOpenChange={lockTableScroll}
              onBlur={() => setTimeout(() => { void save(); }, 0)}
              needConfirm={false}
            />
          )
        ) : scalarEditorType === 'number' ? (
          <InputNumber
            ref={bindFocusableRef}
            style={{ width: '100%' }}
            stringMode
            controls={false}
            onPressEnter={() => { void save(); }}
            onBlur={() => { void save(); }}
            onFocus={(e) => {
              try {
                (e.target as HTMLInputElement)?.select?.();
              } catch {
                // ignore
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              try {
                ((e.target as HTMLElement).closest('input') as HTMLInputElement | null)?.select?.();
              } catch {
                // ignore
              }
            }}
          />
        ) : scalarEditorType === 'boolean' ? (
          <Select
            ref={bindFocusableRef}
            style={{ width: '100%' }}
            options={[
              { label: 'true', value: true },
              { label: 'false', value: false },
            ]}
            onChange={() => setTimeout(() => { void save(); }, 0)}
            onBlur={() => setTimeout(() => { void save(); }, 0)}
          />
        ) : (
          <Input
            ref={bindInputRef}
            onPressEnter={() => { void save(); }}
            onBlur={() => { void save(); }}
            onFocus={(e) => {
              try {
                (e.target as HTMLInputElement)?.select?.();
              } catch {
                // ignore
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              try {
                (e.target as HTMLInputElement)?.select?.();
              } catch {
                // ignore
              }
            }}
          />
        )}
      </Form.Item>
    ) : (
      <div
        className="editable-cell-value-wrap"
        style={{ paddingRight: 24, minHeight: 20, position: 'relative', fontWeight: DATA_GRID_BODY_FONT_WEIGHT }}
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>
    );
  } else if (cellContextMenuContext) {
    // 非编辑模式（只读查询结果）也绑定右键菜单，支持复制为 INSERT/JSON/CSV 等操作
    childNode = (
      <div onContextMenu={handleContextMenu} style={{ minHeight: 20, fontWeight: DATA_GRID_BODY_FONT_WEIGHT }}>
        {children}
      </div>
    );
  }

  const handleDoubleClick = () => {
      if (!editable) return;
      // 已在编辑态时再次双击不应退出编辑；双击应支持在 Input 内进行全选。
      if (editing) return;
      const raw = record?.[dataIndex];
      if (focusCell && shouldOpenModalEditor(raw)) {
          focusCell(record, dataIndex, title);
          return;
      }
      toggleEdit();
  };

  return (
      <Component
          ref={cellRef}
          {...restProps}
          data-row-key={record ? String(record?.[JAVANAVI_ROW_KEY]) : undefined}
          data-col-name={dataIndex || undefined}
          onDoubleClick={editable ? handleDoubleClick : onDoubleClick}
      >
          {childNode}
      </Component>
  );
});

type ContextMenuRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
    record?: DataGridItem;
};

export const ContextMenuRow = React.memo(({ children, record, ...props }: ContextMenuRowProps) => {
    const context = useContext(DataContext);
    const language = useStore(state => state.language);
    const t = useCallback((key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
    
    if (!record || !context) return <tr {...props}>{children}</tr>;

    const {
        selectedRowKeysRef,
        displayDataRef,
        handleCopyInsert,
        handleCopyUpdate,
        handleCopyDelete,
        handleCopyJson,
        handleCopyCsv,
        handleExportSelected,
        copyToClipboard,
        enableRowContextMenu,
        supportsCopyInsert,
    } = context;

    if (!enableRowContextMenu) {
        return <tr {...props}>{children}</tr>;
    }

    const getTargets = () => {
        const keys = selectedRowKeysRef.current;
        const recordKey = record?.[JAVANAVI_ROW_KEY];
        if (isReactKey(recordKey) && keys.includes(recordKey)) {
            return displayDataRef.current.filter(d => {
                const rowKey = d?.[JAVANAVI_ROW_KEY];
                return isReactKey(rowKey) && keys.includes(rowKey);
            });
        }
        return [record];
    };

    const menuItems: MenuProps['items'] = [
        ...(supportsCopyInsert ? [{
            key: 'insert',
            label: t('dataGrid.context.copyAsInsert'),
            icon: <ConsoleSqlOutlined />,
            onClick: () => handleCopyInsert(record),
        }, {
            key: 'update',
            label: t('dataGrid.context.copyAsUpdate'),
            icon: <ConsoleSqlOutlined />,
            onClick: () => handleCopyUpdate(record),
        }, {
            key: 'delete',
            label: t('dataGrid.context.copyAsDelete'),
            icon: <ConsoleSqlOutlined />,
            onClick: () => handleCopyDelete(record),
        }] : []),
        { key: 'json', label: t('dataGrid.context.copyAsJson'), icon: <FileTextOutlined />, onClick: () => handleCopyJson(record) },
        { key: 'csv', label: t('dataGrid.context.copyAsCsv'), icon: <FileTextOutlined />, onClick: () => handleCopyCsv(record) },
        { key: 'copy', label: t('dataGrid.context.copyAsMarkdown'), icon: <CopyOutlined />, onClick: () => {
            const records = getTargets();
            const orderedCols = displayDataRef.current.length > 0
                ? Object.keys(displayDataRef.current[0]).filter(c => c !== JAVANAVI_ROW_KEY)
                : [];
            const header = `| ${orderedCols.join(' | ')} |`;
            const separator = `| ${orderedCols.map(() => '---').join(' | ')} |`;
            const rows = records.map((r) => {
                const values = orderedCols.map(c => {
                    const v = r[c];
                    if (v === null || v === undefined) return 'NULL';
                    return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
                });
                return `| ${values.join(' | ')} |`;
            });
            copyToClipboard([header, separator, ...rows].join('\n'));
        } },
        { type: 'divider' },
        {
            key: 'export-selected',
            label: t('dataGrid.context.exportSelected'),
            icon: <ExportOutlined />,
            children: [
                { key: 'exp-csv', label: 'CSV', onClick: () => handleExportSelected('csv', record).catch(console.error) },
                { key: 'exp-xlsx', label: 'Excel', onClick: () => handleExportSelected('xlsx', record).catch(console.error) },
                { key: 'exp-json', label: 'JSON', onClick: () => handleExportSelected('json', record).catch(console.error) },
                { key: 'exp-md', label: 'Markdown', onClick: () => handleExportSelected('md', record).catch(console.error) },
                { key: 'exp-html', label: 'HTML', onClick: () => handleExportSelected('html', record).catch(console.error) },
            ]
        }
    ];

    return (
        <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']} getPopupContainer={() => document.body} autoAdjustOverflow>
            <tr {...props}>{children}</tr>
        </Dropdown>
    );
});
