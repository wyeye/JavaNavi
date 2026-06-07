import * as AIService from '@compat/aiService';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore, loadAISessionsFromBackend, loadAISessionFromBackend } from '../store';
import { EventsOn, EventsOff } from '@compat/runtime';
import { DBGetDatabases, DBGetTables, type QueryResult } from '@compat/javanaviApp';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import type {
    AIChatMessage,
    AIContextLevel,
    AIToolCall,
    AIProviderConfig,
} from '../types';
import { DownOutlined } from '@ant-design/icons';
import './AIChatPanel.css';

import { AIChatHeader } from './ai/AIChatHeader';
import { AIChatWelcome } from './ai/AIChatWelcome';
import { AIMessageBubble } from './ai/AIMessageBubble';
import { AIChatInput } from './ai/AIChatInput';
import { AIHistoryDrawer } from './ai/AIHistoryDrawer';
import type { AiMessage, AiTool } from '@compat/contracts';
import type { AIComposerNotice } from '../utils/aiComposerNotice';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { buildAIReadonlyPreviewSQL } from '../utils/aiSqlLimit';
import { buildDatabaseContextMessage } from '../utils/aiDatabaseContext';
import { resolveAITableSchemaToolResult } from '../utils/aiTableSchemaTool';
import { consumeAIChatSendShortcutOnKeyDown } from '../utils/aiChatSendShortcut';
import {
    buildMissingModelNotice,
    buildMissingProviderNotice,
    buildModelFetchFailedNotice,
} from '../utils/aiComposerNotice';
import { DEFAULT_LANGUAGE, translate, type AppLanguage, type I18nKey, type I18nParams } from '../i18n';

interface AIChatPanelProps {
    width?: number;
    darkMode: boolean;
    bgColor?: string;
    onClose: () => void;
    onOpenSettings?: () => void;
    onWidthChange?: (width: number) => void;
    overlayTheme: OverlayWorkbenchTheme;
}

const genId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

type UnknownRecord = Record<string, unknown>;
type TableRow = { Table?: unknown; table?: unknown; tableName?: unknown };
type DatabaseRow = { Database?: unknown; database?: unknown };
type ColumnRow = UnknownRecord & {
    Field?: unknown;
    field?: unknown;
    COLUMN_NAME?: unknown;
    column_name?: unknown;
    Name?: unknown;
    name?: unknown;
    Type?: unknown;
    type?: unknown;
    DATA_TYPE?: unknown;
    data_type?: unknown;
    Null?: unknown;
    null?: unknown;
    IS_NULLABLE?: unknown;
    is_nullable?: unknown;
    Nullable?: unknown;
    nullable?: unknown;
    Default?: unknown;
    default?: unknown;
    COLUMN_DEFAULT?: unknown;
    column_default?: unknown;
    DefaultValue?: unknown;
    Comment?: unknown;
    comment?: unknown;
    COLUMN_COMMENT?: unknown;
    column_comment?: unknown;
    Description?: unknown;
};
type LocalToolArgs = {
    connectionId?: string;
    dbName?: string;
    database?: string;
    tableName?: string;
    sql?: string;
};
type StreamBuffer = { thinking: string; content: string };

const toRecord = (value: unknown): UnknownRecord => (
    value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
);

const getCurrentLanguage = (): AppLanguage => useStore.getState().language || DEFAULT_LANGUAGE;

const aiTextForLanguage = (language: AppLanguage | undefined, key: I18nKey, params?: I18nParams): string => (
    translate(language || DEFAULT_LANGUAGE, key, params)
);

const aiText = (key: I18nKey, params?: I18nParams): string => (
    aiTextForLanguage(getCurrentLanguage(), key, params)
);

const buildNudgePattern = (language: AppLanguage): RegExp => {
    const sources = [
        aiTextForLanguage(language, 'ai.chat.nudgePattern'),
        aiTextForLanguage('zh', 'ai.chat.nudgePattern'),
        aiTextForLanguage('en', 'ai.chat.nudgePattern'),
    ].filter((source, index, list) => source && list.indexOf(source) === index);
    try {
        return new RegExp(sources.join('|'));
    } catch {
        return /$a/;
    }
};

const getErrorMessage = (error: unknown, fallback = aiText('ai.chat.unknownError')): string => {
    if (error instanceof Error) return error.message || fallback;
    if (typeof error === 'string') return error || fallback;
    const messageValue = toRecord(error).message;
    if (typeof messageValue === 'string' && messageValue) return messageValue;
    if (error === null || error === undefined) return fallback;
    return String(error) || fallback;
};

const queryArrayData = <T,>(result: QueryResult): T[] => (
    Array.isArray(result.data) ? result.data as T[] : []
);

const firstRecordValue = (row: unknown): unknown => {
    const record = toRecord(row);
    return Object.values(record)[0];
};

const toChatPayload = (message: AIChatMessage): AiMessage => {
    const mapped: AiMessage = { role: message.role, content: message.content, images: message.images };
    if (message.tool_calls) mapped.tool_calls = message.tool_calls;
    if (message.tool_call_id) mapped.tool_call_id = message.tool_call_id;
    return mapped;
};

export const getDynamicMaxContextChars = (modelName?: string) => {
    if (!modelName) return 258000; // Default 258k modern baseline.
    const lower = modelName.toLowerCase();
    
    // Very large context models: conservatively use 2-5M characters.
    if (lower.includes('gemini-1.5-pro') || lower.includes('gemini-2') || lower.includes('gemini-3')) {
        return 5000000;
    }
    // Flagship 1M-token models: about 1,000,000 characters.
    if (lower.includes('glm-5') || lower.includes('claude-4') || lower.includes('claude-3.7') || lower.includes('gpt-5') || lower.includes('qwen3') || lower.includes('deepseek-v4')) {
        return 1000000;
    }
    if (lower.includes('claude-3-opus') || lower.includes('claude-3.5') || lower.includes('glm-4-long') || lower.includes('qwen-long')) {
        return 1000000;
    }
    // Modern mainstream 200K-258K token models: about 258,000 characters.
    if (lower.includes('claude') || lower.includes('deepseek') || lower.includes('gpt-4.5') || lower.includes('qwen2.5')) {
        return 258000;
    }
    // 128K-token models: about 128,000 characters.
    if (lower.includes('gpt-4') || lower.includes('gpt-4o') || lower.includes('glm') || lower.includes('z-ai')) {
        return 128000;
    }
    if (lower.includes('qwen')) {
        return 128000;
    }
    // Default fallback
    return 258000;
};

// Compress history when the configured context character limit is exceeded.
const compressContextIfNeeded = async (sid: string, messagesPayload: AiMessage[], maxLimit: number) => {
    try {
        const chars = messagesPayload.reduce((sum, m) => sum + (m.content?.length || 0) + JSON.stringify(m.tool_calls || []).length, 0);
        if (chars < maxLimit) return null;

        const Service = AIService;
        if (!Service?.AIChatSend) return null;

        const connectingMsgId = genId();
        useStore.getState().addAIChatMessage(sid, {
            id: connectingMsgId, role: 'assistant', phase: 'connecting', content: aiText('ai.chat.compressionConnecting'), timestamp: Date.now(), loading: true
        });

        const summaryPrompt = aiText('ai.chat.compressionPrompt');

        const sysMsg = { role: 'system', content: summaryPrompt };
        const result = await Service.AIChatSend([sysMsg, ...messagesPayload]);

        if (result?.success && result.content) {
            useStore.getState().deleteAIChatMessage(sid, connectingMsgId);
            return result.content;
        } else {
            useStore.getState().updateAIChatMessage(sid, connectingMsgId, { loading: false, phase: 'idle', content: aiText('ai.chat.compressionFailed') });
        }
    } catch (e) {
        console.error("Compression exception:", e);
    }
    return null;
};

