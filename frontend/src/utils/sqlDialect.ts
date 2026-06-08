import { translate, type AppLanguage, type I18nKey } from '../i18n';

export type ColumnTypeOption = { value: string };

export type SqlFunctionCompletion = {
  name: string;
  detail: string;
};

type SqlFunctionCompletionDefinition = {
  name: string;
  detailKey: I18nKey;
};

export type SqlDialect =
  | 'mysql'
  | 'mariadb'
  | 'diros'
  | 'sphinx'
  | 'postgres'
  | 'kingbase'
  | 'highgo'
  | 'vastbase'
  | 'oracle'
  | 'dameng'
  | 'sqlserver'
  | 'sqlite'
  | 'duckdb'
  | 'clickhouse'
  | 'tdengine'
  | 'mongodb'
  | 'redis'
  | 'unknown'
  | string;

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const optionValues = (values: string[]): ColumnTypeOption[] => values.map((value) => ({ value }));

const normalizeRawDialect = (value: string): string => String(value || '').trim().toLowerCase();

export const resolveSqlDialect = (rawType: string, rawDriver = ''): SqlDialect => {
  const normalized = normalizeRawDialect(rawType);
  const driver = normalizeRawDialect(rawDriver);
  const source = normalized === 'custom' ? driver : normalized;

  if (!source) return 'unknown';

  switch (source) {
    case 'postgresql':
    case 'postgres':
    case 'pg':
    case 'pq':
    case 'pgx':
      return 'postgres';
    case 'mssql':
    case 'sql_server':
    case 'sql-server':
      return 'sqlserver';
    case 'doris':
    case 'diros':
      return 'diros';
    case 'dm':
    case 'dm8':
    case 'dameng':
      return 'dameng';
    case 'sqlite3':
    case 'sqlite':
      return 'sqlite';
    case 'sphinxql':
      return 'sphinx';
    case 'kingbase8':
    case 'kingbasees':
    case 'kingbasev8':
      return 'kingbase';
    case 'mariadb':
    case 'mysql':
    case 'sphinx':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
    case 'oracle':
    case 'duckdb':
    case 'clickhouse':
    case 'tdengine':
    case 'mongodb':
    case 'redis':
      return source;
    default:
      break;
  }

  if (source.includes('postgres')) return 'postgres';
  if (source.includes('mariadb')) return 'mariadb';
  if (source.includes('mysql')) return 'mysql';
  if (source.includes('doris') || source.includes('diros')) return 'diros';
  if (source.includes('sphinx')) return 'sphinx';
  if (source.includes('kingbase')) return 'kingbase';
  if (source.includes('highgo')) return 'highgo';
  if (source.includes('vastbase')) return 'vastbase';
  if (source.includes('oracle')) return 'oracle';
  if (source.includes('dameng') || source.includes('dm8')) return 'dameng';
  if (source.includes('sqlite')) return 'sqlite';
  if (source.includes('duckdb')) return 'duckdb';
  if (source.includes('clickhouse')) return 'clickhouse';
  if (source.includes('tdengine')) return 'tdengine';
  if (source.includes('sqlserver') || source.includes('mssql')) return 'sqlserver';

  return source;
};

export const isMysqlFamilyDialect = (dbType: string): boolean => (
  ['mysql', 'mariadb', 'diros', 'sphinx', 'tidb', 'oceanbase', 'starrocks'].includes(resolveSqlDialect(dbType))
);

export const isPgLikeDialect = (dbType: string): boolean => (
  ['postgres', 'kingbase', 'highgo', 'vastbase'].includes(resolveSqlDialect(dbType))
);

export const isOracleLikeDialect = (dbType: string): boolean => (
  ['oracle', 'dameng', 'dm'].includes(resolveSqlDialect(dbType))
);

export const isSqlServerDialect = (dbType: string): boolean => resolveSqlDialect(dbType) === 'sqlserver';

export const isBacktickIdentifierDialect = (dbType: string): boolean => (
  isMysqlFamilyDialect(dbType) || ['clickhouse', 'tdengine'].includes(resolveSqlDialect(dbType))
);

