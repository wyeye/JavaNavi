import React, { useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import { HistoryOutlined, RobotOutlined, ClearOutlined, SettingOutlined, CloseOutlined, ExportOutlined } from '@ant-design/icons';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { AIChatMessage } from '../../types';
import { SelectExportFile, isJavaNaviDesktopRuntime } from '@compat/javanaviApp';
import { useStore } from '../../store';
import { translate, type I18nKey, type I18nParams } from '../../i18n';

interface AIChatHeaderProps {
    darkMode: boolean;
    mutedColor: string;
    textColor: string;
    overlayTheme: OverlayWorkbenchTheme;
    onHistoryClick: () => void;
    onClear: () => void;
    onSettingsClick: () => void;
    onClose: () => void;
    messages?: AIChatMessage[];
    sessionTitle?: string;
}

type TranslateFn = (key: I18nKey, params?: I18nParams) => string;

const buildMarkdownExport = (messages: AIChatMessage[], title: string, t: TranslateFn): string => {
    const lines: string[] = [`# ${title}`, '', `> ${t('ai.chat.exportTimestamp')}：${new Date().toLocaleString()}`, ''];
    messages.forEach(msg => {
        const role = msg.role === 'user' ? t('ai.chat.exportRoleUser') : t('ai.chat.exportRoleAssistant');
        lines.push(`## ${role}`);
        lines.push('');
        lines.push(msg.content);
        lines.push('');
        lines.push('---');
        lines.push('');
    });
    return lines.join('\n');
};

const downloadMarkdown = (content: string, title: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[/\\?%*:|"<>]/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const exportToMarkdown = async (messages: AIChatMessage[], title: string, t: TranslateFn) => {
    const content = buildMarkdownExport(messages, title, t);
    if (isJavaNaviDesktopRuntime() && window.__TAURI__?.core?.invoke) {
        const selected = await SelectExportFile(title, 'md', 'ai-chat');
        if (!selected.success) return;
        const data = selected.data && typeof selected.data === 'object' ? selected.data as { path?: unknown; filePath?: unknown } : {};
        const path = String(data.path || data.filePath || '').trim();
        if (!path) return;
        await window.__TAURI__.core.invoke('write_text_file', { request: { path, content } });
        message.success(t('ai.chat.exportSuccessWithPath', { path }));
        return;
    }
    downloadMarkdown(content, title);
};

export const AIChatHeader: React.FC<AIChatHeaderProps> = ({
    darkMode, mutedColor, textColor, overlayTheme,
    onHistoryClick, onClear, onSettingsClick, onClose,
    messages = [], sessionTitle
}) => {
    const language = useStore(state => state.language);
    const t = (key: I18nKey, params?: I18nParams) => translate(language, key, params);
    const exportTitle = sessionTitle || t('ai.chat.newSession');
    const [exporting, setExporting] = useState(false);
    const handleExportMarkdown = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            await exportToMarkdown(messages, exportTitle, t);
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error || '');
            message.error(t('ai.chat.exportFailedWithMessage', { message: text || t('message.unknownError') }));
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="ai-chat-header" style={{ borderBottom: 'none', padding: '10px 16px', background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
            <div className="ai-chat-header-left" style={{ gap: 8 }}>
                <Tooltip title={t('ai.chat.historyTooltip')}>
                    <Button type="text" size="small" icon={<HistoryOutlined />} onClick={onHistoryClick} style={{ color: mutedColor }} />
                </Tooltip>
                <div className="ai-logo" style={{ background: overlayTheme.iconBg, color: overlayTheme.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, fontSize: 12 }}>
                    <RobotOutlined />
                </div>
                <span className="ai-title" style={{ color: textColor, fontSize: 13, fontWeight: 600 }}>JavaNavi AI</span>
            </div>
            <div className="ai-chat-header-right">
                {messages.length > 0 && (
                    <Tooltip title={t('ai.chat.exportTooltip')}>
                        <Button type="text" size="small" icon={<ExportOutlined />} loading={exporting} onClick={() => void handleExportMarkdown()} style={{ color: mutedColor }} />
                    </Tooltip>
                )}
                <Tooltip title={t('ai.chat.clearTooltip')}>
                    <Button type="text" size="small" icon={<ClearOutlined />} onClick={onClear} style={{ color: mutedColor }} />
                </Tooltip>
                <Tooltip title={t('ai.chat.settingsTooltip')}>
                    <Button type="text" size="small" icon={<SettingOutlined />} onClick={onSettingsClick} style={{ color: mutedColor }} />
                </Tooltip>
                <Tooltip title={t('ai.chat.closeTooltip')}>
                    <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} style={{ color: mutedColor }} />
                </Tooltip>
            </div>
        </div>
    );
};
