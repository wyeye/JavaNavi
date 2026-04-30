import React from 'react';
import { RobotOutlined } from '@ant-design/icons';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';

interface AIChatWelcomeProps {
    overlayTheme: OverlayWorkbenchTheme;
    quickActionBg: string;
    quickActionBorder: string;
    textColor: string;
    mutedColor: string;
    onQuickAction: (prompt: string, autoSend?: boolean) => void;
    contextTableNames?: string[];
}

export const AIChatWelcome: React.FC<AIChatWelcomeProps> = ({
    overlayTheme, quickActionBg, quickActionBorder, textColor, mutedColor, onQuickAction, contextTableNames = []
}) => {
    const hasContext = contextTableNames.length > 0;
    const tableList = contextTableNames.join('、');

    const quickActions = hasContext
        ? [
            { label: '📝 生成 SQL', prompt: `请根据以下表结构生成一条常用查询语句：${tableList}` },
            { label: '🔍 解释表结构', prompt: `请详细解释以下表的设计意图和字段含义：${tableList}` },
            { label: '⚡ 优化建议', prompt: `请分析以下表的结构设计，给出索引优化和查询性能优化建议：${tableList}` },
            { label: '🏗️ Schema 分析', prompt: `请对以下表进行全面的 Schema 分析，包括数据类型选择、范式评估和改进建议：${tableList}` },
        ]
        : [
            { label: '📝 生成 SQL', prompt: '请根据当前数据库表结构生成一条查询语句：' },
            { label: '🔍 解释 SQL', prompt: '请解释以下 SQL 语句的执行逻辑：\n```sql\n\n```' },
            { label: '⚡ 优化建议', prompt: '请分析以下 SQL 语句的性能并给出优化建议：\n```sql\n\n```' },
            { label: '🏗️ Schema 分析', prompt: '请分析当前数据库的表结构并给出优化建议。' },
        ];

    return (
        <div className="ai-chat-welcome" style={{ padding: '30px 20px', alignItems: 'flex-start', textAlign: 'left' }}>
            <div style={{ color: overlayTheme.titleText, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                <RobotOutlined style={{ marginRight: 8, color: overlayTheme.iconColor }} />
                你好，我是 JavaNavi AI
            </div>
            <div className="welcome-desc" style={{ color: mutedColor, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                {hasContext 
                    ? `已自动关联 ${contextTableNames.length} 张表结构，点击下方按钮快速开始分析。`
                    : '我是你的智能数据库助手。我可以帮你生成 SQL 查询、分析表结构、解释执行逻辑以及优化数据库性能。'}
            </div>
            <div className="quick-actions">
                {quickActions.map(action => (
                    <div
                        key={action.label}
                        className="quick-action-btn"
                        style={{
                            background: quickActionBg,
                            borderColor: quickActionBorder,
                            color: textColor,
                        }}
                        onClick={() => onQuickAction(action.prompt)}
                    >
                        {action.label}
                    </div>
                ))}
            </div>
        </div>
    );
};
