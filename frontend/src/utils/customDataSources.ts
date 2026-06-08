import { getRuntimeLanguage, translate } from '../i18n';
export type CustomDataSourceArtifact = {
  fileName?: string;
  sha256?: string;
  sizeBytes?: number;
};

export type CustomDataSourceRuntimeStatus = {
  driverLoadable?: boolean;
  definitionUsable?: boolean;
  connectionTested?: boolean;
  validationStatus?: 'unknown' | 'valid' | 'warning' | 'error';
  message?: string;
  repairHints?: string[];
  checkedAt?: number;
};

export type CustomDataSource = {
  schemaVersion: 2;
  id: string;
  name: string;
  driverType: string;
  driver?: string;
  driverClassName?: string;
  version?: string;
  driverVersion?: string;
  dsnTemplate?: string;
  dsnHelp?: string;
  description?: string;
  installSource?: 'manual-upload' | 'maven-download' | 'unknown';
  artifacts?: CustomDataSourceArtifact[];
  jarFileNames?: string[];
  runtimeStatus?: CustomDataSourceRuntimeStatus;
  createdAt: number;
  updatedAt: number;
};

export type CustomDataSourceDraft = {
  name: string;
  driver?: string;
  driverType?: string;
  driverClassName?: string;
  version?: string;
  driverVersion?: string;
  dsnTemplate?: string;
  dsnHelp?: string;
  description?: string;
  installSource?: 'manual-upload' | 'maven-download' | 'unknown';
  artifacts?: CustomDataSourceArtifact[];
  jarFileNames?: string[];
  runtimeStatus?: CustomDataSourceRuntimeStatus;
};

export type BackendCustomDataSourceDefinition = {
  driverType?: string;
  driverName?: string;
  version?: string;
  driverClassName?: string;
  installSource?: string;
  downloadedAt?: string;
  artifacts?: CustomDataSourceArtifact[];
  jarFileNames?: string[];
  driverLoadable?: boolean;
  definitionUsable?: boolean;
  connectionTested?: boolean;
  validationStatus?: string;
  message?: string;
  repairHints?: string[];
  checkedAt?: string | number;
};

export const CUSTOM_DATA_SOURCES_V1_STORAGE_KEY = 'javanavi.customDataSources.v1';
export const CUSTOM_DATA_SOURCES_STORAGE_KEY = CUSTOM_DATA_SOURCES_V1_STORAGE_KEY;
export const CUSTOM_DATA_SOURCES_V2_STORAGE_KEY = 'javanavi.customDataSources.v2';

export type CustomDataSourceStorageMode = 'cache' | 'fallback';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const getRecordField = (value: unknown, key: string): unknown => (
  isRecord(value) ? value[key] : undefined
);

const isBrowserStorageAvailable = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
};

const normalizeText = (value: unknown): string => String(value ?? '').trim();
const DEFAULT_UPLOAD_DRIVER_VERSION = 'upload-1.0';

const isKnownDefaultUploadVersionMojibake = (value: string): boolean => (
  value === 'ä¸ä¼ -1.0'
  || value === 'ä¸Šä¼ -1.0'
  || value === 'ä¸�ä¼ -1.0'
  || value === 'ä¸�ä¼ -1.0'
);

const looksLikeUtf8DecodedAsLatin1 = (value: string): boolean => {
  if (!value) {
    return false;
  }
  let suspicious = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code >= 0xc0 && code <= 0xff) || (code >= 0x80 && code <= 0x9f)) {
      suspicious += 1;
    }
  }
  return suspicious >= 2;
};

const readabilityScore = (value: string): number => {
  let score = 0;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (/[\u4e00-\u9fff]/u.test(char)) {
      score += 4;
    } else if (/[A-Za-z0-9]/u.test(char)) {
      score += 2;
    } else if (char === '-' || char === '_' || char === '.' || /\s/u.test(char)) {
      score += 1;
    } else if ((code >= 0xc0 && code <= 0xff) || (code >= 0x80 && code <= 0x9f)) {
      score -= 3;
    }
  }
  return score;
};

export const normalizePossiblyMojibakeText = (value: unknown): string => {
  const text = normalizeText(value);
  if (isKnownDefaultUploadVersionMojibake(text)) {
    return DEFAULT_UPLOAD_DRIVER_VERSION;
  }
  if (!looksLikeUtf8DecodedAsLatin1(text) || typeof TextDecoder === 'undefined') {
    return text;
  }
  try {
    const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
    if (
      repaired
      && repaired !== text
      && !repaired.includes('\uFFFD')
      && readabilityScore(repaired) > readabilityScore(text)
    ) {
      return repaired;
    }
  } catch {
    return text;
  }
  return text;
};

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = normalizePossiblyMojibakeText(value);
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

