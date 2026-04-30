import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Card,
  Descriptions,
  Empty,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";

import { useStore } from "../store";
import { JVMProbeCapabilities } from "@compat/javanaviApp";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
import { resolveJVMModeMeta } from "../utils/jvmRuntimePresentation";
import type { JVMCapability, TabData } from "../types";
import JVMModeBadge from "./jvm/JVMModeBadge";
import {
  getJVMWorkspaceCardStyle,
  JVMWorkspaceHero,
  JVMWorkspaceShell,
} from "./jvm/JVMWorkspaceLayout";

const { Text } = Typography;
const DESCRIPTION_STYLES = { label: { width: 120 } } as const;

type JVMOverviewProps = {
  tab: TabData;
};

const JVMOverview: React.FC<JVMOverviewProps> = ({ tab }) => {
  const connection = useStore((state) =>
    state.connections.find((item) => item.id === tab.connectionId),
  );
  const theme = useStore((state) => state.theme);
  const darkMode = theme === "dark";
  const providerMode =
    tab.providerMode || connection?.config.jvm?.preferredMode || "jmx";
  const readOnly = connection?.config.jvm?.readOnly !== false;
  const allowedModes = connection?.config.jvm?.allowedModes || [];
  const [capabilities, setCapabilities] = useState<JVMCapability[]>([]);
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [capabilityError, setCapabilityError] = useState("");

  const endpointSummary = useMemo(() => {
    if (!connection?.config.jvm?.endpoint) {
      return "";
    }
    const endpoint = connection.config.jvm.endpoint;
    if (!endpoint.enabled && !endpoint.baseUrl) {
      return "";
    }
    return endpoint.baseUrl || "已启用";
  }, [connection]);

  const agentSummary = useMemo(() => {
    if (!connection?.config.jvm?.agent) {
      return "";
    }
    const agent = connection.config.jvm.agent;
    if (!agent.enabled && !agent.baseUrl) {
      return "";
    }
    return agent.baseUrl || "已启用";
  }, [connection]);

  const allowedModeSummary = useMemo(() => {
    const items = allowedModes.length > 0 ? allowedModes : ["jmx"];
    return items.map((item) => resolveJVMModeMeta(item).label).join("、");
  }, [allowedModes]);

  useEffect(() => {
    if (!connection) {
      setCapabilities([]);
      setCapabilityError("连接不存在或已被删除");
      setCapabilityLoading(false);
      return;
    }

    let cancelled = false;
    const loadCapabilities = async () => {
      setCapabilityLoading(true);
      setCapabilityError("");
      try {
        const result = await JVMProbeCapabilities(
          buildRpcConnectionConfig(connection.config, { database: "" }) as any,
        );
        if (cancelled) {
          return;
        }
        if (result?.success === false) {
          setCapabilities([]);
          setCapabilityError(
            String(result?.message || "读取 JVM 模式能力失败"),
          );
          return;
        }
        setCapabilities(
          Array.isArray(result?.data) ? (result.data as JVMCapability[]) : [],
        );
      } catch (error: any) {
        if (!cancelled) {
          setCapabilities([]);
          setCapabilityError(error?.message || "读取 JVM 模式能力失败");
        }
      } finally {
        if (!cancelled) {
          setCapabilityLoading(false);
        }
      }
    };

    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  if (!connection) {
    return (
      <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />
    );
  }

  const jmxHost = connection.config.jvm?.jmx?.host || connection.config.host;
  const jmxPort = connection.config.jvm?.jmx?.port || connection.config.port;

  const cardStyle = getJVMWorkspaceCardStyle(darkMode);

  return (
    <JVMWorkspaceShell darkMode={darkMode}>
      <JVMWorkspaceHero
        darkMode={darkMode}
        eyebrow="JVM Runtime"
        title="JVM 运行时概览"
        description={
          <>
            <Text strong>{connection.name}</Text>
            <Text type="secondary">
              {" "}
              · {connection.config.host}:{connection.config.port}
            </Text>
          </>
        }
        badges={
          <>
            <JVMModeBadge mode={providerMode} />
            <Tag color={readOnly ? "blue" : "red"}>
              {readOnly ? "只读连接" : "可写连接"}
            </Tag>
            <Tag>{connection.config.jvm?.environment || "dev"}</Tag>
          </>
        }
      />

      <Card title="连接摘要" variant="borderless" style={cardStyle}>
        <Descriptions column={1} size="small" styles={DESCRIPTION_STYLES}>
          <Descriptions.Item label="当前模式">
            {resolveJVMModeMeta(providerMode).label}
          </Descriptions.Item>
          <Descriptions.Item label="允许模式">
            {allowedModeSummary}
          </Descriptions.Item>
          <Descriptions.Item label="JMX 地址">{`${jmxHost}:${jmxPort}`}</Descriptions.Item>
          <Descriptions.Item label="Endpoint">
            {endpointSummary || "未配置"}
          </Descriptions.Item>
          <Descriptions.Item label="Agent">
            {agentSummary || "未配置"}
          </Descriptions.Item>
          <Descriptions.Item label="资源浏览">
            {"通过侧边栏展开模式节点后懒加载"}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="模式能力" variant="borderless" style={cardStyle}>
        {capabilityLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : capabilityError ? (
          <Alert
            type="error"
            showIcon
            message="读取 JVM 模式能力失败"
            description={
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {capabilityError}
              </span>
            }
          />
        ) : capabilities.length === 0 ? (
          <Empty description="暂无模式能力数据" />
        ) : (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {capabilities.map((capability) => (
              <div
                key={capability.mode}
                style={{
                  border: "1px solid rgba(5, 5, 5, 0.08)",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Space size={8} wrap>
                  <JVMModeBadge mode={capability.mode} />
                  <Tag color={capability.canBrowse ? "green" : "default"}>
                    {capability.canBrowse ? "可浏览" : "不可浏览"}
                  </Tag>
                  <Tag color={capability.canWrite ? "red" : "blue"}>
                    {capability.canWrite ? "可写" : "只读"}
                  </Tag>
                  <Tag color={capability.canPreview ? "gold" : "default"}>
                    {capability.canPreview ? "支持预览" : "不支持预览"}
                  </Tag>
                </Space>
                {capability.reason ? (
                  <Text
                    type="secondary"
                    style={{
                      display: "block",
                      marginTop: 8,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {capability.reason}
                  </Text>
                ) : null}
              </div>
            ))}
          </Space>
        )}
      </Card>
    </JVMWorkspaceShell>
  );
};

export default JVMOverview;
