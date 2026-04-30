export interface BuildCopiedRowsForPasteInput {
  rows: Array<Record<string, any>>;
  selectedRowKeys: any[];
  columnNames: string[];
  rowKeyField: string;
  rowKeyToString?: (key: any) => string;
}

export interface BuildPastedRowsFromCopiedRowsInput {
  rows: Array<Record<string, any>>;
  columnNames: string[];
  rowKeyField: string;
  createRowKey: (index: number) => string;
}

const defaultRowKeyToString = (key: any): string => String(key);

const getCopyableColumnNames = (columnNames: string[], rowKeyField: string): string[] =>
  columnNames.filter((columnName) => columnName !== rowKeyField);

const pickCopyableRowValues = (
  row: Record<string, any>,
  columnNames: string[],
  rowKeyField: string,
): Record<string, any> => {
  const next: Record<string, any> = {};
  getCopyableColumnNames(columnNames, rowKeyField).forEach((columnName) => {
    next[columnName] = row?.[columnName];
  });
  return next;
};

export const buildCopiedRowsForPaste = ({
  rows,
  selectedRowKeys,
  columnNames,
  rowKeyField,
  rowKeyToString = defaultRowKeyToString,
}: BuildCopiedRowsForPasteInput): Array<Record<string, any>> => {
  if (!Array.isArray(rows) || !Array.isArray(selectedRowKeys) || selectedRowKeys.length === 0) {
    return [];
  }

  const rowsByKey = new Map<string, Record<string, any>>();
  rows.forEach((row) => {
    const rowKey = row?.[rowKeyField];
    if (rowKey === undefined || rowKey === null) return;
    rowsByKey.set(rowKeyToString(rowKey), row);
  });

  return selectedRowKeys
    .map((selectedKey) => rowsByKey.get(rowKeyToString(selectedKey)))
    .filter((row): row is Record<string, any> => Boolean(row))
    .map((row) => pickCopyableRowValues(row, columnNames, rowKeyField));
};

export const buildPastedRowsFromCopiedRows = ({
  rows,
  columnNames,
  rowKeyField,
  createRowKey,
}: BuildPastedRowsFromCopiedRowsInput): Array<Record<string, any>> =>
  rows.map((row, index) => ({
    [rowKeyField]: createRowKey(index),
    ...pickCopyableRowValues(row, columnNames, rowKeyField),
  }));
