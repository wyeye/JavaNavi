import React, { useMemo } from 'react';
import { Alert, Tag, Typography } from 'antd';
import { analyzeExecutionPlanResult, type ExecutionPlanStep } from '../utils/executionPlanPresentation';

const { Text } = Typography;

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
  padding: '10px 12px',
  background: darkMode ? 'rgba(255,255,255,0.04)' : '#ffffff',
  minWidth: 120,
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

const ExecutionPlanStepCard: React.FC<{ step: ExecutionPlanStep; darkMode: boolean }> = ({ step, darkMode }) => (
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
      <StepField label="选择类型" value={step.selectType} />
      <StepField label="使用索引" value={step.indexName} />
      <StepField label="候选索引" value={step.possibleKeys} />
      <StepField label="预估行数" value={formatNumber(step.estimatedRows)} />
      <StepField label="过滤比例" value={typeof step.filtered === 'number' ? `${step.filtered}%` : '-'} />
    </div>
    {(step.extra || step.detail) && (
      <div style={{ fontSize: 12, lineHeight: 1.6, color: darkMode ? 'rgba(255,255,255,0.72)' : '#4b5563', wordBreak: 'break-word' }}>
        {step.extra || step.detail}
      </div>
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
  const plan = useMemo(() => analyzeExecutionPlanResult({ rows, columns, sql }), [rows, columns, sql]);
  const hasWarnings = plan.summary.warningCount > 0;

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <div style={metricStyle(darkMode)}>
          <Text type="secondary" style={{ fontSize: 12 }}>计划行数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatNumber(plan.summary.totalRows)}</div>
        </div>
        <div style={metricStyle(darkMode)}>
          <Text type="secondary" style={{ fontSize: 12 }}>全表扫描</Text>
          <div style={{ fontSize: 20, fontWeight: 600, color: plan.summary.fullScanCount > 0 ? '#ff4d4f' : '#52c41a' }}>{formatNumber(plan.summary.fullScanCount)}</div>
        </div>
        <div style={metricStyle(darkMode)}>
          <Text type="secondary" style={{ fontSize: 12 }}>索引命中</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatNumber(plan.summary.indexUsageCount)}</div>
        </div>
        <div style={metricStyle(darkMode)}>
          <Text type="secondary" style={{ fontSize: 12 }}>预估扫描行数</Text>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatNumber(plan.summary.estimatedRows)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>访问方式</Text>
        {plan.summary.accessTypes.length > 0 ? plan.summary.accessTypes.map((item) => (
          <Tag key={item.label} color={getAccessTagColor(item.label)}>{item.label} × {item.count}</Tag>
        )) : <Tag>无</Tag>}
      </div>

      {hasWarnings && (
        <Alert
          type="warning"
          showIcon
          message={`发现 ${plan.summary.warningCount} 个可关注点`}
          description="重点查看全表扫描、临时表、文件排序和未使用候选索引。"
        />
      )}

      <div style={{ flex: '0 1 42%', minHeight: 150, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {plan.isStructured ? (
          plan.steps.map((step) => <ExecutionPlanStepCard key={`${step.stepNo}-${step.tableName}`} step={step} darkMode={darkMode} />)
        ) : (
          <ExecutionPlanTextBlock lines={plan.textLines} darkMode={darkMode} />
        )}
      </div>

      <div style={{ flex: '1 1 0', minHeight: 210, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>原始结果</Text>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default ExecutionPlanResultView;