const stripIdentifierQuotes = (part: string): string => {
  const text = String(part || '').trim();
  if (!text) return '';
  if ((text.startsWith('`') && text.endsWith('`')) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).trim();
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).replace(/]]/g, ']').trim();
  }
  return text;
};

const escapeBacktickIdentifier = (value: string) => String(value || '').replace(/`/g, '``');
const escapeDoubleQuoteIdentifier = (value: string) => String(value || '').replace(/"/g, '""');
const escapeBracketIdentifier = (value: string) => String(value || '').replace(/]/g, ']]');

const needsPgLikeQuote = (ident: string): boolean => !/^[a-z_][a-z0-9_]*$/.test(ident);

export const unquoteSqlIdentifierPart = stripIdentifierQuotes;

export const unquoteSqlIdentifierPath = (path: string): string => (
  String(path || '')
    .trim()
    .split('.')
    .map((part) => stripIdentifierQuotes(part))
    .filter(Boolean)
    .join('.')
);

export const quoteSqlIdentifierPart = (dbType: string, part: string): string => {
  const ident = stripIdentifierQuotes(part);
  if (!ident) return '';
  const dialect = resolveSqlDialect(dbType);

  if (isBacktickIdentifierDialect(dialect)) {
    return `\`${escapeBacktickIdentifier(ident)}\``;
  }
  if (isSqlServerDialect(dialect)) {
    return `[${escapeBracketIdentifier(ident)}]`;
  }
  if (isPgLikeDialect(dialect)) {
    return needsPgLikeQuote(ident) ? `"${escapeDoubleQuoteIdentifier(ident)}"` : ident;
  }
  return `"${escapeDoubleQuoteIdentifier(ident)}"`;
};

export const quoteSqlIdentifierPath = (dbType: string, path: string): string => (
  String(path || '')
    .trim()
    .split('.')
    .map((part) => stripIdentifierQuotes(part))
    .filter(Boolean)
    .map((part) => quoteSqlIdentifierPart(dbType, part))
    .join('.')
);

const MYSQL_TYPES = optionValues([
  'tinyint',
  'tinyint(1)',
  'smallint',
  'mediumint',
  'int',
  'bigint',
  'float',
  'double',
  'decimal(10,2)',
  'char(50)',
  'varchar(255)',
  'tinytext',
  'text',
  'mediumtext',
  'longtext',
  'binary(255)',
  'varbinary(255)',
  'tinyblob',
  'blob',
  'mediumblob',
  'longblob',
  'date',
  'time',
  'datetime',
  'timestamp',
  'year',
  'json',
  'enum',
  'set',
  'bit(1)',
]);

const PG_TYPES = optionValues([
  'smallint',
  'integer',
  'bigint',
  'real',
  'double precision',
  'numeric(10,2)',
  'serial',
  'bigserial',
  'char(50)',
  'varchar(255)',
  'text',
  'boolean',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'interval',
  'bytea',
  'json',
  'jsonb',
  'uuid',
  'inet',
  'cidr',
  'macaddr',
  'xml',
  'int4range',
  'tsquery',
  'tsvector',
]);

const SQLSERVER_TYPES = optionValues([
  'tinyint',
  'smallint',
  'int',
  'bigint',
  'float',
  'real',
  'decimal(10,2)',
  'numeric(10,2)',
  'money',
  'smallmoney',
  'char(50)',
  'varchar(255)',
  'varchar(max)',
  'nchar(50)',
  'nvarchar(255)',
  'nvarchar(max)',
  'text',
  'ntext',
  'date',
  'time',
  'datetime',
  'datetime2',
  'datetimeoffset',
  'smalldatetime',
  'binary(255)',
  'varbinary(255)',
  'varbinary(max)',
  'image',
  'bit',
  'uniqueidentifier',
  'xml',
]);

const SQLITE_TYPES = optionValues(['INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC']);

