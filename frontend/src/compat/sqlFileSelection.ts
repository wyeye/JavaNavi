export type SqlFileSelectionLike = {
  selected?: boolean;
  path?: unknown;
  filePath?: unknown;
};

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : String(value ?? '').trim()
);

export const resolveSelectedSqlFilePath = (selection: SqlFileSelectionLike): string | null => {
  if (selection.selected !== true) return null;
  const path = textValue(selection.path) || textValue(selection.filePath);
  return path || null;
};
