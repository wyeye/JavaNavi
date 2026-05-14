import React, { useMemo } from 'react';
import type { MenuProps } from 'antd';
import type { DataGridJsonValue } from './dataGridValue';
import { Button, Dropdown, Tooltip } from 'antd';
import {
    CloseOutlined,
    CopyOutlined,
    DeleteOutlined,
    DownOutlined,
    EditOutlined,
    ExportOutlined,
    FilterOutlined,
    ImportOutlined,
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
    darkMode: boolean;
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

export const DataGridToolbar: React.FC<DataGridToolbarProps> = (props) => {
    const language = useStore(state => state.language);
    const t = useMemo(() => (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
    return (
        <div className="data-grid-toolbar-scroll" data-grid-primary-actions="true" style={{ padding: props.showFilter ? `${props.panelPaddingY}px ${props.panelPaddingX}px ${props.toolbarBottomPadding}px ${props.panelPaddingX}px` : `${props.panelPaddingY}px ${props.panelPaddingX}px`, border: 'none', borderRadius: 0, background: 'transparent', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarGutter: 'stable', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box' }}>
	            {props.onReload && <Button icon={<ReloadOutlined />} disabled={props.loading} onClick={props.onReloadClick}>{t('dataGrid.toolbar.reload')}</Button>}

	           {props.onToggleFilter && (
	               <>
	                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
	                   <Button icon={<FilterOutlined />} type={props.showFilter ? 'primary' : 'default'} onClick={() => { 
	                       props.onToggleFilter?.(); 
	                       if (props.filterConditionsLength === 0 && !props.showFilter) props.addFilter(); 
	                   }}>{t('dataGrid.toolbar.filter')}</Button>
	               </>
	           )}
	           
	           {props.canModifyData && (
	               <>
	                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
	                   <Button icon={<PlusOutlined />} onClick={props.handleAddRow}>{t('dataGrid.toolbar.addRow')}</Button>
	                   <Button
	                       data-grid-copy-row-action="true"
	                       icon={<CopyOutlined />}
	                       disabled={props.selectedRowCount === 0}
	                       onClick={props.handleCopySelectedRowsForPaste}
	                   >
	                       {t('dataGrid.toolbar.copyRows')}
	                   </Button>
	                   <Button
	                       data-grid-paste-row-action="true"
	                       icon={<VerticalAlignBottomOutlined />}
	                       disabled={props.copiedRowsForPasteCount === 0}
	                       onClick={props.handlePasteCopiedRowsAsNew}
	                   >
	                       {props.copiedRowsForPasteCount > 0 ? t('dataGrid.toolbar.pasteRowsWithCount', { count: props.copiedRowsForPasteCount }) : t('dataGrid.toolbar.pasteRows')}
	                   </Button>
	                   <Button icon={<DeleteOutlined />} danger disabled={props.selectedRowCount === 0} onClick={props.handleDeleteSelected}>{t('dataGrid.toolbar.deleteSelected')}</Button>
	                   {props.selectedRowCount > 0 && <span style={{ fontSize: '12px', color: '#888' }}>{t('dataGrid.toolbar.selectedCount', { count: props.selectedRowCount })}</span>}
	                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
	                   <Button
                            icon={<EditOutlined />}
                            type={props.cellEditMode ? 'primary' : 'default'}
                            onClick={props.toggleCellEditMode}
                        >
                            {t('dataGrid.toolbar.cellEditor')}
                        </Button>
                       {props.cellEditMode && props.selectedCellsCount > 0 && (
                           <>
                               <Button
                                   icon={<CopyOutlined />}
                                   onClick={props.handleCopySelectedCellsToClipboard}
                               >
                                   {t('dataGrid.toolbar.copySelection', { count: props.selectedCellsCount })}
                               </Button>
                               <Button
                                   icon={<CopyOutlined />}
                                   onClick={props.handleCopySelectedColumnsFromRow}
                               >
                                   {t('dataGrid.toolbar.copySelectionColumns', { count: props.selectedCellsCount })}
                               </Button>
                                <Button
                                    type="primary"
                                    onClick={() => {
                                        props.openBatchFillModal();
                                   }}
                                >
                                    {t('dataGrid.toolbar.batchFill', { count: props.selectedCellsCount })}
                                </Button>
                            </>
                        )}
                       {props.cellEditMode && props.hasCopiedCellPatch && (
                           <>
                               <Button
                                   icon={<VerticalAlignBottomOutlined />}
                                   disabled={props.selectedRowCount === 0}
                                   onClick={() => props.handlePasteCopiedColumnsToSelectedRows()}
                               >
                                   {t('dataGrid.toolbar.pasteToSelectedRows', { count: props.selectedRowCount })}
                               </Button>
                               <span style={{ fontSize: '12px', color: '#888' }}>
                                   {t('dataGrid.toolbar.copiedColumns', { count: props.copiedCellPatchColumnCount })}
                               </span>
                           </>
                       )}
	                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
	                   <Button icon={<SaveOutlined />} type="primary" disabled={!props.hasChanges || props.commitLoading} loading={props.commitLoading} onClick={props.handleCommit}>{t('dataGrid.toolbar.commit', { count: props.changeCount })}</Button>
                       {props.hasChanges && (
                           <span style={{ fontSize: '12px', color: props.riskLevel === 'high' ? '#cf1322' : '#888' }}>
                               {props.pendingChangesLabel}{props.changeSummaryText || t('dataGrid.toolbar.changeCount', { count: props.changeCount })}
                           </span>
                       )}
	                   {props.hasChanges && (<Button icon={<UndoOutlined />} onClick={() => {
	                        props.onRollback();
                   }}>{t('dataGrid.toolbar.rollback')}</Button>)}
               </>
           )}

           {(props.canImport || props.canExport) && (
               <>
                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
                   {props.canImport && <Button icon={<ImportOutlined />} onClick={props.handleImport}>{t('dataGrid.toolbar.import')}</Button>}
                   {props.canExport && <Dropdown menu={{ items: props.exportMenu }}><Button icon={<ExportOutlined />}>{t('dataGrid.toolbar.export')} <DownOutlined /></Button></Dropdown>}
               </>
           )}

           <>
               <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
               <Tooltip title={t('dataGrid.toolbar.aiInsightTooltip')}>
                   <Button 
                       icon={<RobotOutlined />} 
                       style={{
                           background: props.darkMode ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))' : 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02))',
                           borderColor: props.darkMode ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.4)',
                           color: '#10b981',
                           fontWeight: 500,
                           boxShadow: props.darkMode ? '0 2px 8px rgba(16,185,129,0.1)' : '0 2px 6px rgba(16,185,129,0.05)',
                       }}
                       onMouseEnter={(e) => {
                           e.currentTarget.style.background = props.darkMode ? 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(16,185,129,0.1))' : 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))';
                           e.currentTarget.style.borderColor = '#10b981';
                       }}
                       onMouseLeave={(e) => {
                           e.currentTarget.style.background = props.darkMode ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))' : 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02))';
                           e.currentTarget.style.borderColor = props.darkMode ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.4)';
                       }}
                       onClick={() => {
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
                       }}
                   >
                       {t('dataGrid.toolbar.aiInsight')}
                   </Button>
               </Tooltip>
           </>

           {props.prefersManualTotalCount && props.onRequestTotalCount && (
               <>
                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
                   <Tooltip title={props.totalCountLoading ? t('dataGrid.toolbar.cancelCountTooltip') : t('dataGrid.toolbar.countTotalTooltip')}>
                       <Button
                           icon={props.totalCountLoading ? <CloseOutlined /> : <VerticalAlignBottomOutlined />}
                           onClick={() => {
                               if (props.totalCountLoading) {
                                   if (props.onCancelTotalCount) props.onCancelTotalCount();
                                   return;
                               }
                               props.onRequestTotalCount?.();
                           }}
                       >
                           {props.totalCountLoading ? t('dataGrid.toolbar.cancelCount') : t('dataGrid.toolbar.countTotal')}
                       </Button>
                   </Tooltip>
               </>
           )}

           <div style={{ marginLeft: 'auto' }} />
	          </div>
    );
};
