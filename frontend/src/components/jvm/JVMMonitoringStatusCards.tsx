import React from "react";
import { Card, Col, Row, Space, Statistic, Tag, Typography } from "antd";

import type { JVMMonitoringPoint, JVMMonitoringSessionState } from "../../types";
import {
  formatBytes,
  formatCompactNumber,
  formatDurationMs,
  resolveThreadStateLabel,
} from "../../utils/jvmMonitoringPresentation";

const { Text } = Typography;

type JVMMonitoringStatusCardsProps = {
  latestPoint?: JVMMonitoringPoint;
  session?: JVMMonitoringSessionState;
  darkMode: boolean;
};

const cardStyle = (darkMode: boolean): React.CSSProperties => ({
  borderRadius: 12,
  background: darkMode ? "#1f1f1f" : "#ffffff",
  boxShadow: "0 1px 2px rgba(5, 5, 5, 0.06)",
});

const JVMMonitoringStatusCards: React.FC<JVMMonitoringStatusCardsProps> = ({
  latestPoint,
  session,
  darkMode,
}) => {
  const runnableCount = latestPoint?.threadStateCounts?.RUNNABLE || 0;
  const heapMeta =
    latestPoint?.heapCommittedBytes && latestPoint.heapCommittedBytes > 0
      ? `已提交 ${formatBytes(latestPoint.heapCommittedBytes)}`
      : "等待采样";
  const gcMeta =
    typeof latestPoint?.gcDeltaTimeMs === "number" && latestPoint.gcDeltaTimeMs >= 0
      ? `Δ ${formatDurationMs(latestPoint.gcDeltaTimeMs)}`
      : typeof latestPoint?.gcCollectionTimeMs === "number"
        ? `累计 ${formatDurationMs(latestPoint.gcCollectionTimeMs)}`
        : "等待采样";
  const threadMeta =
    latestPoint?.peakThreadCount && latestPoint.peakThreadCount > 0
      ? `峰值 ${formatCompactNumber(latestPoint.peakThreadCount)}`
      : "等待采样";
  const classMeta =
    typeof latestPoint?.classLoadDelta === "number"
      ? `Δ ${formatCompactNumber(latestPoint.classLoadDelta)}`
      : "等待采样";
  const runnableLabel = resolveThreadStateLabel("RUNNABLE");

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={6}>
        <Card variant="borderless" style={cardStyle(darkMode)} title="堆内存">
          <Statistic value={formatBytes(latestPoint?.heapUsedBytes)} />
          <Text type="secondary">{heapMeta}</Text>
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card variant="borderless" style={cardStyle(darkMode)} title="垃圾回收压力">
          <Statistic
            value={formatCompactNumber(
              latestPoint?.gcDeltaCount ?? latestPoint?.gcCollectionCount,
            )}
          />
          <Text type="secondary">{gcMeta}</Text>
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card variant="borderless" style={cardStyle(darkMode)} title="线程">
          <Statistic value={formatCompactNumber(latestPoint?.threadCount)} />
          <Space size={8} wrap>
            <Text type="secondary">{threadMeta}</Text>
            {runnableCount > 0 ? <Tag color="blue">{runnableLabel} {runnableCount}</Tag> : null}
          </Space>
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <Card variant="borderless" style={cardStyle(darkMode)} title="类加载">
          <Statistic value={formatCompactNumber(latestPoint?.loadedClassCount)} />
          <Space size={8} wrap>
            <Text type="secondary">{classMeta}</Text>
            {session?.running ? <Tag color="green">采样中</Tag> : <Tag>未运行</Tag>}
          </Space>
        </Card>
      </Col>
    </Row>
  );
};

export default JVMMonitoringStatusCards;
