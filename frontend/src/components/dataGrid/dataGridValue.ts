const DATE_TIME_CACHE_LIMIT = 2000;
const TABLE_CELL_PREVIEW_MAX_CHARS = 240;
const normalizedDateTimeCache = new Map<string, string>();
const objectCellPreviewCache = new WeakMap<object, string>();

export type DataGridJsonValue =
    | string
    | number
    | boolean
    | null
    | DataGridJsonValue[]
    | { [key: string]: DataGridJsonValue | undefined };

const trimSimpleCache = (cache: Map<string, string>, limit: number) => {
    if (cache.size < limit) return;
    const firstKey = cache.keys().next().value;
    if (typeof firstKey === 'string') {
        cache.delete(firstKey);
    }
};

export const looksLikeDateTimeText = (val: string): boolean => {
    if (!val) return false;
    const len = val.length;
    if (len < 19 || len > 48) return false;
    const charCode0 = val.charCodeAt(0);
    if (charCode0 < 48 || charCode0 > 57) return false;
    return (
        val[4] === '-' &&
        val[7] === '-' &&
        (val[10] === ' ' || val[10] === 'T') &&
        val[13] === ':' &&
        val[16] === ':'
    );
};

// Normalize common datetime strings to `YYYY-MM-DD HH:mm:ss` for display/editing.
// Handles RFC3339 and Go-style datetime text like `2024-05-13 08:32:47 +0800 CST`.
// Also keep invalid datetime values like `0000-00-00 00:00:00` unchanged.
export const normalizeDateTimeString = (val: string) => {
    if (!looksLikeDateTimeText(val)) {
        return val;
    }

    const cached = normalizedDateTimeCache.get(val);
    if (cached !== undefined) {
        return cached;
    }

    // Keep invalid datetime values unchanged instead of trying to coerce them.
    if (/^0{4}-0{2}-0{2}/.test(val)) {
        return val;
    }

    const match = val.match(
        /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:\s*(?:Z|[+-]\d{2}:?\d{2})(?:\s+[A-Za-z_\/+-]+)?)?$/
    );
    const normalized = match ? `${match[1]} ${match[2]}` : val;
    trimSimpleCache(normalizedDateTimeCache, DATE_TIME_CACHE_LIMIT);
    normalizedDateTimeCache.set(val, normalized);
    return normalized;
};

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return Object.prototype.toString.call(value) === '[object Object]';
};

export const looksLikeJsonText = (text: string): boolean => {
    const raw = (text || '').trim();
    if (!raw) return false;
    const first = raw[0];
    const last = raw[raw.length - 1];
    return (first === '{' && last === '}') || (first === '[' && last === ']');
};

export const formatCellDisplayText = (val: unknown): string => {
    try {
        if (val === null) return 'NULL';
        if (typeof val === 'object') {
            if (!Array.isArray(val) && !isPlainObject(val)) {
                return String(val);
            }
            const cached = objectCellPreviewCache.get(val);
            if (cached !== undefined) {
                return cached;
            }
            const topLevelSize = Array.isArray(val) ? val.length : Object.keys(val || {}).length;
            if (topLevelSize > 80) {
                const summary = Array.isArray(val) ? `[Array(${topLevelSize})]` : `{Object(${topLevelSize})}`;
                objectCellPreviewCache.set(val, summary);
                return summary;
            }
            try {
                const nextText = JSON.stringify(val);
                const previewText = nextText.length > TABLE_CELL_PREVIEW_MAX_CHARS ? `${nextText.slice(0, TABLE_CELL_PREVIEW_MAX_CHARS)}…` : nextText;
                objectCellPreviewCache.set(val, previewText);
                return previewText;
            } catch {
                return '[Object]';
            }
        }
        if (typeof val === 'string') {
            const normalized = normalizeDateTimeString(val);
            return normalized.length > TABLE_CELL_PREVIEW_MAX_CHARS ? `${normalized.slice(0, TABLE_CELL_PREVIEW_MAX_CHARS)}…` : normalized;
        }
        return String(val);
    } catch (e) {
        console.error('formatCellValue error:', e);
        return '[Error]';
    }
};

export const toEditableText = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    try {
        return JSON.stringify(val, null, 2);
    } catch {
        return String(val);
    }
};

export const toFormText = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return normalizeDateTimeString(val);
    return toEditableText(val);
};

// Used for persistence diffing: NULL and undefined are equivalent, but empty string is distinct.
export const isCellValueEqualForDiff = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    const leftNullish = left === null || left === undefined;
    const rightNullish = right === null || right === undefined;
    if (leftNullish || rightNullish) return leftNullish && rightNullish;
    return toFormText(left) === toFormText(right);
};

// Lightweight render comparison: avoid repeated deep serialization for object values during table renders.
export const isCellValueEqualForRender = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    const leftNullish = left === null || left === undefined;
    const rightNullish = right === null || right === undefined;
    if (leftNullish || rightNullish) return leftNullish && rightNullish;

    const leftType = typeof left;
    const rightType = typeof right;
    if (leftType === 'object' || rightType === 'object') {
        return false;
    }

    if (leftType === 'string' || rightType === 'string') {
        return normalizeDateTimeString(String(left)) === normalizeDateTimeString(String(right));
    }
    return left === right;
};

export const normalizeValueForJsonView = (value: unknown): DataGridJsonValue | undefined => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        const normalizedText = normalizeDateTimeString(value);
        if (!looksLikeJsonText(normalizedText)) return normalizedText;
        try {
            return normalizeValueForJsonView(JSON.parse(normalizedText));
        } catch {
            return normalizedText;
        }
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => normalizeValueForJsonView(item))
            .filter((item): item is DataGridJsonValue => item !== undefined);
    }

    if (isPlainObject(value)) {
        const next: Record<string, DataGridJsonValue | undefined> = {};
        Object.entries(value).forEach(([key, val]) => {
            next[key] = normalizeValueForJsonView(val);
        });
        return next;
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;
    return String(value);
};

export const isJsonViewValueEqual = (left: unknown, right: unknown): boolean => {
    const leftNormalized = normalizeValueForJsonView(left);
    const rightNormalized = normalizeValueForJsonView(right);

    if (leftNormalized === rightNormalized) return true;
    if (leftNormalized === null || rightNormalized === null) return leftNormalized === rightNormalized;
    if (leftNormalized === undefined || rightNormalized === undefined) return leftNormalized === rightNormalized;

    if (typeof leftNormalized !== 'object' && typeof rightNormalized !== 'object') {
        return String(leftNormalized) === String(rightNormalized);
    }

    try {
        return JSON.stringify(leftNormalized) === JSON.stringify(rightNormalized);
    } catch {
        return false;
    }
};

export const coerceJsonEditorValueForStorage = (currentValue: unknown, editedValue: unknown): unknown => {
    if (typeof currentValue === 'string') {
        const raw = currentValue.trim();
        const parsedCurrent = looksLikeJsonText(raw);
        if (parsedCurrent && (isPlainObject(editedValue) || Array.isArray(editedValue))) {
            return JSON.stringify(editedValue);
        }
    }
    return editedValue;
};
