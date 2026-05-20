const DEV_ABOUT_VERSION = '0.0.1-dev';

export const resolveAboutDisplayVersion = (
  buildType: string,
  version: string | undefined,
): string => {
  const normalizedBuildType = String(buildType || '').trim().toLowerCase();
  const normalizedVersion = String(version || '').trim();
  if (normalizedVersion) {
    return normalizedVersion;
  }
  if (normalizedBuildType === 'development' || normalizedBuildType === 'dev') {
    return DEV_ABOUT_VERSION;
  }
  return 'Unknown';
};
