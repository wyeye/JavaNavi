import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', [
  'ls-files',
  'frontend/src',
  ':(exclude)frontend/src/i18n/**',
  ':(exclude)frontend/src/vite-plugins/**',
], { encoding: 'utf8' })
  .split('\n')
  .map((item) => item.trim())
  .filter((file) => /\.(tsx?|jsx?)$/.test(file));

const enforcedFiles = new Set([
  'frontend/src/components/DataSyncModal.tsx',
]);

const violationPattern = /message\.(?:error|success|warning|info|loading|open)\(\s*(?:"[^"\n]*"|'[^'\n]*'|`[^`\n]*`)/g;
const violations = [];
for (const file of files) {
  if (!enforcedFiles.has(file)) continue;
  const source = readFileSync(file, 'utf8');
  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  for (const match of source.matchAll(violationPattern)) {
    const index = match.index ?? 0;
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= index) low = mid + 1;
      else high = mid - 1;
    }
    violations.push(`${file}:${high + 1}: ${match[0]}`);
  }
}

if (violations.length > 0) {
  console.error('Hardcoded Ant Design message literals are not allowed in enforced i18n files. Use translate(...).');
  for (const violation of violations) console.error(violation);
  process.exit(1);
}

console.log(`i18n message literal check passed (${enforcedFiles.size} enforced file${enforcedFiles.size === 1 ? '' : 's'}).`);
