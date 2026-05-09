import type { AIContextItem, AIContextLevel } from '../types';

export type BuildDatabaseContextMessageParams = {
  contextLevel: AIContextLevel;
  dbType: string;
  connectionName: string;
  dbName: string;
  activeContextItems: AIContextItem[];
  availableTables?: string[];
};

const formatDatabaseType = (dbType: string): string => {
  const normalized = String(dbType || '').trim();
  if (!normalized) return 'unknown';
  if (normalized === 'diros') return 'Doris';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatDDLBlocks = (activeContextItems: AIContextItem[]): string[] => (
  activeContextItems.map((item) => `Table ${item.tableName}\n${item.ddl}`)
);

export const buildDatabaseContextMessage = ({
  contextLevel,
  dbType,
  connectionName,
  dbName,
  activeContextItems,
  availableTables = [],
}: BuildDatabaseContextMessageParams): string | null => {
  if (contextLevel === 'none') return null;

  const header = [
    'You are a professional database assistant.',
    `Current connection: ${connectionName || '-'}`,
    `Database type: ${formatDatabaseType(dbType)}`,
    `Database/schema: ${dbName || '-'}`,
    `Use ${formatDatabaseType(dbType)} SQL dialect when generating SQL.`,
  ];

  const ddlBlocks = formatDDLBlocks(activeContextItems);

  if (contextLevel === 'schema_only') {
    if (ddlBlocks.length === 0) {
      return [
        ...header,
        'No table schema has been attached yet. When the user asks about a specific table, use tools to fetch the real schema before generating SQL.',
      ].join('\n\n');
    }
    return [
      ...header,
      'Attached schema context:',
      ...ddlBlocks,
    ].join('\n\n');
  }

  const fullContextSections = [
    ...header,
    `Available tables: ${availableTables.length > 0 ? availableTables.join(', ') : '(not loaded)'}`,
  ];

  if (ddlBlocks.length === 0) {
    fullContextSections.push(
      'No table schema has been attached yet. Use the current connection and available table list to decide which schema to fetch before generating SQL.',
    );
  } else {
    fullContextSections.push('Attached schema context:', ...ddlBlocks);
  }

  return fullContextSections.join('\n\n');
};
