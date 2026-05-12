import type React from 'react';
import type { I18nKey, I18nParams } from '../i18n';
import type { TabData } from '../types';
type SidebarTreeKey = React.Key;

type SidebarTreeNode = {
    key?: SidebarTreeKey;
    title?: unknown;
    type?: string;
    children?: SidebarTreeNode[];
    dataRef?: Record<string, unknown>;
};

type SidebarTableTarget = {
    connectionId: string;
    dbName: string;
    tableName: string;
};

type SidebarTreePath = {
    node: SidebarTreeNode;
    path: SidebarTreeKey[];
};

type LocateSidebarTableOptions = {
    activeTab?: TabData;
    getTreeData: () => SidebarTreeNode[];
    loadDatabases: (node: SidebarTreeNode) => Promise<void>;
    loadTables: (node: SidebarTreeNode) => Promise<void>;
    setExpandedKeys: (updater: (previous: SidebarTreeKey[]) => SidebarTreeKey[]) => void;
    setAutoExpandParent: (value: boolean) => void;
    setSelectedKeys: (keys: SidebarTreeKey[]) => void;
    setSearchValue: (value: string) => void;
    setActiveContext: (context: { connectionId: string; dbName: string }) => void;
    scrollToKey: (key: SidebarTreeKey) => void;
    notify: {
        info: (content: string) => void;
        warning: (content: string) => void;
        success: (content: string) => void;
    };
    t: (key: I18nKey, params?: I18nParams) => string;
};

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizeComparableName = (value: unknown) => normalizeText(value).toLowerCase();

export const getActiveSidebarTableTarget = (tab?: TabData): SidebarTableTarget | null => {
    if (!tab || (tab.type !== 'table' && tab.type !== 'design')) return null;
    const connectionId = normalizeText(tab.connectionId);
    const dbName = normalizeText(tab.dbName);
    const tableName = normalizeText(tab.tableName);
    if (!connectionId || !dbName || !tableName) return null;
    return { connectionId, dbName, tableName };
};

const findSidebarTreePath = (
    nodes: SidebarTreeNode[],
    predicate: (node: SidebarTreeNode) => boolean,
    parents: SidebarTreeKey[] = [],
): SidebarTreePath | null => {
    for (const node of nodes) {
        const key = node.key;
        if (key === undefined) continue;
        const path = [...parents, key];
        if (predicate(node)) return { node, path };
        const childPath = node.children ? findSidebarTreePath(node.children, predicate, path) : null;
        if (childPath) return childPath;
    }
    return null;
};

const waitForSidebarTreePath = async (
    getTreeData: () => SidebarTreeNode[],
    predicate: (node: SidebarTreeNode) => boolean,
): Promise<SidebarTreePath | null> => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
        const path = findSidebarTreePath(getTreeData(), predicate);
        if (path) return path;
        await delay(50);
    }
    return null;
};

const isSameConnection = (node: SidebarTreeNode, connectionId: string) => {
    return normalizeText(node.key) === connectionId || normalizeText(node.dataRef?.id) === connectionId;
};

const isSameDatabase = (node: SidebarTreeNode, target: SidebarTableTarget) => {
    return node.type === 'database'
        && normalizeText(node.dataRef?.id) === target.connectionId
        && normalizeText(node.dataRef?.dbName) === target.dbName;
};

const isSameTableOrView = (node: SidebarTreeNode, target: SidebarTableTarget) => {
    if (node.type !== 'table' && node.type !== 'view') return false;
    if (normalizeText(node.dataRef?.id) !== target.connectionId) return false;
    if (normalizeText(node.dataRef?.dbName) !== target.dbName) return false;

    const targetName = normalizeComparableName(target.tableName);
    return [
        node.dataRef?.tableName,
        node.dataRef?.viewName,
        node.title,
    ].some((value) => normalizeComparableName(value) === targetName);
};

export const locateActiveSidebarTable = async (options: LocateSidebarTableOptions): Promise<boolean> => {
    const target = getActiveSidebarTableTarget(options.activeTab);
    if (!target) {
        options.notify.info(options.t('sidebar.locate.openTableFirst'));
        return false;
    }

    const connectionPath = findSidebarTreePath(options.getTreeData(), (node) => isSameConnection(node, target.connectionId));
    if (!connectionPath) {
        options.notify.warning(options.t('sidebar.locate.connectionNotFound'));
        return false;
    }

    if (!connectionPath.node.children) {
        await options.loadDatabases(connectionPath.node);
    }

    const databasePath = await waitForSidebarTreePath(options.getTreeData, (node) => isSameDatabase(node, target));
    if (!databasePath) {
        options.notify.warning(options.t('sidebar.locate.databaseNotFound'));
        return false;
    }

    if (!databasePath.node.children) {
        await options.loadTables(databasePath.node);
    }

    const objectPath = await waitForSidebarTreePath(options.getTreeData, (node) => isSameTableOrView(node, target));
    if (!objectPath) {
        options.notify.warning(options.t('sidebar.locate.objectNotFound'));
        return false;
    }

    const parentKeys = objectPath.path.slice(0, -1);
    options.setSearchValue('');
    options.setExpandedKeys((previous) => Array.from(new Set([...previous, ...parentKeys])));
    options.setAutoExpandParent(true);
    options.setSelectedKeys([objectPath.node.key as SidebarTreeKey]);
    options.setActiveContext({ connectionId: target.connectionId, dbName: target.dbName });
    window.setTimeout(() => options.scrollToKey(objectPath.node.key as SidebarTreeKey), 80);
    options.notify.success(options.t('sidebar.locate.found', { name: normalizeText(objectPath.node.title) || target.tableName }));
    return true;
};