const normalizeFileName = (value: unknown): string => normalizeText(value).replace(/.*[\\/]/, '');

const normalizeFileNameList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = Array.from(
    new Set(value.map((item) => normalizeFileName(item)).filter(Boolean)),
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

const normalizeValidationStatus = (
  value: unknown,
): CustomDataSourceRuntimeStatus['validationStatus'] => {
  const text = normalizeText(value);
  if (text === 'valid' || text === 'warning' || text === 'error') {
    return text;
  }
  return 'unknown';
};

const normalizeTimestamp = (value: unknown, fallback = Date.now()): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeArtifacts = (value: unknown): CustomDataSourceArtifact[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const artifacts = value
    .map((item): CustomDataSourceArtifact | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const fileName = normalizeFileName(raw.fileName);
      if (!fileName) {
        return null;
      }
      const sizeBytes = Number(raw.sizeBytes);
      return {
        fileName,
        sha256: normalizeOptionalText(raw.sha256),
        sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : undefined,
      };
    })
    .filter((item): item is CustomDataSourceArtifact => Boolean(item));
  return artifacts.length > 0 ? artifacts : undefined;
};

const normalizeRuntimeStatus = (value: unknown): CustomDataSourceRuntimeStatus | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const status: CustomDataSourceRuntimeStatus = {
    driverLoadable: typeof raw.driverLoadable === 'boolean' ? raw.driverLoadable : undefined,
    definitionUsable: typeof raw.definitionUsable === 'boolean' ? raw.definitionUsable : undefined,
    connectionTested: typeof raw.connectionTested === 'boolean' ? raw.connectionTested : undefined,
    validationStatus: normalizeValidationStatus(raw.validationStatus),
    message: normalizeOptionalText(raw.message),
    repairHints: normalizeTextList(raw.repairHints),
    checkedAt: normalizeTimestamp(raw.checkedAt, 0) || undefined,
  };
  return Object.values(status).some((item) => item !== undefined) ? status : undefined;
};

const normalizeDataSource = (value: unknown): CustomDataSource | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = normalizeText(value.id);
  const name = normalizeText(value.name || value.driverName);
  const driverType = normalizeText(value.driverType || value.driver).toLowerCase();
  if (!id || !name) {
    return null;
  }
  const now = Date.now();
  const artifacts = normalizeArtifacts(value.artifacts);
  const jarFileNames = normalizeFileNameList(value.jarFileNames)
    || (artifacts ? artifacts.map((artifact) => artifact.fileName || '').filter(Boolean) : undefined);
  const version = normalizeOptionalText(value.version || value.driverVersion);
  return {
    schemaVersion: 2,
    id,
    name,
    driverType,
    driver: driverType || undefined,
    driverClassName: normalizeOptionalText(value.driverClassName),
    version,
    driverVersion: version,
    dsnTemplate: normalizeOptionalText(value.dsnTemplate),
    dsnHelp: normalizeOptionalText(value.dsnHelp),
    description: normalizeOptionalText(value.description),
    installSource: normalizeInstallSource(value.installSource),
    artifacts,
    jarFileNames,
    runtimeStatus: normalizeRuntimeStatus(value.runtimeStatus),
    createdAt: normalizeTimestamp(value.createdAt, now),
    updatedAt: normalizeTimestamp(value.updatedAt, now),
  };
};

const parseStoredSources = (raw: string | null): CustomDataSource[] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const list: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray(parsed.sources)
        ? parsed.sources
        : [];
    return list
      .map(normalizeDataSource)
      .filter((item): item is CustomDataSource => Boolean(item));
  } catch {
    return [];
  }
};

export const mergeCustomDataSourceLists = (preferred: CustomDataSource[], fallback: CustomDataSource[]): CustomDataSource[] => {
  const sources: CustomDataSource[] = [];
  const ids = new Set<string>();
  const driverTypes = new Set<string>();
  const names = new Set<string>();
  [...preferred, ...fallback].forEach((source) => {
    const id = normalizeText(source.id);
    const driverType = normalizeText(source.driverType || source.driver).toLowerCase();
    const name = normalizeText(source.name).toLowerCase();
    if (!id || ids.has(id) || (driverType && driverTypes.has(driverType)) || (!driverType && name && names.has(name))) {
      return;
    }
    ids.add(id);
    if (driverType) {
      driverTypes.add(driverType);
    }
    if (name) {
      names.add(name);
    }
    sources.push(source);
  });
  return sources.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
};

