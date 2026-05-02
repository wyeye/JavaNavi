type TableHoverTitleInput = {
  tableName: unknown;
  comment?: unknown;
  tableNameLabel: string;
  commentLabel: string;
};

export const buildTableHoverTitle = ({
  tableName,
  comment,
  tableNameLabel,
  commentLabel,
}: TableHoverTitleInput): string => {
  const normalizedTableName = String(tableName ?? '').trim();
  const normalizedComment = String(comment ?? '').trim();
  const lines: string[] = [];

  if (normalizedTableName) {
    lines.push(`${tableNameLabel}: ${normalizedTableName}`);
  }
  if (normalizedComment) {
    lines.push(`${commentLabel}: ${normalizedComment}`);
  }

  return lines.join('\n') || normalizedTableName || normalizedComment;
};
