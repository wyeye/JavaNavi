import type { AIProviderConfig, AIProviderType } from '../types';

type ProviderEditorStatus = 'idle' | 'success' | 'error';

type ProviderEditorConfig = Partial<AIProviderConfig> & Pick<AIProviderConfig, 'id' | 'type' | 'name' | 'apiKey'> & { presetKey?: string };

export interface ProviderEditorSession {
  editingProvider: ProviderEditorConfig | null;
  formValues: Record<string, unknown> | null;
  isEditing: boolean;
  clearProviderSecret: boolean;
  testStatus: ProviderEditorStatus;
}

interface BuildAddProviderEditorSessionInput {
  previousClearProviderSecret?: boolean;
  presetKey?: string;
  presetBackendType: AIProviderType;
  presetBaseUrl: string;
  presetModel: string;
  presetModels?: string[];
  apiFormat?: string;
}

interface BuildEditProviderEditorSessionInput {
  previousClearProviderSecret?: boolean;
  provider: ProviderEditorConfig;
  formValues?: Record<string, unknown>;
}

interface BuildClosedProviderEditorSessionInput {
  previousClearProviderSecret?: boolean;
}

export const buildAddProviderEditorSession = ({
  presetKey = 'openai',
  presetBackendType,
  presetBaseUrl,
  presetModel,
  presetModels = [],
  apiFormat = 'openai',
}: BuildAddProviderEditorSessionInput): ProviderEditorSession => {
  const editingProvider: ProviderEditorConfig = {
    id: '',
    type: presetBackendType,
    name: '',
    apiKey: '',
    baseUrl: presetBaseUrl,
    model: presetModel,
    models: [...presetModels],
    maxTokens: 4096,
    temperature: 0.7,
    presetKey,
  };

  return {
    editingProvider,
    formValues: {
      ...editingProvider,
      presetKey,
      apiFormat,
    },
    isEditing: true,
    clearProviderSecret: false,
    testStatus: 'idle',
  };
};

export const buildEditProviderEditorSession = ({
  provider,
  formValues,
}: BuildEditProviderEditorSessionInput): ProviderEditorSession => ({
  editingProvider: provider,
  formValues: formValues || {
    ...provider,
    models: provider.models || [],
    presetKey: provider.presetKey,
    apiFormat: provider.apiFormat || 'openai',
  },
  isEditing: true,
  clearProviderSecret: false,
  testStatus: 'idle',
});

export const buildClosedProviderEditorSession = (_input?: BuildClosedProviderEditorSessionInput): ProviderEditorSession => ({
  editingProvider: null,
  formValues: null,
  isEditing: false,
  clearProviderSecret: false,
  testStatus: 'idle',
});

