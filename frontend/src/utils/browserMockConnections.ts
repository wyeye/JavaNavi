import { translate, type AppLanguage } from '../i18n';

export const cloneBrowserMockValue = <T,>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

export const resolveBrowserMockSecretFlag = (nextValue: unknown, clearFlag: boolean, existingFlag?: boolean) => {
  if (String(nextValue ?? '') !== '') return true;
  if (clearFlag) return false;
  return !!existingFlag;
};

type BrowserMockConnectionLike = {
  id?: string;
  name?: string;
  config?: Record<string, unknown>;
  includeDatabases?: unknown;
  includeRedisDatabases?: unknown;
  [key: string]: unknown;
};

export const buildBrowserMockDuplicateName = (rawName: string, items: BrowserMockConnectionLike[], language: AppLanguage = 'en'): string => {
  const baseName = String(rawName || '').trim() || translate(language, 'connection.defaultName');
  const suffix = translate(language, 'connection.copySuffix');
  const usedNames = new Set(items.map((item) => String(item?.name || '').trim()));
  let candidate = `${baseName}${suffix}`;
  let counter = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}${suffix} ${counter}`;
    counter += 1;
  }
  return candidate;
};

interface DuplicateBrowserMockConnectionInput {
  existing: BrowserMockConnectionLike;
  items: BrowserMockConnectionLike[];
  nextId: string;
  language?: AppLanguage;
}

export const duplicateBrowserMockConnection = ({ existing, items, nextId, language }: DuplicateBrowserMockConnectionInput) => {
  const duplicated = cloneBrowserMockValue({
    ...existing,
    id: nextId,
    name: buildBrowserMockDuplicateName(existing.name || '', items, language),
    config: {
      ...cloneBrowserMockValue(existing?.config),
      id: nextId,
    },
    includeDatabases: Array.isArray(existing?.includeDatabases) ? [...existing.includeDatabases] : undefined,
    includeRedisDatabases: Array.isArray(existing?.includeRedisDatabases) ? [...existing.includeRedisDatabases] : undefined,
  });
  return duplicated;
};
