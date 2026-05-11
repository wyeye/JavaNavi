import React from 'react';
import type { FilterCondition } from '../../utils/sql';
import { resolveWhereConditionSuggestions } from '../../utils/dataGridWhereFilter';
import type { GridFilterCondition } from './dataGridFilterTypes';

export const filterOpOptions = [
    { value: '=', label: '=' },
    { value: '!=', label: '!=' },
    { value: '<', label: '<' },
    { value: '<=', label: '<=' },
    { value: '>', label: '>' },
    { value: '>=', label: '>=' },
    { value: 'CONTAINS', label: '包含' },
    { value: 'NOT_CONTAINS', label: '不包含' },
    { value: 'STARTS_WITH', label: '开始以' },
    { value: 'NOT_STARTS_WITH', label: '不是开始于' },
    { value: 'ENDS_WITH', label: '结束以' },
    { value: 'NOT_ENDS_WITH', label: '不是结束于' },
    { value: 'IS_NULL', label: '是 null' },
    { value: 'IS_NOT_NULL', label: '不是 null' },
    { value: 'IS_EMPTY', label: '是空的' },
    { value: 'IS_NOT_EMPTY', label: '不是空的' },
    { value: 'BETWEEN', label: '介于' },
    { value: 'NOT_BETWEEN', label: '不介于' },
    { value: 'IN', label: '在列表' },
    { value: 'NOT_IN', label: '不在列表' },
    { value: 'CUSTOM', label: '[自定义]' },
];

export const filterLogicOptions = [
    { value: 'AND', label: '且 (AND)' },
    { value: 'OR', label: '或 (OR)' },
];

export const normalizeFilterLogic = (logic: unknown): 'AND' | 'OR' => {
    return String(logic || '').trim().toUpperCase() === 'OR' ? 'OR' : 'AND';
};

export const normalizeGridFilterConditions = ({
    conditions,
    firstColumnName,
}: {
    conditions?: FilterCondition[];
    firstColumnName: string;
}): GridFilterCondition[] => {
    if (!Array.isArray(conditions)) return [];
    return conditions.map((cond, index) => {
        const fallbackId = index + 1;
        const nextId = Number.isFinite(Number(cond?.id)) ? Number(cond?.id) : fallbackId;
        const op = String(cond?.op || '=');
        const rawColumn = String(cond?.column || '');
        return {
            id: nextId,
            enabled: cond?.enabled !== false,
            logic: normalizeFilterLogic(cond?.logic),
            column: rawColumn || (op === 'CUSTOM' ? '' : String(firstColumnName || '')),
            op,
            value: String(cond?.value ?? ''),
            value2: String(cond?.value2 ?? ''),
        };
    });
};

export const isNoValueOp = (op: string): boolean => (
    op === 'IS_NULL' || op === 'IS_NOT_NULL' || op === 'IS_EMPTY' || op === 'IS_NOT_EMPTY'
);

export const isBetweenOp = (op: string): boolean => op === 'BETWEEN' || op === 'NOT_BETWEEN';

export const isListOp = (op: string): boolean => op === 'IN' || op === 'NOT_IN';

export const buildQuickWhereSuggestionOptions = ({
    quickWhereDraft,
    allTableColumnNames,
    displayColumnNames,
    dbType,
    darkMode,
}: {
    quickWhereDraft: string;
    allTableColumnNames: string[];
    displayColumnNames: string[];
    dbType: string;
    darkMode: boolean;
}) => {
    const columnSuggestionSource = allTableColumnNames.length > 0 ? allTableColumnNames : displayColumnNames;
    return resolveWhereConditionSuggestions({
        input: quickWhereDraft,
        columnNames: columnSuggestionSource,
        dbType,
    }).map((item) => ({
        value: item.value,
        insertText: item.insertText,
        suggestionKind: item.kind,
        label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>{item.label}</span>
                <span style={{ color: darkMode ? 'rgba(255,255,255,0.46)' : 'rgba(0,0,0,0.42)', fontSize: 12 }}>{item.detail}</span>
            </div>
        ),
    }));
};
