import * as AIService from '@compat/aiService';
import React, { useState, useEffect, useRef } from 'react';
import { Button, Tooltip, message } from 'antd';
import { UserOutlined, RobotOutlined, EditOutlined, ReloadOutlined, DeleteOutlined, CheckOutlined, CopyOutlined, PlayCircleOutlined, ApiOutlined, LoadingOutlined, CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { AIChatMessage, AIToolCall } from '../../types';
import { useStore } from '../../store';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { normalizeAiMarkdown } from '../../utils/aiMarkdown';
import { buildAIReadonlyPreviewSQL } from '../../utils/aiSqlLimit';
import { extractJVMChangePlan, resolveJVMAIPlanTargetTabId } from '../../utils/jvmAiPlan';
import {
    parseJVMDiagnosticPlan,
    resolveJVMDiagnosticPlanTargetTabId,
} from '../../utils/jvmDiagnosticPlan';

// 🔧 性能优化：将 ReactMarkdown 包装为 Memo 组件并提取固定的 plugins
const remarkPlugins = [remarkGfm];

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
    activeConnectionConfig?: any;
    activeConnectionId?: string;
    activeDbName?: string;
}) => {
    const normalizedContent = React.useMemo(() => normalizeAiMarkdown(content), [content]);
    // 缓存 components 对象，避免每次渲染都生成新的函数引用击穿内部子组件的 memo
    const components = React.useMemo(() => ({
        code({ node, inline, className, children, ...props }: any) {
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
    }), [darkMode, overlayTheme, activeConnectionConfig, activeConnectionId, activeDbName]);

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
    activeConnectionConfig?: any;
    activeDbName?: string;
    allMessages?: AIChatMessage[];
}

const AIToolResultItem: React.FC<{ resultMsg: AIChatMessage, darkMode: boolean, overlayTheme: OverlayWorkbenchTheme }> = ({ resultMsg, darkMode, overlayTheme }) => {
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
                <span>探针执行结果 (<span style={{ fontFamily: 'monospace', color: overlayTheme.iconColor }}>{resultMsg.tool_name || 'unknown'}</span>)</span>
                <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.6 }}>{charCount > 0 ? `${charCount} 个字符` : '无数据'}</span>
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
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (containerRef.current) {
            try {
                mermaid.initialize({ startOnLoad: false, theme: darkMode ? 'dark' : 'default' });
                const id = `mermaid-${Math.random().toString(36).substring(2)}`;
                (async () => {
                    const result: any = await mermaid.render(id, chart);
                    if (containerRef.current) {
                        containerRef.current.innerHTML = result.svg || result;
                    }
                })().catch((e: any) => {
                    if (containerRef.current) {
                        containerRef.current.innerHTML = `<div style="color:#ef4444; padding:12px; background:rgba(239,68,68,0.1); border-radius:6px; font-size:12px">Mermaid 解析失败: ${e.message}</div>`;
                    }
                });
            } catch (e: any) {
                if (containerRef.current) {
                    containerRef.current.innerHTML = `<div style="color:#ef4444; padding:12px; background:rgba(239,68,68,0.1); border-radius:6px; font-size:12px">Mermaid 渲染异常: ${e.message}</div>`;
                }
            }
        }
    }, [chart, darkMode]);

    return <div ref={containerRef} className="ai-mermaid-container" style={{ margin: '16px 0', display: 'flex', justifyContent: 'flex-start', overflowX: 'auto' }} />;
};

const CodeCopyBtn = ({ text }: { text: string }) => {
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
            <span style={{ marginLeft: 4 }}>{copied ? '已复制' : '复制代码'}</span>
        </span>
    );
};

