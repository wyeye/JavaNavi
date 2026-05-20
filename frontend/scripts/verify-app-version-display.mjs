import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tempDir = path.join(projectRoot, '.tmp-app-version-display-tests');

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

try {
  const sourcePath = path.join(projectRoot, 'src/utils/appVersionDisplay.ts');
  const source = await readFile(sourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      sourceMap: false,
    },
    fileName: sourcePath,
  });
  const outputPath = path.join(tempDir, 'appVersionDisplay.mjs');
  await writeFile(outputPath, transpiled.outputText, 'utf8');
  const { resolveAboutDisplayVersion } = await import(pathToFileURL(outputPath));

  assert.equal(
    resolveAboutDisplayVersion('production', '0.2.1'),
    '0.2.1',
    'production builds should display the backend reported version',
  );
  assert.equal(
    resolveAboutDisplayVersion('dev', '0.2.1'),
    '0.2.1',
    'development builds should not replace a real backend reported version',
  );
  assert.equal(
    resolveAboutDisplayVersion('dev', ''),
    '0.0.1-dev',
    'development builds should only use the dev fallback when no version is available',
  );

  console.log('App version display check passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
