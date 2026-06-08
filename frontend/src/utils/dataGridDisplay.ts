import { translate, type AppLanguage } from '../i18n';

export type DataTableColumnWidthMode = 'standard' | 'compact';

export interface DataGridDisplaySettings {
  showDataTableVerticalBorders: boolean;
  dataTableColumnWidthMode: DataTableColumnWidthMode;
}

export const DEFAULT_DATA_GRID_DISPLAY_SETTINGS: DataGridDisplaySettings = {
  showDataTableVerticalBorders: false,
  dataTableColumnWidthMode: 'standard',
};

export const getDataGridColumnWidthModeOptions = (language: AppLanguage = 'en') => [
  { label: translate(language, 'dataGrid.columnWidth.standard'), value: 'standard' as const },
  { label: translate(language, 'dataGrid.columnWidth.compact'), value: 'compact' as const },
];

export const DATA_GRID_COLUMN_WIDTH_MODE_OPTIONS = getDataGridColumnWidthModeOptions('en');

const STANDARD_DATA_TABLE_COLUMN_WIDTH = 200;
const COMPACT_DATA_TABLE_COLUMN_WIDTH = 140;

export const sanitizeDataTableColumnWidthMode = (value: unknown): DataTableColumnWidthMode => {
  return value === 'compact' ? 'compact' : 'standard';
};

export const sanitizeDataGridDisplaySettings = (
  value: Partial<DataGridDisplaySettings> | undefined
): DataGridDisplaySettings => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_DATA_GRID_DISPLAY_SETTINGS };
  }

  return {
    showDataTableVerticalBorders: value.showDataTableVerticalBorders === true,
    dataTableColumnWidthMode: sanitizeDataTableColumnWidthMode(value.dataTableColumnWidthMode),
  };
};

export const resolveDataTableDefaultColumnWidth = (
  widthMode: DataTableColumnWidthMode | null | undefined
): number => {
  return sanitizeDataTableColumnWidthMode(widthMode) === 'compact'
    ? COMPACT_DATA_TABLE_COLUMN_WIDTH
    : STANDARD_DATA_TABLE_COLUMN_WIDTH;
};

export const resolveDataTableColumnWidth = ({
  manualWidth,
  widthMode,
}: {
  manualWidth: number | null | undefined;
  widthMode: DataTableColumnWidthMode | null | undefined;
}): number => {
  if (typeof manualWidth === 'number' && Number.isFinite(manualWidth) && manualWidth > 0) {
    return manualWidth;
  }

  return resolveDataTableDefaultColumnWidth(widthMode);
};

export const resolveDataTableVerticalBorderColor = ({
  darkMode,
  visible,
}: {
  darkMode: boolean;
  visible: boolean;
}): string => {
  if (!visible) {
    return 'transparent';
  }

  return darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
};
