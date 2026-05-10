import type { SavedConnection } from '../types';

export const splitQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
  const raw = String(qualifiedName || '').trim();
  if (!raw) return { schemaName: '', objectName: '' };
  const idx = raw.lastIndexOf('.');
  if (idx <= 0 || idx >= raw.length - 1) {
    return { schemaName: '', objectName: raw };
  }
  return {
    schemaName: raw.substring(0, idx),
    objectName: raw.substring(idx + 1),
  };
};

const normalizeSidebarConnectionDialect = (type: string, driver: string): string => {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'custom') {
    const normalizedDriver = String(driver || '').trim().toLowerCase();
    if (normalizedDriver === 'postgresql' || normalizedDriver === 'postgres' || normalizedDriver === 'pg') return 'postgres';
    if (normalizedDriver === 'dameng' || normalizedDriver === 'dm' || normalizedDriver === 'dm8') return 'dm';
    if (normalizedDriver.includes('oracle')) return 'oracle';
    return normalizedDriver;
  }
  if (normalizedType === 'dameng') return 'dm';
  return normalizedType;
};

export const normalizeSidebarViewName = (dialect: string, dbName: string, schemaName: string, viewName: string): string => {
  const normalizedDialect = String(dialect || '').trim().toLowerCase();
  const normalizedDbName = String(dbName || '').trim();
  const normalizedSchemaName = String(schemaName || '').trim();
  const normalizedViewName = String(viewName || '').trim();

  if (!normalizedViewName) {
    return '';
  }

  if (normalizedDialect === 'mysql') {
    const parsed = splitQualifiedName(normalizedViewName);
    if (parsed.objectName) {
      return parsed.objectName;
    }
    return normalizedViewName;
  }

  if (!normalizedSchemaName || normalizedViewName.includes('.')) {
    return normalizedViewName;
  }

  return `${normalizedSchemaName}.${normalizedViewName}`;
};

export const resolveSidebarRuntimeDatabase = (
  type: string,
  driver: string,
  savedDatabase: string,
  overrideDatabase?: string,
  clearDatabase: boolean = false,
): string => {
  if (clearDatabase) return '';

  const normalizedSavedDatabase = String(savedDatabase || '').trim();
  const normalizedOverrideDatabase = String(overrideDatabase || '').trim();
  if (!normalizedOverrideDatabase) {
    return normalizedSavedDatabase;
  }

  const dialect = normalizeSidebarConnectionDialect(type, driver);
  if (dialect === 'oracle' || dialect === 'dm') {
    return normalizedSavedDatabase || normalizedOverrideDatabase;
  }

  return normalizedOverrideDatabase;
};

const SIDEBAR_SCHEMA_DB_TYPES = new Set([
  'postgres',
  'kingbase',
  'highgo',
  'vastbase',
  'sqlserver',
  'oracle',
  'dameng',
]);

const SIDEBAR_SCHEMA_CUSTOM_DRIVERS = new Set([
  'postgres',
  'kingbase',
  'highgo',
  'vastbase',
  'sqlserver',
  'oracle',
  'dm',
]);

export const shouldHideSchemaPrefix = (conn: SavedConnection | undefined): boolean => {
  const dbType = String(conn?.config?.type || '').trim().toLowerCase();
  if (SIDEBAR_SCHEMA_DB_TYPES.has(dbType)) return true;
  if (dbType !== 'custom') return false;

  const customDriver = String(conn?.config?.driver || '').trim().toLowerCase();
  return SIDEBAR_SCHEMA_CUSTOM_DRIVERS.has(customDriver);
};

export const getSidebarTableDisplayName = (conn: SavedConnection | undefined, tableName: string): string => {
  const rawName = String(tableName || '').trim();
  if (!rawName) return rawName;
  if (!shouldHideSchemaPrefix(conn)) return rawName;
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex >= rawName.length - 1) return rawName;
  return rawName.substring(lastDotIndex + 1);
};

export const getMetadataDialect = (conn: SavedConnection | undefined): string => {
  const type = String(conn?.config?.type || '').trim().toLowerCase();
  if (type === 'custom') {
    const driver = String(conn?.config?.driver || '').trim().toLowerCase();
    if (driver === 'diros' || driver === 'doris') return 'mysql';
    return driver;
  }
  if (type === 'mariadb' || type === 'diros' || type === 'sphinx') return 'mysql';
  if (type === 'dameng') return 'dm';
  return type;
};

