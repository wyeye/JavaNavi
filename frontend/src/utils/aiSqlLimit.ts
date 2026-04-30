import { buildPaginatedSelectSQL } from './sql';
import { resolveSqlDialect } from './sqlDialect';

const AI_READONLY_SQL_KEYWORDS = new Set(['select', 'show', 'describe', 'desc', 'explain', 'with', 'pragma', 'values']);

const trimSQLStatement = (sql: string): string => String(sql || '').trim().replace(/;\s*$/, '').trim();

const isAIReadonlySQL = (sql: string): boolean => {
  const firstWord = trimSQLStatement(sql).trimStart().split(/\s+/)[0]?.toLowerCase() || '';
  return AI_READONLY_SQL_KEYWORDS.has(firstWord);
};

const hasExistingRowLimit = (dialect: string, sql: string): boolean => {
  const text = trimSQLStatement(sql).toLowerCase();
  if (!text) return false;
  if (/\blimit\s+\d+\b/.test(text)) return true;
  if (/\bfetch\s+(first|next)\s+\d+\s+rows?\b/.test(text)) return true;
  if (/\btop\s*\(?\s*\d+\s*\)?\b/.test(text)) return true;

  return (dialect === 'oracle' || dialect === 'dameng') && /\brownum\b/.test(text);
};

export const buildAIReadonlyPreviewSQL = (dbType: string, sql: string, limit = 50, driver = ''): string => {
  const baseSQL = trimSQLStatement(sql);
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  const dialect = resolveSqlDialect(dbType, driver);
  if (!baseSQL || safeLimit <= 0 || !isAIReadonlySQL(baseSQL) || hasExistingRowLimit(dialect, baseSQL)) {
    return baseSQL;
  }
  return buildPaginatedSelectSQL(dialect, baseSQL, '', safeLimit, 0);
};
