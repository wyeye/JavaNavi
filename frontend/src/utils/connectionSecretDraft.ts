export interface ConnectionSecretDraftInput {
  valueInput?: string;
  hasSecret?: boolean;
  clearSecret?: boolean;
  forceClear?: boolean;
  trimInput?: boolean;
}

export interface ConnectionSecretDraftResult {
  value: string;
  clearStoredSecret: boolean;
  keepsStoredSecret: boolean;
  hasSecretAfterSave: boolean;
}

export function resolveConnectionSecretDraft(input: ConnectionSecretDraftInput): ConnectionSecretDraftResult {
  const rawValue = input.valueInput ?? '';
  const value = input.trimInput ? String(rawValue).trim() : String(rawValue);

  if (input.forceClear) {
    return {
      value: '',
      clearStoredSecret: true,
      keepsStoredSecret: false,
      hasSecretAfterSave: false,
    };
  }

  if (value !== '') {
    return {
      value,
      clearStoredSecret: false,
      keepsStoredSecret: false,
      hasSecretAfterSave: true,
    };
  }

  if (input.clearSecret) {
    return {
      value: '',
      clearStoredSecret: true,
      keepsStoredSecret: false,
      hasSecretAfterSave: false,
    };
  }

  if (input.hasSecret) {
    return {
      value: '',
      clearStoredSecret: false,
      keepsStoredSecret: true,
      hasSecretAfterSave: true,
    };
  }

  return {
    value: '',
    clearStoredSecret: false,
    keepsStoredSecret: false,
    hasSecretAfterSave: false,
  };
}