export const escapeSQLLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");
export const quoteSqlServerIdentifier = (raw: string): string => `[${String(raw || '').replace(/]/g, ']]')}]`;

export type MetadataQuerySpec = {
  sql: string;
  inferredType?: 'FUNCTION' | 'PROCEDURE';
};

export type MetadataQueryResult = {
  rows: Record<string, any>[];
  inferredType?: 'FUNCTION' | 'PROCEDURE';
};

export const isSphinxConnection = (conn: SavedConnection | undefined): boolean => {
  const type = String(conn?.config?.type || '').trim().toLowerCase();
  if (type === 'sphinx') return true;
  if (type !== 'custom') return false;
  const driver = String(conn?.config?.driver || '').trim().toLowerCase();
  return driver === 'sphinx' || driver === 'sphinxql';
};

export const normalizeMetadataQuerySpecs = (specs: MetadataQuerySpec[]): MetadataQuerySpec[] => {
  const seen = new Set<string>();
  const normalized: MetadataQuerySpec[] = [];
  specs.forEach((spec) => {
    const sql = String(spec.sql || '').trim();
    if (!sql) return;
    const key = `${spec.inferredType || ''}@@${sql}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({ sql, inferredType: spec.inferredType });
  });
  return normalized;
};

export const getCaseInsensitiveValue = (row: Record<string, any>, candidateKeys: string[]): string => {
  const keyMap = new Map<string, any>();
  Object.keys(row || {}).forEach((key) => keyMap.set(key.toLowerCase(), row[key]));
  for (const key of candidateKeys) {
    const value = keyMap.get(key.toLowerCase());
    if (value !== undefined && value !== null) {
      const normalized = String(value).trim();
      if (normalized !== '') return normalized;
    }
  }
  return '';
};

export const getCaseInsensitiveRawValue = (row: Record<string, any>, candidateKeys: string[]): any => {
  const keyMap = new Map<string, any>();
  Object.keys(row || {}).forEach((key) => keyMap.set(key.toLowerCase(), row[key]));
  for (const key of candidateKeys) {
    const value = keyMap.get(key.toLowerCase());
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
};

export const getFirstRowValue = (row: Record<string, any>): string => {
  for (const value of Object.values(row || {})) {
    if (value !== undefined && value !== null) {
      const normalized = String(value).trim();
      if (normalized !== '') return normalized;
    }
  }
  return '';
};

export const getMySQLShowTablesName = (row: Record<string, any>): string => {
  for (const key of Object.keys(row || {})) {
    if (!key.toLowerCase().startsWith('tables_in_')) continue;
    const value = row[key];
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized !== '') return normalized;
  }
  return '';
};

export const buildQualifiedName = (schemaName: string, objectName: string): string => {
  const schema = String(schemaName || '').trim();
  const name = String(objectName || '').trim();
  if (!name) return '';
  if (!schema) return name;
  if (name.includes('.')) return name;
  return `${schema}.${name}`;
};

export const parseDuckDBParameterNames = (raw: any): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item ?? '').trim())
      .filter((item) => item !== '' && item.toLowerCase() !== '<nil>');
  }

  const text = String(raw ?? '').trim();
  if (!text) return [];
  const normalized = text.startsWith('[') && text.endsWith(']')
    ? text.slice(1, -1)
    : text;
  return normalized
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && part.toLowerCase() !== '<nil>');
};

export const buildDuckDBMacroDDL = (
  schemaName: string,
  functionName: string,
  parametersRaw: any,
  macroDefinitionRaw: any
): string => {
  const schema = String(schemaName || '').trim();
  const name = String(functionName || '').trim();
  const macroDefinition = String(macroDefinitionRaw || '').trim();
  if (!name || !macroDefinition) return '';

  const parameters = parseDuckDBParameterNames(parametersRaw).join(', ');
  const qualifiedName = schema ? `${schema}.${name}` : name;
  const isTableMacro = !macroDefinition.startsWith('(');
  if (isTableMacro) {
    return `CREATE OR REPLACE MACRO ${qualifiedName}(${parameters}) AS TABLE ${macroDefinition};`;
  }
  return `CREATE OR REPLACE MACRO ${qualifiedName}(${parameters}) AS ${macroDefinition};`;
};

export const buildViewsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
  const safeDbName = escapeSQLLiteral(dbName);
  switch (dialect) {
    case 'mysql': {
      const dbIdent = String(dbName || '').replace(/`/g, '``').trim();
      return normalizeMetadataQuerySpecs([
        {
          sql: safeDbName
            ? `SELECT TABLE_NAME AS view_name, TABLE_SCHEMA AS schema_name FROM information_schema.views WHERE table_schema = '${safeDbName}' ORDER BY TABLE_NAME`
            : '',
        },
        { sql: dbIdent ? `SHOW FULL TABLES FROM \`${dbIdent}\`` : '' },
        { sql: `SHOW FULL TABLES` },
      ]);
    }
    case 'postgres':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
      return [{ sql: `SELECT schemaname AS schema_name, viewname AS view_name FROM pg_catalog.pg_views WHERE schemaname != 'information_schema' AND schemaname NOT LIKE 'pg_%' ORDER BY schemaname, viewname` }];
    case 'sqlserver': {
      const safeDb = quoteSqlServerIdentifier(dbName || 'master');
      return [{ sql: `SELECT s.name AS schema_name, v.name AS view_name FROM ${safeDb}.sys.views v JOIN ${safeDb}.sys.schemas s ON v.schema_id = s.schema_id ORDER BY s.name, v.name` }];
    }
    case 'oracle':
    case 'dm':
      return normalizeMetadataQuerySpecs([
        { sql: `SELECT VIEW_NAME AS view_name FROM USER_VIEWS ORDER BY VIEW_NAME` },
        { sql: `SELECT OWNER AS schema_name, VIEW_NAME AS view_name FROM ALL_VIEWS WHERE OWNER = USER ORDER BY VIEW_NAME` },
        {
          sql: safeDbName
            ? `SELECT OWNER AS schema_name, VIEW_NAME AS view_name FROM ALL_VIEWS WHERE OWNER = '${safeDbName.toUpperCase()}' ORDER BY VIEW_NAME`
            : '',
        },
      ]);
    case 'sqlite':
      return [{ sql: `SELECT name AS view_name FROM sqlite_master WHERE type = 'view' ORDER BY name` }];
    case 'duckdb':
      return [{ sql: `SELECT table_schema AS schema_name, table_name AS view_name FROM information_schema.views WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY table_schema, table_name` }];
    default:
      return [];
  }
};

