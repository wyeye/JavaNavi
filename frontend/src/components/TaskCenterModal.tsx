import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Modal, Progress, Space, Spin, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, FolderOpenOutlined, StopOutlined } from '@ant-design/icons';
import { BrowserOpenURL, EventsOn } from '@compat/runtime';
import { CancelJob, GetJobs, normalizeJob } from '@compat/javanaviApp';
import { useStore } from '../store';
import type { AppJob, AppJobStatus } from '../types';
import { translate, type I18nKey, type I18nParams } from '../i18n';

const { Text } = Typography;

type TaskCenterModalProps = {
  open: boolean;
  onClose: () => void;
  onRunningCountChange?: (count: number) => void;
};

const statusColor: Record<AppJobStatus, string> = {
  running: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};

const statusIcon: Record<AppJobStatus, React.ReactNode> = {
  running: <ClockCircleOutlined />,
  completed: <CheckCircleOutlined />,
  failed: <CloseCircleOutlined />,
  cancelled: <StopOutlined />,
};

const mergeJobs = (jobs: AppJob[], incoming: AppJob): AppJob[] => {
  const map = new Map(jobs.map((job) => [job.jobId, job]));
  map.set(incoming.jobId, incoming);
  return Array.from(map.values()).sort((a, b) => String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt)));
};

