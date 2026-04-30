import type { SavedConnection } from '../types';
import { getDbDefaultColor } from '../components/DatabaseIcons';

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const toTrimmedString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
};

export const normalizeConnectionIconColor = (value: unknown): string => {
  const color = toTrimmedString(value);
  return HEX_COLOR_PATTERN.test(color) ? color : '';
};

export const resolveConnectionIconType = (
  connection?: Pick<SavedConnection, 'iconType' | 'config'> | null,
): string => {
  const iconType = toTrimmedString(connection?.iconType).toLowerCase();
  if (iconType) {
    return iconType;
  }
  const configType = toTrimmedString(connection?.config?.type).toLowerCase();
  return configType || 'custom';
};

export const resolveConnectionAccentColor = (
  connection?: Pick<SavedConnection, 'iconColor' | 'iconType' | 'config'> | null,
): string => {
  const iconColor = normalizeConnectionIconColor(connection?.iconColor);
  if (iconColor) {
    return iconColor;
  }
  return getDbDefaultColor(resolveConnectionIconType(connection));
};
