export type CustomDataSource = {
  id: string;
  name: string;
  driver?: string;
  driverVersion?: string;
  dsnTemplate?: string;
  description?: string;
  installSource?: 'manual-upload' | 'maven-download' | 'unknown';
  jarFileNames?: string[];
  createdAt: number;
  updatedAt: number;
};

export type CustomDataSourceDraft = {
  name: string;
  driver?: string;
  driverVersion?: string;
  dsnTemplate?: string;
  description?: string;
  installSource?: 'manual-upload' | 'maven-download' | 'unknown';
  jarFileNames?: string[];
};

export const CUSTOM_DATA_SOURCES_STORAGE_KEY = 'javanavi.customDataSources.v1';

const isBrowserStorageAvailable = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
};

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = normalizeText(value);
  return text || undefined;
};

const normalizeTextList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = Array.from(
    new Set(value.map((item) => normalizeText(item)).filter(Boolean)),
  );
  return items.length > 0 ? items : undefined;
};

const normalizeInstallSource = (
  value: unknown,
): CustomDataSource['installSource'] | undefined => {
  const text = normalizeText(value);
  if (text === 'manual-upload' || text === 'maven-download') {
    return text;
  }
  return text ? 'unknown' : undefined;
};

const normalizeDataSource = (value: any): CustomDataSource | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const id = normalizeText(value.id);
  const name = normalizeText(value.name);
  if (!id || !name) {
    return null;
  }
  const now = Date.now();
  const createdAt = Number(value.createdAt);
  const updatedAt = Number(value.updatedAt);
  return {
    id,
    name,
    driver: normalizeOptionalText(value.driver),
    driverVersion: normalizeOptionalText(value.driverVersion),
    dsnTemplate: normalizeOptionalText(value.dsnTemplate),
    description: normalizeOptionalText(value.description),
    installSource: normalizeInstallSource(value.installSource),
    jarFileNames: normalizeTextList(value.jarFileNames),
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : now,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now,
  };
};

export const loadCustomDataSources = (): CustomDataSource[] => {
  if (!isBrowserStorageAvailable()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_DATA_SOURCES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeDataSource)
      .filter((item): item is CustomDataSource => Boolean(item))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
  } catch {
    return [];
  }
};

export const saveCustomDataSources = (sources: CustomDataSource[]): CustomDataSource[] => {
  const normalized = sources
    .map(normalizeDataSource)
    .filter((item): item is CustomDataSource => Boolean(item))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
  if (!isBrowserStorageAvailable()) {
    return normalized;
  }
  window.localStorage.setItem(
    CUSTOM_DATA_SOURCES_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  return normalized;
};

export const createCustomDataSourceId = (name: string): string => {
  const slug = normalizeText(name)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'datasource';
  return `custom-${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const createCustomDataSource = (draft: CustomDataSourceDraft): CustomDataSource => {
  const now = Date.now();
  const name = normalizeText(draft.name);
  if (!name) {
    throw new Error('自定义数据源名称不能为空');
  }
  return {
    id: createCustomDataSourceId(name),
    name,
    driver: normalizeOptionalText(draft.driver),
    driverVersion: normalizeOptionalText(draft.driverVersion),
    dsnTemplate: normalizeOptionalText(draft.dsnTemplate),
    description: normalizeOptionalText(draft.description),
    installSource: normalizeInstallSource(draft.installSource),
    jarFileNames: normalizeTextList(draft.jarFileNames),
    createdAt: now,
    updatedAt: now,
  };
};

export const upsertCustomDataSource = (
  sources: CustomDataSource[],
  source: CustomDataSource,
): CustomDataSource[] => {
  const now = Date.now();
  const normalized = normalizeDataSource({ ...source, updatedAt: now });
  if (!normalized) {
    return saveCustomDataSources(sources);
  }
  const next = sources.filter((item) => item.id !== normalized.id);
  next.push(normalized);
  return saveCustomDataSources(next);
};

export const removeCustomDataSource = (
  sources: CustomDataSource[],
  id: string,
): CustomDataSource[] => saveCustomDataSources(sources.filter((item) => item.id !== id));

export const resolveCustomDataSourceFromConfig = (
  sources: CustomDataSource[],
  config: any,
): CustomDataSource | undefined => {
  const options = config && typeof config === 'object' ? config.options || {} : {};
  const configuredId = normalizeText(options.customDataSourceId);
  if (configuredId) {
    const byId = sources.find((source) => source.id === configuredId);
    if (byId) {
      return byId;
    }
  }
  const configuredName = normalizeText(options.customDataSourceName);
  if (configuredName) {
    const byName = sources.find((source) => source.name === configuredName);
    if (byName) {
      return byName;
    }
  }
  const configuredDriver = normalizeText(config?.driver).toLowerCase();
  if (configuredDriver) {
    return sources.find(
      (source) => normalizeText(source.driver).toLowerCase() === configuredDriver,
    );
  }
  return undefined;
};