const fileUrl = (path: string): string => {
  const trimmed = String(path || '').trim();
  if (/^(https?:|file:)/i.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
};


type TaskTranslator = (key: I18nKey, params?: I18nParams) => string;

const taskJobTypeKeys: Record<string, I18nKey> = {
  'run-sql-file': 'taskCenter.jobType.runSqlFile',
  'export-data': 'taskCenter.jobType.exportData',
  'export-query': 'taskCenter.jobType.exportQuery',
  'export-table': 'taskCenter.jobType.exportTable',
  'export-tables-backup': 'taskCenter.jobType.exportTablesBackup',
  'export-tables-schema': 'taskCenter.jobType.exportTablesSchema',
  'export-tables-data': 'taskCenter.jobType.exportTablesData',
  'export-database-backup': 'taskCenter.jobType.exportDatabaseBackup',
  'export-database-schema': 'taskCenter.jobType.exportDatabaseSchema',
  'copy-tables': 'taskCenter.jobType.copyTables',
};

const exactStageKeys: Record<string, I18nKey> = {
  Preparing: 'taskCenter.stage.preparing',
  '准备中': 'taskCenter.stage.preparing',
  'Executing SQL file': 'taskCenter.stage.executingSqlFile',
  '正在执行 SQL 文件': 'taskCenter.stage.executingSqlFile',
  'Preparing SQL file execution': 'taskCenter.stage.preparingSqlFileExecution',
  '正在准备 SQL 文件执行': 'taskCenter.stage.preparingSqlFileExecution',
  'SQL file executed': 'taskCenter.stage.sqlFileExecuted',
  'SQL 文件执行完成': 'taskCenter.stage.sqlFileExecuted',
  'SQL file execution failed': 'taskCenter.stage.sqlFileExecutionFailed',
  'SQL 文件执行失败': 'taskCenter.stage.sqlFileExecutionFailed',
  'Task failed.': 'taskCenter.stage.taskFailed',
  '任务失败。': 'taskCenter.stage.taskFailed',
  'Cancel requested': 'taskCenter.stage.cancelRequested',
  '已请求取消': 'taskCenter.stage.cancelRequested',
  'Task cancelled.': 'taskCenter.stage.taskCancelled',
  '任务已取消。': 'taskCenter.stage.taskCancelled',
  'Export completed': 'taskCenter.stage.exportCompleted',
  '导出完成': 'taskCenter.stage.exportCompleted',
  'Preparing query export': 'taskCenter.stage.preparingQueryExport',
  '正在准备查询导出': 'taskCenter.stage.preparingQueryExport',
  'Running query': 'taskCenter.stage.runningQuery',
  '正在执行查询': 'taskCenter.stage.runningQuery',
  'Writing file': 'taskCenter.stage.writingFile',
  '正在写入文件': 'taskCenter.stage.writingFile',
  'Preparing table export': 'taskCenter.stage.preparingTableExport',
  '正在准备表导出': 'taskCenter.stage.preparingTableExport',
  'Preparing data export': 'taskCenter.stage.preparingDataExport',
  '正在准备数据导出': 'taskCenter.stage.preparingDataExport',
  'Preparing SQL export': 'taskCenter.stage.preparingSqlExport',
  '正在准备 SQL 导出': 'taskCenter.stage.preparingSqlExport',
  'Preparing table backup': 'taskCenter.stage.preparingTableBackup',
  '正在准备表备份': 'taskCenter.stage.preparingTableBackup',
  'Preparing table structure copy': 'taskCenter.stage.preparingTableStructureCopy',
  '正在准备复制表结构': 'taskCenter.stage.preparingTableStructureCopy',
  'Exporting table schema and data': 'taskCenter.stage.exportingTableSchemaAndData',
  '正在导出表结构和数据': 'taskCenter.stage.exportingTableSchemaAndData',
  'Exporting table schema': 'taskCenter.stage.exportingTableSchema',
  '正在导出表结构': 'taskCenter.stage.exportingTableSchema',
  'Table exported': 'taskCenter.stage.tableExported',
  '表已导出': 'taskCenter.stage.tableExported',
  'Table copied': 'taskCenter.stage.tableCopied',
  '表已复制': 'taskCenter.stage.tableCopied',
};

const exactErrorKeys: Record<string, I18nKey> = {
  'Application exited before the task finished.': 'taskCenter.error.appInterrupted',
  '应用退出，任务未完成。': 'taskCenter.error.appInterrupted',
  'SQL file path or SQL content is required.': 'taskCenter.error.sqlPathOrContentRequired',
  'SQL 文件路径或 SQL 内容不能为空。': 'taskCenter.error.sqlPathOrContentRequired',
  'Selected SQL file does not exist.': 'taskCenter.error.sqlFileMissing',
  '所选 SQL 文件不存在。': 'taskCenter.error.sqlFileMissing',
  'Only SQL files can be executed through this action.': 'taskCenter.error.sqlFileOnly',
  '此操作仅支持执行 SQL 文件。': 'taskCenter.error.sqlFileOnly',
  'Unable to read selected SQL file.': 'taskCenter.error.sqlFileReadFailed',
  '无法读取所选 SQL 文件。': 'taskCenter.error.sqlFileReadFailed',
  'SQL file execution failed.': 'taskCenter.error.sqlFileExecutionFailed',
  'SQL 文件执行失败。': 'taskCenter.error.sqlFileExecutionFailed',
  'Task cancelled.': 'taskCenter.error.taskCancelled',
  '任务已取消。': 'taskCenter.error.taskCancelled',
};

const afterPrefix = (value: string, prefix: RegExp): string => value.replace(prefix, '').trim();

const firstCount = (value: string): string => value.match(/\b(\d+)\b/)?.[1] || '';

const resolveTaskTitle = (job: AppJob, t: TaskTranslator): string => {
  const title = String(job.title || '').trim();
  const type = String(job.type || '').trim();
  const genericKey = taskJobTypeKeys[type];

  if (type === 'run-sql-file') {
    const name = afterPrefix(title, /^Run SQL file\s*/i);
    return name && name !== title ? t('taskCenter.jobType.runSqlFileWithName', { name }) : t('taskCenter.jobType.runSqlFile');
  }
  if (type === 'export-data') {
    const name = afterPrefix(title, /^Export\s*/i);
    return name && !/^data$/i.test(name) && name !== title ? t('taskCenter.jobType.exportDataWithName', { name }) : t('taskCenter.jobType.exportData');
  }
  if (type === 'export-query') {
    const name = afterPrefix(title, /^Export query\s*/i);
    return name && name !== title ? t('taskCenter.jobType.exportQueryWithName', { name }) : t('taskCenter.jobType.exportQuery');
  }
  if (type === 'export-table') {
    const name = afterPrefix(title, /^Export table\s*/i);
    return name && name !== title ? t('taskCenter.jobType.exportTableWithName', { name }) : t('taskCenter.jobType.exportTable');
  }
  if (type === 'export-tables-backup') {
    const count = firstCount(title);
    return count ? t('taskCenter.jobType.exportTablesBackupWithCount', { count }) : t('taskCenter.jobType.exportTablesBackup');
  }
  if (type === 'export-tables-schema') {
    const count = firstCount(title);
    return count ? t('taskCenter.jobType.exportTablesSchemaWithCount', { count }) : t('taskCenter.jobType.exportTablesSchema');
  }
  if (type === 'export-tables-data') {
    const count = firstCount(title);
    return count ? t('taskCenter.jobType.exportTablesDataWithCount', { count }) : t('taskCenter.jobType.exportTablesData');
  }
  if (type === 'export-database-backup') {
    const name = afterPrefix(title, /^Backup database\s*/i);
    return name && name !== title ? t('taskCenter.jobType.exportDatabaseBackupWithName', { name }) : t('taskCenter.jobType.exportDatabaseBackup');
  }
  if (type === 'export-database-schema') {
    const name = afterPrefix(title, /^Export database schema\s*/i);
    return name && name !== title ? t('taskCenter.jobType.exportDatabaseSchemaWithName', { name }) : t('taskCenter.jobType.exportDatabaseSchema');
  }
  if (type === 'copy-tables') {
    const count = firstCount(title);
    return count ? t('taskCenter.jobType.copyTablesWithCount', { count }) : t('taskCenter.jobType.copyTables');
  }
  return genericKey ? t(genericKey) : (title || type || t('common.unknown'));
};

const resolveTaskStage = (stage: string, t: TaskTranslator): string => {
  const normalized = String(stage || '').trim();
  if (!normalized) return '-';

  const executing = normalized.match(/^Executing SQL statement\s+(\d+)\s*\/\s*(\d+)$/i)
    || normalized.match(/^正在执行 SQL 语句\s+(\d+)\s*\/\s*(\d+)$/);
  if (executing) {
    return t('taskCenter.stage.executingSqlStatement', { current: executing[1], total: executing[2] });
  }

  const executed = normalized.match(/^Executed SQL statement\s+(\d+)\s*\/\s*(\d+)$/i)
    || normalized.match(/^已执行 SQL 语句\s+(\d+)\s*\/\s*(\d+)$/);
  if (executed) {
    return t('taskCenter.stage.executedSqlStatement', { current: executed[1], total: executed[2] });
  }

  const key = exactStageKeys[normalized];
  return key ? t(key) : normalized;
};

const resolveJobStage = (job: AppJob, t: TaskTranslator): string => {
  const normalized = String(job.stage || '').trim();
  if (job.status === 'failed' && (normalized === 'SQL file executed' || normalized === 'SQL 文件执行完成')) {
    return t('taskCenter.stage.sqlFileExecutionFailed');
  }
  if (job.status === 'failed' && !normalized) {
    return t('taskCenter.stage.taskFailed');
  }
  if (job.status === 'cancelled' && !normalized) {
    return t('taskCenter.stage.taskCancelled');
  }
  return resolveTaskStage(normalized, t);
};

const parseJobTime = (value: string): number => {
  const time = Date.parse(String(value || '').trim());
  return Number.isFinite(time) ? time : 0;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatJobDateTime = (value: string): string => {
  const time = parseJobTime(value);
  if (!time) return '-';
  const date = new Date(time);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
};

const jobElapsedMs = (job: AppJob, nowMs: number): number | null => {
  const startedAt = parseJobTime(job.createdAt);
  if (!startedAt) return null;
  const finishedAt = job.status === 'running' ? nowMs : parseJobTime(job.finishedAt);
  if (!finishedAt) return null;
  return Math.max(0, finishedAt - startedAt);
};

const formatJobDuration = (durationMs: number | null): string => {
  if (durationMs === null) return '-';
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
};

const jobDurationSummary = (job: AppJob, nowMs: number, t: TaskTranslator): string => (
  `${t('taskCenter.duration')}: ${formatJobDuration(jobElapsedMs(job, nowMs))}`
);

const jobStartEndSummary = (job: AppJob, t: TaskTranslator): string => {
  const finishedAt = job.status === 'running' ? '-' : formatJobDateTime(job.finishedAt);
  return `${t('taskCenter.startedAt')}: ${formatJobDateTime(job.createdAt)} · ${t('taskCenter.finishedAt')}: ${finishedAt}`;
};

const resolveTaskError = (errorMessage: string, t: TaskTranslator): string => {
  const normalized = String(errorMessage || '').trim();
  if (!normalized) return '';
  const key = exactErrorKeys[normalized];
  return key ? t(key) : normalized;
};

export default function TaskCenterModal({ open, onClose, onRunningCountChange }: TaskCenterModalProps) {
  const language = useStore(state => state.language);
  const theme = useStore(state => state.theme);
  const t = useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
  const darkMode = theme === 'dark';
  const [jobs, setJobs] = useState<AppJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [loading, setLoading] = useState(false);
  const [cancellingJobId, setCancellingJobId] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const selectedJob = jobs.find((job) => job.jobId === selectedJobId) || jobs[0];
  const runningCount = jobs.filter((job) => job.status === 'running').length;

  useEffect(() => {
    onRunningCountChange?.(runningCount);
  }, [onRunningCountChange, runningCount]);

  useEffect(() => {
    if (!open || runningCount <= 0) return undefined;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, runningCount]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    GetJobs(100)
      .then((items) => {
        if (cancelled) return;
        setJobs(items);
        setSelectedJobId((current) => current || items[0]?.jobId || '');
      })
      .catch(() => {
        if (!cancelled) void message.error(t('taskCenter.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  useEffect(() => {
    if (!open) return undefined;
    return EventsOn<[AppJob]>('job:progress', (payload) => {
      const job = normalizeJob(payload);
      setJobs((current) => mergeJobs(current, job));
      setSelectedJobId((current) => current || job.jobId);
    });
  }, [open]);

  const handleCancel = async (job: AppJob) => {
    setCancellingJobId(job.jobId);
    try {
      const updated = await CancelJob(job.jobId);
      setJobs((current) => mergeJobs(current, updated));
      void message.success(t('taskCenter.cancelRequested'));
    } catch {
      void message.error(t('taskCenter.cancelFailed'));
    } finally {
      setCancellingJobId('');
    }
  };

  const shellBg = darkMode ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255,255,255,0.98)';
  const panelBg = darkMode ? 'rgba(30, 41, 59, 0.72)' : 'rgba(248,250,252,0.94)';
  const border = darkMode ? '1px solid rgba(148,163,184,0.20)' : '1px solid rgba(15,23,42,0.08)';
  const muted = darkMode ? 'rgba(226,232,240,0.66)' : 'rgba(71,85,105,0.82)';
  const titleColor = darkMode ? '#f8fafc' : '#0f172a';

  const metric = (label: string, value: React.ReactNode, expanded = false, align: 'left' | 'right' = 'left') => (
    <div style={{ minWidth: 0, textAlign: align }}>
      <div style={{ fontSize: 12, color: muted }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 16, fontWeight: 700, color: titleColor, overflow: expanded ? 'visible' : 'hidden', textOverflow: expanded ? 'clip' : 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap', wordBreak: expanded ? 'break-word' : 'normal', lineHeight: 1.35 }}>{value}</div>
    </div>
  );

  return (
    <Modal
      title={t('taskCenter.title')}
      open={open}
      onCancel={onClose}
      width={880}
      footer={<Button onClick={onClose}>{t('taskCenter.hide')}</Button>}
      styles={{
        content: { background: shellBg, border, borderRadius: 18, boxShadow: darkMode ? '0 24px 60px rgba(0,0,0,0.45)' : '0 24px 60px rgba(15,23,42,0.16)' },
        header: { background: 'transparent' },
        body: { paddingTop: 12 },
        footer: { background: 'transparent' },
      }}
    >
      {loading ? (
        <div style={{ height: 320, display: 'grid', placeItems: 'center' }}><Spin /></div>
      ) : jobs.length === 0 ? (
        <div style={{ height: 320, display: 'grid', placeItems: 'center' }}><Empty description={t('taskCenter.empty')} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 16, minHeight: 420 }}>
          <div style={{ border, background: panelBg, borderRadius: 14, padding: 10, overflow: 'auto' }}>
            <div style={{ color: muted, fontSize: 12, fontWeight: 700, margin: '4px 6px 10px' }}>{t('taskCenter.list')}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {jobs.map((job) => {
                const active = job.jobId === selectedJob?.jobId;
                return (
                  <button
                    key={job.jobId}
                    type="button"
                    onClick={() => setSelectedJobId(job.jobId)}
                    style={{
                      cursor: 'pointer',
                      textAlign: 'left',
                      border: active ? '1px solid #22c55e' : border,
                      background: active ? (darkMode ? 'rgba(34,197,94,0.16)' : 'rgba(34,197,94,0.10)') : (darkMode ? 'rgba(15,23,42,0.38)' : '#fff'),
                      borderRadius: 12,
                      padding: 10,
                      transition: 'border-color 180ms ease, background 180ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <Text strong ellipsis style={{ color: titleColor, maxWidth: 190 }}>{resolveTaskTitle(job, t)}</Text>
                      <Tag icon={statusIcon[job.status]} color={statusColor[job.status]} style={{ marginInlineEnd: 0 }}>{t(`taskCenter.status.${job.status}` as I18nKey)}</Tag>
                    </div>
                    <Progress percent={job.percent || 0} size="small" status={job.status === 'failed' ? 'exception' : undefined} showInfo={false} style={{ marginTop: 8 }} />
                    <div style={{ marginTop: 6, color: muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.current}/{job.total} · {job.currentTable || resolveJobStage(job, t)}
                    </div>
                    <div style={{ marginTop: 3, color: muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t('taskCenter.duration')}: {formatJobDuration(jobElapsedMs(job, nowMs))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ border, background: darkMode ? 'rgba(15,23,42,0.38)' : '#fff', borderRadius: 14, padding: 16, minWidth: 0 }}>
            {selectedJob ? (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: titleColor }}>{resolveTaskTitle(selectedJob, t)}</div>
                    <div style={{ marginTop: 4, color: muted, fontSize: 12, lineHeight: 1.5, wordBreak: 'break-word' }}>{selectedJob.jobId} · {jobDurationSummary(selectedJob, nowMs, t)}</div>
                    <div style={{ marginTop: 2, color: muted, fontSize: 12, lineHeight: 1.5, wordBreak: 'break-word' }}>{jobStartEndSummary(selectedJob, t)}</div>
                  </div>
                  <Tag icon={statusIcon[selectedJob.status]} color={statusColor[selectedJob.status]}>{t(`taskCenter.status.${selectedJob.status}` as I18nKey)}</Tag>
                </div>
                <Progress percent={selectedJob.percent || 0} status={selectedJob.status === 'failed' ? 'exception' : selectedJob.status === 'completed' ? 'success' : undefined} />
                <div style={{ display: 'grid', gridTemplateColumns: '80px 80px 1fr auto', gap: 14, alignItems: 'start', padding: '2px 0 4px' }}>
                  {metric(t('taskCenter.total'), selectedJob.total)}
                  {metric(t('taskCenter.current'), selectedJob.current)}
                  {metric(t('taskCenter.currentTable'), selectedJob.currentTable || selectedJob.table || '-', true)}
                  {metric(t('taskCenter.progress'), `${selectedJob.percent}%`, false, 'right')}
                </div>
                <div style={{ padding: 14, borderRadius: 12, border, background: panelBg }}>
                  <div style={{ color: muted, fontSize: 12 }}>{t('taskCenter.stage')}</div>
                  <div style={{ marginTop: 6, color: titleColor }}>{resolveJobStage(selectedJob, t)}</div>
                </div>
                {selectedJob.filePath ? (
                  <div style={{ padding: 14, borderRadius: 12, border, background: panelBg }}>
                    <div style={{ color: muted, fontSize: 12 }}>{t('taskCenter.filePath')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <Text ellipsis style={{ flex: 1, color: titleColor }}>{selectedJob.filePath}</Text>
                      <Button size="small" icon={<FolderOpenOutlined />} onClick={() => BrowserOpenURL(fileUrl(selectedJob.filePath))}>{t('taskCenter.openPath')}</Button>
                    </div>
                  </div>
                ) : null}
                {selectedJob.errorMessage ? (
                  <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(239,68,68,0.35)', background: darkMode ? 'rgba(127,29,29,0.18)' : 'rgba(254,242,242,0.95)', color: darkMode ? '#fecaca' : '#991b1b' }}>
                    {resolveTaskError(selectedJob.errorMessage, t)}
                  </div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    danger
                    disabled={selectedJob.status !== 'running'}
                    loading={cancellingJobId === selectedJob.jobId}
                    onClick={() => void handleCancel(selectedJob)}
                  >
                    {t('taskCenter.cancel')}
                  </Button>
                </div>
              </Space>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
