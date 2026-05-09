import {
  isBacktickIdentifierDialect,
  isMysqlFamilyDialect,
  isOracleLikeDialect,
  isPgLikeDialect,
  isSqlServerDialect,
  quoteSqlIdentifierPart,
  quoteSqlIdentifierPath,
  resolveSqlDialect,
  unquoteSqlIdentifierPart,
  unquoteSqlIdentifierPath,
} from '../utils/sqlDialect';
import { translate, type AppLanguage } from '../i18n';

export interface EditableColumnSnapshot {
  _key: string;
  name: string;
  type: string;
  nullable: string;
  default?: string | null;
  extra?: string;
  comment?: string;
  key?: string;
  isAutoIncrement?: boolean;
}

export interface BuildAlterTablePreviewInput {
  language?: AppLanguage;
  dbType: string;
  tableName: string;
  originalColumns: EditableColumnSnapshot[];
  columns: EditableColumnSnapshot[];
}

export interface BuildCreateTablePreviewInput {
  language?: AppLanguage;
  dbType: string;
  tableName: string;
  columns: EditableColumnSnapshot[];
  charset?: string;
  collation?: string;
}

const previewText = (
  language: AppLanguage | undefined,
  key: Parameters<typeof translate>[1],
  params?: Record<string, string | number | boolean | null | undefined>,
): string => translate(language || 'en', key, params);

const escapeSqlString = (value: string) => String(value || '').replace(/'/g, "''");

const stripIdentifierQuotes = unquoteSqlIdentifierPart;

const splitQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
  const raw = String(qualifiedName || '').trim();
  if (!raw) return { schemaName: '', objectName: '' };
  const idx = raw.lastIndexOf('.');
  if (idx <= 0 || idx >= raw.length - 1) return { schemaName: '', objectName: raw };
  return {
    schemaName: stripIdentifierQuotes(raw.substring(0, idx)),
    objectName: stripIdentifierQuotes(raw.substring(idx + 1)),
  };
};

const quoteIdentifierPart = (part: string, dbType: string): string => quoteSqlIdentifierPart(dbType, part);

const quoteIdentifierPath = (path: string, dbType: string): string => quoteSqlIdentifierPath(dbType, path);

const normalizeDefaultText = (value: unknown): string => String(value ?? '').trim();

