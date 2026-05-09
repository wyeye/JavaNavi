import React from 'react';
import { RobotOutlined } from '@ant-design/icons';
import type { OverlayWorkbenchTheme } from '../../utils/overlayWorkbenchTheme';
import { useStore } from '../../store';
import { translate, type I18nKey, type I18nParams } from '../../i18n';

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
    const language = useStore((state) => state.language);
    const t = (key: I18nKey, params?: I18nParams) => translate(language, key, params);
    const hasContext = contextTableNames.length > 0;
    const tableList = contextTableNames.join(t('ai.welcome.tableJoiner'));

    const quickActions = hasContext
        ? [
            {
                label: t('ai.welcome.action.generateSql'),
                prompt: t('ai.welcome.prompt.generateSqlContext', { tables: tableList }),
            },
            {
                label: t('ai.welcome.action.explainSchema'),
                prompt: t('ai.welcome.prompt.explainSchemaContext', { tables: tableList }),
            },
            {
                label: t('ai.welcome.action.optimize'),
                prompt: t('ai.welcome.prompt.optimizeContext', { tables: tableList }),
            },
            {
                label: t('ai.welcome.action.schemaAnalysis'),
                prompt: t('ai.welcome.prompt.schemaAnalysisContext', { tables: tableList }),
            },
        ]
        : [
            {
                label: t('ai.welcome.action.generateSql'),
                prompt: t('ai.welcome.prompt.generateSqlNoContext'),
            },
            {
                label: t('ai.welcome.action.explainSql'),
                prompt: t('ai.welcome.prompt.explainSqlNoContext'),
            },
            {
                label: t('ai.welcome.action.optimize'),
                prompt: t('ai.welcome.prompt.optimizeNoContext'),
            },
            {
                label: t('ai.welcome.action.schemaAnalysis'),
                prompt: t('ai.welcome.prompt.schemaAnalysisNoContext'),
            },
        ];

    return (
        <div className="ai-chat-welcome" style={{ padding: '30px 20px', alignItems: 'flex-start', textAlign: 'left' }}>
            <div style={{ color: overlayTheme.titleText, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                <RobotOutlined style={{ marginRight: 8, color: overlayTheme.iconColor }} />
                {t('ai.welcome.greeting')}
            </div>
            <div className="welcome-desc" style={{ color: mutedColor, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
                {hasContext 
                    ? t('ai.welcome.descWithContext', { count: contextTableNames.length })
                    : t('ai.welcome.descWithoutContext')}
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
