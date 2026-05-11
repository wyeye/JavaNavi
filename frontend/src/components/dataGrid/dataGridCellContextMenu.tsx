import React from 'react';
import { createPortal } from 'react-dom';
import { EditOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
import { JAVANAVI_ROW_KEY } from './dataGridCells';

export type DataGridCellContextMenuState<TRecord = any> = {
    visible: boolean;
    x: number;
    y: number;
    record: TRecord | null;
    dataIndex: string;
    title: string;
    columnComment: string;
};

export const createInitialDataGridCellContextMenuState = <TRecord,>(): DataGridCellContextMenuState<TRecord> => ({
    visible: false,
    x: 0,
    y: 0,
    record: null,
    dataIndex: '',
    title: '',
    columnComment: '',
});

export const resolveDataGridCellContextMenuPosition = (event: React.MouseEvent): { x: number; y: number } => {
    // 预估菜单尺寸（菜单项数 × 行高 + 分隔线 + padding）
    const estimatedMenuHeight = 320;
    const estimatedMenuWidth = 200;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    let menuY = event.clientY;
    let menuX = event.clientX;
    // 底部空间不足时向上偏移
    if (menuY + estimatedMenuHeight > viewportH) {
        menuY = Math.max(4, viewportH - estimatedMenuHeight);
    }
    // 右侧空间不足时向左偏移
    if (menuX + estimatedMenuWidth > viewportW) {
        menuX = Math.max(4, viewportW - estimatedMenuWidth);
    }
    return { x: menuX, y: menuY };
};

type DataGridCellContextMenuActionOptions = {
    icon?: React.ReactNode;
    disabled?: boolean;
};

type DataGridCellContextMenuProps<TRecord = any> = {
    viewMode: string;
    menuState: DataGridCellContextMenuState<TRecord>;
    bgContextMenu: string;
    darkMode: boolean;
    canModifyData: boolean;
    selectedRowKeysLength: number;
    hasCopiedCellPatch: boolean;
    supportsCopyInsert: boolean;
    getTargets: (record: TRecord) => any[];
    copyToClipboard: (text: string) => void;
    onClose: () => void;
    onCellSetNull: () => void;
    onOpenContextMenuRowEditor: () => void;
    onBatchFillToSelected: (record: TRecord, dataIndex: string) => void;
    onPasteCopiedColumnsToSelectedRows: (fallbackRowKey?: React.Key) => void;
    onCopyInsert: (record: TRecord) => void;
    onCopyUpdate: (record: TRecord) => void;
    onCopyDelete: (record: TRecord) => void;
    onCopyJson: (record: TRecord) => void;
    onCopyCsv: (record: TRecord) => void;
    renderExportActions: (record: TRecord | null) => React.ReactNode;
};

export const DataGridCellContextMenu = <TRecord extends Record<string, any>,>({
    viewMode,
    menuState,
    bgContextMenu,
    darkMode,
    canModifyData,
    selectedRowKeysLength,
    hasCopiedCellPatch,
    supportsCopyInsert,
    getTargets,
    copyToClipboard,
    onClose,
    onCellSetNull,
    onOpenContextMenuRowEditor,
    onBatchFillToSelected,
    onPasteCopiedColumnsToSelectedRows,
    onCopyInsert,
    onCopyUpdate,
    onCopyDelete,
    onCopyJson,
    onCopyCsv,
    renderExportActions,
}: DataGridCellContextMenuProps<TRecord>) => {
    if (viewMode !== 'table' || !menuState.visible) return null;

    const divider = <div style={{ height: 1, background: darkMode ? '#303030' : '#f0f0f0', margin: '4px 0' }} />;
    const renderAction = (
        label: string,
        action: () => void | Promise<void>,
        options?: DataGridCellContextMenuActionOptions,
    ) => renderDataGridCellContextMenuAction({ label, action, darkMode, onClose, options });
    const isHeaderMenu = !menuState.record;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                left: menuState.x,
                top: menuState.y,
                zIndex: 10000,
                background: bgContextMenu,
                border: darkMode ? '1px solid #303030' : '1px solid #d9d9d9',
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                minWidth: 160,
                maxHeight: `calc(100vh - ${menuState.y}px - 8px)`,
                overflowY: 'auto',
                color: darkMode ? '#fff' : 'rgba(0, 0, 0, 0.88)',
            }}
            onClick={(event) => event.stopPropagation()}
        >
            {isHeaderMenu ? (
                <>
                    {renderAction('复制字段名', () => copyToClipboard(menuState.dataIndex))}
                    {renderAction('复制注释', () => copyToClipboard(menuState.columnComment), { disabled: !menuState.columnComment })}
                </>
            ) : (
                <>
            {canModifyData && (
                <>
                    {renderAction('设置为 NULL', onCellSetNull)}
                    {renderAction('编辑本行', onOpenContextMenuRowEditor, { icon: <EditOutlined style={{ marginRight: 8 }} /> })}
                    {renderAction(`填充到选中行 (${selectedRowKeysLength})`, () => {
                        if (menuState.record) onBatchFillToSelected(menuState.record, menuState.dataIndex);
                    }, { icon: <VerticalAlignBottomOutlined style={{ marginRight: 8 }} />, disabled: selectedRowKeysLength === 0 })}
                    {renderAction('粘贴已复制列（同名列）', () => {
                        const fallbackKey = menuState.record?.[JAVANAVI_ROW_KEY];
                        onPasteCopiedColumnsToSelectedRows(fallbackKey);
                    }, { icon: <VerticalAlignBottomOutlined style={{ marginRight: 8 }} />, disabled: !hasCopiedCellPatch })}
                    {divider}
                </>
            )}
            {supportsCopyInsert && (
                <>
                    {renderAction('复制为 INSERT', () => { if (menuState.record) onCopyInsert(menuState.record); })}
                    {renderAction('复制为 UPDATE', () => { if (menuState.record) onCopyUpdate(menuState.record); })}
                    {renderAction('复制为 DELETE', () => { if (menuState.record) onCopyDelete(menuState.record); })}
                </>
            )}
            {renderAction('复制为 JSON', () => { if (menuState.record) onCopyJson(menuState.record); })}
            {renderAction('复制为 CSV', () => { if (menuState.record) onCopyCsv(menuState.record); })}
            {renderAction('复制为 Markdown', () => {
                if (menuState.record) {
                    const records = getTargets(menuState.record);
                    const lines = records.map((record: any) => {
                        const { [JAVANAVI_ROW_KEY]: _rowKey, ...vals } = record;
                        return `| ${Object.values(vals).join(' | ')} |`;
                    });
                    copyToClipboard(lines.join('\n'));
                }
            })}
            {divider}
            {renderExportActions(menuState.record)}
                </>
            )}
        </div>,
        document.body,
    );
};

export const renderDataGridCellContextMenuAction = ({
    label,
    action,
    darkMode,
    onClose,
    options,
}: {
    label: string;
    action: () => void | Promise<void>;
    darkMode: boolean;
    onClose: () => void;
    options?: DataGridCellContextMenuActionOptions;
}): React.ReactNode => (
    <div
        style={{
            padding: '8px 12px',
            cursor: options?.disabled ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            opacity: options?.disabled ? 0.5 : 1,
        }}
        onMouseEnter={(event) => {
            if (!options?.disabled) event.currentTarget.style.background = darkMode ? '#303030' : '#f5f5f5';
        }}
        onMouseLeave={(event) => {
            event.currentTarget.style.background = 'transparent';
        }}
        onClick={() => {
            if (options?.disabled) return;
            try {
                void Promise.resolve(action()).catch(console.error);
            } catch (error) {
                console.error(error);
            }
            onClose();
        }}
    >
        {options?.icon}
        {label}
    </div>
);
