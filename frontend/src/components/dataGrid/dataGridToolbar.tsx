import React, { useMemo } from 'react';
import type { MenuProps } from 'antd';
import type { DataGridJsonValue } from './dataGridValue';
import { Button, Dropdown, Popover, Tooltip } from 'antd';
import {
    CloseOutlined,
    CopyOutlined,
    DeleteOutlined,
    DownOutlined,
    EditOutlined,
    ExportOutlined,
    FilterOutlined,
    ImportOutlined,
    MoreOutlined,
    PlusOutlined,
    ReloadOutlined,
    RobotOutlined,
    SaveOutlined,
    UndoOutlined,
    VerticalAlignBottomOutlined,
} from '@ant-design/icons';
import { useStore } from '../../store';
import { translate, type I18nKey } from '../../i18n';

export type DataGridToolbarProps = {
    onReload?: () => void;
    onReloadClick: () => void;
    loading: boolean;
    onToggleFilter?: () => void;
    showFilter?: boolean;
    filterConditionsLength: number;
    addFilter: () => void;
    canModifyData: boolean;
    handleAddRow: () => void;
    selectedRowCount: number;
    handleCopySelectedRowsForPaste: () => void;
    copiedRowsForPasteCount: number;
    handlePasteCopiedRowsAsNew: () => void;
    handleDeleteSelected: () => void;
    cellEditMode: boolean;
    toggleCellEditMode: () => void;
    selectedCellsCount: number;
    cellEditPasteTargetRowCount: number;
    handleCopySelectedCellsToClipboard: () => void;
    handleCopySelectedColumnsFromRow: () => void;
    openBatchFillModal: () => void;
    hasCopiedCellPatch: boolean;
    copiedCellPatchColumnCount: number;
    handlePasteCopiedColumnsToSelectedRows: () => void;
    hasChanges: boolean;
    commitLoading: boolean;
    handleCommit: () => void;
    changeCount: number;
    changeSummaryText?: string;
    pendingChangesLabel: string;
    riskLevel?: 'low' | 'medium' | 'high';
    onRollback: () => void;
    canImport: boolean;
    canExport: boolean;
    handleImport: () => void;
    exportMenu: MenuProps['items'];
    getAiSampleData: () => DataGridJsonValue[];
    getStoreState: () => { aiPanelVisible: boolean; setAIPanelVisible: (visible: boolean) => void };
    prefersManualTotalCount: boolean;
    totalCountLoading?: boolean;
    onRequestTotalCount?: () => void;
    onCancelTotalCount?: () => void;
    panelPaddingY: number;
    panelPaddingX: number;
    toolbarBottomPadding: number;
    toolbarDividerColor: string;
};

type ToolbarMode = 'counting' | 'changed' | 'cell-edit' | 'table';

type ToolbarAction = {
    key: string;
    node: React.ReactNode;
};

const createDivider = (key: string, color: string) => (
    <div key={key} className="data-grid-toolbar-divider" style={{ background: color }} />
);