const isKnownDefaultExpression = (trimmed: string): boolean => {
  if (!trimmed) return false;
  if (/^N?'.*'$/i.test(trimmed)) return true;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return true;
  if (/^(true|false|null)$/i.test(trimmed)) return true;
  if (/^(current_timestamp|current_date|current_time|localtimestamp|sysdate|systimestamp)$/i.test(trimmed)) return true;
  if (/^(now|uuid|newid|sysdatetime)\s*\(\s*\)$/i.test(trimmed)) return true;
  if (/^nextval\s*\(/i.test(trimmed) || /::/.test(trimmed)) return true;
  return false;
};

const formatDefaultExpression = (value: unknown, dbType: string): string => {
  const trimmed = normalizeDefaultText(value);
  if (!trimmed) return '';
  if (isKnownDefaultExpression(trimmed)) {
    if (/^(true|false|null)$/i.test(trimmed)) return trimmed.toUpperCase();
    if (/^(current_timestamp|current_date|current_time|localtimestamp|sysdate|systimestamp)$/i.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    return trimmed;
  }
  const prefix = isSqlServerDialect(dbType) ? 'N' : '';
  return `${prefix}'${escapeSqlString(trimmed)}'`;
};

const buildDefaultSql = (value: unknown, dbType: string): string => {
  const defaultValue = normalizeDefaultText(value);
  if (!defaultValue) return '';
  return `DEFAULT ${formatDefaultExpression(defaultValue, dbType)}`;
};

const definitionChanged = (curr: EditableColumnSnapshot, orig: EditableColumnSnapshot): boolean => (
  curr.type !== orig.type ||
  curr.nullable !== orig.nullable ||
  normalizeDefaultText(curr.default) !== normalizeDefaultText(orig.default) ||
  (curr.comment || '') !== (orig.comment || '') ||
  Boolean(curr.isAutoIncrement) !== Boolean(orig.isAutoIncrement)
);

const physicalDefinitionChanged = (curr: EditableColumnSnapshot, orig: EditableColumnSnapshot): boolean => (
  curr.type !== orig.type ||
  curr.nullable !== orig.nullable ||
  normalizeDefaultText(curr.default) !== normalizeDefaultText(orig.default) ||
  Boolean(curr.isAutoIncrement) !== Boolean(orig.isAutoIncrement)
);

const buildMySqlColumnDefinition = (column: EditableColumnSnapshot, dbType: string): string => {
  let extra = String(column.extra || '').trim();
  if (column.isAutoIncrement) {
    if (!extra.toLowerCase().includes('auto_increment')) {
      extra = `${extra} AUTO_INCREMENT`.trim();
    }
  } else {
    extra = extra.replace(/auto_increment/gi, '').trim();
  }
  const defaultSql = buildDefaultSql(column.default, dbType);
  return [
    quoteIdentifierPart(column.name, dbType),
    String(column.type || '').trim(),
    column.nullable === 'NO' ? 'NOT NULL' : 'NULL',
    defaultSql,
    extra,
    `COMMENT '${escapeSqlString(column.comment || '')}'`,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
};

const buildStandardColumnDefinition = (
  column: EditableColumnSnapshot,
  dbType: string,
  options: { includeNull?: boolean; includeIdentity?: boolean } = {},
): string => {
  const parts = [quoteIdentifierPart(column.name, dbType), String(column.type || '').trim()];
  if (options.includeIdentity && column.isAutoIncrement) {
    if (isSqlServerDialect(dbType)) {
      parts.push('IDENTITY(1,1)');
    } else if (isOracleLikeDialect(dbType)) {
      parts.push('GENERATED BY DEFAULT AS IDENTITY');
    }
  }
  const defaultSql = buildDefaultSql(column.default, dbType);
  if (defaultSql) parts.push(defaultSql);
  if (column.nullable === 'NO') {
    parts.push('NOT NULL');
  } else if (options.includeNull) {
    parts.push('NULL');
  }
  return parts.filter(Boolean).join(' ').trim();
};

const buildPgLikeColumnDefinition = (column: EditableColumnSnapshot, dbType: string): string => {
  const parts = [quoteIdentifierPart(column.name, dbType), String(column.type || '').trim()];
  const defaultSql = buildDefaultSql(column.default, dbType);
  if (defaultSql) parts.push(defaultSql);
  if (column.nullable === 'NO') parts.push('NOT NULL');
  return parts.join(' ').trim();
};

const buildColumnCommentSql = (tableRef: string, columnName: string, comment: string, dbType: string): string => {
  const columnRef = `${tableRef}.${quoteIdentifierPart(columnName, dbType)}`;
  const trimmed = String(comment || '').trim();
  if (!trimmed && isPgLikeDialect(dbType)) {
    return `COMMENT ON COLUMN ${columnRef} IS NULL;`;
  }
  return `COMMENT ON COLUMN ${columnRef} IS '${escapeSqlString(trimmed)}';`;
};

const buildSqlServerColumnCommentSql = (
  tableName: string,
  columnName: string,
  comment: string,
): string => {
  const { schemaName, objectName } = splitQualifiedName(tableName);
  const schema = escapeSqlString(schemaName || 'dbo');
  const table = escapeSqlString(objectName || tableName);
  const column = escapeSqlString(columnName);
  const value = escapeSqlString(comment || '');
  return `IF EXISTS (SELECT 1 FROM sys.extended_properties ep JOIN sys.tables t ON ep.major_id = t.object_id JOIN sys.schemas s ON t.schema_id = s.schema_id JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id WHERE ep.name = N'MS_Description' AND s.name = N'${schema}' AND t.name = N'${table}' AND c.name = N'${column}') BEGIN EXEC sp_updateextendedproperty @name = N'MS_Description', @value = N'${value}', @level0type = N'SCHEMA', @level0name = N'${schema}', @level1type = N'TABLE', @level1name = N'${table}', @level2type = N'COLUMN', @level2name = N'${column}' END ELSE BEGIN EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'${value}', @level0type = N'SCHEMA', @level0name = N'${schema}', @level1type = N'TABLE', @level1name = N'${table}', @level2type = N'COLUMN', @level2name = N'${column}' END;`;
};

const buildMySqlAlterPreviewSql = (input: BuildAlterTablePreviewInput, dbType: string): string => {
  const tableName = quoteIdentifierPath(input.tableName, dbType);
  const alters: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      alters.push(`DROP COLUMN ${quoteIdentifierPart(orig.name, dbType)}`);
    }
  });

  input.columns.forEach((curr, index) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    const prevCol = index > 0 ? input.columns[index - 1] : null;
    const positionSql = prevCol ? `AFTER ${quoteIdentifierPart(prevCol.name, dbType)}` : 'FIRST';
    const colDef = buildMySqlColumnDefinition(curr, dbType);

    if (!orig) {
      alters.push(`ADD COLUMN ${colDef} ${positionSql}`.trim());
      return;
    }

    if (curr.name !== orig.name) {
      alters.push(`CHANGE COLUMN ${quoteIdentifierPart(orig.name, dbType)} ${colDef} ${positionSql}`.trim());
      return;
    }

    if (definitionChanged(curr, orig)) {
      alters.push(`MODIFY COLUMN ${colDef} ${positionSql}`.trim());
    }
  });

  const origPKKeys = input.originalColumns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const newPKKeys = input.columns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const keysChanged = origPKKeys.length !== newPKKeys.length || !origPKKeys.every((key) => newPKKeys.includes(key));
  if (keysChanged) {
    if (origPKKeys.length > 0) alters.push('DROP PRIMARY KEY');
    if (newPKKeys.length > 0) {
      const pkNames = input.columns
        .filter((col) => col.key === 'PRI')
        .map((col) => quoteIdentifierPart(col.name, dbType))
        .join(', ');
      alters.push(`ADD PRIMARY KEY (${pkNames})`);
    }
  }

  return alters.length === 0 ? '' : `ALTER TABLE ${tableName}\n${alters.join(',\n')};`;
};

