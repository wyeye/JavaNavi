export type ExecutionPlanWarningKind = 'full-scan' | 'filesort' | 'temporary' | 'missing-index' | 'high-rows';

export type ExecutionPlanWarning = {
  kind: ExecutionPlanWarningKind;
  label: string;
  severity: 'warning' | 'danger';
};

export type ExecutionPlanStep = {
  stepNo: number;
  tableName: string;
  selectType?: string;
  accessType?: string;
  possibleKeys?: string;
  indexName?: string;
  estimatedRows?: number;
  filtered?: number;
  extra?: string;
  detail?: string;
  raw: Record<string, unknown>;
  warnings: ExecutionPlanWarning[];
};

export type ExecutionPlanSummary = {
  totalRows: number;
  fullScanCount: number;
  indexUsageCount: number;
  warningCount: number;
  estimatedRows: number | null;
  accessTypes: Array<{ label: string; count: number }>;
};

export type ExecutionPlanPresentation = {
  isStructured: boolean;
  summary: ExecutionPlanSummary;
  steps: ExecutionPlanStep[];
  textLines: string[];
};

export type ExecutionPlanResultInput = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  sql?: string;
};

const FULL_SCAN_ROW_THRESHOLD = 1000;

const normalizeColumnName = (value: string): string => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const findColumn = (columns: string[], candidates: string[]): string | undefined => {
  const normalizedCandidates = new Set(candidates.map(normalizeColumnName));
  return columns.find((column) => normalizedCandidates.has(normalizeColumnName(column)));
};

const firstText = (row: Record<string, unknown>, columns: string[], candidates: string[]): string => {
  const column = findColumn(columns, candidates);
  if (!column) return '';
  const value = row[column];
  return value === null || value === undefined ? '' : String(value).trim();
};

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const firstNumber = (row: Record<string, unknown>, columns: string[], candidates: string[]): number | undefined => {
  const column = findColumn(columns, candidates);
  return column ? parseNumber(row[column]) : undefined;
};

const addWarning = (warnings: ExecutionPlanWarning[], warning: ExecutionPlanWarning) => {
  if (!warnings.some((item) => item.kind === warning.kind)) {
    warnings.push(warning);
  }
};

