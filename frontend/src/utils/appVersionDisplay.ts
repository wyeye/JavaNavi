const DEV_ABOUT_VERSION = '0.0.1-dev';

export const resolveAboutDisplayVersion = (
  buildType: string,
  version: string | undefined,
): string => {
  const normalizedBuildType = String(buildType || '').trim().toLowerCase();
  if (normalizedBuildType === 'development' || normalizedBuildType === 'dev') {
    return DEV_ABOUT_VERSION;
  }

  const normalizedVersion = String(version || '').trim();
  return normalizedVersion || 'Unknown';
};
