import React, { useState, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { Spin, Alert } from 'antd';
import type { SavedConnection, TabData } from '../types';
import { useStore } from '../store';
import { DBQuery } from '@compat/javanaviApp';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import type { RpcConnectionConfig } from '../utils/connectionRpcConfig';
import { translate, type I18nKey, type I18nParams } from '../i18n';

interface DefinitionViewerProps {
    tab: TabData;
}

type QueryRow = Record<string, unknown>;

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const firstDefinedValue = (row: QueryRow): unknown => Object.values(row)[0];

const normalizeMySQLViewDDL = (rawDefinition: unknown): string => {
    const text = String(rawDefinition || '').trim();
    if (!text) return '';

    const normalized = text.replace(/\r\n/g, '\n').trim().replace(/;+\s*$/, '');
    const createViewPrefixPattern = /^\s*create\s+(?:algorithm\s*=\s*\w+\s+)?(?:definer\s*=\s*(?:`[^`]+`|\S+)\s*@\s*(?:`[^`]+`|\S+)\s+)?(?:sql\s+security\s+(?:definer|invoker)\s+)?view\s+/i;
    if (createViewPrefixPattern.test(normalized)) {
        return `${normalized.replace(createViewPrefixPattern, 'CREATE OR REPLACE VIEW ')};`;
    }

    if (/^\s*(select|with)\b/i.test(normalized)) {
        return normalized;
    }

    return `${normalized};`;
};

const DefinitionViewer: React.FC<DefinitionViewerProps> = ({ tab }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [definition, setDefinition] = useState<string>('');

    const connections = useStore(state => state.connections);
    const theme = useStore(state => state.theme);
    const language = useStore(state => state.language);
    const t = useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
    const darkMode = theme === 'dark';

    const escapeSQLLiteral = (raw: string): string => String(raw || '').replace(/'/g, "''");

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

    const parseSchemaAndName = (fullName: string): { schema: string; name: string } => {
        const raw = String(fullName || '').trim();
        const idx = raw.lastIndexOf('.');
        if (idx > 0 && idx < raw.length - 1) {
            return { schema: raw.substring(0, idx), name: raw.substring(idx + 1) };
        }
        return { schema: '', name: raw };
    };

    const getCaseInsensitiveRawValue = (row: QueryRow, candidateKeys: string[]): unknown => {
        const keyMap = new Map<string, unknown>();
        Object.keys(row || {}).forEach((key) => keyMap.set(key.toLowerCase(), row[key]));
        for (const key of candidateKeys) {
            const value = keyMap.get(key.toLowerCase());
            if (value !== undefined && value !== null) {
                return value;
            }
        }
        return undefined;
    };

    const parseDuckDBParameterNames = (raw: unknown): string[] => {
        if (Array.isArray(raw)) {
            return raw
                .map((item) => String(item ?? '').trim())
                .filter((item) => item !== '' && item.toLowerCase() !== '<nil>');
        }
        const text = String(raw ?? '').trim();
        if (!text) return [];
        const normalized = text.startsWith('[') && text.endsWith(']')
            ? text.slice(1, -1)
            : text;
        return normalized
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part !== '' && part.toLowerCase() !== '<nil>');
    };

    const buildDuckDBMacroDDL = (
        schemaName: string,
        functionName: string,
        parametersRaw: unknown,
        macroDefinitionRaw: unknown
    ): string => {
        const schema = String(schemaName || '').trim();
        const name = String(functionName || '').trim();
        const macroDefinition = String(macroDefinitionRaw || '').trim();
        if (!name || !macroDefinition) return '';

        const parameters = parseDuckDBParameterNames(parametersRaw).join(', ');
        const qualifiedName = schema ? `${schema}.${name}` : name;
        const isTableMacro = !macroDefinition.startsWith('(');
        if (isTableMacro) {
            return `CREATE OR REPLACE MACRO ${qualifiedName}(${parameters}) AS TABLE ${macroDefinition};`;
        }
        return `CREATE OR REPLACE MACRO ${qualifiedName}(${parameters}) AS ${macroDefinition};`;
    };

    const buildShowViewQueries = (dialect: string, viewName: string, dbName: string): string[] => {
        const { schema, name } = parseSchemaAndName(viewName);
        const safeName = escapeSQLLiteral(name);
        const safeDbName = escapeSQLLiteral(dbName);

        switch (dialect) {
            case 'mysql':
                return [
                    `SHOW CREATE VIEW \`${name.replace(/`/g, '``')}\``,
                    safeDbName
                        ? `SELECT VIEW_DEFINITION AS view_definition FROM information_schema.views WHERE table_schema = '${safeDbName}' AND table_name = '${safeName}' LIMIT 1`
                        : '',
                    `SHOW CREATE TABLE \`${name.replace(/`/g, '``')}\``,
                ].filter(Boolean);
            case 'postgres':
            case 'kingbase':
            case 'highgo':
            case 'vastbase': {
                const schemaRef = schema || 'public';
                return [`SELECT pg_get_viewdef('${escapeSQLLiteral(schemaRef)}.${safeName}'::regclass, true) AS view_definition`];
            }
            case 'sqlserver':
                return [`SELECT OBJECT_DEFINITION(OBJECT_ID('${escapeSQLLiteral(viewName)}')) AS view_definition`];
            case 'oracle':
            case 'dm':
                if (schema) {
                    return [`SELECT TEXT AS view_definition FROM ALL_VIEWS WHERE OWNER = '${escapeSQLLiteral(schema).toUpperCase()}' AND VIEW_NAME = '${safeName.toUpperCase()}'`];
                }
                if (safeDbName) {
                    return [`SELECT TEXT AS view_definition FROM ALL_VIEWS WHERE OWNER = '${safeDbName.toUpperCase()}' AND VIEW_NAME = '${safeName.toUpperCase()}'`];
                }
                return [`SELECT TEXT AS view_definition FROM USER_VIEWS WHERE VIEW_NAME = '${safeName.toUpperCase()}'`];
            case 'sqlite':
                return [`SELECT sql AS view_definition FROM sqlite_master WHERE type='view' AND name='${safeName}'`];
            case 'duckdb': {
                const schemaRef = schema || 'main';
                return [`SELECT view_definition FROM information_schema.views WHERE table_schema = '${escapeSQLLiteral(schemaRef)}' AND table_name = '${safeName}' LIMIT 1`];
            }
            default:
                return [t('definitionViewer.unsupportedViewDefinition')];
        }
    };

    const buildShowRoutineQueries = (dialect: string, routineName: string, routineType: string, dbName: string): string[] => {
        const { schema, name } = parseSchemaAndName(routineName);
        const safeName = escapeSQLLiteral(name);
        const safeDbName = escapeSQLLiteral(dbName);
        const upperType = (routineType || 'FUNCTION').toUpperCase();

        switch (dialect) {
            case 'mysql':
                return [
                    `SHOW CREATE ${upperType} \`${name.replace(/`/g, '``')}\``,
                    safeDbName
                        ? `SELECT ROUTINE_DEFINITION AS routine_definition, ROUTINE_TYPE AS routine_type FROM information_schema.routines WHERE routine_schema = '${safeDbName}' AND routine_name = '${safeName}' LIMIT 1`
                        : '',
                    upperType === 'PROCEDURE'
                        ? `SHOW PROCEDURE STATUS LIKE '${safeName}'`
                        : `SHOW FUNCTION STATUS LIKE '${safeName}'`,
                ].filter(Boolean);
            case 'postgres':
            case 'kingbase':
            case 'highgo':
            case 'vastbase': {
                const schemaRef = schema || 'public';
                return [`SELECT pg_get_functiondef(p.oid) AS routine_definition FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = '${escapeSQLLiteral(schemaRef)}' AND p.proname = '${safeName}' LIMIT 1`];
            }
            case 'sqlserver':
                return [`SELECT OBJECT_DEFINITION(OBJECT_ID('${escapeSQLLiteral(routineName)}')) AS routine_definition`];
            case 'oracle':
            case 'dm': {
                const owner = schema ? escapeSQLLiteral(schema).toUpperCase() : (safeDbName ? safeDbName.toUpperCase() : '');
                if (owner) {
                    return [`SELECT TEXT FROM ALL_SOURCE WHERE OWNER = '${owner}' AND NAME = '${safeName.toUpperCase()}' AND TYPE = '${upperType}' ORDER BY LINE`];
                }
                return [`SELECT TEXT FROM USER_SOURCE WHERE NAME = '${safeName.toUpperCase()}' AND TYPE = '${upperType}' ORDER BY LINE`];
            }
            case 'duckdb': {
                const schemaRef = schema || 'main';
                const safeSchema = escapeSQLLiteral(schemaRef);
                return [
                    `SELECT schema_name, function_name, parameters, macro_definition FROM duckdb_functions() WHERE internal = false AND lower(function_type) = 'macro' AND schema_name = '${safeSchema}' AND function_name = '${safeName}' LIMIT 1`,
                    `SELECT schema_name, function_name, parameters, macro_definition FROM duckdb_functions() WHERE internal = false AND lower(function_type) = 'macro' AND function_name = '${safeName}' ORDER BY CASE WHEN schema_name = '${safeSchema}' THEN 0 ELSE 1 END, schema_name LIMIT 1`,
                ];
            }
            case 'sqlite':
                return [t('definitionViewer.unsupportedRoutineSqlite')];
            default:
                return [t('definitionViewer.unsupportedRoutineDefinition')];
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

    const extractViewDefinition = (dialect: string, data: QueryRow[]): string => {
        if (!data || data.length === 0) return t('definitionViewer.viewNotFound');
        const row = data[0];

        switch (dialect) {
            case 'mysql': {
                const keys = Object.keys(row);
                const textDefinition = row.view_definition || row.VIEW_DEFINITION;
                if (textDefinition) return normalizeMySQLViewDDL(textDefinition);
                const sqlKey = keys.find(k => k.toLowerCase().includes('create view') || k.toLowerCase() === 'create view');
                if (sqlKey) return normalizeMySQLViewDDL(row[sqlKey]);
                const tableSqlKey = keys.find(k => k.toLowerCase().includes('create table'));
                if (tableSqlKey) return normalizeMySQLViewDDL(row[tableSqlKey]);
                for (const key of keys) {
                    const val = String(row[key] || '');
                    if (val.toUpperCase().includes('CREATE') && (val.toUpperCase().includes('VIEW') || val.toUpperCase().includes('TABLE'))) {
                        return normalizeMySQLViewDDL(val);
                    }
                }
                return JSON.stringify(row, null, 2);
            }
            case 'oracle':
            case 'dm':
                return String(row.view_definition || row.VIEW_DEFINITION || row.text || row.TEXT || firstDefinedValue(row) || '');
            default:
                return String(row.view_definition || row.VIEW_DEFINITION || row.sql || row.SQL || firstDefinedValue(row) || '');
        }
    };

    const extractRoutineDefinition = (dialect: string, data: QueryRow[]): string => {
        if (!data || data.length === 0) return t('definitionViewer.routineNotFound');

        switch (dialect) {
            case 'mysql': {
                const row = data[0];
                const keys = Object.keys(row);
                if (row.routine_definition || row.ROUTINE_DEFINITION) {
                    return String(row.routine_definition || row.ROUTINE_DEFINITION);
                }
                const sqlKey = keys.find(k => k.toLowerCase().includes('create function') || k.toLowerCase().includes('create procedure'));
                if (sqlKey) return String(row[sqlKey] ?? '');
                for (const key of keys) {
                    const val = String(row[key] || '');
                    if (val.toUpperCase().includes('CREATE') && (val.toUpperCase().includes('FUNCTION') || val.toUpperCase().includes('PROCEDURE'))) {
                        return val;
                    }
                }
                const routineName = String(row.Name || row.name || '').trim();
                if (routineName) {
                    const routineType = String(row.Type || row.type || row.ROUTINE_TYPE || row.routine_type || 'FUNCTION').trim().toUpperCase();
                    return t('definitionViewer.metadataReturned', { name: routineName, type: routineType, metadata: JSON.stringify(row, null, 2) });
                }
                return JSON.stringify(row, null, 2);
            }
            case 'oracle':
            case 'dm': {
                // Oracle/DM ALL_SOURCE returns multiple rows, one per line
                return data.map(row => String(row.text || row.TEXT || firstDefinedValue(row) || '')).join('');
            }
            case 'duckdb': {
                const row = data[0];
                const ddl = buildDuckDBMacroDDL(
                    String(getCaseInsensitiveRawValue(row, ['schema_name']) || '').trim(),
                    String(getCaseInsensitiveRawValue(row, ['function_name', 'routine_name', 'name']) || '').trim(),
                    getCaseInsensitiveRawValue(row, ['parameters']),
                    getCaseInsensitiveRawValue(row, ['macro_definition'])
                );
                if (ddl) return ddl;
                const fallback = getCaseInsensitiveRawValue(row, ['macro_definition', 'routine_definition', 'definition']);
                if (fallback !== undefined && fallback !== null && String(fallback).trim() !== '') {
                    return String(fallback);
                }
                return JSON.stringify(row, null, 2);
            }
            default: {
                const row = data[0];
                return String(row.routine_definition || row.ROUTINE_DEFINITION || firstDefinedValue(row) || '');
            }
        }
    };

    useEffect(() => {
        const loadDefinition = async () => {
            setLoading(true);
            setError(null);

            const conn = connections.find(c => c.id === tab.connectionId);
            if (!conn) {
                setError(t('definitionViewer.error.connectionMissing'));
                setLoading(false);
                return;
            }

            const dbName = tab.dbName || '';
            const dialect = getMetadataDialect(conn);
            const sphinxLike = isSphinxConnection(conn) && dialect === 'mysql';

            let queries: string[];
            let extractFn: (dialect: string, data: QueryRow[]) => string;
            let objectLabel: string;

            if (tab.type === 'view-def') {
                const viewName = tab.viewName || '';
                if (!viewName) {
                    setError(t('definitionViewer.error.viewNameEmpty'));
                    setLoading(false);
                    return;
                }
                queries = buildShowViewQueries(dialect, viewName, dbName);
                extractFn = extractViewDefinition;
                objectLabel = t('definitionViewer.object.view');
            } else {
                const routineName = tab.routineName || '';
                const routineType = tab.routineType || 'FUNCTION';
                if (!routineName) {
                    setError(t('definitionViewer.error.routineNameEmpty'));
                    setLoading(false);
                    return;
                }
                queries = buildShowRoutineQueries(dialect, routineName, routineType, dbName);
                extractFn = extractRoutineDefinition;
                objectLabel = t('definitionViewer.object.routine');
            }

            if (!queries.length || String(queries[0] || '').startsWith('--')) {
                setDefinition(String(queries[0] || t('definitionViewer.defaultUnsupportedDefinition')));
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
                    const def = extractFn(dialect, result.data);
                    setDefinition(def);
                    return;
                }

                if (result.success) {
                    if (sphinxLike) {
                        const version = await getVersionHint(rpcConfig, dbName);
                        const versionText = version ? t('definitionViewer.versionSuffix', { version }) : '';
                        setDefinition(t('definitionViewer.sphinxNoDefinition', { version: versionText, object: objectLabel }));
                        return;
                    }
                    setDefinition(t('definitionViewer.definitionNotFound', { object: objectLabel }));
                } else if (sphinxLike) {
                    const version = await getVersionHint(rpcConfig, dbName);
                    const versionText = version ? t('definitionViewer.versionSuffix', { version }) : '';
                    setDefinition(t('definitionViewer.sphinxUnsupportedDefinition', { version: versionText, object: objectLabel, message: result.message || 'unknown error' }));
                } else {
                    setError(result.message || t('definitionViewer.error.queryFailed'));
                }
            } catch (e: unknown) {
                setError(t('definitionViewer.error.queryFailedWithMessage', { message: getErrorMessage(e) }));
            } finally {
                setLoading(false);
            }
        };

        loadDefinition();
    }, [tab.connectionId, tab.dbName, tab.viewName, tab.routineName, tab.routineType, tab.type, connections, t]);

    const objectLabel = tab.type === 'view-def' ? t('definitionViewer.object.view') : t('definitionViewer.object.routine');
    const objectName = tab.type === 'view-def' ? tab.viewName : tab.routineName;

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin tip={t('definitionViewer.loading', { object: objectLabel })} />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: 16 }}>
                <Alert type="error" message={t('definitionViewer.loadFailed')} description={error} showIcon />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '8px 16px', borderBottom: darkMode ? '1px solid #303030' : '1px solid #f0f0f0' }}>
                <strong>{objectLabel}: </strong>{objectName}
                {tab.dbName && <span style={{ marginLeft: 16, color: '#888' }}>{t('definitionViewer.databaseLabel')} {tab.dbName}</span>}
                {tab.routineType && <span style={{ marginLeft: 16, color: '#888' }}>{t('definitionViewer.typeLabel')} {tab.routineType}</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                    height="100%"
                    language="sql"
                    theme={darkMode ? 'transparent-dark' : 'transparent-light'}
                    value={definition}
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

export default DefinitionViewer;