const buildPgLikeAlterPreviewSql = (input: BuildAlterTablePreviewInput, dbType: string): string => {
  const tableParts = splitQualifiedName(input.tableName);
  const baseTableName = tableParts.objectName || stripIdentifierQuotes(input.tableName);
  const tableRef = quoteIdentifierPath(input.tableName, dbType);
  const statements: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP COLUMN ${quoteIdentifierPart(orig.name, dbType)};`);
    }
  });

  input.columns.forEach((curr) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    if (!orig) {
      statements.push(`ALTER TABLE ${tableRef}\nADD COLUMN ${buildPgLikeColumnDefinition(curr, dbType)};`);
      if (String(curr.comment || '').trim()) statements.push(buildColumnCommentSql(tableRef, curr.name, curr.comment || '', dbType));
      return;
    }

    let currentName = orig.name;
    if (curr.name !== orig.name) {
      statements.push(`ALTER TABLE ${tableRef}\nRENAME COLUMN ${quoteIdentifierPart(orig.name, dbType)} TO ${quoteIdentifierPart(curr.name, dbType)};`);
      currentName = curr.name;
    }

    if (curr.type !== orig.type) {
      statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, dbType)} TYPE ${curr.type};`);
    }

    const currDefault = normalizeDefaultText(curr.default);
    const origDefault = normalizeDefaultText(orig.default);
    if (currDefault !== origDefault) {
      if (currDefault) {
        statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, dbType)} SET DEFAULT ${formatDefaultExpression(currDefault, dbType)};`);
      } else {
        statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, dbType)} DROP DEFAULT;`);
      }
    }

    if (curr.nullable !== orig.nullable) {
      statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, dbType)} ${curr.nullable === 'NO' ? 'SET NOT NULL' : 'DROP NOT NULL'};`);
    }

    if ((curr.comment || '') !== (orig.comment || '')) {
      statements.push(buildColumnCommentSql(tableRef, currentName, curr.comment || '', dbType));
    }
  });

  const origPKKeys = input.originalColumns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const newPKKeys = input.columns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const keysChanged = origPKKeys.length !== newPKKeys.length || !origPKKeys.every((key) => newPKKeys.includes(key));
  if (keysChanged) {
    if (origPKKeys.length > 0) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP CONSTRAINT IF EXISTS ${quoteIdentifierPart(`${baseTableName}_pkey`, dbType)};`);
    }
    if (newPKKeys.length > 0) {
      const pkNames = input.columns
        .filter((col) => col.key === 'PRI')
        .map((col) => quoteIdentifierPart(col.name, dbType))
        .join(', ');
      statements.push(`ALTER TABLE ${tableRef}\nADD PRIMARY KEY (${pkNames});`);
    }
  }

  return statements.join('\n');
};

