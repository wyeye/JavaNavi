import React from 'react';
import type { FilterCondition } from '../../utils/sql';
import { resolveWhereConditionSuggestions } from '../../utils/dataGridWhereFilter';
import { translate, type AppLanguage } from '../../i18n';
import type { GridFilterCondition } from './dataGridFilterTypes';

export const buildFilterOpOptions = (language: AppLanguage) => [
    { value: '=', label: '=' },
    { value: '!=', label: '!=' },
    { value: '<', label: '<' },
    { value: '<=', label: '<=' },
    { value: '>', label: '>' },
    { value: '>=', label: '>=' },
    { value: 'CONTAINS', label: translate(language, 'dataGrid.filter.op.contains') },
    { value: 'NOT_CONTAINS', label: translate(language, 'dataGrid.filter.op.notContains') },
    { value: 'STARTS_WITH', label: translate(language, 'dataGrid.filter.op.startsWith') },
    { value: 'NOT_STARTS_WITH', label: translate(language, 'dataGrid.filter.op.notStartsWith') },
    { value: 'ENDS_WITH', label: translate(language, 'dataGrid.filter.op.endsWith') },
    { value: 'NOT_ENDS_WITH', label: translate(language, 'dataGrid.filter.op.notEndsWith') },
    { value: 'IS_NULL', label: translate(language, 'dataGrid.filter.op.isNull') },
    { value: 'IS_NOT_NULL', label: translate(language, 'dataGrid.filter.op.isNotNull') },
    { value: 'IS_EMPTY', label: translate(language, 'dataGrid.filter.op.isEmpty') },
    { value: 'IS_NOT_EMPTY', label: translate(language, 'dataGrid.filter.op.isNotEmpty') },
    { value: 'BETWEEN', label: translate(language, 'dataGrid.filter.op.between') },
    { value: 'NOT_BETWEEN', label: translate(language, 'dataGrid.filter.op.notBetween') },
    { value: 'IN', label: translate(language, 'dataGrid.filter.op.in') },
    { value: 'NOT_IN', label: translate(language, 'dataGrid.filter.op.notIn') },
    { value: 'CUSTOM', label: translate(language, 'dataGrid.filter.op.custom') },
];

export const buildFilterLogicOptions = (language: AppLanguage) => [
    { value: 'AND', label: translate(language, 'dataGrid.filter.logic.and') },
    { value: 'OR', label: translate(language, 'dataGrid.filter.logic.or') },
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
    language,
}: {
    quickWhereDraft: string;
    allTableColumnNames: string[];
    displayColumnNames: string[];
    dbType: string;
    darkMode: boolean;
    language: AppLanguage;
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
                <span style={{ color: darkMode ? 'rgba(255,255,255,0.46)' : 'rgba(0,0,0,0.42)', fontSize: 12 }}>{translate(language, item.detail)}</span>
            </div>
        ),
    }));
};
