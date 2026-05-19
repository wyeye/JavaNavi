import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { message } from 'antd';
import type { TabData, ColumnDefinition, IndexDefinition, ConnectionConfig } from '../types';
import { useStore } from '../store';
import { DBQuery, DBGetColumns, DBGetIndexes, type QueryResult } from '@compat/javanaviApp';
import DataGrid, { JAVANAVI_ROW_KEY } from './DataGrid';
import { resolveEditRowLocator, type EditRowLocator } from '../utils/rowLocator';
import { buildOrderBySQL, buildPaginatedSelectSQL, buildWhereSQL, hasExplicitSort, quoteIdentPart, quoteQualifiedIdent, withSortBufferTuningSQL, type FilterCondition } from '../utils/sql';
import { buildMongoCountCommand, buildMongoFilter, buildMongoFindCommand, buildMongoSort } from '../utils/mongodb';
import { buildOracleApproximateTotalSql, parseApproximateTableCountRow, resolveApproximateTableCountStrategy } from '../utils/approximateTableCount';
import { getDataSourceCapabilities, resolveDataSourceType } from '../utils/dataSourceCapabilities';
import { resolveDataViewerAutoFetchAction } from '../utils/dataViewerAutoFetch';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import {
  buildEffectiveFilterConditions,
  normalizeQuickWhereCondition,
  validateQuickWhereCondition,
} from '../utils/dataGridWhereFilter';
import { translate, type I18nKey } from '../i18n';

type ViewerPaginationState = {
  current: number;
  pageSize: number;
  total: number;
  totalKnown: boolean;
  totalApprox: boolean;
  approximateTotal?: number;
  totalCountLoading: boolean;
  totalCountCancelled: boolean;
};

type DataRow = Record<string, unknown> & Partial<Record<typeof JAVANAVI_ROW_KEY, string | number>>;
type ViewerSortOrder = 'ascend' | 'descend';
type ViewerSortInfo = { columnKey: string; order: ViewerSortOrder; enabled?: boolean };
type QueryResultWithData<T> = Omit<QueryResult, 'data'> & { data?: T | null };

const JS_MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

const toRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const getErrorMessage = (error: unknown, fallback = 'Operation failed'): string => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string') return error || fallback;
  const record = toRecord(error);
  const messageValue = record?.message;
  if (typeof messageValue === 'string' && messageValue) return messageValue;
  if (error === null || error === undefined) return fallback;
  return String(error) || fallback;
};

const isViewerSortOrder = (value: unknown): value is ViewerSortOrder => (
  value === 'ascend' || value === 'descend'
);

const normalizeViewerSortInfo = (value: unknown): ViewerSortInfo[] => {
  const items = Array.isArray(value) ? value : (value ? [value] : []);
  return items
    .map((item): ViewerSortInfo | null => {
      const record = toRecord(item);
      if (!record) return null;
      const columnKey = String(record.columnKey || '').trim();
      if (!columnKey || !isViewerSortOrder(record.order)) return null;
      return {
        columnKey,
        order: record.order,
        enabled: record.enabled !== false,
      };
    })
    .filter((item): item is ViewerSortInfo => item !== null);
};

const toDataRows = (value: unknown): DataRow[] => (
  Array.isArray(value)
    ? value.filter((row): row is DataRow => Boolean(toRecord(row)))
    : []
);

const queryArrayData = <T,>(result: QueryResult): T[] => (
  Array.isArray(result.data) ? result.data as T[] : []
);

const isIntegerText = (text: string): boolean => /^[+-]?\d+$/.test(text);

const toNonNegativeFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
  }
  if (typeof value === 'bigint') {
    return value >= 0n && value <= JS_MAX_SAFE_INTEGER_BIGINT ? Number(value) : null;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    if (isIntegerText(text)) {
      try {
        const parsedBigInt = BigInt(text);
        if (parsedBigInt < 0n || parsedBigInt > JS_MAX_SAFE_INTEGER_BIGINT) {
          return null;
        }
        return Number(parsedBigInt);
      } catch {
        return null;
      }
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
  }
  return null;
};

const parseTotalFromCountRow = (row: unknown): number | null => {
  if (!row || typeof row !== 'object') return null;
  const entries = Object.entries(row as Record<string, unknown>);
  if (entries.length === 0) return null;

  for (const [key, raw] of entries) {
    const normalized = String(key || '').trim().toLowerCase();
    if (normalized === 'total' || normalized === 'count' || normalized.includes('count')) {
      const parsed = toNonNegativeFiniteNumber(raw);
      if (parsed !== null) return parsed;
    }
  }

  for (const [, raw] of entries) {
    const parsed = toNonNegativeFiniteNumber(raw);
    if (parsed !== null) return parsed;
  }

  return null;
};

const normalizeDuckDBIdentifier = (raw: string): string => {
  const text = String(raw || '').trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === '`' && last === '`')) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
};

const resolveDuckDBSchemaAndTable = (dbName: string, tableName: string) => {
  const rawTable = String(tableName || '').trim();
  if (!rawTable) return { schemaName: 'main', pureTableName: '' };

  const parts = rawTable.split('.');
  if (parts.length >= 2) {
    const pureTableName = normalizeDuckDBIdentifier(parts[parts.length - 1]);
    const schemaName = normalizeDuckDBIdentifier(parts[parts.length - 2]);
    if (schemaName && pureTableName) {
      return { schemaName, pureTableName };
    }
  }

  const fallbackSchema = normalizeDuckDBIdentifier(String(dbName || '').trim()) || 'main';
  return { schemaName: fallbackSchema, pureTableName: normalizeDuckDBIdentifier(rawTable) };
};

