import React from 'react';
import { Button, Input, Pagination, Popover, Select, Segmented, Tooltip } from 'antd';
import { EditOutlined, FileTextOutlined, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { resolvePaginationTotalForControl } from '../../utils/dataGridPagination';
import type { DataGridFindNavigationDirection, DataGridFindSummary } from '../../utils/dataGridFind';

export type DataGridViewMode = 'table' | 'json' | 'text';

export type DataGridPaginationState = {
    current: number;
    pageSize: number;
    total: number;
    totalKnown?: boolean;
    totalApprox?: boolean;
    approximateTotal?: number;
    totalCountLoading?: boolean;
    totalCountCancelled?: boolean;
};

export type DataGridFooterControlsProps = {
    darkMode: boolean;
    canViewDdl: boolean;
    ddlLoading: boolean;
    dataPanelOpen: boolean;
    viewMode: DataGridViewMode;
    columnInfoSettingContent: React.ReactNode;
    normalizedPageFindText: string;
    pageFindText: string;
    pageFindMatchesLength: number;
    activePageFindPosition: number;
    pageFindSummary: DataGridFindSummary;
    noAutoCapInputProps: Record<string, any>;
    pagination?: DataGridPaginationState;
    paginationSummaryText: string;
    paginationPageText: string;
    paginationPageSizeOptions: string[];
    supportsApproximateTotalPages: boolean;
    onToggleDataPanel: () => void;
    onOpenTableDdl: () => void;
    onPageFindTextChange: (value: string) => void;
    onNavigatePageFind: (direction: DataGridFindNavigationDirection) => void;
    onViewModeChange: (mode: DataGridViewMode) => void;
    onPageChange?: (page: number, size: number) => void;
    onPageSizeChange: (value: string) => void;
};

export const DataGridFooterControls: React.FC<DataGridFooterControlsProps> = (props) => (
    <>
        <div
            data-grid-secondary-actions="true"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                padding: '4px 0 0',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Button
                    icon={<EditOutlined />}
                    type={props.dataPanelOpen ? 'primary' : 'default'}
                    disabled={props.viewMode !== 'table'}
                    onClick={props.onToggleDataPanel}
                >
                    数据预览
                </Button>
                <Popover
                    trigger="click"
                    placement="bottomRight"
                    content={props.columnInfoSettingContent}
                >
                    <Button icon={<FileTextOutlined />}>字段信息</Button>
                </Popover>
                {props.canViewDdl && (
                    <Button
                        data-grid-ddl-action="true"
                        icon={<FileTextOutlined />}
                        loading={props.ddlLoading}
                        onClick={props.onOpenTableDdl}
                    >
                        查看 DDL
                    </Button>
                )}
                <Tooltip title="仅查找当前页已加载数据，不改变 WHERE 条件">
                    <div data-grid-page-find="true" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Input
                            {...props.noAutoCapInputProps}
                            allowClear
                            size="small"
                            prefix={<SearchOutlined />}
                            placeholder="当前页查找..."
                            value={props.pageFindText}
                            onChange={(event) => props.onPageFindTextChange(event.target.value)}
                            style={{ width: 220 }}
                        />
                        <Button
                            data-grid-page-find-prev="true"
                            size="small"
                            icon={<LeftOutlined />}
                            disabled={props.pageFindMatchesLength === 0}
                            onClick={() => props.onNavigatePageFind('previous')}
                        >
                            上一个
                        </Button>
                        <Button
                            data-grid-page-find-next="true"
                            size="small"
                            icon={<RightOutlined />}
                            disabled={props.pageFindMatchesLength === 0}
                            onClick={() => props.onNavigatePageFind('next')}
                        >
                            下一个
                        </Button>
                        {props.normalizedPageFindText && (
                            <span aria-live="polite" style={{ fontSize: 12, color: props.darkMode ? '#999' : '#666', whiteSpace: 'nowrap' }}>
                                {props.pageFindMatchesLength > 0 ? `${props.activePageFindPosition} / ${props.pageFindMatchesLength} · ` : ''}匹配 {props.pageFindSummary.occurrenceCount} 处 / {props.pageFindSummary.matchedCellCount} 个单元格
                            </span>
                        )}
                    </div>
                </Tooltip>
            </div>
            <div data-grid-view-switcher="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: props.darkMode ? '#999' : '#666' }}>结果视图</span>
                <Segmented
                    size="small"
                    value={props.viewMode}
                    options={[
                        { label: '表格', value: 'table' },
                        { label: 'JSON', value: 'json' },
                        { label: '文本', value: 'text' }
                    ]}
                    onChange={(val) => props.onViewModeChange(String(val) as DataGridViewMode)}
                />
            </div>
        </div>

        {props.pagination && (
            <div className="data-grid-pagination-wrap" style={{ padding: '12px 0 0', borderTop: 'none', display: 'flex', justifyContent: 'flex-end' }}>
                <div className="data-grid-pagination-shell">
                    <div className="data-grid-pagination-summary" aria-live="polite">
                        <span className="data-grid-pagination-kicker">结果集</span>
                        <span className="data-grid-pagination-summary-value">{props.paginationSummaryText}</span>
                    </div>
                    <div className="data-grid-pagination-page-chip">{props.paginationPageText}</div>
                    <Pagination
                        current={props.pagination.current}
                        pageSize={props.pagination.pageSize}
                        total={resolvePaginationTotalForControl({
                            pagination: props.pagination,
                            supportsApproximateTotalPages: props.supportsApproximateTotalPages,
                        })}
                        showSizeChanger={false}
                        onChange={props.onPageChange}
                        showTitle={false}
                        size="small"
                        itemRender={(_page, type, originalElement) => {
                            if (type === 'prev') {
                                return <span className="data-grid-pagination-nav-icon" aria-hidden="true"><LeftOutlined /></span>;
                            }
                            if (type === 'next') {
                                return <span className="data-grid-pagination-nav-icon" aria-hidden="true"><RightOutlined /></span>;
                            }
                            return originalElement;
                        }}
                    />
                    <Select
                        size="small"
                        popupMatchSelectWidth={false}
                        value={String(props.pagination.pageSize)}
                        onChange={props.onPageSizeChange}
                        options={props.paginationPageSizeOptions.map((value) => ({ value, label: `${value} 条 / 页` }))}
                        className="data-grid-pagination-size-select"
                        aria-label="每页条数"
                    />
                </div>
            </div>
        )}
    </>
);
