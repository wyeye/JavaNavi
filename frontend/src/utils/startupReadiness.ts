export interface ConnectionWorkbenchState {
  ready: boolean;
  message: string;
}

export function getConnectionWorkbenchState(
  isStoreHydrated: boolean,
  hasAppliedInitialGlobalProxy: boolean
): ConnectionWorkbenchState {
  if (!isStoreHydrated) {
    return {
      ready: false,
      message: 'Loading local configuration…',
    };
  }
  if (!hasAppliedInitialGlobalProxy) {
    return {
      ready: false,
      message: 'Loading security configuration…',
    };
  }
  return {
    ready: true,
    message: '',
  };
}

