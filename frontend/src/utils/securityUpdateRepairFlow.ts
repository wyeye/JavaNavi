import type { SavedConnection, SecurityUpdateIssue, SecurityUpdateStatus } from '../types';

export type SecurityUpdateRepairSource = 'connection' | 'proxy' | 'ai';
export type SecurityUpdateSettingsFocusTarget = 'recent_result' | 'status';
export type SecurityUpdateFocusState = {
  target: SecurityUpdateSettingsFocusTarget | null;
  pulseKey: string | null;
};

export type SecurityUpdateRepairEntry =
  | {
      type: 'connection';
      connection: SavedConnection;
      repairSource: 'connection';
    }
  | {
      type: 'proxy';
      repairSource: 'proxy';
    }
  | {
      type: 'ai';
      providerId?: string;
      repairSource: 'ai';
    }
  | {
      type: 'retry';
    }
  | {
      type: 'details';
      focusTarget: SecurityUpdateSettingsFocusTarget;
    }
  | {
      type: 'warning';
      message: string;
    };

export const hasSecurityUpdateRecentResult = (
  status?: Pick<SecurityUpdateStatus, 'backupPath' | 'lastError'> | null,
): boolean => Boolean(status?.backupPath || status?.lastError);

export const resolveSecurityUpdateSettingsFocusTarget = (
  status?: Pick<SecurityUpdateStatus, 'backupPath' | 'lastError'> | null,
): SecurityUpdateSettingsFocusTarget => (
  hasSecurityUpdateRecentResult(status) ? 'recent_result' : 'status'
);

export const resolveSecurityUpdateFocusState = (
  open: boolean,
  focusTarget: SecurityUpdateSettingsFocusTarget | null | undefined,
  focusRequest: number,
): SecurityUpdateFocusState => {
  if (!open || !focusTarget) {
    return {
      target: null,
      pulseKey: null,
    };
  }

  return {
    target: focusTarget,
    pulseKey: `${focusTarget}:${focusRequest}`,
  };
};

export const resolveSecurityUpdateRepairEntry = (
  issue: SecurityUpdateIssue,
  connections: SavedConnection[],
  status?: Pick<SecurityUpdateStatus, 'backupPath' | 'lastError'> | null,
): SecurityUpdateRepairEntry => {
  if (issue.action === 'open_connection') {
    const target = connections.find((connection) => connection.id === issue.refId);
    if (!target) {
      return {
        type: 'warning',
        message: '未找到对应连接，请先重新检查最新状态',
      };
    }
    return {
      type: 'connection',
      connection: target,
      repairSource: 'connection',
    };
  }

  if (issue.action === 'open_proxy_settings') {
    return {
      type: 'proxy',
      repairSource: 'proxy',
    };
  }

  if (issue.action === 'open_ai_settings') {
    return {
      type: 'ai',
      providerId: issue.refId || undefined,
      repairSource: 'ai',
    };
  }

  if (issue.action === 'retry_update') {
    return {
      type: 'retry',
    };
  }

  return {
    type: 'details',
    focusTarget: resolveSecurityUpdateSettingsFocusTarget(status),
  };
};

export const shouldReopenSecurityUpdateDetails = (
  repairSource: SecurityUpdateRepairSource | null | undefined,
): boolean => repairSource === 'connection' || repairSource === 'proxy' || repairSource === 'ai';

export const shouldRefreshSecurityUpdateDetailsFocus = ({
  requestedOpen,
  wasOpen,
}: {
  requestedOpen: boolean;
  wasOpen: boolean;
}): boolean => requestedOpen && !wasOpen;

export const shouldRetrySecurityUpdateAfterRepairSave = (
  repairSource: SecurityUpdateRepairSource | null | undefined,
): boolean => repairSource === 'connection';
