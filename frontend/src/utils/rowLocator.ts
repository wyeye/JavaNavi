import type { IndexDefinition } from '../types';
import { translate, type AppLanguage } from '../i18n';
import { resolveUniqueKeyGroupsFromIndexes } from '../components/dataGrid/dataGridCopyInsert';

export type RowLocatorStrategy = 'primary-key' | 'unique-key' | 'rowid' | 'none';

export type EditRowLocator = {
  strategy: RowLocatorStrategy;
  columns: string[];
  valueColumns: string[];
  readOnly: boolean;
  reason?: string;
};

export type ResolveEditRowLocatorParams = {
  resultColumns: string[];
  primaryKeys?: string[];
  indexes?: IndexDefinition[];
  dbType?: string;
  language?: AppLanguage;
};

type RowLocatorValueMap = Record<string, unknown>;

export type ResolveRowLocatorValuesResult =
  | { ok: true; values: RowLocatorValueMap }
  | { ok: false; error: string };

const normalizeColumnName = (value: string): string => String(value || '').trim();

const hasColumn = (columns: string[], target: string): boolean => {
  const normalizedTarget = normalizeColumnName(target).toLowerCase();
  return columns.some((column) => normalizeColumnName(column).toLowerCase() === normalizedTarget);
};

const findColumn = (columns: string[], target: string): string => {
  const normalizedTarget = normalizeColumnName(target).toLowerCase();
  return columns.find((column) => normalizeColumnName(column).toLowerCase() === normalizedTarget) || target;
};

const normalizeDbType = (dbType?: string): string => String(dbType || '').trim().toLowerCase();

const isRowLocatorValueEmpty = (row: RowLocatorValueMap | string[], valueColumn: string): boolean => {
  if (Array.isArray(row)) return false;
  const value = row?.[valueColumn];
  return value === null || value === undefined || value === '';
};

const buildReadOnlyLocator = (reason: string): EditRowLocator => ({
  strategy: 'none',
  columns: [],
  valueColumns: [],
  readOnly: true,
  reason,
});

export const resolveEditRowLocator = ({
  resultColumns,
  primaryKeys = [],
  indexes,
  dbType,
  language = 'en',
}: ResolveEditRowLocatorParams): EditRowLocator => {
  const columns = (resultColumns || []).map(normalizeColumnName).filter(Boolean);
  const primaryKeyColumns = (primaryKeys || []).map(normalizeColumnName).filter(Boolean);

  if (primaryKeyColumns.length > 0) {
    const missing = primaryKeyColumns.filter((column) => !hasColumn(columns, column));
    if (missing.length === 0) {
      return {
        strategy: 'primary-key',
        columns: primaryKeyColumns,
        valueColumns: primaryKeyColumns.map((column) => findColumn(columns, column)),
        readOnly: false,
      };
    }
    return buildReadOnlyLocator(translate(language, 'dataGrid.locator.missingPrimaryKeyColumns', { columns: missing.join(', ') }));
  }

  const uniqueKeyGroup = resolveUniqueKeyGroupsFromIndexes(indexes)
    .find((group) => group.length > 0 && group.every((column) => hasColumn(columns, column)));
  if (uniqueKeyGroup) {
    return {
      strategy: 'unique-key',
      columns: uniqueKeyGroup,
      valueColumns: uniqueKeyGroup.map((column) => findColumn(columns, column)),
      readOnly: false,
    };
  }

  if (normalizeDbType(dbType) === 'oracle' && hasColumn(columns, 'ROWID')) {
    const valueColumn = findColumn(columns, 'ROWID');
    return {
      strategy: 'rowid',
      columns: ['ROWID'],
      valueColumns: [valueColumn],
      readOnly: false,
    };
  }

  return buildReadOnlyLocator(translate(language, 'dataGrid.locator.noSafeLocator'));
};

export const resolveRowLocatorValues = (
  locator: EditRowLocator | undefined,
  row: RowLocatorValueMap,
  language: AppLanguage = 'en',
): ResolveRowLocatorValuesResult => {
  if (!locator || locator.readOnly || locator.strategy === 'none') {
    return { ok: false, error: locator?.reason || translate(language, 'dataGrid.locator.noSafeLocatorCurrent') };
  }

  const values: RowLocatorValueMap = {};
  for (let index = 0; index < locator.columns.length; index++) {
    const column = locator.columns[index];
    const valueColumn = locator.valueColumns[index] || column;
    const value = row?.[valueColumn];
    if (isRowLocatorValueEmpty(row, valueColumn)) {
      return { ok: false, error: translate(language, 'dataGrid.locator.emptyLocatorValue', { column }) };
    }
    values[column] = value;
  }

  return { ok: true, values };
};
