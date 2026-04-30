import type { JVMActionDefinition, JVMChangeRequest, JVMAIPlanContext, JVMValueSnapshot, TabData } from '../types';
import { JVM_SENSITIVE_VALUE_MASK } from './jvmResourcePresentation';

export type JVMAIChangePlan = {
  targetType: 'cacheEntry' | 'managedBean' | 'attribute' | 'operation';
  selector: {
    namespace?: string;
    key?: string;
    resourcePath?: string;
  };
  action: string;
  payload?: {
    format: 'json' | 'text';
    value: unknown;
  };
  reason: string;
};

export type JVMAIChangeDraft = Pick<JVMChangeRequest, 'resourceId' | 'action' | 'reason' | 'source' | 'payload'>;

type JVMAIPlanPromptContext = {
  connectionName: string;
  host?: string;
  providerMode: 'jmx' | 'endpoint' | 'agent';
  resourcePath: string;
  readOnly: boolean;
  environment?: string;
  snapshot?: JVMValueSnapshot | null;
};

const planFencePattern = /```json\s*([\s\S]*?)```/gi;
const allowedTargetTypes = new Set<JVMAIChangePlan['targetType']>(['cacheEntry', 'managedBean', 'attribute', 'operation']);
const allowedPayloadFormats = new Set<NonNullable<JVMAIChangePlan['payload']>['format']>(['json', 'text']);

const asTrimmedString = (value: unknown): string => String(value ?? '').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeSelector = (value: unknown): JVMAIChangePlan['selector'] | null => {
  if (!isRecord(value)) {
    return null;
  }

  const selector: JVMAIChangePlan['selector'] = {};
  const namespace = asTrimmedString(value.namespace);
  const key = asTrimmedString(value.key);
  const resourcePath = asTrimmedString(value.resourcePath);

  if (namespace) {
    selector.namespace = namespace;
  }
  if (key) {
    selector.key = key;
  }
  if (resourcePath) {
    selector.resourcePath = resourcePath;
  }

  return selector.namespace || selector.key || selector.resourcePath ? selector : null;
};

const normalizePayload = (value: unknown): JVMAIChangePlan['payload'] | undefined => {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const format = asTrimmedString(value.format) as NonNullable<JVMAIChangePlan['payload']>['format'];
  if (!allowedPayloadFormats.has(format)) {
    return undefined;
  }

  return {
    format,
    value: value.value,
  };
};

const normalizePlan = (value: unknown): JVMAIChangePlan | null => {
  if (!isRecord(value)) {
    return null;
  }

  const targetType = asTrimmedString(value.targetType) as JVMAIChangePlan['targetType'];
  const action = asTrimmedString(value.action) as JVMAIChangePlan['action'];
  const reason = asTrimmedString(value.reason);
  const selector = normalizeSelector(value.selector);
  const payload = normalizePayload(value.payload);

  if (!allowedTargetTypes.has(targetType) || !action || !reason || !selector) {
    return null;
  }

  return {
    targetType,
    selector,
    action,
    payload,
    reason,
  };
};

const formatSnapshotValue = (snapshot?: JVMValueSnapshot | null): string => {
  if (!snapshot) {
    return '当前资源快照尚未加载成功。';
  }
  if (snapshot.sensitive) {
    return JVM_SENSITIVE_VALUE_MASK;
  }
  if (typeof snapshot.value === 'string') {
    return snapshot.value;
  }
  try {
    return JSON.stringify(snapshot.value ?? null, null, 2);
  } catch {
    return String(snapshot.value);
  }
};

export const extractJVMChangePlan = (content: string): JVMAIChangePlan | null => {
  const source = String(content || '');
  planFencePattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = planFencePattern.exec(source)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const normalized = normalizePlan(parsed);
      if (normalized) {
        return normalized;
      }
    } catch {
      // Ignore malformed JSON blocks and continue scanning.
    }
  }

  return null;
};

export const resolveJVMAIPlanResourceId = (plan: JVMAIChangePlan): string => {
  const resourcePath = asTrimmedString(plan.selector.resourcePath);
  if (resourcePath) {
    return resourcePath;
  }

  const namespace = asTrimmedString(plan.selector.namespace);
  const key = asTrimmedString(plan.selector.key);
  return [namespace, key].filter(Boolean).join('/');
};

export const matchesJVMAIPlanTargetTab = (
  tab: Pick<TabData, 'type' | 'connectionId' | 'providerMode' | 'resourcePath'>,
  context?: JVMAIPlanContext,
): boolean => {
  if (!context || tab.type !== 'jvm-resource') {
    return false;
  }

  const providerMode = (tab.providerMode || 'jmx') as JVMAIPlanContext['providerMode'];
  return (
    tab.connectionId === context.connectionId &&
    providerMode === context.providerMode &&
    asTrimmedString(tab.resourcePath) === asTrimmedString(context.resourcePath)
  );
};