const buildOracleLikeAlterPreviewSql = (input: BuildAlterTablePreviewInput, dbType: string): string => {
  const tableRef = quoteIdentifierPath(input.tableName, dbType);
  const statements: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP COLUMN ${quoteIdentifierPart(orig.name, dbType)};`);
    }
  });

  input.columns.forEach((curr) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    if (!orig) {
      statements.push(`ALTER TABLE ${tableRef}\nADD (${buildStandardColumnDefinition(curr, dbType, { includeIdentity: true })});`);
      if (String(curr.comment || '').trim()) statements.push(buildColumnCommentSql(tableRef, curr.name, curr.comment || '', dbType));
      return;
    }

    let currentName = orig.name;
    if (curr.name !== orig.name) {
      statements.push(`ALTER TABLE ${tableRef}\nRENAME COLUMN ${quoteIdentifierPart(orig.name, dbType)} TO ${quoteIdentifierPart(curr.name, dbType)};`);
      currentName = curr.name;
    }

    if (physicalDefinitionChanged(curr, orig)) {
      statements.push(`ALTER TABLE ${tableRef}\nMODIFY (${buildStandardColumnDefinition({ ...curr, name: currentName }, dbType, { includeIdentity: true })});`);
    }

    if ((curr.comment || '') !== (orig.comment || '')) {
      statements.push(buildColumnCommentSql(tableRef, currentName, curr.comment || '', dbType));
    }
  });

  const origPKKeys = input.originalColumns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const newPKKeys = input.columns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const keysChanged = origPKKeys.length !== newPKKeys.length || !origPKKeys.every((key) => newPKKeys.includes(key));
  if (keysChanged) {
    if (origPKKeys.length > 0) statements.push(`ALTER TABLE ${tableRef}\nDROP PRIMARY KEY;`);
    if (newPKKeys.length > 0) {
      const pkNames = input.columns.filter((col) => col.key === 'PRI').map((col) => quoteIdentifierPart(col.name, dbType)).join(', ');
      statements.push(`ALTER TABLE ${tableRef}\nADD PRIMARY KEY (${pkNames});`);
    }
  }

  return statements.join('\n');
};

const buildSqlServerDefaultDropBatch = (tableName: string, columnName: string): string => {
  const { schemaName, objectName } = splitQualifiedName(tableName);
  const schema = escapeSqlString(schemaName || 'dbo');
  const table = escapeSqlString(objectName || tableName);
  const column = escapeSqlString(columnName);
  const tableRef = quoteIdentifierPath(`${schemaName || 'dbo'}.${objectName || tableName}`, 'sqlserver');
  return `DECLARE @javanavi_df nvarchar(128); SELECT @javanavi_df = dc.name FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id JOIN sys.tables t ON c.object_id = t.object_id JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = N'${schema}' AND t.name = N'${table}' AND c.name = N'${column}'; IF @javanavi_df IS NOT NULL EXEC(N'ALTER TABLE ${tableRef} DROP CONSTRAINT ' + QUOTENAME(@javanavi_df));`;
};

const buildSqlServerAlterPreviewSql = (input: BuildAlterTablePreviewInput): string => {
  const dbType = 'sqlserver';
  const tableRef = quoteIdentifierPath(input.tableName, dbType);
  const statements: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP COLUMN ${quoteIdentifierPart(orig.name, dbType)};`);
    }
  });

  input.columns.forEach((curr) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    if (!orig) {
      statements.push(`ALTER TABLE ${tableRef}\nADD ${buildStandardColumnDefinition(curr, dbType, { includeNull: true, includeIdentity: true })};`);
      if (String(curr.comment || '').trim()) statements.push(buildSqlServerColumnCommentSql(input.tableName, curr.name, curr.comment || ''));
      return;
    }

    let currentName = orig.name;
    if (curr.name !== orig.name) {
      const plainTablePath = unquoteSqlIdentifierPath(input.tableName);
      statements.push(`EXEC sp_rename '${escapeSqlString(`${plainTablePath}.${orig.name}`)}', '${escapeSqlString(curr.name)}', 'COLUMN';`);
      currentName = curr.name;
    }

    if (curr.type !== orig.type || curr.nullable !== orig.nullable || Boolean(curr.isAutoIncrement) !== Boolean(orig.isAutoIncrement)) {
      statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${buildStandardColumnDefinition({ ...curr, name: currentName, default: '' }, dbType, { includeNull: true, includeIdentity: false })};`);
    }

    const currDefault = normalizeDefaultText(curr.default);
    const origDefault = normalizeDefaultText(orig.default);
    if (currDefault !== origDefault) {
      statements.push(buildSqlServerDefaultDropBatch(input.tableName, currentName));
      if (currDefault) {
        statements.push(`ALTER TABLE ${tableRef}\nADD DEFAULT ${formatDefaultExpression(currDefault, dbType)} FOR ${quoteIdentifierPart(currentName, dbType)};`);
      }
    }

    if ((curr.comment || '') !== (orig.comment || '')) {
      statements.push(buildSqlServerColumnCommentSql(input.tableName, currentName, curr.comment || ''));
    }
  });

  const origPKKeys = input.originalColumns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const newPKKeys = input.columns.filter((col) => col.key === 'PRI').map((col) => col._key);
  const keysChanged = origPKKeys.length !== newPKKeys.length || !origPKKeys.every((key) => newPKKeys.includes(key));
  if (keysChanged) {
    const { objectName } = splitQualifiedName(input.tableName);
    const constraintName = quoteIdentifierPart(`PK_${objectName || 'table'}`, dbType);
    if (origPKKeys.length > 0) {
      statements.push(`-- ${previewText(input.language, 'designer.sqlPreview.sqlServerDropPkNotice')}`);
    }
    if (newPKKeys.length > 0) {
      const pkNames = input.columns.filter((col) => col.key === 'PRI').map((col) => quoteIdentifierPart(col.name, dbType)).join(', ');
      statements.push(`ALTER TABLE ${tableRef}\nADD CONSTRAINT ${constraintName} PRIMARY KEY (${pkNames});`);
    }
  }

  return statements.join('\n');
};

const buildSqliteAlterPreviewSql = (input: BuildAlterTablePreviewInput): string => {
  const dbType = 'sqlite';
  const tableRef = quoteIdentifierPath(input.tableName, dbType);
  const statements: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP COLUMN ${quoteIdentifierPart(orig.name, dbType)};`);
    }
  });

  input.columns.forEach((curr) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    if (!orig) {
      statements.push(`ALTER TABLE ${tableRef}\nADD COLUMN ${buildStandardColumnDefinition(curr, dbType)};`);
      return;
    }

    let currentName = orig.name;
    if (curr.name !== orig.name) {
      statements.push(`ALTER TABLE ${tableRef}\nRENAME COLUMN ${quoteIdentifierPart(orig.name, dbType)} TO ${quoteIdentifierPart(curr.name, dbType)};`);
      currentName = curr.name;
    }
    if (physicalDefinitionChanged(curr, orig) || (curr.comment || '') !== (orig.comment || '')) {
      statements.push(`-- ${previewText(input.language, 'designer.sqlPreview.sqliteColumnAlterNotice', { name: currentName })}`);
    }
  });

  return statements.join('\n');
};

