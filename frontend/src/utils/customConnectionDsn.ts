import { translate, type AppLanguage } from '../i18n';

export interface CustomConnectionDsnState {
  dsnInput: unknown;
  hasStoredSecret?: boolean;
  clearStoredSecret?: boolean;
  language?: AppLanguage;
}

export const getCustomConnectionDsnValidationMessage = ({
  dsnInput,
  hasStoredSecret,
  clearStoredSecret,
  language = 'en',
}: CustomConnectionDsnState): string | null => {
  const dsnText = String(dsnInput ?? '').trim();
  if (dsnText !== '') {
    return null;
  }
  if (hasStoredSecret && !clearStoredSecret) {
    return null;
  }
  if (hasStoredSecret && clearStoredSecret) {
    return translate(language, 'connectionModal.custom.dsnRequiredAfterClear');
  }
  return translate(language, 'connectionModal.custom.dsnRequired');
};

export const shouldAllowBlankCustomDsn = (state: CustomConnectionDsnState): boolean => (
  getCustomConnectionDsnValidationMessage(state) === null
);
