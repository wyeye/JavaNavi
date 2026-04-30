import {
  GlobalProxyConfig,
  SavedConnection,
  SecurityUpdateIssue,
  SecurityUpdateStatus,
  SecurityUpdateSummary,
} from '../types';
import { createGlobalProxyDraft } from './globalProxyDraft';
import {
  LEGACY_PERSIST_KEY,
  hasLegacyMigratableSensitiveItems,
  readLegacyPersistedSecrets,
  stripLegacyPersistedSecrets,
} from './legacyConnectionStorage';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type BackendGlobalProxyResult = {
  success?: boolean;
  data?: Partial<GlobalProxyConfig>;
};

type SecurityUpdateBackend = {
  GetSecurityUpdateStatus?: () => Promise<Partial<SecurityUpdateStatus> | undefined>;
  StartSecurityUpdate?: (request: {
    sourceType: 'current_app_saved_config';
    rawPayload: string;
    options?: {
      allowPartial?: boolean;
      writeBackup?: boolean;
    };
  }) => Promise<Partial<SecurityUpdateStatus> | undefined>;
  GetSavedConnections?: () => Promise<SavedConnection[]>;
  GetGlobalProxyConfig?: () => Promise<BackendGlobalProxyResult | undefined>;
};

type SecureConfigBootstrapArgs = {
  backend?: SecurityUpdateBackend;
  storage?: StorageLike;
  replaceConnections: (connections: SavedConnection[]) => void;
  replaceGlobalProxy: (proxy: GlobalProxyConfig) => void;
};

type SecureConfigBootstrapResult = {
  status: SecurityUpdateStatus;
  rawPayload: string | null;
  hasLegacySensitiveItems: boolean;
  shouldShowIntro: boolean;
  shouldShowBanner: boolean;
};

type StartSecurityUpdateResult = {
  status: SecurityUpdateStatus | null;
  error: Error | null;
};

type MergeSecurityUpdateStatusOptions = {
  previousStatus?: Partial<SecurityUpdateStatus> | null;
};

const defaultSummary = () => ({
  total: 0,
  updated: 0,
  pending: 0,
  skipped: 0,
  failed: 0,
});

const hasMeaningfulSummary = (summary: SecurityUpdateSummary): boolean => (
  summary.total > 0
  || summary.updated > 0
  || summary.pending > 0
  || summary.skipped > 0
  || summary.failed > 0
);

const buildLegacyPendingDetails = (rawPayload: string | null): {
  hasLegacyItems: boolean;
  summary: SecurityUpdateSummary;
  issues: SecurityUpdateIssue[];
} => {
  const legacy = readLegacyPersistedSecrets(rawPayload);
  const issues: SecurityUpdateIssue[] = legacy.connections.map((connection) => ({
    id: `legacy-connection-${connection.id}`,
    scope: 'connection',
    refId: connection.id,
    title: connection.name || connection.id,
    severity: 'medium',
    status: 'pending',
    reasonCode: 'migration_required',
    action: 'open_connection',
    message: '该连接仍保存在当前应用的本地配置中，完成安全更新后会迁入新的安全存储。',
  }));

  if (legacy.globalProxy) {
    issues.push({
      id: 'legacy-global-proxy-default',
      scope: 'global_proxy',
      title: '全局代理',
      severity: 'medium',
      status: 'pending',
      reasonCode: 'migration_required',
      action: 'open_proxy_settings',
      message: '全局代理仍保存在当前应用的本地配置中，完成安全更新后会迁入新的安全存储。',
    });
  }

  return {
    hasLegacyItems: issues.length > 0,
    summary: {
      total: issues.length,
      updated: 0,
      pending: issues.length,
      skipped: 0,
      failed: 0,
    },
    issues,
  };
};

const mergeSecurityUpdateIssues = (
  baseIssues: SecurityUpdateIssue[],
  legacyIssues: SecurityUpdateIssue[],
): {
  issues: SecurityUpdateIssue[];
  addedCount: number;
} => {
  const issueIds = new Set(baseIssues.map((issue) => issue.id));
  const additions = legacyIssues.filter((issue) => !issueIds.has(issue.id));
  return {
    issues: [...baseIssues, ...additions],
    addedCount: additions.length,
  };
};

const isLocalLegacyIssue = (issue: Partial<SecurityUpdateIssue> | null | undefined): boolean => {
  const issueId = String(issue?.id || '').trim();
  return issueId.startsWith('legacy-connection-') || issueId === 'legacy-global-proxy-default';
};

const countLocalLegacyIssues = (issues: SecurityUpdateIssue[]): number => (
  issues.filter((issue) => isLocalLegacyIssue(issue)).length
);

