import { DBGetColumns, DBGetIndexes } from '@compat/javanaviApp';
import type { ColumnDefinition, IndexDefinition, SavedConnection } from '../../types';
import { buildRpcConnectionConfig } from '../../utils/connectionRpcConfig';
import { JAVANAVI_ROW_KEY } from './dataGridCells';
import { resolveUniqueKeyGroupsFromIndexes } from './dataGridCopyInsert';

export type ColumnMeta = {
    type: string;
    comment: string;
};

export const buildDataGridMetadataCacheKey = ({
    connectionId,
    dbName,
    tableName,
}: {
    connectionId?: string;
    dbName?: string;
    tableName?: string;
}): string => `${connectionId || ''}|${String(dbName || '').trim()}|${String(tableName || '').trim()}`;

export const normalizeColumnMetaMap = (columns: ColumnDefinition[]): Record<string, ColumnMeta> => {
    const nextMap: Record<string, ColumnMeta> = {};
    columns.forEach((column: any) => {
        const name = String(column?.name ?? column?.Name ?? '').trim();
        if (!name) return;
        const type = String(column?.type ?? column?.Type ?? '').trim();
        const comment = String(column?.comment ?? column?.Comment ?? '').trim();
        nextMap[name] = { type, comment };
    });
    return nextMap;
};

export const buildColumnMetaMapByLowerName = (columnMetaMap: Record<string, ColumnMeta>): Record<string, ColumnMeta> => {
    const next: Record<string, ColumnMeta> = {};
    Object.entries(columnMetaMap).forEach(([name, meta]) => {
        const lowerName = String(name || '').toLowerCase();
        if (!lowerName || next[lowerName]) return;
        next[lowerName] = meta;
    });
    return next;
};

export const buildColumnTypeMapByLowerName = (columnMetaMapByLowerName: Record<string, ColumnMeta>): Record<string, string> => {
    const next: Record<string, string> = {};
    Object.entries(columnMetaMapByLowerName).forEach(([name, meta]) => {
        const type = String(meta?.type || '').trim();
        if (!name || !type) return;
        next[name] = type;
    });
    return next;
};

export const resolveAllTableColumnNames = ({
    columnMetaMap,
    exportScope,
    columnNames,
}: {
    columnMetaMap: Record<string, ColumnMeta>;
    exportScope: 'table' | 'queryResult';
    columnNames: string[];
}): string[] => {
    const metaColumns = Object.keys(columnMetaMap);
    if (metaColumns.length > 0) {
        return metaColumns;
    }
    if (exportScope === 'table') {
        return columnNames.filter((columnName) => columnName !== JAVANAVI_ROW_KEY);
    }
    return [];
};

const buildConnectionConfig = (connection: SavedConnection) => ({
    ...connection.config,
    port: Number(connection.config.port),
    password: connection.config.password || '',
    database: connection.config.database || '',
    useSSH: connection.config.useSSH || false,
    ssh: connection.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' },
});

export const fetchColumnMetaMap = async ({
    connection,
    dbName,
    tableName,
}: {
    connection: SavedConnection;
    dbName: string;
    tableName: string;
}): Promise<Record<string, ColumnMeta> | null> => {
    const res = await DBGetColumns(buildRpcConnectionConfig(buildConnectionConfig(connection)) as any, dbName, tableName);
    if (!res.success || !Array.isArray(res.data)) {
        return null;
    }
    return normalizeColumnMetaMap(res.data as ColumnDefinition[]);
};

export const fetchUniqueKeyGroups = async ({
    connection,
    dbName,
    tableName,
}: {
    connection: SavedConnection;
    dbName: string;
    tableName: string;
}): Promise<string[][] | null> => {
    const res = await DBGetIndexes(buildRpcConnectionConfig(buildConnectionConfig(connection)) as any, dbName, tableName);
    if (!res.success || !Array.isArray(res.data)) {
        return null;
    }
    return resolveUniqueKeyGroupsFromIndexes(res.data as IndexDefinition[]);
};
