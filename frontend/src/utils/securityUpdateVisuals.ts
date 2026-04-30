import type { CSSProperties } from 'react';

import type { OverlayWorkbenchTheme } from './overlayWorkbenchTheme';

export const SECURITY_UPDATE_ACTION_BUTTON_CLASS = 'security-update-action-btn';
export const SECURITY_UPDATE_BANNER_CLASS = 'security-update-banner';
export const SECURITY_UPDATE_MODAL_CLASS = 'security-update-modal';
export const SECURITY_UPDATE_RESULT_CARD_CLASS = 'security-update-result-card';
export const SECURITY_UPDATE_RESULT_CARD_ACTIVE_CLASS = 'security-update-result-card-active';

type SecurityUpdateSectionSurfaceOptions = {
  emphasized?: boolean;
  surfaceOpacity?: number;
};

const clampOpacity = (value: number): number => Math.min(1, Math.max(0.1, value));

const formatAlpha = (value: number): string => (
  Number(value.toFixed(3)).toString()
);

const applySurfaceOpacity = (token: string, surfaceOpacity = 1): string => {
  const normalizedOpacity = clampOpacity(surfaceOpacity);
  if (normalizedOpacity >= 0.999) {
    return token;
  }

  return token.replace(
    /rgba\(\s*([^)]+?)\s*,\s*([0-9]*\.?[0-9]+)\s*\)/g,
    (_, channels: string, alpha: string) => `rgba(${channels}, ${formatAlpha(Number(alpha) * normalizedOpacity)})`,
  );
};

const getSecurityUpdateHighlightBorder = (overlayTheme: OverlayWorkbenchTheme): string => (
  overlayTheme.isDark
    ? '1px solid rgba(255,214,102,0.26)'
    : '1px solid rgba(22,119,255,0.22)'
);

const getSecurityUpdateHighlightBackground = (overlayTheme: OverlayWorkbenchTheme): string => (
  overlayTheme.isDark
    ? 'linear-gradient(180deg, rgba(255,214,102,0.14) 0%, rgba(255,255,255,0.05) 100%)'
    : 'linear-gradient(180deg, rgba(22,119,255,0.12) 0%, rgba(255,255,255,0.96) 100%)'
);

const getSecurityUpdateHighlightShadow = (overlayTheme: OverlayWorkbenchTheme): string => (
  overlayTheme.isDark
    ? '0 0 0 1px rgba(255,214,102,0.12), 0 12px 24px rgba(0,0,0,0.16)'
    : '0 0 0 1px rgba(22,119,255,0.08), 0 10px 22px rgba(15,23,42,0.08)'
);

export const getSecurityUpdateActionButtonStyle = (): CSSProperties => ({
  height: 36,
  borderRadius: 12,
  paddingInline: 16,
  boxShadow: 'none',
  fontWeight: 600,
});

export const getSecurityUpdateShellSurfaceStyle = (
  overlayTheme: OverlayWorkbenchTheme,
  surfaceOpacity = 1,
): CSSProperties => ({
  border: applySurfaceOpacity(overlayTheme.shellBorder, surfaceOpacity),
  background: applySurfaceOpacity(overlayTheme.shellBg, surfaceOpacity),
  boxShadow: applySurfaceOpacity(overlayTheme.shellShadow, surfaceOpacity),
  backdropFilter: overlayTheme.shellBackdropFilter,
});

export const getSecurityUpdateBannerSurfaceStyle = (
  overlayTheme: OverlayWorkbenchTheme,
  surfaceOpacity = 1,
): CSSProperties => ({
  ...getSecurityUpdateShellSurfaceStyle(overlayTheme, surfaceOpacity),
  boxShadow: 'none',
});

export const getSecurityUpdateSectionSurfaceStyle = (
  overlayTheme: OverlayWorkbenchTheme,
  options: SecurityUpdateSectionSurfaceOptions = {},
): CSSProperties => ({
  border: applySurfaceOpacity(
    options.emphasized ? getSecurityUpdateHighlightBorder(overlayTheme) : overlayTheme.sectionBorder,
    options.surfaceOpacity,
  ),
  background: applySurfaceOpacity(
    options.emphasized ? getSecurityUpdateHighlightBackground(overlayTheme) : overlayTheme.sectionBg,
    options.surfaceOpacity,
  ),
  boxShadow: options.emphasized
    ? applySurfaceOpacity(getSecurityUpdateHighlightShadow(overlayTheme), options.surfaceOpacity)
    : 'none',
  transition: 'background 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
});