const deriveLegacySummary = (
  base: SecurityUpdateStatus,
  currentLegacyCount: number,
  previousStatus?: Partial<SecurityUpdateStatus> | null,
): {
  summary: SecurityUpdateSummary;
  hasContribution: boolean;
} => {
  const previousSummary = previousStatus?.summary ?? defaultSummary();
  const previousIssues = Array.isArray(previousStatus?.issues) ? previousStatus.issues : [];
  const previousLegacyCount = countLocalLegacyIssues(previousIssues);
  const previousLegacyTotal = Math.max(
    0,
    previousSummary.total - base.summary.total,
    previousSummary.updated - base.summary.updated + previousLegacyCount,
    previousLegacyCount,
  );
  const previousLegacyUpdated = Math.max(
    0,
    Math.min(previousLegacyTotal, previousSummary.updated - base.summary.updated),
  );
  const repairedSincePrevious = Math.max(0, previousLegacyCount - currentLegacyCount);
  const nextLegacyUpdated = Math.min(previousLegacyTotal, previousLegacyUpdated + repairedSincePrevious);
  const nextLegacyTotal = Math.max(previousLegacyTotal, nextLegacyUpdated + currentLegacyCount);

  return {
    summary: {
      total: base.summary.total + nextLegacyTotal,
      updated: base.summary.updated + nextLegacyUpdated,
      pending: base.summary.pending + currentLegacyCount,
      skipped: base.summary.skipped,
      failed: base.summary.failed,
    },
    hasContribution: nextLegacyTotal > 0,
  };
};

export const mergeSecurityUpdateStatusWithLegacySource = (
  status: Partial<SecurityUpdateStatus> | undefined,
  rawPayload: string | null,
  options?: MergeSecurityUpdateStatusOptions,
): SecurityUpdateStatus => {
  const base: SecurityUpdateStatus = {
    ...defaultStatus(),
    ...status,
    summary: {
      ...defaultSummary(),
      ...(status?.summary ?? {}),
    },
    issues: Array.isArray(status?.issues) ? status.issues : [],
  };
  const hasActiveMigrationRound = String(base.migrationId || '').trim() !== '';
  const baseNonLegacyIssues = base.issues.filter((issue) => !isLocalLegacyIssue(issue));

  const legacy = buildLegacyPendingDetails(rawPayload);
  const legacySummary = deriveLegacySummary(base, legacy.issues.length, options?.previousStatus);

  if (!legacySummary.hasContribution) {
    return base;
  }

  const mergedIssues = mergeSecurityUpdateIssues(baseNonLegacyIssues, legacy.issues).issues;

  if (base.overallStatus === 'not_detected') {
    if (!legacy.hasLegacyItems) {
      return base;
    }
    return {
      ...base,
      overallStatus: 'pending',
      reminderVisible: true,
      canStart: true,
      canPostpone: true,
      summary: legacySummary.summary,
      issues: mergedIssues,
    };
  }

  if (base.overallStatus === 'pending' || base.overallStatus === 'postponed') {
    return {
      ...base,
      summary: hasMeaningfulSummary(base.summary) || legacy.hasLegacyItems ? legacySummary.summary : legacy.summary,
      issues: mergedIssues,
      canStart: true,
      canPostpone: true,
      reminderVisible: base.overallStatus === 'pending' ? true : base.reminderVisible,
    };
  }

  if (base.overallStatus === 'rolled_back' || base.overallStatus === 'needs_attention') {
    if (hasActiveMigrationRound) {
      return base;
    }
    return {
      ...base,
      summary: hasMeaningfulSummary(base.summary) || legacy.hasLegacyItems ? legacySummary.summary : legacy.summary,
      issues: mergedIssues,
    };
  }

  return base;
};

const defaultStatus = (): SecurityUpdateStatus => ({
  overallStatus: 'not_detected',
  summary: defaultSummary(),
  issues: [],
});

const resolveStorage = (storage?: StorageLike): StorageLike | undefined => {
  if (storage) {
    return storage;
  }
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.localStorage;
};

const applyLegacyVisibleConfig = (
  rawPayload: string | null,
  replaceConnections: (connections: SavedConnection[]) => void,
  replaceGlobalProxy: (proxy: GlobalProxyConfig) => void,
) => {
  const legacy = readLegacyPersistedSecrets(rawPayload);
  if (legacy.connections.length > 0) {
    replaceConnections(legacy.connections);
  }
  if (legacy.globalProxy) {
    replaceGlobalProxy(createGlobalProxyDraft(legacy.globalProxy));
  }
};

