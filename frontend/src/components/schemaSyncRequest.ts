import type { I18nKey } from '../i18n';

type ConnectionConfigPayload = Record<string, any>;
export type SchemaSyncRequestPayload = {
  sourceConfig: ConnectionConfigPayload;
  targetConfig: ConnectionConfigPayload;
  sourceDatabase: string;
  targetDatabase: string;
  tables: string[];
  selectedItemIds?: string[];
  confirmedDeleteItemIds?: string[];
  jobId?: string;
};

type SchemaSyncBaseParams = {
  sourceConfig: ConnectionConfigPayload;
  targetConfig: ConnectionConfigPayload;
  sourceDatabase: string;
  targetDatabase: string;
  selectedTables: string[];
  jobId?: string;
};

type SchemaSyncRunParams = SchemaSyncBaseParams & {
  selectedItemIds: string[];
  confirmedDeleteItemIds: string[];
};

type SchemaSyncPreviewParams = SchemaSyncBaseParams & {
  selectedItemIds?: string[];
};

export const validateSchemaSyncSelection = ({
  selectedTables,
}: {
  selectedTables: string[];
}): I18nKey | null => {
  if (!Array.isArray(selectedTables) || selectedTables.length === 0) {
    return 'schemaSync.selection.tableRequired';
  }
  return null;
};

export const buildSchemaSyncAnalyzeRequest = ({
  sourceConfig,
  targetConfig,
  sourceDatabase,
  targetDatabase,
  selectedTables,
  jobId,
}: SchemaSyncBaseParams): SchemaSyncRequestPayload => ({
  sourceConfig,
  targetConfig,
  sourceDatabase,
  targetDatabase,
  tables: selectedTables,
  ...(jobId ? { jobId } : {}),
});

export const buildSchemaSyncPreviewRequest = ({
  sourceConfig,
  targetConfig,
  sourceDatabase,
  targetDatabase,
  selectedTables,
  selectedItemIds,
  jobId,
}: SchemaSyncPreviewParams): SchemaSyncRequestPayload => ({
  sourceConfig,
  targetConfig,
  sourceDatabase,
  targetDatabase,
  tables: selectedTables,
  ...(selectedItemIds ? { selectedItemIds } : {}),
  ...(jobId ? { jobId } : {}),
});

export const buildSchemaSyncRunRequest = ({
  sourceConfig,
  targetConfig,
  sourceDatabase,
  targetDatabase,
  selectedTables,
  selectedItemIds,
  confirmedDeleteItemIds,
  jobId,
}: SchemaSyncRunParams): SchemaSyncRequestPayload => ({
  sourceConfig,
  targetConfig,
  sourceDatabase,
  targetDatabase,
  tables: selectedTables,
  selectedItemIds,
  confirmedDeleteItemIds,
  ...(jobId ? { jobId } : {}),
});