const CodeRunBtn = ({ text, connectionId, dbName }: { text: string; connectionId?: string; dbName?: string }) => {
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
                    message.error(`🔒 安全策略拦截：当前安全级别不允许执行 ${result.operationType} 类型的 SQL。请在 AI 设置中调整安全级别。`);
                    return;
                }
                if (result.requiresConfirm) {
                    const { Modal } = await import('antd');
                    Modal.confirm({
                        title: '⚠️ 安全确认',
                        content: result.warningMessage || `此 SQL 为 ${result.operationType} 操作，确定要执行吗？`,
                        okText: '确认执行',
                        cancelText: '取消',
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
            <Tooltip title="将该段 SQL 注入查询工作区（可快捷修改或执行）">
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
                    <span style={{ marginLeft: 4 }}>插入</span>
                </span>
            </Tooltip>
            <Tooltip title="立即执行（受 AI 安全策略管控）">
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
                    <span style={{ marginLeft: 4 }}>执行</span>
                </span>
            </Tooltip>
        </div>
    );
};

// 阶段2: 代码块体验升级 (折叠展开、行号显示、内联SQL预览)
const AIBlockHashRender = ({ match, darkMode, overlayTheme, children, activeConnectionConfig, activeConnectionId, activeDbName }: any) => {
    const codeText = String(children).replace(/\n$/, '');
    // 将 @context 注释行从显示文本中剔除，用户无需看到内部元数据
    const displayText = codeText.replace(/^--\s*@context\s+.*\n?/gm, '').trim();
    const [expanded, setExpanded] = useState(false);
    const [previewData, setPreviewData] = useState<any[] | null>(null);
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
            const res = await DBQuery(activeConnectionConfig, activeDbName || '', previewSql);
            if (res.success && Array.isArray(res.data)) {
                const rows = res.data as any[];
                const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
                setPreviewCols(cols);
                setPreviewData(rows.slice(0, 20));
                setPreviewExpanded(true);
            } else {
                setPreviewError(res.message || '查询无结果');
            }
        } catch (err: any) {
            setPreviewError(err?.message || '执行失败');
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
                        <Tooltip title="在聊天内预览查询结果（最多20行）">
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
                                <span style={{ marginLeft: 4 }}>{previewLoading ? '执行中...' : '预览'}</span>
                            </span>
                        </Tooltip>
                    )}
                    <CodeCopyBtn text={displayText} />
                </div>
            </div>

            <div style={{ position: 'relative' }}>
                <SyntaxHighlighter
                    style={darkMode ? vscDarkPlus as any : vs as any}
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
                            展开全部代码
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
                        <span style={{ fontSize: 12, color: overlayTheme.iconColor }}>收起代码</span>
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
                        <span style={{ fontSize: 11, color: overlayTheme.mutedText }}>📊 预览结果（{previewData.length} 行 × {previewCols.length} 列）</span>
                        <span style={{ fontSize: 11, color: overlayTheme.mutedText, cursor: 'pointer' }} onClick={() => setPreviewExpanded(false)}>收起 ▴</span>
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
                    📊 查看结果（{previewData.length} 行）▾
                </div>
            )}
        </div>
    );
};

