import { getRuntimeLanguage, translate } from '../i18n';

export interface ConnectionWorkbenchState {
  ready: boolean;
  message: string;
}

export function getConnectionWorkbenchState(
  isStoreHydrated: boolean,
  hasLoadedInitialConfig: boolean
): ConnectionWorkbenchState {
  if (!isStoreHydrated) {
    return {
      ready: false,
      message: translate(getRuntimeLanguage(), 'startup.loadingLocalConfig'),
    };
  }
  if (!hasLoadedInitialConfig) {
    return {
      ready: false,
      message: translate(getRuntimeLanguage(), 'startup.loadingAppConfig'),
    };
  }
  return {
    ready: true,
    message: '',
  };
}