export const buildTriggersMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
  const safeDbName = escapeSQLLiteral(dbName);
  switch (dialect) {
    case 'mysql': {
      const dbIdent = String(dbName || '').replace(/`/g, '``').trim();
      return normalizeMetadataQuerySpecs([
        {
          sql: safeDbName
            ? `SELECT TRIGGER_NAME AS trigger_name, EVENT_OBJECT_TABLE AS table_name, TRIGGER_SCHEMA AS schema_name FROM information_schema.triggers WHERE trigger_schema = '${safeDbName}' ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`
            : '',
        },
        { sql: dbIdent ? `SHOW TRIGGERS FROM \`${dbIdent}\`` : '' },
        { sql: `SHOW TRIGGERS` },
      ]);
    }
    case 'postgres':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
      return [{ sql: `SELECT DISTINCT event_object_schema AS schema_name, event_object_table AS table_name, trigger_name FROM information_schema.triggers WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema') AND trigger_schema NOT LIKE 'pg_%' ORDER BY event_object_schema, event_object_table, trigger_name` }];
    case 'sqlserver': {
      const safeDb = quoteSqlServerIdentifier(dbName || 'master');
      return [{ sql: `SELECT s.name AS schema_name, t.name AS table_name, tr.name AS trigger_name FROM ${safeDb}.sys.triggers tr JOIN ${safeDb}.sys.tables t ON tr.parent_id = t.object_id JOIN ${safeDb}.sys.schemas s ON t.schema_id = s.schema_id WHERE tr.parent_class = 1 ORDER BY s.name, t.name, tr.name` }];
    }
    case 'oracle':
    case 'dm':
      if (!safeDbName) {
        return [{ sql: `SELECT TRIGGER_NAME AS trigger_name, TABLE_NAME AS table_name FROM USER_TRIGGERS ORDER BY TABLE_NAME, TRIGGER_NAME` }];
      }
      return [{ sql: `SELECT OWNER AS schema_name, TABLE_NAME AS table_name, TRIGGER_NAME AS trigger_name FROM ALL_TRIGGERS WHERE OWNER = '${safeDbName.toUpperCase()}' ORDER BY TABLE_NAME, TRIGGER_NAME` }];
    case 'sqlite':
      return [{ sql: `SELECT name AS trigger_name, tbl_name AS table_name FROM sqlite_master WHERE type = 'trigger' ORDER BY tbl_name, name` }];
    case 'duckdb':
      return [];
    default:
      return [];
  }
};

