import enUSPickerLocale from 'antd/es/date-picker/locale/en_US';
import zhCNPickerLocale from 'antd/es/date-picker/locale/zh_CN';
import type { PickerLocale } from 'antd/es/date-picker/generatePicker';
import { resolveDataGridPickerLocaleKey } from './dataGridTemporal';

export const getDataGridPickerLocale = (language?: unknown): PickerLocale => (
  resolveDataGridPickerLocaleKey(language) === 'zh' ? zhCNPickerLocale : enUSPickerLocale
);
