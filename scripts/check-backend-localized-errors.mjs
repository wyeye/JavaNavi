import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', 'backend/src/main/java'], { encoding: 'utf8' })
  .split('\n')
  .map((item) => item.trim())
  .filter((file) => file.endsWith('.java'));

const i18nSource = readFileSync('backend/src/main/java/com/javanavi/i18n/I18nMessages.java', 'utf8');
const placeholderPattern = /\{([A-Za-z0-9_.-]+)\}/g;
const enResource = readProperties('backend/src/main/resources/i18n/messages_en.properties');
const zhResource = readProperties('backend/src/main/resources/i18n/messages_zh_CN.properties');
const legacyMessageResource = readProperties('backend/src/main/resources/i18n/legacy-message-codes.properties');
const resourceViolations = [
  ...validateResources(enResource, zhResource),
  ...validateLegacyMessageCodes(legacyMessageResource, enResource),
];
const i18nCorpus = [
  i18nSource,
  ...Object.keys(enResource),
  ...Object.values(enResource),
  ...Object.values(zhResource),
  ...Object.keys(legacyMessageResource),
  ...Object.values(legacyMessageResource),
].join('\n');

const violationPattern = /new\s+(?:[A-Za-z0-9_$.]*Exception)\s*\(\s*"([^"]+)"/g;
const violations = [];
const ignoredFiles = new Set([
  'backend/src/main/java/com/javanavi/i18n/I18nMessages.java',
]);
function unescapePropertyValue(value) {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (ch !== '\\') {
      result += ch;
      continue;
    }
    index += 1;
    if (index >= value.length) {
      result += '\\';
      break;
    }
    const escaped = value[index];
    if (escaped === 'n') result += '\n';
    else if (escaped === 'r') result += '\r';
    else if (escaped === 't') result += '\t';
    else if (escaped === 'f') result += '\f';
    else if (escaped === 'u' && index + 4 < value.length) {
      result += String.fromCharCode(Number.parseInt(value.slice(index + 1, index + 5), 16));
      index += 4;
    } else {
      result += escaped;
    }
  }
  return result;
}

function readProperties(file) {
  const entries = {};
  let logical = '';
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!logical && (!rawLine.trim() || rawLine.trimStart().startsWith('#'))) continue;
    logical += rawLine;
    const trailingSlashCount = (logical.match(/\\+$/)?.[0] || '').length;
    if (trailingSlashCount % 2 === 1) {
      logical = logical.slice(0, -1);
      continue;
    }
    const split = logical.indexOf('=');
    if (split > 0) {
      entries[logical.slice(0, split).trim()] = unescapePropertyValue(logical.slice(split + 1));
    }
    logical = '';
  }
  if (logical) {
    throw new Error(`Unterminated property continuation in ${file}`);
  }
  return entries;
}

function placeholders(value) {
  return [...String(value).matchAll(placeholderPattern)].map((match) => match[1]).sort();
}

function sameList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateResources(en, zh) {
  const errors = [];
  const enKeys = Object.keys(en);
  const zhKeys = Object.keys(zh);
  const enSet = new Set(enKeys);
  const zhSet = new Set(zhKeys);
  if (enKeys.length === 0) errors.push('backend English i18n resource is empty.');
  for (const key of enKeys) {
    if (!zhSet.has(key)) errors.push(`backend zh resource is missing key: ${key}`);
    const enPlaceholders = placeholders(en[key]);
    const zhPlaceholders = placeholders(zh[key]);
    if (zhSet.has(key) && !sameList(enPlaceholders, zhPlaceholders)) {
      errors.push(`backend placeholder mismatch for ${key}: en={${enPlaceholders.join(',')}} zh={${zhPlaceholders.join(',')}}`);
    }
  }
  for (const key of zhKeys) {
    if (!enSet.has(key)) errors.push(`backend zh resource contains unknown key: ${key}`);
  }
  return errors;
}


function validateLegacyMessageCodes(legacyMessages, en) {
  const errors = [];
  const messageCodes = new Set(Object.keys(en));
  for (const [rawMessage, code] of Object.entries(legacyMessages)) {
    if (!rawMessage.trim()) errors.push('backend legacy message resource contains a blank raw message key.');
    if (!messageCodes.has(code)) errors.push(`unknown legacy message code for "${rawMessage}": ${code}`);
  }
  return errors;
}

function coveredByI18n(literal) {
  const normalized = String(literal || '').trim();
  if (!normalized) return true;
  if (i18nCorpus.includes(normalized)) return true;
  const prefix = normalized.replace(/[\s:：.。]+$/u, '');
  if (prefix && i18nCorpus.includes(prefix)) return true;
  const hasGenericFallback = i18nSource.includes('I18nContext.language() == AppLanguage.ZH && !containsCjk(normalized)')
    && i18nCorpus.includes('backend.untranslatedError');
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

if (resourceViolations.length > 0 || violations.length > 0) {
  if (resourceViolations.length > 0) {
    console.error('Backend i18n resources are inconsistent.');
    for (const violation of resourceViolations) console.error(violation);
  }
  if (violations.length > 0) {
    console.error('Raw backend exception string literals are not allowed unless i18n resources or localizeFallback cover them.');
    for (const violation of violations) console.error(violation);
  }
  process.exit(1);
}

console.log(`backend localized error check passed (${files.length - ignoredFiles.size} enforced files, ${Object.keys(enResource).length} i18n keys, ${Object.keys(legacyMessageResource).length} legacy aliases).`);
