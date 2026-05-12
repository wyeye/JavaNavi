import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tempDir = path.join(projectRoot, '.tmp-custom-datasource-tests');

async function transpileToModule(sourcePath, outputName) {
  const source = await readFile(path.join(projectRoot, sourcePath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      sourceMap: false,
    },
    fileName: sourcePath,
  });
  const outputPath = path.join(tempDir, outputName);
  await writeFile(outputPath, transpiled.outputText, 'utf8');
  return import(pathToFileURL(outputPath));
}

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });
try {
  const customDataSources = await transpileToModule('src/utils/customDataSources.ts', 'customDataSources.mjs');
  const presentation = await transpileToModule('src/utils/connectionModalPresentation.ts', 'connectionModalPresentation.mjs');
  const sslMode = await transpileToModule('src/utils/sslMode.ts', 'sslMode.mjs');
  const dataGridValue = await transpileToModule('src/components/dataGrid/dataGridValue.ts', 'dataGridValue.mjs');
  const dataSyncRequest = await transpileToModule('src/components/dataSyncRequest.ts', 'dataSyncRequest.mjs');
  const schemaSyncRequest = await transpileToModule('src/components/schemaSyncRequest.ts', 'schemaSyncRequest.mjs');
  const sidebarTreeNavigation = await transpileToModule('src/components/sidebarTreeNavigation.ts', 'sidebarTreeNavigation.mjs');
  const driverSelection = await transpileToModule('src/utils/driverSelection.ts', 'driverSelection.mjs');
  const dataSourceCapabilities = await transpileToModule('src/utils/dataSourceCapabilities.ts', 'dataSourceCapabilities.mjs');
  const shortcuts = await transpileToModule('src/utils/shortcuts.ts', 'shortcuts.mjs');
  const aiProviderPresets = await transpileToModule('src/utils/aiProviderPresets.ts', 'aiProviderPresets.mjs');
  const providerSecretDraft = await transpileToModule('src/utils/providerSecretDraft.ts', 'providerSecretDraft.mjs');
  const dataModificationRisk = await transpileToModule('src/utils/dataModificationRisk.ts', 'dataModificationRisk.mjs');
  const javanaviAppSource = await readFile(path.join(projectRoot, 'src/compat/javanaviApp.ts'), 'utf8');

  assert.equal(
    javanaviAppSource.includes('payload.isLargeFile === true'),
    true,
    'large local SQL file execution should fail before query/multi',
  );
  assert.equal(
    javanaviAppSource.includes('Large local SQL file execution is not available yet.'),
    true,
    'large local SQL file guard should return a clear failure message',
  );

  const latin1DecodedUploadVersion = Buffer.from('上传-1.0', 'utf8').toString('latin1');
  assert.equal(
    customDataSources.normalizePossiblyMojibakeText(latin1DecodedUploadVersion),
    '上传-1.0',
    'UTF-8 bytes decoded as Latin-1 should be repaired',
  );
  assert.equal(
    customDataSources.normalizePossiblyMojibakeText('ä¸�ä¼ -1.0'),
    '上传-1.0',
    'known lossy default upload version should be mapped to the intended label',
  );
  assert.equal(
    customDataSources.normalizePossiblyMojibakeText('1.2.3'),
    '1.2.3',
    'plain ASCII versions should stay unchanged',
  );
  assert.equal(
    customDataSources.normalizePossiblyMojibakeText('Ångström-1.0'),
    'Ångström-1.0',
    'legitimate Latin text should not be over-normalized',
  );

  const source = customDataSources.createCustomDataSource({
    name: '示例数据源',
    driverType: 'example-driver',
    version: latin1DecodedUploadVersion,
  });
  assert.equal(source.version, '上传-1.0');
  assert.equal(source.driverVersion, '上传-1.0');

  assert.equal(sslMode.normalizeSSLMode(undefined), 'required');
  assert.equal(sslMode.normalizeSSLMode('preferred'), 'preferred');
  assert.equal(sslMode.resolveEffectiveSSLMode(undefined, false), 'disable');
  assert.equal(sslMode.resolveEffectiveSSLMode('disable', true), 'required');
  assert.equal(sslMode.resolveEffectiveSSLMode('preferred', true), 'preferred');
  assert.equal(sslMode.isInsecureSSLMode('preferred'), true);
  assert.equal(sslMode.isInsecureSSLMode('required'), false);

  assert.equal(dataGridValue.normalizeDateTimeString('2024-05-13T08:32:47.123Z'), '2024-05-13 08:32:47');
  assert.equal(dataGridValue.normalizeDateTimeString('0000-00-00 00:00:00'), '0000-00-00 00:00:00');
  assert.equal(dataGridValue.formatCellDisplayText({ id: 1, name: 'demo' }), '{"id":1,"name":"demo"}');
  assert.equal(dataGridValue.isCellValueEqualForDiff(null, undefined), true);
  assert.equal(dataGridValue.isCellValueEqualForDiff('2024-05-13T08:32:47Z', '2024-05-13 08:32:47'), true);

  assert.equal(
    dataSyncRequest.validateDataSyncSelection({ sourceDatasetMode: 'query', selectedTables: [], sourceQuery: '', syncContent: 'data' }),
    'dataSync.selection.sourceQueryRequired',
  );
  assert.equal(
    dataSyncRequest.validateDataSyncSelection({ sourceDatasetMode: 'query', selectedTables: ['target'], sourceQuery: 'select 1', syncContent: 'schema' }),
    'dataSync.selection.queryDataOnly',
  );
  assert.equal(
    dataSyncRequest.validateDataSyncSelection({ sourceDatasetMode: 'table', selectedTables: [], sourceQuery: '', syncContent: 'data' }),
    'dataSync.selection.tableRequired',
  );
  assert.equal(
    dataSyncRequest.validateDataSyncSelection({ sourceDatasetMode: 'table', selectedTables: ['users'], sourceQuery: '', syncContent: 'data' }),
    null,
  );
  assert.equal(
    schemaSyncRequest.validateSchemaSyncSelection({ selectedTables: [] }),
    'schemaSync.selection.tableRequired',
  );
  assert.equal(
    schemaSyncRequest.validateSchemaSyncSelection({ selectedTables: ['users'] }),
    null,
  );
  assert.deepEqual(
    schemaSyncRequest.buildSchemaSyncAnalyzeRequest({
      sourceConfig: { id: 'source' },
      targetConfig: { id: 'target' },
      sourceDatabase: 'db_a',
      targetDatabase: 'db_b',
      selectedTables: ['users'],
    }),
    {
      sourceConfig: { id: 'source' },
      targetConfig: { id: 'target' },
      sourceDatabase: 'db_a',
      targetDatabase: 'db_b',
      tables: ['users'],
    },
  );
  assert.deepEqual(
    schemaSyncRequest.buildSchemaSyncRunRequest({
      sourceConfig: { id: 'source' },
      targetConfig: { id: 'target' },
      sourceDatabase: 'db_a',
      targetDatabase: 'db_b',
      selectedTables: ['users'],
      selectedItemIds: ['users:COLUMN:name:ADD'],
      confirmedDeleteItemIds: ['users:INDEX:idx_old:DROP'],
      jobId: 'job-1',
    }),
    {
      sourceConfig: { id: 'source' },
      targetConfig: { id: 'target' },
      sourceDatabase: 'db_a',
      targetDatabase: 'db_b',
      tables: ['users'],
      selectedItemIds: ['users:COLUMN:name:ADD'],
      confirmedDeleteItemIds: ['users:INDEX:idx_old:DROP'],
      jobId: 'job-1',
    },
  );

  assert.deepEqual(
    sidebarTreeNavigation.getActiveSidebarTableTarget({ type: 'table', connectionId: 'conn-1', dbName: 'demo', tableName: 'users' }),
    { connectionId: 'conn-1', dbName: 'demo', tableName: 'users' },
  );
  assert.equal(sidebarTreeNavigation.getActiveSidebarTableTarget({ type: 'query', connectionId: 'conn-1' }), null);

  const mysqlDriverOptions = [
    { driverType: 'mysql', databaseType: 'mysql', driverName: 'MySQL' },
    { driverType: 'mariadb', databaseType: 'mysql', driverName: 'MariaDB' },
    { driverType: 'postgres', databaseType: 'postgres', driverName: 'PostgreSQL' },
    { driverType: 'oracle', driverName: 'Oracle' },
  ];
  assert.deepEqual(
    driverSelection.filterDriverOptionsForDatabase('mysql', mysqlDriverOptions).map((option) => option.driverType),
    ['mysql'],
    'existing MySQL datasource should only expose MySQL driver choices',
  );
  assert.equal(
    driverSelection.resolveDefaultDriverTypeForDatabase('mysql', 'mariadb', mysqlDriverOptions),
    'mysql',
    'cross-type saved defaults should fall back to the datasource driver',
  );
  assert.deepEqual(
    driverSelection.filterDriverOptionsForDatabase('doris', [{ driverType: 'diros', databaseType: 'diros' }]).map((option) => option.driverType),
    ['diros'],
    'datasource aliases should normalize before option filtering',
  );

  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'mysql' }).supportsImport, true);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'postgresql' }).supportsImport, true);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'sqlite' }).supportsImport, true);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'duckdb' }).supportsImport, true);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'custom', driver: 'kingbase' }).supportsImport, true);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'mongodb' }).supportsImport, false);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'oracle' }).supportsImport, false);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'sqlserver' }).supportsImport, false);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'clickhouse' }).supportsImport, false);
  assert.equal(dataSourceCapabilities.getDataSourceCapabilities({ type: 'redis' }).supportsImport, false);

  assert.equal(
    shortcuts.DEFAULT_SHORTCUT_OPTIONS.saveQuery.combo,
    'Ctrl+S',
    'query save shortcut should default to Ctrl+S',
  );
  assert.equal(
    shortcuts.SHORTCUT_ACTION_META.saveQuery.scope,
    'queryEditor',
    'query save shortcut should be scoped to the query editor',
  );
  assert.equal(
    shortcuts.isQuerySaveShortcutMatch({ key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, 'Ctrl+S'),
    true,
    'Ctrl+S should trigger query save',
  );
  assert.equal(
    shortcuts.isQuerySaveShortcutMatch({ key: 's', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }, 'Ctrl+S'),
    true,
    'default query save shortcut should also accept Meta+S',
  );
  assert.equal(
    shortcuts.isQuerySaveShortcutMatch({ key: 's', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }, 'Ctrl+Alt+S'),
    false,
    'Meta+S compatibility should not leak into customized save shortcuts',
  );

  assert.deepEqual(
    aiProviderPresets.resolvePresetModelSelection({
      presetKey: 'openai',
      presetDefaultModel: 'gpt-4o',
      presetModels: [],
      valuesModel: 'gpt-5.5',
      customModels: ['gpt-5.5', 'gpt-5-mini'],
    }),
    { model: 'gpt-5.5', models: ['gpt-5.5', 'gpt-5-mini'] },
    'remote-fetched models should be preserved for presets without a static catalog',
  );
  assert.deepEqual(
    aiProviderPresets.resolvePresetModelSelection({
      presetKey: 'qwen-coding-plan',
      presetDefaultModel: '',
      presetModels: ['qwen3-coder-plus'],
      valuesModel: '',
      customModels: ['remote-model'],
    }),
    { model: '', models: ['qwen3-coder-plus'] },
    'static catalog presets should keep their curated model list without forcing a default selection',
  );
  assert.equal(
    aiProviderPresets.supportsOpenAiCompatibleTransport({ type: 'openai' }),
    true,
    'OpenAI backend type should support JavaNavi OpenAI-compatible HTTP transport',
  );
  assert.equal(
    aiProviderPresets.supportsOpenAiCompatibleTransport({ type: 'custom', apiFormat: 'openai' }),
    true,
    'custom OpenAI-compatible format should support model discovery',
  );
  assert.equal(
    aiProviderPresets.supportsOpenAiCompatibleTransport({ type: 'anthropic', apiFormat: 'openai' }),
    false,
    'non-custom Anthropic providers should not be upgraded by a forged OpenAI API format',
  );
  assert.equal(
    aiProviderPresets.supportsOpenAiCompatibleTransport({ type: 'custom', apiFormat: 'anthropic' }),
    false,
    'custom Anthropic format should not use OpenAI-compatible model discovery',
  );
  assert.equal(
    aiProviderPresets.supportsOpenAiCompatibleTransport({ type: 'gemini' }),
    false,
    'Gemini format should not use OpenAI-compatible model discovery',
  );
  assert.equal(
    aiProviderPresets.supportsOpenAiCompatibleTransport({ type: 'anthropic' }),
    false,
    'non-OpenAI-compatible provider types should not be auto transport-enabled',
  );
  assert.equal(
    aiProviderPresets.supportsOpenAiCompatibleTransport({ type: 'custom', apiFormat: 'claude-cli' }),
    false,
    'Claude CLI custom format should not use OpenAI-compatible HTTP transport',
  );
  assert.deepEqual(
    providerSecretDraft.resolveProviderSecretDraft({
      hasSecret: true,
      apiKeyInput: 'replacement-secret',
      clearSecret: false,
    }),
    { mode: 'replace', apiKey: 'replacement-secret', hasSecret: true },
    'typed replacement API key should win after stale clear intent is suppressed',
  );

  const gridRisk = dataModificationRisk.buildDataGridModificationRiskSummary({
    tableName: 'users',
    dbName: 'crm',
    inserts: [{ id: 3 }],
    updates: [{ id: 1 }],
    deletes: [{ id: 2 }, { id: 4 }],
  });
  assert.equal(gridRisk.level, 'high');
  assert.equal(gridRisk.requiresExplicitConfirm, true);
  assert.equal(gridRisk.shortText, '新增 1，更新 1，删除 2');
  assert.equal(
    gridRisk.lines.some((line) => line.includes('DELETE 2 rows')),
    true,
    'table edit risk summary should expose delete count',
  );

  const syncRisk = dataModificationRisk.buildDataSyncExecutionRiskSummary({
    syncMode: 'full_overwrite',
    syncContent: 'both',
    targetDatabase: 'target_db',
    diffTables: [
      { table: 'users', canSync: true, inserts: 10, updates: 2, deletes: 4, schemaDiffCount: 1, warnings: ['type changed'] },
      { table: 'orders', canSync: true, inserts: 5, updates: 0, deletes: 0, schemaDiffCount: 0 },
    ],
    tableOptions: {
      users: { insert: true, update: true, delete: true, selectedDeletePks: ['1', '2'] },
      orders: { insert: false, update: true, delete: false },
    },
  });
  assert.equal(syncRisk.level, 'high');
  assert.equal(syncRisk.requiresExplicitConfirm, true);
  assert.equal(syncRisk.shortText, '插入 10，更新 2，删除 2，结构 1');
  assert.equal(
    syncRisk.lines.some((line) => line.includes('Full overwrite')),
    true,
    'full overwrite risk summary should be explicit',
  );

  const schemaRisk = dataModificationRisk.buildSchemaSyncExecutionRiskSummary({
    targetDatabase: 'target_db',
    selectedItemIds: ['users:column:name:alter', 'users:index:old:drop'],
    schemaDiffTables: [{
      table: 'users',
      items: [
        { id: 'users:column:name:alter', changeType: 'ALTER', objectType: 'COLUMN', objectName: 'name', supported: true },
        { id: 'users:index:old:drop', changeType: 'DROP', objectType: 'INDEX', objectName: 'old_idx', requiresDeleteConfirm: true, supported: true },
      ],
    }],
  });
  assert.equal(schemaRisk.level, 'high');
  assert.equal(schemaRisk.requiresExplicitConfirm, true);
  assert.equal(schemaRisk.shortText, '结构变更 2 项，DROP 1 项');
  assert.equal(
    schemaRisk.lines.some((line) => line.includes('DROP 1')),
    true,
    'schema risk summary should expose DROP count',
  );

  const frontendFallback = customDataSources.createCustomDataSource({
    name: '本地缓存源',
    driverType: 'custom-demo',
    version: '0.9',
    runtimeStatus: { connectionTested: true },
  });
  const mergedAuthoritative = customDataSources.mergeBackendCustomDataSourceDefinitions(
    [frontendFallback],
    [{
      driverType: 'custom-demo',
      driverName: '后端权威源',
      version: latin1DecodedUploadVersion,
      driverClassName: 'com.example.Driver',
      jarFileNames: ['demo.jar'],
      definitionUsable: true,
    }],
    { backendAuthoritative: true },
  );
  assert.equal(mergedAuthoritative.length, 1);
  assert.equal(mergedAuthoritative[0].name, '本地缓存源');
  assert.equal(mergedAuthoritative[0].version, '上传-1.0');
  assert.equal(mergedAuthoritative[0].driverClassName, 'com.example.Driver');
  assert.equal(mergedAuthoritative[0].runtimeStatus.connectionTested, true);
  assert.equal(mergedAuthoritative[0].runtimeStatus.definitionUsable, true);

  const customLayout = presentation.resolveConnectionConfigLayout('custom');
  assert.deepEqual(
    customLayout.sections,
    ['identity', 'customDriver', 'customDsn', 'credentials'],
    'custom layout metadata should include the rendered credentials section',
  );
  assert.equal(
    presentation.getConnectionConfigSectionCopy('credentials').title,
    '认证凭据',
  );

  console.log('custom datasource utility regression checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