export const DataGridToolbar: React.FC<DataGridToolbarProps> = (props) => {
    const language = useStore(state => state.language);
    const t = useMemo(() => (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);

    const toolbarMode: ToolbarMode = props.totalCountLoading
        ? 'counting'
        : props.hasChanges
            ? 'changed'
            : props.cellEditMode
                ? 'cell-edit'
                : 'table';

    const hasSelectedRows = props.selectedRowCount > 0;
    const hasCopiedRows = props.copiedRowsForPasteCount > 0;
    const hasSelectedCells = props.selectedCellsCount > 0;
    const canPasteCopiedColumns = props.hasCopiedCellPatch && props.cellEditPasteTargetRowCount > 0;

    const runAiInsight = () => {
        const sampleData = props.getAiSampleData();
        const prompt = t('dataGrid.toolbar.aiInsightPrompt', {
            count: sampleData.length,
            json: JSON.stringify(sampleData, null, 2),
        });
        const store = props.getStoreState();
        const wasClosed = !store.aiPanelVisible;
        if (wasClosed) store.setAIPanelVisible(true);
        // 如果面板刚打开，需要等待组件挂载完成后再注入 prompt
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('javanavi:ai:inject-prompt', { detail: { prompt } }));
        }, wasClosed ? 350 : 0);
    };

    const primaryActions: ToolbarAction[] = [];

    if (props.onReload) {
        primaryActions.push({
            key: 'reload',
            node: <Button className="data-grid-toolbar-button" icon={<ReloadOutlined />} disabled={props.loading} onClick={props.onReloadClick}>{t('dataGrid.toolbar.reload')}</Button>,
        });
    }

    if (props.onToggleFilter) {
        primaryActions.push({
            key: 'filter',
            node: (
                <Button
                    className="data-grid-toolbar-button"
                    icon={<FilterOutlined />}
                    type={props.showFilter ? 'primary' : 'default'}
                    onClick={() => {
                        props.onToggleFilter?.();
                        if (props.filterConditionsLength === 0 && !props.showFilter) props.addFilter();
                    }}
                >
                    {t('dataGrid.toolbar.filter')}
                </Button>
            ),
        });
    }

    if (toolbarMode === 'counting') {
        primaryActions.push({
            key: 'cancel-count',
            node: (
                <Tooltip title={t('dataGrid.toolbar.cancelCountTooltip')}>
                    <Button
                        className="data-grid-toolbar-button data-grid-toolbar-button-strong"
                        icon={<CloseOutlined />}
                        onClick={() => props.onCancelTotalCount?.()}
                    >
                        {t('dataGrid.toolbar.cancelCount')}
                    </Button>
                </Tooltip>
            ),
        });
    }

    if (toolbarMode === 'changed') {
        primaryActions.push({
            key: 'commit',
            node: <Button className="data-grid-toolbar-button data-grid-toolbar-button-strong" icon={<SaveOutlined />} type="primary" disabled={!props.hasChanges || props.commitLoading} loading={props.commitLoading} onClick={props.handleCommit}>{t('dataGrid.toolbar.commit', { count: props.changeCount })}</Button>,
        });
        primaryActions.push({
            key: 'rollback',
            node: <Button className="data-grid-toolbar-button data-grid-toolbar-button-danger-soft" icon={<UndoOutlined />} onClick={props.onRollback}>{t('dataGrid.toolbar.rollback')}</Button>,
        });
    }

    if (toolbarMode === 'cell-edit') {
        if (canPasteCopiedColumns) {
            primaryActions.push({
                key: 'paste-cell-patch',
                node: (
                    <Button
                        className="data-grid-toolbar-button data-grid-toolbar-button-strong"
                        icon={<VerticalAlignBottomOutlined />}
                        onClick={props.handlePasteCopiedColumnsToSelectedRows}
                    >
                        {t('dataGrid.toolbar.pasteToSelectedRows', { count: props.cellEditPasteTargetRowCount })}
                    </Button>
                ),
            });
        } else if (hasSelectedCells) {
            primaryActions.push({
                key: 'copy-cells',
                node: <Button className="data-grid-toolbar-button" icon={<CopyOutlined />} onClick={props.handleCopySelectedCellsToClipboard}>{t('dataGrid.toolbar.copySelection', { count: props.selectedCellsCount })}</Button>,
            });
            primaryActions.push({
                key: 'copy-column-values',
                node: <Button className="data-grid-toolbar-button" icon={<CopyOutlined />} onClick={props.handleCopySelectedColumnsFromRow}>{t('dataGrid.toolbar.copySelectionColumns', { count: props.selectedCellsCount })}</Button>,
            });
            primaryActions.push({
                key: 'batch-fill',
                node: <Button className="data-grid-toolbar-button" type="primary" onClick={props.openBatchFillModal}>{t('dataGrid.toolbar.batchFill', { count: props.selectedCellsCount })}</Button>,
            });
        }

        primaryActions.push({
            key: 'commit',
            node: <Button className="data-grid-toolbar-button data-grid-toolbar-button-strong" icon={<SaveOutlined />} type="primary" disabled={!props.hasChanges || props.commitLoading} loading={props.commitLoading} onClick={props.handleCommit}>{t('dataGrid.toolbar.commit', { count: props.changeCount })}</Button>,
        });
    }

    if (toolbarMode === 'table' && props.canModifyData) {
        if (hasSelectedRows) {
            primaryActions.push({
                key: 'copy-rows',
                node: <Button className="data-grid-toolbar-button" data-grid-copy-row-action="true" icon={<CopyOutlined />} onClick={props.handleCopySelectedRowsForPaste}>{t('dataGrid.toolbar.copyRows')}</Button>,
            });
        }

        if (hasCopiedRows) {
            primaryActions.push({
                key: 'paste-rows',
                node: <Button className="data-grid-toolbar-button data-grid-toolbar-button-strong" data-grid-paste-row-action="true" icon={<VerticalAlignBottomOutlined />} onClick={props.handlePasteCopiedRowsAsNew}>{t('dataGrid.toolbar.pasteRows')}</Button>,
            });
        }

        if (hasSelectedRows) {
            primaryActions.push({
                key: 'delete-selected',
                node: <Button className="data-grid-toolbar-button data-grid-toolbar-button-danger-soft" icon={<DeleteOutlined />} danger onClick={props.handleDeleteSelected}>{t('dataGrid.toolbar.deleteSelected')}</Button>,
            });
        }

        primaryActions.push({
            key: 'cell-editor',
            node: <Button className="data-grid-toolbar-button" icon={<EditOutlined />} type={props.cellEditMode ? 'primary' : 'default'} onClick={props.toggleCellEditMode}>{t('dataGrid.toolbar.cellEditor')}</Button>,
        });
    }

    const moreContent = (
        <div className="data-grid-toolbar-more-panel">
            {props.canModifyData && (
                <Button type="text" block className="data-grid-toolbar-menu-button" icon={<PlusOutlined />} onClick={props.handleAddRow}>{t('dataGrid.toolbar.addRow')}</Button>
            )}
            {props.cellEditMode && props.canModifyData && (
                <Button type="text" block className="data-grid-toolbar-menu-button" icon={<EditOutlined />} onClick={props.toggleCellEditMode}>{t('dataGrid.toolbar.exitCellEditor')}</Button>
            )}
            {props.canImport && (
                <Button type="text" block className="data-grid-toolbar-menu-button" icon={<ImportOutlined />} onClick={props.handleImport}>{t('dataGrid.toolbar.import')}</Button>
            )}
            {props.canExport && (
                <Dropdown menu={{ items: props.exportMenu }} trigger={['click']} placement="bottomRight">
                    <Button type="text" block className="data-grid-toolbar-menu-button" icon={<ExportOutlined />}>
                        <span>{t('dataGrid.toolbar.export')}</span>
                        <DownOutlined className="data-grid-toolbar-menu-caret" />
                    </Button>
                </Dropdown>
            )}
            <Button type="text" block className="data-grid-toolbar-menu-button data-grid-toolbar-menu-ai" icon={<RobotOutlined />} onClick={runAiInsight}>{t('dataGrid.toolbar.aiInsight')}</Button>
            {props.prefersManualTotalCount && props.onRequestTotalCount && (
                <Button
                    type="text"
                    block
                    className="data-grid-toolbar-menu-button"
                    icon={<VerticalAlignBottomOutlined />}
                    disabled={!!props.totalCountLoading}
                    onClick={props.onRequestTotalCount}
                >
                    {t('dataGrid.toolbar.countTotal')}
                </Button>
            )}
        </div>
    );

    const showChangeSummary = toolbarMode === 'changed' && props.hasChanges;
    const showSelectedRowsSummary = toolbarMode === 'table' && hasSelectedRows;
    const showCopiedColumnSummary = toolbarMode === 'cell-edit' && props.hasCopiedCellPatch && !canPasteCopiedColumns;
    const statusText = showChangeSummary
        ? `${props.pendingChangesLabel}${props.changeSummaryText || t('dataGrid.toolbar.changeCount', { count: props.changeCount })}`
        : showSelectedRowsSummary
            ? t('dataGrid.toolbar.selectedCount', { count: props.selectedRowCount })
            : showCopiedColumnSummary
                ? t('dataGrid.toolbar.copiedColumns', { count: props.copiedCellPatchColumnCount })
                : '';

    return (
        <div
            className="data-grid-toolbar-scroll"
            data-grid-primary-actions="true"
            data-grid-toolbar-mode={toolbarMode}
            style={{
                padding: props.showFilter ? `${props.panelPaddingY}px ${props.panelPaddingX}px ${props.toolbarBottomPadding}px ${props.panelPaddingX}px` : `${props.panelPaddingY}px ${props.panelPaddingX}px`,
            }}
        >
            <div className="data-grid-toolbar-main">
                {primaryActions.map((action, index) => (
                    <React.Fragment key={action.key}>
                        {index > 0 && createDivider(`${action.key}-divider`, props.toolbarDividerColor)}
                        {action.node}
                    </React.Fragment>
                ))}
            </div>

            {statusText && (
                <span className={props.riskLevel === 'high' && showChangeSummary ? 'data-grid-toolbar-status data-grid-toolbar-status-danger' : 'data-grid-toolbar-status'} title={statusText}>
                    {statusText}
                </span>
            )}

            <Popover content={moreContent} trigger="click" placement="bottomRight">
                <Button className="data-grid-toolbar-button data-grid-toolbar-more-button" icon={<MoreOutlined />}>
                    {t('dataGrid.toolbar.more')} <DownOutlined />
                </Button>
            </Popover>
        </div>
    );
};