const buildDuckDbAlterPreviewSql = (input: BuildAlterTablePreviewInput): string => {
  const dbType = 'duckdb';
  const tableRef = quoteIdentifierPath(input.tableName, dbType);
  const statements: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP COLUMN ${quoteIdentifierPart(orig.name, dbType)};`);
    }
  });

  input.columns.forEach((curr) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    if (!orig) {
      statements.push(`ALTER TABLE ${tableRef}\nADD COLUMN ${buildStandardColumnDefinition(curr, dbType)};`);
      return;
    }

    let currentName = orig.name;
    if (curr.name !== orig.name) {
      statements.push(`ALTER TABLE ${tableRef}\nRENAME COLUMN ${quoteIdentifierPart(orig.name, dbType)} TO ${quoteIdentifierPart(curr.name, dbType)};`);
      currentName = curr.name;
    }
    if (curr.type !== orig.type) {
      statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, dbType)} SET DATA TYPE ${curr.type};`);
    }
    const currDefault = normalizeDefaultText(curr.default);
    const origDefault = normalizeDefaultText(orig.default);
    if (currDefault !== origDefault) {
      if (currDefault) {
        statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, dbType)} SET DEFAULT ${formatDefaultExpression(currDefault, dbType)};`);
      } else {
        statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, dbType)} DROP DEFAULT;`);
      }
    }
    if (curr.nullable !== orig.nullable) {
      statements.push(`ALTER TABLE ${tableRef}\nALTER COLUMN ${quoteIdentifierPart(currentName, dbType)} ${curr.nullable === 'NO' ? 'SET NOT NULL' : 'DROP NOT NULL'};`);
    }
    if ((curr.comment || '') !== (orig.comment || '')) {
      statements.push(`-- ${previewText(input.language, 'designer.sqlPreview.duckdbCommentNotice', { name: currentName })}`);
    }
  });

  return statements.join('\n');
};

