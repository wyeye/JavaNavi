const AUTO_FIT_DEFAULT_MIN_WIDTH = 80;
const AUTO_FIT_DEFAULT_MAX_WIDTH = 720;
const AUTO_FIT_DEFAULT_PADDING = 40;
const AUTO_FIT_DEFAULT_SAMPLE_LIMIT = 200;
const AUTO_FIT_MAX_PREVIEW_CHARS = 120;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Object.prototype.toString.call(value) === '[object Object]';
};

const clampWidth = (value: number, minWidth: number, maxWidth: number) => {
  const safeMin = Math.max(1, Math.floor(minWidth));
  const safeMax = Math.max(safeMin, Math.floor(maxWidth));
  return Math.min(safeMax, Math.max(safeMin, Math.ceil(value)));
};

const normalizePreviewLine = (value: string): string => {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n');
  if (normalized.length <= AUTO_FIT_MAX_PREVIEW_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, AUTO_FIT_MAX_PREVIEW_CHARS)}…`;
};

const splitPreviewLines = (value: string): string[] => {
  return normalizePreviewLine(value)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
};

export const normalizeAutoFitCellText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'string') {
    return normalizePreviewLine(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length > 80) {
      return `[Array(${value.length})]`;
    }
    try {
      return normalizePreviewLine(JSON.stringify(value));
    } catch {
      return '[Array]';
    }
  }

  if (isPlainObject(value)) {
    const topLevelSize = Object.keys(value).length;
    if (topLevelSize > 80) {
      return `{Object(${topLevelSize})}`;
    }
    try {
      return normalizePreviewLine(JSON.stringify(value));
    } catch {
      return '[Object]';
    }
  }

  return normalizePreviewLine(String(value));
};

export const calculateAutoFitColumnWidth = ({
  headerTexts,
  valueTexts,
  measureHeaderText,
  measureCellText,
  minWidth = AUTO_FIT_DEFAULT_MIN_WIDTH,
  maxWidth = AUTO_FIT_DEFAULT_MAX_WIDTH,
  padding = AUTO_FIT_DEFAULT_PADDING,
  sampleLimit = AUTO_FIT_DEFAULT_SAMPLE_LIMIT,
  defaultWidth,
}: {
  headerTexts: Array<string | null | undefined>;
  valueTexts: unknown[];
  measureHeaderText: (text: string) => number;
  measureCellText: (text: string) => number;
  minWidth?: number;
  maxWidth?: number;
  padding?: number;
  sampleLimit?: number;
  defaultWidth: number;
}): number => {
  const safePadding = Math.max(0, Math.ceil(padding));
  let widestTextWidth = Math.max(0, Number(defaultWidth) - safePadding);

  headerTexts.forEach((text) => {
    splitPreviewLines(normalizeAutoFitCellText(text ?? '')).forEach((line) => {
      widestTextWidth = Math.max(widestTextWidth, measureHeaderText(line));
    });
  });

  valueTexts.slice(0, Math.max(1, sampleLimit)).forEach((value) => {
    splitPreviewLines(normalizeAutoFitCellText(value)).forEach((line) => {
      widestTextWidth = Math.max(widestTextWidth, measureCellText(line));
    });
  });

  return clampWidth(widestTextWidth + safePadding, minWidth, maxWidth);
};
