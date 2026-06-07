import {
  DEFAULT_LANGUAGE,
  translate,
  type AppLanguage,
} from '../i18n';

export type AIComposerNoticeTone = 'warning' | 'error';

export interface AIComposerNotice {
  tone: AIComposerNoticeTone;
  title: string;
  description: string;
}

const text = (language: AppLanguage | undefined, key: Parameters<typeof translate>[1]) =>
  translate(language || DEFAULT_LANGUAGE, key);

export const buildMissingProviderNotice = (language?: AppLanguage): AIComposerNotice => ({
  tone: 'warning',
  title: text(language, 'ai.notice.missingProvider.title'),
  description: text(language, 'ai.notice.missingProvider.description'),
});

export const buildMissingModelNotice = (language?: AppLanguage): AIComposerNotice => ({
  tone: 'warning',
  title: text(language, 'ai.notice.missingModel.title'),
  description: text(language, 'ai.notice.missingModel.description'),
});

export const buildModelFetchFailedNotice = (error?: string, language?: AppLanguage): AIComposerNotice => ({
  tone: 'error',
  title: text(language, 'ai.notice.modelFetchFailed.title'),
  description: String(error || '').trim() || text(language, 'ai.notice.modelFetchFailed.description'),
});
