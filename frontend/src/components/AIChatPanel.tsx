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
import type { AiMessage } from '@compat/contracts';
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
import { translate } from '../i18n';

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

const getErrorMessage = (error: unknown, fallback = '未知错误'): string => {
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
    if (!modelName) return 258000; // 默认 258k (2026主流基线)
    const lower = modelName.toLowerCase();
    
    // 「星际杯」- 百万到千万级 Tokens (保守取 2~5M 字符)
    if (lower.includes('gemini-1.5-pro') || lower.includes('gemini-2') || lower.includes('gemini-3')) {
        return 5000000;
    }
    // 「超大杯」- 1M Tokens (针对 2026 旗舰：约 1,000,000 字符)
    if (lower.includes('glm-5') || lower.includes('claude-4') || lower.includes('claude-3.7') || lower.includes('gpt-5') || lower.includes('qwen3') || lower.includes('deepseek-v4')) {
        return 1000000;
    }
    if (lower.includes('claude-3-opus') || lower.includes('claude-3.5') || lower.includes('glm-4-long') || lower.includes('qwen-long')) {
        return 1000000;
    }
    // 「大杯」- 200K ~ 258K Tokens (针对现代主流：约 258,000 字符)
    if (lower.includes('claude') || lower.includes('deepseek') || lower.includes('gpt-4.5') || lower.includes('qwen2.5')) {
        return 258000;
    }
    // 「中杯/小杯」- 128K Tokens (老基线：约 128,000 字符)
    if (lower.includes('gpt-4') || lower.includes('gpt-4o') || lower.includes('glm') || lower.includes('z-ai')) {
        return 128000;
    }
    if (lower.includes('qwen')) {
        return 128000;
    }
    // Default fallback
    return 258000; 
};

// 当超出指定字符上限时触发上下文自建压缩
const compressContextIfNeeded = async (sid: string, messagesPayload: AiMessage[], maxLimit: number) => {
    try {
        const chars = messagesPayload.reduce((sum, m) => sum + (m.content?.length || 0) + JSON.stringify(m.tool_calls || []).length, 0);
        if (chars < maxLimit) return null;

        const Service = AIService;
        if (!Service?.AIChatSend) return null;

        const connectingMsgId = genId();
        useStore.getState().addAIChatMessage(sid, {
            id: connectingMsgId, role: 'assistant', phase: 'connecting', content: '⚙️ 对话已超载，正在启动记忆压缩...', timestamp: Date.now(), loading: true
        });

        const summaryPrompt = `这是一段超长对话的历史记录。为了释放上下文空间同时保留你的记忆核心，请你仔细阅读并以“技术事实、已探索出的数据结构状态、用户的中心诉求、当前进展”为准则，进行高度浓缩的结构化总结。
注意：
1. 客观准确，不能遗漏关键业务逻辑或探索出的表名/字段。
2. 剔除无效执行过程、客套话、JSON返回值本身。
3. 请控制在 1000-2000 字左右，输出纯干货 Markdown。
4. 开头直接输出总结，不要带寒暄。`;

        const sysMsg = { role: 'system', content: summaryPrompt };
        const result = await Service.AIChatSend([sysMsg, ...messagesPayload]);

        if (result?.success && result.content) {
            useStore.getState().deleteAIChatMessage(sid, connectingMsgId);
            return result.content;
        } else {
            useStore.getState().updateAIChatMessage(sid, connectingMsgId, { loading: false, phase: 'idle', content: '❌ 记忆压缩失败，将尝试原样接续...' });
        }
    } catch (e) {
        console.error("Compression exception:", e);
    }
    return null;
};