export const loadCustomDataSources = (): CustomDataSource[] => {
  if (!isBrowserStorageAvailable()) {
    return [];
  }
  const v2Sources = parseStoredSources(window.localStorage.getItem(CUSTOM_DATA_SOURCES_V2_STORAGE_KEY));
  const v1Sources = parseStoredSources(window.localStorage.getItem(CUSTOM_DATA_SOURCES_V1_STORAGE_KEY));
  return mergeCustomDataSourceLists(v2Sources, v1Sources);
};

export const saveCustomDataSources = (sources: CustomDataSource[], mode: CustomDataSourceStorageMode = 'fallback'): CustomDataSource[] => {
  const normalized = mergeCustomDataSourceLists(
    sources.map(normalizeDataSource).filter((item): item is CustomDataSource => Boolean(item)),
    [],
  );
  if (!isBrowserStorageAvailable()) {
    return normalized;
  }
  window.localStorage.setItem(
    CUSTOM_DATA_SOURCES_V2_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 2,
      storageMode: mode,
      backendAuthoritative: mode === 'cache',
      sources: normalized,
    }),
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
    throw new Error(translate(getRuntimeLanguage(), 'customDataSources.error.nameRequired'));
  }
  const driverType = normalizeText(draft.driverType || draft.driver).toLowerCase();
  const version = normalizeOptionalText(draft.version || draft.driverVersion);
  const artifacts = normalizeArtifacts(draft.artifacts);
  return {
    schemaVersion: 2,
    id: createCustomDataSourceId(name),
    name,
    driverType,
    driver: driverType || undefined,
    driverClassName: normalizeOptionalText(draft.driverClassName),
    version,
    driverVersion: version,
    dsnTemplate: normalizeOptionalText(draft.dsnTemplate),
    dsnHelp: normalizeOptionalText(draft.dsnHelp),
    description: normalizeOptionalText(draft.description),
    installSource: normalizeInstallSource(draft.installSource),
    artifacts,
    jarFileNames: normalizeFileNameList(draft.jarFileNames)
      || (artifacts ? artifacts.map((artifact) => artifact.fileName || '').filter(Boolean) : undefined),
    runtimeStatus: normalizeRuntimeStatus(draft.runtimeStatus),
    createdAt: now,
    updatedAt: now,
  };
};