const ORACLE_TYPES = optionValues([
  'NUMBER(10)',
  'NUMBER(10,2)',
  'FLOAT',
  'BINARY_FLOAT',
  'BINARY_DOUBLE',
  'CHAR(50)',
  'VARCHAR2(255)',
  'NVARCHAR2(255)',
  'CLOB',
  'NCLOB',
  'BLOB',
  'DATE',
  'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE',
  'RAW(255)',
  'LONG RAW',
  'XMLTYPE',
]);

const DAMENG_TYPES = optionValues([
  'INT',
  'BIGINT',
  'NUMBER(10)',
  'NUMBER(10,2)',
  'DECIMAL(10,2)',
  'CHAR(50)',
  'VARCHAR(255)',
  'VARCHAR2(255)',
  'NVARCHAR2(255)',
  'TEXT',
  'CLOB',
  'BLOB',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'BIT',
]);

const DORIS_TYPES = optionValues([
  'BOOLEAN',
  'TINYINT',
  'SMALLINT',
  'INT',
  'BIGINT',
  'LARGEINT',
  'FLOAT',
  'DOUBLE',
  'DECIMAL(10,2)',
  'CHAR(50)',
  'VARCHAR(255)',
  'STRING',
  'DATE',
  'DATETIME',
  'JSON',
  'HLL',
  'BITMAP',
  'ARRAY<INT>',
  'MAP<STRING,STRING>',
  'STRUCT<name:STRING>',
]);

const SPHINX_TYPES = optionValues([
  'text',
  'string',
  'integer',
  'bigint',
  'float',
  'bool',
  'timestamp',
  'json',
]);

const CLICKHOUSE_TYPES = optionValues([
  'Int8',
  'UInt8',
  'Int16',
  'UInt16',
  'Int32',
  'UInt32',
  'Int64',
  'UInt64',
  'Float32',
  'Float64',
  'Decimal(10,2)',
  'String',
  'FixedString(32)',
  'Date',
  'Date32',
  'DateTime',
  'DateTime64(3)',
  'UUID',
  'IPv4',
  'IPv6',
  'Array(String)',
  'Nullable(String)',
  'LowCardinality(String)',
  "Enum8('A'=1)",
]);

const TDENGINE_TYPES = optionValues([
  'TIMESTAMP',
  'BOOL',
  'TINYINT',
  'SMALLINT',
  'INT',
  'BIGINT',
  'FLOAT',
  'DOUBLE',
  'BINARY(255)',
  'NCHAR(255)',
  'VARBINARY(255)',
  'JSON',
  'GEOMETRY',
]);

const DUCKDB_TYPES = optionValues([
  'BOOLEAN',
  'TINYINT',
  'SMALLINT',
  'INTEGER',
  'BIGINT',
  'UTINYINT',
  'USMALLINT',
  'UINTEGER',
  'UBIGINT',
  'REAL',
  'DOUBLE',
  'DECIMAL(10,2)',
  'VARCHAR',
  'BLOB',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'INTERVAL',
  'UUID',
  'JSON',
  'STRUCT',
  'LIST',
  'MAP',
]);

const COMMON_TYPES = optionValues(['int', 'varchar(255)', 'text', 'datetime', 'decimal(10,2)', 'bigint', 'json']);

export const resolveColumnTypeOptions = (dbType: string): ColumnTypeOption[] => {
  const dialect = resolveSqlDialect(dbType);
  if (dialect === 'mariadb' || dialect === 'mysql') return MYSQL_TYPES;
  if (dialect === 'diros') return DORIS_TYPES;
  if (dialect === 'sphinx') return SPHINX_TYPES;
  if (isPgLikeDialect(dialect)) return PG_TYPES;
  if (dialect === 'oracle') return ORACLE_TYPES;
  if (dialect === 'dameng') return DAMENG_TYPES;
  if (dialect === 'sqlserver') return SQLSERVER_TYPES;
  if (dialect === 'sqlite') return SQLITE_TYPES;
  if (dialect === 'duckdb') return DUCKDB_TYPES;
  if (dialect === 'clickhouse') return CLICKHOUSE_TYPES;
  if (dialect === 'tdengine') return TDENGINE_TYPES;
  return COMMON_TYPES;
};

