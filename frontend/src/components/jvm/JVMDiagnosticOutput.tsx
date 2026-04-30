import React from "react";
import { Empty, List, Tag, Typography } from "antd";

import type { JVMDiagnosticEventChunk } from "../../types";
import {
  formatJVMDiagnosticChunksForDisplay,
  formatJVMDiagnosticEventLabel,
  formatJVMDiagnosticPhaseLabel,
} from "../../utils/jvmDiagnosticPresentation";

const { Text } = Typography;

type JVMDiagnosticOutputProps = {
  chunks: JVMDiagnosticEventChunk[];
  maxHeight?: number;
};

const JVMDiagnosticOutput: React.FC<JVMDiagnosticOutputProps> = ({
  chunks,
  maxHeight = 420,
}) => {
  if (!chunks.length) {
    return (
      <Empty
        description="暂无实时输出。命令执行后，这里会按时间顺序追加后端返回内容。"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  const chunkTexts = formatJVMDiagnosticChunksForDisplay(chunks);

  return (
    <div style={{ maxHeight, overflow: "auto", paddingRight: 4 }}>
      <List
        size="small"
        dataSource={chunks}
        renderItem={(chunk, index) => (
          <List.Item
            key={`${chunk.sessionId}-${chunk.commandId || "chunk"}-${index}`}
          >
            <div style={{ display: "grid", gap: 4, width: "100%" }}>
              <Text
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {chunkTexts[index]}
              </Text>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {chunk.phase ? (
                  <Tag color="geekblue">{formatJVMDiagnosticPhaseLabel(chunk.phase)}</Tag>
                ) : null}
                {chunk.event ? <Tag>{formatJVMDiagnosticEventLabel(chunk.event)}</Tag> : null}
                {chunk.commandId ? <Tag color="blue">{chunk.commandId}</Tag> : null}
              </div>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
};

export default JVMDiagnosticOutput;
