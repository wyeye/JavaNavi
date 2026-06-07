import { DEFAULT_LANGUAGE, translate, type AppLanguage, type I18nParams } from '../i18n';

type ToolQueryResult = {
  success?: boolean;
  data?: unknown;
  message?: string;
};

type ResolveAITableSchemaToolResultParams = {
  tableName: string;
  fetchDDL: () => Promise<ToolQueryResult>;
  fetchColumns: () => Promise<ToolQueryResult>;
  language?: AppLanguage;
};

const stringifyToolData = (data: unknown): string => (
  typeof data === 'string' ? data : JSON.stringify(data)
);

const schemaText = (language: AppLanguage | undefined, key: Parameters<typeof translate>[1], params?: I18nParams): string => (
  translate(language || DEFAULT_LANGUAGE, key, params)
);

const firstStringValue = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }
  return '';
};

const normalizeAIColumn = (raw: unknown) => {
  const row = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const keys = Object.keys(row);
  return {
    field: firstStringValue(row, ['Field', 'field', 'COLUMN_NAME', 'column_name', 'Name', 'name']) || (keys.length > 0 ? String(row[keys[0]] ?? '') : ''),
    type: firstStringValue(row, ['Type', 'type', 'DATA_TYPE', 'data_type']) || (keys.length > 1 ? String(row[keys[1]] ?? '') : ''),
    nullable: firstStringValue(row, ['Null', 'null', 'IS_NULLABLE', 'is_nullable', 'Nullable', 'nullable']),
    default: firstStringValue(row, ['Default', 'default', 'COLUMN_DEFAULT', 'column_default', 'DefaultValue']),
    comment: firstStringValue(row, ['Comment', 'comment', 'COLUMN_COMMENT', 'column_comment', 'Description']),
  };
};

const buildColumnFallbackContent = (tableName: string, ddlError: string, columns: unknown[], language?: AppLanguage): string => {
  const normalizedColumns = columns.map(normalizeAIColumn).filter((column) => column.field.trim());
  const fieldNames = normalizedColumns.map((column) => column.field).join(', ');
  return [
    schemaText(language, 'ai.tableSchemaTool.ddlFallbackNotice', { table: tableName }),
    schemaText(language, 'ai.tableSchemaTool.ddlError', { message: ddlError || schemaText(language, 'message.unknownError') }),
    schemaText(language, 'ai.tableSchemaTool.ddlFallbackGuide'),
    schemaText(language, 'ai.tableSchemaTool.availableFields', { fields: fieldNames || schemaText(language, 'ai.tableSchemaTool.noFields') }),
    schemaText(language, 'ai.tableSchemaTool.details', { details: JSON.stringify(normalizedColumns) }),
  ].join('\n');
};

export const resolveAITableSchemaToolResult = async ({
  tableName,
  fetchDDL,
  fetchColumns,
  language,
}: ResolveAITableSchemaToolResultParams): Promise<{ success: boolean; content: string }> => {
  const ddlResult = await fetchDDL();
  if (ddlResult?.success) {
    return { success: true, content: stringifyToolData(ddlResult.data) };
  }

  const ddlError = ddlResult?.message || 'Failed to fetch DDL';
  const columnResult = await fetchColumns();
  if (columnResult?.success && Array.isArray(columnResult.data)) {
    return { success: true, content: buildColumnFallbackContent(tableName, ddlError, columnResult.data, language) };
  }

  const columnError = columnResult?.message || 'Failed to fetch columns';
  return { success: false, content: schemaText(language, 'ai.tableSchemaTool.ddlFallbackFailed', { ddlError, columnError }) };
};