export const createCustomDataSourceFromBackendDefinition = (
  definition: BackendCustomDataSourceDefinition,
  existing?: CustomDataSource,
): CustomDataSource | null => {
  const driverType = normalizeText(definition.driverType).toLowerCase();
  if (!driverType) {
    return null;
  }
  const now = Date.now();
  const artifacts = normalizeArtifacts(definition.artifacts);
  const version = normalizeOptionalText(definition.version);
  return normalizeDataSource({
    ...(existing || {}),
    schemaVersion: 2,
    id: existing?.id || `custom-${driverType}`,
    name: normalizeText(existing?.name || definition.driverName || driverType),
    driverType,
    driver: driverType,
    driverClassName: definition.driverClassName || existing?.driverClassName,
    version: version || existing?.version,
    driverVersion: version || existing?.driverVersion,
    installSource: definition.installSource || existing?.installSource || 'manual-upload',
    artifacts: artifacts || existing?.artifacts,
    jarFileNames: normalizeFileNameList(definition.jarFileNames)
      || artifacts?.map((artifact) => artifact.fileName || '').filter(Boolean)
      || existing?.jarFileNames,
    runtimeStatus: {
      ...(existing?.runtimeStatus || {}),
      driverLoadable: definition.driverLoadable,
      definitionUsable: definition.definitionUsable,
      connectionTested: definition.connectionTested ?? existing?.runtimeStatus?.connectionTested,
      validationStatus: normalizeValidationStatus(definition.validationStatus),
      message: normalizeOptionalText(definition.message),
      repairHints: normalizeTextList(definition.repairHints),
      checkedAt: normalizeTimestamp(definition.checkedAt, now),
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
};

export const extractBackendCustomDataSourceDefinitions = (payload: unknown): BackendCustomDataSourceDefinition[] => {
  const payloadData = getRecordField(payload, 'data');
  const data = isRecord(payloadData) || Array.isArray(payloadData) ? payloadData : (isRecord(payload) || Array.isArray(payload) ? payload : {});
  const definitions = Array.isArray(data)
    ? data
    : Array.isArray(data.definitions)
      ? data.definitions
      : Array.isArray(data.customDefinitions)
        ? data.customDefinitions
        : [];
  return definitions
    .map((item: unknown): BackendCustomDataSourceDefinition => {
      const raw = isRecord(item) ? item : {};
      return {
      driverType: normalizeText(raw.driverType),
      driverName: normalizeText(raw.driverName || raw.driverType),
      version: normalizePossiblyMojibakeText(raw.version),
      driverClassName: normalizeText(raw.driverClassName),
      installSource: normalizeText(raw.installSource),
      downloadedAt: normalizeText(raw.downloadedAt),
      artifacts: Array.isArray(raw.artifacts) ? normalizeArtifacts(raw.artifacts) : undefined,
      jarFileNames: Array.isArray(raw.jarFileNames) ? normalizeFileNameList(raw.jarFileNames) : undefined,
      driverLoadable: typeof raw.driverLoadable === 'boolean' ? raw.driverLoadable : undefined,
      definitionUsable: typeof raw.definitionUsable === 'boolean' ? raw.definitionUsable : undefined,
      connectionTested: typeof raw.connectionTested === 'boolean' ? raw.connectionTested : undefined,
      validationStatus: normalizeText(raw.validationStatus) || undefined,
      message: normalizeText(raw.message),
      repairHints: normalizeTextList(raw.repairHints),
      checkedAt: typeof raw.checkedAt === 'string' || typeof raw.checkedAt === 'number' ? raw.checkedAt : undefined,
      };
    })
    .filter((item: BackendCustomDataSourceDefinition): item is BackendCustomDataSourceDefinition => !!item.driverType);
};

export const extractBackendCustomDataSourceDefinition = (payload: unknown): BackendCustomDataSourceDefinition | undefined => {
  const definitions = extractBackendCustomDataSourceDefinitions(payload);
  if (definitions.length > 0) {
    return definitions[0];
  }
  const payloadData = getRecordField(payload, 'data');
  const data = isRecord(payloadData) ? payloadData : (isRecord(payload) ? payload : {});
  const driverType = normalizeText(data?.driverType);
  return driverType
    ? {
        driverType,
        driverName: normalizeText(data?.driverName || driverType),
        version: normalizePossiblyMojibakeText(data?.version),
        driverClassName: normalizeText(data?.driverClassName),
        installSource: normalizeText(data?.installSource),
        downloadedAt: normalizeText(data?.downloadedAt),
        artifacts: Array.isArray(data?.artifacts) ? normalizeArtifacts(data.artifacts) : undefined,
        jarFileNames: Array.isArray(data?.jarFileNames) ? normalizeFileNameList(data.jarFileNames) : undefined,
        driverLoadable: typeof data?.driverLoadable === 'boolean' ? data.driverLoadable : undefined,
        definitionUsable: typeof data?.definitionUsable === 'boolean' ? data.definitionUsable : undefined,
        connectionTested: typeof data?.connectionTested === 'boolean' ? data.connectionTested : undefined,
        validationStatus: normalizeText(data?.validationStatus) || undefined,
        message: normalizeText(data?.message),
        repairHints: normalizeTextList(data?.repairHints),
        checkedAt: typeof data?.checkedAt === 'string' || typeof data?.checkedAt === 'number' ? data.checkedAt : undefined,
      }
    : undefined;
};

export const mergeBackendCustomDataSourceDefinitions = (
  sources: CustomDataSource[],
  definitions: BackendCustomDataSourceDefinition[],
  options: { backendAuthoritative?: boolean } = {},
): CustomDataSource[] => {
  if (options.backendAuthoritative && definitions.length > 0) {
    const backendSources = definitions
      .map((definition) => createCustomDataSourceFromBackendDefinition(definition, sources.find(
        (source) => normalizeText(source.driverType || source.driver).toLowerCase() === normalizeText(definition.driverType).toLowerCase(),
      )))
      .filter((item): item is CustomDataSource => Boolean(item));
    return saveCustomDataSources(backendSources, 'cache');
  }

  const byId = new Map(sources.map((source) => [source.id, source]));
  const byDriverType = new Map(
    sources
      .map((source) => [normalizeText(source.driverType || source.driver).toLowerCase(), source] as const)
      .filter(([driverType]) => Boolean(driverType)),
  );
  definitions.forEach((definition) => {
    const driverType = normalizeText(definition.driverType).toLowerCase();
    if (!driverType) {
      return;
    }
    const merged = createCustomDataSourceFromBackendDefinition(definition, byDriverType.get(driverType));
    if (!merged) {
      return;
    }
    byId.set(merged.id, merged);
    byDriverType.set(driverType, merged);
  });
  return saveCustomDataSources(Array.from(byId.values()), definitions.length > 0 ? 'cache' : 'fallback');
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
  config: unknown,
): CustomDataSource | undefined => {
  const configRecord = isRecord(config) ? config : {};
  const options = isRecord(configRecord.options) ? configRecord.options : {};
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
  const configuredDriver = normalizeText(
    options.customDataSourceDriverType || options.customDataSourceDefaultDriver || configRecord.driver,
  ).toLowerCase();
  if (configuredDriver) {
    return sources.find(
      (source) => normalizeText(source.driverType || source.driver).toLowerCase() === configuredDriver,
    );
  }
  return undefined;
};