// 可折叠思考过程组件
const ThinkingBlock: React.FC<{ displayThinking: string; totalLen: number; isTyping: boolean; isGlobalLoading: boolean; darkMode: boolean; overlayTheme: any; hasContent: boolean }> = ({ displayThinking, totalLen, isTyping, isGlobalLoading, darkMode, overlayTheme, hasContent }) => {
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
                <span>💭 思考过程</span>
                {isActivelyThinking && <span style={{ fontSize: 10, color: '#8b5cf6', animation: 'pulse 1.5s ease-in-out infinite' }}>思考中...</span>}
                {!isActivelyThinking && <span style={{ fontSize: 10, opacity: 0.5 }}>({displayThinking.length} 字)</span>}
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
const AIToolCallingBlock: React.FC<{ tool_calls: AIToolCall[]; loading: boolean; allMessages: AIChatMessage[]; darkMode: boolean; overlayTheme: any; hasContent: boolean }> = ({ tool_calls, loading, allMessages, darkMode, overlayTheme, hasContent }) => {
    const totalCalls = tool_calls.length;
    const allDone = tool_calls.every(tc => allMessages?.find(m => m.role === 'tool' && m.tool_call_id === tc.id));
    const [expanded, setExpanded] = useState(!allDone && loading);
    
    // 断开连接或执行完毕时，若已完成则默认收起
    React.useEffect(() => {
        if (allDone || !loading) setExpanded(false);
    }, [allDone, loading]);

    // 显示友好的人类可读动作名
    const getHumanActionName = (fname: string) => {
        if (fname === 'get_connections') return '获取可用连接信息';
        if (fname === 'get_databases') return '扫描数据库列表';
        if (fname === 'get_tables') return '分析表结构信息';
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
                    <span>{!allDone && loading ? '正在执行数据探针...' : `数据探针执行完毕 (${totalCalls} 项)`}</span>
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
    const jvmPlan = React.useMemo(() => {
        if (isUser) {
            return null;
        }
        return extractJVMChangePlan(displayContent);
    }, [displayContent, isUser]);
    const jvmDiagnosticPlan = React.useMemo(() => {
        if (isUser) {
            return null;
        }
        return parseJVMDiagnosticPlan(displayContent);
    }, [displayContent, isUser]);
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
                        <span style={{ fontSize: 13, opacity: 0.8 }}>{msg.content || '正在建立连接'}...</span>
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
                        <Tooltip title={isCopied ? "已复制" : "复制全文"}>
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
                            <Tooltip title="编辑此条消息（移除其后所有记录并重新发送）">
                                <EditOutlined className="ai-action-icon" onClick={() => onEdit(msg)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                            </Tooltip>
                        ) : (
                            <Tooltip title="重新生成（移除此条并触发上次用户输入重发）">
                                <ReloadOutlined className="ai-action-icon" onClick={() => onRetry(msg)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = textColor} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                            </Tooltip>
                        )}
                        <Tooltip title="删除单条消息">
                            <DeleteOutlined className="ai-action-icon" onClick={() => onDelete(msg.id)} style={{ cursor: 'pointer', color: overlayTheme.mutedText }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = overlayTheme.mutedText} />
                        </Tooltip>
                    </div>
                </div>
                <div className="ai-ide-message-content ai-markdown-content" style={{ color: textColor }}>
                    {msg.images && msg.images.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                            {msg.images.map((img, i) => (
                                <img key={i} src={img} alt={`Attached ${i}`} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, objectFit: 'contain', border: overlayTheme.shellBorder }} />
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
                    {!isUser && jvmPlan && (
                        <div style={{ marginTop: 12 }}>
                            <Button
                                size="small"
                                type="primary"
                                onClick={() => {
                                    const targetContext = msg.jvmPlanContext;
                                    if (!targetContext) {
                                        message.warning('这条 JVM 计划缺少来源页签上下文，请在目标 JVM 资源页重新生成。');
                                        return;
                                    }

                                    const store = useStore.getState();
                                    const targetTabId = resolveJVMAIPlanTargetTabId(store.tabs, targetContext);
                                    if (!targetTabId) {
                                        message.warning('未找到与该 JVM 计划匹配的资源页签，请先打开原目标资源后再应用。');
                                        return;
                                    }

                                    window.dispatchEvent(new CustomEvent('javanavi:jvm-apply-ai-plan', {
                                        detail: {
                                            plan: jvmPlan,
                                            targetTabId,
                                            connectionId: targetContext.connectionId,
                                            providerMode: targetContext.providerMode,
                                            resourcePath: targetContext.resourcePath,
                                        },
                                    }));
                                }}
                            >
                                应用到 JVM 预览
                            </Button>
                        </div>
                    )}
                    {!isUser && jvmDiagnosticPlan && (
                        <div style={{ marginTop: 12 }}>
                            <Button
                                size="small"
                                type="primary"
                                onClick={() => {
                                    const targetContext = msg.jvmDiagnosticPlanContext;
                                    if (!targetContext) {
                                        message.warning('这条诊断计划缺少来源页签上下文，请在目标诊断控制台重新生成。');
                                        return;
                                    }

                                    const store = useStore.getState();
                                    const targetTabId = resolveJVMDiagnosticPlanTargetTabId(
                                        store.tabs,
                                        store.connections,
                                        targetContext,
                                    );
                                    if (!targetTabId) {
                                        message.warning('未找到与该诊断计划匹配的诊断控制台页签，请先打开原目标控制台后再应用。');
                                        return;
                                    }

                                    window.dispatchEvent(new CustomEvent('javanavi:jvm-apply-diagnostic-plan', {
                                        detail: {
                                            plan: jvmDiagnosticPlan,
                                            targetTabId,
                                            connectionId: targetContext.connectionId,
                                            transport: targetContext.transport,
                                        },
                                    }));
                                }}
                            >
                                应用到诊断控制台
                            </Button>
                        </div>
                    )}
                    {/* 错误原文复制按钮 */}
                    {!isUser && msg.rawError && (
                        <div style={{ marginTop: 8 }}>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(msg.rawError || '');
                                    const btn = document.getElementById(`raw-err-btn-${msg.id}`);
                                    if (btn) { btn.textContent = '✅ 已复制'; setTimeout(() => { btn.textContent = '📋 复制报错原文'; }, 1500); }
                                }}
                                id={`raw-err-btn-${msg.id}`}
                                style={{
                                    fontSize: 12, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                                    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                                    background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                                    color: overlayTheme.mutedText, transition: 'all 0.15s ease',
                                }}
                            >
                                📋 复制报错原文
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
