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
