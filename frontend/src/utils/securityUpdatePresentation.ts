import type {
  SecurityUpdateIssue,
  SecurityUpdateIssueAction,
  SecurityUpdateIssueSeverity,
  SecurityUpdateItemStatus,
  SecurityUpdateStatus,
} from '../types';
import { DEFAULT_LANGUAGE, translate, type AppLanguage } from '../i18n';

type SecurityUpdateTone = 'default' | 'warning' | 'processing' | 'success' | 'error';

type SecurityUpdateStatusMeta = {
  label: string;
  description: string;
  tone: SecurityUpdateTone;
};

type SecurityUpdateEntryVisibility = {
  showIntro: boolean;
  showBanner: boolean;
  showDetailEntry: boolean;
};

type SecurityUpdateIssueActionMeta = {
  label: string;
  emphasis: 'primary' | 'default';
};

type SecurityUpdateBadgeMeta = {
  label: string;
  color: SecurityUpdateTone;
};

const severityWeight: Record<SecurityUpdateIssueSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const actionMetaMap: Record<SecurityUpdateIssueAction, Record<AppLanguage, SecurityUpdateIssueActionMeta>> = {
  open_connection: {
    en: { label: 'Open connection', emphasis: 'primary' },
    zh: { label: '打开连接', emphasis: 'primary' },
  },
  open_proxy_settings: {
    en: { label: 'Proxy settings', emphasis: 'primary' },
    zh: { label: '代理设置', emphasis: 'primary' },
  },
  open_ai_settings: {
    en: { label: 'AI settings', emphasis: 'primary' },
    zh: { label: 'AI 设置', emphasis: 'primary' },
  },
  retry_update: {
    en: { label: 'Check again', emphasis: 'primary' },
    zh: { label: '重新检查', emphasis: 'primary' },
  },
  view_details: {
    en: { label: 'View details', emphasis: 'default' },
    zh: { label: '查看详情', emphasis: 'default' },
  },
};

const itemStatusMetaMap: Record<SecurityUpdateItemStatus, Record<AppLanguage, SecurityUpdateBadgeMeta>> = {
  pending: {
    en: { label: 'Pending', color: 'processing' },
    zh: { label: '待更新', color: 'processing' },
  },
  updated: {
    en: { label: 'Updated', color: 'success' },
    zh: { label: '已更新', color: 'success' },
  },
  needs_attention: {
    en: { label: 'Needs attention', color: 'warning' },
    zh: { label: '待处理', color: 'warning' },
  },
  skipped: {
    en: { label: 'Skipped', color: 'default' },
    zh: { label: '已跳过', color: 'default' },
  },
  failed: {
    en: { label: 'Failed', color: 'error' },
    zh: { label: '失败', color: 'error' },
  },
};

const issueSeverityMetaMap: Record<SecurityUpdateIssueSeverity, Record<AppLanguage, SecurityUpdateBadgeMeta>> = {
  high: {
    en: { label: 'High risk', color: 'error' },
    zh: { label: '高风险', color: 'error' },
  },
  medium: {
    en: { label: 'Medium risk', color: 'warning' },
    zh: { label: '中风险', color: 'warning' },
  },
  low: {
    en: { label: 'Low risk', color: 'default' },
    zh: { label: '低风险', color: 'default' },
  },
};

export function sortSecurityUpdateIssues(issues: SecurityUpdateIssue[]): SecurityUpdateIssue[] {
  return [...issues].sort((left, right) => {
    const leftWeight = severityWeight[left.severity ?? 'low'];
    const rightWeight = severityWeight[right.severity ?? 'low'];
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }
    return left.id.localeCompare(right.id);
  });
}

export function getSecurityUpdateStatusMeta(status: SecurityUpdateStatus, language: AppLanguage = DEFAULT_LANGUAGE): SecurityUpdateStatusMeta {
  switch (status.overallStatus) {
    case 'pending':
      return {
        label: language === 'zh' ? '待更新' : 'Pending update',
        description: language === 'zh' ? '检测到可进行的安全更新，你可以现在开始或稍后继续。' : 'A security update is available. You can start now or continue later.',
        tone: 'warning',
      };
    case 'postponed':
      return {
        label: language === 'zh' ? '待更新' : 'Pending update',
        description: language === 'zh' ? '本次安全更新已延后，当前可用配置会继续保留。' : 'This security update was postponed. The current usable config is kept.',
        tone: 'warning',
      };
    case 'in_progress':
      return {
        label: language === 'zh' ? '更新中' : 'Updating',
        description: language === 'zh' ? '正在检查并更新已保存配置的安全存储。' : 'Checking and updating secure storage for saved config.',
        tone: 'processing',
      };
    case 'needs_attention':
      return {
        label: language === 'zh' ? '待处理' : 'Needs attention',
        description: language === 'zh' ? '更新尚未完成，有少量配置需要你处理。' : 'The update is not complete. A few config items need attention.',
        tone: 'warning',
      };
    case 'completed':
      return {
        label: language === 'zh' ? '已完成' : 'Completed',
        description: language === 'zh' ? '已保存配置已完成安全更新。' : 'Saved config security update completed.',
        tone: 'success',
      };
    case 'rolled_back':
      return {
        label: language === 'zh' ? '已回退' : 'Rolled back',
        description: language === 'zh' ? '本次更新未完成，系统已保留当前可用配置。' : 'This update did not finish. Current usable config was kept.',
        tone: 'error',
      };
    case 'not_detected':
    default:
      return {
        label: language === 'zh' ? '未检测到' : translate(language, 'common.notChecked'),
        description: language === 'zh' ? '当前没有需要处理的安全更新。' : 'There are no security updates that need attention.',
        tone: 'default',
      };
  }
}

export function resolveSecurityUpdateEntryVisibility(status: SecurityUpdateStatus): SecurityUpdateEntryVisibility {
  switch (status.overallStatus) {
    case 'pending':
      return {
        showIntro: true,
        showBanner: false,
        showDetailEntry: true,
      };
    case 'postponed':
    case 'needs_attention':
    case 'rolled_back':
      return {
        showIntro: false,
        showBanner: true,
        showDetailEntry: true,
      };
    case 'completed':
    case 'in_progress':
      return {
        showIntro: false,
        showBanner: false,
        showDetailEntry: true,
      };
    case 'not_detected':
    default:
      return {
        showIntro: false,
        showBanner: false,
        showDetailEntry: false,
      };
  }
}

export function getSecurityUpdateIssueActionMeta(issue: Partial<SecurityUpdateIssue>, language: AppLanguage = DEFAULT_LANGUAGE): SecurityUpdateIssueActionMeta {
  return (actionMetaMap[issue.action ?? 'view_details'] ?? actionMetaMap.view_details)[language];
}

export function getSecurityUpdateItemStatusMeta(status?: SecurityUpdateItemStatus, language: AppLanguage = DEFAULT_LANGUAGE): SecurityUpdateBadgeMeta {
  return (itemStatusMetaMap[status ?? 'pending'] ?? itemStatusMetaMap.pending)[language];
}

export function getSecurityUpdateIssueSeverityMeta(severity?: SecurityUpdateIssueSeverity, language: AppLanguage = DEFAULT_LANGUAGE): SecurityUpdateBadgeMeta {
  return (issueSeverityMetaMap[severity ?? 'low'] ?? issueSeverityMetaMap.low)[language];
}

export type {
  SecurityUpdateBadgeMeta,
  SecurityUpdateEntryVisibility,
  SecurityUpdateIssueActionMeta,
  SecurityUpdateStatusMeta,
  SecurityUpdateTone,
};
