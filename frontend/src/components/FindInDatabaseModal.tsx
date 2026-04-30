import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Modal, Input, Button, Table, Progress, Space, Tag, message, Tooltip, Select, Empty } from 'antd';
import { SearchOutlined, StopOutlined, EyeOutlined, DatabaseOutlined } from '@ant-design/icons';
import { DBQuery, DBGetTables, DBGetAllColumns } from '@compat/javanaviApp';
import { quoteIdentPart, escapeLiteral } from '../utils/sql';
import { useStore } from '../store';
import { buildOverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { isMacLikePlatform } from '../utils/appearance';

interface FindInDatabaseModalProps {
    open: boolean;
    onClose: () => void;
    connectionId: string;
    dbName: string;
}

interface SearchResultItem {
    tableName: string;
    matchedColumns: string[];
    matchCount: number;
    rows: Record<string, any>[];
    columns: string[];
}

/** 判断数据库列类型是否为文本类型（只搜索文本字段） */
const isTextColumnType = (colType: string): boolean => {
    const t = (colType || '').toLowerCase().trim();
    // 显式排除非文本类型
    if (/^(int|bigint|smallint|tinyint|mediumint|float|double|decimal|numeric|real|money|smallmoney|bit|boolean|bool)/.test(t)) return false;
    if (/^(date|time|datetime|timestamp|year|interval)/.test(t)) return false;
    if (/^(blob|binary|varbinary|image|bytea|raw|long raw)/.test(t)) return false;
    if (/^(geometry|geography|point|line|polygon|spatial)/.test(t)) return false;
    if (/^(json|jsonb|xml|uuid|uniqueidentifier)/.test(t)) return false;
    if (/^(serial|bigserial|smallserial|autoincrement|identity)/.test(t)) return false;
    // 文本类型正匹配
    if (/^(varchar|char|nvarchar|nchar|text|ntext|tinytext|mediumtext|longtext|string|clob|nclob|character)/.test(t)) return true;
    if (t === 'sysname' || t === 'sql_variant') return true;
    // 未知类型默认尝试搜索
    return true;
};

/** 根据 dbType 构建限制返回行数的 SELECT SQL */
const buildLimitedSelectSQL = (dbType: string, baseSql: string, limit: number): string => {
    const normalizedType = (dbType || '').toLowerCase();
    switch (normalizedType) {
        case 'sqlserver':
        case 'mssql':
            return baseSql.replace(/^SELECT\b/i, `SELECT TOP ${limit}`);
        case 'oracle':
        case 'dameng':
            return `${baseSql} FETCH FIRST ${limit} ROWS ONLY`;
        default:
            return `${baseSql} LIMIT ${limit}`;
    }
};

const MAX_MATCH_ROWS_PER_TABLE = 100;

const FindInDatabaseModal: React.FC<FindInDatabaseModalProps> = ({ open, onClose, connectionId, dbName }) => {
    const [keyword, setKeyword] = useState('');
    const [matchMode, setMatchMode] = useState<'contains' | 'exact'>('contains');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [progress, setProgress] = useState({ current: 0, total: 0, tableName: '' });
    const [expandedTable, setExpandedTable] = useState<string | null>(null);
    const cancelledRef = useRef(false);

    const connections = useStore(state => state.connections);
    const theme = useStore(state => state.theme);
    const disableLocalBackdropFilter = isMacLikePlatform();

    const conn = useMemo(() => connections.find(c => c.id === connectionId), [connections, connectionId]);
    const dbType = useMemo(() => (conn?.config?.type || 'mysql').toLowerCase(), [conn]);

    const wt = useMemo(() => {
        const isDark = theme === 'dark';
        return buildOverlayWorkbenchTheme(isDark, { disableBackdropFilter: disableLocalBackdropFilter });
    }, [disableLocalBackdropFilter, theme]);

    const buildConfig = useCallback(() => {
        if (!conn) return null;
        return {
            ...conn.config,
            port: Number(conn.config.port),
            password: conn.config.password || "",
            database: conn.config.database || "",
            useSSH: conn.config.useSSH || false,
            ssh: conn.config.ssh || { host: "", port: 22, user: "", password: "", keyPath: "" }
        };
    }, [conn]);

    const handleSearch = useCallback(async () => {
        const searchKeyword = keyword.trim();
        if (!searchKeyword) {
            message.warning('请输入搜索关键字');
            return;
        }
        const config = buildConfig();
        if (!config) {
            message.error('未找到连接配置');
            return;
        }

        setSearching(true);
        setResults([]);
        setExpandedTable(null);
        cancelledRef.current = false;

        try {
            // 1. 获取所有表
            const tablesRes = await DBGetTables(buildRpcConnectionConfig(config) as any, dbName);
            if (!tablesRes.success) {
                message.error('获取表列表失败: ' + tablesRes.message);
                setSearching(false);
                return;
            }
            const tableRows: any[] = Array.isArray(tablesRes.data) ? tablesRes.data : [];
            const tableNames = tableRows.map((row: any) => Object.values(row)[0] as string).filter(Boolean);

            if (tableNames.length === 0) {
                message.info('当前数据库没有表');
                setSearching(false);
                return;
            }

            setProgress({ current: 0, total: tableNames.length, tableName: '' });

            // 2. 获取所有列信息（返回 any[]，含 tableName/name/type 字段）
            const allColsRes = await DBGetAllColumns(buildRpcConnectionConfig(config) as any, dbName);
            const allColumns: any[] = (allColsRes?.success && Array.isArray(allColsRes.data)) ? allColsRes.data : [];

            // 按表名分组
            const columnsByTable: Record<string, Array<{ name: string; type: string }>> = {};
            allColumns.forEach((col: any) => {
                const tbl = col.tableName || '';
                if (!columnsByTable[tbl]) columnsByTable[tbl] = [];
                columnsByTable[tbl].push({ name: col.name, type: col.type || '' });
            });

            const searchResults: SearchResultItem[] = [];
            const escapedKeyword = escapeLiteral(searchKeyword);

            // 3. 逐表搜索
            for (let i = 0; i < tableNames.length; i++) {
                if (cancelledRef.current) break;

                const tableName = tableNames[i];
                setProgress({ current: i + 1, total: tableNames.length, tableName });

                // 获取该表的文本列
                const tableCols = columnsByTable[tableName] || [];
                const textCols = tableCols.filter(c => isTextColumnType(c.type));

                if (textCols.length === 0) continue;

                // 构建 WHERE 子句
                const castType = (dbType === 'sqlserver' || dbType === 'mssql') ? 'NVARCHAR(MAX)' : 'CHAR';
                const whereConditions = textCols.map(c => {
                    const quotedCol = quoteIdentPart(dbType, c.name);
                    if (matchMode === 'exact') {
                        return `CAST(${quotedCol} AS ${castType}) = '${escapedKeyword}'`;
                    }
                    return `CAST(${quotedCol} AS ${castType}) LIKE '%${escapedKeyword}%'`;
                });

                const quotedTable = quoteIdentPart(dbType, tableName);
                const baseSql = `SELECT * FROM ${quotedTable} WHERE ${whereConditions.join(' OR ')}`;
                const sql = buildLimitedSelectSQL(dbType, baseSql, MAX_MATCH_ROWS_PER_TABLE);

                try {
                    const res = await DBQuery(buildRpcConnectionConfig(config) as any, dbName, sql);
                    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                        // 检查哪些列实际匹配了
                        const matchedCols = new Set<string>();
                        const lowerKeyword = searchKeyword.toLowerCase();
                        res.data.forEach((row: any) => {
                            textCols.forEach(c => {
                                const val = row[c.name];
                                if (val != null) {
                                    const strVal = String(val).toLowerCase();
                                    if (matchMode === 'exact' ? strVal === lowerKeyword : strVal.includes(lowerKeyword)) {
                                        matchedCols.add(c.name);
                                    }
                                }
                            });
                        });

                        if (matchedCols.size > 0) {
                            const columns = Object.keys(res.data[0]);
                            searchResults.push({
                                tableName,
                                matchedColumns: Array.from(matchedCols),
                                matchCount: res.data.length,
                                rows: res.data,
                                columns,
                            });
                            setResults([...searchResults]);
                        }
                    }
                } catch {
                    // 单表查询失败不中断整体搜索
                }
            }

            if (!cancelledRef.current) {
                setResults([...searchResults]);
                if (searchResults.length === 0) {
                    message.info('未找到匹配的数据');
                }
            }
        } catch (e: any) {
            message.error('搜索出错: ' + (e?.message || String(e)));
        } finally {
            setSearching(false);
        }
    }, [keyword, matchMode, dbName, dbType, buildConfig]);

    const handleCancel = useCallback(() => {
        cancelledRef.current = true;
    }, []);

    const handleClose = useCallback(() => {
        cancelledRef.current = true;
        setResults([]);
        setExpandedTable(null);
        setProgress({ current: 0, total: 0, tableName: '' });
        onClose();
    }, [onClose]);

    // 汇总表的列定义
    const summaryColumns = useMemo(() => [
        {
            title: '表名',
            dataIndex: 'tableName',
            key: 'tableName',
            width: 220,
            render: (text: string) => (
                <span style={{ fontWeight: 500, color: wt.titleText }}>
                    <DatabaseOutlined style={{ marginRight: 6, color: wt.iconColor }} />
                    {text}
                </span>
            ),
        },
        {
            title: '匹配列',
            dataIndex: 'matchedColumns',
            key: 'matchedColumns',
            render: (cols: string[]) => (
                <Space size={4} wrap>
                    {cols.map(col => (
                        <Tag key={col} color="blue" style={{ margin: 0, fontSize: 12 }}>{col}</Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: '命中行数',
            dataIndex: 'matchCount',
            key: 'matchCount',
            width: 100,
            align: 'center' as const,
            render: (count: number) => (
                <Tag color={count >= MAX_MATCH_ROWS_PER_TABLE ? 'orange' : 'green'}>
                    {count >= MAX_MATCH_ROWS_PER_TABLE ? `≥${count}` : count}
                </Tag>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            align: 'center' as const,
            render: (_: any, record: SearchResultItem) => (
                <Tooltip title={expandedTable === record.tableName ? '收起详情' : '查看详情'}>
                    <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={(e) => { e.stopPropagation(); setExpandedTable(prev => prev === record.tableName ? null : record.tableName); }}
                        style={{ color: wt.iconColor }}
                    />
                </Tooltip>
            ),
        },
    ], [wt, expandedTable]);

    // 展开的详情行 - 动态列
    const expandedResult = useMemo(() => {
        if (!expandedTable) return null;
        return results.find(r => r.tableName === expandedTable);
    }, [expandedTable, results]);

    const detailColumns = useMemo(() => {
        if (!expandedResult) return [];
        const lowerKeyword = keyword.trim().toLowerCase();
        return expandedResult.columns.map(col => ({
            title: col,
            dataIndex: col,
            key: col,
            width: 180,
            ellipsis: true,
            render: (value: any) => {
                const strVal = value != null ? String(value) : '';
                const isMatch = expandedResult.matchedColumns.includes(col) &&
                    strVal.toLowerCase().includes(lowerKeyword);
                return (
                    <Tooltip title={strVal} placement="topLeft">
                        <span style={isMatch ? { background: 'rgba(255, 193, 7, 0.3)', padding: '1px 3px', borderRadius: 3 } : undefined}>
                            {strVal || <span style={{ color: wt.mutedText }}>NULL</span>}
                        </span>
                    </Tooltip>
                );
            },
        }));
    }, [expandedResult, keyword, wt]);

    const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
        <Modal
            title={
                <span style={{ color: wt.titleText, fontWeight: 600 }}>
                    <SearchOutlined style={{ marginRight: 8, color: wt.iconColor }} />
                    在数据库中搜索 — {dbName}
                </span>
            }
            open={open}
            onCancel={handleClose}
            footer={null}
            width={960}
            styles={{
                content: {
                    background: wt.shellBg,
                    borderRadius: 16,
                    border: wt.shellBorder,
                    boxShadow: wt.shellShadow,
                    backdropFilter: wt.shellBackdropFilter,
                    WebkitBackdropFilter: wt.shellBackdropFilter,
                },
                header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
                body: { paddingTop: 8 },
            }}
            destroyOnClose
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 搜索栏 */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                        placeholder="输入要搜索的字符串..."
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        onPressEnter={!searching ? handleSearch : undefined}
                        style={{ flex: 1 }}
                        disabled={searching}
                        autoFocus
                    />
                    <Select
                        value={matchMode}
                        onChange={v => setMatchMode(v)}
                        disabled={searching}
                        style={{ width: 110 }}
                        options={[
                            { label: '包含', value: 'contains' },
                            { label: '精确匹配', value: 'exact' },
                        ]}
                    />
                    {searching ? (
                        <Button icon={<StopOutlined />} danger onClick={handleCancel}>
                            取消
                        </Button>
                    ) : (
                        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} disabled={!keyword.trim()}>
                            搜索
                        </Button>
                    )}
                </div>

                {/* 进度条 */}
                {searching && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Progress
                            percent={percent}
                            size="small"
                            status="active"
                            strokeColor={wt.iconColor}
                        />
                        <span style={{ fontSize: 12, color: wt.mutedText }}>
                            正在搜索 {progress.tableName}... ({progress.current}/{progress.total})
                        </span>
                    </div>
                )}

                {/* 结果汇总表 */}
                {results.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 13, color: wt.mutedText, fontWeight: 500 }}>
                            找到 {results.length} 个表包含匹配数据
                            {searching && '（搜索进行中...）'}
                        </div>
                        <Table
                            dataSource={results}
                            columns={summaryColumns}
                            rowKey="tableName"
                            size="small"
                            pagination={false}
                            style={{ borderRadius: 8, overflow: 'hidden' }}
                            scroll={{ y: expandedTable ? 200 : 400 }}
                            onRow={(record) => ({
                                style: {
                                    cursor: 'pointer',
                                    background: expandedTable === record.tableName ? wt.hoverBg : undefined,
                                },
                                onClick: () => setExpandedTable(prev => prev === record.tableName ? null : record.tableName),
                            })}
                        />
                    </div>
                )}

                {/* 详情展开 */}
                {expandedResult && (
                    <div style={{
                        border: wt.sectionBorder,
                        borderRadius: 8,
                        background: wt.sectionBg,
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '8px 12px',
                            borderBottom: wt.sectionBorder,
                            fontSize: 13,
                            fontWeight: 500,
                            color: wt.titleText,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <span>
                                <DatabaseOutlined style={{ marginRight: 6 }} />
                                {expandedResult.tableName} — 匹配行详情
                            </span>
                            <Tag color="blue">{expandedResult.rows.length} 行</Tag>
                        </div>
                        <Table
                            dataSource={expandedResult.rows.map((row, i) => ({ ...row, __rowIdx: i }))}
                            columns={detailColumns}
                            rowKey="__rowIdx"
                            size="small"
                            pagination={{ pageSize: 20, size: 'small', showSizeChanger: false }}
                            scroll={{ x: Math.max(800, expandedResult.columns.length * 180) }}
                            style={{ fontSize: 12 }}
                        />
                    </div>
                )}

                {/* 无结果且搜索完成 */}
                {!searching && results.length === 0 && progress.total > 0 && (
                    <Empty description="未找到匹配的数据" style={{ margin: '24px 0' }} />
                )}
            </div>
        </Modal>
    );
};

export default FindInDatabaseModal;
