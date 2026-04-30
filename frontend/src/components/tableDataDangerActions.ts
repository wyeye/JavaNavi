export type TableDataDangerActionKind = 'truncate' | 'clear';

const resolveCustomDriverDialect = (driver: string): string => {
  const normalized = String(driver || '').trim().toLowerCase();
  switch (normalized) {
    case 'postgresql':
    case 'postgres':
    case 'pg':
    case 'pq':
    case 'pgx':
      return 'postgres';
    case 'dm':
    case 'dameng':
    case 'dm8':
      return 'dameng';
    case 'sqlite3':
    case 'sqlite':
      return 'sqlite';
    case 'sphinxql':
      return 'sphinx';
    case 'diros':
    case 'doris':
      return 'diros';
    case 'kingbase':
    case 'kingbase8':
    case 'kingbasees':
    case 'kingbasev8':
      return 'kingbase';
    case 'highgo':
      return 'highgo';
    case 'vastbase':
      return 'vastbase';
    default:
      break;
  }

  if (normalized.includes('postgres')) return 'postgres';
  if (normalized.includes('kingbase')) return 'kingbase';
  if (normalized.includes('highgo')) return 'highgo';
  if (normalized.includes('vastbase')) return 'vastbase';
  if (normalized.includes('sqlite')) return 'sqlite';
  if (normalized.includes('sphinx')) return 'sphinx';
  if (normalized.includes('diros') || normalized.includes('doris')) return 'diros';
  return normalized;
};

export const resolveTableDataActionDBType = (type: string, driver?: string): string => {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType !== 'custom') {
    return normalizedType;
  }
  return resolveCustomDriverDialect(driver || '');
};

export const supportsTableTruncateAction = (type: string, driver?: string): boolean => {
  switch (resolveTableDataActionDBType(type, driver)) {
    case 'mysql':
    case 'mariadb':
    case 'postgres':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
    case 'sqlserver':
    case 'oracle':
    case 'dameng':
    case 'clickhouse':
    case 'duckdb':
      return true;
    default:
      return false;
  }
};

export const getTableDataDangerActionMeta = (action: TableDataDangerActionKind): {
  label: string;
  progressLabel: string;
} => {
  if (action === 'truncate') {
    return { label: '截断表', progressLabel: '截断' };
  }
  return { label: '清空表', progressLabel: '清空' };
};
