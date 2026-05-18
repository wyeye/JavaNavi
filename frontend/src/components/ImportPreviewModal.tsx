import React, { useState, useEffect } from 'react';
import { Modal, Table, Alert, Progress, Button, Space } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { PreviewImportFile, ImportDataWithProgress } from '@compat/javanaviApp';
import { EventsOn, EventsOff } from '@compat/runtime';
import { useStore } from '../store';
import { buildRpcConnectionConfig } from '../utils/connectionRpcConfig';
import { translate, type I18nKey } from '../i18n';

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

type PreviewPayload = {
    columns?: unknown;
    totalRows?: unknown;
    previewRows?: unknown;
    success?: unknown;
    failed?: unknown;
    skippedDuplicates?: unknown;
    errorLogs?: unknown;
    duplicateLogs?: unknown;
    duplicateLogCodes?: unknown;
    duplicateStrategy?: unknown;
    duplicateStrategyCode?: unknown;
    duplicateColumns?: unknown;
    duplicateWarning?: unknown;
    duplicateWarningCode?: unknown;
};

interface ImportProgress {
    current: number;
    total: number;
    success: number;
    errors: number;
}

interface ImportResult {
    success?: number;
    failed?: number;
    skippedDuplicates?: number;
    errorLogs?: string[];
    duplicateLogs?: string[];
    duplicateLogCodes?: Array<Record<string, unknown>>;
    duplicateStrategy?: string;
    duplicateStrategyCode?: string;
    duplicateColumns?: string[];
    duplicateWarning?: string;
    duplicateWarningCode?: string;
}

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const toPreviewPayload = (value: unknown): PreviewPayload => (
    value && typeof value === 'object' && !Array.isArray(value) ? value as PreviewPayload : {}
);

