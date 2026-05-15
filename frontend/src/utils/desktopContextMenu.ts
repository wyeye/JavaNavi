export function isJavaNaviDesktopUserAgent(userAgent: string): boolean {
  return (userAgent || '').includes('JavaNaviDesktop/');
}

export function shouldSuppressDesktopContextMenu(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isJavaNaviDesktopUserAgent(navigator.userAgent || '');
}

export function installDesktopContextMenuSuppression(): void {
  if (typeof window === 'undefined' || !shouldSuppressDesktopContextMenu()) {
    return;
  }

  window.addEventListener(
    'contextmenu',
    (event) => {
      event.preventDefault();
    },
    { capture: true },
  );
}
