import * as AIService from '@compat/aiService';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Button, Input, Select, Form, Checkbox, message as antdMessage, Tooltip, Space, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, ApiOutlined, SafetyCertificateOutlined, RobotOutlined, ThunderboltOutlined, CloudOutlined, ExperimentOutlined, KeyOutlined, LinkOutlined, AppstoreOutlined, ToolOutlined } from '@ant-design/icons';
import type { AIProviderConfig, AIProviderType, AISafetyLevel, AIContextLevel } from '../types';
import {
    QWEN_BAILIAN_ANTHROPIC_BASE_URL,
    QWEN_CODING_PLAN_ANTHROPIC_BASE_URL,
    QWEN_CODING_PLAN_MODELS,
    resolveProviderPresetKey,
    resolvePresetBaseURL,
    resolvePresetModelSelection,
    resolvePresetTransport,
    supportsProviderTransport,
} from '../utils/aiProviderPresets';
import {
    PROVIDER_PRESET_CARD_BASE_STYLE,
    PROVIDER_PRESET_CARD_CONTENT_STYLE,
    PROVIDER_PRESET_CARD_DESCRIPTION_STYLE,
    PROVIDER_PRESET_GRID_STYLE,
    PROVIDER_PRESET_CARD_TITLE_STYLE,
} from '../utils/aiSettingsPresetLayout';
import { resolveProviderSecretDraft } from '../utils/providerSecretDraft';
import { buildAddProviderEditorSession, buildClosedProviderEditorSession, buildEditProviderEditorSession, type ProviderEditorSession } from '../utils/aiProviderEditorState';
import { useStore } from '../store';
import { translate, type I18nKey, type I18nParams } from '../i18n';

import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';

interface AISettingsModalProps {
    open: boolean;
    onClose: () => void;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    focusProviderId?: string;
}

type AIProviderEditorConfig = AIProviderConfig & { presetKey?: string };

// 预设配置：每个预设映射到后端 type（openai/anthropic/gemini/custom）并附带默认 URL 和 Model
interface ProviderPreset {
    key: string;
    labelKey: I18nKey;
    icon: React.ReactNode;
    descKey: I18nKey;
    color: string;
    backendType: AIProviderType;
    fixedApiFormat?: string;
    defaultBaseUrl: string;
    defaultModel: string;
    models: string[];
}