const resolveDetailTable = (detail: string): string => {
  const match = detail.match(/\b(?:SCAN|SEARCH)\s+(?:TABLE\s+)?[`"\[]?([\w.$-]+)[`"\]]?/i)
    || detail.match(/\b(?:Seq Scan|Index Scan|Bitmap Heap Scan)\s+on\s+[`"\[]?([\w.$-]+)[`"\]]?/i);
  return match?.[1] || '';
};

const resolveDetailIndex = (detail: string): string => {
  const match = detail.match(/\bUSING\s+(?:COVERING\s+)?INDEX\s+[`"\[]?([\w.$-]+)[`"\]]?/i)
    || detail.match(/\bIndex\s+Scan\s+using\s+[`"\[]?([\w.$-]+)[`"\]]?/i);
  return match?.[1] || '';
};

const resolveDetailRows = (detail: string): number | undefined => {
  const match = detail.match(/\brows\s*=\s*(\d+(?:\.\d+)?)/i);
  return match ? parseNumber(match[1]) : undefined;
};

const warningsForStep = (step: Omit<ExecutionPlanStep, 'warnings'>): ExecutionPlanWarning[] => {
  const warnings: ExecutionPlanWarning[] = [];
  const accessType = String(step.accessType || '').toUpperCase();
  const extra = String(step.extra || step.detail || '');
  const hasFullScan = ['ALL', 'SEQ SCAN', 'SCAN'].includes(accessType)
    || /\bSeq Scan\b/i.test(extra)
    || (/\bSCAN\b/i.test(extra) && !/\bUSING\s+(?:COVERING\s+)?INDEX\b/i.test(extra));
  if (hasFullScan) {
    addWarning(warnings, { kind: 'full-scan', label: '全表扫描', severity: 'danger' });
  }
  if (/filesort/i.test(extra)) {
    addWarning(warnings, { kind: 'filesort', label: '文件排序', severity: 'warning' });
  }
  if (/temporary/i.test(extra)) {
    addWarning(warnings, { kind: 'temporary', label: '临时表', severity: 'warning' });
  }
  if (step.possibleKeys && !step.indexName && hasFullScan) {
    addWarning(warnings, { kind: 'missing-index', label: '未使用候选索引', severity: 'warning' });
  }
  if (typeof step.estimatedRows === 'number' && step.estimatedRows >= FULL_SCAN_ROW_THRESHOLD && hasFullScan) {
    addWarning(warnings, { kind: 'high-rows', label: '扫描行数偏高', severity: 'warning' });
  }
  return warnings;
};

const resolveStructuredStep = (row: Record<string, unknown>, columns: string[], index: number): ExecutionPlanStep => {
  const detail = firstText(row, columns, ['detail', 'query plan', 'query_plan', 'plan', 'showplan_text']);
  const accessTypeFromDetail = /\bSeq Scan\b/i.test(detail)
    ? 'Seq Scan'
    : /\bSEARCH\b/i.test(detail)
      ? 'SEARCH'
      : /\bSCAN\b/i.test(detail)
        ? 'SCAN'
        : '';
  const stepBase: Omit<ExecutionPlanStep, 'warnings'> = {
    stepNo: index + 1,
    tableName: firstText(row, columns, ['table', 'table_name', 'tablename', 'relation_name', 'object_name']) || resolveDetailTable(detail) || '-',
    selectType: firstText(row, columns, ['select_type', 'selecttype']),
    accessType: firstText(row, columns, ['type', 'access_type', 'accesstype']) || accessTypeFromDetail,
    possibleKeys: firstText(row, columns, ['possible_keys', 'possiblekeys']),
    indexName: firstText(row, columns, ['key', 'key_name', 'keyname', 'index', 'index_name', 'indexname']) || resolveDetailIndex(detail),
    estimatedRows: firstNumber(row, columns, ['rows', 'estimated rows', 'estimated_rows', 'estimatedrows']) ?? resolveDetailRows(detail),
    filtered: firstNumber(row, columns, ['filtered']),
    extra: firstText(row, columns, ['extra']),
    detail,
    raw: row,
  };
  return { ...stepBase, warnings: warningsForStep(stepBase) };
};

const resolveTextLines = (columns: string[], rows: Array<Record<string, unknown>>): string[] => {
  const likelyTextColumn = findColumn(columns, ['query plan', 'query_plan', 'plan', 'showplan_text', 'explain', 'text', 'detail']);
  if (likelyTextColumn) {
    return rows.map((row) => String(row[likelyTextColumn] ?? '')).filter((line) => line.trim().length > 0);
  }
  if (columns.length === 1) {
    const column = columns[0];
    return rows.map((row) => String(row[column] ?? '')).filter((line) => line.trim().length > 0);
  }
  return [];
};

const buildSummary = (steps: ExecutionPlanStep[], totalRows: number): ExecutionPlanSummary => {
  const accessCounter = new Map<string, number>();
  let estimatedRows = 0;
  let hasEstimatedRows = false;
  for (const step of steps) {
    const label = step.accessType || (step.indexName ? 'INDEX' : 'UNKNOWN');
    accessCounter.set(label, (accessCounter.get(label) || 0) + 1);
    if (typeof step.estimatedRows === 'number' && Number.isFinite(step.estimatedRows)) {
      estimatedRows += step.estimatedRows;
      hasEstimatedRows = true;
    }
  }
  return {
    totalRows,
    fullScanCount: steps.filter((step) => step.warnings.some((warning) => warning.kind === 'full-scan')).length,
    indexUsageCount: steps.filter((step) => !!step.indexName || /\bUSING\s+(?:COVERING\s+)?INDEX\b/i.test(step.detail || '')).length,
    warningCount: steps.reduce((sum, step) => sum + step.warnings.length, 0),
    estimatedRows: hasEstimatedRows ? estimatedRows : null,
    accessTypes: Array.from(accessCounter.entries()).map(([label, count]) => ({ label, count })),
  };
};

export const analyzeExecutionPlanResult = ({ columns, rows }: ExecutionPlanResultInput): ExecutionPlanPresentation => {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalizedColumns = new Set(safeColumns.map(normalizeColumnName));
  const hasStructuredColumns = ['selecttype', 'table', 'type', 'possiblekeys', 'key', 'rows', 'filtered', 'extra', 'detail']
    .some((column) => normalizedColumns.has(column));
  const textLines = resolveTextLines(safeColumns, safeRows);
  const isStructured = hasStructuredColumns && !(safeColumns.length === 1 && textLines.length > 0);
  const steps = safeRows.map((row, index) => resolveStructuredStep(row || {}, safeColumns, index));
  return {
    isStructured,
    summary: buildSummary(steps, safeRows.length),
    steps,
    textLines,
  };
};

export const isExecutionPlanSql = (sql: string): boolean => {
  const text = String(sql || '').trim();
  return /^\s*(EXPLAIN\b|SET\s+SHOWPLAN_|SELECT\s+\*\s+FROM\s+TABLE\s*\(\s*DBMS_XPLAN\.DISPLAY\s*\(\s*\)\s*\))/i.test(text);
};
