import { resolveRowLocatorValues, type EditRowLocator } from '../../utils/rowLocator';
import { JAVANAVI_ROW_KEY } from './dataGridCells';
import { isCellValueEqualForDiff } from './dataGridValue';

export type NormalizeCommitCellValue = (columnName: string, value: any, mode: 'insert' | 'update') => any;

export type DataGridCommitChangeSet = {
    inserts: any[];
    updates: any[];
    deletes: any[];
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
}: {
    addedRows: any[];
    modifiedRows: Record<string, any>;
    deletedRowKeys: Set<string>;
    data: any[];
    editLocator?: EditRowLocator;
    columnNames: string[];
    rowKeyToString: (key: any) => string;
    normalizeCommitCellValue: NormalizeCommitCellValue;
}): { ok: true; changes: DataGridCommitChangeSet } | { ok: false; error: string } => {
    if (!editLocator || editLocator.readOnly || editLocator.strategy === 'none') {
        return { ok: false, error: editLocator?.reason || '当前结果没有可用的安全行定位方式，无法提交修改。' };
    }

    const normalizeValues = (values: Record<string, any>, mode: 'insert' | 'update') => {
        const normalizedValues: Record<string, any> = {};
        Object.entries(values).forEach(([col, val]) => {
            if (col === JAVANAVI_ROW_KEY) return;
            const normalizedVal = normalizeCommitCellValue(col, val, mode);
            if (normalizedVal !== undefined) {
                normalizedValues[col] = normalizedVal;
            }
        });
        return normalizedValues;
    };

    const originalRowsByKey = new Map<string, any>();
    data.forEach((row) => {
        const key = row?.[JAVANAVI_ROW_KEY];
        if (key === undefined || key === null) return;
        originalRowsByKey.set(rowKeyToString(key), row);
    });

    const writeColumnSet = new Set(columnNames.map((column) => String(column || '').trim()).filter(Boolean));
    editLocator.valueColumns.forEach((column) => writeColumnSet.delete(String(column || '').trim()));
    editLocator.columns.forEach((column) => writeColumnSet.delete(String(column || '').trim()));

    const filterWritableValues = (values: Record<string, any>) => {
        const filtered: Record<string, any> = {};
        Object.entries(values).forEach(([column, value]) => {
            if (writeColumnSet.has(column)) filtered[column] = value;
        });
        return filtered;
    };

    const inserts: any[] = [];
    const updates: any[] = [];
    const deletes: any[] = [];

    addedRows.forEach(row => {
        const key = row?.[JAVANAVI_ROW_KEY];
        if (key !== undefined && key !== null && deletedRowKeys.has(rowKeyToString(key))) return;
        const insertValues = filterWritableValues(normalizeValues(row, 'insert'));
        if (Object.keys(insertValues).length === 0) {
            return { ok: false, error: '新增行没有可写字段，无法提交修改。' };
        }
        inserts.push(insertValues);
    });

    for (const keyStr of deletedRowKeys) {
        const originalRow = originalRowsByKey.get(keyStr);
        if (!originalRow) continue;
        const locatorValues = resolveRowLocatorValues(editLocator, originalRow);
        if (!locatorValues.ok) return { ok: false, error: locatorValues.error };
        deletes.push(locatorValues.values);
    }

    for (const [keyStr, newRow] of Object.entries(modifiedRows)) {
        if (deletedRowKeys.has(keyStr)) continue;
        const originalRow = originalRowsByKey.get(keyStr);
        if (!originalRow) continue;
        const locatorValues = resolveRowLocatorValues(editLocator, originalRow);
        if (!locatorValues.ok) return { ok: false, error: locatorValues.error };

        const hasRowKey = Object.prototype.hasOwnProperty.call(newRow as any, JAVANAVI_ROW_KEY);
        let values: Record<string, any> = {};
        if (!hasRowKey) {
            values = { ...(newRow as any) };
        } else {
            columnNames.forEach((col) => {
                const nextVal = (newRow as any)?.[col];
                const prevVal = (originalRow as any)?.[col];
                if (!isCellValueEqualForDiff(prevVal, nextVal)) values[col] = nextVal;
            });
        }

        const normalizedValues = filterWritableValues(normalizeValues(values, 'update'));
        if (Object.keys(normalizedValues).length === 0) continue;
        updates.push({ keys: locatorValues.values, values: normalizedValues });
    }

    return { ok: true, changes: { inserts, updates, deletes } };
};
