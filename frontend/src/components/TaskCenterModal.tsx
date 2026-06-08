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

const exactStageAliasKeys: I18nKey[] = [
  'taskCenter.stage.preparing',
  'taskCenter.stage.executingSqlFile',
  'taskCenter.stage.preparingSqlFileExecution',
  'taskCenter.stage.sqlFileExecuted',
  'taskCenter.stage.sqlFileExecutionFailed',
  'taskCenter.stage.taskFailed',
  'taskCenter.stage.cancelRequested',
  'taskCenter.stage.taskCancelled',
  'taskCenter.stage.exportCompleted',
  'taskCenter.stage.preparingQueryExport',
  'taskCenter.stage.runningQuery',
  'taskCenter.stage.writingFile',
  'taskCenter.stage.preparingTableExport',
  'taskCenter.stage.preparingDataExport',
  'taskCenter.stage.preparingSqlExport',
  'taskCenter.stage.preparingTableBackup',
  'taskCenter.stage.preparingTableStructureCopy',
  'taskCenter.stage.exportingTableSchemaAndData',
  'taskCenter.stage.exportingTableSchema',
  'taskCenter.stage.tableExported',
  'taskCenter.stage.tableCopied',
];

const exactErrorAliasKeys: I18nKey[] = [
  'taskCenter.error.appInterrupted',
  'taskCenter.error.sqlPathOrContentRequired',
  'taskCenter.error.sqlFileMissing',
  'taskCenter.error.sqlFileOnly',
  'taskCenter.error.sqlFileReadFailed',
  'taskCenter.error.sqlFileExecutionFailed',
  'taskCenter.error.taskCancelled',
];

const localizedAliasMap = (keys: I18nKey[]): Record<string, I18nKey> => {
  const aliases: Record<string, I18nKey> = {};
  keys.forEach((key) => {
    aliases[translate('en', key)] = key;
    aliases[translate('zh', key)] = key;
  });
  return aliases;
};

const exactStageKeys: Record<string, I18nKey> = localizedAliasMap(exactStageAliasKeys);
const exactErrorKeys: Record<string, I18nKey> = localizedAliasMap(exactErrorAliasKeys);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const localizedProgressMatch = (value: string, key: I18nKey): RegExpMatchArray | null => {
  for (const language of ['en', 'zh'] as const) {
    const template = translate(language, key);
    const pattern = escapeRegExp(template)
      .replace('\\{current\\}', String.raw`(\d+)`)
      .replace('\\{total\\}', String.raw`(\d+)`);
    const match = value.match(new RegExp(`^${pattern}$`, language === 'en' ? 'i' : undefined));
    if (match) return match;
  }
  return null;
};

const matchesLocalizedAlias = (value: string, key: I18nKey): boolean => (
  value === translate('en', key) || value === translate('zh', key)
);

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

  const executing = localizedProgressMatch(normalized, 'taskCenter.stage.executingSqlStatement');
  if (executing) {
    return t('taskCenter.stage.executingSqlStatement', { current: executing[1], total: executing[2] });
  }

  const executed = localizedProgressMatch(normalized, 'taskCenter.stage.executedSqlStatement');
  if (executed) {
    return t('taskCenter.stage.executedSqlStatement', { current: executed[1], total: executed[2] });
  }

  const key = exactStageKeys[normalized];
  return key ? t(key) : normalized;
};

const resolveJobStage = (job: AppJob, t: TaskTranslator): string => {
  const normalized = String(job.stage || '').trim();
  if (job.status === 'failed' && matchesLocalizedAlias(normalized, 'taskCenter.stage.sqlFileExecuted')) {
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
