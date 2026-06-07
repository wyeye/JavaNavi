export type QueryRow = Record<string, unknown>;
export type StatementExecutionStatus = 'success' | 'error' | 'pending' | 'rolledBack';

export type QueryResultSetData = {
  columns?: string[];
  rows?: QueryRow[];
  statementIndex?: number;
  startLine?: number;
  endLine?: number;
  sql?: string;
  status?: string;
  message?: string;
  transactionRolledBack?: boolean;
};

export type ExecutionSummaryRow = QueryRow & {
  statementIndex: number;
  editorLineRange: string;
  startLine: number;
  endLine: number;
  sqlType: string;
  sqlSummary: string;
  sql: string;
  statusText: string;
  status: StatementExecutionStatus;
  message: string;
  affectedRows?: number;
};

export type QueryResultGroup<TSource = string, TEditLocator = unknown> =
  | {
      kind: 'executionSummary';
      key: string;
      sql: string;
      exportSql?: string;
      rows: ExecutionSummaryRow[];
      columns: string[];
      pkColumns: string[];
      readOnly: true;
      source?: TSource;
      statementIndex?: number;
      startLine?: number;
      endLine?: number;
      statementSummary: true;
      status: StatementExecutionStatus;
      message: string;
      transactionRolledBack?: boolean;
    }
  | {
      kind: 'queryResult';
      key: string;
      sql: string;
      exportSql?: string;
      rows: QueryRow[];
      columns: string[];
      tableName?: string;
      pkColumns: string[];
      editLocator?: TEditLocator;
      readOnly: boolean;
      truncated?: boolean;
      pkLoading?: boolean;
      source?: TSource;
      statementIndex?: number;
      startLine?: number;
      endLine?: number;
      status?: StatementExecutionStatus;
      message?: string;
      statementSummary?: boolean;
      transactionRolledBack?: boolean;
    };

export type BuildQueryResultGroupsOptions<TSource = string, TEditLocator = unknown> = {
  resultSetDataArray: QueryResultSetData[];
  statements?: string[];
  maxRows?: number;
  anyLimitApplied?: boolean;
  source?: TSource;
  successText: string;
  errorText: string;
  pendingText: string;
  rolledBackText: string;
  operationSucceededText: string;
  operationFailedText: string;
  rowKeyField?: string;
  resolveReadOnlyLocator: (columns: string[]) => TEditLocator;
  resolveSimpleTableName: (sql: string) => string | undefined;
  canLoadPrimaryKeys: (tableName: string) => boolean;
};

export type BuildQueryResultGroupsResult<TSource = string, TEditLocator = unknown> = {
  resultGroups: QueryResultGroup<TSource, TEditLocator>[];
  anyTruncated: boolean;
  pendingPk: Array<{ resultKey: string; tableName: string }>;
};

const SUMMARY_COLUMNS = ['editorLineRange', 'sqlType', 'sqlSummary', 'statusText', 'affectedRows'];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

export const affectedRowsOf = (value: unknown): number | undefined => {
  if (!isRecord(value)) return undefined;
  const affectedRows = Number(value.affectedRows);
  return Number.isFinite(affectedRows) ? affectedRows : undefined;
};

export const isAffectedRowsResultSet = (resultSet: QueryResultSetData): boolean => (
  Array.isArray(resultSet.rows)
  && resultSet.rows.length === 1
  && Array.isArray(resultSet.columns)
  && resultSet.columns.length === 1
  && resultSet.columns[0] === 'affectedRows'
);

export const formatEditorLineRange = (startLine?: number, endLine?: number): string => {
  const start = Number(startLine);
  const end = Number(endLine);
  if (!Number.isFinite(start) || start <= 0) return '-';
  if (Number.isFinite(end) && end > start) return `${start}-${end}`;
  return String(start);
};

