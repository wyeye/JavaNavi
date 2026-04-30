import React, { useMemo } from "react";
import { Alert, Descriptions, Modal, Space, Tag, Typography } from "antd";

import type { JVMChangePreview } from "../../types";
import {
  formatJVMRiskLevelText,
  formatJVMValueForDisplay,
} from "../../utils/jvmResourcePresentation";

const { Text } = Typography;
const DESCRIPTION_STYLES = { label: { width: 120 } } as const;

type JVMChangePreviewModalProps = {
  open: boolean;
  preview: JVMChangePreview | null;
  applying?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const riskColorMap: Record<string, string> = {
  low: "green",
  medium: "orange",
  high: "red",
};

const previewBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: "rgba(0, 0, 0, 0.04)",
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 280,
};

const JVMChangePreviewModal: React.FC<JVMChangePreviewModalProps> = ({
  open,
  preview,
  applying = false,
  onCancel,
  onConfirm,
}) => {
  const summary = useMemo(() => {
    if (!preview) {
      return "暂无预览结果";
    }
    return preview.summary || "预览已生成";
  }, [preview]);

  return (
    <Modal
      title="JVM 变更预览"
      open={open}
      onCancel={onCancel}
      onOk={onConfirm}
      okText="确认执行"
      cancelText="关闭"
      okButtonProps={{ disabled: !preview?.allowed, loading: applying }}
      width={880}
      destroyOnClose
    >
      {!preview ? (
        <Alert type="info" showIcon message="暂无预览结果" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions column={1} size="small" styles={DESCRIPTION_STYLES}>
            <Descriptions.Item label="变更摘要">
              <Space size={8} wrap>
                <Text>{summary}</Text>
                <Tag color={riskColorMap[preview.riskLevel] || "default"}>
                  风险 {formatJVMRiskLevelText(preview.riskLevel)}
                </Tag>
                {preview.requiresConfirmation ? (
                  <Tag color="gold">需要确认</Tag>
                ) : null}
                {preview.allowed ? (
                  <Tag color="green">允许执行</Tag>
                ) : (
                  <Tag color="red">禁止执行</Tag>
                )}
              </Space>
            </Descriptions.Item>
            {preview.blockingReason ? (
              <Descriptions.Item label="阻断原因">
                <Text type="danger" style={{ whiteSpace: "pre-wrap" }}>
                  {preview.blockingReason}
                </Text>
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {!preview.allowed && preview.blockingReason ? (
            <Alert
              type="error"
              showIcon
              message="当前变更不可执行"
              description={
                <span style={{ whiteSpace: "pre-wrap" }}>
                  {preview.blockingReason}
                </span>
              }
            />
          ) : (
            <Alert type="info" showIcon message={summary} />
          )}

          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              变更前
            </Text>
            <Descriptions
              column={1}
              size="small"
              styles={DESCRIPTION_STYLES}
              style={{ marginBottom: 12 }}
            >
              <Descriptions.Item label="资源 ID">
                {preview.before?.resourceId || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="版本">
                {preview.before?.version || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="格式">
                {preview.before?.format || "-"}
              </Descriptions.Item>
            </Descriptions>
            <pre style={previewBlockStyle}>
              {formatJVMValueForDisplay(preview.before)}
            </pre>
          </div>

          <div>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              变更后
            </Text>
            <Descriptions
              column={1}
              size="small"
              styles={DESCRIPTION_STYLES}
              style={{ marginBottom: 12 }}
            >
              <Descriptions.Item label="资源 ID">
                {preview.after?.resourceId || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="版本">
                {preview.after?.version || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="格式">
                {preview.after?.format || "-"}
              </Descriptions.Item>
            </Descriptions>
            <pre style={previewBlockStyle}>
              {formatJVMValueForDisplay(preview.after)}
            </pre>
          </div>
        </Space>
      )}
    </Modal>
  );
};

export default JVMChangePreviewModal;
