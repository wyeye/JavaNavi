import React from 'react';
import { AutoComplete, Button, Checkbox, Input, Select } from 'antd';
import type { AutoCompleteProps, InputProps, SelectProps } from 'antd';
import { ClearOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import type { GridFilterCondition, GridSortInfo } from './dataGridFilterTypes';

type QuickWhereSuggestionOption = {
    value: string;
    insertText?: string;
    suggestionKind?: string;
    label?: React.ReactNode;
};

type FilterSelectOption = NonNullable<SelectProps<string>['options']>[number];

type NoAutoCapInputProps = Pick<InputProps, 'autoCorrect' | 'spellCheck'>;

export type DataGridFilterPanelProps = {
    showFilter?: boolean;
    filterPanelRef: React.RefObject<HTMLDivElement>;
    filterTopPadding: number;
    panelPaddingX: number;
    panelPaddingY: number;
    panelRadius: number;
    panelFrameColor: string;
    darkMode: boolean;
    selectionAccentHex: string;
    quickWhereDraft: string;
    quickWhereSuggestionOptions: QuickWhereSuggestionOption[];
    setQuickWhereDraft: (value: string) => void;
    resolveWhereConditionSelectedValue: (input: { selectedValue: string; currentInput: string; insertText?: string }) => string;
    noAutoCapInputProps: NoAutoCapInputProps;
    dbType: string;
    applyQuickWhereCondition: (condition?: string) => boolean;
    clearQuickWhereCondition: () => void;
    quickWhereCondition?: string;
    filterConditions: GridFilterCondition[];
    updateFilter: (id: number, field: keyof GridFilterCondition, val: string | boolean) => void;
    filterLogicOptions: FilterSelectOption[];
    displayColumnNames: string[];
    filterOpOptions: FilterSelectOption[];
    isListOp: (op: string) => boolean;
    isBetweenOp: (op: string) => boolean;
    isNoValueOp: (op: string) => boolean;
    removeFilter: (id: number) => void;
    onSort?: (field: string, order: string) => void;
    sortInfo: GridSortInfo[];
    addFilter: () => void;
    setFilterConditions: React.Dispatch<React.SetStateAction<GridFilterCondition[]>>;
    onApplyFilter?: (conditions: GridFilterCondition[]) => void;
    applyFilters: () => void;
};

export const DataGridFilterPanel: React.FC<DataGridFilterPanelProps> = (props) => {
    if (!props.showFilter) return null;

    const quickWhereSelectHandler: NonNullable<AutoCompleteProps<string, QuickWhereSuggestionOption>['onSelect']> = (value, option) => {
        props.setQuickWhereDraft(props.resolveWhereConditionSelectedValue({
            selectedValue: value,
            currentInput: props.quickWhereDraft,
            insertText: option.insertText,
        }));
    };


    return (
           <div ref={props.filterPanelRef} style={{
               padding: `${props.filterTopPadding}px ${props.panelPaddingX}px ${props.panelPaddingY}px ${props.panelPaddingX}px`,
               background: 'transparent',
               boxSizing: 'border-box',
               display: 'flex',
               flexDirection: 'column',
           }}>
               <div
                   data-grid-quick-where="true"
                   style={{
                       display: 'flex',
                       alignItems: 'center',
                       gap: 10,
                       padding: '10px 12px',
                       marginBottom: 10,
                       borderRadius: Math.max(10, props.panelRadius - 2),
                       border: `1px solid ${props.panelFrameColor}`,
                       background: props.darkMode ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.72)',
                       boxSizing: 'border-box',
                       minWidth: 0,
                   }}
               >
                   <span
                       style={{
                           flex: '0 0 auto',
                           minWidth: 58,
                           height: 28,
                           display: 'inline-flex',
                           alignItems: 'center',
                           justifyContent: 'center',
                           borderRadius: 999,
                           background: props.darkMode ? 'rgba(24,144,255,0.18)' : 'rgba(24,144,255,0.10)',
                           border: `1px solid ${props.darkMode ? 'rgba(24,144,255,0.32)' : 'rgba(24,144,255,0.22)'}`,
                           color: props.selectionAccentHex,
                           fontSize: 12,
                           fontWeight: 700,
                           letterSpacing: '0.03em',
                       }}
                   >
                       WHERE
                   </span>
                   <AutoComplete
                       value={props.quickWhereDraft}
                       options={props.quickWhereSuggestionOptions}
                       onChange={props.setQuickWhereDraft}
                       onSelect={quickWhereSelectHandler}
                       style={{ flex: '1 1 320px', minWidth: 220 }}
                       popupMatchSelectWidth={420}
                   >
                       <Input
                           {...props.noAutoCapInputProps}
                           allowClear
                           placeholder={props.dbType === 'mongodb' ? '输入 MongoDB JSON 查询对象，例如 {"status":"A"}' : '输入 WHERE 后面的条件，例如 status = 1 AND name LIKE \'A%\''}
                           onPressEnter={(event) => {
                               if (!event.shiftKey) {
                                   event.preventDefault();
                                   props.applyQuickWhereCondition();
                               }
                           }}
                       />
                   </AutoComplete>
                   <Button size="small" type="primary" onClick={() => props.applyQuickWhereCondition()}>
                       应用 WHERE
                   </Button>
                   <Button size="small" onClick={props.clearQuickWhereCondition} disabled={!props.quickWhereDraft && !props.quickWhereCondition}>
                       清空
                   </Button>
               </div>
               {/* 筛选条件 + 排序区域：固定最大高度，超出后可滚动，避免条件过多挤压数据表 */}
               <div style={{ maxHeight: 200, overflowY: 'auto', overflowX: 'hidden', flex: '0 1 auto' }}>
               {props.filterConditions.map((cond, condIndex) => (
                   <div key={cond.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start', opacity: cond.enabled === false ? 0.58 : 1 }}>
                       <Checkbox
                           checked={cond.enabled !== false}
                           onChange={e => props.updateFilter(cond.id, 'enabled', e.target.checked)}
                            style={{ marginTop: 6, flex: '0 0 auto', whiteSpace: 'nowrap' }}
                       >
                           启用
                       </Checkbox>
                        <Select
                            style={{ width: 96, minWidth: 96, maxWidth: 96, flex: '0 0 96px' }}
                            value={condIndex === 0 ? '__FIRST__' : (cond.logic === 'OR' ? 'OR' : 'AND')}
                            onChange={v => props.updateFilter(cond.id, 'logic', v)}
                            options={condIndex === 0 ? [{ value: '__FIRST__', label: '首条' }] : props.filterLogicOptions}
                            disabled={condIndex === 0}
                        />
                        <Select
                            style={{ width: 180 }}
                            value={cond.column}
                            onChange={v => props.updateFilter(cond.id, 'column', v)}
                            options={props.displayColumnNames.map(c => ({ value: c, label: c }))}
                            showSearch
                            optionFilterProp="label"
                            filterOption={(input, option) =>
                                String(option?.label ?? '')
                                    .toLowerCase()
                                    .includes(String(input || '').trim().toLowerCase())
                            }
                            placeholder="搜索字段名"
                            disabled={cond.op === 'CUSTOM'}
                        />
                       <Select
                           style={{ width: 140 }}
                           value={cond.op}
                           onChange={v => props.updateFilter(cond.id, 'op', v)}
                           options={props.filterOpOptions}
                       />

                       {cond.op === 'CUSTOM' ? (
                           <Input.TextArea
                               {...props.noAutoCapInputProps}
                               style={{ flex: 1 }}
                               autoSize={{ minRows: 1, maxRows: 4 }}
                               value={cond.value}
                               onChange={e => props.updateFilter(cond.id, 'value', e.target.value)}
                               placeholder="输入自定义 WHERE 表达式（不需要再写 WHERE），例如：status IN ('A','B')"
                           />
                       ) : props.isListOp(cond.op) ? (
                           <Input.TextArea
                               {...props.noAutoCapInputProps}
                               style={{ flex: 1 }}
                               autoSize={{ minRows: 1, maxRows: 4 }}
                               value={cond.value}
                               onChange={e => props.updateFilter(cond.id, 'value', e.target.value)}
                               placeholder="多个值用逗号或换行分隔"
                           />
                       ) : props.isBetweenOp(cond.op) ? (
                           <>
                               <Input
                                   {...props.noAutoCapInputProps}
                                   style={{ width: 220 }}
                                   value={cond.value}
                                   onChange={e => props.updateFilter(cond.id, 'value', e.target.value)}
                                   placeholder="开始值"
                               />
                               <Input
                                   {...props.noAutoCapInputProps}
                                   style={{ width: 220 }}
                                   value={cond.value2 || ''}
                                   onChange={e => props.updateFilter(cond.id, 'value2', e.target.value)}
                                   placeholder="结束值"
                               />
                           </>
                       ) : props.isNoValueOp(cond.op) ? (
                           <Input {...props.noAutoCapInputProps} style={{ width: 220 }} value="" disabled placeholder="无需输入值" />
                       ) : (
                           <Input
                               {...props.noAutoCapInputProps}
                               style={{ width: 280 }}
                               value={cond.value}
                               onChange={e => props.updateFilter(cond.id, 'value', e.target.value)}
                           />
                       )}

                       <Button icon={<CloseOutlined />} onClick={() => props.removeFilter(cond.id)} type="text" danger />
                   </div>
               ))}
                {props.onSort && (
                    <div style={{ paddingTop: props.filterConditions.length > 0 ? 4 : 0, borderTop: props.filterConditions.length > 0 ? `1px dashed ${props.panelFrameColor}` : 'none' }}>
                        {props.sortInfo.map((s, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', opacity: s.enabled === false ? 0.58 : 1 }}>
                                <Checkbox
                                    checked={s.enabled !== false}
                                    onChange={e => {
                                        const next = [...props.sortInfo];
                                        next[idx] = { ...next[idx], enabled: e.target.checked };
                                        props.onSort?.(JSON.stringify(next), '');
                                    }}
                                    style={{ flex: '0 0 auto' }}
                                />
                                <span style={{ fontSize: 12, color: 'inherit', opacity: 0.7, whiteSpace: 'nowrap', minWidth: 32 }}>{idx === 0 ? '排序' : '然后'}</span>
                                <Select
                                    style={{ width: 180 }}
                                    value={s.columnKey || undefined}
                                    onChange={v => {
                                        const next = [...props.sortInfo];
                                        if (!v) { next.splice(idx, 1); } else { next[idx] = { ...next[idx], columnKey: v }; }
                                        const filtered = next.filter(si => si.columnKey);
                                        props.onSort?.(JSON.stringify(filtered), '');
                                    }}
                                    options={props.displayColumnNames
                                        .filter(c => c === s.columnKey || !props.sortInfo.some(si => si.columnKey === c))
                                        .map(c => ({ value: c, label: c }))}
                                    showSearch
                                    optionFilterProp="label"
                                    filterOption={(input, option) =>
                                        String(option?.label ?? '')
                                            .toLowerCase()
                                            .includes(String(input || '').trim().toLowerCase())
                                    }
                                    placeholder="选择排序字段"
                                    allowClear
                                    onClear={() => {
                                        const next = props.sortInfo.filter((_, i) => i !== idx);
                                        props.onSort?.(JSON.stringify(next), '');
                                    }}
                                />
                                <Select
                                    style={{ width: 110 }}
                                    value={s.order || 'ascend'}
                                    onChange={v => {
                                        const next = [...props.sortInfo];
                                        next[idx] = { ...next[idx], order: v };
                                        props.onSort?.(JSON.stringify(next), '');
                                    }}
                                    options={[
                                        { value: 'ascend', label: '升序 ↑' },
                                        { value: 'descend', label: '降序 ↓' },
                                    ]}
                                    disabled={!s.columnKey}
                                />
                                <Button icon={<CloseOutlined />} type="text" danger size="small" onClick={() => {
                                    const next = props.sortInfo.filter((_, i) => i !== idx);
                                    props.onSort?.(JSON.stringify(next), '');
                                }} />
                            </div>
                        ))}
                    </div>
                )}
               </div>
               <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: '0 0 auto', marginTop: (props.onSort && props.sortInfo.length > 0) || props.filterConditions.length > 0 ? 4 : 0, paddingTop: (props.onSort && props.sortInfo.length > 0) || props.filterConditions.length > 0 ? 6 : 0, borderTop: (props.onSort && props.sortInfo.length > 0) || props.filterConditions.length > 0 ? `1px dashed ${props.panelFrameColor}` : 'none' }}>
                   <Button type="primary" ghost onClick={props.addFilter} size="small" icon={<PlusOutlined />}>添加条件</Button>
                   {props.onSort && (
                       <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => {
                           const next = [...props.sortInfo, { columnKey: props.displayColumnNames.find(c => !props.sortInfo.some(s => s.columnKey === c)) || props.displayColumnNames[0] || '', order: 'ascend', enabled: true }];
                           props.onSort?.(JSON.stringify(next), '');
                       }} disabled={props.sortInfo.length >= props.displayColumnNames.length}>添加排序</Button>
                   )}
                   <div style={{ width: 1, height: 16, background: props.panelFrameColor, margin: '0 2px', flexShrink: 0 }} />
                   <Button size="small" onClick={() => props.setFilterConditions(prev => prev.map(c => ({ ...c, enabled: true })))}>全启用</Button>
                   <Button size="small" onClick={() => props.setFilterConditions(prev => prev.map(c => ({ ...c, enabled: false })))}>全停用</Button>
                   <div style={{ width: 1, height: 16, background: props.panelFrameColor, margin: '0 2px', flexShrink: 0 }} />
                   <Button type="primary" onClick={props.applyFilters} size="small">应用</Button>
                   <Button size="small" icon={<ClearOutlined />} onClick={() => {
                       props.setFilterConditions([]);
                       props.clearQuickWhereCondition();
                       if (props.onApplyFilter) props.onApplyFilter([]);
                       if (props.onSort) props.onSort?.('', '');
                   }}>清除</Button>
               </div>
           </div>
    );
};
