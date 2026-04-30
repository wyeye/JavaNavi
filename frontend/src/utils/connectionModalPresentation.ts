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
  | 'customDsn'
  | 'jvmRuntime';

export type ConnectionConfigLayoutKind =
  | 'mysql-compatible'
  | 'mongodb'
  | 'redis'
  | 'postgres-compatible'
  | 'oracle'
  | 'file'
  | 'custom'
  | 'jvm'
  | 'generic-sql';

export type ConnectionConfigLayout = {
  kind: ConnectionConfigLayoutKind;
  sections: ConnectionConfigSectionKey[];
};

type ConnectionConfigSectionCopy = {
  title: string;
  description: string;
};

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

const CONNECTION_CONFIG_SECTION_COPY: Record<
  ConnectionConfigSectionKey,
  ConnectionConfigSectionCopy
> = {
  identity: {
    title: '基础身份',
    description: '连接名称和连接树中展示的基础信息。',
  },
  uri: {
    title: '填写方式',
    description: '在连接 URL 与目标地址之间显式二选一，避免两个入口互相覆盖。',
  },
  driverSelection: {
    title: 'JDBC 驱动',
    description: '在多个可用兼容驱动之间选择，本连接会优先使用所选驱动。',
  },
  target: {
    title: '目标地址',
    description: '数据库服务的主机、端口或网关入口，是连通性测试的主目标。',
  },
  fileTarget: {
    title: '数据库文件',
    description: 'SQLite / DuckDB 使用本地数据库文件路径，不需要端口和网络隧道。',
  },
  connectionMode: {
    title: '连接模式',
    description: '选择单机、主从、副本集或集群等拓扑模式。',
  },
  mongoDiscovery: {
    title: 'MongoDB 寻址',
    description: '选择标准 host:port 或 mongodb+srv DNS 发现方式。',
  },
  replica: {
    title: '多节点配置',
    description: '补充从库、种子节点、副本集成员或独立认证信息。',
  },
  service: {
    title: '数据库服务',
    description: '默认数据库、Oracle Service Name 等服务级定位参数。',
  },
  mongoPolicy: {
    title: 'MongoDB 策略',
    description: '认证库、读偏好等 MongoDB 专属策略。',
  },
  credentials: {
    title: '认证凭据',
    description: '用户名、密码和密文保留策略；留空会按已保存密文规则处理。',
  },
  databaseScope: {
    title: '数据库范围',
    description: '连接成功后可限制连接树展示的数据库或 Redis DB。',
  },
  customDriver: {
    title: '自定义数据源',
    description: '先选择或新增自定义数据源，再填写该数据源使用的自定义驱动。',
  },
  customDsn: {
    title: '连接字符串',
    description: '直接填写所选自定义数据源的 DSN，适合非内置数据库或特殊参数。',
  },
  jvmRuntime: {
    title: 'JVM 运行时',
    description: 'JVM 目标、接入模式、JMX、Endpoint、Agent 与诊断增强。',
  },
};

export const getConnectionConfigSectionCopy = (
  key: ConnectionConfigSectionKey,
): ConnectionConfigSectionCopy => CONNECTION_CONFIG_SECTION_COPY[key];

export const getConnectionConfigLayoutKindLabel = (
  kind: ConnectionConfigLayoutKind,
): string => {
  switch (kind) {
    case 'mysql-compatible':
      return 'MySQL 兼容';
    case 'mongodb':
      return '文档数据库';
    case 'redis':
      return '键值数据库';
    case 'postgres-compatible':
      return 'PostgreSQL 兼容';
    case 'oracle':
      return 'Oracle 服务';
    case 'file':
      return '文件型数据库';
    case 'custom':
      return '自定义连接';
    case 'jvm':
      return 'JVM 运行时';
    case 'generic-sql':
    default:
      return '标准 SQL';
  }
};

export const resolveConnectionConfigLayout = (
  rawType: string,
): ConnectionConfigLayout => {
  const type = String(rawType || '').trim().toLowerCase();

  if (type === 'jvm') {
    return {
      kind: 'jvm',
      sections: ['identity', 'jvmRuntime'],
    };
  }
  if (type === 'custom') {
    return {
      kind: 'custom',
      sections: ['identity', 'customDriver', 'customDsn'],
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
}: StoredSecretPlaceholderOptions): string => (
  hasStoredSecret
    ? `••••••（留空表示继续沿用${retainedLabel}）`
    : emptyPlaceholder
);

export const normalizeConnectionSecretErrorMessage = (
  value: unknown,
  fallback = '',
): string => {
  const text = normalizeText(value, fallback);
  const lower = text.toLowerCase();

  if (lower.includes('saved connection not found:')) {
    return '未找到当前连接对应的已保存密文，请重新填写密码并保存后再试';
  }
  if (lower.includes('secret store unavailable')) {
    return '系统密文存储当前不可用，请检查系统钥匙串或凭据管理器后再试';
  }

  return text;
};

export const summarizeConnectionTestFailureMessage = (
  value: unknown,
  fallback = '',
): string => {
  const text = normalizeConnectionSecretErrorMessage(value, fallback);
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
}: {
  kind: ConnectionTestFailureKind;
  reason: unknown;
  fallback: string;
}): ConnectionTestFailureFeedback => {
  if (kind === 'validation') {
    return {
      message: '测试失败: 请先完善必填项后再测试连接',
      shouldToast: false,
    };
  }

  return {
    message: `测试失败: ${normalizeConnectionSecretErrorMessage(reason, fallback)}`,
    shouldToast: false,
  };
};

export type {
  ConnectionTestFailureFeedback,
  ConnectionTestFailureKind,
};
