export type AIComposerNoticeTone = 'warning' | 'error';

export interface AIComposerNotice {
  tone: AIComposerNoticeTone;
  title: string;
  description: string;
}

const defaultModelFetchFailedDescription = '请检查供应商入口、API Key 或账号权限，然后重新打开模型下拉。';

export const buildMissingProviderNotice = (): AIComposerNotice => ({
  tone: 'warning',
  title: '还没有可用供应商',
  description: '先在 AI 设置里添加并启用一个模型供应商。',
});

export const buildMissingModelNotice = (): AIComposerNotice => ({
  tone: 'warning',
  title: '先选择一个模型',
  description: '打开下方模型下拉并选择模型；如果列表为空，请检查供应商入口和 API Key。',
});

export const buildModelFetchFailedNotice = (error?: string): AIComposerNotice => ({
  tone: 'error',
  title: '模型列表加载失败',
  description: String(error || '').trim() || defaultModelFetchFailedDescription,
});