const buildLimitedBacktickAlterPreviewSql = (input: BuildAlterTablePreviewInput, dbType: string, label: string): string => {
  const tableRef = quoteIdentifierPath(input.tableName, dbType);
  const statements: string[] = [];

  input.originalColumns.forEach((orig) => {
    if (!input.columns.find((col) => col._key === orig._key)) {
      statements.push(`ALTER TABLE ${tableRef}\nDROP COLUMN ${quoteIdentifierPart(orig.name, dbType)};`);
    }
  });

  input.columns.forEach((curr) => {
    const orig = input.originalColumns.find((col) => col._key === curr._key);
    if (!orig) {
      statements.push(`ALTER TABLE ${tableRef}\nADD COLUMN ${quoteIdentifierPart(curr.name, dbType)} ${curr.type};`);
      if (curr.nullable === 'NO' || normalizeDefaultText(curr.default) || String(curr.comment || '').trim()) {
        statements.push(`-- ${previewText(input.language, 'designer.sqlPreview.limitedDialectNotice', { label })}`);
      }
      return;
    }

    let currentName = orig.name;
    if (curr.name !== orig.name) {
      statements.push(`ALTER TABLE ${tableRef}\nRENAME COLUMN ${quoteIdentifierPart(orig.name, dbType)} TO ${quoteIdentifierPart(curr.name, dbType)};`);
      currentName = curr.name;
    }
    if (curr.type !== orig.type) {
      statements.push(`ALTER TABLE ${tableRef}\nMODIFY COLUMN ${quoteIdentifierPart(currentName, dbType)} ${curr.type};`);
    }
    if (
      curr.nullable !== orig.nullable ||
      normalizeDefaultText(curr.default) !== normalizeDefaultText(orig.default) ||
      (curr.comment || '') !== (orig.comment || '') ||
      Boolean(curr.isAutoIncrement) !== Boolean(orig.isAutoIncrement)
    ) {
      statements.push(`-- ${previewText(input.language, 'designer.sqlPreview.limitedDialectNotice', { label })}`);
    }
  });

  return statements.join('\n');
};

