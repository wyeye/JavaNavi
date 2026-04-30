type ToolQueryResult = {
  success?: boolean;
  data?: unknown;
  message?: string;
};

type ResolveAITableSchemaToolResultParams = {
  tableName: string;
  fetchDDL: () => Promise<ToolQueryResult>;
  fetchColumns: () => Promise<ToolQueryResult>;
};

const stringifyToolData = (data: unknown): string => (
  typeof data === 'string' ? data : JSON.stringify(data)
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

const buildColumnFallbackContent = (tableName: string, ddlError: string, columns: unknown[]): string => {
  const normalizedColumns = columns.map(normalizeAIColumn).filter((column) => column.field.trim());
  const fieldNames = normalizedColumns.map((column) => column.field).join(', ');
  return [
    `⚠️ 表 ${tableName} 的 DDL 获取失败，已降级为字段元数据摘要。`,
    `DDL 错误：${ddlError || '未知错误'}`,
    '该结果不包含完整索引、约束、触发器等 DDL 信息；请基于字段列表继续分析，不要因为 DDL 权限失败而停止。',
    `可用字段：${fieldNames || '无'}`,
    `详细信息：${JSON.stringify(normalizedColumns)}`,
  ].join('\n');
};

export const resolveAITableSchemaToolResult = async ({
  tableName,
  fetchDDL,
  fetchColumns,
}: ResolveAITableSchemaToolResultParams): Promise<{ success: boolean; content: string }> => {
  const ddlResult = await fetchDDL();
  if (ddlResult?.success) {
    return { success: true, content: stringifyToolData(ddlResult.data) };
  }

  const ddlError = ddlResult?.message || 'Failed to fetch DDL';
  const columnResult = await fetchColumns();
  if (columnResult?.success && Array.isArray(columnResult.data)) {
    return { success: true, content: buildColumnFallbackContent(tableName, ddlError, columnResult.data) };
  }

  const columnError = columnResult?.message || 'Failed to fetch columns';
  return { success: false, content: `获取建表语句失败：${ddlError}；降级获取字段列表也失败：${columnError}` };
};