const COMMON_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'LEFT', 'RIGHT',
  'INNER', 'OUTER', 'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'AS', 'AND', 'OR', 'NOT',
  'NULL', 'IS', 'IN', 'VALUES', 'SET', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD',
  'COLUMN', 'KEY', 'PRIMARY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT',
  'COMMENT', 'EXPLAIN', 'DISTINCT', 'UNION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
];

const MYSQL_KEYWORDS = [
  'LIMIT', 'OFFSET', 'MODIFY', 'CHANGE', 'AUTO_INCREMENT', 'SHOW', 'DESCRIBE',
  'DESC', 'ENGINE', 'CHARSET', 'COLLATE', 'REPLACE', 'DUPLICATE KEY', 'LOCK',
];

const PG_KEYWORDS = [
  'LIMIT', 'OFFSET', 'RETURNING', 'SERIAL', 'BIGSERIAL', 'BOOLEAN', 'JSONB',
  'ILIKE', 'RENAME', 'TYPE', 'CASCADE', 'RESTRICT', 'ONLY',
];

const ORACLE_KEYWORDS = [
  'ROWNUM', 'FETCH', 'FIRST', 'ROWS', 'ONLY', 'VARCHAR2', 'NVARCHAR2', 'NUMBER',
  'DATE', 'TIMESTAMP', 'CLOB', 'BLOB', 'SEQUENCE', 'SYNONYM', 'MERGE', 'MINUS',
  'CONNECT BY', 'START WITH', 'MODIFY', 'RENAME',
];

const SQLSERVER_KEYWORDS = [
  'TOP', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY', 'IDENTITY', 'NVARCHAR',
  'DATETIME2', 'BIT', 'GO', 'EXEC', 'PROCEDURE', 'WITH', 'NOLOCK', 'MERGE',
];

const SQLITE_KEYWORDS = ['LIMIT', 'OFFSET', 'AUTOINCREMENT', 'PRAGMA', 'WITHOUT', 'ROWID', 'RENAME'];

const DUCKDB_KEYWORDS = ['LIMIT', 'OFFSET', 'SAMPLE', 'QUALIFY', 'STRUCT', 'LIST', 'MAP', 'JSON', 'UNNEST'];

const CLICKHOUSE_KEYWORDS = [
  'LIMIT', 'OFFSET', 'FORMAT', 'ENGINE', 'PARTITION', 'ORDER BY', 'PRIMARY KEY',
  'SAMPLE', 'MATERIALIZED', 'ALIAS', 'SETTINGS', 'TTL', 'CODEC',
];

const TDENGINE_KEYWORDS = ['LIMIT', 'SLIMIT', 'SOFFSET', 'TAGS', 'USING', 'INTERVAL', 'FILL', 'PARTITION BY'];

export const resolveSqlKeywords = (dbType: string): string[] => {
  const dialect = resolveSqlDialect(dbType);
  if (isMysqlFamilyDialect(dialect)) return unique([...COMMON_KEYWORDS, ...MYSQL_KEYWORDS]);
  if (isPgLikeDialect(dialect)) return unique([...COMMON_KEYWORDS, ...PG_KEYWORDS]);
  if (isOracleLikeDialect(dialect)) return unique([...COMMON_KEYWORDS, ...ORACLE_KEYWORDS]);
  if (dialect === 'sqlserver') return unique([...COMMON_KEYWORDS, ...SQLSERVER_KEYWORDS]);
  if (dialect === 'sqlite') return unique([...COMMON_KEYWORDS, ...SQLITE_KEYWORDS]);
  if (dialect === 'duckdb') return unique([...COMMON_KEYWORDS, ...DUCKDB_KEYWORDS]);
  if (dialect === 'clickhouse') return unique([...COMMON_KEYWORDS, ...CLICKHOUSE_KEYWORDS]);
  if (dialect === 'tdengine') return unique([...COMMON_KEYWORDS, ...TDENGINE_KEYWORDS]);
  return COMMON_KEYWORDS;
};

const fn = (name: string, detailKey: I18nKey): SqlFunctionCompletionDefinition => ({ name, detailKey });

