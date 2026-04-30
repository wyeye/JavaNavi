import type { AIProviderConfig, AIProviderType } from '../types';

export const LEGACY_QWEN_BAILIAN_OPENAI_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const LEGACY_QWEN_CODING_PLAN_OPENAI_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';
export const QWEN_BAILIAN_ANTHROPIC_BASE_URL = 'https://dashscope.aliyuncs.com/apps/anthropic';
export const QWEN_CODING_PLAN_ANTHROPIC_BASE_URL = 'https://coding.dashscope.aliyuncs.com/apps/anthropic';
export const QWEN_BAILIAN_MODELS_BASE_URL = LEGACY_QWEN_BAILIAN_OPENAI_BASE_URL;

export const QWEN_CODING_PLAN_MODELS = [
  'qwen3.5-plus',
  'kimi-k2.5',
  'glm-5',
  'MiniMax-M2.5',
  'qwen3-max-2026-01-23',
  'qwen3-coder-next',
  'qwen3-coder-plus',
  'glm-4.7',
];

const CUSTOM_LIKE_PRESET_KEYS = new Set(['custom', 'ollama']);

export interface ResolvePresetModelSelectionInput {
  presetKey: string;
  presetDefaultModel: string;
  presetModels: string[];
  valuesModel?: string;
  customModels?: string[];
}

export interface ResolvePresetModelSelectionResult {
  model: string;
  models: string[];
}

export interface ResolvePresetBaseURLInput {
  presetKey: string;
  presetDefaultBaseUrl: string;
  valuesBaseUrl?: string;
}

export interface ResolvePresetTransportInput {
  presetBackendType: AIProviderType;
  presetFixedApiFormat?: string;
  valuesApiFormat?: string;
}

export interface ResolvePresetTransportResult {
  type: AIProviderType;
  apiFormat?: string;
}

export interface ProviderPresetMatcher {
  key: string;
  backendType: AIProviderType;
  defaultBaseUrl: string;
  fixedApiFormat?: string;
}

export const getProviderHostname = (raw?: string): string => {
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export const getProviderFingerprint = (raw?: string): string => {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const normalizedPath = url.pathname.replace(/\/+$/, '').toLowerCase();
    return `${url.hostname.toLowerCase()}${normalizedPath}`;
  } catch {
    return '';
  }
};

export const matchQwenPresetKey = (provider: Pick<AIProviderConfig, 'type' | 'baseUrl' | 'apiFormat'>): string | null => {
  const fingerprint = getProviderFingerprint(provider.baseUrl);

  if (
    fingerprint !== ''
    && fingerprint === getProviderFingerprint(QWEN_BAILIAN_ANTHROPIC_BASE_URL)
    && provider.type === 'anthropic'
  ) {
    return 'qwen-bailian';
  }

  if (
    fingerprint !== ''
    && fingerprint === getProviderFingerprint(LEGACY_QWEN_BAILIAN_OPENAI_BASE_URL)
    && provider.type === 'openai'
  ) {
    return 'qwen-bailian';
  }

  if (
    fingerprint !== ''
    && fingerprint === getProviderFingerprint(QWEN_CODING_PLAN_ANTHROPIC_BASE_URL)
    && provider.type === 'custom'
    && provider.apiFormat === 'claude-cli'
  ) {
    return 'qwen-coding-plan';
  }

  if (
    fingerprint !== ''
    && fingerprint === getProviderFingerprint(LEGACY_QWEN_CODING_PLAN_OPENAI_BASE_URL)
    && provider.type === 'openai'
  ) {
    return 'qwen-coding-plan';
  }

  return null;
};

export const resolveProviderPresetKey = (
  provider: Pick<AIProviderConfig, 'type' | 'baseUrl' | 'apiFormat'>,
  presets: ProviderPresetMatcher[],
  fallbackKey = 'custom',
): string => {
  const qwenPresetKey = matchQwenPresetKey(provider);
  if (qwenPresetKey) {
    return qwenPresetKey;
  }

  const fingerprint = getProviderFingerprint(provider.baseUrl);
  const exactPreset = presets.find((preset) =>
    preset.backendType === provider.type
    && fingerprint !== ''
    && fingerprint === getProviderFingerprint(preset.defaultBaseUrl)
    && (!preset.fixedApiFormat || preset.fixedApiFormat === provider.apiFormat),
  );
  if (exactPreset) {
    return exactPreset.key;
  }

  // custom 供应商必须保守处理，避免仅凭 host 错误吞掉用户显式保存的自定义配置。
  if (provider.type === 'custom') {
    return fallbackKey;
  }

  const host = getProviderHostname(provider.baseUrl);
  if (provider.type === 'anthropic' && host.endsWith('moonshot.cn')) {
    const moonshotPreset = presets.find((preset) => preset.key === 'moonshot');
    if (moonshotPreset) {
      return moonshotPreset.key;
    }
  }

  const hostPreset = presets.find((preset) =>
    preset.backendType === provider.type
    && host !== ''
    && host === getProviderHostname(preset.defaultBaseUrl)
    && (!preset.fixedApiFormat || preset.fixedApiFormat === provider.apiFormat),
  );
  if (hostPreset) {
    return hostPreset.key;
  }

  const typePreset = presets.find((preset) => preset.backendType === provider.type && !preset.fixedApiFormat);
  return typePreset?.key || fallbackKey;
};

export const resolvePresetModelSelection = ({
  presetKey,
  presetDefaultModel,
  presetModels,
  valuesModel,
  customModels,
}: ResolvePresetModelSelectionInput): ResolvePresetModelSelectionResult => {
  const isCustomLike = CUSTOM_LIKE_PRESET_KEYS.has(presetKey);
  const resolvedModels = isCustomLike ? (customModels || []) : presetModels;
  const fallbackModel = resolvedModels.length > 0 ? resolvedModels[0] : '';
  return {
    models: resolvedModels,
    model: isCustomLike ? (valuesModel || fallbackModel) : (valuesModel || presetDefaultModel),
  };
};

export const resolvePresetBaseURL = ({
  presetKey,
  presetDefaultBaseUrl,
  valuesBaseUrl,
}: ResolvePresetBaseURLInput): string => {
  if (CUSTOM_LIKE_PRESET_KEYS.has(presetKey)) {
    return valuesBaseUrl || presetDefaultBaseUrl;
  }
  return presetDefaultBaseUrl;
};

export const resolvePresetTransport = ({
  presetBackendType,
  presetFixedApiFormat,
  valuesApiFormat,
}: ResolvePresetTransportInput): ResolvePresetTransportResult => {
  if (presetFixedApiFormat) {
    return {
      type: presetBackendType,
      apiFormat: presetFixedApiFormat,
    };
  }

  if (presetBackendType === 'custom') {
    return {
      type: presetBackendType,
      apiFormat: valuesApiFormat || 'openai',
    };
  }

  return {
    type: presetBackendType,
    apiFormat: undefined,
  };
};
