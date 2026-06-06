import dayjs from 'dayjs';
import { sanitizeLanguage, type AppLanguage } from '../../i18n/index.ts';

export type TemporalPickerType = 'datetime' | 'date' | 'time' | 'year' | null;

export const TEMPORAL_FORMATS: Record<string, string> = {
  datetime: 'YYYY-MM-DD HH:mm:ss',
  date: 'YYYY-MM-DD',
  time: 'HH:mm:ss',
  year: 'YYYY',
};

const getTemporalBaseType = (columnType?: string): string => (
  String(columnType || '').trim().toLowerCase().split(/[ (]/)[0] || ''
);

export const isTemporalColumnType = (columnType?: string): boolean => {
  return getTemporalPickerType(columnType) !== null;
};

export const getTemporalPickerType = (columnType?: string): TemporalPickerType => {
  const raw = String(columnType || '').trim().toLowerCase();
  if (!raw) return null;
  const base = getTemporalBaseType(raw);
  if (raw.includes('timestamp') || base.startsWith('datetim')) return 'datetime';
  if (base === 'date') return 'date';
  if (base === 'time' || base === 'timetz') return 'time';
  if (base === 'year') return 'year';
  return null;
};


export const resolveDataGridPickerLocaleKey = (language?: unknown): AppLanguage => sanitizeLanguage(language);

export const shouldTemporalEditorUseConfirm = (pickerType: TemporalPickerType): boolean => false;

export const shouldTemporalEditorSaveOnChange = (pickerType: TemporalPickerType): boolean => pickerType !== null;

export const parseToDayjs = (val: unknown, pickerType: TemporalPickerType): dayjs.Dayjs | null => {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim();
  if (!str || /^0{4}-0{2}-0{2}/.test(str)) return null;
  const fmt = TEMPORAL_FORMATS[pickerType || 'datetime'];
  const d = dayjs(str, fmt);
  return d.isValid() ? d : dayjs(str).isValid() ? dayjs(str) : null;
};

export const formatFromDayjs = (val: dayjs.Dayjs | null, pickerType: TemporalPickerType): string => {
  if (!val || !val.isValid()) return '';
  const fmt = TEMPORAL_FORMATS[pickerType || 'datetime'];
  return val.format(fmt);
};

export const resolveTemporalEditorSaveValue = (
  formValue: unknown,
  pickerValue: dayjs.Dayjs | null | undefined,
  pickerType: TemporalPickerType,
): string | null | unknown => {
  const value = pickerValue !== undefined ? pickerValue : formValue;
  if (value && dayjs.isDayjs(value)) {
    return formatFromDayjs(value, pickerType);
  }
  if (!value) {
    return null;
  }
  return value;
};
