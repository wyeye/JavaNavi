import type { CSSProperties } from 'react';

export const PROVIDER_PRESET_CARD_HEIGHT = 96;

export const PROVIDER_PRESET_GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 6,
  gridAutoRows: `${PROVIDER_PRESET_CARD_HEIGHT}px`,
  alignItems: 'stretch',
};

export const PROVIDER_PRESET_CARD_BASE_STYLE: CSSProperties = {
  padding: '12px 14px',
  borderRadius: 12,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  height: '100%',
  minHeight: `${PROVIDER_PRESET_CARD_HEIGHT}px`,
  boxSizing: 'border-box',
  overflow: 'hidden',
};

export const PROVIDER_PRESET_CARD_CONTENT_STYLE: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
};

export const PROVIDER_PRESET_CARD_DESCRIPTION_STYLE: CSSProperties = {
  marginTop: 4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

export const PROVIDER_PRESET_CARD_TITLE_STYLE: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
