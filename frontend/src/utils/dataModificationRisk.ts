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
  return language === 'zh' ? `${shown} 等 ${clean.length} 张表` : `${shown}, and ${clean.length} tables total`;
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
  if (language === 'zh') {
    return `待提交：新增 ${insertCount} 行，更新 ${updateCount} 行，删除 ${deleteCount} 行`;
  }
  return `Pending: INSERT ${insertCount} rows, UPDATE ${updateCount} rows, DELETE ${deleteCount} rows`;
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
  const lines = language === 'zh'
    ? [
        `目标库：${targetDatabase || '未选择'}`,
        `影响表：${affectedTables.length > 0 ? summarizeTableNames(affectedTables, language) : '无可执行差异'}`,
        `本次将执行：INSERT ${insertCount} rows，UPDATE ${updateCount} rows，DELETE ${deleteCount} rows，结构变更 ${schemaChangeCount} 项`,
      ]
    : [
        `Target database: ${targetDatabase || 'not selected'}`,
        `Affected tables: ${affectedTables.length > 0 ? summarizeTableNames(affectedTables, language) : 'no executable differences'}`,
        `This run will execute: INSERT ${insertCount} rows, UPDATE ${updateCount} rows, DELETE ${deleteCount} rows, schema changes ${schemaChangeCount}`,
      ];
  if (fullOverwrite) {
    lines.push(language === 'zh' ? 'Full overwrite 会先清空目标表再写入数据。' : 'Full overwrite clears target tables before writing data.');
  }
  if (warningCount > 0) {
    lines.push(language === 'zh' ? `预检风险或降级项：${warningCount} 项。` : `Preflight risks or fallback items: ${warningCount}.`);
  }
  if (syncContent === 'both') {
    lines.push(language === 'zh' ? '本次同时包含结构与数据变更。' : 'This run includes both schema and data changes.');
  }

  const level: DataModificationRiskLevel = fullOverwrite || deleteCount > 0 || schemaChangeCount > 0 ? 'high' : 'medium';
  return {
    level,
    lines,
    shortText: language === 'zh' ? `插入 ${insertCount}，更新 ${updateCount}，删除 ${deleteCount}，结构 ${schemaChangeCount}` : `INSERT ${insertCount}, UPDATE ${updateCount}, DELETE ${deleteCount}, schema ${schemaChangeCount}`,
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
  const lines = language === 'zh'
    ? [
        `目标库：${targetDatabase || '未选择'}`,
        `影响表：${affectedTables.length > 0 ? summarizeTableNames(affectedTables, language) : '无已选结构变更'}`,
        `本次将执行：ADD ${addCount} 项，ALTER ${alterCount} 项，DROP ${dropCount} 项`,
      ]
    : [
        `Target database: ${targetDatabase || 'not selected'}`,
        `Affected tables: ${affectedTables.length > 0 ? summarizeTableNames(affectedTables, language) : 'no selected schema changes'}`,
        `This run will execute: ADD ${addCount}, ALTER ${alterCount}, DROP ${dropCount}`,
      ];
  if (dropCount > 0) {
    lines.push(language === 'zh' ? '包含 DROP 结构删除，请确认目标库已完成备份。' : 'Includes DROP schema deletion. Confirm that the target database is backed up.');
  }
  if (unsupportedCount > 0) {
    lines.push(language === 'zh' ? `包含不可执行项 ${unsupportedCount} 项，请重新检查勾选范围。` : `Includes ${unsupportedCount} non-executable items. Review the selected scope.`);
  }

  const level = riskLevelFromDeletes(0, dropCount);
  return {
    level,
    lines,
    shortText: language === 'zh' ? `结构变更 ${total} 项，DROP ${dropCount} 项` : `Schema changes ${total}, DROP ${dropCount}`,
    requiresExplicitConfirm: dropCount > 0,
  };
};
