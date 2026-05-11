import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', 'backend/src/main/java'], { encoding: 'utf8' })
  .split('\n')
  .map((item) => item.trim())
  .filter((file) => file.endsWith('.java'));

const i18nSource = readFileSync('backend/src/main/java/com/javanavi/i18n/I18nMessages.java', 'utf8');
const violationPattern = /new\s+(?:[A-Za-z0-9_$.]*Exception)\s*\(\s*"([^"]+)"/g;
const violations = [];
const ignoredFiles = new Set([
  'backend/src/main/java/com/javanavi/i18n/I18nMessages.java',
]);

function coveredByI18n(literal) {
  const normalized = String(literal || '').trim();
  if (!normalized) return true;
  if (i18nSource.includes(normalized)) return true;
  const prefix = normalized.replace(/[\s:：.。]+$/u, '');
  if (prefix && i18nSource.includes(prefix)) return true;
  const hasGenericFallback = i18nSource.includes('I18nContext.language() == AppLanguage.ZH && !containsCjk(normalized)')
    && i18nSource.includes('backend.untranslatedError');
  return hasGenericFallback;
}

for (const file of files) {
  if (ignoredFiles.has(file)) continue;
  const source = readFileSync(file, 'utf8');
  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  for (const match of source.matchAll(violationPattern)) {
    const literal = match[1] || '';
    const index = match.index ?? 0;
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= index) low = mid + 1;
      else high = mid - 1;
    }
    if (!coveredByI18n(literal)) {
      violations.push(`${file}:${high + 1}: ${literal}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Raw backend exception string literals are not allowed unless localizeFallback covers them.');
  for (const violation of violations) console.error(violation);
  process.exit(1);
}

console.log(`backend localized error check passed (${files.length - ignoredFiles.size} enforced files).`);
