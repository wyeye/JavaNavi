import React, { useMemo } from 'react';
import { Button, Input, Pagination, Popover, Select, Segmented, Tooltip } from 'antd';
import type { InputProps } from 'antd';
import { EditOutlined, FileTextOutlined, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { resolvePaginationTotalForControl } from '../../utils/dataGridPagination';
import type { DataGridFindNavigationDirection, DataGridFindSummary } from '../../utils/dataGridFind';
import { useStore } from '../../store';
import { translate, type I18nKey } from '../../i18n';

export type DataGridViewMode = 'table' | 'json' | 'text';

type NoAutoCapInputProps = Pick<InputProps, 'autoCorrect' | 'spellCheck'>;

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
    noAutoCapInputProps: NoAutoCapInputProps;
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

export const DataGridFooterControls: React.FC<DataGridFooterControlsProps> = (props) => {
    const language = useStore(state => state.language);
    const t = useMemo(() => (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
    const findPositionPrefix = props.pageFindMatchesLength > 0
        ? t('dataGrid.footer.findPositionPrefix', { position: props.activePageFindPosition, total: props.pageFindMatchesLength })
        : '';
    return (
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
                    {t('dataGrid.footer.dataPreview')}
                </Button>
                <Popover
                    trigger="click"
                    placement="bottomRight"
                    content={props.columnInfoSettingContent}
                >
                    <Button icon={<FileTextOutlined />}>{t('dataGrid.footer.columnInfo')}</Button>
                </Popover>
                {props.canViewDdl && (
                    <Button
                        data-grid-ddl-action="true"
                        icon={<FileTextOutlined />}
                        loading={props.ddlLoading}
                        onClick={props.onOpenTableDdl}
                    >
                        {t('dataGrid.footer.viewDdl')}
                    </Button>
                )}
                <Tooltip title={t('dataGrid.footer.findTooltip')}>
                    <div data-grid-page-find="true" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Input
                            {...props.noAutoCapInputProps}
                            allowClear
                            size="small"
                            prefix={<SearchOutlined />}
                            placeholder={t('dataGrid.footer.findPlaceholder')}
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
                            {t('dataGrid.footer.previous')}
                        </Button>
                        <Button
                            data-grid-page-find-next="true"
                            size="small"
                            icon={<RightOutlined />}
                            disabled={props.pageFindMatchesLength === 0}
                            onClick={() => props.onNavigatePageFind('next')}
                        >
                            {t('dataGrid.footer.next')}
                        </Button>
                        {props.normalizedPageFindText && (
                            <span aria-live="polite" style={{ fontSize: 12, color: props.darkMode ? '#999' : '#666', whiteSpace: 'nowrap' }}>
                                {t('dataGrid.footer.findSummary', {
                                    positionPrefix: findPositionPrefix,
                                    occurrenceCount: props.pageFindSummary.occurrenceCount,
                                    cellCount: props.pageFindSummary.matchedCellCount,
                                })}
                            </span>
                        )}
                    </div>
                </Tooltip>
            </div>
            <div data-grid-view-switcher="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: props.darkMode ? '#999' : '#666' }}>{t('dataGrid.footer.resultView')}</span>
                <Segmented
                    size="small"
                    value={props.viewMode}
                    options={[
                        { label: t('dataGrid.footer.viewTable'), value: 'table' },
                        { label: 'JSON', value: 'json' },
                        { label: t('dataGrid.footer.viewText'), value: 'text' }
                    ]}
                    onChange={(val) => props.onViewModeChange(String(val) as DataGridViewMode)}
                />
            </div>
        </div>

        {props.pagination && (
            <div className="data-grid-pagination-wrap" style={{ padding: '12px 0 0', borderTop: 'none', display: 'flex', justifyContent: 'flex-end' }}>
                <div className="data-grid-pagination-shell">
                    <div className="data-grid-pagination-summary" aria-live="polite">
                        <span className="data-grid-pagination-kicker">{t('dataGrid.footer.resultSet')}</span>
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
                        options={props.paginationPageSizeOptions.map((value) => ({ value, label: t('dataGrid.pagination.pageSize', { value }) }))}
                        className="data-grid-pagination-size-select"
                        aria-label={t('dataGrid.pagination.ariaPageSize')}
                    />
                </div>
            </div>
        )}
    </>
    );
};
