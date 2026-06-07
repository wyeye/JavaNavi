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
      message: 'Loading local configuration…',
    };
  }
  if (!hasLoadedInitialConfig) {
    return {
      ready: false,
      message: 'Loading application configuration…',
    };
  }
  return {
    ready: true,
    message: '',
  };
}