// Clean error messages by stripping HTML details and shortening oversized text.
const sanitizeErrorMsg = (raw: string): string => {
    if (!raw || typeof raw !== 'string') return aiText('ai.chat.unknownError');
    // Detect HTML content.
    if (raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('<head')) {
        // Try to extract the <title> content.
        const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
        // Try to extract an HTTP status code.
        const codeMatch = raw.match(/\b(4\d{2}|5\d{2})\b/);
        const title = titleMatch?.[1]?.trim();
        const code = codeMatch?.[1];
        if (title) return code ? `HTTP ${code}: ${title}` : title;
        if (code) return aiText('ai.sanitize.serverError', { code });
        return aiText('ai.sanitize.htmlResponse');
    }
    // Shorten oversized plain-text errors.
    if (raw.length > 300) return raw.substring(0, 280) + aiText('ai.sanitize.truncated');
    return raw;
};

const buildLocalTools = (language: AppLanguage): AiTool[] => [
    {
        type: 'function',
        function: {
            name: 'get_connections',
            description: aiTextForLanguage(language, 'ai.tool.getConnections.description'),
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_databases',
            description: aiTextForLanguage(language, 'ai.tool.getDatabases.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.connectionIdFromGetConnections') }
                },
                required: ['connectionId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_tables',
            description: aiTextForLanguage(language, 'ai.tool.getTables.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.connectionId') },
                    dbName: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.dbName') },
                },
                required: ['connectionId', 'dbName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_columns',
            description: aiTextForLanguage(language, 'ai.tool.getColumns.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.connectionId') },
                    dbName: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.dbName') },
                    tableName: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.tableName') },
                },
                required: ['connectionId', 'dbName', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_table_ddl',
            description: aiTextForLanguage(language, 'ai.tool.getTableDdl.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.connectionId') },
                    dbName: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.dbName') },
                    tableName: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.tableName') },
                },
                required: ['connectionId', 'dbName', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'execute_sql',
            description: aiTextForLanguage(language, 'ai.tool.executeSql.description'),
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.connectionId') },
                    dbName: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.dbName') },
                    sql: { type: 'string', description: aiTextForLanguage(language, 'ai.tool.arg.sql') },
                },
                required: ['connectionId', 'dbName', 'sql']
            }
        }
    }
];

