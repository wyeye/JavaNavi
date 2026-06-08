import { translate } from '../i18n';

export type DataModificationRiskLevel = 'low' | 'medium' | 'high';
export type DataModificationRiskLanguage = 'en' | 'zh';

export type DataModificationRiskSummary = {
  level: DataModificationRiskLevel;
  lines: string[];
  shortText: string;
  requiresExplicitConfirm: boolean;
};

type DataGridModificationRiskInput = {
  language?: DataModificationRiskLanguage;
  tableName?: string;
  dbName?: string;
  inserts?: unknown[];
  updates?: unknown[];
  deletes?: unknown[];
};

type TableDiffSummaryLike = {
  table?: string;
  canSync?: boolean;
  inserts?: number;
  updates?: number;
  deletes?: number;
  schemaDiffCount?: number;
  warnings?: string[];
  unsupportedObjects?: string[];
};

type TableOpsLike = {
  insert?: boolean;
  update?: boolean;
  delete?: boolean;
  selectedInsertPks?: unknown[];
  selectedUpdatePks?: unknown[];
  selectedDeletePks?: unknown[];
};

type DataSyncExecutionRiskInput = {
  language?: DataModificationRiskLanguage;
  syncMode?: string;
  syncContent?: string;
  targetDatabase?: string;
  diffTables?: TableDiffSummaryLike[];
  tableOptions?: Record<string, TableOpsLike>;
};

type SchemaDiffItemLike = {
  id?: string;
  objectType?: string;
  objectName?: string;
  changeType?: string;
  requiresDeleteConfirm?: boolean;
  supported?: boolean;
};

type SchemaDiffTableLike = {
  table?: string;
  items?: SchemaDiffItemLike[];
};

type SchemaSyncExecutionRiskInput = {
  language?: DataModificationRiskLanguage;
  targetDatabase?: string;
  schemaDiffTables?: SchemaDiffTableLike[];
  selectedItemIds?: string[];
};

const clampCount = (value: unknown): number => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
};

const compactJoin = (parts: string[], separator: string): string => parts.filter(Boolean).join(separator);

const resolveSelectedCount = (enabled: boolean | undefined, total: number, selected?: unknown[]): number => {
  if (!enabled || total <= 0) return 0;
  return Array.isArray(selected) && selected.length > 0 ? Math.min(selected.length, total) : total;
};

const summarizeTableNames = (names: string[], language: DataModificationRiskLanguage, limit = 4): string => {
  const clean = names.map((name) => String(name || '').trim()).filter(Boolean);
  const separator = language === 'zh' ? '、' : ', ';
  if (clean.length <= limit) return clean.join(separator);
  const shown = clean.slice(0, limit).join(separator);
  return translate(language, 'dataModificationRisk.tablesTotal', { tables: shown, count: clean.length });
};

const riskLevelFromDeletes = (deleteCount: number, structuralDeleteCount = 0): DataModificationRiskLevel => {
  if (deleteCount > 0 || structuralDeleteCount > 0) return 'high';
  return 'medium';
};

const buildDataGridPendingRowsText = (
  language: DataModificationRiskLanguage,
  insertCount: number,
  updateCount: number,
  deleteCount: number,
): string => {
  return translate(language, 'dataModificationRisk.pendingRows', { insertCount, updateCount, deleteCount });
};

export const buildDataGridModificationRiskSummary = ({
  language = 'en',
  tableName,
  dbName,
  inserts = [],
  updates = [],
  deletes = [],
}: DataGridModificationRiskInput): DataModificationRiskSummary => {
  const insertCount = inserts.length;
  const updateCount = updates.length;
  const deleteCount = deletes.length;
  const total = insertCount + updateCount + deleteCount;
  const targetSeparator = language === 'zh' ? '，' : ', ';
  const target = compactJoin([
    dbName ? translate(language, 'dataGrid.risk.database', { database: dbName }) : '',
    tableName ? translate(language, 'dataGrid.risk.table', { table: tableName }) : '',
  ], targetSeparator);
  const lines = [
    translate(language, 'dataGrid.risk.target', { target: target || translate(language, 'dataGrid.risk.currentTable') }),
    buildDataGridPendingRowsText(language, insertCount, updateCount, deleteCount),
    deleteCount > 0 ? translate(language, 'dataGrid.risk.hasDelete') : translate(language, 'dataGrid.risk.noDelete'),
  ];
  return {
    level: riskLevelFromDeletes(deleteCount),
    lines,
    shortText: total > 0 ? translate(language, 'dataGrid.risk.shortText', { insertCount, updateCount, deleteCount }) : translate(language, 'dataGrid.risk.noPendingChanges'),
    requiresExplicitConfirm: deleteCount > 0,
  };
};