const COMMON_FUNCTIONS = [
  fn('COUNT', 'sqlFunction.common.count.detail'),
  fn('SUM', 'sqlFunction.common.sum.detail'),
  fn('AVG', 'sqlFunction.common.avg.detail'),
  fn('MAX', 'sqlFunction.common.max.detail'),
  fn('MIN', 'sqlFunction.common.min.detail'),
  fn('CONCAT', 'sqlFunction.common.concat.detail'),
  fn('SUBSTRING', 'sqlFunction.common.substring.detail'),
  fn('SUBSTR', 'sqlFunction.common.substr.detail'),
  fn('LENGTH', 'sqlFunction.common.length.detail'),
  fn('UPPER', 'sqlFunction.common.upper.detail'),
  fn('LOWER', 'sqlFunction.common.lower.detail'),
  fn('TRIM', 'sqlFunction.common.trim.detail'),
  fn('LTRIM', 'sqlFunction.common.ltrim.detail'),
  fn('RTRIM', 'sqlFunction.common.rtrim.detail'),
  fn('REPLACE', 'sqlFunction.common.replace.detail'),
  fn('ABS', 'sqlFunction.common.abs.detail'),
  fn('CEIL', 'sqlFunction.common.ceil.detail'),
  fn('CEILING', 'sqlFunction.common.ceiling.detail'),
  fn('FLOOR', 'sqlFunction.common.floor.detail'),
  fn('ROUND', 'sqlFunction.common.round.detail'),
  fn('MOD', 'sqlFunction.common.mod.detail'),
  fn('POWER', 'sqlFunction.common.power.detail'),
  fn('SQRT', 'sqlFunction.common.sqrt.detail'),
  fn('LOG', 'sqlFunction.common.log.detail'),
  fn('EXP', 'sqlFunction.common.exp.detail'),
  fn('COALESCE', 'sqlFunction.common.coalesce.detail'),
  fn('NULLIF', 'sqlFunction.common.nullif.detail'),
  fn('CAST', 'sqlFunction.common.cast.detail'),
  fn('CONVERT', 'sqlFunction.common.convert.detail'),
  fn('ROW_NUMBER', 'sqlFunction.common.row_number.detail'),
  fn('RANK', 'sqlFunction.common.rank.detail'),
  fn('DENSE_RANK', 'sqlFunction.common.dense_rank.detail'),
  fn('LAG', 'sqlFunction.common.lag.detail'),
  fn('LEAD', 'sqlFunction.common.lead.detail'),
  fn('FIRST_VALUE', 'sqlFunction.common.first_value.detail'),
  fn('LAST_VALUE', 'sqlFunction.common.last_value.detail'),
];

