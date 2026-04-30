export type ColumnTypeOption = { value: string };

export type SqlFunctionCompletion = {
  name: string;
  detail: string;
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

const fn = (name: string, detail: string): SqlFunctionCompletion => ({ name, detail });

const COMMON_FUNCTIONS = [
  fn('COUNT', '聚合 - 计数'),
  fn('SUM', '聚合 - 求和'),
  fn('AVG', '聚合 - 平均值'),
  fn('MAX', '聚合 - 最大值'),
  fn('MIN', '聚合 - 最小值'),
  fn('CONCAT', '字符串 - 拼接'),
  fn('SUBSTRING', '字符串 - 截取子串'),
  fn('SUBSTR', '字符串 - 截取子串'),
  fn('LENGTH', '字符串 - 长度'),
  fn('UPPER', '字符串 - 转大写'),
  fn('LOWER', '字符串 - 转小写'),
  fn('TRIM', '字符串 - 去空格'),
  fn('LTRIM', '字符串 - 去左空格'),
  fn('RTRIM', '字符串 - 去右空格'),
  fn('REPLACE', '字符串 - 替换'),
  fn('ABS', '数学 - 绝对值'),
  fn('CEIL', '数学 - 向上取整'),
  fn('CEILING', '数学 - 向上取整'),
  fn('FLOOR', '数学 - 向下取整'),
  fn('ROUND', '数学 - 四舍五入'),
  fn('MOD', '数学 - 取模'),
  fn('POWER', '数学 - 幂运算'),
  fn('SQRT', '数学 - 平方根'),
  fn('LOG', '数学 - 对数'),
  fn('EXP', '数学 - e 的次方'),
  fn('COALESCE', '条件 - 返回第一个非 NULL'),
  fn('NULLIF', '条件 - 相等返回 NULL'),
  fn('CAST', '转换 - 类型转换'),
  fn('CONVERT', '转换 - 类型转换'),
  fn('ROW_NUMBER', '窗口 - 行号'),
  fn('RANK', '窗口 - 排名'),
  fn('DENSE_RANK', '窗口 - 连续排名'),
  fn('LAG', '窗口 - 前一行'),
  fn('LEAD', '窗口 - 后一行'),
  fn('FIRST_VALUE', '窗口 - 第一个值'),
  fn('LAST_VALUE', '窗口 - 最后一个值'),
];

const MYSQL_FUNCTIONS = [
  fn('GROUP_CONCAT', 'MySQL - 分组拼接'),
  fn('CONCAT_WS', 'MySQL - 带分隔符拼接'),
  fn('LEFT', 'MySQL - 从左截取'),
  fn('RIGHT', 'MySQL - 从右截取'),
  fn('CHAR_LENGTH', 'MySQL - 字符长度'),
  fn('REVERSE', 'MySQL - 字符串反转'),
  fn('REPEAT', 'MySQL - 重复字符串'),
  fn('LPAD', 'MySQL - 左填充'),
  fn('RPAD', 'MySQL - 右填充'),
  fn('INSTR', 'MySQL - 查找位置'),
  fn('LOCATE', 'MySQL - 查找位置'),
  fn('FIND_IN_SET', 'MySQL - 集合查找'),
  fn('FORMAT', 'MySQL - 数字格式化'),
  fn('TRUNCATE', 'MySQL - 截断小数'),
  fn('RAND', 'MySQL - 随机数'),
  fn('POW', 'MySQL - 幂运算'),
  fn('LOG2', 'MySQL - 以 2 为底对数'),
  fn('LOG10', 'MySQL - 以 10 为底对数'),
  fn('NOW', 'MySQL - 当前日期时间'),
  fn('CURDATE', 'MySQL - 当前日期'),
  fn('CURTIME', 'MySQL - 当前时间'),
  fn('DATE_FORMAT', 'MySQL - 日期格式化'),
  fn('DATE_ADD', 'MySQL - 日期加法'),
  fn('DATE_SUB', 'MySQL - 日期减法'),
  fn('DATEDIFF', 'MySQL - 日期差'),
  fn('TIMESTAMPDIFF', 'MySQL - 时间戳差'),
  fn('STR_TO_DATE', 'MySQL - 字符串转日期'),
  fn('UNIX_TIMESTAMP', 'MySQL - Unix 时间戳'),
  fn('IF', 'MySQL - 条件判断'),
  fn('IFNULL', 'MySQL - NULL 替换'),
  fn('JSON_EXTRACT', 'MySQL - JSON 提取'),
  fn('JSON_UNQUOTE', 'MySQL - JSON 去引号'),
  fn('JSON_SET', 'MySQL - JSON 设置'),
  fn('MD5', 'MySQL - MD5 哈希'),
  fn('SHA1', 'MySQL - SHA1 哈希'),
  fn('SHA2', 'MySQL - SHA2 哈希'),
  fn('UUID', 'MySQL - 生成 UUID'),
  fn('DATABASE', 'MySQL - 当前数据库'),
  fn('VERSION', 'MySQL - 版本'),
  fn('LAST_INSERT_ID', 'MySQL - 最后插入 ID'),
];

const PG_FUNCTIONS = [
  fn('STRING_AGG', 'PostgreSQL - 字符串聚合'),
  fn('ARRAY_AGG', 'PostgreSQL - 数组聚合'),
  fn('BOOL_AND', 'PostgreSQL - 布尔与聚合'),
  fn('BOOL_OR', 'PostgreSQL - 布尔或聚合'),
  fn('POSITION', 'PostgreSQL - 查找位置'),
  fn('EXTRACT', 'PostgreSQL - 日期字段提取'),
  fn('DATE_TRUNC', 'PostgreSQL - 日期截断'),
  fn('NOW', 'PostgreSQL - 当前时间'),
  fn('TO_CHAR', 'PostgreSQL - 格式化为文本'),
  fn('TO_DATE', 'PostgreSQL - 文本转日期'),
  fn('TO_TIMESTAMP', 'PostgreSQL - 文本转时间戳'),
  fn('AGE', 'PostgreSQL - 时间差'),
  fn('RANDOM', 'PostgreSQL - 随机数'),
  fn('CURRENT_DATABASE', 'PostgreSQL - 当前数据库'),
  fn('JSONB_EXTRACT_PATH', 'PostgreSQL - JSONB 路径提取'),
];

const ORACLE_FUNCTIONS = [
  fn('LISTAGG', 'Oracle - 字符串聚合'),
  fn('NVL', 'Oracle - NULL 替换'),
  fn('NVL2', 'Oracle - NULL 分支'),
  fn('DECODE', 'Oracle - 条件映射'),
  fn('TO_DATE', 'Oracle - 文本转日期'),
  fn('TO_TIMESTAMP', 'Oracle - 文本转时间戳'),
  fn('TO_CHAR', 'Oracle - 格式化为文本'),
  fn('TO_NUMBER', 'Oracle - 转数字'),
  fn('TRUNC', 'Oracle - 截断日期或数字'),
  fn('ADD_MONTHS', 'Oracle - 增加月份'),
  fn('MONTHS_BETWEEN', 'Oracle - 月份差'),
  fn('LAST_DAY', 'Oracle - 月末日期'),
  fn('SYSDATE', 'Oracle - 数据库当前时间'),
  fn('SYSTIMESTAMP', 'Oracle - 当前时间戳'),
  fn('INSTR', 'Oracle - 查找位置'),
  fn('REGEXP_LIKE', 'Oracle - 正则匹配'),
  fn('REGEXP_REPLACE', 'Oracle - 正则替换'),
  fn('USER', 'Oracle - 当前用户'),
];

const SQLSERVER_FUNCTIONS = [
  fn('GETDATE', 'SQL Server - 当前日期时间'),
  fn('SYSDATETIME', 'SQL Server - 高精度当前时间'),
  fn('DATEADD', 'SQL Server - 日期加法'),
  fn('DATEDIFF', 'SQL Server - 日期差'),
  fn('FORMAT', 'SQL Server - 格式化'),
  fn('ISNULL', 'SQL Server - NULL 替换'),
  fn('IIF', 'SQL Server - 条件判断'),
  fn('NEWID', 'SQL Server - 生成 GUID'),
  fn('STRING_AGG', 'SQL Server - 字符串聚合'),
  fn('LEFT', 'SQL Server - 从左截取'),
  fn('RIGHT', 'SQL Server - 从右截取'),
  fn('LEN', 'SQL Server - 字符长度'),
  fn('CHARINDEX', 'SQL Server - 查找位置'),
  fn('TRY_CAST', 'SQL Server - 尝试转换'),
  fn('TRY_CONVERT', 'SQL Server - 尝试转换'),
  fn('DB_NAME', 'SQL Server - 当前数据库'),
];

const SQLITE_FUNCTIONS = [
  fn('DATE', 'SQLite - 日期'),
  fn('TIME', 'SQLite - 时间'),
  fn('DATETIME', 'SQLite - 日期时间'),
  fn('JULIANDAY', 'SQLite - 儒略日'),
  fn('STRFTIME', 'SQLite - 日期格式化'),
  fn('IFNULL', 'SQLite - NULL 替换'),
  fn('RANDOM', 'SQLite - 随机数'),
  fn('PRINTF', 'SQLite - 格式化'),
  fn('HEX', 'SQLite - 十六进制'),
  fn('QUOTE', 'SQLite - SQL 字面量'),
  fn('JSON_EXTRACT', 'SQLite - JSON 提取'),
];

const DUCKDB_FUNCTIONS = [
  fn('LIST', 'DuckDB - 列表聚合'),
  fn('STRUCT_PACK', 'DuckDB - 构造结构体'),
  fn('UNNEST', 'DuckDB - 展开列表'),
  fn('STRFTIME', 'DuckDB - 日期格式化'),
  fn('EPOCH', 'DuckDB - 时间戳秒数'),
  fn('RANDOM', 'DuckDB - 随机数'),
  fn('UUID', 'DuckDB - 生成 UUID'),
];

const CLICKHOUSE_FUNCTIONS = [
  fn('now', 'ClickHouse - 当前时间'),
  fn('today', 'ClickHouse - 当前日期'),
  fn('toDate', 'ClickHouse - 转日期'),
  fn('toDateTime', 'ClickHouse - 转日期时间'),
  fn('formatDateTime', 'ClickHouse - 日期格式化'),
  fn('groupArray', 'ClickHouse - 数组聚合'),
  fn('groupUniqArray', 'ClickHouse - 去重数组聚合'),
  fn('uniq', 'ClickHouse - 近似去重'),
  fn('uniqExact', 'ClickHouse - 精确去重'),
  fn('quantile', 'ClickHouse - 分位数'),
  fn('JSONExtractString', 'ClickHouse - JSON 字符串提取'),
  fn('toString', 'ClickHouse - 转字符串'),
  fn('toInt64', 'ClickHouse - 转 Int64'),
];

const TDENGINE_FUNCTIONS = [
  fn('NOW', 'TDengine - 当前时间'),
  fn('TODAY', 'TDengine - 当前日期'),
  fn('TIMEDIFF', 'TDengine - 时间差'),
  fn('ELAPSED', 'TDengine - 经过时间'),
  fn('SPREAD', 'TDengine - 最大最小差'),
  fn('TWA', 'TDengine - 时间加权平均'),
  fn('LEASTSQUARES', 'TDengine - 最小二乘'),
  fn('APERCENTILE', 'TDengine - 近似百分位'),
  fn('FIRST', 'TDengine - 首值'),
  fn('LAST', 'TDengine - 末值'),
  fn('LAST_ROW', 'TDengine - 最后一行'),
  fn('INTERP', 'TDengine - 插值'),
  fn('RATE', 'TDengine - 变化率'),
  fn('IRATE', 'TDengine - 瞬时变化率'),
];

const mergeFunctions = (items: SqlFunctionCompletion[]): SqlFunctionCompletion[] => {
  const seen = new Set<string>();
  const result: SqlFunctionCompletion[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

export const resolveSqlFunctions = (dbType: string): SqlFunctionCompletion[] => {
  const dialect = resolveSqlDialect(dbType);
  if (isMysqlFamilyDialect(dialect)) return mergeFunctions([...COMMON_FUNCTIONS, ...MYSQL_FUNCTIONS]);
  if (isPgLikeDialect(dialect)) return mergeFunctions([...COMMON_FUNCTIONS, ...PG_FUNCTIONS]);
  if (isOracleLikeDialect(dialect)) return mergeFunctions([...COMMON_FUNCTIONS, ...ORACLE_FUNCTIONS]);
  if (dialect === 'sqlserver') return mergeFunctions([...COMMON_FUNCTIONS, ...SQLSERVER_FUNCTIONS]);
  if (dialect === 'sqlite') return mergeFunctions([...COMMON_FUNCTIONS, ...SQLITE_FUNCTIONS]);
  if (dialect === 'duckdb') return mergeFunctions([...COMMON_FUNCTIONS, ...DUCKDB_FUNCTIONS]);
  if (dialect === 'clickhouse') return mergeFunctions([...COMMON_FUNCTIONS, ...CLICKHOUSE_FUNCTIONS]);
  if (dialect === 'tdengine') return mergeFunctions([...COMMON_FUNCTIONS, ...TDENGINE_FUNCTIONS]);
  return COMMON_FUNCTIONS;
};