export const detectSqlType = (sql: string): string => {
  const withoutLeadingComments = String(sql || '')
    .replace(/^\s*(?:--[^\n\r]*(?:\r?\n|$)|#[^\n\r]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/\s*)*/u, '')
    .trim();
  const match = withoutLeadingComments.match(/^([A-Za-z]+)/u);
  return match ? match[1].toUpperCase() : '-';
};

export const summarizeSql = (sql: string, maxLength = 120): string => {
  const normalized = String(sql || '').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
};

export const isLikelyQuerySql = (sql: string): boolean => {
  const type = detectSqlType(sql);
  return ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN'].includes(type);
};

export const buildQueryResultGroups = <TSource = string, TEditLocator = unknown>({
  resultSetDataArray,
  statements = [],
  maxRows = 0,
  anyLimitApplied = false,
  source,
  rowKeyField,
  successText,
  errorText,
  pendingText,
  rolledBackText,
  operationSucceededText,
  operationFailedText,
  resolveReadOnlyLocator,
  resolveSimpleTableName,
  canLoadPrimaryKeys,
}: BuildQueryResultGroupsOptions<TSource, TEditLocator>): BuildQueryResultGroupsResult<TSource, TEditLocator> => {
  const resultGroups: QueryResultGroup<TSource, TEditLocator>[] = [];
  const pendingPk: Array<{ resultKey: string; tableName: string }> = [];
  let anyTruncated = false;
  let executionRows: ExecutionSummaryRow[] = [];
  const normalizedRowKeyField = rowKeyField || '__javanavi_row_key__';
  let groupSeq = 0;

  const flushExecutionSummaryGroup = () => {
    if (executionRows.length === 0) return;
    const rows = executionRows;
    executionRows = [];
    groupSeq += 1;
    const firstErrorRow = rows.find(row => row.status === 'error');
    const firstRow = rows[0];
    const hasError = !!firstErrorRow;
    const hasRolledBack = rows.some(row => row.status === 'rolledBack');
    const groupSql = rows.map(row => row.sql).filter(Boolean).join('\n\n');
    resultGroups.push({
      kind: 'executionSummary',
      key: `result-${groupSeq}`,
      sql: groupSql,
      exportSql: groupSql,
      rows,
      columns: ['editorLineRange', 'sqlType', 'sqlSummary', 'statusText', 'affectedRows'],
      pkColumns: [],
      readOnly: true,
      source,
      statementIndex: Number(firstErrorRow?.statementIndex ?? firstRow?.statementIndex ?? 0) || undefined,
      startLine: Number(firstErrorRow?.startLine ?? firstRow?.startLine ?? 0) || undefined,
      endLine: Number(firstErrorRow?.endLine ?? firstRow?.endLine ?? 0) || undefined,
      statementSummary: true,
      status: hasError ? 'error' : (hasRolledBack ? 'rolledBack' : 'success'),
      message: hasError ? String(firstErrorRow?.message || operationFailedText) : (hasRolledBack ? rolledBackText : operationSucceededText),
      transactionRolledBack: rows.some(row => row.transactionRolledBack === true),
    });
  };

  resultSetDataArray.forEach((rsData, idx) => {
    const rawStatement = String(rsData.sql || ((idx < statements.length) ? statements[idx] : ''));
    const statementIndex = Number(rsData.statementIndex || idx + 1);
    const startLine = Number(rsData.startLine || 0);
    const endLine = Number(rsData.endLine || 0);
    const rawStatus = String(rsData.status || '').trim();
    const statementStatus: StatementExecutionStatus = rawStatus === 'error'
      ? 'error'
      : (rawStatus === 'pending' ? 'pending' : (rawStatus === 'rolledBack' ? 'rolledBack' : 'success'));
    const statementMessage = String(rsData.message || (statementStatus === 'error'
      ? operationFailedText
      : (statementStatus === 'pending' ? pendingText : (statementStatus === 'rolledBack' ? rolledBackText : operationSucceededText))));
    const transactionRolledBack = rsData.transactionRolledBack === true;

    const isAffectedResult = isAffectedRowsResultSet(rsData);
    const isNonQueryFailure = statementStatus === 'error' && !isLikelyQuerySql(rawStatement);
    const isExecutionSummaryResult = isAffectedResult || isNonQueryFailure;
    if (isExecutionSummaryResult) {
      const affectedRow = Array.isArray(rsData.rows) ? rsData.rows[0] : undefined;
      const affected = isAffectedResult ? (affectedRowsOf(affectedRow) ?? 0) : undefined;
      executionRows.push({
        statementIndex,
        editorLineRange: formatEditorLineRange(startLine, endLine),
        startLine,
        endLine,
        sqlType: detectSqlType(rawStatement),
        sqlSummary: summarizeSql(rawStatement),
        sql: rawStatement,
        statusText: statementStatus === 'error' ? errorText : (statementStatus === 'pending' ? pendingText : (statementStatus === 'rolledBack' ? rolledBackText : successText)),
        status: statementStatus,
        message: statementMessage,
        ...(affected !== undefined ? { affectedRows: affected } : {}),
        transactionRolledBack,
        [normalizedRowKeyField]: `statement-${statementIndex}`,
      });
      return;
    }

    flushExecutionSummaryGroup();

    let rows = Array.isArray(rsData.rows) ? rsData.rows : [];
    let truncated = false;
    if (anyLimitApplied && Number.isFinite(maxRows) && maxRows > 0 && rows.length > maxRows) {
      truncated = true;
      anyTruncated = true;
      rows = rows.slice(0, maxRows);
    }
    const cols = (rsData.columns && rsData.columns.length > 0)
      ? rsData.columns
      : (rows.length > 0 ? Object.keys(rows[0]) : []);

    rows.forEach((row, rowIndex) => {
      row[normalizedRowKeyField] = rowIndex;
    });

    const simpleTableName = rawStatement ? resolveSimpleTableName(rawStatement) : undefined;
    groupSeq += 1;
    const key = `result-${groupSeq}`;
    if (simpleTableName && canLoadPrimaryKeys(simpleTableName)) {
      pendingPk.push({ resultKey: key, tableName: simpleTableName });
    }
    const canResolveLocator = !!simpleTableName && canLoadPrimaryKeys(simpleTableName);
    resultGroups.push({
      kind: 'queryResult',
      key,
      sql: rawStatement,
      exportSql: rawStatement,
      rows,
      columns: cols,
      tableName: simpleTableName,
      pkColumns: [],
      editLocator: canResolveLocator ? undefined : resolveReadOnlyLocator(cols),
      readOnly: true,
      pkLoading: canResolveLocator,
      truncated,
      source,
      statementIndex,
      startLine,
      endLine,
      status: statementStatus,
      message: statementMessage,
      statementSummary: statementStatus === 'error',
      transactionRolledBack,
    });
  });

  flushExecutionSummaryGroup();

  return { resultGroups, anyTruncated, pendingPk };
};