const MYSQL_FUNCTIONS = [
  fn('GROUP_CONCAT', 'sqlFunction.mysql.group_concat.detail'),
  fn('CONCAT_WS', 'sqlFunction.mysql.concat_ws.detail'),
  fn('LEFT', 'sqlFunction.mysql.left.detail'),
  fn('RIGHT', 'sqlFunction.mysql.right.detail'),
  fn('CHAR_LENGTH', 'sqlFunction.mysql.char_length.detail'),
  fn('REVERSE', 'sqlFunction.mysql.reverse.detail'),
  fn('REPEAT', 'sqlFunction.mysql.repeat.detail'),
  fn('LPAD', 'sqlFunction.mysql.lpad.detail'),
  fn('RPAD', 'sqlFunction.mysql.rpad.detail'),
  fn('INSTR', 'sqlFunction.mysql.instr.detail'),
  fn('LOCATE', 'sqlFunction.mysql.locate.detail'),
  fn('FIND_IN_SET', 'sqlFunction.mysql.find_in_set.detail'),
  fn('FORMAT', 'sqlFunction.mysql.format.detail'),
  fn('TRUNCATE', 'sqlFunction.mysql.truncate.detail'),
  fn('RAND', 'sqlFunction.mysql.rand.detail'),
  fn('POW', 'sqlFunction.mysql.pow.detail'),
  fn('LOG2', 'sqlFunction.mysql.log2.detail'),
  fn('LOG10', 'sqlFunction.mysql.log10.detail'),
  fn('NOW', 'sqlFunction.mysql.now.detail'),
  fn('CURDATE', 'sqlFunction.mysql.curdate.detail'),
  fn('CURTIME', 'sqlFunction.mysql.curtime.detail'),
  fn('DATE_FORMAT', 'sqlFunction.mysql.date_format.detail'),
  fn('DATE_ADD', 'sqlFunction.mysql.date_add.detail'),
  fn('DATE_SUB', 'sqlFunction.mysql.date_sub.detail'),
  fn('DATEDIFF', 'sqlFunction.mysql.datediff.detail'),
  fn('TIMESTAMPDIFF', 'sqlFunction.mysql.timestampdiff.detail'),
  fn('STR_TO_DATE', 'sqlFunction.mysql.str_to_date.detail'),
  fn('UNIX_TIMESTAMP', 'sqlFunction.mysql.unix_timestamp.detail'),
  fn('IF', 'sqlFunction.mysql.if.detail'),
  fn('IFNULL', 'sqlFunction.mysql.ifnull.detail'),
  fn('JSON_EXTRACT', 'sqlFunction.mysql.json_extract.detail'),
  fn('JSON_UNQUOTE', 'sqlFunction.mysql.json_unquote.detail'),
  fn('JSON_SET', 'sqlFunction.mysql.json_set.detail'),
  fn('MD5', 'sqlFunction.mysql.md5.detail'),
  fn('SHA1', 'sqlFunction.mysql.sha1.detail'),
  fn('SHA2', 'sqlFunction.mysql.sha2.detail'),
  fn('UUID', 'sqlFunction.mysql.uuid.detail'),
  fn('DATABASE', 'sqlFunction.mysql.database.detail'),
  fn('VERSION', 'sqlFunction.mysql.version.detail'),
  fn('LAST_INSERT_ID', 'sqlFunction.mysql.last_insert_id.detail'),
];

const PG_FUNCTIONS = [
  fn('STRING_AGG', 'sqlFunction.postgres.string_agg.detail'),
  fn('ARRAY_AGG', 'sqlFunction.postgres.array_agg.detail'),
  fn('BOOL_AND', 'sqlFunction.postgres.bool_and.detail'),
  fn('BOOL_OR', 'sqlFunction.postgres.bool_or.detail'),
  fn('POSITION', 'sqlFunction.postgres.position.detail'),
  fn('EXTRACT', 'sqlFunction.postgres.extract.detail'),
  fn('DATE_TRUNC', 'sqlFunction.postgres.date_trunc.detail'),
  fn('NOW', 'sqlFunction.postgres.now.detail'),
  fn('TO_CHAR', 'sqlFunction.postgres.to_char.detail'),
  fn('TO_DATE', 'sqlFunction.postgres.to_date.detail'),
  fn('TO_TIMESTAMP', 'sqlFunction.postgres.to_timestamp.detail'),
  fn('AGE', 'sqlFunction.postgres.age.detail'),
  fn('RANDOM', 'sqlFunction.postgres.random.detail'),
  fn('CURRENT_DATABASE', 'sqlFunction.postgres.current_database.detail'),
  fn('JSONB_EXTRACT_PATH', 'sqlFunction.postgres.jsonb_extract_path.detail'),
];

