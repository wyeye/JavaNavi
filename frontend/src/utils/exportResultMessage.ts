import { translate, type AppLanguage } from '../i18n';

const text = (value: unknown): string => String(value ?? '').trim();

export const exportSuccessMessage = (result: unknown, language: AppLanguage, fallback?: string): string => {
  const data = (result as any)?.data ?? result;
  const revealMessage = text(data?.revealMessage);
  if (revealMessage) return revealMessage;

  const filePath = text(data?.filePath || data?.path || data?.revealTargetPath);
  if (filePath) {
    return translate(language, 'export.successWithPath', { path: filePath });
  }

  return fallback || translate(language, 'export.success');
};
