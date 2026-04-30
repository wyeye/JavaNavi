import React from "react";
import { Alert, Card, Descriptions, Empty, List, Space, Tag, Typography } from "antd";

import type { JVMMonitoringPoint, JVMMonitoringSessionState } from "../../types";
import {
  buildMonitoringAvailabilityText,
  extractThreadStateRows,
  formatBytes,
  formatCompactNumber,
  formatPercent,
  formatRecentGCLabel,
} from "../../utils/jvmMonitoringPresentation";

const { Paragraph, Text } = Typography;

type JVMMonitoringDetailPanelProps = {
  session: JVMMonitoringSessionState;
  latestPoint?: JVMMonitoringPoint;
  darkMode: boolean;
};

const buildCardStyle = (darkMode: boolean): React.CSSProperties => ({
  borderRadius: 12,
  background: darkMode ? "#1f1f1f" : "#ffffff",
  boxShadow: "0 1px 2px rgba(5, 5, 5, 0.06)",
});

const buildProcessMemoryMissingHint = (
  session: JVMMonitoringSessionState,
): string | null => {
  if (!(session.missingMetrics || []).includes("memory.rss")) {
    return null;
  }

  if (session.providerMode === "jmx") {
    return "JMX 连接未暴露进程驻留物理内存属性，当前只能读取进程虚拟内存指标；如需进程物理内存，请切换到 HTTP 端点或增强代理采集。";
  }

  return "当前监控来源未返回进程驻留物理内存指标；请确认 HTTP 端点或增强代理已采集并上报进程物理内存。";
};

const JVMMonitoringDetailPanel: React.FC<JVMMonitoringDetailPanelProps> = ({
  session,
  latestPoint,
  darkMode,
}) => {
  const threadRows = extractThreadStateRows(latestPoint);
  const recentGcEvents = session.recentGcEvents || [];
  const missingMetrics = session.missingMetrics || [];
  const processMemoryMissingHint = buildProcessMemoryMissingHint(session);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card variant="borderless" title="排障指标" style={buildCardStyle(darkMode)}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="进程 CPU">
            {formatPercent(latestPoint?.processCpuLoad)}
          </Descriptions.Item>
          <Descriptions.Item label="系统 CPU">
            {formatPercent(latestPoint?.systemCpuLoad)}
          </Descriptions.Item>
          <Descriptions.Item label="进程物理内存">
            {formatBytes(latestPoint?.processRssBytes)}
          </Descriptions.Item>
          <Descriptions.Item label="进程虚拟内存">
            {formatBytes(latestPoint?.committedVirtualMemoryBytes)}
          </Descriptions.Item>
        </Descriptions>
        {processMemoryMissingHint ? (
          <Alert
            type="info"
            showIcon
            message="进程物理内存缺失原因"
            description={processMemoryMissingHint}
            style={{ marginTop: 12 }}
          />
        ) : null}
      </Card>

      <Card variant="borderless" title="线程状态分布" style={buildCardStyle(darkMode)}>
        {threadRows.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无线程状态采样" />
        ) : (
          <Space wrap size={[8, 8]}>
            {threadRows.map((item) => (
              <Tag key={item.state} color="blue">
                {item.label} {formatCompactNumber(item.count)}
              </Tag>
            ))}
          </Space>
        )}
      </Card>

      <Card variant="borderless" title="最近垃圾回收明细" style={buildCardStyle(darkMode)}>
        {recentGcEvents.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              missingMetrics.includes("gc.events")
                ? "当前监控来源未提供事件级垃圾回收数据"
                : "最近窗口暂无垃圾回收事件"
            }
          />
        ) : (
          <List
            dataSource={recentGcEvents}
            renderItem={(event) => (
              <List.Item>
                <List.Item.Meta
                  title={formatRecentGCLabel(event)}
                  description={
                    <Space size={12} wrap>
                      {typeof event.beforeUsedBytes === "number" ? (
                        <Text type="secondary">
                          回收前 {formatBytes(event.beforeUsedBytes)}
                        </Text>
                      ) : null}
                      {typeof event.afterUsedBytes === "number" ? (
                        <Text type="secondary">
                          回收后 {formatBytes(event.afterUsedBytes)}
                        </Text>
                      ) : null}
                      {event.action ? <Tag>{event.action}</Tag> : null}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Card variant="borderless" title="能力与降级" style={buildCardStyle(darkMode)}>
        <Paragraph type="secondary" style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>
          {buildMonitoringAvailabilityText(session)}
        </Paragraph>
        <Space size={[8, 8]} wrap>
          {(session.missingMetrics || []).map((metric) => (
            <Tag key={metric} color="warning">
              {metric}
            </Tag>
          ))}
          {(session.providerWarnings || []).map((warning, index) => (
            <Tag key={`${warning}-${index}`} color="default">
              {warning}
            </Tag>
          ))}
        </Space>
      </Card>
    </Space>
  );
};

export default JVMMonitoringDetailPanel;