const ORACLE_FUNCTIONS = [
  fn('LISTAGG', 'sqlFunction.oracle.listagg.detail'),
  fn('NVL', 'sqlFunction.oracle.nvl.detail'),
  fn('NVL2', 'sqlFunction.oracle.nvl2.detail'),
  fn('DECODE', 'sqlFunction.oracle.decode.detail'),
  fn('TO_DATE', 'sqlFunction.oracle.to_date.detail'),
  fn('TO_TIMESTAMP', 'sqlFunction.oracle.to_timestamp.detail'),
  fn('TO_CHAR', 'sqlFunction.oracle.to_char.detail'),
  fn('TO_NUMBER', 'sqlFunction.oracle.to_number.detail'),
  fn('TRUNC', 'sqlFunction.oracle.trunc.detail'),
  fn('ADD_MONTHS', 'sqlFunction.oracle.add_months.detail'),
  fn('MONTHS_BETWEEN', 'sqlFunction.oracle.months_between.detail'),
  fn('LAST_DAY', 'sqlFunction.oracle.last_day.detail'),
  fn('SYSDATE', 'sqlFunction.oracle.sysdate.detail'),
  fn('SYSTIMESTAMP', 'sqlFunction.oracle.systimestamp.detail'),
  fn('INSTR', 'sqlFunction.oracle.instr.detail'),
  fn('REGEXP_LIKE', 'sqlFunction.oracle.regexp_like.detail'),
  fn('REGEXP_REPLACE', 'sqlFunction.oracle.regexp_replace.detail'),
  fn('USER', 'sqlFunction.oracle.user.detail'),
];

const SQLSERVER_FUNCTIONS = [
  fn('GETDATE', 'sqlFunction.sqlserver.getdate.detail'),
  fn('SYSDATETIME', 'sqlFunction.sqlserver.sysdatetime.detail'),
  fn('DATEADD', 'sqlFunction.sqlserver.dateadd.detail'),
  fn('DATEDIFF', 'sqlFunction.sqlserver.datediff.detail'),
  fn('FORMAT', 'sqlFunction.sqlserver.format.detail'),
  fn('ISNULL', 'sqlFunction.sqlserver.isnull.detail'),
  fn('IIF', 'sqlFunction.sqlserver.iif.detail'),
  fn('NEWID', 'sqlFunction.sqlserver.newid.detail'),
  fn('STRING_AGG', 'sqlFunction.sqlserver.string_agg.detail'),
  fn('LEFT', 'sqlFunction.sqlserver.left.detail'),
  fn('RIGHT', 'sqlFunction.sqlserver.right.detail'),
  fn('LEN', 'sqlFunction.sqlserver.len.detail'),
  fn('CHARINDEX', 'sqlFunction.sqlserver.charindex.detail'),
  fn('TRY_CAST', 'sqlFunction.sqlserver.try_cast.detail'),
  fn('TRY_CONVERT', 'sqlFunction.sqlserver.try_convert.detail'),
  fn('DB_NAME', 'sqlFunction.sqlserver.db_name.detail'),
];

const SQLITE_FUNCTIONS = [
  fn('DATE', 'sqlFunction.sqlite.date.detail'),
  fn('TIME', 'sqlFunction.sqlite.time.detail'),
  fn('DATETIME', 'sqlFunction.sqlite.datetime.detail'),
  fn('JULIANDAY', 'sqlFunction.sqlite.julianday.detail'),
  fn('STRFTIME', 'sqlFunction.sqlite.strftime.detail'),
  fn('IFNULL', 'sqlFunction.sqlite.ifnull.detail'),
  fn('RANDOM', 'sqlFunction.sqlite.random.detail'),
  fn('PRINTF', 'sqlFunction.sqlite.printf.detail'),
  fn('HEX', 'sqlFunction.sqlite.hex.detail'),
  fn('QUOTE', 'sqlFunction.sqlite.quote.detail'),
  fn('JSON_EXTRACT', 'sqlFunction.sqlite.json_extract.detail'),
];

const DUCKDB_FUNCTIONS = [
  fn('LIST', 'sqlFunction.duckdb.list.detail'),
  fn('STRUCT_PACK', 'sqlFunction.duckdb.struct_pack.detail'),
  fn('UNNEST', 'sqlFunction.duckdb.unnest.detail'),
  fn('STRFTIME', 'sqlFunction.duckdb.strftime.detail'),
  fn('EPOCH', 'sqlFunction.duckdb.epoch.detail'),
  fn('RANDOM', 'sqlFunction.duckdb.random.detail'),
  fn('UUID', 'sqlFunction.duckdb.uuid.detail'),
];

