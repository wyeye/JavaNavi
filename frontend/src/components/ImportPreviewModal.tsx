import React, { useState, useEffect } from 'react';
import { Modal, Table, Alert, Progress, Button, Space } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { PreviewImportFile, ImportDataWithProgress } from '@compat/javanaviApp';
import { EventsOn, EventsOff } from '@compat/runtime';
import { useStore } from '../store';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';

interface ImportPreviewModalProps {
    visible: boolean;
    filePath: string;
    connectionId: string;
    dbName: string;
    tableName: string;
    onClose: () => void;
    onSuccess: () => void;
}

interface PreviewData {
    columns: string[];
    totalRows: number;
    previewRows: Record<string, unknown>[];
}

type PreviewPayload = { columns?: unknown; totalRows?: unknown; previewRows?: unknown };

interface ImportProgress {
    current: number;
    total: number;
    success: number;
    errors: number;
}

interface ImportResult {
    success?: number;
    failed?: number;
    errorLogs?: string[];
}

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const toPreviewPayload = (value: unknown): PreviewPayload => (
    value && typeof value === 'object' && !Array.isArray(value) ? value as PreviewPayload : {}
);

const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
    visible,
    filePath,
    connectionId,
    dbName,
    tableName,
    onClose,
    onSuccess
}) => {
    const connections = useStore(state => state.connections);
    const [loading, setLoading] = useState(true);
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState<ImportProgress | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    useEffect(() => {
        if (visible && filePath) {
            loadPreview();
        }
    }, [visible, filePath]);

    useEffect(() => {
        if (importing) {
            const unsubscribe = EventsOn('import:progress', (data: ImportProgress) => {
                setProgress(data);
            });
            return () => {
                EventsOff('import:progress');
            };
        }
    }, [importing]);

    const loadPreview = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await PreviewImportFile(filePath);
            if (res.success && res.data) {
                const payload = toPreviewPayload(res.data);
                setPreviewData({
                    columns: Array.isArray(payload.columns) ? payload.columns.map(String) : [],
                    totalRows: typeof payload.totalRows === 'number' ? payload.totalRows : Number(payload.totalRows || 0),
                    previewRows: Array.isArray(payload.previewRows) ? payload.previewRows as Record<string, unknown>[] : []
                });
            } else {
                setError(res.message || '预览失败');
            }
        } catch (e: unknown) {
            setError('预览失败: ' + getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!previewData) return;

        setImporting(true);
        setProgress({ current: 0, total: previewData.totalRows, success: 0, errors: 0 });
        setImportResult(null);

        try {
            const conn = connections.find(c => c.id === connectionId);
            if (!conn) {
                setError('连接配置未找到');
                setImporting(false);
                return;
            }

            const config = {
                ...conn.config,
                port: Number(conn.config.port),
                password: conn.config.password || '',
                database: conn.config.database || '',
                useSSH: conn.config.useSSH || false,
                ssh: conn.config.ssh || { host: '', port: 22, user: '', password: '', keyPath: '' }
            };

            const res = await ImportDataWithProgress(buildRpcConnectionConfig(config), dbName, tableName, filePath, true);

            if (res.success && res.data) {
                const resultData = toPreviewPayload(res.data) as ImportResult;
                setImportResult(resultData);
                if (resultData.failed === 0) {
                    onSuccess();
                }
            } else {
                setError(res.message || '导入失败');
            }
        } catch (e: unknown) {
            setError('导入失败: ' + getErrorMessage(e));
        } finally {
            setImporting(false);
        }
    };

    const columns = previewData?.columns.map(col => ({
        title: col,
        dataIndex: col,
        key: col,
        ellipsis: true,
        width: 150
    })) || [];

    const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
        <Modal
            title="导入数据预览"
            open={visible}
            onCancel={onClose}
            width={900}
            footer={
                importResult ? (
                    <Space>
                        <Button onClick={onClose}>关闭</Button>
                    </Space>
                ) : importing ? null : (
                    <Space>
                        <Button onClick={onClose}>取消</Button>
                        <Button
                            type="primary"
                            onClick={handleImport}
                            disabled={!previewData || loading}
                        >
                            开始导入
                        </Button>
                    </Space>
                )
            }
        >
            {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}

            {loading && <div style={{ textAlign: 'center', padding: 40 }}>加载预览数据...</div>}

            {!loading && previewData && !importing && !importResult && (
                <>
                    <Alert
                        type="info"
                        message={`共 ${previewData.totalRows} 行数据，${previewData.columns.length} 个字段`}
                        description='以下是前 5 行预览数据，确认无误后点击“开始导入”'
                        style={{ marginBottom: 16 }}
                        showIcon
                    />
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>字段列表：</div>
                    <div style={{ marginBottom: 16, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                        {previewData.columns.join(', ')}
                    </div>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>数据预览（前 5 行）：</div>
                    <Table
                        dataSource={previewData.previewRows}
                        columns={columns}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        size="small"
                        bordered
                    />
                </>
            )}

            {importing && progress && (
                <div style={{ padding: '40px 20px' }}>
                    <div style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, textAlign: 'center' }}>
                        正在导入数据...
                    </div>
                    <Progress percent={progressPercent} status="active" />
                    <div style={{ marginTop: 16, textAlign: 'center', color: '#666' }}>
                        已处理 {progress.current} / {progress.total} 行
                        <span style={{ marginLeft: 16, color: '#52c41a' }}>
                            <CheckCircleOutlined /> 成功 {progress.success}
                        </span>
                        {progress.errors > 0 && (
                            <span style={{ marginLeft: 16, color: '#ff4d4f' }}>
                                <CloseCircleOutlined /> 失败 {progress.errors}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {importResult && (
                <div style={{ padding: 20 }}>
                    <Alert
                        type={(importResult.failed ?? 0) === 0 ? 'success' : 'warning'}
                        message="导入完成"
                        description={
                            <div>
                                <div>成功导入 {importResult.success ?? 0} 行</div>
                                {(importResult.failed ?? 0) > 0 && <div>失败 {importResult.failed} 行</div>}
                            </div>
                        }
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                    {importResult.errorLogs && importResult.errorLogs.length > 0 && (
                        <>
                            <div style={{ marginBottom: 8, fontWeight: 600, color: '#ff4d4f' }}>错误日志：</div>
                            <div style={{
                                maxHeight: 300,
                                overflow: 'auto',
                                background: '#fff1f0',
                                border: '1px solid #ffccc7',
                                borderRadius: 4,
                                padding: 12,
                                fontSize: 12,
                                fontFamily: 'monospace'
                            }}>
                                {importResult.errorLogs.map((log: string, idx: number) => (
                                    <div key={idx} style={{ marginBottom: 4 }}>{log}</div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
};

export default ImportPreviewModal;