export const AIChatPanel: React.FC<AIChatPanelProps> = ({ 
    width = 380, darkMode, bgColor, onClose, onOpenSettings, onWidthChange, overlayTheme 
}) => {
    const [input, setInput] = useState('');
    const [draftImages, setDraftImages] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const [activeProvider, setActiveProvider] = useState<AIProviderConfig | null>(null);
    const [dynamicModels, setDynamicModels] = useState<string[]>([]);
    const [contextLevel, setContextLevel] = useState<AIContextLevel>('schema_only');
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);
    const [composerNotice, setComposerNotice] = useState<AIComposerNotice | null>(null);
    const [panelWidth, setPanelWidth] = useState(width);
    const [isResizing, setIsResizing] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);
    const toolCallRoundRef = useRef(0); // Consecutive failed tool-call rounds.
    const totalToolRoundRef = useRef(0); // Global tool-call round count to avoid infinite loops.
    const nudgeCountRef = useRef(0); // Number of nudges sent to encourage function calls.
    const panelRef = useRef<HTMLDivElement>(null); // Panel DOM ref for direct width updates while resizing.
    const dragWidthRef = useRef(0); // Live width during resizing without forcing React rerenders.

    const aiChatHistory = useStore(state => state.aiChatHistory);
    const aiActiveSessionId = useStore(state => state.aiActiveSessionId);
    const createNewAISession = useStore(state => state.createNewAISession);
    const addAIChatMessage = useStore(state => state.addAIChatMessage);
    const updateAIChatMessage = useStore(state => state.updateAIChatMessage);
    const deleteAIChatMessage = useStore(state => state.deleteAIChatMessage);
    const truncateAIChatMessages = useStore(state => state.truncateAIChatMessages);
    const updateAISessionTitle = useStore(state => state.updateAISessionTitle);
    
    const activeContext = useStore(state => state.activeContext);
    const aiContexts = useStore(state => state.aiContexts);
    const connections = useStore(state => state.connections);
    const tabs = useStore(state => state.tabs);
    const activeTabId = useStore(state => state.activeTabId);
    const aiPanelVisible = useStore(state => state.aiPanelVisible);
    const aiChatSendShortcutBinding = useStore(state => state.shortcutOptions.sendAIChatMessage);
    const language = useStore(state => state.language);
    const localTools = useMemo(() => buildLocalTools(language), [language]);
    const nudgePattern = useMemo(() => buildNudgePattern(language), [language]);

    useEffect(() => {
        if (!aiPanelVisible) return;
        let cancelled = false;

        const loadContextLevel = async () => {
            try {
                const level = await AIService.AIGetContextLevel?.();
                if (!cancelled) {
                    setContextLevel((level || 'schema_only') as AIContextLevel);
                }
            } catch {
                if (!cancelled) {
                    setContextLevel('schema_only');
                }
            }
        };

        void loadContextLevel();

        const handleContextLevelChanged = (event: Event) => {
            const customEvent = event as CustomEvent<{ level?: AIContextLevel }>;
            const nextLevel = customEvent.detail?.level || 'schema_only';
            setContextLevel(nextLevel);
        };

        window.addEventListener('javanavi:ai:context-level-changed', handleContextLevelChanged as EventListener);
        return () => {
            cancelled = true;
            window.removeEventListener('javanavi:ai:context-level-changed', handleContextLevelChanged as EventListener);
        };
    }, [aiPanelVisible]);

    // Auto-Context Injection Hook
    useEffect(() => {
        if (!aiPanelVisible) return;
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && (activeTab.type === 'table' || activeTab.type === 'design')) {
            const { connectionId, dbName, tableName } = activeTab;
            if (connectionId && dbName && tableName) {
                const connKey = `${connectionId}:${dbName}`;
                const currentContexts = useStore.getState().aiContexts[connKey] || [];
                if (!currentContexts.find(c => c.dbName === dbName && c.tableName === tableName)) {
                    const conn = useStore.getState().connections.find(c => c.id === connectionId);
                    if (conn) {
                        import('@compat/javanaviApp').then(async ({ DBGetColumns, DBShowCreateTable }) => {
                            const rpcConfig = buildRpcConnectionConfig(conn.config);
                            const schemaResult = await resolveAITableSchemaToolResult({
                                tableName,
                                fetchDDL: () => DBShowCreateTable(rpcConfig, dbName, tableName),
                                fetchColumns: () => DBGetColumns(rpcConfig, dbName, tableName),
                            });
                            if (schemaResult.success && schemaResult.content) {
                                useStore.getState().addAIContext(connKey, { dbName, tableName, ddl: schemaResult.content });
                            }
                        }).catch(err => console.error("Failed to auto-fetch table context", err));
                    }
                }
            }
        }
    }, [aiPanelVisible, activeTabId, tabs]);

    useEffect(() => {
        if (!aiActiveSessionId) {
            createNewAISession();
        }
    }, [aiActiveSessionId, createNewAISession]);

    const sid = aiActiveSessionId || 'session-fallback';

    // Load the session list from backend when the panel first becomes visible.
    const sessionsLoadedRef = useRef(false);
    useEffect(() => {
        if (!aiPanelVisible || sessionsLoadedRef.current) return;
        sessionsLoadedRef.current = true;
        loadAISessionsFromBackend();
    }, [aiPanelVisible]);

    // Load messages from backend when switching sessions.
    useEffect(() => {
        if (sid && sid !== 'session-fallback') {
            loadAISessionFromBackend(sid);
        }
    }, [sid]);
    const messages = aiChatHistory[sid] || [];

    const getConnectionName = useCallback(() => {
        let connectionId = activeContext?.connectionId;
        if (!connectionId) {
            const activeTab = tabs.find(t => t.id === activeTabId);
            connectionId = activeTab?.connectionId;
        }
        if (!connectionId) return '';
        const conn = connections.find(c => c.id === connectionId);
        return conn ? conn.name : '';
    }, [activeContext, activeTabId, connections, tabs]);

    const activeConnName = getConnectionName();

    const textColor = overlayTheme.titleText;
    const mutedColor = overlayTheme.mutedText;
    const borderColor = overlayTheme.divider;
    const assistantBubbleBg = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    const quickActionBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)';
    const quickActionBorder = overlayTheme.sectionBorder;

    const loadActiveProvider = useCallback(async () => {
        try {
            const Service = AIService;
            if (!Service) return;
            const [provRes, activeRes] = await Promise.all([
                Service.AIGetProviders?.(),
                Service.AIGetActiveProvider?.(),
            ]);
            if (Array.isArray(provRes) && activeRes) {
                const current = provRes.find((p) => p.id === activeRes);
                setActiveProvider(current || null);
            }
        } catch (e) { console.warn('Failed to load active provider', e); }
    }, [language]);

    useEffect(() => { loadActiveProvider(); }, [loadActiveProvider]);

    // Reload the active provider and clear cached models when provider settings change.
    useEffect(() => {
        const handler = () => {
            setDynamicModels([]);
            setComposerNotice(null);
            activeProviderIdRef.current = null;
            loadActiveProvider();
        };
        window.addEventListener('javanavi:ai:provider-changed', handler);
        return () => window.removeEventListener('javanavi:ai:provider-changed', handler);
    }, [loadActiveProvider]);

    const handleModelChange = async (val: string) => {
        if (!activeProvider) return;
        try {
            const Service = AIService;
            const payload = {
                ...activeProvider,
                model: val,
                apiKey: activeProvider.apiKey || '',
                hasSecret: activeProvider.hasSecret ?? Boolean(activeProvider.secretRef),
            };
            await Service?.AISaveProvider?.(payload);
            setActiveProvider(payload);
            setComposerNotice(null);
        } catch (e) { console.warn('Failed to update provider model', e); }
    };

    const activeProviderIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (activeProvider?.id && activeProvider.id !== activeProviderIdRef.current) {
            setDynamicModels([]);
            setComposerNotice(null);
            activeProviderIdRef.current = activeProvider.id;
        }
        // Also clear remaining models after the active provider is deleted.
        if (!activeProvider) {
            setDynamicModels([]);
            setComposerNotice(null);
            activeProviderIdRef.current = null;
        }
    }, [activeProvider?.id, activeProvider]);

    useEffect(() => {
        if (activeProvider?.model && String(activeProvider.model).trim()) {
            setComposerNotice(null);
        }
    }, [activeProvider?.model]);


    // Keep dynamicModels in memory only so remote discovery does not modify static provider models.

    const fetchDynamicModels = useCallback(async () => {
        try {
            setLoadingModels(true);
            setComposerNotice(null);
            const Service = AIService;
            if (!Service) return;
            const result = await Service.AIListModels?.();
            if (result?.success && Array.isArray(result.models) && result.models.length > 0) {
                const sortedModels = [...result.models].sort((a, b) => a.localeCompare(b));
                setDynamicModels(sortedModels);
                setComposerNotice(null);
            } else if (result && !result.success) {
                setDynamicModels([]);
                setComposerNotice(buildModelFetchFailedNotice(result.error, language));
            }
        } catch (e: unknown) {
            console.warn('Failed to fetch models', e);
            setDynamicModels([]);
            setComposerNotice(buildModelFetchFailedNotice(aiTextForLanguage(language, 'ai.chat.modelFetchFailedPrefix', { message: getErrorMessage(e) }), language));
        } finally {
            setLoadingModels(false);
        }
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: sending ? 'auto' : 'smooth', block: 'end' });
    }, [messages.length, sending]);

    useEffect(() => {
        const timer = setTimeout(() => {
            textareaRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.prompt) {
                setInput(detail.prompt);
                setTimeout(() => {
                    textareaRef.current?.focus();
                }, 50);
            }
        };
        window.addEventListener('javanavi:ai:inject-prompt', handler);
        return () => window.removeEventListener('javanavi:ai:inject-prompt', handler);
    }, []);

    useEffect(() => {
        const eventName = `ai:stream:${sid}`;
        let assistantMsgId = '';
        let isFirstCompletion = false;

        // Buffer high-frequency stream events through requestAnimationFrame to avoid blocking rerenders.
        const streamBuffer: StreamBuffer = { thinking: '', content: '' };
        let flushPending = false;

        const flushStreamBuffer = () => {
            if (!assistantMsgId) return;
            const current = useStore.getState().aiChatHistory[sid];
            const existing = current?.find(m => m.id === assistantMsgId);
            if (!existing) return;

            const updates: Partial<AIChatMessage> = {};
            if (streamBuffer.thinking) {
                updates.thinking = (existing.thinking || '') + streamBuffer.thinking;
                updates.phase = 'thinking';
                streamBuffer.thinking = '';
            }
            if (streamBuffer.content) {
                updates.content = (existing.content || '') + streamBuffer.content;
                updates.phase = 'generating';
                streamBuffer.content = '';
            }
            
            if (Object.keys(updates).length > 0) {
                updateAIChatMessage(sid, assistantMsgId, updates);
            }
            flushPending = false;
        };

        const handler = (data: { content?: string; thinking?: string; tool_calls?: AIToolCall[]; done?: boolean; error?: string }) => {
            // Find connecting message if there's no active assistant string
            if (!assistantMsgId) {
                const history = useStore.getState().aiChatHistory[sid] || [];
                const lastMsg = history[history.length - 1];
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.loading && lastMsg.phase === 'connecting') {
                    assistantMsgId = lastMsg.id;
                    // Clear transition text immediately when taking over a connecting message.
                    updateAIChatMessage(sid, assistantMsgId, { content: '' });
                }
            }

            if (data.error) {
                const cleanErr = sanitizeErrorMsg(data.error);
                const rawErr = cleanErr !== data.error ? data.error : undefined;
                if (assistantMsgId) {
                    updateAIChatMessage(sid, assistantMsgId, { content: aiText('ai.chat.error', { message: cleanErr }), phase: 'idle', loading: false, rawError: rawErr });
                } else {
                    addAIChatMessage(sid, {
                        id: genId(),
                        role: 'assistant',
                        phase: 'idle',
                        content: aiText('ai.chat.error', { message: cleanErr }),
                        rawError: rawErr,
                        timestamp: Date.now(),
                    });
                }
                assistantMsgId = '';
                setSending(false);
                return;
            }

            if (data.tool_calls && data.tool_calls.length > 0) {
                if (assistantMsgId) {
                    updateAIChatMessage(sid, assistantMsgId, { tool_calls: data.tool_calls, phase: 'tool_calling' });
                } else {
                    assistantMsgId = genId();
                    addAIChatMessage(sid, {
                        id: assistantMsgId,
                        role: 'assistant',
                        phase: 'tool_calling',
                        content: '',
                        tool_calls: data.tool_calls,
                        timestamp: Date.now(),
                        loading: true,
                    });
                }
            }

            // Handle model thinking output.
            if (data.thinking) {
                if (!assistantMsgId) {
                    assistantMsgId = genId();
                    addAIChatMessage(sid, {
                        id: assistantMsgId,
                        role: 'assistant',
                        phase: 'thinking',
                        content: '',
                        thinking: data.thinking,
                        timestamp: Date.now(),
                        loading: true,
                    });
                    if (sending) setSending(false);
                } else {
                    streamBuffer.thinking += data.thinking;
                    if (sending) setSending(false);
                }
            }

            if (data.content) {
                if (!assistantMsgId) {
                    assistantMsgId = genId();
                    addAIChatMessage(sid, {
                        id: assistantMsgId,
                        role: 'assistant',
                        phase: 'generating',
                        content: data.content,
                        timestamp: Date.now(),
                        loading: true,
                    });
                    setSending(false);
                    const currentHistory = useStore.getState().aiChatHistory[sid] || [];
                    if (currentHistory.length <= 1) isFirstCompletion = true;
                } else {
                    streamBuffer.content += data.content;
                    if (sending) setSending(false);
                }
            }

            if (streamBuffer.thinking || streamBuffer.content) {
                if (!flushPending) {
                    flushPending = true;
                    requestAnimationFrame(flushStreamBuffer);
                }
            }

            if (data.done) {
                // Flush any remaining stream buffer into state immediately.
                if (streamBuffer.thinking || streamBuffer.content) {
                    flushStreamBuffer();
                }
                const doneAssistantId = assistantMsgId;
                const doneIsFirst = isFirstCompletion;
                assistantMsgId = '';
                setTimeout(() => {
                    // Clear loading state for stale connecting transition bubbles.
                    const currentMsgs = useStore.getState().aiChatHistory[sid] || [];
                    for (const msg of currentMsgs) {
                        if (msg.id !== doneAssistantId && msg.loading && msg.phase === 'connecting') {
                            updateAIChatMessage(sid, msg.id, { loading: false, phase: 'idle' });
                        }
                    }

                    if (doneAssistantId) {
                        const current = useStore.getState().aiChatHistory[sid];
                        const existing = current?.find(m => m.id === doneAssistantId);
                        if (existing && existing.tool_calls && existing.tool_calls.length > 0) {
                            // Keep loading and tool_calling so the UI can display tool progress in real time.
                            nudgeCountRef.current = 0;
                            setTimeout(() => executeLocalTools(existing.tool_calls!, doneAssistantId), 50);
                            return;
                        }

                        // Nudge when the model describes tool usage without emitting a function call.
                        if (existing && nudgeCountRef.current < 2 &&
                            nudgePattern.test(existing.content || '')) {
                            nudgeCountRef.current += 1;
                            // Stop loading on the current message to remove the blinking cursor.
                            updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
                            // Add a nudge message and resend.
                            (async () => {
                                try {
                                    const currentHistory = useStore.getState().aiChatHistory[sid] || [];
                                    const messagesPayload = currentHistory.map(toChatPayload);
                                    const sysMessages = await buildSystemContextMessages();
                                    // Append the nudge message.
                                    messagesPayload.push({ role: 'user', content: aiTextForLanguage(language, 'ai.chat.nudgeUseTool') });
                                    const allMsg = [...sysMessages, ...messagesPayload];
                                    const Service = AIService;
                                    if (Service?.AIChatStream) await Service.AIChatStream(sid, allMsg, localTools);
                                } catch (e) {
                                    console.error('Nudge failed', e);
                                    setSending(false);
                                }
                            })();
                            return;
                        }

                        if (doneIsFirst) generateTitleForSession(sid);
                        
                        // Normal completion: stop loading.
                        const hasContent = !!existing?.content?.trim();
                        const hasThinking = !!existing?.thinking?.trim();
                        const hasTools = !!(existing?.tool_calls?.length);
                        
                        if (!hasContent && !hasThinking && !hasTools) {
                            updateAIChatMessage(sid, doneAssistantId, { content: aiText('ai.chat.noResponse'), loading: false, phase: 'idle' });
                        } else {
                            updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
                        }
                    } else {
                        addAIChatMessage(sid, { id: genId(), role: 'assistant', content: aiText('ai.chat.interrupted'), timestamp: Date.now(), loading: false });
                    }
                    setSending(false);
                }, 50);
            }
        };

        EventsOn(eventName, handler);
        return () => { EventsOff(eventName); };
    }, [addAIChatMessage, updateAIChatMessage, sid]);

    const generateTitleForSession = async (currentSid: string) => {
        try {
            const Service = AIService;
            const historyLocal = useStore.getState().aiChatHistory[currentSid] || [];
            if (!Service?.AIChatSend || historyLocal.length < 2) return;
            
            const firstUserMsg = historyLocal.find(m => m.role === 'user');
            if (firstUserMsg) {
                // Use the first 50 characters to avoid spending too many tokens on title generation.
                const snippet = firstUserMsg.content.slice(0, 50);
                const titleReq = [
                    { role: 'system', content: 'You are a summarizer. Provide a short 3-6 word title for this prompt. Do not use quotes, punctuation, or explain. Just the title in the same language as the prompt.' },
                    { role: 'user', content: snippet }
                ];
                const res = await Service.AIChatSend(titleReq);
                if (res?.success && res.content) {
                    const cleanTitle = res.content.trim().replace(/^["']|["']$/g, '');
                    updateAISessionTitle(currentSid, cleanTitle);
                }
            }
        } catch (e) {
            console.warn('Failed to auto-generate title', e);
        }
    };

    const handleScrollMessages = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
        setShowScrollBottom(!isNearBottom);
    }, []);

    const scrollToMessagesBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleEditMessage = useCallback((msg: AIChatMessage) => {
        truncateAIChatMessages(sid, msg.id);
        deleteAIChatMessage(sid, msg.id);
        setInput(msg.content);
        setTimeout(() => textareaRef.current?.focus(), 50);
    }, [sid, truncateAIChatMessages, deleteAIChatMessage]);

    const handleRetryMessage = useCallback(async (msg: AIChatMessage) => {
        const historyLocal = useStore.getState().aiChatHistory[sid] || [];
        const aiIndex = historyLocal.findIndex(m => m.id === msg.id);
        if (aiIndex <= 0) return;
        
        let lastUserMsgIndex = -1;
        for (let i = aiIndex - 1; i >= 0; i--) {
            if (historyLocal[i].role === 'user') {
                lastUserMsgIndex = i;
                break;
            }
        }
        
        if (lastUserMsgIndex >= 0) {
            const userMsg = historyLocal[lastUserMsgIndex];
            truncateAIChatMessages(sid, userMsg.id); 

            // Reset counters consistently with handleSend.
            toolCallRoundRef.current = 0;
            totalToolRoundRef.current = 0;
            nudgeCountRef.current = 0;

            setSending(true);

            // Insert the same connecting transition message used by handleSend.
            const connectingMsg: AIChatMessage = {
                id: genId(), role: 'assistant', phase: 'connecting', content: '',
                timestamp: Date.now(), loading: true,
            };
            addAIChatMessage(sid, connectingMsg);

            const truncatedHistory = historyLocal.slice(0, lastUserMsgIndex + 1);
            const messagesPayload = truncatedHistory.map(m => ({ role: m.role, content: m.content, images: m.images }));
            
            try {
                const sysMessages = await buildSystemContextMessages();
                const allMessages = [...sysMessages, ...messagesPayload];
                
                const Service = AIService;
                if (Service?.AIChatStream) {
                    await Service.AIChatStream(sid, allMessages, localTools);
                } else if (Service?.AIChatSend) {
                     const result = await Service.AIChatSend(allMessages, localTools);
                     const errRaw = result?.error || aiTextForLanguage(language, 'ai.chat.unknownError');
                     const errClean = sanitizeErrorMsg(errRaw);
                     addAIChatMessage(sid, {
                         id: genId(), role: 'assistant', 
                         content: result?.success ? result.content : aiTextForLanguage(language, 'ai.chat.error', { message: errClean }),
                         rawError: (!result?.success && errClean !== errRaw) ? errRaw : undefined,
                         timestamp: Date.now(),
                     });
                     setSending(false);
                } else {
                    setSending(false);
                }
            } catch(e: unknown) {
                const rawE = getErrorMessage(e);
                const cleanE = sanitizeErrorMsg(rawE);
                addAIChatMessage(sid, {
                    id: genId(),
                    role: 'assistant',
                    content: aiTextForLanguage(language, 'ai.chat.sendFailed', { message: cleanE }),
                    rawError: cleanE !== rawE ? rawE : undefined,
                    timestamp: Date.now(),
                });
                setSending(false);
            }
        }
    }, [
        sid,
        truncateAIChatMessages,
        addAIChatMessage,
    ]);

    const buildSystemContextMessages = useCallback(async () => {
        // Read live state from the store to avoid stale closures and dependency churn.
        const { activeContext: ctx, aiContexts: ctxMap, connections: conns, tabs: allTabs, activeTabId: tabId } = useStore.getState();

        const systemMessages: { role: string; content: string; images?: string[] }[] = [];
        const activeTab = allTabs.find(t => t.id === tabId);

        let targetConnId = ctx?.connectionId;
        let targetDbName = ctx?.dbName;
        if (!targetConnId || !targetDbName) {
            if (activeTab && activeTab.connectionId && activeTab.dbName) {
                targetConnId = activeTab.connectionId;
                targetDbName = activeTab.dbName;
            }
        }

        const connectionKey = targetConnId ? `${targetConnId}:${targetDbName || ''}` : 'default';
        const activeContextItems = ctxMap[connectionKey] || [];

        if (targetConnId && targetDbName) {
            const conn = conns.find(c => c.id === targetConnId);
            const dbType = conn?.config?.type || 'unknown';
            let availableTables: string[] = [];
            if (contextLevel === 'full' && conn) {
                try {
                    const tableResult = await DBGetTables(buildRpcConnectionConfig(conn.config), targetDbName);
                    if (tableResult?.success && Array.isArray(tableResult.data)) {
                        availableTables = queryArrayData<TableRow>(tableResult)
                            .map((row) => String(row?.Table || row?.table || row?.tableName || firstRecordValue(row) || '').trim())
                            .filter(Boolean)
                            .slice(0, 200);
                    }
                } catch {
                    availableTables = [];
                }
            }

            const databaseContext = buildDatabaseContextMessage({
                contextLevel,
                dbType,
                connectionName: conn?.name || '',
                dbName: targetDbName,
                activeContextItems,
                availableTables,
            });

            if (databaseContext) {
                systemMessages.push({
                    role: 'system',
                    content: databaseContext,
                });
            }

            if (contextLevel === 'schema_only' && activeContextItems.length === 0) {
                const dbDisplayType = dbType === 'diros' ? 'Doris' : dbType.charAt(0).toUpperCase() + dbType.slice(1);
                systemMessages.push({
                    role: 'system',
                    content: aiTextForLanguage(language, 'ai.chat.databaseAssistantSchemaOnlyPrompt', { dbType: dbDisplayType, dbName: targetDbName })
                });
            }
        }
        else {
            const connList = conns.map(c => `{id: "${c.id}", name: "${c.name}", type: "${c.config?.type || 'unknown'}"}`).join(', ');
            systemMessages.push({
                role: 'system',
                content: aiTextForLanguage(language, 'ai.chat.databaseAssistantNoContextPrompt', {
                    connections: connList || aiTextForLanguage(language, 'ai.chat.noConnections'),
                })
            });
        }
        return systemMessages;
    }, [contextLevel, language]);

    // Record successful get_tables calls for table-level exact matching.
    const toolContextMapRef = useRef<Map<string, { connectionId: string; dbName: string; tables: string[] }>>(new Map());

    const executeLocalTools = useCallback(async (toolCalls: AIToolCall[], currentAsstMsgId: string) => {
        const currentAsstMsg = (useStore.getState().aiChatHistory[sid] || []).find(m => m.id === currentAsstMsgId);

        // Global round guard to prevent endless tool-call loops after an answer is ready.
        const MAX_TOOL_CALL_ROUNDS = 15;
        totalToolRoundRef.current += 1;
        if (totalToolRoundRef.current > MAX_TOOL_CALL_ROUNDS) {
            updateAIChatMessage(sid, currentAsstMsgId, { loading: false, phase: 'idle' });
            useStore.getState().addAIChatMessage(sid, {
                id: genId(), role: 'assistant',
                content: aiTextForLanguage(language, 'ai.chat.toolMaxRounds', { max: MAX_TOOL_CALL_ROUNDS }),
                timestamp: Date.now(),
            });
            setSending(false);
            return;
        }

        const results: AIChatMessage[] = [];
        // Execute tools serially and write each result to the store immediately.
        for (const tc of toolCalls) {
            let resStr = '';
            let success = false;
            try {
                const args = JSON.parse(tc.function.arguments || '{}');
                switch (tc.function.name) {
                    case 'get_connections':
                        const conns = useStore.getState().connections.map(c => ({
                            id: c.id,
                            name: c.name,
                            type: c.config?.type,
                            host: c.config?.host || ''
                        }));
                        resStr = JSON.stringify(conns);
                        success = true;
                        break;
                    case 'get_databases': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const dbRes = await DBGetDatabases(buildRpcConnectionConfig(conn.config));
                                if (dbRes?.success && Array.isArray(dbRes.data)) {
                                    let dNames = queryArrayData<DatabaseRow>(dbRes).map((r) => r.Database || r.database || firstRecordValue(r));
                                    if (dNames.length > 50) dNames = [...dNames.slice(0, 50), aiTextForLanguage(language, 'ai.tool.truncated')];
                                    resStr = JSON.stringify(dNames);
                                    success = true;
                                } else {
                                    resStr = dbRes?.message || 'Failed to fetch DBs';
                                }
                            } catch (e: unknown) {
                                resStr = aiTextForLanguage(language, 'ai.tool.fetchDatabasesFailed', { message: getErrorMessage(e) });
                            }
                        } else { resStr = 'Connection not found'; }
                        break;
                    }
                    case 'get_tables': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const rawDbName = args.dbName || args.database;
                                const safeDbName = rawDbName ? String(rawDbName).trim() : '';
                                const tbRes = await DBGetTables(buildRpcConnectionConfig(conn.config), safeDbName);
                                if (tbRes?.success && Array.isArray(tbRes.data)) {
                                    let tNames = queryArrayData<TableRow>(tbRes).map((r) => String(r.Table || r.table || firstRecordValue(r) || ''));
                                    if (tNames.length > 150) tNames = [...tNames.slice(0, 150), aiTextForLanguage(language, 'ai.tool.truncated')];
                                    resStr = JSON.stringify(tNames);
                                    success = true;
                                    // Record verified context parameters and table list for later exact matching.
                                    toolContextMapRef.current.set(`${args.connectionId}:${safeDbName}`, {
                                        connectionId: args.connectionId,
                                        dbName: safeDbName,
                                        tables: tNames.filter((t: string) => t !== aiTextForLanguage(language, 'ai.tool.truncated'))
                                    });
                                } else { resStr = tbRes?.message || 'Failed to fetch Tables'; }
                            } catch (e: unknown) {
                                resStr = aiTextForLanguage(language, 'ai.tool.fetchTablesFailed', { message: getErrorMessage(e) });
                            }
                        } else { resStr = 'Connection not found'; }
                        break;
                    }
                    case 'get_columns': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const safeDbName = args.dbName ? String(args.dbName).trim() : '';
                                const safeTable = args.tableName ? String(args.tableName).trim() : '';
                                const { DBGetColumns } = await import('@compat/javanaviApp');
                                const colRes = await DBGetColumns(buildRpcConnectionConfig(conn.config), safeDbName, safeTable);
                                if (colRes?.success && Array.isArray(colRes.data)) {
                                    // Keep only key column details to reduce token usage.
                                    const cols = queryArrayData<ColumnRow>(colRes).map((c) => {
                                        const keys = Object.keys(c);
                                        return {
                                            field: c.Field || c.field || c.COLUMN_NAME || c.column_name || c.Name || c.name || (keys.length > 0 ? c[keys[0]] : ''),
                                            type: c.Type || c.type || c.DATA_TYPE || c.data_type || (keys.length > 1 ? c[keys[1]] : ''),
                                            nullable: c.Null || c.null || c.IS_NULLABLE || c.is_nullable || c.Nullable || c.nullable || '',
                                            default: c.Default || c.default || c.COLUMN_DEFAULT || c.column_default || c.DefaultValue || '',
                                            comment: c.Comment || c.comment || c.COLUMN_COMMENT || c.column_comment || c.Description || '',
                                        };
                                    });
                                    // Inject a strict warning directly into tool results to enforce exact column names.
                                    const fieldNames = cols.map((c) => c.field).join(', ');
                                    resStr = aiTextForLanguage(language, 'ai.tool.columnsStrictWarning', {
                                        table: safeTable,
                                        fields: fieldNames,
                                        details: JSON.stringify(cols),
                                    });
                                    success = true;
                                } else { resStr = colRes?.message || 'Failed to fetch columns'; }
                            } catch (e: unknown) {
                                resStr = aiTextForLanguage(language, 'ai.tool.fetchColumnsFailed', { message: getErrorMessage(e) });
                            }
                        } else { resStr = 'Connection not found'; }
                        break;
                    }
                    case 'get_table_ddl': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const safeDbName = args.dbName ? String(args.dbName).trim() : '';
                                const safeTable = args.tableName ? String(args.tableName).trim() : '';
                                const { DBShowCreateTable, DBGetColumns } = await import('@compat/javanaviApp');
                                const rpcConfig = buildRpcConnectionConfig(conn.config);
                                const toolResult = await resolveAITableSchemaToolResult({
                                    tableName: safeTable,
                                    fetchDDL: () => DBShowCreateTable(rpcConfig, safeDbName, safeTable),
                                    fetchColumns: () => DBGetColumns(rpcConfig, safeDbName, safeTable),
                                });
                                resStr = toolResult.content;
                                success = toolResult.success;
                            } catch (e: unknown) {
                                resStr = aiTextForLanguage(language, 'ai.tool.fetchDdlFailed', { message: getErrorMessage(e) });
                            }
                        } else { resStr = 'Connection not found'; }
                        break;
                    }
                    case 'execute_sql': {
                        const conn = useStore.getState().connections.find(c => c.id === args.connectionId);
                        if (conn) {
                            try {
                                const safeDbName = args.dbName ? String(args.dbName).trim() : '';
                                const safeSql = args.sql ? String(args.sql).trim() : '';
                                // Safety-level check.
                                const Service = AIService;
                                if (Service?.AICheckSQL) {
                                    const check = await Service.AICheckSQL(safeSql);
                                    if (!check.allowed) {
                                        resStr = aiTextForLanguage(language, 'ai.tool.sqlBlocked', { type: check.operationType });
                                        break;
                                    }
                                }
                                const { DBQuery } = await import('@compat/javanaviApp');
                                const finalSql = buildAIReadonlyPreviewSQL(conn.config?.type || '', safeSql, 50, conn.config?.driver || '');
                                const qRes = await DBQuery(buildRpcConnectionConfig(conn.config), safeDbName, finalSql, 'ai-tool');
                                if (qRes?.success) {
                                    const rows = Array.isArray(qRes.data) ? qRes.data : [];
                                    const limitedRows = rows.slice(0, 50);
                                    resStr = JSON.stringify({ rowCount: rows.length, data: limitedRows });
                                    success = true;
                                } else { resStr = qRes?.message || aiTextForLanguage(language, 'ai.tool.sqlFailed'); }
                            } catch (e: unknown) {
                                resStr = aiTextForLanguage(language, 'ai.tool.sqlError', { message: getErrorMessage(e) });
                            }
                        } else { resStr = 'Connection not found'; }
                        break;
                    }
                    default:
                        resStr = `Unknown function: ${tc.function.name}`;
                }
            } catch (e: unknown) {
                resStr = getErrorMessage(e);
            }

            const toolResultMsg: AIChatMessage = {
                id: genId(),
                role: 'tool',
                content: resStr,
                timestamp: Date.now(),
                tool_call_id: tc.id,
                tool_name: tc.function.name,
                success
            };
            results.push(toolResultMsg);

            // Write every finished tool result to the store so progress updates immediately.
            useStore.getState().addAIChatMessage(sid, toolResultMsg);

            // Delay briefly so the UI can render per-tool progress.
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        // Count only consecutive failed rounds and reset after any success.
        const anySuccess = results.some(r => r.success === true);
        if (anySuccess) {
            toolCallRoundRef.current = 0;
        } else {
            toolCallRoundRef.current += 1;
            if (toolCallRoundRef.current >= 3) {
                useStore.getState().addAIChatMessage(sid, {
                    id: genId(), role: 'assistant',
                    content: aiTextForLanguage(language, 'ai.chat.toolConsecutiveFail'),
                    timestamp: Date.now(),
                });
                setSending(false);
                return;
            }
        }
        try {
            // Transition after tool execution: stop loading on the previous message.
            updateAIChatMessage(sid, currentAsstMsgId, { loading: false, phase: 'idle' });

            // Insert a transition bubble.
            const chainConnectingMsg: AIChatMessage = {
                id: genId(), role: 'assistant', phase: 'connecting', 
                content: aiTextForLanguage(language, 'ai.chat.summarizingProbes'),
                timestamp: Date.now(), loading: true,
            };
            useStore.getState().addAIChatMessage(sid, chainConnectingMsg);
            
            // Simulate a smooth multi-stage transition.
            const safeUpdateTransition = (text: string) => {
                const currentMsg = useStore.getState().aiChatHistory[sid]?.find(m => m.id === chainConnectingMsg.id);
                // Only update text while the message is still in connecting transition state.
                if (currentMsg && currentMsg.phase === 'connecting' && currentMsg.loading) {
                    updateAIChatMessage(sid, chainConnectingMsg.id, { content: text });
                }
            };

            setTimeout(() => safeUpdateTransition(aiTextForLanguage(language, 'ai.chat.returningRuntimeData')), 200);
            setTimeout(() => safeUpdateTransition(aiTextForLanguage(language, 'ai.chat.deepReasoning')), 500);
            setTimeout(() => safeUpdateTransition(aiTextForLanguage(language, 'ai.chat.awaitingInstructions')), 1200);
            setTimeout(() => safeUpdateTransition(aiTextForLanguage(language, 'ai.chat.deepThinking')), 3000);

            setSending(true);
            const currentHistory = useStore.getState().aiChatHistory[sid] || [];
            // Do not send connecting placeholder messages to the model.
            const messagesPayload = currentHistory.filter(m => m.phase !== 'connecting').map(toChatPayload);
            const sysMessages = await buildSystemContextMessages();

            let finalMessagesPayload = messagesPayload;
            // Apply length checks and automatic summary with the dynamic limit.
            const dynamicMaxLimit = getDynamicMaxContextChars(activeProvider?.model);
            const summary = await compressContextIfNeeded(sid, messagesPayload, dynamicMaxLimit);
            if (summary) {
                 const compressedMsg: AIChatMessage = {
                     id: genId(), role: 'assistant', content: aiTextForLanguage(language, 'ai.chat.autoMemoryReshape', { summary }), timestamp: Date.now() - 1000
                 };
                 const continueMsg: AIChatMessage = {
                     id: genId(), role: 'user', content: aiTextForLanguage(language, 'ai.chat.continueFromState'), timestamp: Date.now() - 500
                 };
                 useStore.getState().replaceAIChatHistory(sid, [compressedMsg, continueMsg, chainConnectingMsg]);
                 finalMessagesPayload = [
                     { role: 'assistant', content: compressedMsg.content },
                     { role: 'user', content: continueMsg.content }
                 ];
            }

            const allMessages = [...sysMessages, ...finalMessagesPayload];

            // Soft limit: after 10 tool rounds, stop passing tools so the model can only answer in text.
            const SOFT_LIMIT_ROUNDS = 10;
            const chainTools = totalToolRoundRef.current >= SOFT_LIMIT_ROUNDS ? [] : localTools;

            const Service = AIService;
            if (Service?.AIChatStream) {
                await Service.AIChatStream(sid, allMessages, chainTools);
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages, chainTools);
                const errR = result?.error || aiTextForLanguage(language, 'ai.chat.unknownError');
                const errC = sanitizeErrorMsg(errR);
                useStore.getState().addAIChatMessage(sid, {
                    id: genId(), role: 'assistant',
                    content: result?.success ? result.content : aiTextForLanguage(language, 'ai.chat.error', { message: errC }),
                    rawError: (!result?.success && errC !== errR) ? errR : undefined,
                    timestamp: Date.now(),
                });
                setSending(false);
            }
        } catch (e) {
            console.error('Failed to chain tool call', e);
            setSending(false);
        }
    }, [sid, buildSystemContextMessages, language, localTools, activeProvider?.model, updateAIChatMessage]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if ((!text && draftImages.length === 0) || sending) return;

        // Validate that a provider and model are configured before sending.
        if (!activeProvider) {
            setComposerNotice(buildMissingProviderNotice(language));
            return;
        }
        if (!activeProvider.model || !activeProvider.model.trim()) {
            setComposerNotice(buildMissingModelNotice(language));
            return;
        }
        setComposerNotice(null);

        toolCallRoundRef.current = 0; // Reset tool-call round counter.
        totalToolRoundRef.current = 0; // Reset total round counter.
        nudgeCountRef.current = 0; // Reset nudge counter.

        const currentImages = [...draftImages];
        setInput('');
        setDraftImages([]);
        setSending(true);

        if (textareaRef.current) {
            textareaRef.current.focus();               
        }

        const userMsg: AIChatMessage = {
            id: genId(), role: 'user', content: text, timestamp: Date.now(),
            images: currentImages.length > 0 ? currentImages : undefined,
        };
        addAIChatMessage(sid, userMsg);
        
        const connectingMsg: AIChatMessage = {
            id: genId(), role: 'assistant', phase: 'connecting', content: '', 
            timestamp: Date.now(), loading: true,
        };
        addAIChatMessage(sid, connectingMsg);

        const systemMessages = await buildSystemContextMessages();

        // Transition 2: context is ready, now connect the model.
        updateAIChatMessage(sid, connectingMsg.id, { content: aiTextForLanguage(language, 'ai.chat.connectingModel') });

        const chatMessages = [...messages, userMsg].map(toChatPayload);

        let finalMessagesPayload = chatMessages;
        const dynamicMaxLimit = getDynamicMaxContextChars(activeProvider?.model);
        const summary = await compressContextIfNeeded(sid, chatMessages, dynamicMaxLimit);
        if (summary) {
            // Replace the previous history with the generated summary, current user message, and connecting message.
            const compressedMsg: AIChatMessage = {
                id: genId(), role: 'assistant', content: aiTextForLanguage(language, 'ai.chat.autoMemoryReshape', { summary }), timestamp: Date.now() - 1000
            };
            useStore.getState().replaceAIChatHistory(sid, [compressedMsg, userMsg, connectingMsg]);
            finalMessagesPayload = [
                { role: 'assistant', content: compressedMsg.content },
                { role: 'user', content: userMsg.content, images: userMsg.images }
            ];
        }

        const allMessages = [...systemMessages, ...finalMessagesPayload];

        // Transition 3: wake the reasoning engine.
        updateAIChatMessage(sid, connectingMsg.id, { content: aiTextForLanguage(language, 'ai.chat.wakingEngine') });

        // Transition 4: wait for the first response token.
        updateAIChatMessage(sid, connectingMsg.id, { content: aiTextForLanguage(language, 'ai.chat.awaitingResponse') });

        try {
            const Service = AIService;
            if (Service?.AIChatStream) {
                await Service.AIChatStream(sid, allMessages, localTools);
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages, localTools);
                const errR2 = result?.error || aiTextForLanguage(language, 'ai.chat.unknownError');
                const errC2 = sanitizeErrorMsg(errR2);
                const assistantMsg: AIChatMessage = {
                    id: genId(), role: 'assistant',
                    content: result?.success ? result.content : aiTextForLanguage(language, 'ai.chat.error', { message: errC2 }),
                    rawError: (!result?.success && errC2 !== errR2) ? errR2 : undefined,
                    timestamp: Date.now(),
                };
                addAIChatMessage(sid, assistantMsg);
                setSending(false);
                
                // auto-generate title fallback for non-stream
                if (messages.length === 0) {
                    generateTitleForSession(sid);
                }
            } else {
                addAIChatMessage(sid, {
                    id: genId(),
                    role: 'assistant',
                    content: aiTextForLanguage(language, 'ai.chat.modelNotReady'),
                    timestamp: Date.now(),
                });
                setSending(false);
            }
        } catch (e: unknown) {
            const rawE2 = getErrorMessage(e);
            const cleanE2 = sanitizeErrorMsg(rawE2);
            addAIChatMessage(sid, {
                id: genId(),
                role: 'assistant',
                content: aiTextForLanguage(language, 'ai.chat.sendFailed', { message: cleanE2 }),
                rawError: cleanE2 !== rawE2 ? rawE2 : undefined,
                timestamp: Date.now(),
            });
            setSending(false);
        }
    }, [
        input,
        draftImages,
        sending,
        messages,
        addAIChatMessage,
        sid,
        activeProvider,
        buildSystemContextMessages,
        language,
        localTools,
    ]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        consumeAIChatSendShortcutOnKeyDown(aiChatSendShortcutBinding, e, handleSend);
    }, [aiChatSendShortcutBinding, handleSend]);

    const handleStop = useCallback(async () => {
        try {
            const Service = AIService;
            if (Service?.AIChatCancel) {
                await Service.AIChatCancel(sid);
            }
        } catch (e) {
            console.warn('Failed to stop chat stream', e);
        }
        setSending(false);
    }, [sid]);

    const ghostRef = useRef<HTMLDivElement>(null);
    const panelRect = useRef<{top: number, bottom: number, left: number} | null>(null);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        resizeStartX.current = e.clientX;
        resizeStartWidth.current = panelWidth;
        dragWidthRef.current = panelWidth;
        if (panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            panelRect.current = {
                top: rect.top,
                bottom: window.innerHeight - rect.bottom,
                left: rect.left
            };
        }
    }, [panelWidth]);

    useEffect(() => {
        if (!isResizing) return;
        let animationFrameId: number;
        const handleMouseMove = (e: MouseEvent) => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            animationFrameId = requestAnimationFrame(() => {
                const delta = resizeStartX.current - e.clientX;
                const newWidth = Math.min(Math.max(resizeStartWidth.current + delta, 280), 700);
                dragWidthRef.current = newWidth;
                
                // Update only the ghost guide position and avoid layout reflow with fixed positioning.
                if (ghostRef.current && panelRect.current) {
                    const actualDelta = newWidth - resizeStartWidth.current;
                    ghostRef.current.style.left = `${panelRect.current.left - actualDelta}px`;
                }
            });
        };
        const handleMouseUp = () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            setIsResizing(false);
            // Commit final width to React state and parent callback only when resizing ends.
            setPanelWidth(dragWidthRef.current);
            onWidthChange?.(dragWidthRef.current);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Disable pointer events during resize to prevent the Monaco editor underneath from handling hover or rerendering.
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none'; // Performance optimization.
        
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';
        };
    }, [isResizing, onWidthChange]);

    // Infer context from get_tables records with memoized table-level exact matching.
    const { inferredConnectionId, inferredDbName } = useMemo(() => {
        let connId = activeContext?.connectionId;
        let dbName = activeContext?.dbName;

        if (!connId || !dbName) {
            const allMsgText = messages.map(m => m.content || '').join(' ');
            let bestMatch: { connectionId: string; dbName: string } | null = null;
            let bestScore = 0;
            for (const entry of toolContextMapRef.current.values()) {
                let score = 0;
                for (const table of entry.tables) {
                    if (allMsgText.includes(table)) score++;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { connectionId: entry.connectionId, dbName: entry.dbName };
                }
            }
            if (bestMatch) {
                if (!connId) connId = bestMatch.connectionId;
                if (!dbName) dbName = bestMatch.dbName;
            }
        }
        return { inferredConnectionId: connId, inferredDbName: dbName };
    }, [activeContext?.connectionId, activeContext?.dbName, messages.length]);

    // Memoized callback to avoid breaking child memoization with inline closures.
    const handleDeleteMessage = useCallback((id: string) => deleteAIChatMessage(sid, id), [sid, deleteAIChatMessage]);
    const activeConnectionConfig = useMemo(() => {
        if (!inferredConnectionId) return undefined;
        const connection = connections.find(c => c.id === inferredConnectionId);
        return connection ? buildRpcConnectionConfig(connection.config) : undefined;
    }, [inferredConnectionId, connections]);
    const contextUsageChars = useMemo(() =>
        messages.reduce((sum, m) => sum + (m.content?.length || 0) + JSON.stringify(m.tool_calls || []).length, 0),
    [messages]);
    const contextTableNames = useMemo(() => {
        const ck = activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';
        return (aiContexts[ck] || []).map(c => `${c.dbName}.${c.tableName}`);
    }, [activeContext?.connectionId, activeContext?.dbName, aiContexts]);

    return (
        <div ref={panelRef} className="ai-chat-panel" style={{ width: panelWidth, background: bgColor || 'transparent', color: textColor, borderLeft: overlayTheme.shellBorder, position: 'relative' }}>
            <div className={`ai-resize-handle${isResizing ? ' active' : ''}`} onMouseDown={handleResizeStart} />
            
            {isResizing && panelRect.current && createPortal(
                <div 
                    ref={ghostRef}
                    style={{
                        position: 'fixed',
                        top: panelRect.current.top,
                        bottom: panelRect.current.bottom,
                        left: panelRect.current.left,
                        width: '2px',
                        background: darkMode ? '#ffd666' : '#1677ff',
                        zIndex: 99999,
                        pointerEvents: 'none'
                    }}
                />,
                document.body
            )}

            <AIChatHeader
                darkMode={darkMode}
                mutedColor={mutedColor}
                textColor={textColor}
                overlayTheme={overlayTheme}
                onHistoryClick={() => setHistoryOpen(true)}
                onClear={createNewAISession}
                onSettingsClick={() => { onOpenSettings?.(); setTimeout(loadActiveProvider, 500); }}
                onClose={onClose}
                messages={messages}
                sessionTitle={useStore.getState().aiChatSessions.find(s => s.id === sid)?.title || translate(language, 'ai.chat.newSession')}
            />

            <div className="ai-chat-messages" onScroll={handleScrollMessages}>
                {messages.length === 0 ? (
                    <AIChatWelcome
                        overlayTheme={overlayTheme}
                        quickActionBg={quickActionBg}
                        quickActionBorder={quickActionBorder}
                        textColor={textColor}
                        mutedColor={mutedColor}
                        onQuickAction={(prompt: string, autoSend?: boolean) => {
                            setInput(prompt);
                            if (autoSend) {
                                // Use setTimeout to let setInput render, then trigger send
                                setTimeout(() => {
                                    const el = textareaRef.current;
                                    if (el) el.focus();
                                    // Dispatch a synthetic enter to trigger handleSend
                                    // Simpler: just call handleSend directly with the prompt
                                }, 50);
                            }
                        }}
                        contextTableNames={contextTableNames}
                    />
                ) : (
                    messages.map(msg => (
                        <AIMessageBubble
                            key={msg.id}
                            msg={msg}
                            darkMode={darkMode}
                            overlayTheme={overlayTheme}
                            textColor={textColor}
                            onEdit={handleEditMessage}
                            onRetry={handleRetryMessage}
                            onDelete={handleDeleteMessage}
                            activeConnectionId={inferredConnectionId}
                            activeConnectionConfig={activeConnectionConfig}
                            activeDbName={inferredDbName}
                            allMessages={messages}
                        />
                    ))
                )}
                

                <div ref={messagesEndRef} />
            </div>

            {showScrollBottom && (
                <div 
                    onClick={scrollToMessagesBottom}
                    style={{
                        position: 'absolute', bottom: 120, right: 20, width: 32, height: 32, borderRadius: '50%',
                        background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        color: textColor, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'; }}
                >
                    <DownOutlined style={{ fontSize: 14 }} />
                </div>
            )}

            <AIChatInput
                input={input}
                setInput={setInput}
                draftImages={draftImages}
                setDraftImages={setDraftImages}
                sending={sending}
                onSend={handleSend}
                onStop={handleStop}
                handleKeyDown={handleKeyDown}
                activeConnName={activeConnName}
                activeContext={activeContext}
                activeProvider={activeProvider}
                dynamicModels={dynamicModels}
                loadingModels={loadingModels}
                sendShortcutBinding={aiChatSendShortcutBinding}
                composerNotice={composerNotice}
                onModelChange={handleModelChange}
                onFetchModels={fetchDynamicModels}
                textareaRef={textareaRef}
                darkMode={darkMode}
                textColor={textColor}
                mutedColor={mutedColor}
                overlayTheme={overlayTheme}
                contextUsageChars={contextUsageChars}
                maxContextChars={getDynamicMaxContextChars(activeProvider?.model)}
            />

            <AIHistoryDrawer
                open={historyOpen}
                onClose={() => setHistoryOpen(false)}
                bgColor={bgColor}
                darkMode={darkMode}
                textColor={textColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
                onCreateNew={createNewAISession}
                sessionId={sid}
            />
        </div>
    );
};

export default AIChatPanel;
