import React from "react";
import { Button, Card, Space, Tag, Typography } from "antd";

import {
  formatJVMDiagnosticRiskLabel,
  groupJVMDiagnosticPresets,
  resolveJVMDiagnosticRiskColor,
  type JVMDiagnosticCommandPreset,
} from "../../utils/jvmDiagnosticPresentation";

const { Text } = Typography;

type JVMCommandPresetBarProps = {
  onSelectPreset: (preset: JVMDiagnosticCommandPreset) => void;
};

const JVMCommandPresetBar: React.FC<JVMCommandPresetBarProps> = ({
  onSelectPreset,
}) => (
  <div style={{ display: "grid", gap: 12 }}>
    {groupJVMDiagnosticPresets().map((group) => (
      <Card
        key={group.category}
        size="small"
        title={group.label}
        style={{ borderRadius: 14 }}
        styles={{
          header: { minHeight: 38, paddingInline: 12 },
          body: { display: "grid", gap: 8, padding: 12 },
        }}
      >
        {group.items.map((preset) => (
          <div
            key={preset.key}
            style={{
              display: "grid",
              gap: 6,
              padding: 10,
              borderRadius: 12,
              background: "rgba(127,127,127,0.06)",
            }}
          >
            <Space size={8} wrap>
              <Button
                size="small"
                type="text"
                onClick={() => onSelectPreset(preset)}
                style={{ paddingInline: 8, fontWeight: 700 }}
              >
                {preset.label}
              </Button>
              <Tag color={resolveJVMDiagnosticRiskColor(preset.riskLevel)}>
                {formatJVMDiagnosticRiskLabel(preset.riskLevel)}
              </Tag>
            </Space>
            <Text type="secondary">{preset.description}</Text>
            <Text code style={{ width: "fit-content" }}>
              {preset.command}
            </Text>
          </div>
        ))}
      </Card>
    ))}
  </div>
);

export default JVMCommandPresetBar;