const escapeSQLLiteral = (value: string): string => String(value || '').replace(/'/g, "''");

const isDuckDBUnsupportedTypeError = (msg: string): boolean => /unsupported\s*type:\s*duckdb\./i.test(String(msg || ''));

const isDuckDBComplexColumnType = (columnType?: string): boolean => {
  const raw = String(columnType || '').trim().toLowerCase();
  if (!raw) return false;
  return raw.includes('map') || raw.includes('struct') || raw.includes('union') || raw.includes('array') || raw.includes('list');
};

const reverseOrderBySQL = (orderBySQL: string): string => {
  const raw = String(orderBySQL || '').trim();
  if (!raw) return '';
  const body = raw.replace(/^order\s+by\s+/i, '').trim();
  if (!body) return '';

  const parts = body
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/\s+asc$/i.test(part)) return part.replace(/\s+asc$/i, ' DESC');
      if (/\s+desc$/i.test(part)) return part.replace(/\s+desc$/i, ' ASC');
      return `${part} DESC`;
    });
  if (parts.length === 0) return '';
  return ` ORDER BY ${parts.join(', ')}`;
};

type ViewerFilterSnapshot = {
  showFilter: boolean;
  conditions: FilterCondition[];
  quickWhereCondition: string;
  currentPage: number;
  pageSize: number;
  sortInfo: ViewerSortInfo[];
  scrollTop: number;
  scrollLeft: number;
};

type ViewerScrollSnapshot = {
  top: number;
  left: number;
};

const viewerFilterSnapshotsByTab = new Map<string, ViewerFilterSnapshot>();

const normalizeViewerFilterConditions = (conditions: FilterCondition[] | undefined): FilterCondition[] => {
  if (!Array.isArray(conditions)) return [];
  return conditions.map((cond) => ({
    id: Number.isFinite(Number(cond?.id)) ? Number(cond?.id) : undefined,
    enabled: cond?.enabled !== false,
    logic: String(cond?.logic || '').trim().toUpperCase() === 'OR' ? 'OR' : 'AND',
    column: String(cond?.column || ''),
    op: String(cond?.op || '='),
    value: String(cond?.value ?? ''),
    value2: String(cond?.value2 ?? ''),
  }));
};

const getViewerFilterSnapshot = (tabId: string): ViewerFilterSnapshot => {
  const cached = viewerFilterSnapshotsByTab.get(String(tabId || '').trim());
  if (!cached) {
    return { showFilter: false, conditions: [], quickWhereCondition: '', currentPage: 1, pageSize: 100, sortInfo: [], scrollTop: 0, scrollLeft: 0 };
  }
  return {
    showFilter: cached.showFilter === true,
    conditions: normalizeViewerFilterConditions(cached.conditions),
    quickWhereCondition: normalizeQuickWhereCondition(cached.quickWhereCondition),
    currentPage: Number.isFinite(Number(cached.currentPage)) && Number(cached.currentPage) > 0 ? Number(cached.currentPage) : 1,
    pageSize: Number.isFinite(Number(cached.pageSize)) && Number(cached.pageSize) > 0 ? Number(cached.pageSize) : 100,
    sortInfo: normalizeViewerSortInfo(cached.sortInfo),
    scrollTop: Number.isFinite(Number(cached.scrollTop)) ? Number(cached.scrollTop) : 0,
    scrollLeft: Number.isFinite(Number(cached.scrollLeft)) ? Number(cached.scrollLeft) : 0,
  };
};

type FetchDataOptions = {
  refreshTotal?: boolean;
};

