import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Space, Spin, Tag, Typography } from "antd";
import { DashboardOutlined, PauseCircleOutlined, PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";

import { useStore } from "../store";
import type { JVMMonitoringSessionState, TabData } from "../types";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
import {
  buildMonitoringAvailabilityText,
  normalizeMonitoringProviderMode,
  type JVMMonitoringProviderMode,
} from "../utils/jvmMonitoringPresentation";
import { resolveJVMModeMeta } from "../utils/jvmRuntimePresentation";
import JVMMonitoringCharts from "./jvm/JVMMonitoringCharts";
import JVMMonitoringDetailPanel from "./jvm/JVMMonitoringDetailPanel";
import JVMMonitoringStatusCards from "./jvm/JVMMonitoringStatusCards";

const { Paragraph, Text, Title } = Typography;

const POLL_INTERVAL_MS = 2000;

type JVMMonitoringDashboardProps = {
  tab: TabData;
};

const isMonitoringSessionMissing = (message: string): boolean =>
  /monitoring session not found/i.test(String(message || ""));

const createEmptySession = (
  connectionId: string,
  providerMode: JVMMonitoringProviderMode,
): JVMMonitoringSessionState => ({
  connectionId,
  providerMode,
  running: false,
  points: [],
  recentGcEvents: [],
  availableMetrics: [],
  missingMetrics: [],
  providerWarnings: [],
});

const normalizeMonitoringSession = (
  payload: any,
  connectionId: string,
  providerMode: JVMMonitoringProviderMode,
): JVMMonitoringSessionState => ({
  connectionId: String(payload?.connectionId || connectionId),
  providerMode: normalizeMonitoringProviderMode(payload?.providerMode, providerMode),
  running: payload?.running === true,
  points: Array.isArray(payload?.points) ? payload.points : [],
  recentGcEvents: Array.isArray(payload?.recentGcEvents) ? payload.recentGcEvents : [],
  availableMetrics: Array.isArray(payload?.availableMetrics)
    ? payload.availableMetrics
    : [],
  missingMetrics: Array.isArray(payload?.missingMetrics) ? payload.missingMetrics : [],
  providerWarnings: Array.isArray(payload?.providerWarnings)
    ? payload.providerWarnings
    : [],
});

const resolveBackendApp = () =>
  typeof window === "undefined" ? undefined : (window as any).go?.app?.App;

const JVMMonitoringDashboard: React.FC<JVMMonitoringDashboardProps> = ({ tab }) => {
  const theme = useStore((state) => state.theme);
  const connection = useStore((state) =>
    state.connections.find((item) => item.id === tab.connectionId),
  );
  const darkMode = theme === "dark";
  const providerMode = normalizeMonitoringProviderMode(
    tab.providerMode,
    normalizeMonitoringProviderMode(connection?.config.jvm?.preferredMode, "jmx"),
  );
  const [session, setSession] = useState<JVMMonitoringSessionState>(() =>
    createEmptySession(tab.connectionId, providerMode),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [pollSeed, setPollSeed] = useState(0);

  const rpcConnectionConfig = useMemo(() => {
    if (!connection) {
      return null;
    }
    return buildRpcConnectionConfig(connection.config, {
      database: "",
      jvm: {
        ...(connection.config.jvm || {}),
        preferredMode: providerMode,
        allowedModes: [providerMode],
      },
    });
  }, [connection, providerMode]);

  const latestPoint = useMemo(() => {
    const points = session.points || [];
    return points.length > 0 ? points[points.length - 1] : undefined;
  }, [session.points]);

  useEffect(() => {
    setSession(createEmptySession(tab.connectionId, providerMode));
  }, [tab.connectionId, providerMode]);

  useEffect(() => {
    if (!connection || !rpcConnectionConfig) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const backendApp = resolveBackendApp();

    const poll = async () => {
      if (cancelled) {
        return;
      }
      setLoading(true);

      if (typeof backendApp?.JVMGetMonitoringHistory !== "function") {
        setError("JVMGetMonitoringHistory 后端方法不可用");
        setLoading(false);
        return;
      }

      try {
        const result = await backendApp.JVMGetMonitoringHistory(
          rpcConnectionConfig,
          providerMode,
        );

        if (cancelled) {
          return;
        }

        if (result?.success === false) {
          const message = String(result?.message || "读取监控历史失败");
          if (isMonitoringSessionMissing(message)) {
            setSession(createEmptySession(tab.connectionId, providerMode));
            setError("");
            setLoading(false);
            return;
          }
          throw new Error(message);
        }

        const nextSession = normalizeMonitoringSession(
          result?.data,
          tab.connectionId,
          providerMode,
        );
        setSession(nextSession);
        setError("");
        setLoading(false);

        if (nextSession.running) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (fetchError: any) {
        if (!cancelled) {
          setError(fetchError?.message || "读取监控历史失败");
          setLoading(false);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [connection, providerMode, rpcConnectionConfig, tab.connectionId, pollSeed]);

  if (!connection) {
    return <Empty description="连接不存在或已被删除" style={{ marginTop: 80 }} />;
  }

  const backendApp = resolveBackendApp();
  const availabilityText = buildMonitoringAvailabilityText(session);
  const modeMeta = resolveJVMModeMeta(providerMode);
  const emptyState = !session.running && (session.points || []).length === 0;

  const handleStart = async () => {
    if (!rpcConnectionConfig || typeof backendApp?.JVMStartMonitoring !== "function") {
      setError("JVMStartMonitoring 后端方法不可用");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMStartMonitoring(rpcConnectionConfig);
      if (result?.success === false) {
        throw new Error(String(result?.message || "开始监控失败"));
      }
      setSession(
        normalizeMonitoringSession(result?.data, tab.connectionId, providerMode),
      );
      setPollSeed((current) => current + 1);
    } catch (startError: any) {
      setError(startError?.message || "开始监控失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!rpcConnectionConfig || typeof backendApp?.JVMStopMonitoring !== "function") {
      setError("JVMStopMonitoring 后端方法不可用");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMStopMonitoring(
        rpcConnectionConfig,
        providerMode,
      );
      if (result?.success === false) {
        throw new Error(String(result?.message || "停止监控失败"));
      }
      setSession((current) => ({ ...current, running: false }));
      setPollSeed((current) => current + 1);
    } catch (stopError: any) {
      setError(stopError?.message || "停止监控失败");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      className="jvm-monitoring-dashboard-scroll-shell"
      data-jvm-monitoring-dashboard-scroll-shell="true"
      style={{
        height: "100%",
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        padding: 20,
        display: "grid",
        gap: 16,
        alignContent: "start",
        background: darkMode ? "#141414" : "#f5f7fb",
      }}
    >
      <Card variant="borderless" style={{ borderRadius: 12 }}>
        <Space
          direction="vertical"
          size={12}
          style={{ width: "100%", alignItems: "stretch" }}
        >
          <Space size={12} wrap style={{ justifyContent: "space-between" }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                <DashboardOutlined style={{ color: "#1677ff", marginRight: 8 }} />
                JVM 持续监控
              </Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                <Text strong>{connection.name}</Text>
                <Text type="secondary">
                  {" "}
                  · {connection.config.host}:{connection.config.port}
                </Text>
              </Paragraph>
            </div>
            <Space wrap>
              <Tag color={modeMeta.color} style={{ marginInlineEnd: 0 }}>
                {modeMeta.label}
              </Tag>
              {session.running ? (
                <Tag color="green">采样中</Tag>
              ) : (
                <Tag>未运行</Tag>
              )}
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setPollSeed((current) => current + 1)}
              >
                刷新
              </Button>
              {session.running ? (
                <Button
                  danger
                  type="primary"
                  icon={<PauseCircleOutlined />}
                  loading={actionLoading}
                  onClick={() => void handleStop()}
                >
                  停止监控
                </Button>
              ) : (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={actionLoading}
                  onClick={() => void handleStart()}
                >
                  开始监控
                </Button>
              )}
            </Space>
          </Space>

          {(session.missingMetrics?.length || session.providerWarnings?.length) ? (
            <Alert
              type="warning"
              showIcon
              message="监控能力存在降级"
              description={availabilityText}
            />
          ) : null}
          {error ? <Alert type="error" showIcon message={error} /> : null}
        </Space>
      </Card>

      {loading && emptyState ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
          <Spin />
        </div>
      ) : null}

      {emptyState ? (
        <div
          data-jvm-monitoring-content-stack="true"
          style={{
            display: "grid",
            gap: 24,
            alignItems: "start",
          }}
        >
          <Card variant="borderless" style={{ borderRadius: 12 }}>
            <Empty
              description="当前尚未开始持续监控"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Paragraph type="secondary" style={{ maxWidth: 520, margin: "0 auto 16px" }}>
                点击“开始监控”后，JavaNavi 会在当前会话内持续保留该连接的采样结果；切换页签不会停止采样。
              </Paragraph>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={actionLoading}
                onClick={() => void handleStart()}
              >
                开始监控
              </Button>
            </Empty>
          </Card>
          <JVMMonitoringCharts
            points={session.points || []}
            session={session}
            darkMode={darkMode}
          />
        </div>
      ) : (
        <div
          data-jvm-monitoring-content-stack="true"
          style={{
            display: "grid",
            gap: 24,
            alignItems: "start",
          }}
        >
          <JVMMonitoringStatusCards
            latestPoint={latestPoint}
            session={session}
            darkMode={darkMode}
          />
          <JVMMonitoringCharts
            points={session.points || []}
            session={session}
            darkMode={darkMode}
          />
          <JVMMonitoringDetailPanel
            session={session}
            latestPoint={latestPoint}
            darkMode={darkMode}
          />
        </div>
      )}
    </div>
  );
};

export default JVMMonitoringDashboard;
