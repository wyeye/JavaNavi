export type DataGridScalarEditorType = 'text' | 'number' | 'boolean';

const baseColumnType = (columnType?: string): string => (
  String(columnType || '').trim().toLowerCase().split(/[ (]/)[0] || ''
);

const bitSize = (columnType?: string): number | null => {
  const match = String(columnType || '').trim().toLowerCase().match(/^bit\s*\(\s*(\d+)\s*\)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getDataGridScalarEditorType = (columnType?: string): DataGridScalarEditorType => {
  const raw = String(columnType || '').trim().toLowerCase();
  if (!raw) return 'text';

  const base = baseColumnType(raw);
  const parsedBitSize = bitSize(raw);
  if (base === 'boolean' || base === 'bool' || base === 'bit' && (parsedBitSize === null || parsedBitSize === 1)) {
    return 'boolean';
  }

  if (
    base === 'tinyint' ||
    base === 'smallint' ||
    base === 'mediumint' ||
    base === 'int' ||
    base === 'integer' ||
    base === 'bigint' ||
    base === 'decimal' ||
    base === 'dec' ||
    base === 'numeric' ||
    base === 'number' ||
    base === 'float' ||
    base === 'double' ||
    base === 'real' ||
    base === 'serial' ||
    base === 'smallserial' ||
    base === 'bigserial' ||
    base === 'money'
  ) {
    return 'number';
  }

  return 'text';
};

export const toBooleanEditorValue = (value: unknown): boolean | undefined => {
  if (value === true || value === false) return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'bigint') {
    if (value === 1n) return true;
    if (value === 0n) return false;
  }
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes' || text === 'y') return true;
  if (text === 'false' || text === '0' || text === 'no' || text === 'n') return false;
  return undefined;
};