// 清洗错误信息：去除 HTML 标签、提取关键错误描述、截断过长文本
const sanitizeErrorMsg = (raw: string): string => {
    if (!raw || typeof raw !== 'string') return '未知错误';
    // 检测 HTML 内容
    if (raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('<head')) {
        // 尝试提取 <title> 内容
        const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
        // 尝试提取 HTTP 状态码
        const codeMatch = raw.match(/\b(4\d{2}|5\d{2})\b/);
        const title = titleMatch?.[1]?.trim();
        const code = codeMatch?.[1];
        if (title) return code ? `HTTP ${code}: ${title}` : title;
        if (code) return `HTTP ${code} 服务端错误`;
        return '服务端返回了异常 HTML 响应（可能是网关超时或服务不可用）';
    }
    // 截断过长的纯文本错误
    if (raw.length > 300) return raw.substring(0, 280) + '...(已截断)';
    return raw;
};

const LOCAL_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_connections',
            description: '当需要查询、操作数据库但用户没有选择任何连接上下文时，获取当前软件中可用的所有数据库连接信息。返回的数据包含连接ID(id)和名称(name)。',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_databases',
            description: '获取指定连接（connectionId）下的所有数据库(Database/Schema)名。',
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: '连接ID (从 get_connections 获取)' }
                },
                required: ['connectionId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_tables',
            description: '当已经确定了目标连接和数据库名后，如果用户询问或隐式提到了表但你不知道确切表名，调用此工具获取该数据库下的所有表名列表（只含表名，帮助你推断目标表）。',
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: '连接ID' },
                    dbName: { type: 'string', description: '数据库名' },
                },
                required: ['connectionId', 'dbName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_columns',
            description: '获取指定表的字段列表（字段名、类型、是否可空、默认值、注释等）。在生成 SQL 之前必须先调用此工具确认真实字段名，禁止猜测字段名。',
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: '连接ID' },
                    dbName: { type: 'string', description: '数据库名' },
                    tableName: { type: 'string', description: '表名' },
                },
                required: ['connectionId', 'dbName', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_table_ddl',
            description: '获取指定表的完整建表语句（CREATE TABLE DDL），包含字段、索引、约束等完整结构信息。',
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: '连接ID' },
                    dbName: { type: 'string', description: '数据库名' },
                    tableName: { type: 'string', description: '表名' },
                },
                required: ['connectionId', 'dbName', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'execute_sql',
            description: '在指定连接和数据库上执行 SQL 查询并返回结果。受安全级别控制，只读模式下只能执行 SELECT/SHOW/DESCRIBE 等查询操作。结果最多返回 50 行。',
            parameters: {
                type: 'object',
                properties: {
                    connectionId: { type: 'string', description: '连接ID' },
                    dbName: { type: 'string', description: '数据库名' },
                    sql: { type: 'string', description: '要执行的 SQL 语句' },
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
    const toolCallRoundRef = useRef(0); // 连续失败轮次计数
    const totalToolRoundRef = useRef(0); // 全局工具调用总轮次计数（防止无限循环）
    const nudgeCountRef = useRef(0);    // 催促模型使用 function call 的次数
    const panelRef = useRef<HTMLDivElement>(null); // 面板 DOM ref，用于拖拽时直接操作宽度
    const dragWidthRef = useRef(0); // 拖拽过程中的实时宽度（不触发 React 重渲染）

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

    // 面板首次可见时从后端加载会话列表
    const sessionsLoadedRef = useRef(false);
    useEffect(() => {
        if (!aiPanelVisible || sessionsLoadedRef.current) return;
        sessionsLoadedRef.current = true;
        loadAISessionsFromBackend();
    }, [aiPanelVisible]);

    // 切换会话时按需从后端加载消息
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
    }, []);

    useEffect(() => { loadActiveProvider(); }, [loadActiveProvider]);

    // 监听供应商配置变更（来自设置面板的删除/新增/切换操作），重新加载 active provider 并清空已缓存的模型
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
        // 供应商被删除后 activeProvider 变为 null，此时也必须清空残留模型
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


    // dynamicModels 仅在内存中使用，不再写回供应商配置，避免污染静态 models 列表

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
                setComposerNotice(buildModelFetchFailedNotice(result.error));
            }
        } catch (e: unknown) {
            console.warn('Failed to fetch models', e);
            setDynamicModels([]);
            setComposerNotice(buildModelFetchFailedNotice('获取模型列表失败：' + getErrorMessage(e)));
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

        // 新增：利用 requestAnimationFrame 缓冲高频事件，避免 React 重绘阻塞导致感官吞吐变慢
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
                    // 【关键】接管 connecting 消息时，立即清空其过渡文案，防止泄漏到 AI 回复正文
                    updateAIChatMessage(sid, assistantMsgId, { content: '' });
                }
            }

            if (data.error) {
                const cleanErr = sanitizeErrorMsg(data.error);
                const rawErr = cleanErr !== data.error ? data.error : undefined;
                if (assistantMsgId) {
                    updateAIChatMessage(sid, assistantMsgId, { content: `❌ 错误: ${cleanErr}`, phase: 'idle', loading: false, rawError: rawErr });
                } else {
                    addAIChatMessage(sid, {
                        id: genId(),
                        role: 'assistant',
                        phase: 'idle',
                        content: `❌ 错误: ${cleanErr}`,
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

            // 处理 thinking（模型思考过程）
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
                // 如果有残留未 flush 的 buffer，立刻推入状态树
                if (streamBuffer.thinking || streamBuffer.content) {
                    flushStreamBuffer();
                }
                const doneAssistantId = assistantMsgId;
                const doneIsFirst = isFirstCompletion;
                assistantMsgId = '';
                setTimeout(() => {
                    // 🔧 清除所有残留的 connecting 过渡气泡的 loading 状态
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
                            // 【关键】保持 loading:true 和 phase:'tool_calling'，让 UI 能实时展示工具执行进度
                            nudgeCountRef.current = 0;
                            setTimeout(() => executeLocalTools(existing.tool_calls!, doneAssistantId), 50);
                            return;
                        }

                        // 自动催促：模型描述了要调用工具但没有 function call
                        if (existing && nudgeCountRef.current < 2 &&
                            /(?:让我|我先|我来|现在|接下来|下面).*(?:查询|查找|获取|查看|检查|调用)|(?:获取|查询|查找|查看).*(?:信息|字段|列表|数据)[：:]?\s*$/.test(existing.content || '')) {
                            nudgeCountRef.current += 1;
                            // 🔧 关闭当前消息的 loading 状态，消除闪烁光标
                            updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
                            // 注入 system 催促并重发
                            (async () => {
                                try {
                                    const currentHistory = useStore.getState().aiChatHistory[sid] || [];
                                    const messagesPayload = currentHistory.map(toChatPayload);
                                    const sysMessages = await buildSystemContextMessages();
                                    // 追加催促消息
                                    messagesPayload.push({ role: 'user', content: '请直接使用 function call 调用工具执行操作，不要只用文字描述计划。' });
                                    const allMsg = [...sysMessages, ...messagesPayload];
                                    const Service = AIService;
                                    if (Service?.AIChatStream) await Service.AIChatStream(sid, allMsg, LOCAL_TOOLS);
                                } catch (e) {
                                    console.error('Nudge failed', e);
                                    setSending(false);
                                }
                            })();
                            return;
                        }

                        if (doneIsFirst) generateTitleForSession(sid);
                        
                        // 正常完成：关闭 loading，消除闪烁光标
                        const hasContent = !!existing?.content?.trim();
                        const hasThinking = !!existing?.thinking?.trim();
                        const hasTools = !!(existing?.tool_calls?.length);
                        
                        if (!hasContent && !hasThinking && !hasTools) {
                            updateAIChatMessage(sid, doneAssistantId, { content: '❌ 模型未能成功响应任何内容，可能遭遇频控、上下文超载或理解拒绝。', loading: false, phase: 'idle' });
                        } else {
                            updateAIChatMessage(sid, doneAssistantId, { loading: false, phase: 'idle' });
                        }
                    } else {
                        addAIChatMessage(sid, { id: genId(), role: 'assistant', content: '❌ 请求中断：未收到任何具体回复。', timestamp: Date.now(), loading: false });
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
                // 取用前 50 个字符截断，防止太长的查询消耗过多 Token
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

            // 重置计数器（与 handleSend 保持一致）
            toolCallRoundRef.current = 0;
            totalToolRoundRef.current = 0;
            nudgeCountRef.current = 0;

            setSending(true);

            // 插入 connecting 过渡消息（波纹动画），与 handleSend 保持一致
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
                    await Service.AIChatStream(sid, allMessages, LOCAL_TOOLS);
                } else if (Service?.AIChatSend) {
                     const result = await Service.AIChatSend(allMessages, LOCAL_TOOLS);
                     const errRaw = result?.error || '未知错误';
                     const errClean = sanitizeErrorMsg(errRaw);
                     addAIChatMessage(sid, {
                         id: genId(), role: 'assistant', 
                         content: result?.success ? result.content : `❌ ${errClean}`,
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
                    content: `❌ 发送失败: ${cleanE}`,
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
        // 🔧 性能优化：从 store 实时读取，避免闭包捕获导致的依赖链式重建
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
                    content: `你是一个专业的数据库助手。当前连接的数据库类型是 ${dbDisplayType}，当前数据库名为 ${targetDbName}。如果用户需要查询特定的表或者有关当前库的信息，你可以调用提供的 get_tables 工具来主动获取数据表信息。`
                });
            }
        }
        else {
            const connList = conns.map(c => `{id: "${c.id}", name: "${c.name}", type: "${c.config?.type || 'unknown'}"}`).join(', ');
            systemMessages.push({
                role: 'system',
                content: `你是一个专业的数据库助手。用户目前在界面上没有选中任何具体的数据库或数据表用于充当上下文。

重要规则：
1. 如果你需要帮用户寻找目标表，千万不要凭空猜测表名！必须调用工具去获取真实数据。
2. 完整工作流程：get_connections → get_databases → get_tables → get_columns → 生成 SQL。每一步都不可跳过。
3. 【连接优先级 - 极重要】获取连接列表后，必须按以下优先级依次检索：
   - 第一优先：host 为 localhost、127.0.0.1、或包含"本地"的连接
   - 第二优先：name 或 host 包含"开发"、"dev"、"local" 的连接，或 host 为 10.x、192.168.x、172.16-31.x 等内网 IP 的连接
   - 第三优先：其他连接（如"测试"、"生产"等）
   如果在高优先级连接中已找到目标表，直接使用该连接，不再查找低优先级连接。
4. 如果在当前数据库中未找到目标表，必须继续查询其他数据库，不要放弃。
5. 只有当所有可能的数据库都已检查完毕，或者已经明确找到目标表时，才可以停止。
6. 如果是常规问答（不涉及数据库查询）则正常作答即可。

SQL 生成规则（极重要，必须严格遵守）：
7. 【字段精确性 - 绝对红线】生成 SQL 之前，必须先调用 get_columns 获取目标表的真实字段列表。SQL 中的每一个字段名必须与 get_columns 返回的 field 字段完全一致（区分大小写）。不得自行拼凑、缩写或联想字段名（例如字段是 channel 就必须写 channel，不得写成 pay_channel）。
8. 生成 SQL 时禁止使用 "database.table" 格式的限定前缀，只写表名本身。
9. 报告结果时，连接名/ID 和数据库名必须严格来自同一个 get_tables 调用的实际参数。禁止将 A 连接的 connectionId 与 B 连接的 dbName 混搭。
10. 如果有多个名称相似的数据库，请明确告诉用户目标表具体位于哪个数据库。
11. 【关键】每个 SQL 代码块的第一行必须添加上下文声明注释，格式严格为：-- @context connectionId=<连接ID> dbName=<数据库名>。connectionId 和 dbName 必须来自同一个成功的 get_tables 调用（即你在该调用中传入的实际参数值）。示例：
\`\`\`sql
-- @context connectionId=1770778676549 dbName=mkefu_test
SELECT * FROM users WHERE status = 1;
\`\`\`

当前存在的连接：[${connList || '无连接'}]`
            });
        }
        return systemMessages;
    }, [contextLevel]);

    // 记录所有成功的 get_tables 调用结果，用于表级精确匹配
    const toolContextMapRef = useRef<Map<string, { connectionId: string; dbName: string; tables: string[] }>>(new Map());

    const executeLocalTools = useCallback(async (toolCalls: AIToolCall[], currentAsstMsgId: string) => {
        const currentAsstMsg = (useStore.getState().aiChatHistory[sid] || []).find(m => m.id === currentAsstMsgId);

        // 【全局轮次熔断】防止模型（如 DeepSeek）在已生成答案后仍无限循环调用工具
        const MAX_TOOL_CALL_ROUNDS = 15;
        totalToolRoundRef.current += 1;
        if (totalToolRoundRef.current > MAX_TOOL_CALL_ROUNDS) {
            updateAIChatMessage(sid, currentAsstMsgId, { loading: false, phase: 'idle' });
            useStore.getState().addAIChatMessage(sid, {
                id: genId(), role: 'assistant',
                content: `⚠️ 工具调用已达 ${MAX_TOOL_CALL_ROUNDS} 轮上限，自动终止循环。如需继续探索，请发送新的消息。`,
                timestamp: Date.now(),
            });
            setSending(false);
            return;
        }

        const results: AIChatMessage[] = [];
        // 【串行逐条执行 + 实时写入 store】
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
                                    if (dNames.length > 50) dNames = [...dNames.slice(0, 50), '...(截断)'];
                                    resStr = JSON.stringify(dNames);
                                    success = true;
                                } else {
                                    resStr = dbRes?.message || 'Failed to fetch DBs';
                                }
                            } catch (e: unknown) {
                                resStr = `获取数据库列表失败: ${getErrorMessage(e)}`;
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
                                    if (tNames.length > 150) tNames = [...tNames.slice(0, 150), '...(截断)'];
                                    resStr = JSON.stringify(tNames);
                                    success = true;
                                    // 🔑 记录已验证的上下文参数和表列表（用于后续表级精确匹配）
                                    toolContextMapRef.current.set(`${args.connectionId}:${safeDbName}`, {
                                        connectionId: args.connectionId,
                                        dbName: safeDbName,
                                        tables: tNames.filter((t: string) => t !== '...(截断)')
                                    });
                                } else { resStr = tbRes?.message || 'Failed to fetch Tables'; }
                            } catch (e: unknown) {
                                resStr = `获取表列表失败: ${getErrorMessage(e)}`;
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
                                    // 只保留关键字段信息，减少 token 占用
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
                                    // ⚠️ 在工具返回结果中直接注入强制警告，确保模型使用精确字段名
                                    const fieldNames = cols.map((c) => c.field).join(', ');
                                    resStr = `⚠️ 以下为 ${safeTable} 表的真实字段列表。生成 SQL 时只能使用这些 field 值作为列名，必须原样使用，禁止修改、缩写或自行拼凑字段名。\n可用字段：${fieldNames}\n详细信息：${JSON.stringify(cols)}`;
                                    success = true;
                                } else { resStr = colRes?.message || 'Failed to fetch columns'; }
                            } catch (e: unknown) {
                                resStr = `获取字段列表失败: ${getErrorMessage(e)}`;
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
                                resStr = `获取建表语句失败: ${getErrorMessage(e)}`;
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
                                // 安全级别检查
                                const Service = AIService;
                                if (Service?.AICheckSQL) {
                                    const check = await Service.AICheckSQL(safeSql);
                                    if (!check.allowed) {
                                        resStr = `安全策略拦截：当前安全级别不允许执行 ${check.operationType} 类型的 SQL。请将 SQL 展示给用户，让用户手动执行。`;
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
                                } else { resStr = qRes?.message || 'SQL 执行失败'; }
                            } catch (e: unknown) {
                                resStr = `SQL 执行异常: ${getErrorMessage(e)}`;
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

            // 【实时写入】每执行完一条立即写入 store，让 UI 能实时看到进度打勾
            useStore.getState().addAIChatMessage(sid, toolResultMsg);

            // 延迟 150ms，给 UI 渲染时间，创造“逐个完成”的视觉节奏
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        // 智能熔断：只计连续失败轮次，成功则重置
        const anySuccess = results.some(r => r.success === true);
        if (anySuccess) {
            toolCallRoundRef.current = 0;
        } else {
            toolCallRoundRef.current += 1;
            if (toolCallRoundRef.current >= 3) {
                useStore.getState().addAIChatMessage(sid, {
                    id: genId(), role: 'assistant',
                    content: '⚠️ 探针连续 3 轮执行失败，自动终止。请检查连接状态后重试。',
                    timestamp: Date.now(),
                });
                setSending(false);
                return;
            }
        }
        try {
            // 【过渡状态】工具执行完毕，将上一条消息的 loading 关闭（消除闪烁光标）
            updateAIChatMessage(sid, currentAsstMsgId, { loading: false, phase: 'idle' });

            // 插入过渡气泡
            const chainConnectingMsg: AIChatMessage = {
                id: genId(), role: 'assistant', phase: 'connecting', 
                content: '汇总探针执行结果中',
                timestamp: Date.now(), loading: true,
            };
            useStore.getState().addAIChatMessage(sid, chainConnectingMsg);
            
            // 模拟人类视角的平滑多段过渡
            const safeUpdateTransition = (text: string) => {
                const currentMsg = useStore.getState().aiChatHistory[sid]?.find(m => m.id === chainConnectingMsg.id);
                // 只有当消息仍然处于连接过渡态时才允许修改文本；如果模型已经开始吐出思考、正文、工具或结束，直接退出
                if (currentMsg && currentMsg.phase === 'connecting' && currentMsg.loading) {
                    updateAIChatMessage(sid, chainConnectingMsg.id, { content: text });
                }
            };

            setTimeout(() => safeUpdateTransition('向模型回传运行时数据'), 200);
            setTimeout(() => safeUpdateTransition('模型大脑深度推理中'), 500);
            setTimeout(() => safeUpdateTransition('等待下发操作指令'), 1200);
            setTimeout(() => safeUpdateTransition('正在深度思考链路与逻辑'), 3000);

            setSending(true);
            const currentHistory = useStore.getState().aiChatHistory[sid] || [];
            // 过滤掉 connecting 占位消息，不发给模型
            const messagesPayload = currentHistory.filter(m => m.phase !== 'connecting').map(toChatPayload);
            const sysMessages = await buildSystemContextMessages();

            let finalMessagesPayload = messagesPayload;
            // 在这里加入长度检查和自动摘要（带上动态限额）
            const dynamicMaxLimit = getDynamicMaxContextChars(activeProvider?.model);
            const summary = await compressContextIfNeeded(sid, messagesPayload, dynamicMaxLimit);
            if (summary) {
                 const compressedMsg: AIChatMessage = {
                     id: genId(), role: 'assistant', content: `【自动记忆重塑】已将超长历史探针数据和对话压缩为摘要：\n\n${summary}`, timestamp: Date.now() - 1000
                 };
                 const continueMsg: AIChatMessage = {
                     id: genId(), role: 'user', content: '请根据上述最新状态与探索结果，继续完成你先前未竟的分析或执行下一步。', timestamp: Date.now() - 500
                 };
                 useStore.getState().replaceAIChatHistory(sid, [compressedMsg, continueMsg, chainConnectingMsg]);
                 finalMessagesPayload = [
                     { role: 'assistant', content: compressedMsg.content },
                     { role: 'user', content: continueMsg.content }
                 ];
            }

            const allMessages = [...sysMessages, ...finalMessagesPayload];

            // 【软收敛】超过 10 轮工具调用后，不再传递 tools 参数，从物理层面强制模型只能用文本回答
            const SOFT_LIMIT_ROUNDS = 10;
            const chainTools = totalToolRoundRef.current >= SOFT_LIMIT_ROUNDS ? [] : LOCAL_TOOLS;

            const Service = AIService;
            if (Service?.AIChatStream) {
                await Service.AIChatStream(sid, allMessages, chainTools);
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages, chainTools);
                const errR = result?.error || '未知错误';
                const errC = sanitizeErrorMsg(errR);
                useStore.getState().addAIChatMessage(sid, {
                    id: genId(), role: 'assistant',
                    content: result?.success ? result.content : `❌ ${errC}`,
                    rawError: (!result?.success && errC !== errR) ? errR : undefined,
                    timestamp: Date.now(),
                });
                setSending(false);
            }
        } catch (e) {
            console.error('Failed to chain tool call', e);
            setSending(false);
        }
    }, [sid, buildSystemContextMessages]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if ((!text && draftImages.length === 0) || sending) return;

        // 前置校验：必须配置供应商且选择模型后才能发送
        if (!activeProvider) {
            setComposerNotice(buildMissingProviderNotice());
            return;
        }
        if (!activeProvider.model || !activeProvider.model.trim()) {
            setComposerNotice(buildMissingModelNotice());
            return;
        }
        setComposerNotice(null);

        toolCallRoundRef.current = 0; // 重置工具调用轮次计数
        totalToolRoundRef.current = 0; // 重置总轮次计数
        nudgeCountRef.current = 0;     // 重置催促计数

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

        // 【过渡状态 2】上下文已组装完成，即将接入模型
        updateAIChatMessage(sid, connectingMsg.id, { content: '模型接入中' });

        const chatMessages = [...messages, userMsg].map(toChatPayload);

        let finalMessagesPayload = chatMessages;
        const dynamicMaxLimit = getDynamicMaxContextChars(activeProvider?.model);
        const summary = await compressContextIfNeeded(sid, chatMessages, dynamicMaxLimit);
        if (summary) {
            // 清理原有历史，保留系统生成的总结记录和当前的 userMsg 以及 connectingMsg
            const compressedMsg: AIChatMessage = {
                id: genId(), role: 'assistant', content: `【自动记忆重塑】已将超长历史压缩为摘要：\n\n${summary}`, timestamp: Date.now() - 1000
            };
            useStore.getState().replaceAIChatHistory(sid, [compressedMsg, userMsg, connectingMsg]);
            finalMessagesPayload = [
                { role: 'assistant', content: compressedMsg.content },
                { role: 'user', content: userMsg.content, images: userMsg.images }
            ];
        }

        const allMessages = [...systemMessages, ...finalMessagesPayload];

        // 【过渡状态 3】大脑唤醒
        updateAIChatMessage(sid, connectingMsg.id, { content: '唤醒推理引擎中' });

        // 【过渡状态 4】最后一步，等待第一字节返回
        updateAIChatMessage(sid, connectingMsg.id, { content: '等待模型响应' });

        try {
            const Service = AIService;
            if (Service?.AIChatStream) {
                await Service.AIChatStream(sid, allMessages, LOCAL_TOOLS);
            } else if (Service?.AIChatSend) {
                const result = await Service.AIChatSend(allMessages, LOCAL_TOOLS);
                const errR2 = result?.error || '未知错误';
                const errC2 = sanitizeErrorMsg(errR2);
                const assistantMsg: AIChatMessage = {
                    id: genId(), role: 'assistant',
                    content: result?.success ? result.content : `❌ ${errC2}`,
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
                    content: '❌ AI Service 未就绪',
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
                content: `❌ 发送失败: ${cleanE2}`,
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
                
                // 仅更新 ghost 虚线位置，通过绝对定位规避重排
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
            // 拖拽结束时才提交最终宽度到 React state 和外层回调
            setPanelWidth(dragWidthRef.current);
            onWidthChange?.(dragWidthRef.current);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // 拖拽期间关闭指针事件以避免下方 Monaco Editor 捕获 hover 或重绘，极大提升性能
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none'; // 关键性能优化
        
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';
        };
    }, [isResizing, onWidthChange]);

    // 回推幽灵上下文：基于 get_tables 记录进行表级精确匹配（useMemo 缓存，避免每帧重算）
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

    // useMemo 缓存：避免内联闭包击穿子组件 memo
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
