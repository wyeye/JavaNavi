import type React from 'react';

export type DataGridClipboardRow = Record<string, unknown>;
export type DataGridClipboardRowKey = React.Key;

export interface BuildCopiedRowsForPasteInput {
  rows: DataGridClipboardRow[];
  selectedRowKeys: DataGridClipboardRowKey[];
  columnNames: string[];
  rowKeyField: string;
  rowKeyToString?: (key: DataGridClipboardRowKey) => string;
}

export interface BuildPastedRowsFromCopiedRowsInput {
  rows: DataGridClipboardRow[];
  columnNames: string[];
  rowKeyField: string;
  createRowKey: (index: number) => string;
}

const defaultRowKeyToString = (key: DataGridClipboardRowKey): string => String(key);

const getCopyableColumnNames = (columnNames: string[], rowKeyField: string): string[] =>
  columnNames.filter((columnName) => columnName !== rowKeyField);

const pickCopyableRowValues = (
  row: DataGridClipboardRow,
  columnNames: string[],
  rowKeyField: string,
): DataGridClipboardRow => {
  const next: DataGridClipboardRow = {};
  getCopyableColumnNames(columnNames, rowKeyField).forEach((columnName) => {
    next[columnName] = row?.[columnName];
  });
  return next;
};

const isClipboardRowKey = (value: unknown): value is DataGridClipboardRowKey =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint';

export const buildCopiedRowsForPaste = ({
  rows,
  selectedRowKeys,
  columnNames,
  rowKeyField,
  rowKeyToString = defaultRowKeyToString,
}: BuildCopiedRowsForPasteInput): DataGridClipboardRow[] => {
  if (!Array.isArray(rows) || !Array.isArray(selectedRowKeys) || selectedRowKeys.length === 0) {
    return [];
  }

  const rowsByKey = new Map<string, DataGridClipboardRow>();
  rows.forEach((row) => {
    const rowKey = row?.[rowKeyField];
    if (!isClipboardRowKey(rowKey)) return;
    rowsByKey.set(rowKeyToString(rowKey), row);
  });

  return selectedRowKeys
    .map((selectedKey) => rowsByKey.get(rowKeyToString(selectedKey)))
    .filter((row): row is DataGridClipboardRow => Boolean(row))
    .map((row) => pickCopyableRowValues(row, columnNames, rowKeyField));
};

export const buildPastedRowsFromCopiedRows = ({
  rows,
  columnNames,
  rowKeyField,
  createRowKey,
}: BuildPastedRowsFromCopiedRowsInput): Array<DataGridClipboardRow & Record<string, React.Key>> =>
  rows.map((row, index) => ({
    [rowKeyField]: createRowKey(index),
    ...pickCopyableRowValues(row, columnNames, rowKeyField),
  })) as Array<DataGridClipboardRow & Record<string, React.Key>>;