const DataViewer: React.FC<{ tab: TabData; isActive?: boolean }> = ({ tab, isActive = true }) => {
  const initialViewerSnapshot = useMemo(() => getViewerFilterSnapshot(tab.id), [tab.id]);
  const [data, setData] = useState<DataRow[]>([]);
  const [columnNames, setColumnNames] = useState<string[]>([]);
  const [pkColumns, setPkColumns] = useState<string[]>([]);
  const [editLocator, setEditLocator] = useState<EditRowLocator | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const connections = useStore(state => state.connections);
  const addSqlLog = useStore(state => state.addSqlLog);
  const language = useStore(state => state.language);
  const t = useMemo(() => (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
  const fetchSeqRef = useRef(0);
  const countSeqRef = useRef(0);
  const countKeyRef = useRef<string>('');
  const duckdbApproxSeqRef = useRef(0);
  const duckdbApproxKeyRef = useRef<string>('');
  const oracleApproxSeqRef = useRef(0);
  const oracleApproxKeyRef = useRef<string>('');
  const manualCountSeqRef = useRef(0);
  const manualCountKeyRef = useRef<string>('');
  const editLocatorSeqRef = useRef(0);
  const editLocatorKeyRef = useRef<string>('');
  const latestConfigRef = useRef<ConnectionConfig | null>(null);
  const latestDbTypeRef = useRef<string>('');
  const latestDbNameRef = useRef<string>('');
  const latestCountSqlRef = useRef<string>('');
  const latestCountKeyRef = useRef<string>('');
  const scrollSnapshotRef = useRef<ViewerScrollSnapshot>({
    top: initialViewerSnapshot.scrollTop,
    left: initialViewerSnapshot.scrollLeft,
  });
  const initialLoadRef = useRef(false);
  const skipNextAutoFetchRef = useRef(false);

  const [pagination, setPagination] = useState<ViewerPaginationState>({
      current: initialViewerSnapshot.currentPage,
      pageSize: initialViewerSnapshot.pageSize,
      total: 0,
      totalKnown: false,
      totalApprox: false,
      totalCountLoading: false,
      totalCountCancelled: false,
  });

  const [sortInfo, setSortInfo] = useState<ViewerSortInfo[]>(initialViewerSnapshot.sortInfo);
  
  const [showFilter, setShowFilter] = useState<boolean>(initialViewerSnapshot.showFilter);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>(initialViewerSnapshot.conditions);
  const [quickWhereCondition, setQuickWhereCondition] = useState<string>(initialViewerSnapshot.quickWhereCondition);
  const duckdbSafeSelectCacheRef = useRef<Record<string, string>>({});
  const currentConnConfig = connections.find(c => c.id === tab.connectionId)?.config;
  const currentConnCaps = getDataSourceCapabilities(currentConnConfig);
  const forceReadOnly = currentConnCaps.forceReadOnlyQueryResult;
  const preferManualTotalCount = currentConnCaps.preferManualTotalCount;
  const supportsApproximateTableCount = currentConnCaps.supportsApproximateTableCount;
  const supportsApproximateTotalPages = currentConnCaps.supportsApproximateTotalPages;
  const persistViewerSnapshot = useCallback((tabId: string, overrides?: Partial<ViewerFilterSnapshot>) => {
    const normalizedTabId = String(tabId || '').trim();
    if (!normalizedTabId) return;
    viewerFilterSnapshotsByTab.set(normalizedTabId, {
      showFilter,
      conditions: normalizeViewerFilterConditions(filterConditions),
      quickWhereCondition: normalizeQuickWhereCondition(quickWhereCondition),
      currentPage: pagination.current,
      pageSize: pagination.pageSize,
      sortInfo,
      scrollTop: scrollSnapshotRef.current.top,
      scrollLeft: scrollSnapshotRef.current.left,
      ...overrides,
    });
  }, [showFilter, filterConditions, quickWhereCondition, pagination.current, pagination.pageSize, sortInfo]);

  useEffect(() => {
    const snapshot = getViewerFilterSnapshot(tab.id);
    setShowFilter(snapshot.showFilter);
    setFilterConditions(snapshot.conditions);
    setQuickWhereCondition(snapshot.quickWhereCondition);
    setSortInfo(snapshot.sortInfo);
    scrollSnapshotRef.current = { top: snapshot.scrollTop, left: snapshot.scrollLeft };
    initialLoadRef.current = false;
  }, [tab.id]);

  useEffect(() => {
    persistViewerSnapshot(tab.id);
  }, [persistViewerSnapshot]);

  useEffect(() => {
    return () => {
      persistViewerSnapshot(tab.id);
    };
  }, [tab.id, persistViewerSnapshot]);

  useEffect(() => {
    const snapshot = getViewerFilterSnapshot(tab.id);
    setPkColumns([]);
    setEditLocator(undefined);
    editLocatorKeyRef.current = '';
    editLocatorSeqRef.current++;
    countKeyRef.current = '';
    duckdbApproxKeyRef.current = '';
    oracleApproxKeyRef.current = '';
    manualCountKeyRef.current = '';
    duckdbSafeSelectCacheRef.current = {};
    latestConfigRef.current = null;
    latestDbTypeRef.current = '';
    latestDbNameRef.current = '';
    latestCountSqlRef.current = '';
    latestCountKeyRef.current = '';
    scrollSnapshotRef.current = { top: snapshot.scrollTop, left: snapshot.scrollLeft };
    initialLoadRef.current = false;
    skipNextAutoFetchRef.current = true;
    setPagination(prev => ({
      ...prev,
      current: snapshot.currentPage,
      pageSize: snapshot.pageSize,
      total: 0,
      totalKnown: false,
      totalApprox: false,
      approximateTotal: undefined,
      totalCountLoading: false,
      totalCountCancelled: false,
    }));
  }, [tab.id, tab.connectionId, tab.dbName, tab.tableName]);

  const handleTableScrollSnapshotChange = useCallback((snapshot: ViewerScrollSnapshot) => {
    scrollSnapshotRef.current = snapshot;
    persistViewerSnapshot(tab.id, {
      scrollTop: snapshot.top,
      scrollLeft: snapshot.left,
    });
  }, [tab.id, persistViewerSnapshot]);

  const handleManualTotalCount = useCallback(async () => {
    const config = latestConfigRef.current;
    const dbName = latestDbNameRef.current;
    const countSql = latestCountSqlRef.current;
    const countKey = latestCountKeyRef.current;

    if (!config || !countSql || !countKey) {
      message.warning(t('dataViewer.resultNotReady'));
      return;
    }

    manualCountKeyRef.current = countKey;
    const countSeq = ++manualCountSeqRef.current;
    const countStart = Date.now();
    setPagination(prev => ({ ...prev, totalCountLoading: true, totalCountCancelled: false }));
    const countConfig = buildRpcConnectionConfig(config, { queryTimeout: 120 });

    try {
      const resCount = await DBQuery(countConfig, dbName, countSql);
      const countDuration = Date.now() - countStart;
      addSqlLog({
        id: `log-${Date.now()}-manual-count`,
        timestamp: Date.now(),
        sql: countSql,
        status: resCount?.success ? 'success' : 'error',
        duration: countDuration,
        message: resCount?.success ? '' : String(resCount?.message || t('dataViewer.count.failed')),
        dbName
      });

      if (manualCountSeqRef.current !== countSeq) return;
      if (manualCountKeyRef.current !== countKey) return;

      if (!resCount?.success) {
        setPagination(prev => ({ ...prev, totalCountLoading: false }));
        message.error(String(resCount?.message || t('dataViewer.countTotal.failed')));
        return;
      }
      if (!Array.isArray(resCount.data) || resCount.data.length === 0) {
        setPagination(prev => ({ ...prev, totalCountLoading: false }));
        return;
      }

      const total = parseTotalFromCountRow(resCount.data[0]);
      if (total === null) {
        setPagination(prev => ({ ...prev, totalCountLoading: false }));
        message.error(t('dataViewer.count.parseFailed'));
        return;
      }

      setPagination(prev => ({
        ...prev,
        total,
        totalKnown: true,
        totalApprox: false,
        approximateTotal: undefined,
        totalCountLoading: false,
        totalCountCancelled: false,
      }));
    } catch (e: unknown) {
      if (manualCountSeqRef.current !== countSeq) return;
      if (manualCountKeyRef.current !== countKey) return;
      setPagination(prev => ({ ...prev, totalCountLoading: false }));
      message.error(t('dataViewer.countTotal.failed') + ': ' + getErrorMessage(e, t('message.unknownError')));
    }
  }, [addSqlLog, t]);

  const handleCancelManualTotalCount = useCallback(() => {
    manualCountSeqRef.current++;
    setPagination(prev => ({ ...prev, totalCountLoading: false, totalCountCancelled: true }));
  }, []);

  const fetchData = useCallback(async (page = pagination.current, size = pagination.pageSize, options?: FetchDataOptions) => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    const conn = connections.find(c => c.id === tab.connectionId);
    if (!conn) {
        message.error(t('designer.connectionNotFound'));
        if (fetchSeqRef.current === seq) setLoading(false);
        return;
    }

    const config = { 
        ...conn.config, 
        port: Number(conn.config.port),
        password: conn.config.password || "",
        database: conn.config.database || "",
        useSSH: conn.config.useSSH || false,
        ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
    };

    const dbType = resolveDataSourceType(config);
    const dbTypeLower = String(dbType || '').trim().toLowerCase();
    if (dbTypeLower === 'redis') {
        message.error(t('dataViewer.redisUnsupported'));
        if (fetchSeqRef.current === seq) setLoading(false);
        return;
    }
    const isMySQLFamily = dbTypeLower === 'mysql' || dbTypeLower === 'mariadb' || dbTypeLower === 'diros';
    const normalizedQuickWhereCondition = normalizeQuickWhereCondition(quickWhereCondition);
    const quickWhereValidation = validateQuickWhereCondition(normalizedQuickWhereCondition, language);
    if (!quickWhereValidation.ok) {
        message.error(quickWhereValidation.message);
        if (fetchSeqRef.current === seq) setLoading(false);
        return;
    }
    const effectiveFilterConditions = buildEffectiveFilterConditions(filterConditions, normalizedQuickWhereCondition);
    const shouldRefreshExactTotal = options?.refreshTotal === true;

    const dbName = tab.dbName || '';
    const tableName = tab.tableName || '';
    const isMongoDB = dbTypeLower === 'mongodb';
    let mongoFilter: Record<string, unknown> | undefined;
    if (isMongoDB) {
        try {
            mongoFilter = buildMongoFilter(effectiveFilterConditions);
        } catch (e: unknown) {
            message.error(t('dataViewer.mongoFilter.invalid', { message: getErrorMessage(e, t('message.unknownError')) }));
            if (fetchSeqRef.current === seq) setLoading(false);
            return;
        }
    }

    const whereSQL = isMongoDB
      ? JSON.stringify(mongoFilter || {})
      : buildWhereSQL(dbType, effectiveFilterConditions);
    const countSql = isMongoDB
      ? buildMongoCountCommand(tableName, mongoFilter || {})
      : `SELECT COUNT(*) as total FROM ${quoteQualifiedIdent(dbType, tableName)} ${whereSQL}`;
    const orderBySQL = isMongoDB ? '' : buildOrderBySQL(dbType, sortInfo, pkColumns);
    const totalRows = Number(pagination.total);
    const hasFiniteTotal = Number.isFinite(totalRows) && totalRows >= 0;
    const totalKnown = pagination.totalKnown && hasFiniteTotal;
    const approximateTotalRows = Number(pagination.approximateTotal);
    const hasApproximateTotalPages =
      !totalKnown &&
      supportsApproximateTotalPages &&
      pagination.totalApprox &&
      Number.isFinite(approximateTotalRows) &&
      approximateTotalRows > 0;
    const effectiveTotalRows = hasApproximateTotalPages ? approximateTotalRows : totalRows;
    const totalPages = Number.isFinite(effectiveTotalRows) && effectiveTotalRows > 0 ? Math.max(1, Math.ceil(effectiveTotalRows / size)) : 0;
    const currentPage = totalPages > 0 ? Math.min(Math.max(1, page), totalPages) : Math.max(1, page);
    const offset = (currentPage - 1) * size;
    const isClickHouse = !isMongoDB && dbTypeLower === 'clickhouse';
    const reverseOrderSQL = isClickHouse ? reverseOrderBySQL(orderBySQL) : '';
    let useClickHouseReversePagination = false;
    let clickHouseReverseLimit = 0;
    let clickHouseReverseHasMore = false;
    let sql = '';
    if (isMongoDB) {
        const mongoSort = buildMongoSort(sortInfo, pkColumns);
        sql = buildMongoFindCommand({
            collection: tableName,
            filter: mongoFilter || {},
            sort: mongoSort,
            limit: size + 1,
            skip: offset,
        });
    } else {
        const baseSql = `SELECT * FROM ${quoteQualifiedIdent(dbType, tableName)} ${whereSQL}`;
        sql = `${baseSql}${orderBySQL}`;
        // ClickHouse 深分页在超大 OFFSET 下容易超时。对于总数已知且存在 ORDER BY 的场景，
        // 当“尾部偏移”小于“头部偏移”时，改为反向 ORDER BY + 小 OFFSET，并在前端翻转结果。
        if (isClickHouse && totalKnown && offset > 0 && reverseOrderSQL) {
            const pageRowCount = Math.max(0, Math.min(size, totalRows - offset));
            if (pageRowCount > 0) {
                const tailOffset = Math.max(0, totalRows - (offset + pageRowCount));
                if (tailOffset < offset) {
                    sql = buildPaginatedSelectSQL(dbType, baseSql, reverseOrderSQL, pageRowCount, tailOffset);
                    useClickHouseReversePagination = true;
                    clickHouseReverseLimit = pageRowCount;
                    clickHouseReverseHasMore = currentPage < totalPages;
                }
            }
        }
        if (!useClickHouseReversePagination) {
            // 大表性能：打开表不阻塞在 COUNT(*)，先通过多取 1 条判断是否还有下一页；总数在后台统计并异步回填。
            sql = buildPaginatedSelectSQL(dbType, baseSql, orderBySQL, size + 1, offset);
        }
    }

    const requestStartTime = Date.now();
    let executedSql = sql;
    try {
        const executeDataQuery = async (querySql: string, attemptLabel: string): Promise<QueryResultWithData<DataRow[]>> => {
            const startTime = Date.now();
            try {
                const result = await DBQuery(buildRpcConnectionConfig(config), dbName, querySql);
                addSqlLog({
                    id: `log-${Date.now()}-data`,
                    timestamp: Date.now(),
                    sql: querySql,
                    status: result.success ? 'success' : 'error',
                    duration: Date.now() - startTime,
                    message: result.success ? '' : `${attemptLabel}: ${result.message}`,
                    affectedRows: Array.isArray(result.data) ? result.data.length : undefined,
                    dbName
                });
                return result as QueryResultWithData<DataRow[]>;
            } catch (e: unknown) {
                const errMessage = getErrorMessage(e, 'query failed');
                addSqlLog({
                    id: `log-${Date.now()}-data`,
                    timestamp: Date.now(),
                    sql: querySql,
                    status: 'error',
                    duration: Date.now() - startTime,
                    message: `${attemptLabel}: ${errMessage}`,
                    dbName
                });
                return { success: false, message: errMessage, data: [], fields: [] } as QueryResultWithData<DataRow[]>;
            }
        };

        const hasSort = hasExplicitSort(sortInfo);
        const isSortMemoryErr = (msg: string) => /error\s*1038|out of sort memory/i.test(String(msg || ''));
        let resData = await executeDataQuery(sql, t('dataViewer.query.main'));

        if (!resData.success && dbTypeLower === 'duckdb' && isDuckDBUnsupportedTypeError(String(resData.message || ''))) {
            const cacheKey = `${tab.connectionId}|${dbName}|${tableName}`;
            let safeSelect = duckdbSafeSelectCacheRef.current[cacheKey] || '';
            if (!safeSelect) {
                try {
                    const resCols = await DBGetColumns(buildRpcConnectionConfig(config), dbName, tableName);
                    if (resCols?.success && Array.isArray(resCols.data)) {
                        const columnDefs = resCols.data as ColumnDefinition[];
                        const selectParts = columnDefs.map((col) => {
                            const colName = String(col?.name || '').trim();
                            if (!colName) return '';
                            const quotedCol = quoteIdentPart(dbType, colName);
                            if (isDuckDBComplexColumnType(col?.type)) {
                                return `CAST(${quotedCol} AS VARCHAR) AS ${quotedCol}`;
                            }
                            return quotedCol;
                        }).filter(Boolean);
                        if (selectParts.length > 0) {
                            safeSelect = selectParts.join(', ');
                            duckdbSafeSelectCacheRef.current[cacheKey] = safeSelect;
                        }
                    }
                } catch {
                    // ignore and keep original error path
                }
            }

            if (safeSelect) {
                let fallbackSql = `SELECT ${safeSelect} FROM ${quoteQualifiedIdent(dbType, tableName)} ${whereSQL}`;
                fallbackSql = buildPaginatedSelectSQL(dbType, fallbackSql, buildOrderBySQL(dbType, sortInfo, pkColumns), size + 1, offset);
                executedSql = fallbackSql;
                resData = await executeDataQuery(fallbackSql, t('dataViewer.query.complexTypeRetry'));
            }
        }

        if (!resData.success && isMySQLFamily && hasSort && isSortMemoryErr(resData.message)) {
            const retrySql32MB = withSortBufferTuningSQL(dbType, sql, 32 * 1024 * 1024);
            if (retrySql32MB !== sql) {
                executedSql = retrySql32MB;
                resData = await executeDataQuery(retrySql32MB, t('dataViewer.query.retrySortBuffer32'));
            }
            if (!resData.success && isSortMemoryErr(resData.message)) {
                const retrySql128MB = withSortBufferTuningSQL(dbType, sql, 128 * 1024 * 1024);
                if (retrySql128MB !== executedSql) {
                    executedSql = retrySql128MB;
                    resData = await executeDataQuery(retrySql128MB, t('dataViewer.query.retrySortBuffer128'));
                }
            }
            if (resData.success) {
                message.warning(t('dataViewer.sortBufferRetrySuccess'));
            }
        }
        
        if (resData.success) {
            let resultData = toDataRows(resData.data);

            if (useClickHouseReversePagination) {
                // 反向查询后恢复为原排序方向，保证用户看到的仍是“最后一页正序数据”。
                resultData = resultData.slice(0, clickHouseReverseLimit).reverse();
            }

            const hasMore = useClickHouseReversePagination ? clickHouseReverseHasMore : resultData.length > size;
            if (hasMore) resultData = resultData.slice(0, size);

            let fieldNames = resData.fields || [];
            if (fieldNames.length === 0 && resultData.length > 0) {
                fieldNames = Object.keys(resultData[0]);
            }
            if (fetchSeqRef.current !== seq) return;
            setColumnNames(fieldNames);
            const editLocatorKey = `${tab.connectionId}|${dbName}|${tableName}|${fieldNames.join('\u0001')}`;
            if (isMongoDB) {
                const mongoEditLocatorKey = `${editLocatorKey}|mongo`;
                if (editLocatorKeyRef.current !== mongoEditLocatorKey) {
                    editLocatorKeyRef.current = mongoEditLocatorKey;
                    editLocatorSeqRef.current++;
                    setPkColumns([]);
                    setEditLocator(resolveEditRowLocator({ resultColumns: fieldNames, primaryKeys: [], indexes: [], dbType: dbTypeLower, language }));
                }
            }

            if (!isMongoDB && editLocatorKeyRef.current !== editLocatorKey) {
                editLocatorKeyRef.current = editLocatorKey;
                const editSeq = ++editLocatorSeqRef.current;
                setPkColumns([]);
                setEditLocator(undefined);
                Promise.all([
                    DBGetColumns(buildRpcConnectionConfig(config), dbName, tableName),
                    DBGetIndexes(buildRpcConnectionConfig(config), dbName, tableName).catch(() => ({ success: false, message: t('queryEditor.indexLoadFailed'), data: [] } as QueryResult)),
                ])
                    .then(([resCols, resIndexes]: [QueryResult, QueryResult]) => {
                        if (editLocatorSeqRef.current !== editSeq) return;
                        if (editLocatorKeyRef.current !== editLocatorKey) return;
                        if (!resCols?.success || !Array.isArray(resCols.data)) {
                            setPkColumns([]);
                            setEditLocator(resolveEditRowLocator({ resultColumns: fieldNames, primaryKeys: [], indexes: [], dbType: dbTypeLower, language }));
                            return;
                        }
                        const pks = queryArrayData<ColumnDefinition>(resCols).filter((c) => c.key === 'PRI').map((c) => c.name);
                        const indexes = resIndexes?.success ? queryArrayData<IndexDefinition>(resIndexes) : [];
                        setPkColumns(pks);
                        setEditLocator(resolveEditRowLocator({ resultColumns: fieldNames, primaryKeys: pks, indexes, dbType: dbTypeLower, language }));
                    })
                    .catch(() => {
                        if (editLocatorSeqRef.current !== editSeq) return;
                        if (editLocatorKeyRef.current !== editLocatorKey) return;
                        setPkColumns([]);
                        setEditLocator(resolveEditRowLocator({ resultColumns: fieldNames, primaryKeys: [], indexes: [], dbType: dbTypeLower, language }));
                    });
            }

            resultData.forEach((row, i) => {
                if (row && typeof row === 'object') row[JAVANAVI_ROW_KEY] = `row-${offset + i}`;
            });
            setData(resultData);
            const countKey = `${tab.connectionId}|${dbName}|${tableName}|${whereSQL}`;
            const derivedTotalKnown = !hasMore;
            const derivedTotal = derivedTotalKnown ? offset + resultData.length : currentPage * size + 1;
            const minExpectedTotal = hasMore ? offset + resultData.length + 1 : offset + resultData.length;
            if (derivedTotalKnown) {
                countKeyRef.current = countKey;
                countSeqRef.current++;
            }
            latestConfigRef.current = config;
            latestDbTypeRef.current = dbTypeLower;
            latestDbNameRef.current = dbName;
            latestCountSqlRef.current = countSql;
            latestCountKeyRef.current = countKey;

            setPagination(prev => {
                if (derivedTotalKnown) {
                    return {
                        ...prev,
                        current: currentPage,
                        pageSize: size,
                        total: derivedTotal,
                        totalKnown: true,
                        totalApprox: false,
                        approximateTotal: undefined,
                        totalCountLoading: false,
                        totalCountCancelled: false,
                    };
                }
                const keepManualCounting = prev.totalCountLoading && manualCountKeyRef.current === countKey;
                if (prev.totalKnown && countKeyRef.current === countKey) {
                    // 当当前页存在“下一页”信号时，已知总数至少应大于当前页末尾。
                    // 若旧总数不满足该条件（例如刷新前统计值偏小），降级为未知总数并回退到 derivedTotal。
                    const previousTotal = Number(prev.total);
                    const staleKnownTotalBelowPage = !Number.isFinite(previousTotal) || previousTotal < minExpectedTotal;
                    if (!shouldRefreshExactTotal && !staleKnownTotalBelowPage) {
                        return { ...prev, current: currentPage, pageSize: size };
                    }
                    if (shouldRefreshExactTotal && !staleKnownTotalBelowPage) {
                        return {
                            ...prev,
                            current: currentPage,
                            pageSize: size,
                            total: Math.max(previousTotal, derivedTotal),
                            totalKnown: false,
                            totalApprox: false,
                            approximateTotal: undefined,
                            totalCountLoading: keepManualCounting,
                            totalCountCancelled: keepManualCounting ? false : prev.totalCountCancelled,
                        };
                    }
                }
                const hasApproximateTotalForCurrentKey =
                  prev.totalApprox &&
                  (duckdbApproxKeyRef.current === countKey || oracleApproxKeyRef.current === countKey) &&
                  Number.isFinite(prev.approximateTotal) &&
                  Number(prev.approximateTotal) >= minExpectedTotal;
                if (hasApproximateTotalForCurrentKey) {
                    return {
                        ...prev,
                        current: currentPage,
                        pageSize: size,
                        total: derivedTotal,
                        totalKnown: false,
                        totalApprox: true,
                        approximateTotal: prev.approximateTotal,
                        totalCountLoading: keepManualCounting,
                        totalCountCancelled: false,
                    };
                }
                return {
                    ...prev,
                    current: currentPage,
                    pageSize: size,
                    total: derivedTotal,
                    totalKnown: false,
                    totalApprox: false,
                    approximateTotal: undefined,
                    totalCountLoading: keepManualCounting,
                    totalCountCancelled: keepManualCounting ? false : prev.totalCountCancelled,
                };
            });

            const shouldRunAsyncCount = !derivedTotalKnown && !preferManualTotalCount;
            if (shouldRunAsyncCount) {
                if (shouldRefreshExactTotal || countKeyRef.current !== countKey) {
                    countKeyRef.current = countKey;
                    const countSeq = ++countSeqRef.current;
                    const countStart = Date.now();
                    // 大表 COUNT(*) 可能非常慢，且在部分运行时环境下会影响后续操作响应；
                    // DuckDB 大文件场景下该统计会显著拖慢翻页，已禁用后台 COUNT。
                    const countConfig = buildRpcConnectionConfig(config, { queryTimeout: 5 });

                    DBQuery(countConfig, dbName, countSql)
                        .then((resCount) => {
                            const countDuration = Date.now() - countStart;

                            addSqlLog({
                                id: `log-${Date.now()}-count`,
                                timestamp: Date.now(),
                                sql: countSql,
                                status: resCount.success ? 'success' : 'error',
                                duration: countDuration,
                                message: resCount.success ? '' : resCount.message,
                                dbName
                            });

                            if (countSeqRef.current !== countSeq) return;
                            if (latestCountKeyRef.current !== countKey) return;

                            if (!resCount.success) return;
                            if (!Array.isArray(resCount.data) || resCount.data.length === 0) return;

                            const total = parseTotalFromCountRow(resCount.data[0]);
                            if (total === null) return;

                            setPagination(prev => ({
                                ...prev,
                                total,
                                totalKnown: true,
                                totalApprox: false,
                                approximateTotal: undefined,
                                totalCountLoading: false,
                                totalCountCancelled: false,
                            }));
                        })
                        .catch(() => {
                            if (countSeqRef.current !== countSeq) return;
                            if (countKeyRef.current !== countKey) return;
                            // 统计失败不影响主流程，不弹窗；可在日志里查看。
                        });
                }
            }

            if (!derivedTotalKnown) {
                const approximateCountStrategy = supportsApproximateTableCount
                  ? resolveApproximateTableCountStrategy({ dbType: dbTypeLower, whereSQL })
                  : 'none';

                if (approximateCountStrategy === 'duckdb-estimated-size' && duckdbApproxKeyRef.current !== countKey) {
                    duckdbApproxKeyRef.current = countKey;
                    const approxSeq = ++duckdbApproxSeqRef.current;
                    const { schemaName, pureTableName } = resolveDuckDBSchemaAndTable(dbName, tableName);
                    const escapedSchema = escapeSQLLiteral(schemaName);
                    const escapedTable = escapeSQLLiteral(pureTableName);
                    const approxConfig = buildRpcConnectionConfig(config, { queryTimeout: 3 });
                    const approxSqlCandidates = [
                        `SELECT estimated_size AS approx_total FROM duckdb_tables() WHERE schema_name='${escapedSchema}' AND table_name='${escapedTable}' LIMIT 1`,
                        `SELECT estimated_size AS approx_total FROM duckdb_tables() WHERE table_name='${escapedTable}' ORDER BY CASE WHEN schema_name='${escapedSchema}' THEN 0 ELSE 1 END LIMIT 1`,
                    ];

                    (async () => {
                        for (const approxSql of approxSqlCandidates) {
                            try {
                                const approxRes = await DBQuery(approxConfig, dbName, approxSql);
                                if (duckdbApproxSeqRef.current !== approxSeq) return;
                                if (latestCountKeyRef.current !== countKey) return;
                                if (!approxRes?.success || !Array.isArray(approxRes.data) || approxRes.data.length === 0) continue;

                                const approxTotal = parseApproximateTableCountRow(approxRes.data[0]);
                                if (approxTotal === null) continue;
                                if (!Number.isFinite(approxTotal) || approxTotal < minExpectedTotal) continue;

                                setPagination(prev => {
                                    if (latestCountKeyRef.current !== countKey) return prev;
                                    if (prev.totalKnown) return prev;
                                    return {
                                        ...prev,
                                        totalKnown: false,
                                        totalApprox: true,
                                        approximateTotal: approxTotal,
                                        totalCountCancelled: false,
                                    };
                                });
                                return;
                            } catch {
                                if (duckdbApproxSeqRef.current !== approxSeq) return;
                                if (latestCountKeyRef.current !== countKey) return;
                            }
                        }
                    })();
                }

                if (approximateCountStrategy === 'oracle-num-rows' && oracleApproxKeyRef.current !== countKey) {
                    oracleApproxKeyRef.current = countKey;
                    const approxSeq = ++oracleApproxSeqRef.current;
                    const approxConfig = buildRpcConnectionConfig(config, { queryTimeout: 3 });
                    const approxSql = buildOracleApproximateTotalSql({ dbName, tableName });

                    DBQuery(approxConfig, dbName, approxSql)
                        .then((approxRes) => {
                            if (oracleApproxSeqRef.current !== approxSeq) return;
                            if (latestCountKeyRef.current !== countKey) return;
                            if (!approxRes?.success || !Array.isArray(approxRes.data) || approxRes.data.length === 0) return;

                            const approxTotal = parseApproximateTableCountRow(approxRes.data[0], ['approx_total', 'num_rows', 'estimated_rows', 'row_count', 'count', 'total']);
                            if (approxTotal === null) return;
                            if (!Number.isFinite(approxTotal) || approxTotal < minExpectedTotal) return;

                            setPagination(prev => {
                                if (latestCountKeyRef.current !== countKey) return prev;
                                if (prev.totalKnown) return prev;
                                return {
                                    ...prev,
                                    totalKnown: false,
                                    totalApprox: true,
                                    approximateTotal: approxTotal,
                                    totalCountCancelled: false,
                                };
                            });
                        })
                        .catch(() => {
                            if (oracleApproxSeqRef.current !== approxSeq) return;
                            if (latestCountKeyRef.current !== countKey) return;
                        });
                }
            }
        } else {
            message.error(String(resData.message || t('dataViewer.query.failed')));
        }
    } catch (e: unknown) {
        if (fetchSeqRef.current !== seq) return;
        const errorMessage = getErrorMessage(e, t('message.unknownError'));
        message.error(t('dataViewer.fetch.failed', { message: errorMessage }));
        addSqlLog({
            id: `log-${Date.now()}-error`,
            timestamp: Date.now(),
            sql: executedSql,
            status: 'error',
            duration: Date.now() - requestStartTime,
            message: errorMessage,
            dbName
        });
    }
    if (fetchSeqRef.current === seq) setLoading(false);
  }, [connections, tab, sortInfo, filterConditions, quickWhereCondition, pkColumns, pagination.total, pagination.totalKnown, pagination.totalApprox, pagination.approximateTotal, preferManualTotalCount, supportsApproximateTableCount, supportsApproximateTotalPages, language, t]);
  // 依赖 pkColumns：在无手动排序时可回退到主键稳定排序。
  // 主键信息只会在首次加载后更新一次，避免循环查询。

  // Handlers memoized
  const handleReload = useCallback(() => {
    fetchData(pagination.current, pagination.pageSize, { refreshTotal: true });
  }, [fetchData, pagination.current, pagination.pageSize]);
  useEffect(() => {
    const handleRefreshActiveTable = () => {
      if (useStore.getState().activeTabId !== tab.id) {
        return;
      }
      handleReload();
    };

    window.addEventListener('javanavi:refresh-active-table', handleRefreshActiveTable as EventListener);
    return () => {
      window.removeEventListener('javanavi:refresh-active-table', handleRefreshActiveTable as EventListener);
    };
  }, [handleReload, tab.id]);
  const handleSort = useCallback((field: string, order: string) => {
    // 支持多字段排序：field 为 JSON 数组字符串时解析为多字段
    try {
      const parsed = JSON.parse(field);
      if (Array.isArray(parsed)) {
        setSortInfo(normalizeViewerSortInfo(parsed));
        return;
      }
    } catch { /* 单字段模式 */ }
    const normalizedOrder = isViewerSortOrder(order) ? order : undefined;
    const normalizedField = String(field || '').trim();
    if (!normalizedField || !normalizedOrder) {
      setSortInfo([]);
      return;
    }
    setSortInfo([{ columnKey: normalizedField, order: normalizedOrder, enabled: true }]);
  }, []);
  const handlePageChange = useCallback((page: number, size: number) => fetchData(page, size, { refreshTotal: true }), [fetchData]);
  const handleToggleFilter = useCallback(() => setShowFilter(prev => !prev), []);
  const handleApplyFilter = useCallback((conditions: FilterCondition[]) => setFilterConditions(conditions), []);
  const handleApplyQuickWhereCondition = useCallback((condition: string) => {
    const normalized = normalizeQuickWhereCondition(condition);
    const validation = validateQuickWhereCondition(normalized, language);
    if (!validation.ok) {
      message.error(validation.message);
      return;
    }
    setQuickWhereCondition(normalized);
  }, [language]);

  const exportSqlWithFilter = useMemo(() => {
    const tableName = String(tab.tableName || '').trim();
    const dbType = resolveDataSourceType(currentConnConfig);
    if (!tableName || !dbType || dbType === 'mongodb') return '';

    const effectiveFilterConditions = buildEffectiveFilterConditions(filterConditions, quickWhereCondition);
    const whereSQL = buildWhereSQL(dbType, effectiveFilterConditions);
    if (!whereSQL) return '';

    let sql = `SELECT * FROM ${quoteQualifiedIdent(dbType, tableName)} ${whereSQL}`;
    sql += buildOrderBySQL(dbType, sortInfo, pkColumns);
    const normalizedType = dbType.toLowerCase();
    const hasSortForBuffer = hasExplicitSort(sortInfo);
    if (hasSortForBuffer && (normalizedType === 'mysql' || normalizedType === 'mariadb')) {
      sql = withSortBufferTuningSQL(normalizedType, sql, 32 * 1024 * 1024);
    }
    return sql;
  }, [tab.tableName, currentConnConfig?.type, currentConnConfig?.driver, filterConditions, quickWhereCondition, sortInfo, pkColumns]);

  useEffect(() => {
    const action = resolveDataViewerAutoFetchAction({
      skipNextAutoFetch: skipNextAutoFetchRef.current,
      hasInitialLoad: initialLoadRef.current,
    });
    if (action === 'skip') {
      skipNextAutoFetchRef.current = false;
      return;
    }
    if (action === 'load-current-page') {
      initialLoadRef.current = true;
      fetchData(pagination.current, pagination.pageSize);
      return;
    }
    fetchData(1, pagination.pageSize);
  }, [tab.id, tab.connectionId, tab.dbName, tab.tableName, sortInfo, filterConditions, quickWhereCondition]); // Initial load and re-load on sort/filter

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, minWidth: 0, height: '100%', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <DataGrid
          data={data}
          columnNames={columnNames}
          loading={loading}
          tableName={tab.tableName}
          exportScope="table"
          dbName={tab.dbName}
          connectionId={tab.connectionId}
          pkColumns={pkColumns}
          editLocator={editLocator}
          onReload={handleReload}
          onSort={handleSort}
          onPageChange={handlePageChange}
          pagination={pagination}
          onRequestTotalCount={preferManualTotalCount ? handleManualTotalCount : undefined}
          onCancelTotalCount={preferManualTotalCount ? handleCancelManualTotalCount : undefined}
          showFilter={showFilter}
          onToggleFilter={handleToggleFilter}
          onApplyFilter={handleApplyFilter}
          appliedFilterConditions={filterConditions}
          quickWhereCondition={quickWhereCondition}
          onApplyQuickWhereCondition={handleApplyQuickWhereCondition}
          readOnly={forceReadOnly}
          sortInfoExternal={sortInfo}
          exportSqlWithFilter={exportSqlWithFilter || undefined}
          scrollSnapshot={scrollSnapshotRef.current}
          onScrollSnapshotChange={handleTableScrollSnapshotChange}
      />
    </div>
  );
};

export default DataViewer;
