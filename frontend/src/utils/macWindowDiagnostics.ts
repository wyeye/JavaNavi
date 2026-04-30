const isTruthyFlag = (value: string | undefined): boolean => {
  switch (String(value || '').trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    default:
      return false;
  }
};

export const shouldEnableMacWindowDiagnostics = (
  isMacRuntime: boolean,
  isDevBuild: boolean,
  envValue?: string,
): boolean => {
  if (!isMacRuntime || !isDevBuild) {
    return false;
  }
  return isTruthyFlag(envValue);
};
