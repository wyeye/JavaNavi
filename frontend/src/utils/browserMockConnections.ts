export const cloneBrowserMockValue = <T,>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

export const resolveBrowserMockSecretFlag = (nextValue: unknown, clearFlag: boolean, existingFlag?: boolean) => {
  if (String(nextValue ?? '') !== '') return true;
  if (clearFlag) return false;
  return !!existingFlag;
};

export const buildBrowserMockDuplicateName = (rawName: string, items: any[]): string => {
  const baseName = String(rawName || '').trim() || '连接';
  const suffix = ' - 副本';
  const usedNames = new Set(items.map((item) => String(item?.name || '').trim()));
  let candidate = `${baseName}${suffix}`;
  let counter = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}${suffix} ${counter}`;
    counter += 1;
  }
  return candidate;
};

interface DuplicateBrowserMockConnectionInput {
  existing: any;
  items: any[];
  nextId: string;
}

export const duplicateBrowserMockConnection = ({ existing, items, nextId }: DuplicateBrowserMockConnectionInput) => {
  const duplicated = cloneBrowserMockValue({
    ...existing,
    id: nextId,
    name: buildBrowserMockDuplicateName(existing?.name, items),
    config: {
      ...cloneBrowserMockValue(existing?.config),
      id: nextId,
    },
    includeDatabases: Array.isArray(existing?.includeDatabases) ? [...existing.includeDatabases] : undefined,
    includeRedisDatabases: Array.isArray(existing?.includeRedisDatabases) ? [...existing.includeRedisDatabases] : undefined,
  });
  return duplicated;
};
