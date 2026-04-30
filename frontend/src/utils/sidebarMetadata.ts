const splitQualifiedName = (qualifiedName: string): { schemaName: string; objectName: string } => {
  const raw = String(qualifiedName || '').trim();
  if (!raw) return { schemaName: '', objectName: '' };
  const idx = raw.lastIndexOf('.');
  if (idx <= 0 || idx >= raw.length - 1) {
    return { schemaName: '', objectName: raw };
  }
  return {
    schemaName: raw.substring(0, idx),
    objectName: raw.substring(idx + 1),
  };
};

const normalizeSidebarConnectionDialect = (type: string, driver: string): string => {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'custom') {
    const normalizedDriver = String(driver || '').trim().toLowerCase();
    if (normalizedDriver === 'postgresql' || normalizedDriver === 'postgres' || normalizedDriver === 'pg') return 'postgres';
    if (normalizedDriver === 'dameng' || normalizedDriver === 'dm' || normalizedDriver === 'dm8') return 'dm';
    if (normalizedDriver.includes('oracle')) return 'oracle';
    return normalizedDriver;
  }
  if (normalizedType === 'dameng') return 'dm';
  return normalizedType;
};

export const normalizeSidebarViewName = (dialect: string, dbName: string, schemaName: string, viewName: string): string => {
  const normalizedDialect = String(dialect || '').trim().toLowerCase();
  const normalizedDbName = String(dbName || '').trim();
  const normalizedSchemaName = String(schemaName || '').trim();
  const normalizedViewName = String(viewName || '').trim();

  if (!normalizedViewName) {
    return '';
  }

  if (normalizedDialect === 'mysql') {
    const parsed = splitQualifiedName(normalizedViewName);
    if (parsed.objectName) {
      return parsed.objectName;
    }
    return normalizedViewName;
  }

  if (!normalizedSchemaName || normalizedViewName.includes('.')) {
    return normalizedViewName;
  }

  return `${normalizedSchemaName}.${normalizedViewName}`;
};

export const resolveSidebarRuntimeDatabase = (
  type: string,
  driver: string,
  savedDatabase: string,
  overrideDatabase?: string,
  clearDatabase: boolean = false,
): string => {
  if (clearDatabase) return '';

  const normalizedSavedDatabase = String(savedDatabase || '').trim();
  const normalizedOverrideDatabase = String(overrideDatabase || '').trim();
  if (!normalizedOverrideDatabase) {
    return normalizedSavedDatabase;
  }

  const dialect = normalizeSidebarConnectionDialect(type, driver);
  if (dialect === 'oracle' || dialect === 'dm') {
    return normalizedSavedDatabase || normalizedOverrideDatabase;
  }

  return normalizedOverrideDatabase;
};
