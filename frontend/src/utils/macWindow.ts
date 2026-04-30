export const shouldHandleMacNativeFullscreenShortcut = (
  isMacRuntime: boolean,
  useNativeMacWindowControls: boolean,
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'key'>,
): boolean => {
  if (!isMacRuntime || !useNativeMacWindowControls) {
    return false;
  }
  if (!event.ctrlKey || !event.metaKey || event.altKey) {
    return false;
  }
  return String(event.key || '').toLowerCase() === 'f';
};

export const shouldSuppressMacNativeEscapeExit = (
  isMacRuntime: boolean,
  useNativeMacWindowControls: boolean,
  isFullscreen: boolean,
  event: Pick<KeyboardEvent, 'key' | 'defaultPrevented'>,
): boolean => {
  if (!isMacRuntime || !useNativeMacWindowControls || !isFullscreen) {
    return false;
  }
  if (event.defaultPrevented) {
    return false;
  }
  return String(event.key || '') === 'Escape';
};
