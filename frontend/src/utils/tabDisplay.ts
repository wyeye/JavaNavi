import type { ConnectionConfig, SavedConnection, TabData } from '../types';
import { translate, type AppLanguage } from '../i18n';

export const detectConnectionEnvLabel = (connectionName: string): string | null => {
  const tokens = connectionName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.includes('prod') || tokens.includes('production')) return 'PROD';
  if (tokens.includes('uat')) return 'UAT';
  if (tokens.includes('dev') || tokens.includes('development')) return 'DEV';
  if (tokens.includes('sit')) return 'SIT';
  if (tokens.includes('stg') || tokens.includes('stage') || tokens.includes('staging') || tokens.includes('pre')) return 'STG';
  if (tokens.includes('test') || tokens.includes('qa')) return 'TEST';
  return null;
};

const parseHostOnlyToken = (value: unknown): string[] => {
  const raw = String(value || '').trim();
  if (!raw) {
    return [];
  }

  let text = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  if (text.includes('/')) {
    text = text.split('/')[0];
  }
  if (text.includes('?')) {
    text = text.split('?')[0];
  }
  if (text.includes('@')) {
    text = text.split('@').pop() || '';
  }

  return text
    .split(',')
    .map((entry) => {
      const token = entry.trim();
      if (!token) return '';
      if (token.startsWith('[')) {
        const rightBracketIndex = token.indexOf(']');
        if (rightBracketIndex > 0) {
          return token.slice(0, rightBracketIndex + 1).toLowerCase();
        }
      }
      const colonIndex = token.lastIndexOf(':');
      if (colonIndex > 0) {
        return token.slice(0, colonIndex).toLowerCase();
      }
      return token.toLowerCase();
    })
    .filter(Boolean);
};

export const resolveConnectionHostTokens = (config?: ConnectionConfig): string[] => {
  if (!config) {
    return [];
  }

  return Array.from(new Set([
    ...parseHostOnlyToken(config.host),
    ...(Array.isArray(config.hosts) ? config.hosts.flatMap((entry) => parseHostOnlyToken(entry)) : []),
    ...parseHostOnlyToken(config.uri),
  ]));
};

export const resolveConnectionHostSummary = (config?: ConnectionConfig): string => {
  const hosts = resolveConnectionHostTokens(config);
  if (hosts.length === 0) return '';
  if (hosts.length === 1) return hosts[0];
  return `${hosts[0]} +${hosts.length - 1}`;
};

const isRedisTab = (tab: TabData): boolean => {
  return tab.type === 'redis-keys' || tab.type === 'redis-command' || tab.type === 'redis-monitor';
};

const buildRedisBaseTitle = (tab: TabData, language: AppLanguage): string => {
  const db = tab.redisDB ?? 0;
  const dbLabel = `db${db}`;
  if (tab.type === 'redis-command') return translate(language, 'generic.fallback.commandDb', { db });
  if (tab.type === 'redis-monitor') return translate(language, 'generic.fallback.monitorDb', { db });
  return dbLabel;
};

const localizeTabTitle = (title: string, language: AppLanguage): string => {
  const text = String(title || '').trim();
  if (text === '新建查询') return translate(language, 'generic.fallback.newQuery');
  return text || translate(language, 'generic.fallback.newQuery');
};

export const buildTabDisplayTitle = (tab: TabData, connection?: SavedConnection, language: AppLanguage = 'en'): string => {
  const connectionName = String(connection?.name || '').trim();

  if (isRedisTab(tab)) {
    const hostSummary = resolveConnectionHostSummary(connection?.config);
    const identity = [connectionName, hostSummary].filter(Boolean).join(' | ');
    return identity ? `[${identity}] ${buildRedisBaseTitle(tab, language)}` : buildRedisBaseTitle(tab, language);
  }

  if (tab.type !== 'table' && tab.type !== 'design' && tab.type !== 'table-overview') {
    return localizeTabTitle(tab.title, language);
  }
  if (!connectionName) {
    return localizeTabTitle(tab.title, language);
  }

  const prefix = detectConnectionEnvLabel(connectionName) || connectionName;
  return `[${prefix}] ${localizeTabTitle(tab.title, language)}`;
};