const PROVIDER_PRESETS: ProviderPreset[] = [
    { key: 'openai', labelKey: 'ai.settings.provider.openai.label', icon: <ApiOutlined />, descKey: 'ai.settings.provider.openai.desc', color: '#10b981', backendType: 'openai', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', models: [] },
    { key: 'deepseek', labelKey: 'ai.settings.provider.deepseek.label', icon: <ThunderboltOutlined />, descKey: 'ai.settings.provider.deepseek.desc', color: '#3b82f6', backendType: 'openai', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', models: [] },
    { key: 'qwen-bailian', labelKey: 'ai.settings.provider.qwenBailian.label', icon: <CloudOutlined />, descKey: 'ai.settings.provider.qwenBailian.desc', color: '#6366f1', backendType: 'anthropic', defaultBaseUrl: QWEN_BAILIAN_ANTHROPIC_BASE_URL, defaultModel: '', models: [] },
    { key: 'qwen-coding-plan', labelKey: 'ai.settings.provider.qwenCoding.label', icon: <CloudOutlined />, descKey: 'ai.settings.provider.qwenCoding.desc', color: '#4f46e5', backendType: 'custom', fixedApiFormat: 'claude-cli', defaultBaseUrl: QWEN_CODING_PLAN_ANTHROPIC_BASE_URL, defaultModel: '', models: QWEN_CODING_PLAN_MODELS },
    { key: 'zhipu', labelKey: 'ai.settings.provider.zhipu.label', icon: <ExperimentOutlined />, descKey: 'ai.settings.provider.zhipu.desc', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4', models: [] },
    { key: 'moonshot', labelKey: 'ai.settings.provider.moonshot.label', icon: <ExperimentOutlined />, descKey: 'ai.settings.provider.moonshot.desc', color: '#0d9488', backendType: 'anthropic', defaultBaseUrl: 'https://api.moonshot.cn/anthropic', defaultModel: 'moonshot-v1-8k', models: [] },
    { key: 'anthropic', labelKey: 'ai.settings.provider.anthropic.label', icon: <ExperimentOutlined />, descKey: 'ai.settings.provider.anthropic.desc', color: '#d97706', backendType: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-5-sonnet-20241022', models: [] },
    { key: 'gemini', labelKey: 'ai.settings.provider.gemini.label', icon: <CloudOutlined />, descKey: 'ai.settings.provider.gemini.desc', color: '#059669', backendType: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash', models: [] },
    { key: 'volcengine-ark', labelKey: 'ai.settings.provider.volcengineArk.label', icon: <CloudOutlined />, descKey: 'ai.settings.provider.volcengineArk.desc', color: '#0ea5e9', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: '', models: [] },
    { key: 'volcengine-coding', labelKey: 'ai.settings.provider.volcengineCoding.label', icon: <CloudOutlined />, descKey: 'ai.settings.provider.volcengineCoding.desc', color: '#0284c7', backendType: 'openai', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', defaultModel: '', models: [] },
    { key: 'minimax', labelKey: 'ai.settings.provider.minimax.label', icon: <ExperimentOutlined />, descKey: 'ai.settings.provider.minimax.desc', color: '#e11d48', backendType: 'anthropic', defaultBaseUrl: 'https://api.minimaxi.com/anthropic', defaultModel: 'MiniMax-M2.7', models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed', 'MiniMax-M2'] },
    { key: 'ollama', labelKey: 'ai.settings.provider.ollama.label', icon: <AppstoreOutlined />, descKey: 'ai.settings.provider.ollama.desc', color: '#78716c', backendType: 'openai', defaultBaseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3', models: [] },
    { key: 'custom', labelKey: 'ai.settings.provider.custom.label', icon: <AppstoreOutlined />, descKey: 'ai.settings.provider.custom.desc', color: '#64748b', backendType: 'custom', defaultBaseUrl: '', defaultModel: '', models: [] },
];

const findPreset = (key: string): ProviderPreset => PROVIDER_PRESETS.find(p => p.key === key) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];

const normalizeModelOptions = (models: unknown): string[] => {
    if (!Array.isArray(models)) return [];
    return Array.from(new Set(models.map(model => String(model || '').trim()).filter(Boolean)));
};

const messageFromError = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
};

const isFormValidationError = (error: unknown): boolean => (
    typeof error === 'object' && error !== null && 'errorFields' in error
);

const modelOptionsFromTestResponse = (response: Record<string, unknown> | undefined): string[] => {
    const topLevelModels = normalizeModelOptions(response?.models);
    const transport = response?.transport;
    const transportModels = typeof transport === 'object' && transport !== null && 'models' in transport
        ? (transport as { models?: unknown }).models
        : undefined;
    return topLevelModels.length > 0 ? topLevelModels : normalizeModelOptions(transportModels);
};

const matchProviderPreset = (provider: Pick<AIProviderConfig, 'type' | 'baseUrl' | 'apiFormat'>): ProviderPreset => {
    const presetKey = resolveProviderPresetKey(provider, PROVIDER_PRESETS, 'custom');
    return findPreset(presetKey);
};

const SAFETY_OPTIONS: { labelKey: I18nKey; value: AISafetyLevel; descKey: I18nKey; color: string; icon: string }[] = [
    { labelKey: 'ai.settings.safety.readonly.label', value: 'readonly', descKey: 'ai.settings.safety.readonly.desc', color: '#22c55e', icon: '🔒' },
    { labelKey: 'ai.settings.safety.readwrite.label', value: 'readwrite', descKey: 'ai.settings.safety.readwrite.desc', color: '#f59e0b', icon: '⚠️' },
    { labelKey: 'ai.settings.safety.full.label', value: 'full', descKey: 'ai.settings.safety.full.desc', color: '#ef4444', icon: '🔓' },
];

const CONTEXT_OPTIONS: { labelKey: I18nKey; value: AIContextLevel; descKey: I18nKey; icon: string }[] = [
    { labelKey: 'ai.settings.context.none.label', value: 'none', descKey: 'ai.settings.context.none.desc', icon: '🪶' },
    { labelKey: 'ai.settings.context.schemaOnly.label', value: 'schema_only', descKey: 'ai.settings.context.schemaOnly.desc', icon: '📋' },
    { labelKey: 'ai.settings.context.full.label', value: 'full', descKey: 'ai.settings.context.full.desc', icon: '🧠' },
];

const AISettingsModal: React.FC<AISettingsModalProps> = ({ open, onClose, darkMode, overlayTheme, focusProviderId }) => {
    const [providers, setProviders] = useState<AIProviderConfig[]>([]);
    const [activeProviderId, setActiveProviderId] = useState<string>('');
    const [safetyLevel, setSafetyLevel] = useState<AISafetyLevel>('readonly');
    const [contextLevel, setContextLevel] = useState<AIContextLevel>('schema_only');
    const [editingProvider, setEditingProvider] = useState<AIProviderEditorConfig | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [builtinPrompts, setBuiltinPrompts] = useState<Record<string, string>>({});
    const [activeSection, setActiveSection] = useState<'providers' | 'safety' | 'context' | 'prompts' | 'tools'>('providers');
    const [clearProviderSecret, setClearProviderSecret] = useState(false);
    const [form] = Form.useForm();
    const modalBodyRef = useRef<HTMLDivElement>(null);

    // Modal 内部 toast 通知
    const [messageApi, messageContextHolder] = antdMessage.useMessage({ getContainer: () => modalBodyRef.current || document.body });
    const language = useStore(state => state.language);
    const t = useCallback((key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
    const providerLabel = useCallback((preset: ProviderPreset) => t(preset.labelKey), [t]);

    // 主题色
    const cardBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
    const cardBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const sectionLabelColor = darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
    const inputBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';

    // Hook 必须在组件顶层调用，不能在条件分支内
    const watchedType = Form.useWatch('type', form);
    const watchedPresetKey = Form.useWatch('presetKey', form);
    const watchedApiFormat = Form.useWatch('apiFormat', form) || 'openai';
    const watchedApiKeyInput = Form.useWatch('apiKey', form);
    const watchedModels = normalizeModelOptions(Form.useWatch('models', form));
    const canFetchModels = supportsProviderTransport({
        type: watchedType,
        apiFormat: watchedApiFormat,
    });
    const modelFetchHelpText = canFetchModels
        ? t('ai.settings.models.help.fetch')
        : t('ai.settings.models.help.manual');

    const loadConfig = useCallback(async () => {
        try {
            const Service = AIService;
            if (!Service) { console.warn('[AI] AI service compatibility layer unavailable'); return; }
            const [provRes, safeRes, ctxRes, promptsRes] = await Promise.all([
                Service.AIGetProviders?.() || [],
                Service.AIGetSafetyLevel?.() || 'readonly',
                Service.AIGetContextLevel?.() || 'schema_only',
                Service.AIGetBuiltinPrompts?.() || {},
            ]);
            if (Array.isArray(provRes)) {
                setProviders(provRes);
                const activeRes = await Service.AIGetActiveProvider?.();
                if (activeRes) setActiveProviderId(activeRes);
            }
            if (safeRes) setSafetyLevel(safeRes);
            if (ctxRes) setContextLevel(ctxRes);
            if (promptsRes) setBuiltinPrompts(promptsRes);
        } catch (e) { console.warn('Failed to load AI config', e); }
    }, [language]);

    useEffect(() => { if (open) void loadConfig(); }, [open, loadConfig]);

    useEffect(() => {
        if (!open || !focusProviderId) {
            return;
        }
        if (!providers.some((provider) => provider.id === focusProviderId)) {
            return;
        }
        setActiveSection('providers');
        setActiveProviderId(focusProviderId);
    }, [focusProviderId, open, providers]);

    const applyProviderEditorSession = useCallback((session: ProviderEditorSession) => {
        setEditingProvider(session.editingProvider as AIProviderEditorConfig | null);
        setIsEditing(session.isEditing);
        setTestStatus(session.testStatus);
        setClearProviderSecret(session.clearProviderSecret);
        form.resetFields();
        if (session.formValues) {
            form.setFieldsValue(session.formValues);
        }
    }, [form]);

    const resetProviderEditorSession = useCallback(() => {
        applyProviderEditorSession(buildClosedProviderEditorSession());
    }, [applyProviderEditorSession]);

    const handleModalClose = useCallback(() => {
        resetProviderEditorSession();
        onClose();
    }, [onClose, resetProviderEditorSession]);

    useEffect(() => {
        if (!open) {
            resetProviderEditorSession();
        }
    }, [open, resetProviderEditorSession]);

    useEffect(() => {
        if (String(watchedApiKeyInput || '').trim() !== '' && clearProviderSecret) {
            setClearProviderSecret(false);
        }
    }, [watchedApiKeyInput, clearProviderSecret]);

    const handleAddProvider = () => {
        const preset = findPreset('custom');
        applyProviderEditorSession(buildAddProviderEditorSession({
            presetKey: 'custom',
            presetBackendType: preset.backendType,
            presetBaseUrl: preset.defaultBaseUrl,
            presetModel: preset.defaultModel,
            presetModels: preset.models,
            apiFormat: 'openai',
        }));
    };

    const handleEditProvider = (p: AIProviderConfig) => {
        // 尝试根据 baseUrl 和 type 推断 preset
        const matchedPreset = matchProviderPreset(p);
        const resolvedTransport = resolvePresetTransport({
            presetBackendType: matchedPreset.backendType,
            presetFixedApiFormat: matchedPreset.fixedApiFormat,
            valuesApiFormat: p.apiFormat,
        });
        applyProviderEditorSession(buildEditProviderEditorSession({
            provider: { ...p, presetKey: matchedPreset.key },
            formValues: {
                ...p,
                type: resolvedTransport.type,
                models: p.models || [],
                presetKey: matchedPreset.key,
                apiFormat: resolvedTransport.apiFormat || p.apiFormat || 'openai',
            },
        }));
    };

    const handleDeleteProvider = async (id: string) => {
        try {
            const Service = AIService;
            const wasActive = id === activeProviderId;
            await Service?.AIDeleteProvider?.(id);
            await loadConfig();
            // 合并提示：删除的是当前激活的供应商时，附带自动切换信息
            if (wasActive) {
                const newProviders = await Service?.AIGetProviders?.() || [];
                if (newProviders.length > 0) {
                    const newActiveName = newProviders[0]?.name || t('ai.settings.provider.nextProvider');
                    void messageApi.success(t('ai.settings.message.deletedAndSwitched', { name: newActiveName }));
                } else {
                    void messageApi.success(t('ai.settings.message.deleted'));
                }
            } else {
                void messageApi.success(t('ai.settings.message.deleted'));
            }
            window.dispatchEvent(new CustomEvent('javanavi:ai:provider-changed'));
        } catch (e) { void messageApi.error(messageFromError(e, t('ai.settings.message.deleteFailed'))); }
    };

    const handleSaveProvider = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            const Service = AIService;
            
            // 构建 payload，处理 model/models 逻辑
            const preset = findPreset(values.presetKey);
            const isCustomLike = values.presetKey === 'custom' || values.presetKey === 'ollama';
            const { model: finalModel, models: resolvedModels } = resolvePresetModelSelection({
                presetKey: values.presetKey,
                presetDefaultModel: preset.defaultModel,
                presetModels: preset.models,
                valuesModel: values.model,
                customModels: values.models,
            });
            if (!finalModel) {
                throw new Error(t('ai.settings.validation.modelRequired'));
            }
            // 内置供应商自动使用 preset label 作为名称
            const finalName = isCustomLike ? (values.name || providerLabel(preset)) : providerLabel(preset);
            
            const finalBaseUrl = resolvePresetBaseURL({
                presetKey: values.presetKey,
                presetDefaultBaseUrl: preset.defaultBaseUrl,
                valuesBaseUrl: values.baseUrl,
            });
            const resolvedTransport = resolvePresetTransport({
                presetBackendType: preset.backendType,
                presetFixedApiFormat: preset.fixedApiFormat,
                valuesApiFormat: values.apiFormat,
            });
            const transportEnabled = supportsProviderTransport(resolvedTransport);
            const hasReplacementApiKey = String(values.apiKey || '').trim() !== '';
            const secretDraft = resolveProviderSecretDraft({
                hasSecret: editingProvider?.hasSecret,
                apiKeyInput: values.apiKey,
                clearSecret: clearProviderSecret && !hasReplacementApiKey,
            });
            const payload = { 
                ...editingProvider, 
                ...values, 
                ...resolvedTransport,
                name: finalName,
                apiKey: secretDraft.apiKey,
                clearApiKey: secretDraft.mode === 'clear',
                hasSecret: secretDraft.hasSecret,
                model: finalModel,
                models: resolvedModels,
                baseUrl: finalBaseUrl,
                apiFormat: resolvedTransport.apiFormat,
                transportEnabled,
            };
            // 后端 AISaveProvider 统一处理新增和更新，返回 void，失败抛异常
            await Service?.AISaveProvider?.(payload);
            void messageApi.success(t('ai.settings.message.saved')); resetProviderEditorSession(); void loadConfig();
            window.dispatchEvent(new CustomEvent('javanavi:ai:provider-changed'));
        } catch (e) {
            if (isFormValidationError(e)) { /* antd form validation error, ignore */ }
            else void messageApi.error(messageFromError(e, t('ai.settings.message.saveFailed')));
        } finally { setLoading(false); }
    };

    const handleSetActive = async (id: string) => {
        try {
            const Service = AIService;
            await Service?.AISetActiveProvider?.(id);
            setActiveProviderId(id); void messageApi.success(t('ai.settings.message.switched'));
            window.dispatchEvent(new CustomEvent('javanavi:ai:provider-changed'));
        } catch (e) { void messageApi.error(messageFromError(e, t('ai.settings.message.switchFailed'))); }
    };

    const handleSafetyChange = async (level: AISafetyLevel) => {
        try {
            const Service = AIService;
            await Service?.AISetSafetyLevel?.(level);
            setSafetyLevel(level);
        } catch (e) { /* ignore */ }
    };

    const handleContextChange = async (level: AIContextLevel) => {
        try {
            const Service = AIService;
            await Service?.AISetContextLevel?.(level);
            setContextLevel(level);
            window.dispatchEvent(new CustomEvent('javanavi:ai:context-level-changed', { detail: { level } }));
        } catch (e) { /* ignore */ }
    };

    const handleTestProvider = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);
            setTestStatus('idle');
            const Service = AIService;
            const preset = findPreset(values.presetKey || 'openai');
            const finalBaseUrl = resolvePresetBaseURL({
                presetKey: values.presetKey || 'openai',
                presetDefaultBaseUrl: preset.defaultBaseUrl,
                valuesBaseUrl: values.baseUrl,
            });
            const { model: selectedModel, models: resolvedModels } = resolvePresetModelSelection({
                presetKey: values.presetKey || 'openai',
                presetDefaultModel: preset.defaultModel,
                presetModels: preset.models,
                valuesModel: values.model,
                customModels: values.models,
            });
            const resolvedTransport = resolvePresetTransport({
                presetBackendType: preset.backendType,
                presetFixedApiFormat: preset.fixedApiFormat,
                valuesApiFormat: values.apiFormat,
            });
            const transportEnabled = supportsProviderTransport(resolvedTransport);
            if (!transportEnabled) {
                setTestStatus('idle');
                void messageApi.info(t('ai.settings.message.modelFetchUnsupported'));
                return;
            }
            const secretDraft = resolveProviderSecretDraft({
                hasSecret: editingProvider?.hasSecret,
                apiKeyInput: values.apiKey,
                clearSecret: clearProviderSecret,
            });
            if (secretDraft.mode === 'clear') {
                throw new Error(t('ai.settings.validation.apiKeyRequiredBeforeTest'));
            }
            const res = await Service?.AITestProvider?.({
                ...editingProvider,
                ...values,
                ...resolvedTransport,
                apiKey: secretDraft.apiKey,
                hasSecret: secretDraft.hasSecret,
                baseUrl: finalBaseUrl,
                model: selectedModel,
                models: resolvedModels,
                maxTokens: Number(values.maxTokens) || 4096,
                temperature: Number(values.temperature) ?? 0.7,
                apiFormat: resolvedTransport.apiFormat,
                transportEnabled,
            });
            if (res?.success) {
                const fetchedModels = modelOptionsFromTestResponse(res);
                if (fetchedModels.length > 0) {
                    const nextModel = fetchedModels.includes(selectedModel) ? selectedModel : fetchedModels[0];
                    form.setFieldsValue({ models: fetchedModels, model: nextModel });
                    setTestStatus('success');
                    void messageApi.success(t('ai.settings.message.modelsFetched', { count: fetchedModels.length }));
                } else {
                    setTestStatus('success');
                    void messageApi.success(t('ai.settings.message.connectionOkNoModels'));
                }
            }
            else { setTestStatus('error'); void messageApi.error(t('ai.settings.message.testFailedWithMessage', { message: res?.message || t('common.unknown') })); }
        } catch (e) { setTestStatus('error'); void messageApi.error(messageFromError(e, t('ai.settings.message.testFailed'))); }
        finally { setLoading(false); }
    };

    const handlePresetChange = (presetKey: string) => {
        const preset = findPreset(presetKey);
        const resolvedTransport = resolvePresetTransport({
            presetBackendType: preset.backendType,
            presetFixedApiFormat: preset.fixedApiFormat,
            valuesApiFormat: form.getFieldValue('apiFormat'),
        });
        form.setFieldsValue({
            presetKey,
            type: resolvedTransport.type,
            apiFormat: resolvedTransport.apiFormat || 'openai',
            baseUrl: preset.defaultBaseUrl,
            model: preset.defaultModel,
            models: preset.models,
        });
    };

    // ---- 字段装饰器样式 ----
    const fieldGroupStyle: React.CSSProperties = {
        padding: '14px 16px', borderRadius: 12, border: `1px solid ${cardBorder}`,
        background: cardBg, marginBottom: 12,
    };
    const fieldLabelStyle: React.CSSProperties = {
        fontSize: 13, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em',
        color: sectionLabelColor, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
    };

    // ===== Provider 列表 =====
    const renderProviderList = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {providers.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '36px 20px', color: overlayTheme.mutedText, fontSize: 14,
                    border: `1px dashed ${cardBorder}`, borderRadius: 14, background: cardBg,
                }}>
                    <RobotOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.3, display: 'block' }} />
                    {t('ai.settings.providers.emptyTitle')}<br />
                    <span style={{ fontSize: 13, opacity: 0.6 }}>{t('ai.settings.providers.emptyHint')}</span>
                </div>
            )}
            {providers.map(p => {
                const matchedPreset = matchProviderPreset(p);
                const isActive = p.id === activeProviderId;
                return (
                    <div key={p.id} onClick={() => handleSetActive(p.id)} style={{
                        padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s ease',
                        border: `1.5px solid ${isActive ? overlayTheme.selectedText : cardBorder}`,
                        background: isActive ? overlayTheme.selectedBg : cardBg,
                        display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center',
                            background: isActive ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                            color: isActive ? overlayTheme.iconColor : overlayTheme.mutedText, 
                            fontSize: 18, flexShrink: 0, transition: 'all 0.2s ease',
                        }}>
                            {matchedPreset.icon || <ApiOutlined />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {p.name || p.type}
                                {isActive && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 13 }} />}
                            </div>
                            <div style={{ fontSize: 12, color: overlayTheme.mutedText, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>{providerLabel(matchedPreset)}</span>
                                <span style={{ opacity: 0.4 }}>·</span>
                                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.model || t('ai.settings.providers.noModel')}</span>
                            </div>
                        </div>
                        <Space size={2}>
                            <Tooltip title={t('common.edit')}>
                                <Button type="text" size="small" icon={<EditOutlined />}
                                    onClick={e => { e.stopPropagation(); handleEditProvider(p); }}
                                    style={{ color: overlayTheme.mutedText }} />
                            </Tooltip>
                            <Popconfirm title={t('ai.settings.providers.deleteConfirm')} onConfirm={() => handleDeleteProvider(p.id)}
                                okButtonProps={{ danger: true }} okText={t('common.delete')} cancelText={t('common.cancel')}>
                                <Button type="text" size="small" icon={<DeleteOutlined />} danger
                                    onClick={e => e.stopPropagation()} />
                            </Popconfirm>
                        </Space>
                    </div>
                );
            })}
            <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddProvider}
                style={{ borderRadius: 12, height: 42, borderColor: darkMode ? 'rgba(255,255,255,0.12)' : undefined }}>
                {t('ai.settings.providers.add')}
            </Button>
        </div>
    );

    // ===== Provider 编辑表单 =====
    const renderProviderForm = () => {
        const presetKeyFromForm = watchedPresetKey || editingProvider?.presetKey || 'openai';
        return (
            <div>
                {/* 顶部返回 */}
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Button size="small" onClick={resetProviderEditorSession}
                        style={{ borderRadius: 8 }}>{t('ai.settings.form.back')}</Button>
                    <span style={{ fontWeight: 700, fontSize: 16, color: overlayTheme.titleText }}>
                        {editingProvider?.id ? t('ai.settings.form.editTitle') : t('ai.settings.form.addTitle')}
                    </span>
                </div>

                <Form form={form} layout="vertical" size="small">
                    {/* Provider 类型选择 - 卡片式 */}
                    <div style={fieldGroupStyle}>
                        <div style={fieldLabelStyle}>
                            <AppstoreOutlined style={{ fontSize: 14 }} /> {t('ai.settings.form.serviceType')}
                        </div>
                        <Form.Item name="presetKey" noStyle>
                            <div style={PROVIDER_PRESET_GRID_STYLE}>
                                {PROVIDER_PRESETS.map(pt => (
                                    <div key={pt.key} onClick={() => { form.setFieldValue('presetKey', pt.key); handlePresetChange(pt.key); }}
                                        style={{
                                            ...PROVIDER_PRESET_CARD_BASE_STYLE,
                                            border: `1.5px solid ${presetKeyFromForm === pt.key ? overlayTheme.selectedText : 'transparent'}`,
                                            background: presetKeyFromForm === pt.key ? overlayTheme.selectedBg : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                            boxShadow: presetKeyFromForm === pt.key ? 'none' : (darkMode ? 'inset 0 0 0 1px rgba(255,255,255,0.028)' : 'inset 0 0 0 1px rgba(16,24,40,0.03)'),
                                        }}>
                                        <div style={{
                                            color: presetKeyFromForm === pt.key ? overlayTheme.iconColor : overlayTheme.mutedText,
                                            fontSize: 18, marginTop: 2, transition: 'all 0.2s ease', flexShrink: 0,
                                        }}>
                                            {pt.icon}
                                        </div>
                                        <div style={PROVIDER_PRESET_CARD_CONTENT_STYLE}>
                                            <div style={{ ...PROVIDER_PRESET_CARD_TITLE_STYLE, fontSize: 13, fontWeight: 700, color: overlayTheme.titleText, lineHeight: 1.3 }}>{providerLabel(pt)}</div>
                                            <div style={{ ...PROVIDER_PRESET_CARD_DESCRIPTION_STYLE, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.4 }}>{t(pt.descKey)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Form.Item>
                        <Form.Item name="type" hidden><Input /></Form.Item>
                    </div>

                    {/* 基本信息 - 仅自定义/Ollama 显示 */}
                    {(presetKeyFromForm === 'custom' || presetKeyFromForm === 'ollama') && (
                        <div style={{ ...fieldGroupStyle, marginTop: 16 }}>
                            <div style={fieldLabelStyle}>
                                <RobotOutlined style={{ fontSize: 14 }} /> {t('ai.settings.form.basicInfo')}
                            </div>
                            
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai.settings.form.providerName')}</span>} name="name" style={{ marginBottom: 16 }}>
                                <Input placeholder={t('ai.settings.form.providerNamePlaceholder')}
                                    size="middle"
                                    style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                            </Form.Item>
                            
                            {presetKeyFromForm === 'custom' && (
                                <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai.settings.form.apiFormat')}</span>} name="apiFormat" style={{ marginBottom: 16 }}>
                                    <div style={{ 
                                        display: 'inline-flex', padding: 4, background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)', 
                                        borderRadius: 8, gap: 4 
                                    }}>
                                        {[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'gemini', label: 'Gemini' }, { value: 'claude-cli', label: 'Claude CLI' }].map(fmt => (
                                            <div
                                                key={fmt.value}
                                                onClick={() => form.setFieldsValue({ apiFormat: fmt.value })}
                                                style={{
                                                    padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: watchedApiFormat === fmt.value ? 600 : 500, cursor: 'pointer',
                                                    background: watchedApiFormat === fmt.value ? (darkMode ? '#374151' : '#ffffff') : 'transparent',
                                                    color: watchedApiFormat === fmt.value ? overlayTheme.titleText : overlayTheme.mutedText,
                                                    boxShadow: watchedApiFormat === fmt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {fmt.label}
                                            </div>
                                        ))}
                                    </div>
                                </Form.Item>
                            )}
                            
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai.settings.form.availableModels')}</span>} name="models" style={{ marginBottom: 16 }}>
                                <Select mode="tags" size="middle" placeholder={canFetchModels ? t('ai.settings.form.modelsPlaceholderFetch') : t('ai.settings.form.modelsPlaceholderManual')} style={{ width: '100%' }} />
                            </Form.Item>
                            <div style={{ marginTop: -8, marginBottom: 16, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.5 }}>
                                {modelFetchHelpText}
                            </div>
                        </div>
                    )}
                    {watchedModels.length > 0 ? (
                        <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai.settings.form.selectModel')}</span>} name="model" rules={[{ required: true, message: t('ai.settings.validation.selectModel') }]} style={{ marginBottom: 16 }}>
                            <Select showSearch size="middle" placeholder={t('ai.settings.form.selectModelPlaceholder')} options={watchedModels.map(model => ({ label: model, value: model }))} style={{ width: '100%' }} />
                        </Form.Item>
                    ) : (
                        <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai.settings.form.modelId')}</span>} name="model" rules={[{ required: !canFetchModels, message: t('ai.settings.validation.modelIdRequired') }]} style={{ marginBottom: 16 }}>
                            <Input placeholder={canFetchModels ? t('ai.settings.form.modelIdPlaceholderFetch') : t('ai.settings.form.modelIdPlaceholderManual')} size="middle" style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                        </Form.Item>
                    )}
                    <Form.Item name="name" hidden><Input /></Form.Item>

                    {/* 认证信息 */}
                    <div style={{ ...fieldGroupStyle, marginTop: 16 }}>
                        <div style={fieldLabelStyle}>
                            <KeyOutlined style={{ fontSize: 14 }} /> {t('ai.settings.form.authConnection')}
                        </div>
                        <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai.settings.form.apiKeyLabel')}</span>} name="apiKey" rules={[{ validator: (_, value) => { const apiKey = String(value || '').trim(); if (apiKey || clearProviderSecret || editingProvider?.hasSecret) { return Promise.resolve(); } return Promise.reject(new Error(t('ai.settings.validation.apiKeyRequired'))); } }]} style={{ marginBottom: editingProvider?.hasSecret ? 8 : 16 }}>
                            <Input.Password placeholder={editingProvider?.hasSecret ? t('ai.settings.form.apiKeyPlaceholderStored') : t('ai.settings.form.apiKeyPlaceholderNew')}
                                size="middle"
                                style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                        </Form.Item>
                        {editingProvider?.hasSecret && (
                            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, border: `1px solid ${cardBorder}`, background: cardBg }}>
                                <div style={{ fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6, marginBottom: 8 }}>
                                    {t('ai.settings.form.apiKeyStoredHint')}
                                </div>
                                <Checkbox
                                    checked={clearProviderSecret}
                                    disabled={String(watchedApiKeyInput || '').trim() !== ''}
                                    onChange={(event) => setClearProviderSecret(event.target.checked)}
                                >
                                    {t('ai.settings.form.clearApiKey')}
                                </Checkbox>
                            </div>
                        )}

                        {(presetKeyFromForm === 'custom' || presetKeyFromForm === 'ollama') && (
                            <Form.Item label={<span style={{ fontWeight: 500, color: overlayTheme.titleText }}>{t('ai.settings.form.apiEndpointLabel')}</span>} name="baseUrl" rules={[{ required: true, message: t('ai.settings.validation.endpointRequired') }]} style={{ marginBottom: 0 }}>
                                <Input placeholder={findPreset(presetKeyFromForm).defaultBaseUrl || 'https://...'}
                                    size="middle"
                                    suffix={<LinkOutlined style={{ color: overlayTheme.mutedText }} />}
                                    style={{ borderRadius: 8, background: inputBg, border: `1px solid ${cardBorder}` }} />
                            </Form.Item>
                        )}
                    </div>



                    {/* 操作按钮 */}
                    <div style={{
                        display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, paddingTop: 16,
                        borderTop: `1px solid ${cardBorder}`, paddingBottom: 24,
                    }}>
                        <Button onClick={handleTestProvider} loading={loading} style={{ borderRadius: 10 }}
                            disabled={!canFetchModels}
                            icon={testStatus === 'success' ? <CheckOutlined style={{ color: '#22c55e' }} /> : undefined}>
                            {canFetchModels ? (testStatus === 'success' ? t('ai.settings.action.modelsFetched') : testStatus === 'error' ? t('ai.settings.action.refetchModels') : t('ai.settings.action.fetchModels')) : t('ai.settings.action.manualModelRequired')}
                        </Button>
                        <Button type="primary" onClick={handleSaveProvider} loading={loading}
                            style={{ borderRadius: 10, fontWeight: 600 }}>
                            {t('common.save')}
                        </Button>
                    </div>
                </Form>
            </div>
        );
    };

    // ===== 安全控制 =====
    const renderSafetySettings = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
                {t('ai.settings.safety.description')}
            </div>
            {SAFETY_OPTIONS.map(opt => {
                const active = safetyLevel === opt.value;
                return (
                    <div key={opt.value} onClick={() => handleSafetyChange(opt.value)} style={{
                        padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s ease',
                        border: `1.5px solid ${active ? (opt.color === '#ef4444' ? opt.color : overlayTheme.selectedText) : cardBorder}`,
                        background: active ? (opt.color === '#ef4444' ? `${opt.color}15` : overlayTheme.selectedBg) : cardBg,
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
                            background: active ? (opt.color === '#ef4444' ? `${opt.color}25` : overlayTheme.iconBg) : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                            color: active ? (opt.color === '#ef4444' ? opt.color : overlayTheme.iconColor) : overlayTheme.mutedText,
                            transition: 'all 0.2s ease',
                        }}>
                            {opt.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {t(opt.labelKey)}
                                {active && <CheckOutlined style={{ color: opt.color === '#ef4444' ? opt.color : overlayTheme.iconColor, fontSize: 14 }} />}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{t(opt.descKey)}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    // ===== 上下文级别 =====
    const renderContextSettings = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 8 }}>
                {t('ai.settings.context.description')}
            </div>
            {CONTEXT_OPTIONS.map(opt => {
                const active = contextLevel === opt.value;
                return (
                    <div key={opt.value} onClick={() => handleContextChange(opt.value)} style={{
                        padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s ease',
                        border: `1.5px solid ${active ? overlayTheme.selectedText : cardBorder}`,
                        background: active ? overlayTheme.selectedBg : cardBg,
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0,
                            background: active ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                            color: active ? overlayTheme.iconColor : overlayTheme.mutedText,
                            transition: 'all 0.2s ease',
                        }}>
                            {opt.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {t(opt.labelKey)}
                                {active && <CheckOutlined style={{ color: overlayTheme.iconColor, fontSize: 14 }} />}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 4, lineHeight: '1.5' }}>{t(opt.descKey)}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    const renderBuiltinPrompts = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
                {t('ai.settings.prompts.description')}
            </div>
            {Object.entries(builtinPrompts).map(([title, promptText]) => (
                <div key={title} style={{
                    padding: '12px', borderRadius: 12, border: `1px solid ${cardBorder}`, background: cardBg,
                }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RobotOutlined style={{ color: overlayTheme.iconColor }} /> {title}
                    </div>
                    <div style={{
                        background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                        padding: '10px 12px', borderRadius: 8, fontSize: 13, color: overlayTheme.mutedText,
                        whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.5,
                        userSelect: 'text', border: darkMode ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(0,0,0,0.02)'
                    }}>
                        {promptText}
                    </div>
                </div>
            ))}
        </div>
    );

    const BUILTIN_TOOLS_INFO: Array<{ name: string; icon: string; descKey: I18nKey; detailKey: I18nKey; paramsKey: I18nKey }> = [
        { name: 'get_connections', icon: '🔗', descKey: 'ai.settings.tools.getConnections.desc', detailKey: 'ai.settings.tools.getConnections.detail', paramsKey: 'ai.settings.tools.params.none' },
        { name: 'get_databases', icon: '🗄️', descKey: 'ai.settings.tools.getDatabases.desc', detailKey: 'ai.settings.tools.getDatabases.detail', paramsKey: 'ai.settings.tools.getDatabases.params' },
        { name: 'get_tables', icon: '📋', descKey: 'ai.settings.tools.getTables.desc', detailKey: 'ai.settings.tools.getTables.detail', paramsKey: 'ai.settings.tools.getTables.params' },
        { name: 'get_columns', icon: '🔍', descKey: 'ai.settings.tools.getColumns.desc', detailKey: 'ai.settings.tools.getColumns.detail', paramsKey: 'ai.settings.tools.getColumns.params' },
        { name: 'get_table_ddl', icon: '📝', descKey: 'ai.settings.tools.getTableDdl.desc', detailKey: 'ai.settings.tools.getTableDdl.detail', paramsKey: 'ai.settings.tools.getTableDdl.params' },
        { name: 'execute_sql', icon: '▶️', descKey: 'ai.settings.tools.executeSql.desc', detailKey: 'ai.settings.tools.executeSql.detail', paramsKey: 'ai.settings.tools.executeSql.params' },
    ];

    const renderBuiltinTools = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginBottom: 4 }}>
                {t('ai.settings.tools.description')}
            </div>
            <div style={{ fontSize: 12, color: overlayTheme.mutedText, opacity: 0.7, padding: '8px 12px', borderRadius: 8, background: cardBg, border: `1px solid ${cardBorder}` }}>
                {t('ai.settings.tools.workflow')}
            </div>
            {BUILTIN_TOOLS_INFO.map(tool => (
                <div key={tool.name} style={{
                    padding: '14px 16px', borderRadius: 14, border: `1px solid ${cardBorder}`, background: cardBg,
                    transition: 'all 0.2s ease',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 20 }}>{tool.icon}</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: overlayTheme.titleText, fontFamily: 'monospace' }}>
                                {tool.name}
                            </div>
                            <div style={{ fontSize: 13, color: overlayTheme.mutedText, marginTop: 2 }}>{t(tool.descKey)}</div>
                        </div>
                    </div>
                    <div style={{
                        fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.6, padding: '8px 12px',
                        background: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)', borderRadius: 8,
                    }}>
                        {t(tool.detailKey)}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ToolOutlined style={{ fontSize: 12 }} />
                        <span>{t('ai.settings.tools.paramsLabel')}</span>
                        <code style={{ fontFamily: 'monospace', fontSize: 12, padding: '1px 6px', borderRadius: 4, background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                            {t(tool.paramsKey)}
                        </code>
                    </div>
                </div>
            ))}
        </div>
    );

    const modalShellStyle = {
        background: overlayTheme.shellBg, border: overlayTheme.shellBorder,
        boxShadow: overlayTheme.shellShadow, backdropFilter: overlayTheme.shellBackdropFilter,
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                        width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center',
                        background: overlayTheme.iconBg, color: overlayTheme.iconColor, fontSize: 18, flexShrink: 0,
                    }}>
                        <RobotOutlined />
                    </div>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: overlayTheme.titleText }}>{t('ai.settings.modal.title')}</div>
                        <div style={{ marginTop: 3, color: overlayTheme.mutedText, fontSize: 12 }}>
                            {t('ai.settings.modal.description')}
                        </div>
                    </div>
                </div>
            }
            open={open}
            onCancel={handleModalClose}
            footer={null}
            width={820}
            styles={{
                content: modalShellStyle,
                header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
                body: { paddingTop: 8, height: 620, overflow: 'hidden' },
            }}
        >
              <div ref={modalBodyRef} className="ai-settings-body" style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 16, padding: '12px 0', height: '100%', minHeight: 0, overflow: 'hidden', alignItems: 'stretch', position: 'relative' }}>
                  {messageContextHolder}
                  <div style={{ padding: '0 12px', height: 'fit-content' }}>
                      <div style={{ marginBottom: 12, fontWeight: 600, color: overlayTheme.titleText }}>{t('ai.settings.nav.title')}</div>
                      <div style={{ display: 'grid', gap: 10 }}>
                          {[
                              { key: 'providers', title: t('ai.settings.nav.providers.title'), description: t('ai.settings.nav.providers.description'), icon: <ApiOutlined /> },
                              { key: 'safety', title: t('ai.settings.nav.safety.title'), description: t('ai.settings.nav.safety.description'), icon: <SafetyCertificateOutlined /> },
                              { key: 'context', title: t('ai.settings.nav.context.title'), description: t('ai.settings.nav.context.description'), icon: <RobotOutlined /> },
                              { key: 'tools', title: t('ai.settings.nav.tools.title'), description: t('ai.settings.nav.tools.description'), icon: <ToolOutlined /> },
                              { key: 'prompts', title: t('ai.settings.nav.prompts.title'), description: t('ai.settings.nav.prompts.description'), icon: <ExperimentOutlined /> },
                          ].map((item) => {
                              const active = activeSection === item.key;
                              return (
                                  <button
                                      key={item.key}
                                      type="button"
                                      onClick={() => setActiveSection(item.key as typeof activeSection)}
                                      style={{
                                          textAlign: 'left',
                                          padding: '12px 14px',
                                          borderRadius: 12,
                                          border: `1px solid ${active
                                              ? (darkMode ? 'rgba(255,214,102,0.3)' : 'rgba(24,144,255,0.24)')
                                              : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                                          background: active
                                              ? (darkMode ? 'linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)' : 'linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)')
                                              : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                          color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                                          cursor: 'pointer',
                                      }}
                                  >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                          <span style={{ fontSize: 16 }}>{item.icon}</span>
                                          <span style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</span>
                                      </div>
                                      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : 'rgba(128,128,128,0.7)' }}>
                                          {item.description}
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  </div>
                  <div style={{ minWidth: 0, minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8, paddingBottom: 28 }}>
                      {activeSection === 'providers' && (isEditing ? renderProviderForm() : renderProviderList())}
                      {activeSection === 'safety' && renderSafetySettings()}
                      {activeSection === 'context' && renderContextSettings()}
                      {activeSection === 'tools' && renderBuiltinTools()}
                      {activeSection === 'prompts' && renderBuiltinPrompts()}
                  </div>
              </div>
        </Modal>
    );
};

export default AISettingsModal;
