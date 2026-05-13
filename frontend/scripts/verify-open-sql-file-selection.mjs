import assert from 'node:assert/strict';

const moduleUrl = new URL('../src/compat/sqlFileSelection.ts', import.meta.url);
const sqlFileSelection = await import(moduleUrl.href);

assert.equal(
  sqlFileSelection.resolveSelectedSqlFilePath({ selected: false, path: '/tmp/example.sql' }),
  null,
  'cancelled selection should not be treated as a file path',
);
assert.equal(
  sqlFileSelection.resolveSelectedSqlFilePath({ selected: true, path: '/tmp/example.sql' }),
  '/tmp/example.sql',
  'selected SQL file should preserve its path',
);
assert.equal(
  sqlFileSelection.resolveSelectedSqlFilePath({ selected: true, path: '', filePath: '/tmp/fallback.sql' }),
  '/tmp/fallback.sql',
  'filePath fallback should still work for selected SQL files',
);
assert.equal(
  sqlFileSelection.resolveSelectedSqlFilePath({ selected: true, path: '', filePath: '' }),
  null,
  'selected SQL file without a path should be ignored',
);

console.log('SQL file selection guard check passed.');
