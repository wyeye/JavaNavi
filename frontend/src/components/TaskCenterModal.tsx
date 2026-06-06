import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Modal, Progress, Space, Spin, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, FolderOpenOutlined, StopOutlined } from '@ant-design/icons';
import { BrowserOpenURL, EventsOn } from '@compat/runtime';
import { CancelJob, GetJobs, normalizeJob } from '@compat/javanaviApp';
import { useStore } from '../store';
import type { AppJob, AppJobStatus } from '../types';
import { translate, type I18nKey } from '../i18n';

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

export default function TaskCenterModal({ open, onClose, onRunningCountChange }: TaskCenterModalProps) {
  const language = useStore(state => state.language);
  const theme = useStore(state => state.theme);
  const t = useMemo(() => (key: I18nKey) => translate(language, key), [language]);
  const darkMode = theme === 'dark';
  const [jobs, setJobs] = useState<AppJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [loading, setLoading] = useState(false);
  const [cancellingJobId, setCancellingJobId] = useState('');

  const selectedJob = jobs.find((job) => job.jobId === selectedJobId) || jobs[0];
  const runningCount = jobs.filter((job) => job.status === 'running').length;

  useEffect(() => {
    onRunningCountChange?.(runningCount);
  }, [onRunningCountChange, runningCount]);

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

  const stat = (label: string, value: React.ReactNode) => (
    <div style={{ padding: '12px 14px', borderRadius: 12, border, background: panelBg, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: muted }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: titleColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
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
                      <Text strong ellipsis style={{ color: titleColor, maxWidth: 190 }}>{job.title || job.type}</Text>
                      <Tag icon={statusIcon[job.status]} color={statusColor[job.status]} style={{ marginInlineEnd: 0 }}>{t(`taskCenter.status.${job.status}` as I18nKey)}</Tag>
                    </div>
                    <Progress percent={job.percent || 0} size="small" status={job.status === 'failed' ? 'exception' : undefined} showInfo={false} style={{ marginTop: 8 }} />
                    <div style={{ marginTop: 6, color: muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.current}/{job.total} · {job.currentTable || job.stage || '-'}
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
                    <div style={{ fontSize: 18, fontWeight: 800, color: titleColor }}>{selectedJob.title || selectedJob.type}</div>
                    <div style={{ marginTop: 4, color: muted, fontSize: 12 }}>{selectedJob.jobId}</div>
                  </div>
                  <Tag icon={statusIcon[selectedJob.status]} color={statusColor[selectedJob.status]}>{t(`taskCenter.status.${selectedJob.status}` as I18nKey)}</Tag>
                </div>
                <Progress percent={selectedJob.percent || 0} status={selectedJob.status === 'failed' ? 'exception' : selectedJob.status === 'completed' ? 'success' : undefined} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                  {stat(t('taskCenter.total'), selectedJob.total)}
                  {stat(t('taskCenter.current'), selectedJob.current)}
                  {stat('%', `${selectedJob.percent}%`)}
                  {stat(t('taskCenter.currentTable'), selectedJob.currentTable || selectedJob.table || '-')}
                </div>
                <div style={{ padding: 14, borderRadius: 12, border, background: panelBg }}>
                  <div style={{ color: muted, fontSize: 12 }}>{t('taskCenter.stage')}</div>
                  <div style={{ marginTop: 6, color: titleColor }}>{selectedJob.stage || '-'}</div>
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
                    {selectedJob.errorMessage}
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
