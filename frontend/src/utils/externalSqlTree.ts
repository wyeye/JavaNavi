import type { ExternalSQLTreeEntry } from '../types';

export type ExternalSQLNodeType =
  | 'external-sql-root'
  | 'external-sql-folder'
  | 'external-sql-file';

export interface ExternalSQLTreeNode {
  title: string;
  key: string;
  isLeaf?: boolean;
  children?: ExternalSQLTreeNode[];
  type: ExternalSQLNodeType;
  dataRef: Record<string, unknown>;
}

type BuildExternalSQLRootNodeParams = {
  dbNodeKey: string;
  connectionId: string;
  dbName: string;
  workspacePath: string;
  workspaceName: string;
  directoryTree: ExternalSQLTreeEntry[];
};

const normalizeExternalSQLPath = (value: string): string =>
  String(value || '').trim().replace(/\\/g, '/');

export const buildExternalSQLDirectoryId = (connectionId: string, dbName: string, directoryPath: string): string =>
  `external-sql-dir:${String(connectionId || '').trim()}:${String(dbName || '').trim()}:${normalizeExternalSQLPath(directoryPath)}`;

export const buildExternalSQLTabId = (connectionId: string, dbName: string, filePath: string): string =>
  `external-sql-tab:${String(connectionId || '').trim()}:${String(dbName || '').trim()}:${normalizeExternalSQLPath(filePath)}`;

const buildExternalSQLNodeKey = (type: ExternalSQLNodeType, base: string): string =>
  `${type}:${normalizeExternalSQLPath(base)}`;

const mapExternalSQLTreeEntries = (
  entries: ExternalSQLTreeEntry[],
  context: { connectionId: string; dbName: string; dbNodeKey: string; rootPath: string },
): ExternalSQLTreeNode[] => entries.map((entry) => {
  const entryPath = normalizeExternalSQLPath(entry.path);
  if (entry.isDir) {
    const children = mapExternalSQLTreeEntries(entry.children || [], context);
    return {
      title: entry.name,
      key: buildExternalSQLNodeKey('external-sql-folder', entryPath),
      type: 'external-sql-folder',
      isLeaf: children.length === 0,
      children: children.length > 0 ? children : undefined,
      dataRef: {
        connectionId: context.connectionId,
        dbName: context.dbName,
        dbNodeKey: context.dbNodeKey,
        rootPath: context.rootPath,
        path: entry.path,
        name: entry.name,
      },
    };
  }

  return {
    title: entry.name,
    key: buildExternalSQLNodeKey('external-sql-file', entryPath),
    type: 'external-sql-file',
    isLeaf: true,
    dataRef: {
      connectionId: context.connectionId,
      dbName: context.dbName,
      dbNodeKey: context.dbNodeKey,
      rootPath: context.rootPath,
      path: entry.path,
      name: entry.name,
    },
  };
});

export const buildExternalSQLRootNode = ({
  dbNodeKey,
  connectionId,
  dbName,
  workspacePath,
  workspaceName,
  directoryTree,
}: BuildExternalSQLRootNodeParams): ExternalSQLTreeNode => {
  const children = mapExternalSQLTreeEntries(directoryTree, {
    connectionId,
    dbName,
    dbNodeKey,
    rootPath: workspacePath,
  });

  return {
    title: children.length > 0 ? `外部 SQL 文件 (${children.length})` : '外部 SQL 文件',
    key: `${dbNodeKey}-external-sql`,
    type: 'external-sql-root',
    isLeaf: children.length === 0,
    children: children.length > 0 ? children : undefined,
    dataRef: {
      connectionId,
      dbName,
      dbNodeKey,
      path: workspacePath,
      name: workspaceName,
    },
  };
};
