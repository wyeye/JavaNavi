import { quoteQualifiedIdent } from './sql';

export const buildTableSelectQuery = (dbType: string, tableName: string): string => {
  const normalizedTableName = String(tableName || '').trim();
  if (!normalizedTableName) {
    return 'SELECT * FROM ';
  }
  return `SELECT * FROM ${quoteQualifiedIdent(dbType, normalizedTableName)};`;
};