export const resolveJVMAIPlanTargetTabId = (tabs: TabData[], context?: JVMAIPlanContext): string => {
  if (!context) {
    return '';
  }

  const exactMatch = tabs.find((tab) => tab.id === context.tabId && matchesJVMAIPlanTargetTab(tab, context));
  if (exactMatch) {
    return exactMatch.id;
  }

  const fallbackMatch = tabs.find((tab) => matchesJVMAIPlanTargetTab(tab, context));
  return fallbackMatch?.id || '';
};

export const buildJVMChangeDraftFromAIPlan = (plan: JVMAIChangePlan): JVMAIChangeDraft => {
  const resourceId = resolveJVMAIPlanResourceId(plan);
  if (!resourceId) {
    throw new Error('AI 计划缺少可用的资源定位信息');
  }

  const reason = asTrimmedString(plan.reason);
  if (!reason) {
    throw new Error('AI 计划缺少变更原因');
  }

  const action = asTrimmedString(plan.action);
  if (!action) {
    throw new Error('AI 计划缺少可执行 action');
  }

  if (plan.action === 'updateValue') {
    const value = plan.payload?.value;
    if (plan.payload?.format !== 'json' || !isRecord(value)) {
      throw new Error('当前 JVM 预览要求 payload 仍然是 JSON 对象');
    }
    return {
      resourceId,
      action: 'put',
      reason,
      source: 'ai-plan',
      payload: value as Record<string, any>,
    };
  }

  const payloadValue = plan.payload?.value;
  if (plan.payload && plan.payload.format === 'json') {
    if (!isRecord(payloadValue)) {
      throw new Error('当前 JVM 预览要求 payload 仍然是 JSON 对象');
    }
    return {
      resourceId,
      action,
      reason,
      source: 'ai-plan',
      payload: payloadValue as Record<string, any>,
    };
  }

  if (plan.payload && plan.payload.format === 'text') {
    return {
      resourceId,
      action,
      reason,
      source: 'ai-plan',
      payload: {
        value: payloadValue == null ? '' : String(payloadValue),
      },
    };
  }

  return {
    resourceId,
    action,
    reason,
    source: 'ai-plan',
    payload: {},
  };
};

const formatSupportedActions = (actions?: JVMActionDefinition[]): string => {
  if (!actions || actions.length === 0) {
    return '当前资源未声明支持动作。若要生成计划，请仅在你能从快照内容中明确推断时给出 action，并保持 payload 为 JSON 对象。';
  }
  return actions
    .map((item) => {
      const payloadFields = Array.isArray(item.payloadFields) && item.payloadFields.length > 0
        ? `；payload 字段：${item.payloadFields.map((field) => `${field.name}${field.required ? '(required)' : ''}`).join('、')}`
        : '';
      return `- ${item.action}${item.label ? ` (${item.label})` : ''}${item.description ? `：${item.description}` : ''}${payloadFields}`;
    })
    .join('\n');
};

export const buildJVMAIPlanPrompt = ({
  connectionName,
  host,
  providerMode,
  resourcePath,
  readOnly,
  environment,
  snapshot,
}: JVMAIPlanPromptContext): string => {
  const normalizedPath = asTrimmedString(resourcePath) || '(未提供资源路径)';
  const snapshotFormat = asTrimmedString(snapshot?.format) || 'json';
  const environmentLabel = asTrimmedString(environment) || 'unknown';
  const supportedActionsText = formatSupportedActions(snapshot?.supportedActions);

  return [
    '请分析下面这个 JVM 资源，并生成一个可用于 JavaNavi “预览变更” 的结构化修改计划。',
    '',
    `连接名称：${connectionName}`,
    `目标主机：${asTrimmedString(host) || '-'}`,
    `Provider 模式：${providerMode}`,
    `运行环境：${environmentLabel}`,
    `连接策略：${readOnly ? '只读连接，当前只能生成计划和风险分析，不能假设已执行' : '可写连接，但仍必须先预览再人工确认'}`,
    `当前资源路径：${normalizedPath}`,
    '',
    '当前资源快照：',
    `\`\`\`${snapshotFormat}`,
    formatSnapshotValue(snapshot),
    '```',
    '',
    '当前资源支持动作：',
    supportedActionsText,
    '',
    '输出要求：',
    '1. 可以先给一小段分析，但必须包含且只包含一个 ```json 代码块。',
    '2. 代码块里的 JSON 字段必须严格是：targetType、selector、action、payload、reason。',
    `3. selector.resourcePath 优先使用当前资源路径 ${normalizedPath}，不要凭空编造其他路径。`,
    '4. action 优先从“当前资源支持动作”里选择；如果当前资源未声明支持动作，才允许基于快照内容推断。',
    '5. payload 只能使用 JSON 对象包装，不要输出脚本、命令或原始二进制。若需要纯文本值，也请包装成 {"format":"text","value":"..."}。',
    '6. 不要声称已经执行修改，也不要输出脚本或命令。',
    '',
    'JSON 示例：',
    '```json',
    JSON.stringify(
      {
        targetType: 'cacheEntry',
        selector: {
          resourcePath: normalizedPath,
        },
        action: 'put',
        payload: {
          format: 'json',
          value: {
            status: 'ACTIVE',
          },
        },
        reason: '修复缓存脏值',
      },
      null,
      2,
    ),
    '```',
  ].join('\n');
};
