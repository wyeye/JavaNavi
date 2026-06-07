import React, { useState, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { Spin, Alert } from 'antd';
import type { SavedConnection, TabData } from '../types';
import { useStore } from '../store';
import { DBQuery } from '@compat/javanaviApp';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import type { RpcConnectionConfig } from '../utils/connectionRpcConfig';
import { translate, type I18nKey, type I18nParams } from '../i18n';

interface TriggerViewerProps {
    tab: TabData;
}

type QueryRow = Record<string, unknown>;

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const firstDefinedValue = (row: QueryRow): unknown => Object.values(row)[0];

const TriggerViewer: React.FC<TriggerViewerProps> = ({ tab }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [triggerDefinition, setTriggerDefinition] = useState<string>('');

    const connections = useStore(state => state.connections);
    const theme = useStore(state => state.theme);
    const language = useStore(state => state.language);
    const t = useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
    const darkMode = theme === 'dark';

    // 透明 Monaco Editor 主题已在 main.tsx 全局注册（含 stickyScroll 不透明背景）

    const escapeSQLLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");
    const quoteSqlServerIdentifier = (raw: string): string => `[${String(raw || '').replace(/]/g, ']]')}]`;

    const getMetadataDialect = (conn: SavedConnection | undefined): string => {
        const type = String(conn?.config?.type || '').trim().toLowerCase();
        if (type === 'custom') {
            const driver = String(conn?.config?.driver || '').trim().toLowerCase();
            if (driver === 'diros' || driver === 'doris') return 'mysql';
            return driver;
        }
        if (type === 'mariadb' || type === 'diros' || type === 'sphinx') return 'mysql';
        if (type === 'dameng') return 'dm';
        return type;
    };

    const isSphinxConnection = (conn: SavedConnection | undefined): boolean => {
        const type = String(conn?.config?.type || '').trim().toLowerCase();
        if (type === 'sphinx') return true;
        if (type !== 'custom') return false;
        const driver = String(conn?.config?.driver || '').trim().toLowerCase();
        return driver === 'sphinx' || driver === 'sphinxql';
    };

    const buildShowTriggerQueries = (dialect: string, triggerName: string, dbName: string): string[] => {
        const safeTriggerName = escapeSQLLiteral(triggerName);
        const safeDbName = escapeSQLLiteral(dbName);
        switch (dialect) {
            case 'mysql':
                return [
                    `SHOW CREATE TRIGGER \`${triggerName.replace(/`/g, '``')}\``,
                    safeDbName
                        ? `SELECT ACTION_STATEMENT AS trigger_definition FROM information_schema.triggers WHERE trigger_schema = '${safeDbName}' AND trigger_name = '${safeTriggerName}' LIMIT 1`
                        : '',
                    safeDbName
                        ? `SHOW TRIGGERS FROM \`${dbName.replace(/`/g, '``')}\` LIKE '${safeTriggerName}'`
                        : `SHOW TRIGGERS LIKE '${safeTriggerName}'`,
                ].filter(Boolean);
            case 'postgres':
            case 'kingbase':
            case 'highgo':
            case 'vastbase':
                return [`SELECT pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE t.tgname = '${safeTriggerName}'
  AND NOT t.tgisinternal
LIMIT 1`];
            case 'sqlserver': {
                return [`SELECT OBJECT_DEFINITION(OBJECT_ID('${safeTriggerName.replace(/'/g, "''")}')) AS trigger_definition`];
            }
            case 'oracle':
            case 'dm':
                if (!safeDbName) {
                    return [`SELECT TRIGGER_BODY FROM USER_TRIGGERS WHERE TRIGGER_NAME = '${safeTriggerName.toUpperCase()}'`];
                }
                return [`SELECT TRIGGER_BODY FROM ALL_TRIGGERS WHERE OWNER = '${safeDbName.toUpperCase()}' AND TRIGGER_NAME = '${safeTriggerName.toUpperCase()}'`];
            case 'sqlite':
                return [`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = '${safeTriggerName}'`];
            case 'duckdb':
                return [t('triggerViewer.unsupportedDatabase', { database: 'DuckDB' })];
            case 'tdengine':
                return [t('triggerViewer.unsupportedDatabase', { database: 'TDengine' })];
            case 'mongodb':
                return [t('triggerViewer.unsupportedDatabase', { database: 'MongoDB' })];
            default:
                return [t('triggerViewer.unsupportedDefinition')];
        }
    };

    const runQueryCandidates = async (
        config: RpcConnectionConfig,
        dbName: string,
        queries: string[]
    ): Promise<{ success: boolean; data: QueryRow[]; message?: string }> => {
        let lastMessage = '';
        let hasSuccessfulQuery = false;
        for (const query of queries) {
            const sql = String(query || '').trim();
            if (!sql) continue;
            try {
                const result = await DBQuery(config, dbName, sql);
                if (!result.success || !Array.isArray(result.data)) {
                    lastMessage = result.message || lastMessage;
                    continue;
                }
                hasSuccessfulQuery = true;
                if (result.data.length > 0) {
                    return { success: true, data: result.data as QueryRow[] };
                }
            } catch (error: unknown) {
                lastMessage = getErrorMessage(error);
            }
        }
        if (hasSuccessfulQuery) {
            return { success: true, data: [] };
        }
        return { success: false, data: [], message: lastMessage };
    };

    const getVersionHint = async (config: RpcConnectionConfig, dbName: string): Promise<string> => {
        const candidates = [
            `SELECT VERSION() AS version`,
            `SHOW VARIABLES LIKE 'version'`,
        ];
        for (const query of candidates) {
            try {
                const result = await DBQuery(config, dbName, query);
                if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
                    continue;
                }
                const row = result.data[0] as QueryRow;
                const version =
                    row.version
                    || row.VERSION
                    || row.Value
                    || row.value
                    || Object.values(row)[1]
                    || firstDefinedValue(row);
                const text = String(version || '').trim();
                if (text) return text;
            } catch {
                // ignore
            }
        }
        return '';
    };

    const extractTriggerDefinition = (dialect: string, data: QueryRow[]): string => {
        if (!data || data.length === 0) {
            return t('triggerViewer.notFound');
        }

        const row = data[0];

        switch (dialect) {
            case 'mysql': {
                // MySQL SHOW CREATE TRIGGER returns: Trigger, sql_mode, SQL Original Statement, ...
                const keys = Object.keys(row);
                if (row.trigger_definition || row.TRIGGER_DEFINITION) {
                    return String(row.trigger_definition || row.TRIGGER_DEFINITION);
                }
                if (row.ACTION_STATEMENT || row.action_statement) {
                    return String(row.ACTION_STATEMENT || row.action_statement);
                }
                const sqlKey = keys.find(k => k.toLowerCase().includes('statement') || k.toLowerCase() === 'sql original statement');
                if (sqlKey) return String(row[sqlKey] ?? '');
                // Fallback: try to find a key containing CREATE TRIGGER
                for (const key of keys) {
                    const val = String(row[key] || '');
                    if (val.toUpperCase().includes('CREATE TRIGGER')) {
                        return val;
                    }
                }
                return JSON.stringify(row, null, 2);
            }
            case 'postgres':
            case 'kingbase':
            case 'highgo':
            case 'vastbase': {
                return String(row.trigger_definition || row.TRIGGER_DEFINITION || firstDefinedValue(row) || '');
            }
            case 'sqlserver': {
                return String(row.trigger_definition || row.TRIGGER_DEFINITION || firstDefinedValue(row) || '');
            }
            case 'oracle':
            case 'dm': {
                return String(row.trigger_body || row.TRIGGER_BODY || firstDefinedValue(row) || '');
            }
            case 'sqlite': {
                return String(row.sql || row.SQL || firstDefinedValue(row) || '');
            }
            default:
                return JSON.stringify(row, null, 2);
        }
    };

    useEffect(() => {
        const loadTriggerDefinition = async () => {
            setLoading(true);
            setError(null);

            const conn = connections.find(c => c.id === tab.connectionId);
            if (!conn) {
                setError(t('triggerViewer.error.connectionMissing'));
                setLoading(false);
                return;
            }

            const triggerName = tab.triggerName || '';
            const dbName = tab.dbName || '';

            if (!triggerName) {
                setError(t('triggerViewer.error.nameEmpty'));
                setLoading(false);
                return;
            }

            const dialect = getMetadataDialect(conn);
            const queries = buildShowTriggerQueries(dialect, triggerName, dbName);
            const sphinxLike = isSphinxConnection(conn) && dialect === 'mysql';

            if (!queries.length || String(queries[0] || '').startsWith('--')) {
                setTriggerDefinition(String(queries[0] || t('triggerViewer.unsupportedDefinition')));
                setLoading(false);
                return;
            }

            try {
                const config = {
                    ...conn.config,
                    port: Number(conn.config.port),
                    password: conn.config.password || '',
                    database: conn.config.database || '',
                    useSSH: conn.config.useSSH || false,
                    ssh: conn.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' }
                };

                const rpcConfig = buildRpcConnectionConfig(config);
                const result = await runQueryCandidates(rpcConfig, dbName, queries);

                if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                    const definition = extractTriggerDefinition(dialect, result.data);
                    setTriggerDefinition(definition);
                    return;
                }

                if (result.success) {
                    if (sphinxLike) {
                        const version = await getVersionHint(rpcConfig, dbName);
                        const versionText = version ? t('triggerViewer.versionSuffix', { version }) : '';
                        setTriggerDefinition(t('triggerViewer.sphinxNoDefinition', { version: versionText }));
                        return;
                    }
                    setTriggerDefinition(t('triggerViewer.notFound'));
                } else if (sphinxLike) {
                    const version = await getVersionHint(rpcConfig, dbName);
                    const versionText = version ? t('triggerViewer.versionSuffix', { version }) : '';
                    setTriggerDefinition(t('triggerViewer.sphinxUnsupportedDefinition', { version: versionText, message: result.message || 'unknown error' }));
                } else {
                    setError(result.message || t('triggerViewer.error.queryFailed'));
                }
            } catch (e: unknown) {
                setError(t('triggerViewer.error.queryFailedWithMessage', { message: getErrorMessage(e) }));
            } finally {
                setLoading(false);
            }
        };

        loadTriggerDefinition();
    }, [tab.connectionId, tab.dbName, tab.triggerName, connections, t]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin tip={t('triggerViewer.loading')} />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: 16 }}>
                <Alert type="error" message={t('triggerViewer.loadFailed')} description={error} showIcon />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '8px 16px', borderBottom: darkMode ? '1px solid #303030' : '1px solid #f0f0f0' }}>
                <strong>{t('triggerViewer.triggerLabel')} </strong>{tab.triggerName}
                {tab.dbName && <span style={{ marginLeft: 16, color: '#888' }}>{t('triggerViewer.databaseLabel')} {tab.dbName}</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                    height="100%"
                    language="sql"
                    theme={darkMode ? 'transparent-dark' : 'transparent-light'}
                    value={triggerDefinition}
                    options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        automaticLayout: true,
                    }}
                />
            </div>
        </div>
    );
};

export default TriggerViewer;
