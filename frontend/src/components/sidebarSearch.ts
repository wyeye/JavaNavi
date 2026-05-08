import type { ReactNode } from 'react';
import { resolveConnectionHostTokens } from '../utils/tabDisplay';

export interface TreeNode {
  title: string;
  key: string;
  isLeaf?: boolean;
  children?: TreeNode[];
  icon?: ReactNode;
  dataRef?: any;
  type?: 'connection' | 'database' | 'table' | 'view' | 'db-trigger' | 'routine' | 'object-group' | 'queries-folder' | 'saved-query' | 'external-sql-root' | 'external-sql-directory' | 'external-sql-folder' | 'external-sql-file' | 'folder-columns' | 'folder-indexes' | 'folder-fks' | 'folder-triggers' | 'redis-db' | 'tag' | 'jvm-mode' | 'jvm-resource' | 'jvm-diagnostic' | 'jvm-monitoring';
}

export type SearchScope = 'smart' | 'object' | 'database' | 'host' | 'tag';

export const normalizeMySQLViewDDLForEditing = (viewName: string, rawDefinition: unknown): string => {
  const text = String(rawDefinition || '').trim();
  if (!text) return '';

  const normalized = text.replace(/\r\n/g, '\n').trim().replace(/;+\s*$/, '');
  const createViewPrefixPattern = /^\s*create\s+(?:algorithm\s*=\s*\w+\s+)?(?:definer\s*=\s*(?:`[^`]+`|\S+)\s*@\s*(?:`[^`]+`|\S+)\s+)?(?:sql\s+security\s+(?:definer|invoker)\s+)?view\s+/i;
  if (createViewPrefixPattern.test(normalized)) {
    return `${normalized.replace(createViewPrefixPattern, 'CREATE OR REPLACE VIEW ')};`;
  }

  if (/^\s*(select|with)\b/i.test(normalized)) {
    return `CREATE OR REPLACE VIEW ${viewName} AS\n${normalized};`;
  }

  return `${normalized};`;
};

export const resolveCopyableSidebarNodeName = (node: TreeNode | null | undefined): string => {
  switch (node?.type) {
    case 'database':
      return String(node?.dataRef?.dbName || '').trim();
    case 'table':
      return String(node?.dataRef?.tableName || '').trim();
    case 'view':
      return String(node?.dataRef?.viewName || '').trim();
    case 'routine':
      return String(node?.dataRef?.routineName || '').trim();
    case 'db-trigger':
      return String(node?.dataRef?.triggerName || '').trim();
    default:
      return '';
  }
};

const getConnectionHostSearchText = (node: TreeNode): string => {
  if (node.type !== 'connection') return '';
  const config = node.dataRef?.config || {};
  return resolveConnectionHostTokens(config).join(' ');
};

const getConnectionNameSearchText = (node: TreeNode): string => {
  if (node.type !== 'connection') return '';
  const name = node.dataRef?.name ?? node.title;
  return String(name || '').toLowerCase();
};

const isObjectNode = (node: TreeNode): boolean => {
  return node.type === 'table'
    || node.type === 'view'
    || node.type === 'db-trigger'
    || node.type === 'routine'
    || node.type === 'object-group';
};

const matchByScopes = (node: TreeNode, keyword: string, scopes: SearchScope[]): boolean => {
  const title = String(node.title || '').toLowerCase();
  if (scopes.includes('database') && node.type === 'database' && title.includes(keyword)) {
    return true;
  }
  if (scopes.includes('tag') && node.type === 'tag' && title.includes(keyword)) {
    return true;
  }
  if (scopes.includes('host') && node.type === 'connection' && getConnectionHostSearchText(node).includes(keyword)) {
    return true;
  }
  if (scopes.includes('object') && isObjectNode(node) && title.includes(keyword)) {
    return true;
  }
  return false;
};

export const filterSidebarTree = (data: TreeNode[], keyword: string, searchScopes: SearchScope[]): TreeNode[] => {
  const isSmartMode = searchScopes.includes('smart');
  const result: TreeNode[] = [];
  data.forEach((item) => {
    const titleMatch = String(item.title || '').toLowerCase().includes(keyword);
    const smartMatch = item.type === 'connection'
      ? getConnectionNameSearchText(item).includes(keyword) || getConnectionHostSearchText(item).includes(keyword)
      : titleMatch;
    const scopedMatch = matchByScopes(item, keyword, searchScopes);
    const selfMatch = isSmartMode ? smartMatch : scopedMatch;
    const filteredChildren = item.children ? filterSidebarTree(item.children, keyword, searchScopes) : [];

    if (selfMatch) {
      const shouldKeepFullSubtree = isSmartMode
        || item.type === 'connection'
        || item.type === 'database'
        || item.type === 'tag';
      if (item.children && shouldKeepFullSubtree) {
        result.push(item);
      } else if (item.children && filteredChildren.length > 0) {
        result.push({ ...item, children: filteredChildren });
      } else {
        result.push(item);
      }
      return;
    }

    if (filteredChildren.length > 0) {
      result.push({ ...item, children: filteredChildren });
    }
  });
  return result;
};