const toImportResult = (value: unknown): ImportResult => {
    const payload = toPreviewPayload(value);
    return {
        success: typeof payload.success === 'number' ? payload.success : Number(payload.success || 0),
        failed: typeof payload.failed === 'number' ? payload.failed : Number(payload.failed || 0),
        skippedDuplicates: typeof payload.skippedDuplicates === 'number' ? payload.skippedDuplicates : Number(payload.skippedDuplicates || 0),
        errorLogs: Array.isArray(payload.errorLogs) ? payload.errorLogs.map(String) : [],
        duplicateLogs: Array.isArray(payload.duplicateLogs) ? payload.duplicateLogs.map(String) : [],
        duplicateLogCodes: Array.isArray(payload.duplicateLogCodes)
            ? payload.duplicateLogCodes.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
            : [],
        duplicateStrategy: typeof payload.duplicateStrategy === 'string' ? payload.duplicateStrategy : '',
        duplicateStrategyCode: typeof payload.duplicateStrategyCode === 'string' ? payload.duplicateStrategyCode : '',
        duplicateColumns: Array.isArray(payload.duplicateColumns) ? payload.duplicateColumns.map(String) : [],
        duplicateWarning: typeof payload.duplicateWarning === 'string' ? payload.duplicateWarning : '',
        duplicateWarningCode: typeof payload.duplicateWarningCode === 'string' ? payload.duplicateWarningCode : '',
    };
};

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
    const language = useStore(state => state.language);
    const t = (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params);
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
                setError(res.message || t('dataGrid.import.previewFailed'));
            }
        } catch (e: unknown) {
            setError(t('dataGrid.import.previewFailedWithMessage', { message: getErrorMessage(e) }));
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
                setError(t('dataGrid.import.connectionMissing'));
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
                const resultData = toImportResult(res.data);
                setImportResult(resultData);
                if ((resultData.failed ?? 0) === 0 && (resultData.skippedDuplicates ?? 0) === 0) {
                    onSuccess();
                }
            } else {
                setError(res.message || t('dataGrid.import.failed'));
            }
        } catch (e: unknown) {
            setError(t('dataGrid.import.failedWithMessage', { message: getErrorMessage(e) }));
        } finally {
            setImporting(false);
        }
    };

    const handleClose = () => {
        if (importResult && (importResult.failed ?? 0) === 0) {
            onSuccess();
            return;
        }
        onClose();
    };

    const formatDuplicateStrategy = (result: ImportResult): string => {
        if (result.duplicateStrategyCode === 'key') {
            return t('dataGrid.import.duplicateStrategyKey', { columns: (result.duplicateColumns || []).join(', ') });
        }
        if (result.duplicateStrategyCode === 'file-full-row') {
            return t('dataGrid.import.duplicateStrategyFileOnly');
        }
        return result.duplicateStrategy || '';
    };

    const formatDuplicateWarning = (result: ImportResult): string => {
        if (result.duplicateWarningCode === 'IMPORT_DUPLICATES_SKIPPED_BY_KEY') {
            return t('dataGrid.import.duplicateWarningByKey', { columns: (result.duplicateColumns || []).join(', ') });
        }
        if (result.duplicateWarningCode === 'IMPORT_DUPLICATES_FILE_ONLY') {
            return t('dataGrid.import.duplicateWarningFileOnly');
        }
        if (result.duplicateWarningCode === 'IMPORT_DUPLICATES_SKIPPED_ON_APPLY') {
            return t('dataGrid.import.duplicateNoticeApply');
        }
        return result.duplicateWarning || '';
    };

    const formatDuplicateLog = (log: Record<string, unknown>, fallback: string): string => {
        const reason = String(log.reason || '');
        const row = Number(log.row || 0);
        const key = String(log.key || '');
        const remaining = Number(log.remaining || 0);
        if (reason === 'file-key') {
            return t('dataGrid.import.duplicateLogFileKey', { row, key });
        }
        if (reason === 'database-key') {
            return t('dataGrid.import.duplicateLogDatabaseKey', { row, key });
        }
        if (reason === 'file-full-row') {
            return t('dataGrid.import.duplicateLogFileFullRow', { row });
        }
        if (reason === 'overflow') {
            return t('dataGrid.import.duplicateLogOverflow', { count: remaining });
        }
        return fallback;
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
            title={t('dataGrid.import.previewTitle')}
            open={visible}
            onCancel={handleClose}
            width={900}
            footer={
                importResult ? (
                    <Space>
                        <Button onClick={handleClose}>{t('common.close')}</Button>
                    </Space>
                ) : importing ? null : (
                    <Space>
                        <Button onClick={onClose}>{t('common.cancel')}</Button>
                        <Button
                            type="primary"
                            onClick={handleImport}
                            disabled={!previewData || loading}
                        >
                            {t('dataGrid.import.start')}
                        </Button>
                    </Space>
                )
            }
        >
            {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}

            {loading && <div style={{ textAlign: 'center', padding: 40 }}>{t('dataGrid.import.previewLoading')}</div>}

            {!loading && previewData && !importing && !importResult && (
                <>
                    <Alert
                        type="info"
                        message={t('dataGrid.import.previewSummary', { rows: previewData.totalRows, fields: previewData.columns.length })}
                        description={t('dataGrid.import.previewDuplicateNotice')}
                        style={{ marginBottom: 16 }}
                        showIcon
                    />
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('dataGrid.import.fieldList')}</div>
                    <div style={{ marginBottom: 16, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                        {previewData.columns.join(', ')}
                    </div>
                    <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('dataGrid.import.previewRowsTitle')}</div>
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
                        {t('dataGrid.import.importing')}
                    </div>
                    <Progress percent={progressPercent} status="active" />
                    <div style={{ marginTop: 16, textAlign: 'center', color: '#666' }}>
                        {t('dataGrid.import.progress', { current: progress.current, total: progress.total })}
                        <span style={{ marginLeft: 16, color: '#52c41a' }}>
                            <CheckCircleOutlined /> {t('dataGrid.import.successCount', { count: progress.success })}
                        </span>
                        {progress.errors > 0 && (
                            <span style={{ marginLeft: 16, color: '#ff4d4f' }}>
                                <CloseCircleOutlined /> {t('dataGrid.import.failedCount', { count: progress.errors })}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {importResult && (
                <div style={{ padding: 20 }}>
                    {(() => {
                        const duplicateWarning = formatDuplicateWarning(importResult);
                        const duplicateStrategy = formatDuplicateStrategy(importResult);
                        const duplicateLogs = (importResult.duplicateLogCodes || []).length > 0
                            ? (importResult.duplicateLogCodes || []).map((log, idx) => formatDuplicateLog(log, importResult.duplicateLogs?.[idx] || ''))
                            : (importResult.duplicateLogs || []);
                        return (
                            <>
                    <Alert
                        type={(importResult.failed ?? 0) > 0 || (importResult.skippedDuplicates ?? 0) > 0 ? 'warning' : 'success'}
                        message={t('dataGrid.import.resultTitle')}
                        description={
                            <div>
                                <div>{t('dataGrid.import.resultSuccess', { count: importResult.success ?? 0 })}</div>
                                {(importResult.skippedDuplicates ?? 0) > 0 && <div>{t('dataGrid.import.resultSkippedDuplicates', { count: importResult.skippedDuplicates ?? 0 })}</div>}
                                {(importResult.failed ?? 0) > 0 && <div>{t('dataGrid.import.resultFailed', { count: importResult.failed ?? 0 })}</div>}
                                {duplicateWarning && <div style={{ marginTop: 8 }}>{duplicateWarning}</div>}
                                {duplicateStrategy && <div style={{ marginTop: 4 }}>{t('dataGrid.import.duplicateStrategyLabel', { strategy: duplicateStrategy })}</div>}
                            </div>
                        }
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                    {duplicateLogs.length > 0 && (
                        <>
                            <div style={{ marginBottom: 8, fontWeight: 600, color: '#faad14' }}>{t('dataGrid.import.duplicateLogTitle')}</div>
                            <div style={{
                                maxHeight: 220,
                                overflow: 'auto',
                                background: '#fffbe6',
                                border: '1px solid #ffe58f',
                                borderRadius: 4,
                                padding: 12,
                                fontSize: 12,
                                fontFamily: 'monospace',
                                marginBottom: 16
                            }}>
                                {duplicateLogs.map((log: string, idx: number) => (
                                    <div key={idx} style={{ marginBottom: 4 }}>{log}</div>
                                ))}
                            </div>
                        </>
                    )}
                            </>
                        );
                    })()}
                    {importResult.errorLogs && importResult.errorLogs.length > 0 && (
                        <>
                            <div style={{ marginBottom: 8, fontWeight: 600, color: '#ff4d4f' }}>{t('dataGrid.import.errorLogTitle')}</div>
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
