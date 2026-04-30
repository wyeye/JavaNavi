import React from 'react';
import { Button, Tooltip } from 'antd';
import { HistoryOutlined, RobotOutlined, ClearOutlined, SettingOutlined, CloseOutlined, ExportOutlined } from '@ant-design/icons';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import type { AIChatMessage } from '../../types';

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

const exportToMarkdown = (messages: AIChatMessage[], title: string) => {
    const lines: string[] = [`# ${title}`, '', `> 导出时间：${new Date().toLocaleString()}`, ''];
    messages.forEach(msg => {
        const role = msg.role === 'user' ? '👤 You' : '🤖 JavaNavi AI';
        lines.push(`## ${role}`);
        lines.push('');
        lines.push(msg.content);
        lines.push('');
        lines.push('---');
        lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[/\\?%*:|"<>]/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const AIChatHeader: React.FC<AIChatHeaderProps> = ({
    darkMode, mutedColor, textColor, overlayTheme,
    onHistoryClick, onClear, onSettingsClick, onClose,
    messages = [], sessionTitle = '新对话'
}) => {
    return (
        <div className="ai-chat-header" style={{ borderBottom: 'none', padding: '10px 16px', background: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
            <div className="ai-chat-header-left" style={{ gap: 8 }}>
                <Tooltip title="历史会话">
                    <Button type="text" size="small" icon={<HistoryOutlined />} onClick={onHistoryClick} style={{ color: mutedColor }} />
                </Tooltip>
                <div className="ai-logo" style={{ background: overlayTheme.iconBg, color: overlayTheme.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, fontSize: 12 }}>
                    <RobotOutlined />
                </div>
                <span className="ai-title" style={{ color: textColor, fontSize: 13, fontWeight: 600 }}>JavaNavi AI</span>
            </div>
            <div className="ai-chat-header-right">
                {messages.length > 0 && (
                    <Tooltip title="导出为 Markdown">
                        <Button type="text" size="small" icon={<ExportOutlined />} onClick={() => exportToMarkdown(messages, sessionTitle)} style={{ color: mutedColor }} />
                    </Tooltip>
                )}
                <Tooltip title="新对话 (清空当前)">
                    <Button type="text" size="small" icon={<ClearOutlined />} onClick={onClear} style={{ color: mutedColor }} />
                </Tooltip>
                <Tooltip title="AI 设置">
                    <Button type="text" size="small" icon={<SettingOutlined />} onClick={onSettingsClick} style={{ color: mutedColor }} />
                </Tooltip>
                <Tooltip title="关闭面板">
                    <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} style={{ color: mutedColor }} />
                </Tooltip>
            </div>
        </div>
    );
};
