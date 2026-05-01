import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const enforcedFiles = new Set([
  'backend/src/main/java/com/javanavi/db/JdbcConnectionFactory.java',
]);

const files = execFileSync('git', ['ls-files', 'backend/src/main/java'], { encoding: 'utf8' })
  .split('\n')
  .map((item) => item.trim())
  .filter((file) => file.endsWith('.java') && enforcedFiles.has(file));

const violationPattern = /new\s+(?:IllegalArgumentException|IllegalStateException|RuntimeException)\s*\(\s*"/g;
const violations = [];
for (const file of files) {
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
  console.error('Raw backend exception string literals are not allowed in enforced files. Use LocalizedException or message keys.');
  for (const violation of violations) console.error(violation);
  process.exit(1);
}

console.log(`backend localized error check passed (${enforcedFiles.size} enforced file${enforcedFiles.size === 1 ? '' : 's'}).`);
