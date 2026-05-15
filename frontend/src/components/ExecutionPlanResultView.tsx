import React, { useMemo, useState } from 'react';
import { Button, Modal, Tabs, Tag, Typography } from 'antd';
import { analyzeExecutionPlanResult, type ExecutionPlanStep } from '../utils/executionPlanPresentation';
import { useStore } from '../store';
import { translate, type I18nKey } from '../i18n';

const { Text } = Typography;

const ORIGINAL_RESULT_MIN_HEIGHT = 380;

type ExecutionPlanResultViewProps = {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  sql: string;
  darkMode: boolean;
  children: React.ReactNode;
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('zh-CN').format(value);
};

const metricStyle = (darkMode: boolean): React.CSSProperties => ({
  border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : '#e5e7eb'}`,
  borderRadius: 10,
  padding: '8px 10px',
  background: darkMode ? 'rgba(255,255,255,0.04)' : '#ffffff',
  minWidth: 110,
});

const fieldStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
};

const getAccessTagColor = (accessType?: string) => {
  const value = String(accessType || '').toUpperCase();
  if (['ALL', 'SCAN', 'SEQ SCAN'].includes(value)) return 'red';
  if (['REF', 'EQ_REF', 'CONST', 'SYSTEM', 'SEARCH'].includes(value)) return 'green';
  if (['RANGE', 'INDEX', 'INDEX SCAN'].includes(value)) return 'blue';
  return 'default';
};

const StepField: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div style={fieldStyle}>
    <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
    <Text style={{ fontSize: 13 }} ellipsis={{ tooltip: typeof value === 'string' ? value : false }}>{value || '-'}</Text>
  </div>
);

const ExecutionPlanStepCard: React.FC<{ step: ExecutionPlanStep; darkMode: boolean; t: (key: I18nKey) => string }> = ({ step, darkMode, t }) => (
  <div
    style={{
      border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : '#e5e7eb'}`,
      borderRadius: 10,
      background: darkMode ? 'rgba(255,255,255,0.035)' : '#ffffff',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <Tag color="blue" style={{ marginInlineEnd: 0 }}>#{step.stepNo}</Tag>
      <Text strong ellipsis={{ tooltip: step.tableName }}>{step.tableName}</Text>
      {step.accessType && <Tag color={getAccessTagColor(step.accessType)}>{step.accessType}</Tag>}
      {step.warnings.map((warning) => (
        <Tag key={warning.kind} color={warning.severity === 'danger' ? 'red' : 'orange'}>{warning.label}</Tag>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
      <StepField label={t('queryEditor.executionPlan.selectType')} value={step.selectType} />
      <StepField label={t('queryEditor.executionPlan.usedIndex')} value={step.indexName} />
      <StepField label={t('queryEditor.executionPlan.possibleIndexes')} value={step.possibleKeys} />
      <StepField label={t('queryEditor.executionPlan.estimatedRows')} value={formatNumber(step.estimatedRows)} />
      <StepField label={t('queryEditor.executionPlan.filtered')} value={typeof step.filtered === 'number' ? `${step.filtered}%` : '-'} />
    </div>
    {(step.extra || step.detail) && (
      <div style={{ fontSize: 12, lineHeight: 1.6, color: darkMode ? 'rgba(255,255,255,0.72)' : '#4b5563', wordBreak: 'break-word' }}>
        {step.extra || step.detail}
      </div>
    )}
  </div>
);

const ExecutionPlanStepList: React.FC<{ steps: ExecutionPlanStep[]; darkMode: boolean; t: (key: I18nKey) => string }> = ({ steps, darkMode, t }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {steps.length > 0 ? steps.map((step) => (
      <div
        key={`${step.stepNo}-${step.tableName}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '56px minmax(120px, 1.2fr) minmax(90px, 0.8fr) minmax(120px, 1fr) minmax(90px, 0.7fr) minmax(120px, 1fr)',
          gap: 8,
          alignItems: 'center',
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : '#e5e7eb'}`,
          background: darkMode ? 'rgba(255,255,255,0.025)' : '#ffffff',
          fontSize: 12,
        }}
      >
        <Tag color="blue" style={{ marginInlineEnd: 0, width: 'fit-content' }}>#{step.stepNo}</Tag>
        <Text ellipsis={{ tooltip: step.tableName }}>{step.tableName}</Text>
        <Tag color={getAccessTagColor(step.accessType)} style={{ width: 'fit-content', marginInlineEnd: 0 }}>{step.accessType || '-'}</Tag>
        <Text ellipsis={{ tooltip: step.indexName || '-' }}>{step.indexName || '-'}</Text>
        <Text>{formatNumber(step.estimatedRows)}</Text>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
          {step.warnings.length > 0 ? step.warnings.map((warning) => (
            <Tag key={warning.kind} color={warning.severity === 'danger' ? 'red' : 'orange'} style={{ marginInlineEnd: 0 }}>{warning.label}</Tag>
          )) : <Text type="secondary">{t('queryEditor.executionPlan.noWarnings')}</Text>}
        </div>
      </div>
    )) : (
      <Text type="secondary">{t('queryEditor.executionPlan.noSteps')}</Text>
    )}
  </div>
);

const ExecutionPlanTextBlock: React.FC<{ lines: string[]; darkMode: boolean }> = ({ lines, darkMode }) => (
  <pre
    style={{
      margin: 0,
      padding: 12,
      height: '100%',
      overflow: 'auto',
      borderRadius: 10,
      border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : '#e5e7eb'}`,
      background: darkMode ? 'rgba(0,0,0,0.18)' : '#f9fafb',
      color: darkMode ? 'rgba(255,255,255,0.82)' : '#1f2937',
      fontSize: 12,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
    }}
  >
    {lines.join('\n')}
  </pre>
);

const ExecutionPlanResultView: React.FC<ExecutionPlanResultViewProps> = ({ rows, columns, sql, darkMode, children }) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const language = useStore((state) => state.language);
  const t = useMemo(() => (key: I18nKey) => translate(language, key), [language]);
  const plan = useMemo(() => analyzeExecutionPlanResult({ rows, columns, sql }), [rows, columns, sql]);
  const hasWarnings = plan.summary.warningCount > 0;

  const compactPlanContent = plan.isStructured ? (
    <ExecutionPlanStepList steps={plan.steps} darkMode={darkMode} t={t} />
  ) : (
    <ExecutionPlanTextBlock lines={plan.textLines} darkMode={darkMode} />
  );

  const detailPlanContent = plan.isStructured ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {plan.steps.map((step) => <ExecutionPlanStepCard key={`${step.stepNo}-${step.tableName}`} step={step} darkMode={darkMode} t={t} />)}
    </div>
  ) : (
    <ExecutionPlanTextBlock lines={plan.textLines} darkMode={darkMode} />
  );

  const resultTabs = [
    {
      key: 'steps',
      label: t('queryEditor.executionPlan.stepList'),
      children: (
        <div style={{ height: '100%', minHeight: 0, overflow: 'auto', padding: '0 2px 2px 0' }}>
          {compactPlanContent}
        </div>
      ),
    },
    {
      key: 'raw',
      label: t('queryEditor.executionPlan.basicResult'),
      children: (
        <div style={{ flex: 1, minHeight: ORIGINAL_RESULT_MIN_HEIGHT, overflow: 'hidden' }}>
          {children}
        </div>
      ),
    },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
        <div style={metricStyle(darkMode)}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('queryEditor.executionPlan.planRows')}</Text>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{formatNumber(plan.summary.totalRows)}</div>
        </div>
        <div style={metricStyle(darkMode)}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('queryEditor.executionPlan.fullScan')}</Text>
          <div style={{ fontSize: 18, fontWeight: 600, color: plan.summary.fullScanCount > 0 ? '#ff4d4f' : '#52c41a' }}>{formatNumber(plan.summary.fullScanCount)}</div>
        </div>
        <div style={metricStyle(darkMode)}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('queryEditor.executionPlan.indexUsage')}</Text>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{formatNumber(plan.summary.indexUsageCount)}</div>
        </div>
        <div style={metricStyle(darkMode)}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('queryEditor.executionPlan.estimatedScanRows')}</Text>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{formatNumber(plan.summary.estimatedRows)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('queryEditor.executionPlan.accessTypes')}</Text>
          {plan.summary.accessTypes.length > 0 ? plan.summary.accessTypes.map((item) => (
            <Tag key={item.label} color={getAccessTagColor(item.label)}>{item.label} × {item.count}</Tag>
          )) : <Tag>{t('queryEditor.executionPlan.none')}</Tag>}
        </div>
        <Button size="small" type="primary" onClick={() => setDetailOpen(true)}>
          {t('queryEditor.executionPlan.openDetail')}
        </Button>
      </div>

      {hasWarnings && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: darkMode ? '#fbbf24' : '#b45309' }}>
          <span>{t('queryEditor.executionPlan.warningCount')}{formatNumber(plan.summary.warningCount)}</span>
          <span>{t('queryEditor.executionPlan.warningHint')}</span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          size="small"
          items={resultTabs}
          style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
          tabBarStyle={{ marginBottom: 8 }}
        />
      </div>

      <Modal
        title={t('queryEditor.executionPlan.detailTitle')}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width="min(1080px, 92vw)"
        styles={{ body: { maxHeight: '72vh', overflow: 'auto', paddingTop: 8 } }}
        destroyOnClose
      >
        {detailPlanContent}
      </Modal>
    </div>
  );
};

export default ExecutionPlanResultView;
