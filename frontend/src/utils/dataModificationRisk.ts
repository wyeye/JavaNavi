export type DataModificationRiskLevel = 'low' | 'medium' | 'high';

export type DataModificationRiskSummary = {
  level: DataModificationRiskLevel;
  lines: string[];
  shortText: string;
  requiresExplicitConfirm: boolean;
};

type DataGridModificationRiskInput = {
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
  targetDatabase?: string;
  schemaDiffTables?: SchemaDiffTableLike[];
  selectedItemIds?: string[];
};

const clampCount = (value: unknown): number => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
};

const compactJoin = (parts: string[]): string => parts.filter(Boolean).join('，');

const resolveSelectedCount = (enabled: boolean | undefined, total: number, selected?: unknown[]): number => {
  if (!enabled || total <= 0) return 0;
  return Array.isArray(selected) && selected.length > 0 ? Math.min(selected.length, total) : total;
};

const summarizeTableNames = (names: string[], limit = 4): string => {
  const clean = names.map((name) => String(name || '').trim()).filter(Boolean);
  if (clean.length <= limit) return clean.join('、');
  return `${clean.slice(0, limit).join('、')} 等 ${clean.length} 张表`;
};

const riskLevelFromDeletes = (deleteCount: number, structuralDeleteCount = 0): DataModificationRiskLevel => {
  if (deleteCount > 0 || structuralDeleteCount > 0) return 'high';
  return 'medium';
};

export const buildDataGridModificationRiskSummary = ({
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
  const target = compactJoin([dbName ? `库 ${dbName}` : '', tableName ? `表 ${tableName}` : '']);
  const lines = [
    `目标：${target || '当前表'}`,
    `待提交：INSERT ${insertCount} rows，UPDATE ${updateCount} rows，DELETE ${deleteCount} rows`,
    deleteCount > 0 ? '包含删除行操作，请确认已了解影响范围。' : '本次不包含删除行操作。',
  ];
  return {
    level: riskLevelFromDeletes(deleteCount),
    lines,
    shortText: total > 0 ? `新增 ${insertCount}，更新 ${updateCount}，删除 ${deleteCount}` : '无待提交变更',
    requiresExplicitConfirm: deleteCount > 0,
  };
};

export const buildDataSyncExecutionRiskSummary = ({
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
    `目标库：${targetDatabase || '未选择'}`,
    `影响表：${affectedTables.length > 0 ? summarizeTableNames(affectedTables) : '无可执行差异'}`,
    `本次将执行：INSERT ${insertCount} rows，UPDATE ${updateCount} rows，DELETE ${deleteCount} rows，结构变更 ${schemaChangeCount} 项`,
  ];
  if (fullOverwrite) {
    lines.push('Full overwrite 会先清空目标表再写入数据。');
  }
  if (warningCount > 0) {
    lines.push(`预检风险或降级项：${warningCount} 项。`);
  }
  if (syncContent === 'both') {
    lines.push('本次同时包含结构与数据变更。');
  }

  const level: DataModificationRiskLevel = fullOverwrite || deleteCount > 0 || schemaChangeCount > 0 ? 'high' : 'medium';
  return {
    level,
    lines,
    shortText: `插入 ${insertCount}，更新 ${updateCount}，删除 ${deleteCount}，结构 ${schemaChangeCount}`,
    requiresExplicitConfirm: level === 'high',
  };
};

export const buildSchemaSyncExecutionRiskSummary = ({
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
    `目标库：${targetDatabase || '未选择'}`,
    `影响表：${affectedTables.length > 0 ? summarizeTableNames(affectedTables) : '无已选结构变更'}`,
    `本次将执行：ADD ${addCount} 项，ALTER ${alterCount} 项，DROP ${dropCount} 项`,
  ];
  if (dropCount > 0) {
    lines.push('包含 DROP 结构删除，请确认目标库已完成备份。');
  }
  if (unsupportedCount > 0) {
    lines.push(`包含不可执行项 ${unsupportedCount} 项，请重新检查勾选范围。`);
  }

  const level = riskLevelFromDeletes(0, dropCount);
  return {
    level,
    lines,
    shortText: `结构变更 ${total} 项，DROP ${dropCount} 项`,
    requiresExplicitConfirm: dropCount > 0,
  };
};