export const buildFunctionsMetadataQuerySpecs = (dialect: string, dbName: string): MetadataQuerySpec[] => {
  const safeDbName = escapeSQLLiteral(dbName);
  switch (dialect) {
    case 'mysql':
      return normalizeMetadataQuerySpecs([
        {
          sql: safeDbName
            ? `SELECT ROUTINE_NAME AS routine_name, ROUTINE_TYPE AS routine_type, ROUTINE_SCHEMA AS schema_name FROM information_schema.routines WHERE routine_schema = '${safeDbName}' ORDER BY ROUTINE_TYPE, ROUTINE_NAME`
            : '',
        },
        {
          sql: safeDbName
            ? `SHOW FUNCTION STATUS WHERE Db = '${safeDbName}'`
            : `SHOW FUNCTION STATUS`,
          inferredType: 'FUNCTION',
        },
        {
          sql: safeDbName
            ? `SHOW PROCEDURE STATUS WHERE Db = '${safeDbName}'`
            : `SHOW PROCEDURE STATUS`,
          inferredType: 'PROCEDURE',
        },
      ]);
    case 'postgres':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
      return normalizeMetadataQuerySpecs([
        {
          sql: `SELECT n.nspname AS schema_name, p.proname AS routine_name, CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_type FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%' ORDER BY n.nspname, routine_type, p.proname`,
        },
        {
          sql: `SELECT r.routine_schema AS schema_name, r.routine_name AS routine_name, COALESCE(NULLIF(UPPER(r.routine_type), ''), 'FUNCTION') AS routine_type FROM information_schema.routines r WHERE r.routine_schema NOT IN ('pg_catalog', 'information_schema') AND r.routine_schema NOT LIKE 'pg_%' ORDER BY r.routine_schema, routine_type, r.routine_name`,
        },
        {
          sql: `SELECT n.nspname AS schema_name, p.proname AS routine_name, 'FUNCTION' AS routine_type FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_%' ORDER BY n.nspname, p.proname`,
        },
      ]);
    case 'sqlserver': {
      const safeDb = quoteSqlServerIdentifier(dbName || 'master');
      return [{ sql: `SELECT s.name AS schema_name, o.name AS routine_name, CASE o.type WHEN 'P' THEN 'PROCEDURE' WHEN 'FN' THEN 'FUNCTION' WHEN 'IF' THEN 'FUNCTION' WHEN 'TF' THEN 'FUNCTION' END AS routine_type FROM ${safeDb}.sys.objects o JOIN ${safeDb}.sys.schemas s ON o.schema_id = s.schema_id WHERE o.type IN ('P','FN','IF','TF') ORDER BY o.type, s.name, o.name` }];
    }
    case 'oracle':
    case 'dm':
      return normalizeMetadataQuerySpecs([
        { sql: `SELECT OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM USER_OBJECTS WHERE OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME` },
        { sql: `SELECT OWNER AS schema_name, OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM ALL_OBJECTS WHERE OWNER = USER AND OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME` },
        {
          sql: safeDbName
            ? `SELECT OWNER AS schema_name, OBJECT_NAME AS routine_name, OBJECT_TYPE AS routine_type FROM ALL_OBJECTS WHERE OWNER = '${safeDbName.toUpperCase()}' AND OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_TYPE, OBJECT_NAME`
            : '',
        },
      ]);
    case 'duckdb':
      return [{
        sql: `SELECT schema_name, function_name AS routine_name, 'FUNCTION' AS routine_type FROM duckdb_functions() WHERE internal = false AND lower(function_type) = 'macro' AND COALESCE(macro_definition, '') <> '' ORDER BY schema_name, function_name`,
        inferredType: 'FUNCTION',
      }];
    default:
      return [];
  }
};
