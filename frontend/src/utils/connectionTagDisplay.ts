export const MAX_CONNECTION_TAG_OPTION_TEXT_LENGTH = 52;

const normalizeInlineWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const formatConnectionTagOptionText = (name: unknown, host?: unknown): string => {
  const safeName = normalizeInlineWhitespace(String(name ?? ''));
  const safeHost = normalizeInlineWhitespace(String(host ?? ''));
  const text = safeHost ? `${safeName} (${safeHost})` : safeName;
  if (text.length <= MAX_CONNECTION_TAG_OPTION_TEXT_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_CONNECTION_TAG_OPTION_TEXT_LENGTH - 1)}…`;
};
