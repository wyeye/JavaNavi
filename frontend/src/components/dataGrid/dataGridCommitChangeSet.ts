import React from 'react';
import { resolveRowLocatorValues, type EditRowLocator } from '../../utils/rowLocator';
import { translate, type AppLanguage } from '../../i18n';
import { JAVANAVI_ROW_KEY } from './dataGridCells';
import { isCellValueEqualForDiff } from './dataGridValue';

type DataGridCommitRow = Record<string, unknown>;

export type NormalizeCommitCellValue = (columnName: string, value: unknown, mode: 'insert' | 'update') => unknown;

export type DataGridCommitUpdate = {
    keys: DataGridCommitRow;
    values: DataGridCommitRow;
};

export type DataGridCommitChangeSet = {
    inserts: DataGridCommitRow[];
    updates: DataGridCommitUpdate[];
    deletes: DataGridCommitRow[];
};

export const buildDataGridCommitChangeSet = ({
    addedRows,
    modifiedRows,
    deletedRowKeys,
    data,
    editLocator,
    columnNames,
    rowKeyToString,
    normalizeCommitCellValue,
    language = 'en',
}: {
    addedRows: DataGridCommitRow[];
    modifiedRows: Record<string, DataGridCommitRow>;
    deletedRowKeys: Set<string>;
    data: DataGridCommitRow[];
    editLocator?: EditRowLocator;
    columnNames: string[];
    rowKeyToString: (key: React.Key) => string;
    normalizeCommitCellValue: NormalizeCommitCellValue;
    language?: AppLanguage;
}): { ok: true; changes: DataGridCommitChangeSet } | { ok: false; error: string } => {
    if (!editLocator || editLocator.readOnly || editLocator.strategy === 'none') {
        return { ok: false, error: editLocator?.reason || translate(language, 'dataGrid.locator.noSafeLocatorCurrent') };
    }

    const normalizeValues = (values: DataGridCommitRow, mode: 'insert' | 'update') => {
        const normalizedValues: DataGridCommitRow = {};
        Object.entries(values).forEach(([col, val]) => {
            if (col === JAVANAVI_ROW_KEY) return;
            const normalizedVal = normalizeCommitCellValue(col, val, mode);
            if (normalizedVal !== undefined) {
                normalizedValues[col] = normalizedVal;
            }
        });
        return normalizedValues;
    };

    const originalRowsByKey = new Map<string, DataGridCommitRow>();
    data.forEach((row) => {
        const key = row?.[JAVANAVI_ROW_KEY];
        if (key === undefined || key === null) return;
        originalRowsByKey.set(rowKeyToString(key as React.Key), row);
    });

    const writeColumnSet = new Set(columnNames.map((column) => String(column || '').trim()).filter(Boolean));
    editLocator.valueColumns.forEach((column) => writeColumnSet.delete(String(column || '').trim()));
    editLocator.columns.forEach((column) => writeColumnSet.delete(String(column || '').trim()));

    const filterWritableValues = (values: DataGridCommitRow) => {
        const filtered: DataGridCommitRow = {};
        Object.entries(values).forEach(([column, value]) => {
            if (writeColumnSet.has(column)) filtered[column] = value;
        });
        return filtered;
    };

    const isRowIdLocator = (column: string) =>
        editLocator.strategy === 'rowid' && String(column || '').trim().toUpperCase() === 'ROWID';

    const filterInsertValues = (values: DataGridCommitRow) => {
        const filtered: DataGridCommitRow = {};
        Object.entries(values).forEach(([column, value]) => {
            if (!isRowIdLocator(column)) filtered[column] = value;
        });
        return filtered;
    };

    const inserts: DataGridCommitRow[] = [];
    const updates: DataGridCommitUpdate[] = [];
    const deletes: DataGridCommitRow[] = [];

    addedRows.forEach(row => {
        const key = row?.[JAVANAVI_ROW_KEY];
        if (key !== undefined && key !== null && deletedRowKeys.has(rowKeyToString(key as React.Key))) return;
        const insertValues = filterInsertValues(normalizeValues(row, 'insert'));
        if (Object.keys(insertValues).length === 0) {
            return { ok: false, error: translate(language, 'dataGrid.commit.noWritableInsertFields') };
        }
        inserts.push(insertValues);
    });

    for (const keyStr of deletedRowKeys) {
        const originalRow = originalRowsByKey.get(keyStr);
        if (!originalRow) continue;
        const locatorValues = resolveRowLocatorValues(editLocator, originalRow, language);
        if (!locatorValues.ok) return { ok: false, error: locatorValues.error };
        deletes.push(locatorValues.values);
    }

    for (const [keyStr, newRow] of Object.entries(modifiedRows)) {
        if (deletedRowKeys.has(keyStr)) continue;
        const originalRow = originalRowsByKey.get(keyStr);
        if (!originalRow) continue;
        const locatorValues = resolveRowLocatorValues(editLocator, originalRow, language);
        if (!locatorValues.ok) return { ok: false, error: locatorValues.error };

        const hasRowKey = Object.prototype.hasOwnProperty.call(newRow, JAVANAVI_ROW_KEY);
        let values: DataGridCommitRow = {};
        if (!hasRowKey) {
            values = { ...newRow };
        } else {
            columnNames.forEach((col) => {
                const nextVal = newRow?.[col];
                const prevVal = originalRow?.[col];
                if (!isCellValueEqualForDiff(prevVal, nextVal)) values[col] = nextVal;
            });
        }

        const normalizedValues = filterWritableValues(normalizeValues(values, 'update'));
        if (Object.keys(normalizedValues).length === 0) continue;
        updates.push({ keys: locatorValues.values, values: normalizedValues });
    }

    return { ok: true, changes: { inserts, updates, deletes } };
};
