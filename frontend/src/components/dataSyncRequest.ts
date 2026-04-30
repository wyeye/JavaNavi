export type SourceDatasetMode = 'table' | 'query';

type SyncContent = 'data' | 'schema' | 'both';
type TargetTableStrategy = 'existing_only' | 'auto_create_if_missing' | 'smart';

type BuildDataSyncRequestParams = {
  sourceConfig: any;
  targetConfig: any;
  selectedTables: string[];
  sourceDatasetMode: SourceDatasetMode;
  sourceQuery: string;
  syncContent: SyncContent;
  syncMode: string;
  autoAddColumns: boolean;
  targetTableStrategy: TargetTableStrategy;
  createIndexes: boolean;
  mongoCollectionName: string;
  jobId?: string;
  tableOptions?: Record<string, any>;
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
}: ValidateDataSyncSelectionParams): string | null => {
  if (sourceDatasetMode === 'query') {
    if (!String(sourceQuery || '').trim()) {
      return '请输入源查询 SQL';
    }
    if (selectedTables.length !== 1) {
      return 'SQL 结果集同步需要选择一个目标表';
    }
    if (syncContent !== 'data') {
      return 'SQL 结果集同步仅支持仅同步数据';
    }
    return null;
  }

  if (selectedTables.length === 0) {
    return '请选择至少一张表';
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
  mongoCollectionName,
  jobId,
  tableOptions,
}: BuildDataSyncRequestParams) => {
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
    mongoCollectionName: String(mongoCollectionName || '').trim(),
    ...(jobId ? { jobId } : {}),
    ...(tableOptions ? { tableOptions } : {}),
  };
};
