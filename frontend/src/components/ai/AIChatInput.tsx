import React from 'react';
import { Input, Select, AutoComplete, Tooltip, Modal, Checkbox, Spin, message, Button, Tag } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { DatabaseOutlined, SendOutlined, TableOutlined, SearchOutlined, PictureOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { useStore } from '../../store';
import { DBGetTables, DBShowCreateTable, DBGetDatabases, DBGetColumns } from '@compat/javanaviApp';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { AIComposerNotice } from '../../utils/aiComposerNotice';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import type { RpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { resolveAITableSchemaToolResult } from '../../utils/aiTableSchemaTool';
import { getAIChatSendShortcutLabel } from '../../utils/aiChatSendShortcut';
import type { ShortcutBinding } from '../../utils/shortcuts';
import type { AIProviderConfig, ConnectionConfig } from '../../types';
import { translate, type I18nKey, type I18nParams } from '../../i18n';

type ActiveChatContext = {
    connectionId: string;
    dbName?: string;
} | null;

type QueryRow = Record<string, unknown>;

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const getFirstRowStringValue = (row: QueryRow): string => {
    const firstValue = Object.values(row)[0];
    return firstValue === undefined || firstValue === null ? '' : String(firstValue);
};

interface AIChatInputProps {
    input: string;
    setInput: (val: string) => void;
    draftImages: string[];
    setDraftImages: React.Dispatch<React.SetStateAction<string[]>>;
    sending: boolean;
    onSend: () => void;
    onStop: () => void;
    handleKeyDown: (e: React.KeyboardEvent) => void;
    activeConnName: string;
    activeContext: ActiveChatContext;
    activeProvider: AIProviderConfig | null;
    dynamicModels: string[];
    loadingModels: boolean;
    sendShortcutBinding: ShortcutBinding;
    composerNotice?: AIComposerNotice | null;
    onModelChange: (val: string) => void;
    onFetchModels: () => void;
    textareaRef: React.RefObject<HTMLTextAreaElement | TextAreaRef>;
    darkMode: boolean;
    textColor: string;
    mutedColor: string;
    overlayTheme: OverlayWorkbenchTheme;
    contextUsageChars?: number;
    maxContextChars?: number;
}

export const AIChatInput: React.FC<AIChatInputProps> = ({
    input, setInput, draftImages, setDraftImages, sending, onSend, onStop, handleKeyDown,
    activeConnName, activeContext, activeProvider, dynamicModels, loadingModels,
    sendShortcutBinding, composerNotice,
    onModelChange, onFetchModels, textareaRef, darkMode, textColor, mutedColor, overlayTheme,
    contextUsageChars, maxContextChars
}) => {
    const language = useStore(state => state.language);
    const t = React.useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
    const [contextOpen, setContextOpen] = React.useState(false);
    const [contextLoading, setContextLoading] = React.useState(false);
    const [contextTables, setContextTables] = React.useState<{name: string}[]>([]);
    const [selectedTableKeys, setSelectedTableKeys] = React.useState<string[]>([]);
    const [searchText, setSearchText] = React.useState('');
    const [appendingContext, setAppendingContext] = React.useState(false);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            if (file.type.indexOf('image') !== -1) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        setDraftImages(prev => [...prev, event.target!.result as string]);
                    }
                };
                reader.readAsDataURL(file);
            }
        });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const [dbList, setDbList] = React.useState<string[]>([]);
    const [selectedDbName, setSelectedDbName] = React.useState<string>('');

    const filteredTables = contextTables.filter(t => t.name.toLowerCase().includes(searchText.toLowerCase()));
    const [contextExpanded, setContextExpanded] = React.useState(false);
    const composerNoticePalette = React.useMemo(() => {
        if (composerNotice?.tone === 'error') {
            return darkMode
                ? {
                    background: 'rgba(255,120,117,0.12)',
                    borderColor: 'rgba(255,120,117,0.24)',
                    iconColor: '#ff7875',
                }
                : {
                    background: 'rgba(255,77,79,0.08)',
                    borderColor: 'rgba(255,77,79,0.16)',
                    iconColor: '#ff4d4f',
                };
        }

        return darkMode
            ? {
                background: 'rgba(250,173,20,0.12)',
                borderColor: 'rgba(250,173,20,0.22)',
                iconColor: '#ffd666',
            }
            : {
                background: 'rgba(250,173,20,0.08)',
                borderColor: 'rgba(250,173,20,0.18)',
                iconColor: '#d48806',
            };
    }, [composerNotice, darkMode]);

    // Slash commands
    const [showSlashMenu, setShowSlashMenu] = React.useState(false);
    const [slashFilter, setSlashFilter] = React.useState('');
    const slashCommands = React.useMemo(() => [
        { cmd: '/query',    label: t('ai.input.slash.query.label'),    desc: t('ai.input.slash.query.desc'),    prompt: t('ai.input.slash.query.prompt') },
        { cmd: '/sql',      label: t('ai.input.slash.sql.label'),      desc: t('ai.input.slash.sql.desc'),      prompt: t('ai.input.slash.sql.prompt') },
        { cmd: '/explain',  label: t('ai.input.slash.explain.label'),  desc: t('ai.input.slash.explain.desc'),  prompt: t('ai.input.slash.explain.prompt') },
        { cmd: '/optimize', label: t('ai.input.slash.optimize.label'), desc: t('ai.input.slash.optimize.desc'), prompt: t('ai.input.slash.optimize.prompt') },
        { cmd: '/schema',   label: t('ai.input.slash.schema.label'),   desc: t('ai.input.slash.schema.desc'),   prompt: t('ai.input.slash.schema.prompt') },
        { cmd: '/index',    label: t('ai.input.slash.index.label'),    desc: t('ai.input.slash.index.desc'),    prompt: t('ai.input.slash.index.prompt') },
        { cmd: '/diff',     label: t('ai.input.slash.diff.label'),     desc: t('ai.input.slash.diff.desc'),     prompt: t('ai.input.slash.diff.prompt') },
        { cmd: '/mock',     label: t('ai.input.slash.mock.label'),     desc: t('ai.input.slash.mock.desc'),     prompt: t('ai.input.slash.mock.prompt') },
    ], [t]);
    const filteredSlashCmds = slashCommands.filter(c => c.cmd.startsWith(slashFilter.toLowerCase()));

    const aiContexts = useStore(state => state.aiContexts);
    const addAIContext = useStore(state => state.addAIContext);
    const removeAIContext = useStore(state => state.removeAIContext);

    const connectionKey = activeContext?.connectionId ? `${activeContext.connectionId}:${activeContext.dbName || ''}` : 'default';
    const activeContextItems = aiContexts[connectionKey] || [];

    const fetchTablesForDb = async (dbName: string, connConfig: ConnectionConfig | RpcConnectionConfig) => {
        setContextLoading(true);
        setSelectedDbName(dbName);
        try {
            const res = await DBGetTables(buildRpcConnectionConfig(connConfig), dbName);
            if (res.success && Array.isArray(res.data)) {
                setContextTables(res.data.map(r => ({ name: getFirstRowStringValue(r as QueryRow) })));
            } else {
                message.error(t('ai.input.message.fetchTablesFailed', { message: res.message || '' }));
                setContextTables([]);
            }
        } catch (e: unknown) {
            message.error(getErrorMessage(e));
            setContextTables([]);
        } finally {
            setContextLoading(false);
        }
    };

    const handleOpenContext = async () => {
        if (!activeContext?.connectionId) {
            message.warning(t('ai.input.message.selectDatabaseContext'));
            return;
        }
        const conn = useStore.getState().connections.find(c => c.id === activeContext.connectionId);
        if (!conn) return;

        setContextOpen(true);
        setContextLoading(true);
        setSearchText('');
        // Store dbName::tableName composite keys
        setSelectedTableKeys(activeContextItems.map(c => `${c.dbName}::${c.tableName}`));

        try {
            // Fetch databases
            const dbRes = await DBGetDatabases(buildRpcConnectionConfig(conn.config));
            if (dbRes.success && Array.isArray(dbRes.data)) {
                const databases = dbRes.data.map((r) => getFirstRowStringValue(r as QueryRow));
                setDbList(databases);
            }

            // Fetch tables for the active contextual database
            const initDbName = activeContext.dbName || '';
            setSelectedDbName(initDbName);
            const tablesRes = await DBGetTables(buildRpcConnectionConfig(conn.config), initDbName);
            if (tablesRes.success && Array.isArray(tablesRes.data)) {
                setContextTables(tablesRes.data.map((r) => ({ name: getFirstRowStringValue(r as QueryRow) })));
            } else {
                setContextTables([]);
            }
        } catch (e: unknown) {
            message.error(getErrorMessage(e));
        } finally {
            setContextLoading(false);
        }
    };

    const handleAppendContext = async () => {
        if (!activeContext) return;
        const conn = useStore.getState().connections.find(c => c.id === activeContext.connectionId);
        if (!conn) return;

        setAppendingContext(true);
        try {
            let addedCount = 0;
            let removedCount = 0;

            for (const cx of activeContextItems) {
                const key = `${cx.dbName}::${cx.tableName}`;
                if (!selectedTableKeys.includes(key)) {
                    removeAIContext(connectionKey, cx.dbName, cx.tableName);
                    removedCount++;
                }
            }

            for (const key of selectedTableKeys) {
                const [dbName, tableName] = key.split('::');
                if (!dbName || !tableName) continue;

                if (activeContextItems.find(c => c.dbName === dbName && c.tableName === tableName)) {
                    continue;
                }
                const rpcConfig = buildRpcConnectionConfig(conn.config);
                const schemaResult = await resolveAITableSchemaToolResult({
                    tableName,
                    fetchDDL: () => DBShowCreateTable(rpcConfig, dbName, tableName),
                    fetchColumns: () => DBGetColumns(rpcConfig, dbName, tableName),
                });
                if (!schemaResult.success) {
                    message.error(t('ai.input.message.tableSchemaFailed', { db: dbName, table: tableName, message: schemaResult.content }));
                }

                if (schemaResult.success && schemaResult.content) {
                    addAIContext(connectionKey, {
                        dbName: dbName,
                        tableName: tableName,
                        ddl: schemaResult.content
                    });
                    addedCount++;
                }
            }
            if (addedCount > 0 || removedCount > 0) {
                if (addedCount > 0 && removedCount === 0) {
                    message.success(t('ai.input.message.contextAdded', { count: addedCount }));
                } else if (removedCount > 0 && addedCount === 0) {
                    message.success(t('ai.input.message.contextRemoved', { count: removedCount }));
                } else {
                    message.success(t('ai.input.message.contextSynced', { added: addedCount, removed: removedCount }));
                }
                if (addedCount > 0) setContextExpanded(true);
            } else {
                message.info(t('ai.input.message.noContextChanges'));
            }
            setContextOpen(false);
        } catch (e: unknown) {
            message.error(getErrorMessage(e));
        } finally {
            setAppendingContext(false);
        }
    };

    return (
        <div className="ai-chat-input-area" style={{ borderTop: 'none', padding: '12px 16px 20px' }}>
            <div className="ai-chat-input-wrapper" style={{
                borderColor: 'transparent',
                background: 'transparent',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                padding: '8px 4px 8px'
            }}>
                <div className="ai-chat-input-preview-area" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {activeContextItems.length > 0 && (
                        <Tag
                            onClick={() => setContextExpanded(!contextExpanded)}
                            style={{ background: darkMode ? 'rgba(24, 144, 255, 0.15)' : 'rgba(24, 144, 255, 0.08)', border: 'none', color: '#1890ff', borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, margin: 0, cursor: 'pointer', transition: 'all 0.3s' }}
                        >
                            <span style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <DatabaseOutlined /> {t('ai.input.contextBadge', { count: activeContextItems.length })} {contextExpanded ? '▴' : '▾'}
                            </span>
                        </Tag>
                    )}

                    {contextExpanded && activeContextItems.map((ctx, idx) => (
                        <Tag
                            key={`ctx-${idx}`}
                            closable
                            onClose={(e) => { e.preventDefault(); removeAIContext(connectionKey, ctx.dbName, ctx.tableName); }}
                            style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', border: 'none', color: textColor, borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}
                        >
                            <span style={{ fontSize: 13 }}>🗄️ {ctx.tableName}</span>
                        </Tag>
                    ))}
                    {draftImages.map((b64, i) => (
                        <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 6, overflow: 'hidden', border: overlayTheme.shellBorder }}>
                            <img src={b64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={t('ai.input.draftImageAlt', { index: i + 1 })} />
                            <div
                                onClick={() => setDraftImages(prev => prev.filter((_, idx) => idx !== i))}
                                style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10 }}
                            >
                                ✕
                            </div>
                        </div>
                    ))}
                </div>
                {composerNotice && (
                    <div
                        data-ai-chat-composer-notice="true"
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '8px 10px',
                            borderRadius: 12,
                            background: composerNoticePalette.background,
                            border: `1px solid ${composerNoticePalette.borderColor}`,
                        }}
                    >
                        <ExclamationCircleFilled style={{ color: composerNoticePalette.iconColor, fontSize: 14, marginTop: 1, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: textColor, lineHeight: 1.4 }}>
                                {composerNotice.title}
                            </div>
                            <div style={{ fontSize: 11, color: mutedColor, lineHeight: 1.5, marginTop: 2, wordBreak: 'break-word' }}>
                                {composerNotice.description}
                            </div>
                        </div>
                    </div>
                )}
                <div data-ai-chat-composer-input="true" style={{ position: 'relative' }}>
                    {showSlashMenu && filteredSlashCmds.length > 0 && (
                        <div style={{
                            position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
                            background: darkMode ? '#2a2a2a' : '#fff',
                            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
                            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 100,
                            maxHeight: 220, overflowY: 'auto', padding: 4
                        }}>
                            {filteredSlashCmds.map(cmd => (
                                <div
                                    key={cmd.cmd}
                                    style={{
                                        padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => {
                                        setInput(cmd.prompt);
                                        setShowSlashMenu(false);
                                        setSlashFilter('');
                                        textareaRef.current?.focus();
                                    }}
                                >
                                    <span style={{ fontSize: 14, fontWeight: 600, color: textColor, minWidth: 80 }}>{cmd.cmd}</span>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: textColor }}>{cmd.label}</span>
                                    <span style={{ fontSize: 11, color: mutedColor, marginLeft: 'auto' }}>{cmd.desc}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <Input.TextArea
                        onPaste={(e) => {
                            const items = e.clipboardData?.items;
                            if (!items) return;
                            for (let i = 0; i < items.length; i++) {
                                if (items[i].type.indexOf('image') !== -1) {
                                    e.preventDefault();
                                    const blob = items[i].getAsFile();
                                    if (blob) {
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                            if (event.target?.result) {
                                                setDraftImages(prev => [...prev, event.target!.result as string]);
                                            }
                                        };
                                        reader.readAsDataURL(blob);
                                    }
                                }
                            }
                        }}
                        ref={textareaRef as React.Ref<TextAreaRef>}
                        value={input}
                        onChange={(e) => {
                            const val = e.target.value;
                            setInput(val);
                            // Slash command detection
                            if (val.startsWith('/')) {
                                setSlashFilter(val.split(/\s/)[0]);
                                setShowSlashMenu(true);
                            } else {
                                setShowSlashMenu(false);
                                setSlashFilter('');
                            }
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={t('ai.input.placeholder', { shortcut: getAIChatSendShortcutLabel(sendShortcutBinding, language) })}
                        variant="borderless"
                        autoSize={{ minRows: 1, maxRows: 8 }}
                        style={{ color: textColor, width: '100%', padding: 0, resize: 'none' }}
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {activeConnName && (
                            <Tooltip title={t('ai.input.currentContextTooltip')}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, padding: '2px 8px', borderRadius: 12,
                                    background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    color: overlayTheme.mutedText, cursor: 'default'
                                }}>
                                    <DatabaseOutlined style={{ fontSize: 10 }} />
                                    <span style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {activeConnName}{activeContext?.dbName ? ` / ${activeContext.dbName}` : ''}
                                    </span>
                                </div>
                            </Tooltip>
                        )}

                        {activeProvider && (
                            <Select
                                size="small"
                                variant="filled"
                                value={activeProvider.model || undefined}
                                onChange={onModelChange}
                                onDropdownVisibleChange={(open) => {
                                    if (open && dynamicModels.length === 0 && (activeProvider.models || []).length === 0) {
                                        onFetchModels();
                                    }
                                }}
                                loading={loadingModels}
                                options={(dynamicModels.length > 0 ? dynamicModels : (activeProvider.models || [])).map((m: string) => ({ label: m, value: m }))}
                                style={{ width: 130, fontSize: 11, background: 'transparent' }}
                                dropdownStyle={{ minWidth: 200 }}
                                showSearch
                                placeholder={t('ai.input.modelPlaceholder')}
                            />
                        )}

                        {contextUsageChars !== undefined && maxContextChars !== undefined && (
                            <Tooltip title={t('ai.input.contextUsageTooltip', { limit: (maxContextChars/1000).toFixed(0) })}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: 10, padding: '2px 6px', borderRadius: 12, border: '1px solid transparent',
                                    background: contextUsageChars > maxContextChars * 0.8 ? (darkMode ? 'rgba(250, 173, 20, 0.1)' : 'rgba(250, 173, 20, 0.08)') : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                    borderColor: contextUsageChars > maxContextChars * 0.8 ? 'rgba(250, 173, 20, 0.3)' : 'transparent',
                                    color: contextUsageChars > maxContextChars * 0.8 ? '#faad14' : overlayTheme.mutedText, cursor: 'default',
                                    transition: 'all 0.3s'
                                }}>
                                    <span>🧠 {(contextUsageChars / 1000).toFixed(1)}k / {(maxContextChars / 1000).toFixed(0)}k</span>
                                </div>
                            </Tooltip>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleImageUpload}
                        />
                        <Tooltip title={t('ai.input.uploadImageTooltip')}>
                            <Button
                                type="text"
                                icon={<PictureOutlined style={{ fontSize: 16 }} />}
                                onClick={() => fileInputRef.current?.click()}
                                style={{ color: overlayTheme.mutedText, border: 'none', background: 'transparent', padding: '0 4px', height: 26 }}
                                onMouseEnter={e => e.currentTarget.style.color = textColor}
                                onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText}
                            />
                        </Tooltip>
                        <Tooltip title={t('ai.input.linkTableContextTooltip')}>
                            <Button
                                type="text"
                                icon={<TableOutlined style={{ fontSize: 16 }} />}
                                onClick={handleOpenContext}
                                style={{ color: overlayTheme.mutedText, border: 'none', background: 'transparent', padding: '0 4px', height: 26 }}
                                onMouseEnter={e => e.currentTarget.style.color = textColor}
                                onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText}
                            />
                        </Tooltip>
                        {sending ? (
                        <button
                            className="ai-chat-send-btn ai-chat-stop-btn"
                            onClick={onStop}
                            title={t('ai.input.stopTitle')}
                            style={{
                                background: 'rgba(255,77,79,0.1)',
                                color: '#ff4d4f', border: '1px solid rgba(255,77,79,0.2)',
                                width: 26, height: 26, borderRadius: 6, padding: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0
                            }}
                        >
                            <div style={{ width: 10, height: 10, background: 'currentColor', borderRadius: 2 }} />
                        </button>
                    ) : (
                        <button
                            className="ai-chat-send-btn"
                            onClick={() => onSend()}
                            disabled={!input.trim() && draftImages.length === 0}
                            title={t('ai.input.sendTitle')}
                            style={{
                                background: (input.trim() || draftImages.length > 0) ? overlayTheme.iconBg : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                                color: (input.trim() || draftImages.length > 0) ? overlayTheme.iconColor : mutedColor,
                                width: 26, height: 26, borderRadius: 6, border: 'none', padding: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (input.trim() || draftImages.length > 0) ? 'pointer' : 'not-allowed', flexShrink: 0
                            }}
                        >
                            <SendOutlined />
                        </button>
                    )}
                    </div>
                </div>
            </div>

            <Modal
                title={<span style={{ color: textColor }}>{t('ai.input.contextModalTitle')}</span>}
                open={contextOpen}
                onCancel={() => setContextOpen(false)}
                onOk={handleAppendContext}
                confirmLoading={appendingContext}
                okText={t('ai.input.syncSelectedTables')}
                cancelText={t('common.cancel')}
                centered
                styles={{
                    content: { background: darkMode ? '#1e1e1e' : '#ffffff', border: overlayTheme.shellBorder },
                    header: { background: darkMode ? '#1e1e1e' : '#ffffff', borderBottom: overlayTheme.shellBorder },
                    body: { padding: '20px 24px' }
                }}
            >
                <Spin spinning={contextLoading}>
                    <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                        {dbList.length > 0 && (
                            <Select
                                value={selectedDbName}
                                onChange={val => {
                                    const c = useStore.getState().connections.find(conn => conn.id === activeContext?.connectionId);
                                    if (c) fetchTablesForDb(val, c.config);
                                }}
                                options={dbList.map(d => ({ label: d, value: d }))}
                                style={{ width: 160, flexShrink: 0 }}
                                placeholder={t('ai.input.switchDatabasePlaceholder')}
                                showSearch
                            />
                        )}
                        <Input
                            placeholder={t('ai.input.searchTablesPlaceholder')}
                            prefix={<SearchOutlined style={{ color: overlayTheme.mutedText }} />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            style={{ background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: 'none', flexGrow: 1 }}
                        />
                    </div>
                    {filteredTables.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, paddingBottom: 12, marginBottom: 8 }}>
                                <Checkbox
                                    indeterminate={
                                        filteredTables.length > 0 &&
                                        filteredTables.some(t => selectedTableKeys.includes(`${selectedDbName}::${t.name}`)) &&
                                        !filteredTables.every(t => selectedTableKeys.includes(`${selectedDbName}::${t.name}`))
                                    }
                                    checked={filteredTables.length > 0 && filteredTables.every(t => selectedTableKeys.includes(`${selectedDbName}::${t.name}`))}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            const newSelected = new Set([...selectedTableKeys, ...filteredTables.map(t => `${selectedDbName}::${t.name}`)]);
                                            setSelectedTableKeys(Array.from(newSelected));
                                        } else {
                                            const filteredKeys = filteredTables.map(t => `${selectedDbName}::${t.name}`);
                                            setSelectedTableKeys(selectedTableKeys.filter(key => !filteredKeys.includes(key)));
                                        }
                                    }}
                                    style={{ color: textColor, fontWeight: 'bold' }}
                                >
                                    {t('ai.input.selectAllMatchedTables', { count: filteredTables.length })}
                                </Checkbox>
                                <Button
                                    type="link"
                                    size="small"
                                    style={{ padding: 0, height: 'auto', fontSize: 13 }}
                                    onClick={() => {
                                        const filteredKeys = filteredTables.map(t => `${selectedDbName}::${t.name}`);
                                        const remainingSelected = selectedTableKeys.filter(key => !filteredKeys.includes(key));
                                        const toAdd = filteredKeys.filter(key => !selectedTableKeys.includes(key));
                                        setSelectedTableKeys([...remainingSelected, ...toAdd]);
                                    }}
                                >
                                    {t('ai.input.invertMatchedTables')}
                                </Button>
                            </div>
                            <div style={{ maxHeight: 300, overflowY: 'auto', margin: '0 -24px', padding: '0 24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {filteredTables.map(t => {
                                        const key = `${selectedDbName}::${t.name}`;
                                        const isSelected = selectedTableKeys.includes(key);
                                        return (
                                        <div
                                            key={key}
                                            style={{
                                                padding: '6px 10px',
                                                borderRadius: 6,
                                                transition: 'background 0.2s',
                                                cursor: 'pointer'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            onClick={(e) => {
                                                // If click originated from the checkbox input itself, let its onChange handle it to avoid duplicate toggle
                                                if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
                                                if (isSelected) {
                                                    setSelectedTableKeys(selectedTableKeys.filter(k => k !== key));
                                                } else {
                                                    setSelectedTableKeys([...selectedTableKeys, key]);
                                                }
                                            }}
                                        >
                                            <Checkbox
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedTableKeys([...selectedTableKeys, key]);
                                                    else setSelectedTableKeys(selectedTableKeys.filter(k => k !== key));
                                                }}
                                                style={{ color: textColor, width: '100%' }}
                                            >
                                                <span style={{ fontSize: 13, userSelect: 'none' }}>{t.name}</span>
                                            </Checkbox>
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '40px 0', textAlign: 'center', color: overlayTheme.mutedText }}>
                            {t('ai.input.noMatchedTables', { search: searchText })}
                        </div>
                    )}
                </Spin>
            </Modal>
        </div>
    );
};
