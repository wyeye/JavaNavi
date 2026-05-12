import type { I18nKey } from '../i18n';
import type { connection, sync } from '../compat/models';

export type SourceDatasetMode = 'table' | 'query';

type ConnectionConfigPayload = connection.ConnectionConfig;
export type DataSyncTableOptionsPayload = sync.TableOptions;
type DataSyncRequestContract = sync.SyncConfig;
type SyncContent = NonNullable<DataSyncRequestContract['content']>;
type TargetTableStrategy = 'existing_only' | 'auto_create_if_missing' | 'smart';

export type DataSyncRequestPayload = DataSyncRequestContract;
type BuildDataSyncRequestParams = {
  sourceConfig: ConnectionConfigPayload;
  targetConfig: ConnectionConfigPayload;
  selectedTables: string[];
  sourceDatasetMode: SourceDatasetMode;
  sourceQuery: string;
  syncContent: SyncContent;
  syncMode: string;
  autoAddColumns: boolean;
  targetTableStrategy: TargetTableStrategy;
  createIndexes: boolean;
  jobId?: string;
  tableOptions?: Record<string, DataSyncTableOptionsPayload>;
};

type ValidateDataSyncSelectionParams = {
  sourceDatasetMode: SourceDatasetMode;
  selectedTables: string[];
  sourceQuery: string;
  syncContent: SyncContent;
};

export const validateDataSyncSelection = ({
  sourceDatasetMode,
  selectedTables,
  sourceQuery,
  syncContent,
}: ValidateDataSyncSelectionParams): I18nKey | null => {
  if (sourceDatasetMode === 'query') {
    if (!String(sourceQuery || '').trim()) {
      return 'dataSync.selection.sourceQueryRequired';
    }
    if (selectedTables.length !== 1) {
      return 'dataSync.selection.queryTargetTableRequired';
    }
    if (syncContent !== 'data') {
      return 'dataSync.selection.queryDataOnly';
    }
    return null;
  }

  if (selectedTables.length === 0) {
    return 'dataSync.selection.tableRequired';
  }
  return null;
};

export const buildDataSyncRequest = ({
  sourceConfig,
  targetConfig,
  selectedTables,
  sourceDatasetMode,
  sourceQuery,
  syncContent,
  syncMode,
  autoAddColumns,
  targetTableStrategy,
  createIndexes,
  jobId,
  tableOptions,
}: BuildDataSyncRequestParams): DataSyncRequestPayload => {
  const isQueryMode = sourceDatasetMode === 'query';

  return {
    sourceConfig,
    targetConfig,
    tables: selectedTables,
    sourceQuery: isQueryMode ? String(sourceQuery || '').trim() : undefined,
    content: isQueryMode ? 'data' : syncContent,
    mode: syncMode,
    autoAddColumns: isQueryMode ? false : autoAddColumns,
    targetTableStrategy: isQueryMode ? 'existing_only' : targetTableStrategy,
    createIndexes: isQueryMode ? false : createIndexes,
    ...(jobId ? { jobId } : {}),
    ...(tableOptions ? { tableOptions } : {}),
  } satisfies sync.SyncConfig;
};
