import React from "react";
import { Empty, List, Tag, Typography } from "antd";

import type {
  JVMDiagnosticAuditRecord,
  JVMDiagnosticSessionHandle,
} from "../../types";
import {
  formatJVMDiagnosticCommandTypeLabel,
  formatJVMDiagnosticRiskLabel,
  formatJVMDiagnosticSourceLabel,
  formatJVMDiagnosticPhaseLabel,
  formatJVMDiagnosticTransportLabel,
} from "../../utils/jvmDiagnosticPresentation";

const { Text } = Typography;

type JVMDiagnosticHistoryProps = {
  session?: JVMDiagnosticSessionHandle | null;
  records?: JVMDiagnosticAuditRecord[];
  showSession?: boolean;
  maxHeight?: number;
};

const JVMDiagnosticHistory: React.FC<JVMDiagnosticHistoryProps> = ({
  session,
  records = [],
  showSession = true,
  maxHeight = 360,
}) => (
  <div style={{ display: "grid", gap: 12 }}>
    {showSession ? (
      <div style={{ display: "grid", gap: 4 }}>
        <Text strong>当前会话</Text>
        {session ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tag color="blue">{session.sessionId}</Tag>
            <Tag>{formatJVMDiagnosticTransportLabel(session.transport)}</Tag>
          </div>
        ) : (
          <Empty
            description="尚未建立诊断会话"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </div>
    ) : null}

    <div style={{ display: "grid", gap: 8 }}>
      <Text strong>最近记录</Text>
      {records.length ? (
        <div style={{ maxHeight, overflow: "auto", paddingRight: 4 }}>
          <List
            size="small"
            dataSource={records}
            renderItem={(record) => (
              <List.Item
                key={`${record.sessionId || "record"}-${record.commandId || record.command}-${record.timestamp}`}
              >
                <div style={{ display: "grid", gap: 4, width: "100%" }}>
                  <Text
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    {record.command}
                  </Text>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {record.status ? (
                      <Tag color="green">{formatJVMDiagnosticPhaseLabel(record.status)}</Tag>
                    ) : null}
                    {record.riskLevel ? (
                      <Tag color="gold">{formatJVMDiagnosticRiskLabel(record.riskLevel)}</Tag>
                    ) : null}
                    {record.commandType ? (
                      <Tag color="blue">{formatJVMDiagnosticCommandTypeLabel(record.commandType)}</Tag>
                    ) : null}
                    {record.source ? <Tag>{formatJVMDiagnosticSourceLabel(record.source)}</Tag> : null}
                  </div>
                  <Text type="secondary">
                    {record.reason || "未填写诊断原因"}
                  </Text>
                </div>
              </List.Item>
            )}
          />
        </div>
      ) : (
        <Empty description="尚无诊断历史" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </div>
  </div>
);

export default JVMDiagnosticHistory;
