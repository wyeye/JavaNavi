import React from 'react';
import type { MenuProps } from 'antd';
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
    onRollback: () => void;
    canImport: boolean;
    canExport: boolean;
    handleImport: () => void;
    exportMenu: MenuProps['items'];
    darkMode: boolean;
    getAiSampleData: () => any[];
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

export const DataGridToolbar: React.FC<DataGridToolbarProps> = (props) => (
        <div className="data-grid-toolbar-scroll" data-grid-primary-actions="true" style={{ padding: props.showFilter ? `${props.panelPaddingY}px ${props.panelPaddingX}px ${props.toolbarBottomPadding}px ${props.panelPaddingX}px` : `${props.panelPaddingY}px ${props.panelPaddingX}px`, border: 'none', borderRadius: 0, background: 'transparent', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarGutter: 'stable', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box' }}>
	            {props.onReload && <Button icon={<ReloadOutlined />} disabled={props.loading} onClick={props.onReloadClick}>刷新</Button>}

	           {props.onToggleFilter && (
	               <>
	                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
	                   <Button icon={<FilterOutlined />} type={props.showFilter ? 'primary' : 'default'} onClick={() => { 
	                       props.onToggleFilter?.(); 
	                       if (props.filterConditionsLength === 0 && !props.showFilter) props.addFilter(); 
	                   }}>筛选</Button>
	               </>
	           )}
	           
	           {props.canModifyData && (
	               <>
	                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
	                   <Button icon={<PlusOutlined />} onClick={props.handleAddRow}>添加行</Button>
	                   <Button
	                       data-grid-copy-row-action="true"
	                       icon={<CopyOutlined />}
	                       disabled={props.selectedRowCount === 0}
	                       onClick={props.handleCopySelectedRowsForPaste}
	                   >
	                       复制行
	                   </Button>
	                   <Button
	                       data-grid-paste-row-action="true"
	                       icon={<VerticalAlignBottomOutlined />}
	                       disabled={props.copiedRowsForPasteCount === 0}
	                       onClick={props.handlePasteCopiedRowsAsNew}
	                   >
	                       {props.copiedRowsForPasteCount > 0 ? `粘贴行 (${props.copiedRowsForPasteCount})` : '粘贴行'}
	                   </Button>
	                   <Button icon={<DeleteOutlined />} danger disabled={props.selectedRowCount === 0} onClick={props.handleDeleteSelected}>删除选中</Button>
	                   {props.selectedRowCount > 0 && <span style={{ fontSize: '12px', color: '#888' }}>已选 {props.selectedRowCount}</span>}
	                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
	                   <Button
                            icon={<EditOutlined />}
                            type={props.cellEditMode ? 'primary' : 'default'}
                            onClick={props.toggleCellEditMode}
                        >
                            单元格编辑器
                        </Button>
                       {props.cellEditMode && props.selectedCellsCount > 0 && (
                           <>
                               <Button
                                   icon={<CopyOutlined />}
                                   onClick={props.handleCopySelectedCellsToClipboard}
                               >
                                   复制选区 ({props.selectedCellsCount})
                               </Button>
                               <Button
                                   icon={<CopyOutlined />}
                                   onClick={props.handleCopySelectedColumnsFromRow}
                               >
                                   复制选区列值 ({props.selectedCellsCount})
                               </Button>
                                <Button
                                    type="primary"
                                    onClick={() => {
                                        props.openBatchFillModal();
                                   }}
                                >
                                    批量填充 ({props.selectedCellsCount})
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
                                   粘贴到选中行 ({props.selectedRowCount})
                               </Button>
                               <span style={{ fontSize: '12px', color: '#888' }}>
                                   已复制 {props.copiedCellPatchColumnCount} 列
                               </span>
                           </>
                       )}
	                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
	                   <Button icon={<SaveOutlined />} type="primary" disabled={!props.hasChanges || props.commitLoading} loading={props.commitLoading} onClick={props.handleCommit}>提交事务 ({props.changeCount})</Button>
	                   {props.hasChanges && (<Button icon={<UndoOutlined />} onClick={() => {
	                        props.onRollback();
                   }}>回滚</Button>)}
               </>
           )}

           {(props.canImport || props.canExport) && (
               <>
                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
                   {props.canImport && <Button icon={<ImportOutlined />} onClick={props.handleImport}>导入</Button>}
                   {props.canExport && <Dropdown menu={{ items: props.exportMenu }}><Button icon={<ExportOutlined />}>导出 <DownOutlined /></Button></Dropdown>}
               </>
           )}

           <>
               <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
               <Tooltip title="一键借助 AI 智能分析当前查询页数据">
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
                           const prompt = `请帮我分析以下查询结果数据（取前 ${sampleData.length} 条示例）：\n\`\`\`json\n${JSON.stringify(sampleData, null, 2)}\n\`\`\`\n\n请分析数据特征、发现规律，或者给出一些业务上的洞察。`;
                           const store = props.getStoreState();
                           const wasClosed = !store.aiPanelVisible;
                           if (wasClosed) store.setAIPanelVisible(true);
                           // 如果面板刚打开，需要等待组件挂载完成后再注入 prompt
                           setTimeout(() => {
                               window.dispatchEvent(new CustomEvent('javanavi:ai:inject-prompt', { detail: { prompt } }));
                           }, wasClosed ? 350 : 0);
                       }}
                   >
                       AI 数据洞察
                   </Button>
               </Tooltip>
           </>

           {props.prefersManualTotalCount && props.onRequestTotalCount && (
               <>
                   <div style={{ width: 1, background: props.toolbarDividerColor, height: 20, margin: '0 8px' }} />
                   <Tooltip title={props.totalCountLoading ? '取消本次精确总数统计（不会影响当前浏览）' : '按当前筛选统计精确总数'}>
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
                           {props.totalCountLoading ? '取消统计' : '统计总数'}
                       </Button>
                   </Tooltip>
               </>
           )}

           <div style={{ marginLeft: 'auto' }} />
	          </div>
);