const CLICKHOUSE_FUNCTIONS = [
  fn('now', 'sqlFunction.clickhouse.now.detail'),
  fn('today', 'sqlFunction.clickhouse.today.detail'),
  fn('toDate', 'sqlFunction.clickhouse.todate.detail'),
  fn('toDateTime', 'sqlFunction.clickhouse.todatetime.detail'),
  fn('formatDateTime', 'sqlFunction.clickhouse.formatdatetime.detail'),
  fn('groupArray', 'sqlFunction.clickhouse.grouparray.detail'),
  fn('groupUniqArray', 'sqlFunction.clickhouse.groupuniqarray.detail'),
  fn('uniq', 'sqlFunction.clickhouse.uniq.detail'),
  fn('uniqExact', 'sqlFunction.clickhouse.uniqexact.detail'),
  fn('quantile', 'sqlFunction.clickhouse.quantile.detail'),
  fn('JSONExtractString', 'sqlFunction.clickhouse.jsonextractstring.detail'),
  fn('toString', 'sqlFunction.clickhouse.tostring.detail'),
  fn('toInt64', 'sqlFunction.clickhouse.toint64.detail'),
];

const TDENGINE_FUNCTIONS = [
  fn('NOW', 'sqlFunction.tdengine.now.detail'),
  fn('TODAY', 'sqlFunction.tdengine.today.detail'),
  fn('TIMEDIFF', 'sqlFunction.tdengine.timediff.detail'),
  fn('ELAPSED', 'sqlFunction.tdengine.elapsed.detail'),
  fn('SPREAD', 'sqlFunction.tdengine.spread.detail'),
  fn('TWA', 'sqlFunction.tdengine.twa.detail'),
  fn('LEASTSQUARES', 'sqlFunction.tdengine.leastsquares.detail'),
  fn('APERCENTILE', 'sqlFunction.tdengine.apercentile.detail'),
  fn('FIRST', 'sqlFunction.tdengine.first.detail'),
  fn('LAST', 'sqlFunction.tdengine.last.detail'),
  fn('LAST_ROW', 'sqlFunction.tdengine.last_row.detail'),
  fn('INTERP', 'sqlFunction.tdengine.interp.detail'),
  fn('RATE', 'sqlFunction.tdengine.rate.detail'),
  fn('IRATE', 'sqlFunction.tdengine.irate.detail'),
];

const mergeFunctions = (items: SqlFunctionCompletionDefinition[], language: AppLanguage): SqlFunctionCompletion[] => {
  const seen = new Set<string>();
  const result: SqlFunctionCompletion[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name: item.name, detail: translate(language, item.detailKey) });
  }
  return result;
};

export const resolveSqlFunctions = (dbType: string, language: AppLanguage = 'en'): SqlFunctionCompletion[] => {
  const dialect = resolveSqlDialect(dbType);
  if (isMysqlFamilyDialect(dialect)) return mergeFunctions([...COMMON_FUNCTIONS, ...MYSQL_FUNCTIONS], language);
  if (isPgLikeDialect(dialect)) return mergeFunctions([...COMMON_FUNCTIONS, ...PG_FUNCTIONS], language);
  if (isOracleLikeDialect(dialect)) return mergeFunctions([...COMMON_FUNCTIONS, ...ORACLE_FUNCTIONS], language);
  if (dialect === 'sqlserver') return mergeFunctions([...COMMON_FUNCTIONS, ...SQLSERVER_FUNCTIONS], language);
  if (dialect === 'sqlite') return mergeFunctions([...COMMON_FUNCTIONS, ...SQLITE_FUNCTIONS], language);
  if (dialect === 'duckdb') return mergeFunctions([...COMMON_FUNCTIONS, ...DUCKDB_FUNCTIONS], language);
  if (dialect === 'clickhouse') return mergeFunctions([...COMMON_FUNCTIONS, ...CLICKHOUSE_FUNCTIONS], language);
  if (dialect === 'tdengine') return mergeFunctions([...COMMON_FUNCTIONS, ...TDENGINE_FUNCTIONS], language);
  return mergeFunctions(COMMON_FUNCTIONS, language);
};