export const buildAlterTablePreviewSql = (input: BuildAlterTablePreviewInput): string => {
  const dbType = resolveSqlDialect(input.dbType);
  if (isPgLikeDialect(dbType)) return buildPgLikeAlterPreviewSql({ ...input, dbType }, dbType);
  if (isOracleLikeDialect(dbType)) return buildOracleLikeAlterPreviewSql({ ...input, dbType }, dbType);
  if (isSqlServerDialect(dbType)) return buildSqlServerAlterPreviewSql({ ...input, dbType });
  if (dbType === 'sqlite') return buildSqliteAlterPreviewSql({ ...input, dbType });
  if (dbType === 'duckdb') return buildDuckDbAlterPreviewSql({ ...input, dbType });
  if (dbType === 'clickhouse') return buildLimitedBacktickAlterPreviewSql({ ...input, dbType }, dbType, 'ClickHouse');
  if (dbType === 'tdengine') return buildLimitedBacktickAlterPreviewSql({ ...input, dbType }, dbType, 'TDengine');
  if (isMysqlFamilyDialect(dbType)) return buildMySqlAlterPreviewSql({ ...input, dbType }, dbType);
  return buildPgLikeAlterPreviewSql({ ...input, dbType }, dbType);
};

export const hasAlterTableDraftChanges = (input: BuildAlterTablePreviewInput): boolean =>
  buildAlterTablePreviewSql(input).trim().length > 0;

const buildCreateTableColumnDefinition = (column: EditableColumnSnapshot, dbType: string): string => {
  if (isMysqlFamilyDialect(dbType)) {
    return buildMySqlColumnDefinition(column, dbType);
  }
  if (isOracleLikeDialect(dbType)) {
    return buildStandardColumnDefinition(column, dbType, { includeIdentity: true });
  }
  if (isSqlServerDialect(dbType)) {
    return buildStandardColumnDefinition(column, dbType, { includeNull: true, includeIdentity: true });
  }
  if (dbType === 'clickhouse' || dbType === 'tdengine') {
    return [quoteIdentifierPart(column.name, dbType), String(column.type || '').trim()].join(' ');
  }
  return buildStandardColumnDefinition(column, dbType);
};

const buildCreateColumnComments = (tableRef: string, input: BuildCreateTablePreviewInput, dbType: string): string[] => (
  input.columns
    .filter((column) => String(column.comment || '').trim())
    .map((column) => {
      if (isSqlServerDialect(dbType)) {
        return buildSqlServerColumnCommentSql(input.tableName, column.name, column.comment || '');
      }
      if (isPgLikeDialect(dbType) || isOracleLikeDialect(dbType)) {
        return buildColumnCommentSql(tableRef, column.name, column.comment || '', dbType);
      }
      return '';
    })
    .filter(Boolean)
);

export const buildCreateTablePreviewSql = (input: BuildCreateTablePreviewInput): string => {
  const dbType = resolveSqlDialect(input.dbType);
  const tableRef = quoteIdentifierPath(input.tableName, dbType);
  const colDefs = input.columns.map((column) => buildCreateTableColumnDefinition(column, dbType));
  const pkColumns = input.columns.filter((column) => column.key === 'PRI');
  if (pkColumns.length > 0) {
    const pkNames = pkColumns.map((column) => quoteIdentifierPart(column.name, dbType)).join(', ');
    colDefs.push(`PRIMARY KEY (${pkNames})`);
  }

  const createSql = `CREATE TABLE ${tableRef} (\n  ${colDefs.join(',\n  ')}\n)`;
  const comments = buildCreateColumnComments(tableRef, input, dbType);

  if (dbType === 'mysql' || dbType === 'mariadb') {
    const charset = String(input.charset || '').trim();
    const collation = String(input.collation || '').trim();
    const charsetSql = charset ? ` DEFAULT CHARSET=${charset}` : '';
    const collationSql = collation ? ` COLLATE=${collation}` : '';
    return `${createSql} ENGINE=InnoDB${charsetSql}${collationSql};`;
  }

  if (dbType === 'clickhouse') {
    return `${createSql}\nENGINE = MergeTree\nORDER BY tuple();`;
  }

  const suffixComments = comments.length > 0 ? `\n${comments.join('\n')}` : '';
  if (dbType === 'tdengine' && !input.columns.some((column) => /^timestamp$/i.test(String(column.type || '').trim()))) {
    return `${createSql};\n-- ${previewText(input.language, 'designer.sqlPreview.tdengineTimestampNotice')}${suffixComments}`;
  }

  if (isBacktickIdentifierDialect(dbType) && dbType !== 'mysql' && dbType !== 'mariadb') {
    return `${createSql};${suffixComments}`;
  }

  return `${createSql};${suffixComments}`;
};
