import {
  DEFAULT_LANGUAGE,
  translate,
  type AppLanguage,
  type I18nKey,
  type I18nParams,
} from '../i18n';

type StoredSecretPlaceholderOptions = {
  hasStoredSecret?: boolean;
  emptyPlaceholder: string;
  retainedLabel: string;
};

type ConnectionTestFailureKind =
  | 'validation'
  | 'runtime'
  | 'driver_unavailable'
  | 'secret_blocked';

type ConnectionTestFailureFeedback = {
  message: string;
  shouldToast: boolean;
};

export type ConnectionConfigSectionKey =
  | 'identity'
  | 'uri'
  | 'driverSelection'
  | 'target'
  | 'fileTarget'
  | 'connectionMode'
  | 'mongoDiscovery'
  | 'replica'
  | 'service'
  | 'mongoPolicy'
  | 'credentials'
  | 'databaseScope'
  | 'customDriver'
  | 'customDsn';

export type ConnectionConfigLayoutKind =
  | 'mysql-compatible'
  | 'mongodb'
  | 'redis'
  | 'postgres-compatible'
  | 'oracle'
  | 'file'
  | 'custom'
  | 'generic-sql';

export type ConnectionConfigLayout = {
  kind: ConnectionConfigLayoutKind;
  sections: ConnectionConfigSectionKey[];
};

type ConnectionConfigSectionCopy = {
  title: string;
  description: string;
};

type ConnectionConfigSectionCopyKeys = {
  titleKey: I18nKey;
  descriptionKey: I18nKey;
};

const tr = (language: AppLanguage | undefined, key: I18nKey, params?: I18nParams): string => (
  translate(language || DEFAULT_LANGUAGE, key, params)
);

const mysqlCompatibleTypes = new Set([
  'mysql',
  'mariadb',
  'doris',
  'diros',
  'sphinx',
]);
const postgresCompatibleTypes = new Set([
  'postgres',
  'kingbase',
  'highgo',
  'vastbase',
]);
const fileDatabaseTypes = new Set(['sqlite', 'duckdb']);

const CONNECTION_CONFIG_SECTION_COPY_KEYS: Record<
  ConnectionConfigSectionKey,
  ConnectionConfigSectionCopyKeys
> = {
  identity: {
    titleKey: 'connectionModal.section.identity.title',
    descriptionKey: 'connectionModal.section.identity.description',
  },
  uri: {
    titleKey: 'connectionModal.section.uri.title',
    descriptionKey: 'connectionModal.section.uri.description',
  },
  driverSelection: {
    titleKey: 'connectionModal.section.driverSelection.title',
    descriptionKey: 'connectionModal.section.driverSelection.description',
  },
  target: {
    titleKey: 'connectionModal.section.target.title',
    descriptionKey: 'connectionModal.section.target.description',
  },
  fileTarget: {
    titleKey: 'connectionModal.section.fileTarget.title',
    descriptionKey: 'connectionModal.section.fileTarget.description',
  },
  connectionMode: {
    titleKey: 'connectionModal.section.connectionMode.title',
    descriptionKey: 'connectionModal.section.connectionMode.description',
  },
  mongoDiscovery: {
    titleKey: 'connectionModal.section.mongoDiscovery.title',
    descriptionKey: 'connectionModal.section.mongoDiscovery.description',
  },
  replica: {
    titleKey: 'connectionModal.section.replica.title',
    descriptionKey: 'connectionModal.section.replica.description',
  },
  service: {
    titleKey: 'connectionModal.section.service.title',
    descriptionKey: 'connectionModal.section.service.description',
  },
  mongoPolicy: {
    titleKey: 'connectionModal.section.mongoPolicy.title',
    descriptionKey: 'connectionModal.section.mongoPolicy.description',
  },
  credentials: {
    titleKey: 'connectionModal.section.credentials.title',
    descriptionKey: 'connectionModal.section.credentials.description',
  },
  databaseScope: {
    titleKey: 'connectionModal.section.databaseScope.title',
    descriptionKey: 'connectionModal.section.databaseScope.description',
  },
  customDriver: {
    titleKey: 'connectionModal.section.customDriver.title',
    descriptionKey: 'connectionModal.section.customDriver.description',
  },
  customDsn: {
    titleKey: 'connectionModal.section.customDsn.title',
    descriptionKey: 'connectionModal.section.customDsn.description',
  },
};

export const getConnectionConfigSectionCopy = (
  key: ConnectionConfigSectionKey,
  language: AppLanguage,
): ConnectionConfigSectionCopy => {
  const copy = CONNECTION_CONFIG_SECTION_COPY_KEYS[key];
  return {
    title: tr(language, copy.titleKey),
    description: tr(language, copy.descriptionKey),
  };
};