export const buildDataSyncExecutionRiskSummary = ({
  language = 'en',
  syncMode,
  syncContent,
  targetDatabase,
  diffTables = [],
  tableOptions = {},
}: DataSyncExecutionRiskInput): DataModificationRiskSummary => {
  let insertCount = 0;
  let updateCount = 0;
  let deleteCount = 0;
  let schemaChangeCount = 0;
  const affectedTables: string[] = [];
  const warningCount = diffTables.reduce((sum, table) => (
    sum + (Array.isArray(table.warnings) ? table.warnings.length : 0) + (Array.isArray(table.unsupportedObjects) ? table.unsupportedObjects.length : 0)
  ), 0);

  diffTables.forEach((table) => {
    if (!table?.canSync) return;
    const tableName = String(table.table || '').trim();
    const ops = tableOptions[tableName] || { insert: true, update: true, delete: false };
    const selectedInserts = resolveSelectedCount(ops.insert, clampCount(table.inserts), ops.selectedInsertPks);
    const selectedUpdates = resolveSelectedCount(ops.update, clampCount(table.updates), ops.selectedUpdatePks);
    const selectedDeletes = resolveSelectedCount(ops.delete, clampCount(table.deletes), ops.selectedDeletePks);
    const tableSchemaChanges = clampCount(table.schemaDiffCount);
    if (selectedInserts + selectedUpdates + selectedDeletes + tableSchemaChanges > 0 && tableName) {
      affectedTables.push(tableName);
    }
    insertCount += selectedInserts;
    updateCount += selectedUpdates;
    deleteCount += selectedDeletes;
    schemaChangeCount += tableSchemaChanges;
  });

  const fullOverwrite = syncMode === 'full_overwrite';
  const lines = [
    translate(language, 'dataModificationRisk.targetDatabase', { database: targetDatabase || translate(language, 'dataModificationRisk.notSelected') }),
    translate(language, 'dataModificationRisk.affectedTables', { tables: affectedTables.length > 0 ? summarizeTableNames(affectedTables, language) : translate(language, 'dataModificationRisk.noExecutableDifferences') }),
    translate(language, 'dataModificationRisk.dataSyncWillExecute', { insertCount, updateCount, deleteCount, schemaChangeCount }),
  ];
  if (fullOverwrite) {
    lines.push(translate(language, 'dataModificationRisk.fullOverwriteWarning'));
  }
  if (warningCount > 0) {
    lines.push(translate(language, 'dataModificationRisk.preflightWarnings', { count: warningCount }));
  }
  if (syncContent === 'both') {
    lines.push(translate(language, 'dataModificationRisk.schemaAndData'));
  }

  const level: DataModificationRiskLevel = fullOverwrite || deleteCount > 0 || schemaChangeCount > 0 ? 'high' : 'medium';
  return {
    level,
    lines,
    shortText: translate(language, 'dataModificationRisk.dataSyncShort', { insertCount, updateCount, deleteCount, schemaChangeCount }),
    requiresExplicitConfirm: level === 'high',
  };
};

export const buildSchemaSyncExecutionRiskSummary = ({
  language = 'en',
  targetDatabase,
  schemaDiffTables = [],
  selectedItemIds = [],
}: SchemaSyncExecutionRiskInput): DataModificationRiskSummary => {
  const selected = new Set(selectedItemIds);
  const affectedTables: string[] = [];
  let addCount = 0;
  let alterCount = 0;
  let dropCount = 0;
  let unsupportedCount = 0;

  schemaDiffTables.forEach((table) => {
    const tableName = String(table.table || '').trim();
    let tableAffected = false;
    (table.items || []).forEach((item) => {
      if (!item?.id || !selected.has(item.id)) return;
      tableAffected = true;
      if (item.supported === false) unsupportedCount += 1;
      const changeType = String(item.changeType || '').toUpperCase();
      if (changeType === 'DROP') dropCount += 1;
      else if (changeType === 'ALTER') alterCount += 1;
      else addCount += 1;
    });
    if (tableAffected && tableName) affectedTables.push(tableName);
  });

  const total = addCount + alterCount + dropCount;
  const lines = [
    translate(language, 'dataModificationRisk.targetDatabase', { database: targetDatabase || translate(language, 'dataModificationRisk.notSelected') }),
    translate(language, 'dataModificationRisk.affectedTables', { tables: affectedTables.length > 0 ? summarizeTableNames(affectedTables, language) : translate(language, 'dataModificationRisk.noSelectedSchemaChanges') }),
    translate(language, 'dataModificationRisk.schemaWillExecute', { addCount, alterCount, dropCount }),
  ];
  if (dropCount > 0) {
    lines.push(translate(language, 'dataModificationRisk.dropWarning'));
  }
  if (unsupportedCount > 0) {
    lines.push(translate(language, 'dataModificationRisk.unsupportedWarning', { count: unsupportedCount }));
  }

  const level = riskLevelFromDeletes(0, dropCount);
  return {
    level,
    lines,
    shortText: translate(language, 'dataModificationRisk.schemaShort', { total, dropCount }),
    requiresExplicitConfirm: dropCount > 0,
  };
};