const refreshVisibleConfigFromBackend = async (
  backend: SecurityUpdateBackend | undefined,
  replaceConnections: (connections: SavedConnection[]) => void,
  replaceGlobalProxy: (proxy: GlobalProxyConfig) => void,
  allowEmptyConnections: boolean,
) => {
  if (typeof backend?.GetSavedConnections === 'function') {
    try {
      const connections = await backend.GetSavedConnections();
      if (Array.isArray(connections) && (allowEmptyConnections || connections.length > 0)) {
        replaceConnections(connections);
      }
    } catch {
      // Keep current visible state as fallback.
    }
  }

  if (typeof backend?.GetGlobalProxyConfig === 'function') {
    try {
      const proxyResult = await backend.GetGlobalProxyConfig();
      if (proxyResult?.success && proxyResult.data) {
        replaceGlobalProxy(createGlobalProxyDraft(proxyResult.data));
      }
    } catch {
      // Keep current visible state as fallback.
    }
  }
};

const cleanupLegacySourceIfCompleted = (
  storage: StorageLike | undefined,
  rawPayload: string | null,
  status: SecurityUpdateStatus,
) => {
  if (!storage || !rawPayload || status.overallStatus !== 'completed') {
    return;
  }
  const sanitizedPayload = stripLegacyPersistedSecrets(rawPayload);
  if (sanitizedPayload && sanitizedPayload !== rawPayload) {
    storage.setItem(LEGACY_PERSIST_KEY, sanitizedPayload);
  }
};

export async function finalizeSecurityUpdateStatus(
  args: SecureConfigBootstrapArgs,
  rawStatus: Partial<SecurityUpdateStatus> | undefined,
): Promise<SecurityUpdateStatus> {
  const storage = resolveStorage(args.storage);
  const rawPayload = storage?.getItem(LEGACY_PERSIST_KEY) ?? null;
  const status = mergeSecurityUpdateStatusWithLegacySource(rawStatus, rawPayload);

  if (status.overallStatus === 'completed') {
    await refreshVisibleConfigFromBackend(args.backend, args.replaceConnections, args.replaceGlobalProxy, true);
    cleanupLegacySourceIfCompleted(storage, rawPayload, status);
  }

  return status;
}

export async function bootstrapSecureConfig(args: SecureConfigBootstrapArgs): Promise<SecureConfigBootstrapResult> {
  const storage = resolveStorage(args.storage);
  const rawPayload = storage?.getItem(LEGACY_PERSIST_KEY) ?? null;
  const hasLegacySensitiveItems = hasLegacyMigratableSensitiveItems(rawPayload);

  applyLegacyVisibleConfig(rawPayload, args.replaceConnections, args.replaceGlobalProxy);

  const backendStatus = typeof args.backend?.GetSecurityUpdateStatus === 'function'
    ? await args.backend.GetSecurityUpdateStatus()
    : undefined;
  const status = mergeSecurityUpdateStatusWithLegacySource(backendStatus, rawPayload);

  if (!hasLegacySensitiveItems) {
    await refreshVisibleConfigFromBackend(args.backend, args.replaceConnections, args.replaceGlobalProxy, true);
  } else if (status.overallStatus === 'completed') {
    await refreshVisibleConfigFromBackend(args.backend, args.replaceConnections, args.replaceGlobalProxy, true);
    cleanupLegacySourceIfCompleted(storage, rawPayload, status);
  }

  return {
    status,
    rawPayload,
    hasLegacySensitiveItems,
    shouldShowIntro: status.overallStatus === 'pending',
    shouldShowBanner: ['postponed', 'rolled_back', 'needs_attention'].includes(status.overallStatus),
  };
}

export async function startSecurityUpdateFromBootstrap(args: SecureConfigBootstrapArgs): Promise<StartSecurityUpdateResult> {
  const storage = resolveStorage(args.storage);
  const rawPayload = storage?.getItem(LEGACY_PERSIST_KEY) ?? null;
  const startPayload = rawPayload ?? '';

  applyLegacyVisibleConfig(rawPayload, args.replaceConnections, args.replaceGlobalProxy);

  if (typeof args.backend?.StartSecurityUpdate !== 'function') {
    return {
      status: null,
      error: new Error('安全更新能力不可用'),
    };
  }

  try {
    const rawStatus = await args.backend.StartSecurityUpdate({
      sourceType: 'current_app_saved_config',
      rawPayload: startPayload,
      options: {
        allowPartial: true,
        writeBackup: true,
      },
    });
    const status = mergeSecurityUpdateStatusWithLegacySource(rawStatus, rawPayload);

    if (status.overallStatus === 'completed') {
      await refreshVisibleConfigFromBackend(args.backend, args.replaceConnections, args.replaceGlobalProxy, true);
      cleanupLegacySourceIfCompleted(storage, rawPayload, status);
    }

    return { status, error: null };
  } catch (error) {
    applyLegacyVisibleConfig(rawPayload, args.replaceConnections, args.replaceGlobalProxy);
    return {
      status: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export type {
  BackendGlobalProxyResult,
  MergeSecurityUpdateStatusOptions,
  SecurityUpdateBackend,
  SecureConfigBootstrapArgs,
  SecureConfigBootstrapResult,
  StartSecurityUpdateResult,
};
