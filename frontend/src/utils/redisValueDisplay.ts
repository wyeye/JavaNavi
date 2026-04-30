const hasDecodedUnicodeText = (value: string): boolean => {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0xFF) {
      return true;
    }
  }

  return false;
};

const toByteArray = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    bytes[i] = value.charCodeAt(i) & 0xFF;
  }

  return bytes;
};

const decodeUtf8Bytes = (value: string): string => (
  new TextDecoder('utf-8', { fatal: false }).decode(toByteArray(value))
);

const tryDecodeValue = (value: string): { displayValue: string; encoding: string; needsHex: boolean } => {
  if (!value || value.length === 0) {
    return { displayValue: '', encoding: 'UTF-8', needsHex: false };
  }

  if (hasDecodedUnicodeText(value)) {
    return { displayValue: value, encoding: 'UTF-8', needsHex: false };
  }

  let nullCount = 0;
  let printableCount = 0;
  let highByteCount = 0;
  const sampleSize = Math.min(value.length, 200);

  for (let i = 0; i < sampleSize; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) {
      nullCount++;
    } else if (code >= 32 && code < 127) {
      printableCount++;
    } else if (code >= 128) {
      highByteCount++;
    }
  }

  if (nullCount / sampleSize > 0.3) {
    return { displayValue: toHexDisplay(value), encoding: 'HEX', needsHex: true };
  }

  if (highByteCount === 0 && printableCount / sampleSize > 0.7) {
    return { displayValue: value, encoding: 'UTF-8', needsHex: false };
  }

  if (highByteCount > 0) {
    try {
      const decoded = decodeUtf8Bytes(value);
      let validChars = 0;
      let replacementChars = 0;
      let controlChars = 0;

      for (let i = 0; i < Math.min(decoded.length, 200); i++) {
        const code = decoded.charCodeAt(i);
        if (code === 0xFFFD) {
          replacementChars++;
        } else if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
          controlChars++;
        } else if ((code >= 32 && code < 127) || (code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3000 && code <= 0x303F)) {
          validChars++;
        }
      }

      const totalChecked = Math.max(1, Math.min(decoded.length, 200));
      if (replacementChars / totalChecked > 0.1 || controlChars / totalChecked > 0.2) {
        return { displayValue: toHexDisplay(value), encoding: 'HEX', needsHex: true };
      }

      if (validChars / totalChecked > 0.5) {
        return { displayValue: decoded, encoding: 'UTF-8', needsHex: false };
      }
    } catch {
      // ignore decode failure
    }
  }

  return { displayValue: toHexDisplay(value), encoding: 'HEX', needsHex: true };
};

const findNextNonWhitespace = (value: string, startIndex: number): string => {
  for (let i = startIndex; i < value.length; i++) {
    if (!/\s/.test(value[i])) {
      return value[i];
    }
  }
  return '';
};

const readJsonStringToken = (value: string, startIndex: number): { token: string; nextIndex: number } => {
  let index = startIndex + 1;
  let escaped = false;
  while (index < value.length) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      index++;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      index++;
      continue;
    }
    if (char === '"') {
      return { token: value.slice(startIndex, index + 1), nextIndex: index + 1 };
    }
    index++;
  }
  return { token: value.slice(startIndex), nextIndex: value.length };
};

const readJsonPrimitiveToken = (value: string, startIndex: number): { token: string; nextIndex: number } => {
  let index = startIndex;
  while (index < value.length && !/[\s,\]}]/.test(value[index])) {
    index++;
  }
  return { token: value.slice(startIndex, index), nextIndex: index };
};

const formatJsonStringToken = (token: string): string => {
  try {
    return JSON.stringify(JSON.parse(token));
  } catch {
    return token;
  }
};

const formatJsonPreservingNumberLiterals = (value: string): string | null => {
  try {
    JSON.parse(value);
  } catch {
    return null;
  }

  const indentUnit = '  ';
  const indent = (depth: number) => indentUnit.repeat(Math.max(0, depth));
  let result = '';
  let depth = 0;
  let index = 0;
  let lastToken: 'open' | 'value' | 'close' | 'comma' | 'colon' | '' = '';

  while (index < value.length) {
    const char = value[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === '"') {
      const { token, nextIndex } = readJsonStringToken(value, index);
      result += formatJsonStringToken(token);
      lastToken = 'value';
      index = nextIndex;
      continue;
    }

    if (char === '{' || char === '[') {
      const closeChar = char === '{' ? '}' : ']';
      result += char;
      depth++;
      lastToken = 'open';
      if (findNextNonWhitespace(value, index + 1) !== closeChar) {
        result += `\n${indent(depth)}`;
      }
      index++;
      continue;
    }

    if (char === '}' || char === ']') {
      depth--;
      if (lastToken !== 'open') {
        result += `\n${indent(depth)}`;
      }
      result += char;
      lastToken = 'close';
      index++;
      continue;
    }

    if (char === ',') {
      result += `,\n${indent(depth)}`;
      lastToken = 'comma';
      index++;
      continue;
    }

    if (char === ':') {
      result += ': ';
      lastToken = 'colon';
      index++;
      continue;
    }

    const { token, nextIndex } = readJsonPrimitiveToken(value, index);
    result += token;
    lastToken = 'value';
    index = nextIndex;
  }

  return result;
};

const tryFormatJson = (value: string): { isJson: boolean; formatted: string } => {
  const formatted = formatJsonPreservingNumberLiterals(value);
  if (formatted !== null) {
    return { isJson: true, formatted };
  }
  return { isJson: false, formatted: value };
};

export const toHexDisplay = (value: string): string => {
  const bytes: string[] = [];
  const ascii: string[] = [];
  let result = '';

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bytes.push(code.toString(16).padStart(2, '0').toUpperCase());
    ascii.push(code >= 32 && code < 127 ? value[i] : '.');

    if (bytes.length === 16 || i === value.length - 1) {
      const offset = (Math.floor(i / 16) * 16).toString(16).padStart(8, '0').toUpperCase();
      const hexPart = bytes.join(' ').padEnd(47, ' ');
      const asciiPart = ascii.join('');
      result += `${offset}  ${hexPart}  |${asciiPart}|\n`;
      bytes.length = 0;
      ascii.length = 0;
    }
  }

  return result;
};

export const decodeRedisUtf8Value = (value: string): string => {
  if (!value || value.length === 0) {
    return '';
  }

  if (hasDecodedUnicodeText(value)) {
    return value;
  }

  try {
    for (let i = 0; i < value.length; i++) {
      if (value.charCodeAt(i) > 0x7F) {
        return decodeUtf8Bytes(value);
      }
    }

    return value;
  } catch {
    return value;
  }
};

export const formatRedisStringValue = (value: string): { displayValue: string; isBinary: boolean; isJson: boolean; encoding: string } => {
  const { displayValue, encoding, needsHex } = tryDecodeValue(value);
  if (needsHex) {
    return { displayValue, isBinary: true, isJson: false, encoding };
  }

  const { isJson, formatted } = tryFormatJson(displayValue);
  return { displayValue: formatted, isBinary: false, isJson, encoding };
};
