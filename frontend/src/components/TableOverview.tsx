import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { Input, Spin, Empty, Dropdown, message, Tooltip, Modal, Button, Checkbox, Radio, Space } from 'antd';
import type { MenuProps } from 'antd';
import { TableOutlined, SearchOutlined, ReloadOutlined, SortAscendingOutlined, DatabaseOutlined, ConsoleSqlOutlined, EditOutlined, CopyOutlined, SaveOutlined, DeleteOutlined, ExportOutlined, WarningOutlined, DownOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { ClearTables, CopyTables, DBQuery, DBShowCreateTable, DBShowCreateTables, ExportTable, ExportTablesDataSQL, ExportTablesSQL, DropTable, DropTables, RenameTable, RenameTables, TruncateTables } from '@compat/javanaviApp';
import type { ConnectionConfig, TabData } from '../types';
import { useAutoFetchVisibility } from '../utils/autoFetchVisibility';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { noAutoCapInputProps } from '../utils/inputAutoCap';
import { getTableDataDangerActionMeta, supportsTableTruncateAction, type TableDataDangerActionKind } from './tableDataDangerActions';
import { buildTableSelectQuery } from '../utils/objectQueryTemplates';
import { buildTableHoverTitle } from '../utils/tableHoverTitle';
import { isEditableElement } from '../utils/shortcuts';
import { translate, type I18nKey, type I18nParams } from '../i18n';
import {
    TABLE_OVERVIEW_RENDER_BATCH_SIZE,
    buildTableOverviewSearchIndex,
    filterAndSortTableOverviewRows,
    resolveTableOverviewVisibleRows,
    type TableOverviewSortField,
    type TableOverviewSortOrder,
} from '../utils/tableOverviewFilter';

interface TableOverviewProps {
    tab: TabData;
}

type TableOverviewTabData = TabData & { schemaName?: string };
type QueryRow = Record<string, unknown>;

interface TableStatRow {
    name: string;
    comment: string;
    rows: number;
    dataSize: number;
    indexSize: number;
    engine: string;
    createTime: string;
    updateTime: string;
}

type SortField = TableOverviewSortField;
type SortOrder = TableOverviewSortOrder;
type CopyTableMode = 'structure' | 'structureData';
type TableOverviewBulkActionKey = 'exportData' | 'truncate' | 'clear' | 'delete' | 'rename' | 'copyStructure' | 'backup' | 'copyTable';

const formatSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatRows = (count: number): string => {
    if (count === undefined || count === null || count < 0) return '—';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
};

const getMetadataDialect = (connType: string, driver?: string): string => {
    const type = (connType || '').trim().toLowerCase();
    if (type === 'custom') {
        const d = (driver || '').trim().toLowerCase();
        if (d === 'diros' || d === 'doris') return 'mysql';
        return d;
    }
    if (type === 'mariadb' || type === 'diros' || type === 'sphinx') return 'mysql';
    if (type === 'dameng') return 'dm';
    return type;
};

const buildTableStatusSQL = (dialect: string, dbName: string, schemaName?: string): string => {
        const escapeLiteral = (s: string) => s.replace(/'/g, "''");
        switch (dialect) {
        case 'mysql':
            return `
SELECT
    TABLE_NAME AS table_name,
    TABLE_COMMENT AS table_comment,
    TABLE_ROWS AS table_rows,
    DATA_LENGTH AS data_length,
    INDEX_LENGTH AS index_length,
    ENGINE AS engine,
    CREATE_TIME AS create_time,
    UPDATE_TIME AS update_time
FROM information_schema.tables
WHERE table_schema = '${escapeLiteral(dbName)}'
  AND table_type = 'BASE TABLE'
ORDER BY table_name`;
        case 'postgres':
        case 'kingbase':
        case 'vastbase':
        case 'highgo': {
            const schema = schemaName || 'public';
            return `
SELECT
    n.nspname || '.' || c.relname AS table_name,
    obj_description(c.oid, 'pg_class') AS table_comment,
    c.reltuples::bigint AS table_rows,
    pg_total_relation_size(c.oid) AS data_length,
    pg_indexes_size(c.oid) AS index_length
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = '${escapeLiteral(schema)}'
ORDER BY c.relname`;
        }
        case 'sqlserver': {
            const safeDB = `[${dbName.replace(/]/g, ']]')}]`;
            return `
SELECT
    s.name + '.' + t.name AS table_name,
    ep.value AS table_comment,
    SUM(p.rows) AS table_rows,
    SUM(a.total_pages) * 8 * 1024 AS data_length,
    SUM(a.used_pages) * 8 * 1024 AS index_length
FROM ${safeDB}.sys.tables t
JOIN ${safeDB}.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN ${safeDB}.sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
LEFT JOIN ${safeDB}.sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
LEFT JOIN ${safeDB}.sys.allocation_units a ON p.partition_id = a.container_id
WHERE t.type = 'U'
GROUP BY s.name, t.name, ep.value
ORDER BY s.name, t.name`;
        }
        case 'clickhouse':
            return `SELECT name AS table_name, comment AS table_comment, total_rows AS table_rows, total_bytes AS data_length, 0 AS index_length FROM system.tables WHERE database = '${escapeLiteral(dbName)}' AND engine NOT IN ('View', 'MaterializedView') ORDER BY name`;
        case 'dm':
        case 'oracle': {
            const owner = (schemaName || dbName).toUpperCase();
            return `SELECT table_name, comments AS table_comment, num_rows AS table_rows, 0 AS data_length, 0 AS index_length FROM all_tab_comments JOIN all_tables USING (table_name, owner) WHERE owner = '${escapeLiteral(owner)}' ORDER BY table_name`;
        }
        default:
            return `SELECT table_name, '' AS table_comment, 0 AS table_rows, 0 AS data_length, 0 AS index_length FROM information_schema.tables WHERE table_schema = '${escapeLiteral(dbName)}' AND table_type = 'BASE TABLE' ORDER BY table_name`;
    }
};

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const parseTableStats = (dialect: string, rows: QueryRow[]): TableStatRow[] => {
    return rows.map((row) => {
        const get = (keys: string[]): unknown => {
            for (const k of keys) {
                for (const rk of Object.keys(row)) {
                    if (rk.toLowerCase() === k.toLowerCase() && row[rk] !== null && row[rk] !== undefined) return row[rk];
                }
            }
            return undefined;
        };
        const strVal = (keys: string[]) => String(get(keys) ?? '').trim();
        const numVal = (keys: string[]) => {
            const v = get(keys);
            if (v === null || v === undefined || v === '') return 0;
            const n = Number(v);
            return isNaN(n) ? 0 : Math.max(0, Math.round(n));
        };

        return {
            name: strVal(['Name', 'table_name', 'tablename', 'TABLE_NAME']),
            comment: strVal(['Comment', 'table_comment', 'TABLE_COMMENT', 'comments']),
            rows: numVal(['Rows', 'table_rows', 'TABLE_ROWS', 'num_rows', 'reltuples', 'total_rows']),
            dataSize: numVal(['Data_length', 'data_length', 'DATA_LENGTH', 'total_bytes']),
            indexSize: numVal(['Index_length', 'index_length', 'INDEX_LENGTH']),
            engine: strVal(['Engine', 'engine']),
            createTime: strVal(['Create_time', 'create_time']),
            updateTime: strVal(['Update_time', 'update_time']),
        };
    }).filter(t => t.name);
};

const normalizeStructureClipboardText = (structures: string[]): string => (
    structures
        .map(sql => String(sql || '').trim())
        .filter(Boolean)
        .map(sql => (sql.endsWith(';') ? sql : `${sql};`))
        .join('\n\n')
);

const TableOverview: React.FC<TableOverviewProps> = ({ tab }) => {
    const connections = useStore(state => state.connections);
    const theme = useStore(state => state.theme);
    const addTab = useStore(state => state.addTab);
    const activeTabId = useStore(state => state.activeTabId);
    const setActiveContext = useStore(state => state.setActiveContext);
    const language = useStore(state => state.language);
    const t = useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
    const darkMode = theme === 'dark';

    const [tables, setTables] = useState<TableStatRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [visibleTableLimit, setVisibleTableLimit] = useState(TABLE_OVERVIEW_RENDER_BATCH_SIZE);
    const [selectedTableNames, setSelectedTableNames] = useState<string[]>([]);
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [copyTableMode, setCopyTableMode] = useState<CopyTableMode>('structure');
    const [copyTablePrefix, setCopyTablePrefix] = useState('');
    const [copyTableSuffix, setCopyTableSuffix] = useState('_copy');
    const [bulkRenameModalOpen, setBulkRenameModalOpen] = useState(false);
    const [bulkRenameValues, setBulkRenameValues] = useState<Record<string, string>>({});
    const deferredSearchText = useDeferredValue(searchText);
    const isSearchPending = searchText !== deferredSearchText;

    const connection = useMemo(() => connections.find(c => c.id === tab.connectionId), [connections, tab.connectionId]);
    const metadataDialect = useMemo(
        () => getMetadataDialect(connection?.config?.type || '', connection?.config?.driver),
        [connection?.config?.driver, connection?.config?.type]
    );
    const autoFetchVisible = useAutoFetchVisibility();

    const loadData = useCallback(async () => {
        if (!connection) return;
        setLoading(true);
        try {
            const config = {
                ...connection.config,
                port: Number(connection.config.port),
                password: connection.config.password || '',
                database: connection.config.database || '',
                useSSH: connection.config.useSSH || false,
                ssh: connection.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
            };
            const sql = buildTableStatusSQL(metadataDialect, tab.dbName || '', (tab as TableOverviewTabData).schemaName);
            const res = await DBQuery(buildRpcConnectionConfig(config), tab.dbName || '', sql);
            if (res.success && Array.isArray(res.data)) {
                setTables(parseTableStats(metadataDialect, res.data as QueryRow[]));
            } else {
                message.error('获取表信息失败: ' + (res.message || '未知错误'));
            }
        } catch (e: unknown) {
            message.error('获取表信息失败: ' + getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }, [connection, metadataDialect, tab.dbName]);

    useEffect(() => {
        if (!autoFetchVisible) {
            return;
        }
        void loadData();
    }, [autoFetchVisible, loadData]);

    useEffect(() => {
        const handleRefreshActiveTableOverview = () => {
            if (useStore.getState().activeTabId !== tab.id) {
                return;
            }
            void loadData();
        };

        window.addEventListener('javanavi:refresh-active-table-overview', handleRefreshActiveTableOverview as EventListener);
        return () => {
            window.removeEventListener('javanavi:refresh-active-table-overview', handleRefreshActiveTableOverview as EventListener);
        };
    }, [loadData, tab.id]);

    const tableSearchIndex = useMemo(() => buildTableOverviewSearchIndex(tables), [tables]);

    const sortedFiltered = useMemo(() => (
        filterAndSortTableOverviewRows(tableSearchIndex, deferredSearchText, sortField, sortOrder)
    ), [deferredSearchText, sortField, sortOrder, tableSearchIndex]);

    useEffect(() => {
        setVisibleTableLimit(TABLE_OVERVIEW_RENDER_BATCH_SIZE);
    }, [deferredSearchText, sortField, sortOrder, tables]);

    const visibleOverview = useMemo(() => (
        resolveTableOverviewVisibleRows(sortedFiltered, visibleTableLimit)
    ), [sortedFiltered, visibleTableLimit]);

    const visibleTables = visibleOverview.visibleRows;
    const selectedTableSet = useMemo(() => new Set(selectedTableNames), [selectedTableNames]);
    const selectedTableCount = selectedTableNames.length;
    const filteredTableNames = useMemo(() => sortedFiltered.map(table => table.name), [sortedFiltered]);
    const allFilteredTablesSelected = filteredTableNames.length > 0 && filteredTableNames.every(name => selectedTableSet.has(name));
    const visibleTableNames = useMemo(() => visibleTables.map(table => table.name), [visibleTables]);
    const visibleSelectedCount = useMemo(
        () => visibleTableNames.filter(name => selectedTableSet.has(name)).length,
        [selectedTableSet, visibleTableNames]
    );

    const showTaskCreated = useCallback(() => {
        message.success(t('taskCenter.created'));
        window.dispatchEvent(new CustomEvent('javanavi:open-task-center'));
    }, [t]);

    useEffect(() => {
        const existingNames = new Set(tables.map(table => table.name));
        setSelectedTableNames(prev => prev.filter(name => existingNames.has(name)));
    }, [tables]);

    const openTable = useCallback((table: TableStatRow) => {
        if (!connection) return;
        const tableName = table.name;
        setActiveContext({ connectionId: connection.id, dbName: tab.dbName || '' });
        addTab({
            id: `${connection.id}-${tab.dbName}-${tableName}`,
            title: tableName,
            type: 'table',
            connectionId: connection.id,
            dbName: tab.dbName,
            tableName,
            tableComment: table.comment,
        });
    }, [connection, tab.dbName, addTab, setActiveContext]);

    const openDesign = useCallback((table: TableStatRow) => {
        if (!connection) return;
        const tableName = table.name;
        setActiveContext({ connectionId: connection.id, dbName: tab.dbName || '' });
        addTab({
            id: `design-${connection.id}-${tab.dbName}-${tableName}`,
            title: `设计表 (${tableName})`,
            type: 'design',
            connectionId: connection.id,
            dbName: tab.dbName,
            tableName,
            tableComment: table.comment,
            initialTab: 'columns',
            readOnly: false,
        });
    }, [connection, tab.dbName, addTab, setActiveContext]);

    const buildConfig = useCallback((): ConnectionConfig | null => {
        if (!connection) return null;
        return {
            ...connection.config,
            port: Number(connection.config.port),
            password: connection.config.password || '',
            database: connection.config.database || '',
            useSSH: connection.config.useSSH || false,
            ssh: connection.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
        };
    }, [connection]);

    const handleCopyStructure = useCallback(async (tableName: string) => {
        const config = buildConfig();
        if (!config) return;
        const res = await DBShowCreateTable(buildRpcConnectionConfig(config), tab.dbName || '', tableName);
        if (res.success) {
            navigator.clipboard.writeText(res.data as string);
            message.success(t('sidebar.msg.schemaCopied'));
        } else {
            message.error(res.message);
        }
    }, [buildConfig, tab.dbName, t]);

    const handleExport = useCallback(async (tableName: string, format: string) => {
        const config = buildConfig();
        if (!config) return;
        const res = await ExportTable(buildRpcConnectionConfig(config), tab.dbName || '', tableName, format);
        if (res.success) {
            showTaskCreated();
        } else if (res.message !== '已取消') {
            message.error(t('sidebar.msg.exportFailed', { message: res.message }));
        }
    }, [buildConfig, showTaskCreated, tab.dbName, t]);

    const handleBulkExportTableData = useCallback(async () => {
        const config = buildConfig();
        if (!config) return;
        if (selectedTableNames.length === 0) {
            message.warning(t('tableOverview.bulk.selectRequired'));
            return;
        }
        try {
            const res = await ExportTablesDataSQL(buildRpcConnectionConfig(config), tab.dbName || '', selectedTableNames);
            if (res.success) {
                showTaskCreated();
            } else if (res.message !== '已取消') {
                message.error(t('sidebar.msg.exportFailed', { message: res.message }));
            }
        } catch (e: unknown) {
            message.error(t('sidebar.msg.exportFailed', { message: getErrorMessage(e) }));
        }
    }, [buildConfig, selectedTableNames, showTaskCreated, tab.dbName, t]);

    const handleBulkBackupTables = useCallback(async () => {
        const config = buildConfig();
        if (!config) return;
        if (selectedTableNames.length === 0) {
            message.warning(t('tableOverview.bulk.selectRequired'));
            return;
        }
        try {
            const res = await ExportTablesSQL(buildRpcConnectionConfig(config), tab.dbName || '', selectedTableNames, true);
            if (res.success) {
                showTaskCreated();
            } else if (res.message !== '已取消') {
                message.error(t('sidebar.msg.exportFailed', { message: res.message }));
            }
        } catch (e: unknown) {
            message.error(t('sidebar.msg.exportFailed', { message: getErrorMessage(e) }));
        }
    }, [buildConfig, selectedTableNames, showTaskCreated, tab.dbName, t]);

    const handleBulkCopyStructure = useCallback(async () => {
        const config = buildConfig();
        if (!config) return;
        if (selectedTableNames.length === 0) {
            message.warning(t('tableOverview.bulk.selectRequired'));
            return;
        }
        const hide = message.loading(t('tableOverview.bulk.copyStructureLoading', { count: selectedTableNames.length }), 0);
        try {
            const res = await DBShowCreateTables(buildRpcConnectionConfig(config), tab.dbName || '', selectedTableNames);
            if (!res.success || !Array.isArray(res.data)) {
                hide();
                message.error(t('tableOverview.bulk.copyStructureFailed', { name: '', message: res.message }));
                return;
            }
            await navigator.clipboard.writeText(normalizeStructureClipboardText(res.data.map(item => String(item || ''))));
            hide();
            message.success(t('tableOverview.bulk.copyStructureSuccess', { count: selectedTableNames.length }));
        } catch (e: unknown) {
            hide();
            message.error(t('tableOverview.bulk.copyStructureFailed', { name: '', message: getErrorMessage(e) }));
        }
    }, [buildConfig, selectedTableNames, tab.dbName, t]);

    const handleDeleteTable = useCallback((tableName: string) => {
        const config = buildConfig();
        if (!config) return;
        Modal.confirm({
            title: '确认删除表',
            content: `确定删除表 "${tableName}" 吗？该操作不可恢复。`,
            okButtonProps: { danger: true },
            onOk: async () => {
                const res = await DropTable(buildRpcConnectionConfig(config), tab.dbName || '', tableName);
                if (res.success) {
                    message.success('表删除成功');
                    loadData();
                } else {
                    message.error('删除失败: ' + res.message);
                }
            },
        });
    }, [buildConfig, tab.dbName, loadData]);

    const handleTableDataDangerAction = useCallback((tableName: string, action: TableDataDangerActionKind) => {
        const config = buildConfig();
        if (!config) return;

        const { label, progressLabel } = getTableDataDangerActionMeta(action);
        Modal.confirm({
            title: `确认${label}`,
            content: `${label}会永久删除表 "${tableName}" 中的所有数据，操作不可逆，是否继续？`,
            okText: '继续',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: async () => {
                const method = action === 'truncate' ? TruncateTables : ClearTables;
                const hide = message.loading(`正在${progressLabel} ${tableName}...`, 0);
                try {
                    const res = await method(buildRpcConnectionConfig(config), tab.dbName || '', [tableName]);
                    hide();
                    if (res.success) {
                        message.success(`${progressLabel}成功`);
                        loadData();
                    } else {
                        message.error(`${progressLabel}失败: ${res.message}`);
                        return Promise.reject();
                    }
                } catch (e: unknown) {
                    hide();
                    message.error(`${progressLabel}失败: ${getErrorMessage(e)}`);
                    return Promise.reject();
                }
            },
        });
    }, [buildConfig, tab.dbName, loadData]);

    const handleBulkTableDataDangerAction = useCallback((action: TableDataDangerActionKind) => {
        const config = buildConfig();
        if (!config) return;
        if (selectedTableNames.length === 0) {
            message.warning(t('tableOverview.bulk.selectRequired'));
            return;
        }

        const { label, progressLabel } = getTableDataDangerActionMeta(action);
        Modal.confirm({
            title: t('tableOverview.bulk.confirmDangerTitle', { label }),
            content: t('tableOverview.bulk.confirmDangerContent', { label, count: selectedTableNames.length }),
            okText: t('sidebar.modal.continue'),
            cancelText: t('common.cancel'),
            okButtonProps: { danger: true },
            onOk: async () => {
                const method = action === 'truncate' ? TruncateTables : ClearTables;
                const hide = message.loading(t('tableOverview.bulk.dangerLoading', { label: progressLabel, count: selectedTableNames.length }), 0);
                try {
                    const res = await method(buildRpcConnectionConfig(config), tab.dbName || '', selectedTableNames);
                    hide();
                    if (res.success) {
                        message.success(t('tableOverview.bulk.dangerSuccess', { label: progressLabel }));
                        setSelectedTableNames([]);
                        loadData();
                    } else {
                        message.error(t('tableOverview.bulk.dangerFailed', { label: progressLabel, message: res.message }));
                        return Promise.reject();
                    }
                } catch (e: unknown) {
                    hide();
                    message.error(t('tableOverview.bulk.dangerFailed', { label: progressLabel, message: getErrorMessage(e) }));
                    return Promise.reject();
                }
            },
        });
    }, [buildConfig, loadData, selectedTableNames, tab.dbName, t]);

    const handleBulkDeleteTables = useCallback(() => {
        const config = buildConfig();
        if (!config) return;
        if (selectedTableNames.length === 0) {
            message.warning(t('tableOverview.bulk.selectRequired'));
            return;
        }

        Modal.confirm({
            title: t('tableOverview.bulk.deleteTitle'),
            content: t('tableOverview.bulk.deleteContent', { count: selectedTableNames.length }),
            okButtonProps: { danger: true },
            onOk: async () => {
                const hide = message.loading(t('tableOverview.bulk.deleteLoading', { count: selectedTableNames.length }), 0);
                try {
                    const res = await DropTables(buildRpcConnectionConfig(config), tab.dbName || '', selectedTableNames);
                    hide();
                    if (!res.success) {
                        message.error(t('tableOverview.bulk.deleteFailed', { name: '', message: res.message }));
                        return Promise.reject();
                    }
                    message.success(t('tableOverview.bulk.deleteSuccess', { count: selectedTableNames.length }));
                    setSelectedTableNames([]);
                    await loadData();
                } catch (e: unknown) {
                    hide();
                    message.error(t('tableOverview.bulk.deleteFailed', { name: '', message: getErrorMessage(e) }));
                    return Promise.reject();
                }
            },
        });
    }, [buildConfig, loadData, selectedTableNames, tab.dbName, t]);

    const handleRenameTable = useCallback((tableName: string) => {
        const config = buildConfig();
        if (!config) return;
        let newName = tableName;
        Modal.confirm({
            title: '重命名表',
            content: (
                <Input
                    {...noAutoCapInputProps}
                    defaultValue={tableName}
                    onChange={e => { newName = e.target.value; }}
                    placeholder="输入新表名"
                    autoFocus
                    style={{ marginTop: 8 }}
                />
            ),
            onOk: async () => {
                const trimmed = newName.trim();
                if (!trimmed) { message.error('表名不能为空'); return Promise.reject(); }
                if (trimmed === tableName) { message.warning('新旧表名相同'); return; }
                const res = await RenameTable(buildRpcConnectionConfig(config), tab.dbName || '', tableName, trimmed);
                if (res.success) {
                    message.success('表重命名成功');
                    loadData();
                } else {
                    message.error('重命名失败: ' + res.message);
                }
            },
        });
    }, [buildConfig, tab.dbName, loadData]);

    const openBulkRenameModal = useCallback(() => {
        if (selectedTableNames.length === 0) {
            message.warning(t('tableOverview.bulk.selectRequired'));
            return;
        }
        setBulkRenameValues(Object.fromEntries(selectedTableNames.map(name => [name, name])));
        setBulkRenameModalOpen(true);
    }, [selectedTableNames, t]);

    const handleBulkRenameTables = useCallback(async () => {
        const config = buildConfig();
        if (!config) return;
        const renamePairs = selectedTableNames.map(name => ({
            oldName: name,
            newName: String(bulkRenameValues[name] || '').trim(),
        }));
        if (renamePairs.some(pair => !pair.newName)) {
            message.error(t('tableOverview.bulk.renameNameRequired'));
            return Promise.reject();
        }
        const changedPairs = renamePairs.filter(pair => pair.oldName !== pair.newName);
        if (changedPairs.length === 0) {
            message.warning(t('tableOverview.bulk.renameNoChange'));
            return Promise.reject();
        }

        const hide = message.loading(t('tableOverview.bulk.renameLoading', { count: changedPairs.length }), 0);
        try {
            const res = await RenameTables(buildRpcConnectionConfig(config), tab.dbName || '', changedPairs);
            hide();
            if (!res.success) {
                message.error(t('tableOverview.bulk.renameFailed', { name: '', message: res.message }));
                return Promise.reject();
            }
            message.success(t('tableOverview.bulk.renameSuccess', { count: changedPairs.length }));
            setBulkRenameModalOpen(false);
            setBulkRenameValues({});
            setSelectedTableNames([]);
            await loadData();
        } catch (e: unknown) {
            hide();
            message.error(t('tableOverview.bulk.renameFailed', { name: '', message: getErrorMessage(e) }));
            return Promise.reject();
        }
    }, [buildConfig, bulkRenameValues, loadData, selectedTableNames, tab.dbName, t]);

    const toggleSelectedTable = useCallback((tableName: string, checked: boolean) => {
        setSelectedTableNames(prev => {
            const next = new Set(prev);
            if (checked) {
                next.add(tableName);
            } else {
                next.delete(tableName);
            }
            return Array.from(next);
        });
    }, []);

    const rowSelection = useMemo(() => ({
        selectedRowKeys: selectedTableNames,
        onChange: (keys: React.Key[]) => setSelectedTableNames(keys.map(String)),
    }), [selectedTableNames]);

    const selectVisibleTables = useCallback((checked: boolean) => {
        setSelectedTableNames(prev => {
            const next = new Set(prev);
            visibleTableNames.forEach((name) => {
                if (checked) {
                    next.add(name);
                } else {
                    next.delete(name);
                }
            });
            return Array.from(next);
        });
    }, [visibleTableNames]);

    const handleTableOverviewSelectAll = useCallback((event: Pick<KeyboardEvent | React.KeyboardEvent<HTMLDivElement>, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'target' | 'preventDefault'>) => {
        if (copyModalOpen) {
            return;
        }
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'a') {
            return;
        }
        if (isEditableElement(event.target)) {
            return;
        }
        event.preventDefault();
        setSelectedTableNames(allFilteredTablesSelected ? [] : filteredTableNames);
    }, [allFilteredTablesSelected, copyModalOpen, filteredTableNames]);

    const handleTableOverviewKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        handleTableOverviewSelectAll(event);
    }, [handleTableOverviewSelectAll]);

    useEffect(() => {
        if (activeTabId !== tab.id) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => handleTableOverviewSelectAll(event);
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeTabId, handleTableOverviewSelectAll, tab.id]);

    const openCopyTablesModal = useCallback((tableNames?: string[]) => {
        const names = tableNames && tableNames.length > 0 ? tableNames : rowSelection.selectedRowKeys.map(String);
        if (names.length === 0) {
            message.warning(t('tableOverview.copy.selectRequired'));
            return;
        }
        setSelectedTableNames(names);
        setCopyTableMode('structure');
        setCopyTablePrefix('');
        setCopyTableSuffix('_copy');
        setCopyModalOpen(true);
    }, [rowSelection.selectedRowKeys, t]);

    const handleCopyTables = useCallback(async () => {
        const config = buildConfig();
        const targetSuffix = copyTableSuffix.trim();
        const targetPrefix = copyTablePrefix.trim();
        if (!config) return;
        if (selectedTableNames.length === 0) {
            message.warning(t('tableOverview.copy.selectRequired'));
            return Promise.reject();
        }
        if (!targetPrefix && !targetSuffix) {
            message.error(t('tableOverview.copy.nameRequired'));
            return Promise.reject();
        }
        try {
            const res = await CopyTables(
                buildRpcConnectionConfig(config),
                tab.dbName || '',
                selectedTableNames,
                targetPrefix,
                targetSuffix,
                copyTableMode === 'structureData'
            );
            if (res.success) {
                showTaskCreated();
                setCopyModalOpen(false);
                setSelectedTableNames([]);
                return;
            }
            message.error(t('tableOverview.copy.failed', { message: res.message }));
            return Promise.reject();
        } catch (e: unknown) {
            message.error(t('tableOverview.copy.failed', { message: getErrorMessage(e) }));
            return Promise.reject();
        }
    }, [buildConfig, copyTableMode, copyTablePrefix, copyTableSuffix, selectedTableNames, showTaskCreated, tab.dbName, t]);

    const handleBulkActionClick = useCallback((action: TableOverviewBulkActionKey) => {
        switch (action) {
            case 'exportData':
                void handleBulkExportTableData();
                break;
            case 'truncate':
                handleBulkTableDataDangerAction('truncate');
                break;
            case 'clear':
                handleBulkTableDataDangerAction('clear');
                break;
            case 'delete':
                handleBulkDeleteTables();
                break;
            case 'rename':
                openBulkRenameModal();
                break;
            case 'copyStructure':
                void handleBulkCopyStructure();
                break;
            case 'backup':
                void handleBulkBackupTables();
                break;
            case 'copyTable':
                openCopyTablesModal();
                break;
            default:
                break;
        }
    }, [handleBulkBackupTables, handleBulkCopyStructure, handleBulkDeleteTables, handleBulkExportTableData, handleBulkTableDataDangerAction, openBulkRenameModal, openCopyTablesModal]);

    const openNewQueryForTable = useCallback((tableName: string) => {
        setActiveContext({ connectionId: tab.connectionId, dbName: tab.dbName || '' });
        addTab({
            id: `query-${Date.now()}`,
            title: '新建查询',
            type: 'query',
            connectionId: tab.connectionId,
            dbName: tab.dbName,
            query: buildTableSelectQuery(metadataDialect, tableName),
        });
    }, [addTab, metadataDialect, setActiveContext, tab.connectionId, tab.dbName]);

    const allowTruncate = supportsTableTruncateAction(connection?.config?.type || '', connection?.config?.driver);

    const buildTableMenuItems = useCallback((table: TableStatRow): MenuProps['items'] => [
        { key: 'new-query', label: '新建查询', icon: <ConsoleSqlOutlined />, onClick: () => openNewQueryForTable(table.name) },
        { type: 'divider' },
        { key: 'design-table', label: '设计表', icon: <EditOutlined />, onClick: () => openDesign(table) },
        { key: 'copy-table', label: t('tableOverview.copy.action'), icon: <CopyOutlined />, onClick: () => openCopyTablesModal([table.name]) },
        { key: 'copy-structure', label: t('tableOverview.copy.structureToClipboard'), icon: <CopyOutlined />, onClick: () => handleCopyStructure(table.name) },
        { key: 'backup-table', label: '备份表 (SQL)', icon: <SaveOutlined />, onClick: () => handleExport(table.name, 'sql') },
        { key: 'rename-table', label: '重命名表', icon: <EditOutlined />, onClick: () => handleRenameTable(table.name) },
        { key: 'danger-zone', label: '危险操作', icon: <WarningOutlined />, children: [
            ...(allowTruncate ? [{ key: 'truncate-table', label: '截断表', danger: true, onClick: () => handleTableDataDangerAction(table.name, 'truncate') }] : []),
            { key: 'clear-table', label: '清空表', danger: true, onClick: () => handleTableDataDangerAction(table.name, 'clear') },
            { key: 'drop-table', label: '删除表', icon: <DeleteOutlined />, danger: true, onClick: () => handleDeleteTable(table.name) }
        ]},
        { type: 'divider' },
        { key: 'export', label: '导出表数据', icon: <ExportOutlined />, children: [
            { key: 'export-csv', label: '导出 CSV', onClick: () => handleExport(table.name, 'csv') },
            { key: 'export-xlsx', label: '导出 Excel (XLSX)', onClick: () => handleExport(table.name, 'xlsx') },
            { key: 'export-json', label: '导出 JSON', onClick: () => handleExport(table.name, 'json') },
            { key: 'export-md', label: '导出 Markdown', onClick: () => handleExport(table.name, 'md') },
            { key: 'export-html', label: '导出 HTML', onClick: () => handleExport(table.name, 'html') },
        ]},
    ], [allowTruncate, handleCopyStructure, handleDeleteTable, handleExport, handleRenameTable, handleTableDataDangerAction, openCopyTablesModal, openDesign, openNewQueryForTable, t]);


    // --- Theme ---
    const textPrimary = darkMode ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)';
    const textSecondary = darkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
    const textMuted = darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    const accentColor = '#1677ff';
    const containerBg = darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.01)';
    const tableOverviewGridTemplate = '28px minmax(0, 1.8fr) 92px 116px 116px 96px';

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'name' ? 'asc' : 'desc');
        }
    };

    const sortMenuItems = [
        { key: 'name', label: `按名称${sortField === 'name' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`, onClick: () => toggleSort('name') },
        { key: 'rows', label: `按行数${sortField === 'rows' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`, onClick: () => toggleSort('rows') },
        { key: 'dataSize', label: `按大小${sortField === 'dataSize' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`, onClick: () => toggleSort('dataSize') },
    ];

    const bulkActionMenuItems = useMemo<MenuProps['items']>(() => [
        {
            key: 'exportData',
            label: t('sidebar.menu.exportTableData'),
            icon: <ExportOutlined />,
            onClick: () => handleBulkActionClick('exportData'),
        },
        {
            key: 'danger',
            label: t('sidebar.menu.dangerOps'),
            icon: <WarningOutlined />,
            children: [
                ...(allowTruncate ? [{
                    key: 'truncate',
                    label: t('sidebar.menu.truncateTable'),
                    danger: true,
                    onClick: () => handleBulkActionClick('truncate'),
                }] : []),
                {
                    key: 'clear',
                    label: t('sidebar.menu.clearTable'),
                    danger: true,
                    onClick: () => handleBulkActionClick('clear'),
                },
                {
                    key: 'delete',
                    label: t('sidebar.menu.deleteTable'),
                    icon: <DeleteOutlined />,
                    danger: true,
                    onClick: () => handleBulkActionClick('delete'),
                },
            ],
        },
        {
            key: 'rename',
            label: t('sidebar.menu.renameTable'),
            icon: <EditOutlined />,
            onClick: () => handleBulkActionClick('rename'),
        },
        {
            key: 'copyStructure',
            label: t('sidebar.menu.copyTableSchema'),
            icon: <CopyOutlined />,
            onClick: () => handleBulkActionClick('copyStructure'),
        },
        {
            key: 'backup',
            label: t('sidebar.menu.backupTable'),
            icon: <SaveOutlined />,
            onClick: () => handleBulkActionClick('backup'),
        },
        { type: 'divider' },
        {
            key: 'copyTable',
            label: t('tableOverview.copy.action'),
            icon: <CopyOutlined />,
            onClick: () => handleBulkActionClick('copyTable'),
        },
    ], [allowTruncate, handleBulkActionClick, t]);

    const totalRows = useMemo(() => tables.reduce((s, t) => s + t.rows, 0), [tables]);
    const totalSize = useMemo(() => tables.reduce((s, t) => s + t.dataSize + t.indexSize, 0), [tables]);
    const maxCombinedSize = useMemo(() => sortedFiltered.reduce((max, table) => {
        return Math.max(max, table.dataSize + table.indexSize);
    }, 0), [sortedFiltered]);
    const renderTableHoverTitle = useCallback((table: TableStatRow) => (
        <span style={{ whiteSpace: 'pre-line' }}>
            {buildTableHoverTitle({
                tableName: table.name,
                comment: table.comment,
                tableNameLabel: t('table.hover.name'),
                commentLabel: t('table.hover.comment'),
            })}
        </span>
    ), [t]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: containerBg }}>
                <Spin size="large" tip="加载表信息..." />
            </div>
        );
    }

    return (
        <div
            tabIndex={0}
            onKeyDown={handleTableOverviewKeyDown}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', background: containerBg, overflow: 'hidden', outline: 'none' }}
        >
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexShrink: 0 }}>
                <DatabaseOutlined style={{ fontSize: 16, color: accentColor }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{tab.dbName}</span>
                <span style={{ fontSize: 12, color: textMuted }}>
                    {tables.length} 张表 · {formatRows(totalRows)} 行 · {formatSize(totalSize)}
                </span>
                {sortedFiltered.length > 0 && (
                    <Checkbox
                        indeterminate={visibleSelectedCount > 0 && visibleSelectedCount < visibleTableNames.length}
                        checked={visibleTableNames.length > 0 && visibleSelectedCount === visibleTableNames.length}
                        onChange={e => selectVisibleTables(e.target.checked)}
                    >
                        {t('tableOverview.selection.currentList')}
                    </Checkbox>
                )}
                {selectedTableCount > 0 && (
                    <Dropdown menu={{ items: bulkActionMenuItems }} trigger={['click']}>
                        <Button size="small" icon={<DownOutlined />}>
                            {t('tableOverview.bulk.actionWithCount', { count: selectedTableCount })}
                        </Button>
                    </Dropdown>
                )}
                <div style={{ flex: 1 }} />
                <Input
                    {...noAutoCapInputProps}
                    placeholder="搜索表名或注释..."
                    prefix={<SearchOutlined style={{ color: textMuted }} />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    allowClear
                    style={{ width: 240 }}
                    size="small"
                />
                <Dropdown menu={{ items: sortMenuItems }} trigger={['click']}>
                    <Tooltip title="排序"><SortAscendingOutlined style={{ fontSize: 16, color: textSecondary, cursor: 'pointer' }} /></Tooltip>
                </Dropdown>
                <Tooltip title="刷新"><ReloadOutlined onClick={loadData} style={{ fontSize: 16, color: textSecondary, cursor: 'pointer' }} /></Tooltip>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px 16px' }}>
                {sortedFiltered.length > 0 && (isSearchPending || visibleOverview.hiddenCount > 0 || deferredSearchText.trim()) && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            marginBottom: 10,
                            padding: '8px 10px',
                            borderRadius: 10,
                            background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                            color: textMuted,
                            fontSize: 12,
                        }}
                    >
                        <span>
                            {isSearchPending
                                ? '正在更新筛选结果...'
                                : `匹配 ${sortedFiltered.length} 张表，当前渲染 ${visibleTables.length} 张`}
                        </span>
                        {visibleOverview.hiddenCount > 0 && (
                            <span>还有 {visibleOverview.hiddenCount} 张未渲染，可继续加载或缩小搜索范围</span>
                        )}
                    </div>
                )}
                {sortedFiltered.length === 0 ? (
                    <Empty description={searchText ? '无匹配结果' : '暂无表'} style={{ marginTop: 80 }} />
                ) : (
                    <div className="table-overview-list">
                        <div className="table-overview-frame">
                            <div className="table-overview-header" style={{ gridTemplateColumns: tableOverviewGridTemplate }}>
                                <div />
                                <div>表名</div>
                                <div className="table-overview-header-cell">行数</div>
                                <div className="table-overview-header-cell">数据大小</div>
                                <div className="table-overview-header-cell">索引大小</div>
                                <div className="table-overview-header-cell">相对大小</div>
                            </div>
                            <div className="table-overview-body">
                            {visibleTables.map(t => {
                                const combinedSize = t.dataSize + t.indexSize;
                                const sizeRatio = maxCombinedSize > 0 ? combinedSize / maxCombinedSize : 0;
                                const rowSecondary = t.comment || (t.engine ? `${t.engine} 表` : '双击打开数据，右键查看更多操作');

                                return (
                                    <Dropdown
                                        key={t.name}
                                        trigger={['contextMenu']}
                                        menu={{
                                            items: buildTableMenuItems(t),
                                        }}
                                    >
                                        <div
                                            className={`table-overview-row${selectedTableSet.has(t.name) ? ' is-selected' : ''}`}
                                            onDoubleClick={() => openTable(t)}
                                            style={{
                                                gridTemplateColumns: tableOverviewGridTemplate,
                                            }}
                                        >
                                            <div className="table-overview-selection-cell">
                                                <Checkbox
                                                    checked={selectedTableSet.has(t.name)}
                                                    onChange={e => toggleSelectedTable(t.name, e.target.checked)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            </div>
                                            <div className="table-overview-object-cell">
                                                <div className="table-overview-name-line">
                                                    <TableOutlined className="table-overview-object-icon" />
                                                    <Tooltip title={renderTableHoverTitle(t)} mouseEnterDelay={0.4}>
                                                        <span className="table-overview-object-name">
                                                            {t.name}
                                                        </span>
                                                    </Tooltip>
                                                    {t.engine && (
                                                        <span className="table-overview-engine-tag">
                                                            {t.engine}
                                                        </span>
                                                    )}
                                                </div>
                                                <Tooltip title={rowSecondary} mouseEnterDelay={0.4}>
                                                    <div className="table-overview-object-meta">
                                                        {rowSecondary}
                                                    </div>
                                                </Tooltip>
                                            </div>
                                            <div className="table-overview-metric">{formatRows(t.rows)}</div>
                                            <div className="table-overview-metric">{formatSize(t.dataSize)}</div>
                                            <div className="table-overview-metric">{formatSize(t.indexSize)}</div>
                                            <div className="table-overview-metric">
                                                {maxCombinedSize > 0 ? `${Math.round(sizeRatio * 100)}%` : '—'}
                                            </div>
                                        </div>
                                    </Dropdown>
                                );
                            })}
                            </div>
                        </div>
                    </div>
                )}
                {sortedFiltered.length > 0 && visibleOverview.hiddenCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 4px' }}>
                        <Button
                            size="small"
                            onClick={() => setVisibleTableLimit(limit => limit + TABLE_OVERVIEW_RENDER_BATCH_SIZE)}
                        >
                            显示更多表（剩余 {visibleOverview.hiddenCount}）
                        </Button>
                    </div>
                )}
            </div>
            <Modal
                title={t('tableOverview.copy.modalTitle', { count: selectedTableCount })}
                open={copyModalOpen}
                okText={t('tableOverview.copy.action')}
                cancelText={t('common.cancel')}
                onOk={handleCopyTables}
                onCancel={() => setCopyModalOpen(false)}
            >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <div style={{ color: textSecondary, fontSize: 12 }}>
                        {t('tableOverview.copy.namePattern')}
                    </div>
                    <Input
                        {...noAutoCapInputProps}
                        value={copyTablePrefix}
                        onChange={e => setCopyTablePrefix(e.target.value)}
                        placeholder={t('tableOverview.copy.prefixPlaceholder')}
                    />
                    <Input
                        {...noAutoCapInputProps}
                        value={copyTableSuffix}
                        onChange={e => setCopyTableSuffix(e.target.value)}
                        placeholder={t('tableOverview.copy.suffixPlaceholder')}
                    />
                    <Radio.Group value={copyTableMode} onChange={e => setCopyTableMode(e.target.value)}>
                        <Radio value="structure">{t('tableOverview.copy.structureOnly')}</Radio>
                        <Radio value="structureData">{t('tableOverview.copy.structureAndData')}</Radio>
                    </Radio.Group>
                </Space>
            </Modal>
            <Modal
                title={t('tableOverview.bulk.renameTitle', { count: selectedTableCount })}
                open={bulkRenameModalOpen}
                okText={t('sidebar.menu.renameTable')}
                cancelText={t('common.cancel')}
                onOk={handleBulkRenameTables}
                onCancel={() => {
                    setBulkRenameModalOpen(false);
                    setBulkRenameValues({});
                }}
            >
                <Space direction="vertical" size={10} style={{ width: '100%', maxHeight: 360, overflowY: 'auto' }}>
                    {selectedTableNames.map(name => (
                        <div key={name}>
                            <div style={{ color: textSecondary, fontSize: 12, marginBottom: 4 }}>{name}</div>
                            <Input
                                {...noAutoCapInputProps}
                                value={bulkRenameValues[name] ?? name}
                                onChange={e => setBulkRenameValues(prev => ({ ...prev, [name]: e.target.value }))}
                                placeholder={name}
                            />
                        </div>
                    ))}
                </Space>
            </Modal>
        </div>
    );
};

export default TableOverview;
