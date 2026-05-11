import dayjs from 'dayjs';

export type TemporalPickerType = 'datetime' | 'date' | 'time' | 'year' | null;

export const TEMPORAL_FORMATS: Record<string, string> = {
  datetime: 'YYYY-MM-DD HH:mm:ss',
  date: 'YYYY-MM-DD',
  time: 'HH:mm:ss',
  year: 'YYYY',
};

export const isTemporalColumnType = (columnType?: string): boolean => {
  const raw = String(columnType || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes('datetime') || raw.includes('timestamp')) return true;
  const base = raw.split(/[ (]/)[0];
  return base === 'date' || base === 'time' || base === 'year';
};

export const getTemporalPickerType = (columnType?: string): TemporalPickerType => {
  const raw = String(columnType || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('datetime') || raw.includes('timestamp')) return 'datetime';
  const base = raw.split(/[ (]/)[0];
  if (base === 'date') return 'date';
  if (base === 'time') return 'time';
  if (base === 'year') return 'year';
  return null;
};

export const parseToDayjs = (val: any, pickerType: TemporalPickerType): dayjs.Dayjs | null => {
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
  formValue: any,
  pickerValue: dayjs.Dayjs | null | undefined,
  pickerType: TemporalPickerType,
): string | null | any => {
  const value = pickerValue !== undefined ? pickerValue : formValue;
  if (value && dayjs.isDayjs(value)) {
    return formatFromDayjs(value as dayjs.Dayjs, pickerType);
  }
  if (!value) {
    return null;
  }
  return value;
};
