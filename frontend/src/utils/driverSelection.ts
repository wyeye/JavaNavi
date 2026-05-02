export type DriverSelectionOption = {
  driverType?: string;
  databaseType?: string;
};

export const normalizeDriverSelectionType = (value: string | undefined | null): string => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'postgresql' || normalized === 'pg') return 'postgres';
  if (normalized === 'doris') return 'diros';
  if (normalized === 'mssql' || normalized === 'sql_server' || normalized === 'sql server') return 'sqlserver';
  if (normalized === 'dm' || normalized === 'dm8') return 'dameng';
  if (normalized === 'taos' || normalized === 'taos-rs' || normalized === 'taos_rs') return 'tdengine';
  if (normalized === 'ch') return 'clickhouse';
  if (normalized === 'sqlite3') return 'sqlite';
  return normalized;
};

export const isDriverOptionForDatabase = (
  databaseType: string | undefined | null,
  option: DriverSelectionOption | null | undefined,
): boolean => {
  const database = normalizeDriverSelectionType(databaseType);
  const driver = normalizeDriverSelectionType(option?.driverType);
  const optionDatabase = normalizeDriverSelectionType(option?.databaseType);
  if (!database || !driver) return false;
  if (optionDatabase && optionDatabase !== database) return false;
  return driver === database;
};

export const filterDriverOptionsForDatabase = <T extends DriverSelectionOption>(
  databaseType: string | undefined | null,
  options: T[] | undefined | null,
): T[] => (options || []).filter((option) => isDriverOptionForDatabase(databaseType, option));

export const resolveDefaultDriverTypeForDatabase = <T extends DriverSelectionOption>(
  databaseType: string | undefined | null,
  configuredDefaultDriverType: string | undefined | null,
  options: T[] | undefined | null,
): string => {
  const database = normalizeDriverSelectionType(databaseType);
  const configured = normalizeDriverSelectionType(configuredDefaultDriverType);
  const allowed = filterDriverOptionsForDatabase(database, options).map((option) => normalizeDriverSelectionType(option.driverType));
  if (configured && allowed.includes(configured)) return configured;
  return database;
};
