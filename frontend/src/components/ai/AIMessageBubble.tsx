import * as AIService from '@compat/aiService';
import React, { useState, useEffect, useRef } from 'react';
import { Button, Tooltip, message } from 'antd';
import { UserOutlined, RobotOutlined, EditOutlined, ReloadOutlined, DeleteOutlined, CheckOutlined, CopyOutlined, PlayCircleOutlined, ApiOutlined, LoadingOutlined, CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { AIChatMessage, AIToolCall } from '../../types';
import type { RpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { useStore } from '../../store';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { normalizeAiMarkdown } from '../../utils/aiMarkdown';
import { buildAIReadonlyPreviewSQL } from '../../utils/aiSqlLimit';
import { translate, type I18nKey, type I18nParams } from '../../i18n';

// 🔧 性能优化：将 ReactMarkdown 包装为 Memo 组件并提取固定的 plugins
const remarkPlugins = [remarkGfm];

type QueryRow = Record<string, unknown>;
type CodeLanguageMatch = RegExpExecArray;
type CodeChildren = React.ReactNode;
type MarkdownCodeProps = React.ComponentProps<'code'> & {
    inline?: boolean;
    node?: unknown;
};

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const syntaxThemeStyle = (darkMode: boolean): Record<string, React.CSSProperties> => (
    darkMode ? vscDarkPlus : vs
);

const useAIText = () => {
    const language = useStore(state => state.language);
    return React.useCallback((key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
};

const MemoizedMarkdown = React.memo(({ 
    content, 
    darkMode, 
    overlayTheme, 
    activeConnectionConfig, 
    activeConnectionId, 
    activeDbName 
}: {
    content: string;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    activeConnectionConfig?: RpcConnectionConfig;
    activeConnectionId?: string;
    activeDbName?: string;
}) => {
    const normalizedContent = React.useMemo(() => normalizeAiMarkdown(content), [content]);
    // 缓存 components 对象，避免每次渲染都生成新的函数引用击穿内部子组件的 memo
    const components = React.useMemo(() => ({
        code({ inline, className, children, ...props }: MarkdownCodeProps) {
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match && match[1] === 'mermaid') {
                return <MermaidRenderer chart={String(children).replace(/\n$/, '')} darkMode={darkMode} />;
            }
            return !inline && match ? (
                <AIBlockHashRender match={match} darkMode={darkMode} overlayTheme={overlayTheme} children={children} activeConnectionConfig={activeConnectionConfig} activeConnectionId={activeConnectionId} activeDbName={activeDbName} />
            ) : (
                <code className={className} {...props}>
                    {children}
                </code>
            );
        }
    }), [darkMode, overlayTheme, activeConnectionConfig, activeConnectionId, activeDbName]) satisfies Components;

    return (
        <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
            {normalizedContent}
        </ReactMarkdown>
    );
});

interface AIMessageBubbleProps {
    msg: AIChatMessage;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    textColor: string;
    onEdit: (msg: AIChatMessage) => void;
    onRetry: (msg: AIChatMessage) => void;
    onDelete: (id: string) => void;
    activeConnectionId?: string;
    activeConnectionConfig?: RpcConnectionConfig;
    activeDbName?: string;
    allMessages?: AIChatMessage[];
}

const AIToolResultItem: React.FC<{ resultMsg: AIChatMessage, darkMode: boolean, overlayTheme: OverlayWorkbenchTheme }> = ({ resultMsg, darkMode, overlayTheme }) => {
    const t = useAIText();
    const [toolExpanded, setToolExpanded] = useState(false);
    const charCount = resultMsg.content ? resultMsg.content.length : 0;
    return (
        <div style={{
            background: darkMode ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.02)',
            borderRadius: 6,
            padding: '6px 10px',
            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
            marginTop: 8,
            width: '100%'
        }}>
            <div 
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 6, fontSize: 12, color: overlayTheme.mutedText }}
                onClick={() => setToolExpanded(!toolExpanded)}
            >
                {toolExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                <ApiOutlined style={{ color: '#1677ff' }} />
                <span>{t('ai.message.toolResultTitle', { tool: resultMsg.tool_name || 'unknown' })}</span>
                <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.6 }}>{charCount > 0 ? t('ai.message.toolResultChars', { count: charCount }) : t('ai.message.noData')}</span>
            </div>
            {toolExpanded && (
                <div style={{ marginTop: 8, fontSize: 12, color: overlayTheme.mutedText, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflowY: 'auto', background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', padding: 8, borderRadius: 6 }}>
                    {resultMsg.content}
                </div>
            )}
        </div>
    );
};

const MermaidRenderer = ({ chart, darkMode }: { chart: string, darkMode: boolean }) => {
    const t = useAIText();
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [errorText, setErrorText] = React.useState('');

    React.useEffect(() => {
        let active = true;
        if (containerRef.current) {
            setErrorText('');
            containerRef.current.replaceChildren();
            try {
                mermaid.initialize({ startOnLoad: false, theme: darkMode ? 'dark' : 'default' });
                const id = `mermaid-${Math.random().toString(36).substring(2)}`;
                (async () => {
                    const result = await mermaid.render(id, chart);
                    if (active && containerRef.current) {
                        const rawSvg = String(result?.svg || result || '');
                        const parsed = new DOMParser().parseFromString(rawSvg, 'image/svg+xml');
                        const svg = parsed.documentElement;
                        if (svg?.tagName.toLowerCase() !== 'svg' || svg.querySelector('parsererror')) {
                            throw new Error(t('ai.message.mermaidInvalidSvg'));
                        }
                        svg.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
                        Array.from(svg.querySelectorAll('*')).forEach((node) => {
                            Array.from(node.attributes).forEach((attr) => {
                                if (
                                    /^on/i.test(attr.name)
                                    || /^\s*javascript:/i.test(attr.value)
                                    || (attr.name.toLowerCase() === 'style' && /\b(?:url|expression)\s*\(/i.test(attr.value))
                                ) {
                                    node.removeAttribute(attr.name);
                                }
                            });
                        });
                        containerRef.current.replaceChildren(document.importNode(svg, true));
                    }
                })().catch((e: unknown) => {
                    if (active) {
                        setErrorText(t('ai.message.mermaidParseFailed', { message: getErrorMessage(e) }));
                    }
                });
            } catch (e: unknown) {
                setErrorText(t('ai.message.mermaidRenderFailed', { message: getErrorMessage(e) }));
            }
        }
        return () => {
            active = false;
        };
    }, [chart, darkMode, t]);

    return (
        <>
            <div ref={containerRef} className="ai-mermaid-container" style={{ margin: '16px 0', display: errorText ? 'none' : 'flex', justifyContent: 'flex-start', overflowX: 'auto' }} />
            {errorText && (
                <div style={{ color: '#ef4444', padding: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 12 }}>
                    {errorText}
                </div>
            )}
        </>
    );
};

const CodeCopyBtn = ({ text }: { text: string }) => {
    const t = useAIText();
    const [copied, setCopied] = useState(false);
    return (
        <span 
            className="ai-code-copy-btn" 
            onClick={() => { 
                navigator.clipboard.writeText(text); 
                setCopied(true); 
                setTimeout(() => setCopied(false), 2000); 
            }}
            style={{ 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                opacity: copied ? 1 : 0.6,
                transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = copied ? '1' : '0.6'; }}
        >
            {copied ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />} 
            <span style={{ marginLeft: 4 }}>{copied ? t('ai.message.codeCopied') : t('ai.message.copyCode')}</span>
        </span>
    );
};

const CodeRunBtn = ({ text, connectionId, dbName }: { text: string; connectionId?: string; dbName?: string }) => {
    const t = useAIText();
    // 解析 SQL 顶部的 @context 注释，格式：-- @context connectionId=xxx dbName=yyy
    const contextMatch = text.match(/^--\s*@context\s+connectionId=(\S+)\s+dbName=(\S+)/m);
    const resolvedConnId = contextMatch?.[1] || connectionId;
    const resolvedDbName = contextMatch?.[2] || dbName;
    // 发送给查询编辑器时去掉 @context 注释行
    const cleanSql = text.replace(/^--\s*@context\s+.*\n?/gm, '').trim();
    const sqlDetail = (runImmediately: boolean) => ({ sql: cleanSql, runImmediately, connectionId: resolvedConnId, dbName: resolvedDbName });
    const handleExecute = async () => {
        try {
            const Service = AIService;
            if (Service?.AICheckSQL) {
                const result = await Service.AICheckSQL(text);
                if (!result.allowed) {
                    message.error(t('ai.message.securityBlocked', { type: result.operationType }));
                    return;
                }
                if (result.requiresConfirm) {
                    const { Modal } = await import('antd');
                    Modal.confirm({
                        title: t('ai.message.securityConfirmTitle'),
                        content: result.warningMessage || t('ai.message.securityConfirmContent', { type: result.operationType }),
                        okText: t('ai.message.confirmExecute'),
                        cancelText: t('common.cancel'),
                        okButtonProps: { danger: true },
                        onOk: () => {
                            window.dispatchEvent(new CustomEvent('javanavi:insert-sql', { detail: sqlDetail(true) }));
                        },
                    });
                    return;
                }
            }
            // Safety check passed or not available, execute directly
            window.dispatchEvent(new CustomEvent('javanavi:insert-sql', { detail: sqlDetail(true) }));
        } catch (e) {
            // If safety check fails, still allow manual execution
            window.dispatchEvent(new CustomEvent('javanavi:insert-sql', { detail: sqlDetail(true) }));
        }
    };

    return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Tooltip title={t('ai.message.insertSqlTooltip')}>
                <span 
                    className="ai-code-run-btn" 
                    onClick={() => {
                        window.dispatchEvent(new CustomEvent('javanavi:insert-sql', { detail: sqlDetail(false) }));
                    }}
                    style={{ 
                        cursor: 'pointer', display: 'flex', alignItems: 'center', 
                        opacity: 0.6, transition: 'opacity 0.2s', padding: '0 4px', color: '#10b981'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
                >
                    <PlayCircleOutlined /> 
                    <span style={{ marginLeft: 4 }}>{t('ai.message.insert')}</span>
                </span>
            </Tooltip>
            <Tooltip title={t('ai.message.executeSqlTooltip')}>
                <span 
                    className="ai-code-run-btn" 
                    onClick={handleExecute}
                    style={{ 
                        cursor: 'pointer', display: 'flex', alignItems: 'center', 
                        opacity: 0.6, transition: 'opacity 0.2s', padding: '0 4px', color: '#1677ff'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
                >
                    <PlayCircleOutlined />
                    <span style={{ marginLeft: 4 }}>{t('ai.message.execute')}</span>
                </span>
            </Tooltip>
        </div>
    );
};

// 阶段2: 代码块体验升级 (折叠展开、行号显示、内联SQL预览)
const AIBlockHashRender = ({
    match,
    darkMode,
    overlayTheme,
    children,
    activeConnectionConfig,
    activeConnectionId,
    activeDbName,
}: {
    match: CodeLanguageMatch;
    darkMode: boolean;
    overlayTheme: OverlayWorkbenchTheme;
    children: CodeChildren;
    activeConnectionConfig?: RpcConnectionConfig;
    activeConnectionId?: string;
    activeDbName?: string;
}) => {
    const t = useAIText();
    const codeText = String(children).replace(/\n$/, '');
    // 将 @context 注释行从显示文本中剔除，用户无需看到内部元数据
    const displayText = codeText.replace(/^--\s*@context\s+.*\n?/gm, '').trim();
    const [expanded, setExpanded] = useState(false);
    const [previewData, setPreviewData] = useState<QueryRow[] | null>(null);
    const [previewCols, setPreviewCols] = useState<string[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [previewExpanded, setPreviewExpanded] = useState(false);
    
    const MAX_HEIGHT = 300;
    const isLongCode = displayText.split('\n').length > 15;
    const isSql = match[1] === 'sql';
    const isSelectQuery = isSql && /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i.test(displayText.trim());

    const handleInlineExecute = async () => {
        if (!activeConnectionConfig || previewLoading) return;
        setPreviewLoading(true);
        setPreviewError('');
        setPreviewData(null);
        try {
            const { DBQuery } = await import('@compat/javanaviApp');
            const previewSql = buildAIReadonlyPreviewSQL(
                activeConnectionConfig?.type || '',
                displayText,
                50,
                activeConnectionConfig?.driver || '',
            );
            const res = await DBQuery(activeConnectionConfig, activeDbName || '', previewSql, 'ai-tool');
            if (res.success && Array.isArray(res.data)) {
                const rows = res.data as QueryRow[];
                const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
                setPreviewCols(cols);
                setPreviewData(rows.slice(0, 20));
                setPreviewExpanded(true);
            } else {
                setPreviewError(res.message || t('ai.message.previewNoResult'));
            }
        } catch (err: unknown) {
            setPreviewError(getErrorMessage(err) || t('ai.message.previewFailed'));
        } finally {
            setPreviewLoading(false);
        }
    };

    return (
        <div className="ai-code-block-container" style={{ margin: '12px 0', border: overlayTheme.sectionBorder, borderRadius: 6, overflow: 'hidden' }}>
            <div className="ai-code-header" style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 12px', background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                fontSize: 12, color: overlayTheme.mutedText
            }}>
                <span style={{ fontFamily: 'monospace' }}>{match[1]}</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {isSql && <CodeRunBtn text={codeText} connectionId={activeConnectionId} dbName={activeDbName} />}
                    {isSelectQuery && activeConnectionConfig && (
                        <Tooltip title={t('ai.message.previewTooltip')}>
                            <span
                                onClick={handleInlineExecute}
                                style={{
                                    cursor: previewLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center',
                                    opacity: previewLoading ? 1 : 0.6, transition: 'opacity 0.2s', padding: '0 4px', color: '#faad14'
                                }}
                                onMouseEnter={(e) => { if (!previewLoading) e.currentTarget.style.opacity = '1'; }}
                                onMouseLeave={(e) => { if (!previewLoading) e.currentTarget.style.opacity = '0.6'; }}
                            >
                                {previewLoading ? '⏳' : '👁'}
                                <span style={{ marginLeft: 4 }}>{previewLoading ? t('ai.message.previewRunning') : t('ai.message.preview')}</span>
                            </span>
                        </Tooltip>
                    )}
                    <CodeCopyBtn text={displayText} />
                </div>
            </div>

            <div style={{ position: 'relative' }}>
                <SyntaxHighlighter
                    style={syntaxThemeStyle(darkMode)}
                    language={match[1]}
                    PreTag="div"
                    showLineNumbers={true}
                    customStyle={{ 
                        margin: 0, 
                        borderRadius: 0, 
                        background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)',
                        maxHeight: expanded ? 'none' : (isLongCode ? MAX_HEIGHT : 'none'),
                        overflowY: expanded ? 'auto' : 'hidden',
                        fontSize: '14px',
                        lineHeight: 1.6
                    }}
                    codeTagProps={{
                        style: {
                            fontSize: '14px',
                            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace'
                        }
                    }}
                >
                    {displayText}
                </SyntaxHighlighter>

                {!expanded && isLongCode && (
                    <div 
                        style={{
                            position: 'absolute',
                            bottom: 0, left: 0, right: 0,
                            height: 60,
                            background: `linear-gradient(to bottom, transparent, ${darkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'})`,
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            paddingBottom: 8, cursor: 'pointer'
                        }}
                        onClick={() => setExpanded(true)}
                    >
                        <span style={{ fontSize: 12, color: overlayTheme.iconColor, background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 12 }}>
                            {t('ai.message.expandAllCode')}
                        </span>
                    </div>
                )}
                {expanded && isLongCode && (
                    <div 
                        style={{
                            display: 'flex', justifyContent: 'center', padding: '6px 0',
                            background: darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.02)', cursor: 'pointer',
                            borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`
                        }}
                        onClick={() => setExpanded(false)}
                    >
                        <span style={{ fontSize: 12, color: overlayTheme.iconColor }}>{t('ai.message.collapseCode')}</span>
                    </div>
                )}
            </div>

            {/* Inline SQL Preview Results */}
            {previewError && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: '#ef4444', background: darkMode ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                    ❌ {previewError}
                </div>
            )}
            {previewExpanded && previewData && previewData.length > 0 && (
                <div style={{ borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', background: darkMode ? 'rgba(250,173,20,0.08)' : 'rgba(250,173,20,0.05)' }}>
                        <span style={{ fontSize: 11, color: overlayTheme.mutedText }}>{t('ai.message.previewSummary', { rows: previewData.length, cols: previewCols.length })}</span>
                        <span style={{ fontSize: 11, color: overlayTheme.mutedText, cursor: 'pointer' }} onClick={() => setPreviewExpanded(false)}>{t('ai.message.collapsePreview')}</span>
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
                            <thead>
                                <tr>
                                    {previewCols.map(col => (
                                        <th key={col} style={{ padding: '4px 8px', textAlign: 'left', background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: overlayTheme.titleText, fontWeight: 600, whiteSpace: 'nowrap', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}` }}>
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.map((row, ri) => (
                                    <tr key={ri}>
                                        {previewCols.map(col => (
                                            <td key={col} style={{ padding: '3px 8px', color: overlayTheme.mutedText, whiteSpace: 'nowrap', borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {row[col] === null ? <span style={{ color: '#999', fontStyle: 'italic' }}>NULL</span> : String(row[col])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {!previewExpanded && previewData && previewData.length > 0 && (
                <div 
                    style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 11, color: overlayTheme.mutedText, background: darkMode ? 'rgba(250,173,20,0.05)' : 'rgba(250,173,20,0.03)', borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}` }}
                    onClick={() => setPreviewExpanded(true)}
                >
                    {t('ai.message.viewResult', { rows: previewData.length })}
                </div>
            )}
        </div>
    );
};

// 可折叠思考过程组件
const ThinkingBlock: React.FC<{ displayThinking: string; totalLen: number; isTyping: boolean; isGlobalLoading: boolean; darkMode: boolean; overlayTheme: OverlayWorkbenchTheme; hasContent: boolean }> = ({ displayThinking, totalLen, isTyping, isGlobalLoading, darkMode, overlayTheme, hasContent }) => {
    const t = useAIText();
    // 如果整体在loading，且尚未吐出content，我们认为真正的思考还在进行；如果吐出content了，思考框就算告一段落
    const isActivelyThinking = isGlobalLoading && !hasContent;
    const [expanded, setExpanded] = useState(isActivelyThinking);
    const contentRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => { if (isActivelyThinking) setExpanded(true); }, [isActivelyThinking]);
    
    // 断开连接或思考结束时，若已有内容且不再产生新内容则默认收起
    React.useEffect(() => {
        if (!isGlobalLoading) setExpanded(false);
    }, [isGlobalLoading]);

    // 自动滚动到思考内容底部
    React.useEffect(() => {
        if (expanded && isTyping && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [displayThinking, expanded, isTyping]);

    return (
        <div style={{
            marginBottom: hasContent ? 8 : 0,
            borderRadius: 6,
            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
            overflow: 'hidden',
        }}>
            <div
                onClick={() => setExpanded(e => !e)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', cursor: 'pointer',
                    background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    fontSize: 12, color: overlayTheme.mutedText, userSelect: 'none',
                }}
            >
                <span style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10 }}>▶</span>
                <span>{t('ai.message.thinkingTitle')}</span>
                {isActivelyThinking && <span style={{ fontSize: 10, color: '#8b5cf6', animation: 'pulse 1.5s ease-in-out infinite' }}>{t('ai.message.thinking')}</span>}
                {!isActivelyThinking && <span style={{ fontSize: 10, opacity: 0.5 }}>{t('ai.message.thinkingChars', { count: displayThinking.length })}</span>}
            </div>
            <div className={`ai-expand-transition ${expanded ? 'expanded' : 'collapsed'}`}>
                <div ref={contentRef} style={{
                    padding: expanded ? '8px 12px' : '0 12px',
                    borderLeft: '3px solid #8b5cf6',
                    margin: '0 8px 8px',
                    fontSize: 12, lineHeight: 1.7,
                    color: overlayTheme.mutedText,
                    fontStyle: 'italic',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    maxHeight: 400, overflowY: 'auto',
                }}>
                    {displayThinking}
                    {isTyping && <span className="ai-blinking-cursor" style={{ background: '#8b5cf6', marginLeft: 4, width: 6, height: 12, display: 'inline-block', verticalAlign: 'middle', opacity: 0.8 }} />}
                </div>
            </div>
        </div>
    );
};

// 工具调用进度面板聚合展示组件
const AIToolCallingBlock: React.FC<{ tool_calls: AIToolCall[]; loading: boolean; allMessages: AIChatMessage[]; darkMode: boolean; overlayTheme: OverlayWorkbenchTheme; hasContent: boolean }> = ({ tool_calls, loading, allMessages, darkMode, overlayTheme, hasContent }) => {
    const t = useAIText();
    const totalCalls = tool_calls.length;
    const allDone = tool_calls.every(tc => allMessages?.find(m => m.role === 'tool' && m.tool_call_id === tc.id));
    const [expanded, setExpanded] = useState(!allDone && loading);
    
    // 断开连接或执行完毕时，若已完成则默认收起
    React.useEffect(() => {
        if (allDone || !loading) setExpanded(false);
    }, [allDone, loading]);

    // 显示友好的人类可读动作名
    const getHumanActionName = (fname: string) => {
        if (fname === 'get_connections') return t('ai.message.tool.getConnections');
        if (fname === 'get_databases') return t('ai.message.tool.getDatabases');
        if (fname === 'get_tables') return t('ai.message.tool.getTables');
        return fname;
    };

    return (
        <div style={{
            background: darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.025)',
            borderRadius: 8, fontSize: 12, overflow: 'hidden',
            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
            marginTop: hasContent ? 12 : 0,
            display: 'flex', flexDirection: 'column',
        }}>
            <div 
                onClick={() => setExpanded(!expanded)}
                style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '8px 12px', cursor: 'pointer', userSelect: 'none',
                    background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: overlayTheme.titleText, fontWeight: 500 }}>
                    {!allDone && loading ? (
                        <div className="ai-spinning-ring" />
                    ) : (
                        <CheckOutlined style={{ color: '#10b981' }} />
                    )}
                    <span>{!allDone && loading ? t('ai.message.toolCallingRunning') : t('ai.message.toolCallingDone', { count: totalCalls })}</span>
                </div>
                <span style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10, color: overlayTheme.mutedText }}>▶</span>
            </div>
            <div className={`ai-expand-transition ${expanded ? 'expanded' : 'collapsed'}`}>
                <div style={{ padding: expanded ? '4px 12px 12px' : '0 12px' }}>
                    {tool_calls.map((tc, idx) => {
                        const resultMsg = allMessages?.find(m => m.role === 'tool' && m.tool_call_id === tc.id);
                        const isDone = !!resultMsg;
                        const actionName = getHumanActionName(tc.function.name);
                        return (
                            <div key={tc.id} style={{ 
                                display: 'flex', flexDirection: 'column', gap: 4, 
                                marginTop: 6, paddingLeft: 8,
                                borderLeft: `2px solid ${isDone ? '#10b981' : (loading ? '#1677ff' : overlayTheme.shellBorder)}`,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {isDone 
                                        ? <CheckOutlined style={{ color: '#10b981', fontSize: 11 }} /> 
                                        : (loading ? <div className="ai-spinning-ring" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : <ApiOutlined style={{ color: overlayTheme.mutedText, fontSize: 11 }} />)
                                    }
                                    <span style={{ color: isDone ? overlayTheme.mutedText : overlayTheme.titleText }}>{actionName}</span>
                                </div>
                                {resultMsg && <AIToolResultItem resultMsg={resultMsg} darkMode={darkMode} overlayTheme={overlayTheme} />}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const AIMessageBubble: React.FC<AIMessageBubbleProps> = React.memo(({ msg, darkMode, overlayTheme, textColor, onEdit, onRetry, onDelete, activeConnectionId, activeConnectionConfig, activeDbName, allMessages }) => {
    const t = useAIText();
    const [isCopied, setIsCopied] = useState(false);
    const isUser = msg.role === 'user';
    
    // 从 content 中提取 <think>...</think> 标签内容（部分模型如 MiniMax、DeepSeek 会以文本形式返回思考过程）
    const { displayContent, parsedThinking } = React.useMemo(() => {
        const content = msg.content || '';
        // 优先使用后端已结构化的 thinking 字段（如 Claude API 原生 thinking）
        if (msg.thinking) {
            return { displayContent: content, parsedThinking: msg.thinking };
        }
        // 尝试从 content 中提取 <think>...</think> 标签
        const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
        let thinkParts: string[] = [];
        let cleanContent = content;
        let match;
        while ((match = thinkRegex.exec(content)) !== null) {
            thinkParts.push(match[1].trim());
        }
        if (thinkParts.length > 0) {
            // 移除所有 <think>...</think> 标签（含未闭合的）
            cleanContent = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
            return { displayContent: cleanContent, parsedThinking: thinkParts.join('\n\n') };
        }
        return { displayContent: content, parsedThinking: '' };
    }, [msg.content, msg.thinking]);
    const isTypingThinking = !!(msg.loading && msg.phase === 'thinking');
    
    if (msg.role === 'tool') return null;

    // 如果是纯空壳的加载状态（connecting，或还在思考/工具阶段但还没吐出一个字的 content）
    const isWaitState = msg.phase === 'connecting' || 
                       (msg.loading && !msg.content && (msg.phase === 'thinking' || msg.phase === 'tool_calling'));

    if (isWaitState) {
        return (
            <div className="ai-ide-message" style={{ borderBottom: 'none', padding: '8px 16px' }}>
                <div style={{
                    background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 12, padding: '14px 16px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: overlayTheme.mutedText }}>
                        <div className="ai-wave-pulse">
                            <span /> <span /> <span />
                        </div>
                        <span style={{ fontSize: 13, opacity: 0.8 }}>{msg.content || t('ai.message.connecting')}...</span>
                    </div>

                    {/* 即使在波纹过渡态，如果有 thinking / tool_calls 也要显示出来，只是把它们压在波纹下面 */}
                    <div style={{ marginTop: parsedThinking || (msg.tool_calls && msg.tool_calls.length > 0) ? 12 : 0 }}>
                        {!isUser && parsedThinking && (
                            <ThinkingBlock 
                                displayThinking={parsedThinking}
                                totalLen={parsedThinking.length}
                                isTyping={isTypingThinking}
                                isGlobalLoading={!!msg.loading}
                                darkMode={darkMode} 
                                overlayTheme={overlayTheme} 
                                hasContent={false} 
                            />
                        )}
                        {!isUser && msg.tool_calls && msg.tool_calls.length > 0 && (
                            <AIToolCallingBlock 
                                tool_calls={msg.tool_calls} 
                                loading={!!msg.loading} 
                                allMessages={allMessages || []} 
                                darkMode={darkMode} 
                                overlayTheme={overlayTheme} 
                                hasContent={false} 
                            />
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ai-ide-message" style={{ borderBottom: 'none', padding: '8px 16px' }}>
            <div style={{
                background: isUser ? (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : (darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                borderRadius: 12,
                padding: '14px 16px',
            }}>
                <div className="ai-ide-message-header" style={{ 
                    color: isUser ? overlayTheme.mutedText : overlayTheme.titleText,
                    marginBottom: isUser ? 6 : 10,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div>
                    {isUser 
                        ? <><UserOutlined /> <span>You</span></>
                        : <><RobotOutlined style={{ color: overlayTheme.iconColor }} /> <span>JavaNavi AI</span></>}
                    </div>
                    {/* 气泡操作栏 */}
                    <div className="ai-message-actions" style={{ display: 'flex', gap: 8, opacity: 0, transition: 'opacity 0.2s', padding: '0 4px' }}>
                        <Tooltip title={isCopied ? t('ai.message.codeCopied') : t('ai.message.copyFullText')}>
                            {isCopied ? (
                                <CheckOutlined className="ai-action-icon" style={{ color: '#10b981' }} />
                            ) : (
                                <CopyOutlined className="ai-action-icon" onClick={() => {
                                    navigator.clipboard.writeText(msg.content);
                                    setIsCopied(true);
                                    setTimeout(() => setIsCopied(false), 2000);
                                }} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                            )}
                        </Tooltip>
                        {isUser ? (
                            <Tooltip title={t('ai.message.editTooltip')}>
                                <EditOutlined className="ai-action-icon" onClick={() => onEdit(msg)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                            </Tooltip>
                        ) : (
                            <Tooltip title={t('ai.message.regenerateTooltip')}>
                                <ReloadOutlined className="ai-action-icon" onClick={() => onRetry(msg)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                            </Tooltip>
                        )}
                        <Tooltip title={t('ai.message.deleteTooltip')}>
                            <DeleteOutlined className="ai-action-icon" onClick={() => onDelete(msg.id)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                        </Tooltip>
                    </div>
                </div>
                <div className="ai-ide-message-content ai-markdown-content" style={{ color: textColor }}>
                    {msg.images && msg.images.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            {msg.images.map((img, i) => (
                                <img key={i} src={img} alt={t('ai.message.attachedImageAlt', { index: i + 1 })} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, objectFit: 'contain', border: overlayTheme.shellBorder }} />
                            ))}
                        </div>
                    )}
                    {/* 可折叠思考过程 */}
                    {!isUser && parsedThinking && (
                        <ThinkingBlock 
                            displayThinking={parsedThinking}
                            totalLen={parsedThinking.length}
                            isTyping={isTypingThinking}
                            isGlobalLoading={!!msg.loading}
                            darkMode={darkMode} 
                            overlayTheme={overlayTheme} 
                            hasContent={!!msg.content} 
                        />
                    )}
                    {isUser ? (
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>{msg.content}</div>
                    ) : (
                        <MemoizedMarkdown 
                            content={displayContent}
                            darkMode={darkMode}
                            overlayTheme={overlayTheme}
                            activeConnectionConfig={activeConnectionConfig}
                            activeConnectionId={activeConnectionId}
                            activeDbName={activeDbName}
                        />
                    )}
                    {/* 错误原文复制按钮 */}
                    {!isUser && msg.rawError && (
                        <div style={{ marginTop: 8 }}>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(msg.rawError || '');
                                    const btn = document.getElementById(`raw-err-btn-${msg.id}`);
                                    if (btn) { btn.textContent = t('ai.message.rawErrorCopied'); setTimeout(() => { btn.textContent = t('ai.message.copyErrorRaw'); }, 1500); }
                                }}
                                id={`raw-err-btn-${msg.id}`}
                                style={{
                                    fontSize: 12, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                                    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                                    background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                    color: overlayTheme.mutedText, transition: 'all 0.15s ease',
                                }}
                            >
                                {t('ai.message.copyErrorRaw')}
                            </button>
                        </div>
                    )}
                    {/* 工具调用进度展示 */}
                    {!isUser && msg.tool_calls && msg.tool_calls.length > 0 && (
                        <AIToolCallingBlock 
                            tool_calls={msg.tool_calls} 
                            loading={!!msg.loading} 
                            allMessages={allMessages || []} 
                            darkMode={darkMode} 
                            overlayTheme={overlayTheme} 
                            hasContent={!!msg.content} 
                        />
                    )}
                    {msg.loading && msg.phase !== 'tool_calling' && msg.content && (
                        <span className="ai-blinking-cursor" style={{ background: overlayTheme.iconColor }} />
                    )}
                </div>
            </div>
        </div>
    );
});
