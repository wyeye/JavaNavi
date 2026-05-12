import { translate, type AppLanguage } from '../i18n';

const text = (value: unknown): string => String(value ?? '').trim();

type ExportResultData = {
  data?: ExportResultData;
  revealMessage?: unknown;
  filePath?: unknown;
  path?: unknown;
  revealTargetPath?: unknown;
};

const toExportResultData = (value: unknown): ExportResultData => (
  value && typeof value === 'object' ? value as ExportResultData : {}
);

export const exportSuccessMessage = (result: unknown, language: AppLanguage, fallback?: string): string => {
  const resultData = toExportResultData(result);
  const data = toExportResultData(resultData.data ?? result);
  const revealMessage = text(data?.revealMessage);
  if (revealMessage) return revealMessage;

  const filePath = text(data?.filePath || data?.path || data?.revealTargetPath);
  if (filePath) {
    return translate(language, 'export.successWithPath', { path: filePath });
  }

  return fallback || translate(language, 'export.success');
};
