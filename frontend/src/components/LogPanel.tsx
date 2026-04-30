import React, { useRef, useEffect } from 'react';
import { Table, Tag, Button, Tooltip, Empty } from 'antd';
import { ClearOutlined, CloseOutlined, BugOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useStore } from '../store';
import { normalizeOpacityForPlatform, resolveAppearanceValues } from '../utils/appearance';

interface LogPanelProps {
    height: number;
    onClose: () => void;
    onResizeStart: (e: React.MouseEvent) => void;
}

const LogPanel: React.FC<LogPanelProps> = ({ height, onClose, onResizeStart }) => {
    const sqlLogs = useStore(state => state.sqlLogs);
    const clearSqlLogs = useStore(state => state.clearSqlLogs);
    const theme = useStore(state => state.theme);
    const appearance = useStore(state => state.appearance);
    const darkMode = theme === 'dark';
    const resolvedAppearance = resolveAppearanceValues(appearance);
    const opacity = normalizeOpacityForPlatform(resolvedAppearance.opacity);

    // Background Helper
    const getBg = (darkHex: string) => {
        if (!darkMode) return `rgba(255, 255, 255, ${opacity})`;
        const hex = darkHex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };
    const bgMain = getBg('#1d1d1d');
    const shellOpacity = darkMode ? Math.max(0.18, opacity * 0.82) : Math.max(0.28, opacity * 0.92);
    const shellOpacityStrong = darkMode ? Math.max(0.22, opacity * 0.9) : Math.max(0.34, opacity * 0.96);
    const panelDividerColor = darkMode
        ? `rgba(255,255,255,${Math.max(0.04, opacity * 0.10)})`
        : `rgba(0,0,0,${Math.max(0.04, opacity * 0.08)})`;
    const panelMutedTextColor = darkMode ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)';
    const panelShellBg = darkMode
        ? `linear-gradient(180deg, rgba(15,20,30,${shellOpacity}) 0%, rgba(9,13,22,${shellOpacityStrong}) 100%)`
        : `linear-gradient(180deg, rgba(255,255,255,${shellOpacityStrong}) 0%, rgba(246,248,252,${shellOpacity}) 100%)`;
    const panelAccentColor = darkMode ? '#ffd666' : '#1677ff';
    const panelShadow = darkMode
        ? `0 12px 28px rgba(0,0,0,${Math.max(0.05, opacity * 0.18)})`
        : `0 12px 24px rgba(15,23,42,${Math.max(0.02, opacity * 0.08)})`;
    const logScrollbarThumb = darkMode
        ? `rgba(255, 255, 255, ${Math.max(0.18, opacity * 0.34)})`
        : `rgba(0, 0, 0, ${Math.max(0.12, opacity * 0.26)})`;
    const logScrollbarThumbHover = darkMode
        ? `rgba(255, 255, 255, ${Math.max(0.28, opacity * 0.48)})`
        : `rgba(0, 0, 0, ${Math.max(0.18, opacity * 0.36)})`;

    const columns = [
        {
            title: 'Time',
            dataIndex: 'timestamp',
            width: 80,
            render: (ts: number) => <span style={{ color: panelMutedTextColor, fontSize: '12px' }}>{new Date(ts).toLocaleTimeString()}</span>
        },
        {
            title: 'Status',
            dataIndex: 'status',
            width: 70,
            render: (status: string) => (
                <Tag color={status === 'success' ? 'success' : 'error'} style={{ marginRight: 0, borderRadius: 999, paddingInline: 8, fontSize: 11, fontWeight: 700 }}>
                    {status === 'success' ? 'OK' : 'ERR'}
                </Tag>
            )
        },
        {
            title: 'Duration',
            dataIndex: 'duration',
            width: 70,
            render: (d: number) => <span style={{ color: d > 1000 ? 'orange' : 'inherit', fontSize: '12px' }}>{d}ms</span>
        },
        {
            title: 'SQL / Message',
            dataIndex: 'sql',
            render: (text: string, record: any) => (
                <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '12px', lineHeight: '1.45' }}>
                    <div style={{ color: darkMode ? '#a6e22e' : '#005cc5' }}>{text}</div>
                    {record.message && <div style={{ color: '#ff4d4f', marginTop: 2 }}>{record.message}</div>}
                    {record.affectedRows !== undefined && <div style={{ color: panelMutedTextColor, marginTop: 1 }}>Affected: {record.affectedRows}</div>}
                </div>
            )
        }
    ];

    return (
        <div style={{ 
            height, 
            margin: 0,
            border: `1px solid ${panelDividerColor}`,
            borderRadius: 14,
            background: panelShellBg,
            WebkitBackdropFilter: opacity < 0.999 ? 'blur(14px)' : 'none',
            boxShadow: panelShadow,
            backdropFilter: darkMode && opacity < 0.999 ? 'blur(18px)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
            zIndex: 100
        }}>
            {/* Resize Handle */}
            <div 
                onMouseDown={onResizeStart}
                style={{
                    position: 'absolute',
                    top: -4,
                    left: 0,
                    right: 0,
                    height: 8,
                    cursor: 'row-resize',
                    zIndex: 10
                }}
            />

            {/* Toolbar */}
            <div style={{ 
                padding: '10px 14px', 
                borderBottom: `1px solid ${panelDividerColor}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                minHeight: 48
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center', background: darkMode ? `rgba(255,214,102,${Math.max(0.10, Math.min(0.18, opacity * 0.18))})` : `rgba(24,144,255,${Math.max(0.08, Math.min(0.16, opacity * 0.16))})`, color: panelAccentColor, flexShrink: 0 }}>
                        <BugOutlined />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: darkMode ? '#f5f7ff' : '#162033' }}>SQL 执行日志</div>
                        <div style={{ fontSize: 12, color: panelMutedTextColor }}>记录执行状态、耗时与错误信息，便于快速回溯。</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tooltip title="清空日志">
                        <Button type="text" size="small" icon={<ClearOutlined />} onClick={clearSqlLogs} style={{ color: panelMutedTextColor }} />
                    </Tooltip>
                    <Tooltip title="关闭面板">
                        <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} style={{ color: panelMutedTextColor }} />
                    </Tooltip>
                </div>
            </div>

            {/* List */}
            <div className="log-panel-scroll" style={{ flex: 1, overflow: 'auto', padding: '8px 10px 10px' }}>
                {sqlLogs.length === 0 ? (
                    <div style={{ height: '100%', minHeight: 160, display: 'grid', placeItems: 'center' }}>
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={<span style={{ color: panelMutedTextColor }}>暂无 SQL 执行日志</span>}
                        />
                    </div>
                ) : (
                    <Table 
                        className="log-panel-table"
                        dataSource={sqlLogs} 
                        columns={columns} 
                        size="small" 
                        pagination={false} 
                        rowKey="id"
                        showHeader={false}
                    />
                )}
            </div>
            <style>{`
                .log-panel-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: ${logScrollbarThumb} transparent;
                }
                .log-panel-scroll::-webkit-scrollbar {
                    width: 10px;
                    height: 10px;
                }
                .log-panel-scroll::-webkit-scrollbar-track,
                .log-panel-scroll::-webkit-scrollbar-corner {
                    background: transparent;
                }
                .log-panel-scroll::-webkit-scrollbar-thumb {
                    background: ${logScrollbarThumb};
                    border-radius: 8px;
                    border: 2px solid transparent;
                    background-clip: padding-box;
                }
                .log-panel-scroll::-webkit-scrollbar-thumb:hover {
                    background: ${logScrollbarThumbHover};
                    background-clip: padding-box;
                }
                .log-panel-table .ant-table,
                .log-panel-table .ant-table-container,
                .log-panel-table .ant-table-tbody > tr > td {
                    background: transparent !important;
                }
                .log-panel-table .ant-table-tbody > tr > td {
                    padding: 8px 10px !important;
                    border-bottom: 1px solid ${panelDividerColor} !important;
                }
                .log-panel-table .ant-table-tbody > tr:last-child > td {
                    border-bottom: none !important;
                }
                .log-panel-table .ant-table-row:hover > td {
                    background: ${darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(16,24,40,0.03)'} !important;
                }
            `}</style>
        </div>
    );
};

export default LogPanel;