export const getConnectionConfigLayoutKindLabel = (
  kind: ConnectionConfigLayoutKind,
  language: AppLanguage,
): string => {
  switch (kind) {
    case 'mysql-compatible':
      return tr(language, 'connectionModal.layout.mysqlCompatible');
    case 'mongodb':
      return tr(language, 'connectionModal.layout.mongodb');
    case 'redis':
      return tr(language, 'connectionModal.layout.redis');
    case 'postgres-compatible':
      return tr(language, 'connectionModal.layout.postgresCompatible');
    case 'oracle':
      return tr(language, 'connectionModal.layout.oracle');
    case 'file':
      return tr(language, 'connectionModal.layout.file');
    case 'custom':
      return tr(language, 'connectionModal.layout.custom');
    case 'generic-sql':
    default:
      return tr(language, 'connectionModal.layout.genericSql');
  }
};

export const resolveConnectionConfigLayout = (
  rawType: string,
): ConnectionConfigLayout => {
  const type = String(rawType || '').trim().toLowerCase();


  if (type === 'custom') {
    return {
      kind: 'custom',
      sections: ['identity', 'customDriver', 'customDsn', 'credentials'],
    };
  }
  if (fileDatabaseTypes.has(type)) {
    return {
      kind: 'file',
      sections: ['identity', 'uri', 'fileTarget'],
    };
  }
  if (mysqlCompatibleTypes.has(type)) {
    return {
      kind: 'mysql-compatible',
      sections: [
        'identity',
        'uri',
        'driverSelection',
        'target',
        'connectionMode',
        'replica',
        'credentials',
        'databaseScope',
      ],
    };
  }
  if (type === 'mongodb') {
    return {
      kind: 'mongodb',
      sections: [
        'identity',
        'uri',
        'target',
        'connectionMode',
        'mongoDiscovery',
        'replica',
        'mongoPolicy',
        'credentials',
        'databaseScope',
      ],
    };
  }
  if (type === 'redis') {
    return {
      kind: 'redis',
      sections: [
        'identity',
        'uri',
        'target',
        'connectionMode',
        'credentials',
        'databaseScope',
      ],
    };
  }
  if (postgresCompatibleTypes.has(type)) {
    return {
      kind: 'postgres-compatible',
      sections: [
        'identity',
        'uri',
        'driverSelection',
        'target',
        'service',
        'credentials',
        'databaseScope',
      ],
    };
  }
  if (type === 'oracle') {
    return {
      kind: 'oracle',
      sections: [
        'identity',
        'uri',
        'driverSelection',
        'target',
        'service',
        'credentials',
        'databaseScope',
      ],
    };
  }

  return {
    kind: 'generic-sql',
    sections: ['identity', 'uri', 'driverSelection', 'target', 'credentials', 'databaseScope'],
  };
};

const normalizeText = (value: unknown, fallback = ''): string => {
  const text = String(value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null') {
    return fallback;
  }
  return text;
};

export const getStoredSecretPlaceholder = ({
  hasStoredSecret,
  emptyPlaceholder,
  retainedLabel,
}: StoredSecretPlaceholderOptions, language: AppLanguage): string => (
  hasStoredSecret
    ? tr(language, 'connectionModal.secret.retainedPlaceholder', { label: retainedLabel })
    : emptyPlaceholder
);

export const normalizeConnectionSecretErrorMessage = (
  value: unknown,
  fallback = '',
  language: AppLanguage = DEFAULT_LANGUAGE,
): string => {
  const text = normalizeText(value, fallback);
  const lower = text.toLowerCase();

  if (lower.includes('saved connection not found:')) {
    return tr(language, 'connectionModal.secret.savedConnectionNotFound');
  }
  if (lower.includes('secret store unavailable')) {
    return tr(language, 'connectionModal.secret.storeUnavailable');
  }

  return text;
};

export const summarizeConnectionTestFailureMessage = (
  value: unknown,
  fallback = '',
  language: AppLanguage = DEFAULT_LANGUAGE,
): string => {
  const text = normalizeConnectionSecretErrorMessage(value, fallback, language);
  const [firstLine] = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item !== '');
  return firstLine || text;
};

export const resolveConnectionTestFailureFeedback = ({
  kind,
  reason,
  fallback,
  language,
}: {
  kind: ConnectionTestFailureKind;
  reason: unknown;
  fallback: string;
  language: AppLanguage;
}): ConnectionTestFailureFeedback => {
  if (kind === 'validation') {
    return {
      message: tr(language, 'connectionModal.test.failure.validation'),
      shouldToast: false,
    };
  }

  return {
    message: tr(language, 'connectionModal.test.failure.runtime', {
      reason: normalizeConnectionSecretErrorMessage(reason, fallback, language),
    }),
    shouldToast: false,
  };
};

export type {
  ConnectionTestFailureFeedback,
  ConnectionTestFailureKind,
};
