export type ProviderSecretDraftMode = 'keep' | 'replace' | 'clear';

export interface ProviderSecretDraftInput {
  hasSecret?: boolean;
  apiKeyInput?: string;
  clearSecret?: boolean;
}

export interface ProviderSecretDraftResult {
  mode: ProviderSecretDraftMode;
  apiKey: string;
  hasSecret: boolean;
}

export function resolveProviderSecretDraft(input: ProviderSecretDraftInput): ProviderSecretDraftResult {
  const apiKey = String(input.apiKeyInput || '').trim();

  if (input.clearSecret) {
    return {
      mode: 'clear',
      apiKey: '',
      hasSecret: false,
    };
  }

  if (apiKey) {
    return {
      mode: 'replace',
      apiKey,
      hasSecret: true,
    };
  }

  if (input.hasSecret) {
    return {
      mode: 'keep',
      apiKey: '',
      hasSecret: true,
    };
  }

  return {
    mode: 'clear',
    apiKey: '',
    hasSecret: false,
  };
}
