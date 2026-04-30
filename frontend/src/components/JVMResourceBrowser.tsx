import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  FileSearchOutlined,
  ReloadOutlined,
  RobotOutlined,
} from "@ant-design/icons";

import { useStore } from "../store";
import type {
  JVMActionDefinition,
  JVMApplyResult,
  JVMChangePreview,
  JVMChangeRequest,
  JVMAIPlanContext,
  JVMValueSnapshot,
  SavedConnection,
  TabData,
} from "../types";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
import {
  buildJVMChangeDraftFromAIPlan,
  buildJVMAIPlanPrompt,
  matchesJVMAIPlanTargetTab,
  type JVMAIChangeDraft,
  type JVMAIChangePlan,
} from "../utils/jvmAiPlan";
import {
  buildJVMActionPayloadTemplate,
  buildJVMPreviewApplyRequest,
  estimateJVMResourceEditorHeight,
  formatJVMActionDisplayText,
  formatJVMActionSummary,
  formatJVMMetadataForDisplay,
  formatJVMValueForDisplay,
  JVM_DEFAULT_PAYLOAD_TEMPLATE,
  resolveJVMActionDisplay,
  resolveJVMValueEditorLanguage,
} from "../utils/jvmResourcePresentation";
import { buildJVMTabTitle } from "../utils/jvmRuntimePresentation";
import JVMModeBadge from "./jvm/JVMModeBadge";
import JVMChangePreviewModal from "./jvm/JVMChangePreviewModal";
import {
  getJVMWorkspaceCardStyle,
  JVMWorkspaceHero,
  JVMWorkspaceShell,
} from "./jvm/JVMWorkspaceLayout";

const { Text } = Typography;
const DESCRIPTION_STYLES = { label: { width: 120 } } as const;
const { TextArea } = Input;
const DEFAULT_PAYLOAD_TEXT = JVM_DEFAULT_PAYLOAD_TEMPLATE;

type JVMResourceBrowserProps = {
  tab: TabData;
};

const buildJVMRuntimeConfig = (
  connection: SavedConnection,
  providerMode: string,
) => {
  const sourceJVM = connection.config.jvm || {};
  return buildRpcConnectionConfig(connection.config, {
    jvm: {
      ...sourceJVM,
      preferredMode: providerMode,
      allowedModes: [providerMode],
    },
  });
};

const buildJVMPreviewConfigRevision = (value: unknown): string => {
  let text = "";
  try {
    text = JSON.stringify(value ?? null);
  } catch {
    return "unserializable";
  }

  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const buildJVMPreviewRuntimeFingerprint = (
  connection: SavedConnection | undefined,
  providerMode: string,
): string => {
  const config = connection?.config;
  const jvm = config?.jvm || {};
  return JSON.stringify({
    configRevision: buildJVMPreviewConfigRevision(config),
    type: config?.type || "",
    host: config?.host || "",
    port: config?.port || 0,
    user: config?.user || "",
    providerMode,
    environment: jvm.environment || "",
    readOnly: jvm.readOnly !== false,
    allowedModes: jvm.allowedModes || [],
    preferredMode: jvm.preferredMode || "",
    jmx: {
      enabled: jvm.jmx?.enabled || false,
      host: jvm.jmx?.host || "",
      port: jvm.jmx?.port || 0,
      username: jvm.jmx?.username || "",
      domainAllowlist: jvm.jmx?.domainAllowlist || [],
    },
    endpoint: {
      enabled: jvm.endpoint?.enabled || false,
      baseUrl: jvm.endpoint?.baseUrl || "",
      timeoutSeconds: jvm.endpoint?.timeoutSeconds || 0,
    },
    agent: {
      enabled: jvm.agent?.enabled || false,
      baseUrl: jvm.agent?.baseUrl || "",
      timeoutSeconds: jvm.agent?.timeoutSeconds || 0,
    },
  });
};

const buildJVMPreviewContextKey = (
  connectionId: string,
  mode: string,
  path: string,
  runtimeFingerprint: string,
): string => `${connectionId}::${mode}::${path}::${runtimeFingerprint}`;

const snapshotBlockStyle = (background: string): React.CSSProperties => ({
  margin: 0,
  borderRadius: 8,
  background,
  overflow: "auto",
});

const formatDraftPayload = (draft: JVMAIChangeDraft): string => {
  try {
    return JSON.stringify(draft.payload ?? {}, null, 2);
  } catch {
    return "{}";
  }
};

const resolveDefaultAction = (
  actions: JVMActionDefinition[] | undefined,
  providerMode: "jmx" | "endpoint" | "agent",
): string => {
  if (actions && actions.length > 0) {
    return String(actions[0].action || "").trim() || "put";
  }
  if (providerMode === "jmx") {
    return "set";
  }
  return "put";
};

const normalizePreviewResult = (value: any): JVMChangePreview | null => {
  if (
    value &&
    typeof value === "object" &&
    typeof value.allowed === "boolean"
  ) {
    return value as JVMChangePreview;
  }
  if (value?.data && typeof value.data.allowed === "boolean") {
    return value.data as JVMChangePreview;
  }
  return null;
};

const normalizeApplyResult = (value: any): JVMApplyResult | null => {
  if (value && typeof value === "object" && typeof value.status === "string") {
    return value as JVMApplyResult;
  }
  if (value?.data && typeof value.data.status === "string") {
    return value.data as JVMApplyResult;
  }
  return null;
};

const JVMResourceBrowser: React.FC<JVMResourceBrowserProps> = ({ tab }) => {
  const connection = useStore((state) =>
    state.connections.find((item) => item.id === tab.connectionId),
  );
  const addTab = useStore((state) => state.addTab);
  const theme = useStore((state) => state.theme);
  const darkMode = theme === "dark";
  const providerMode = (tab.providerMode ||
    connection?.config.jvm?.preferredMode ||
    "jmx") as "jmx" | "endpoint" | "agent";
  const resourcePath = String(tab.resourcePath || "").trim();
  const readOnly = connection?.config.jvm?.readOnly !== false;
  const runtimeFingerprint = useMemo(
    () => buildJVMPreviewRuntimeFingerprint(connection, providerMode),
    [connection, providerMode],
  );
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<JVMValueSnapshot | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [payloadText, setPayloadText] = useState(DEFAULT_PAYLOAD_TEXT);
  const [draftSource, setDraftSource] = useState<"manual" | "ai-plan">(
    "manual",
  );
  const [draftResourceId, setDraftResourceId] = useState("");
  const [draftError, setDraftError] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<JVMChangePreview | null>(
    null,
  );
  const [previewRequest, setPreviewRequest] = useState<JVMChangeRequest | null>(
    null,
  );
  const [previewRuntimeConfig, setPreviewRuntimeConfig] = useState<any | null>(
    null,
  );
  const [previewContextKey, setPreviewContextKey] = useState("");
  const [applyLoading, setApplyLoading] = useState(false);
  const previewSequenceRef = useRef(0);
  const currentPreviewContextKey = buildJVMPreviewContextKey(
    tab.connectionId,
    providerMode,
    resourcePath,
    runtimeFingerprint,
  );
  const previewContextKeyRef = useRef(currentPreviewContextKey);
  previewContextKeyRef.current = currentPreviewContextKey;

  const clearPreviewState = () => {
    setPreviewOpen(false);
    setPreviewResult(null);
    setPreviewRequest(null);
    setPreviewRuntimeConfig(null);
    setPreviewContextKey("");
  };

  const displayValue = useMemo(() => formatJVMValueForDisplay(snapshot), [snapshot]);
  const displayLanguage = useMemo(
    () =>
      snapshot?.sensitive
        ? "plaintext"
        : resolveJVMValueEditorLanguage(snapshot?.format || "", snapshot?.value),
    [snapshot?.format, snapshot?.sensitive, snapshot?.value],
  );
  const metadataText = useMemo(
    () => formatJVMMetadataForDisplay(snapshot),
    [snapshot],
  );
  const metadataLanguage = useMemo(
    () =>
      snapshot?.sensitive
        ? "plaintext"
        : resolveJVMValueEditorLanguage("json", snapshot?.metadata),
    [snapshot?.metadata, snapshot?.sensitive],
  );
  const supportedActions = useMemo(() => {
    if (!Array.isArray(snapshot?.supportedActions)) {
      return [] as JVMActionDefinition[];
    }
    return snapshot.supportedActions.filter(
      (item) => !!String(item?.action || "").trim(),
    );
  }, [snapshot]);
  const selectedActionDefinition = useMemo(
    () => supportedActions.find((item) => item.action === action) || null,
    [action, supportedActions],
  );
  const selectedActionDisplay = useMemo(
    () => resolveJVMActionDisplay(selectedActionDefinition || action),
    [action, selectedActionDefinition],
  );

  const loadSnapshot = async () => {
    const loadContextKey = currentPreviewContextKey;
    if (!connection) {
      setLoading(false);
      setSnapshot(null);
      setError("连接不存在或已被删除");
      return;
    }

    if (!resourcePath) {
      setLoading(false);
      setSnapshot(null);
      setError("资源路径为空");
      return;
    }

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMGetValue !== "function") {
      setLoading(false);
      setSnapshot(null);
      setError("JVMGetValue 后端方法不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMGetValue(
        buildJVMRuntimeConfig(connection, providerMode),
        resourcePath,
      );
      if (loadContextKey !== previewContextKeyRef.current) {
        return;
      }
      if (!result?.success) {
        setSnapshot(null);
        setError(String(result?.message || "读取 JVM 资源失败"));
        return;
      }
      setSnapshot((result.data || null) as JVMValueSnapshot | null);
    } catch (err: any) {
      setSnapshot(null);
      setError(err?.message || "读取 JVM 资源失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, [connection, providerMode, resourcePath, runtimeFingerprint, tab.connectionId]);

  useEffect(() => {
    setSnapshot(null);
    setAction("");
    setReason("");
    setPayloadText(DEFAULT_PAYLOAD_TEXT);
    setDraftSource("manual");
    setDraftResourceId("");
    setDraftError("");
    setApplyMessage("");
    previewSequenceRef.current += 1;
    clearPreviewState();
  }, [currentPreviewContextKey]);

  useEffect(() => {
    if (action.trim()) {
      return;
    }
    const nextAction = resolveDefaultAction(supportedActions, providerMode);
    setAction(nextAction);
    const nextDefinition = supportedActions.find(
      (item) => item.action === nextAction,
    );
    if (
      String(payloadText || "").trim() === "" ||
      payloadText === DEFAULT_PAYLOAD_TEXT
    ) {
      setPayloadText(buildJVMActionPayloadTemplate(nextDefinition, snapshot?.sensitive));
    }
  }, [action, payloadText, providerMode, supportedActions]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | {
            plan?: JVMAIChangePlan;
            targetTabId?: string;
            connectionId?: string;
            providerMode?: JVMAIPlanContext["providerMode"];
            resourcePath?: string;
          }
        | undefined;
      const plan = detail?.plan;
      if (!plan || (detail?.targetTabId && detail.targetTabId !== tab.id)) {
        return;
      }

      const planContext =
        detail?.targetTabId &&
        detail?.connectionId &&
        detail?.providerMode &&
        detail?.resourcePath
          ? {
              tabId: detail.targetTabId,
              connectionId: detail.connectionId,
              providerMode: detail.providerMode,
              resourcePath: detail.resourcePath,
            }
          : undefined;

      if (!planContext) {
        setDraftError(
          "AI 计划缺少来源上下文，请在目标 JVM 资源页重新生成后再应用。",
        );
        setApplyMessage("");
        clearPreviewState();
        return;
      }

      if (!matchesJVMAIPlanTargetTab(tab, planContext)) {
        setDraftError(
          "当前 JVM 页签与 AI 计划的来源上下文不一致，已拒绝自动应用。",
        );
        setApplyMessage("");
        clearPreviewState();
        return;
      }

      let draftFromPlan: JVMAIChangeDraft;
      try {
        draftFromPlan = buildJVMChangeDraftFromAIPlan(plan);
      } catch (err: any) {
        setDraftError(err?.message || "AI 计划暂时无法转换为 JVM 预览草稿");
        setApplyMessage("");
        clearPreviewState();
        return;
      }

      setDraftResourceId(draftFromPlan.resourceId);
      setAction(draftFromPlan.action);
      setReason(draftFromPlan.reason);
      setPayloadText(formatDraftPayload(draftFromPlan));
      setDraftSource(draftFromPlan.source || "ai-plan");
      setDraftError("");
      setApplyMessage(
        `已从 AI 计划填充草稿，目标资源为 ${draftFromPlan.resourceId}，请先执行“预览变更”再确认写入。`,
      );
      clearPreviewState();
    };

    window.addEventListener(
      "javanavi:jvm-apply-ai-plan",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "javanavi:jvm-apply-ai-plan",
        handler as EventListener,
      );
  }, [resourcePath, tab.id]);

  const handleSelectAction = (
    nextAction: string,
    definition?: JVMActionDefinition | null,
  ) => {
    const normalized = String(nextAction || "").trim();
    setAction(normalized);
    if (!normalized) {
      return;
    }
    const currentPayload = String(payloadText || "").trim();
    if (
      !currentPayload ||
      currentPayload === "{}" ||
      payloadText === DEFAULT_PAYLOAD_TEXT
    ) {
      setPayloadText(buildJVMActionPayloadTemplate(definition, snapshot?.sensitive));
    }
  };

  const buildDraftPlan = (): JVMChangeRequest => {
    const trimmedAction = String(action || "").trim() || "put";
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      throw new Error("请填写变更原因");
    }

    const rawPayload = String(payloadText || "").trim();
    let payload: Record<string, any> = {};
    if (rawPayload) {
      const parsed = JSON.parse(rawPayload);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Payload 必须是 JSON 对象");
      }
      payload = parsed as Record<string, any>;
    }

    const resourceId = String(draftResourceId || resourcePath).trim();
    if (!resourceId) {
      throw new Error("资源 ID 为空，无法生成变更草稿");
    }

    return {
      providerMode,
      resourceId,
      action: trimmedAction,
      reason: trimmedReason,
      source: draftSource,
      expectedVersion: snapshot?.version || undefined,
      payload,
    };
  };

  const handleOpenAudit = () => {
    if (!connection) {
      return;
    }

    addTab({
      id: `jvm-audit-${connection.id}-${providerMode}`,
      title: buildJVMTabTitle(connection.name, "audit", providerMode),
      type: "jvm-audit",
      connectionId: connection.id,
      providerMode,
    });
  };

  const handleAskAIForPlan = () => {
    if (!connection) {
      setDraftError("连接不存在或已被删除");
      return;
    }

    const prompt = buildJVMAIPlanPrompt({
      connectionName: connection.name,
      host: connection.config.host,
      providerMode,
      resourcePath,
      readOnly,
      environment: connection.config.jvm?.environment,
      snapshot,
    });

    const store = useStore.getState();
    const wasClosed = !store.aiPanelVisible;
    if (wasClosed) {
      store.setAIPanelVisible(true);
    }
    setTimeout(
      () => {
        window.dispatchEvent(
          new CustomEvent("javanavi:ai:inject-prompt", { detail: { prompt } }),
        );
      },
      wasClosed ? 350 : 0,
    );
  };

  const handlePreview = async () => {
    if (!connection) {
      setDraftError("连接不存在或已被删除");
      return;
    }

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMPreviewChange !== "function") {
      setDraftError("JVMPreviewChange 后端方法不可用");
      return;
    }

    let draftPlan: JVMChangeRequest;
    try {
      draftPlan = buildDraftPlan();
    } catch (err: any) {
      setDraftError(err?.message || "变更草稿不合法");
      return;
    }

    const previewSequence = ++previewSequenceRef.current;
    const previewContextKey = currentPreviewContextKey;
    const runtimeConfig = buildJVMRuntimeConfig(connection, providerMode);

    setPreviewLoading(true);
    setDraftError("");
    setApplyMessage("");
    try {
      const result = await backendApp.JVMPreviewChange(
        runtimeConfig,
        draftPlan,
      );
      if (
        previewSequence !== previewSequenceRef.current ||
        previewContextKey !== previewContextKeyRef.current
      ) {
        return;
      }

      if (result?.success === false) {
        clearPreviewState();
        setDraftError(String(result?.message || "预览 JVM 变更失败"));
        return;
      }

      const preview = normalizePreviewResult(result);
      if (!preview) {
        clearPreviewState();
        setDraftError("预览结果格式不正确");
        return;
      }

      setPreviewResult(preview);
      setPreviewRequest(draftPlan);
      setPreviewRuntimeConfig(runtimeConfig);
      setPreviewContextKey(previewContextKey);
      setPreviewOpen(true);
    } catch (err: any) {
      clearPreviewState();
      setDraftError(err?.message || "预览 JVM 变更失败");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    await Promise.resolve();

    if (!connection) {
      setDraftError("连接不存在或已被删除");
      return;
    }

    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMApplyChange !== "function") {
      setDraftError("JVMApplyChange 后端方法不可用");
      return;
    }

    if (!previewResult || !previewRequest || !previewRuntimeConfig) {
      setDraftError("请先预览变更，再确认执行");
      return;
    }
    if (previewContextKey !== previewContextKeyRef.current) {
      clearPreviewState();
      setDraftError("资源上下文已变化，请重新预览后再执行");
      return;
    }

    let applyRequest: JVMChangeRequest;
    try {
      applyRequest = buildJVMPreviewApplyRequest(previewRequest, previewResult);
    } catch (err: any) {
      setDraftError(err?.message || "确认令牌缺失，请重新预览后再执行");
      return;
    }

    setApplyLoading(true);
    setDraftError("");
    setApplyMessage("");
    try {
      const result = await backendApp.JVMApplyChange(
        previewRuntimeConfig,
        applyRequest,
      );
      if (result?.success === false) {
        setDraftError(String(result?.message || "执行 JVM 变更失败"));
        return;
      }

      const applyResult = normalizeApplyResult(result);
      if (applyResult?.updatedValue) {
        setSnapshot(applyResult.updatedValue);
      }

      clearPreviewState();
      setApplyMessage(
        applyResult?.message || result?.message || "JVM 变更已执行",
      );
      await loadSnapshot();
    } catch (err: any) {
      setDraftError(err?.message || "执行 JVM 变更失败");
    } finally {
      setApplyLoading(false);
    }
  };

  if (!connection) {
    return (
      <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />
    );
  }

  const cardStyle = getJVMWorkspaceCardStyle(darkMode);

  return (
    <>
      <style>{`
        .jvm-resource-browser-scroll-shell {
          scrollbar-width: thin;
        }
        .jvm-resource-browser-scroll-shell::-webkit-scrollbar,
        .jvm-resource-browser-code-block::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .jvm-resource-browser-scroll-shell::-webkit-scrollbar-thumb,
        .jvm-resource-browser-code-block::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.22);
          border-radius: 999px;
        }
        .jvm-resource-browser-scroll-shell::-webkit-scrollbar-track,
        .jvm-resource-browser-code-block::-webkit-scrollbar-track {
          background: transparent;
        }
        @media (max-width: 1120px) {
          .jvm-resource-workbench {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <JVMWorkspaceShell
        darkMode={darkMode}
        className="jvm-resource-browser-scroll-shell"
        data-jvm-resource-browser-scroll-shell="true"
      >
        <JVMWorkspaceHero
          darkMode={darkMode}
          eyebrow="JVM Resource"
          title="JVM 资源工作台"
          description={
            <>
              <Text strong>{connection.name}</Text>
              <Text type="secondary"> · {resourcePath || "-"}</Text>
            </>
          }
          badges={
            <>
              <JVMModeBadge mode={providerMode} />
              <Tag color={readOnly ? "blue" : "red"}>
                {readOnly ? "只读连接" : "可写连接"}
              </Tag>
            </>
          }
          actions={
            <>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => void loadSnapshot()}
              >
                刷新
              </Button>
              <Button
                size="small"
                icon={<FileSearchOutlined />}
                onClick={handleOpenAudit}
              >
                审计记录
              </Button>
              <Button
                size="small"
                icon={<RobotOutlined />}
                onClick={handleAskAIForPlan}
              >
                AI 生成计划
              </Button>
            </>
          }
        />

        <div
          className="jvm-resource-workbench"
          data-jvm-resource-workbench="true"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 440px)",
            gap: 18,
            alignItems: "start",
          }}
        >
          <Card
            title="资源快照"
            variant="borderless"
            style={{
              ...cardStyle,
              gridColumn: readOnly ? "1 / -1" : undefined,
            }}
          >
            {loading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {error ? <Alert type="error" showIcon message={error} /> : null}
                {snapshot ? (
                  <>
                    <Descriptions
                      column={1}
                      size="small"
                      styles={DESCRIPTION_STYLES}
                    >
                      <Descriptions.Item label="资源 ID">
                        {snapshot.resourceId || "-"}
                      </Descriptions.Item>
                      <Descriptions.Item label="资源类型">
                        {snapshot.kind || tab.resourceKind || "-"}
                      </Descriptions.Item>
                      <Descriptions.Item label="格式">
                        {snapshot.format || "-"}
                      </Descriptions.Item>
                      <Descriptions.Item label="版本">
                        {snapshot.version || "-"}
                      </Descriptions.Item>
                      <Descriptions.Item label="可用动作">
                        {formatJVMActionSummary(supportedActions)}
                      </Descriptions.Item>
                    </Descriptions>
                    {snapshot.description ? (
                      <Text type="secondary">{snapshot.description}</Text>
                    ) : null}
                    <div>
                      <Text
                        strong
                        style={{ display: "block", marginBottom: 8 }}
                      >
                        资源值
                      </Text>
                      <div
                        className="jvm-resource-browser-code-block"
                        style={{
                          ...snapshotBlockStyle("rgba(0, 0, 0, 0.04)"),
                          height: estimateJVMResourceEditorHeight(displayValue),
                        }}
                      >
                        <Editor
                          height="100%"
                          language={displayLanguage}
                          theme={
                            darkMode ? "transparent-dark" : "transparent-light"
                          }
                          value={displayValue}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            lineNumbers: "on",
                            wordWrap: "on",
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            folding: true,
                            renderValidationDecorations: "off",
                          }}
                        />
                      </div>
                    </div>
                    {metadataText ? (
                      <div>
                        <Text
                          strong
                          style={{ display: "block", marginBottom: 8 }}
                        >
                          元数据
                        </Text>
                        <div
                          className="jvm-resource-browser-code-block"
                          style={{
                            ...snapshotBlockStyle("rgba(0, 0, 0, 0.03)"),
                            height:
                              estimateJVMResourceEditorHeight(metadataText),
                          }}
                        >
                          <Editor
                            height="100%"
                            language={metadataLanguage}
                            theme={
                              darkMode
                                ? "transparent-dark"
                                : "transparent-light"
                            }
                            value={metadataText}
                            options={{
                              readOnly: true,
                              minimap: { enabled: false },
                              lineNumbers: "on",
                              wordWrap: "on",
                              scrollBeyondLastLine: false,
                              automaticLayout: true,
                              folding: true,
                              renderValidationDecorations: "off",
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : error ? null : (
                  <Empty description="暂无资源数据" />
                )}
              </Space>
            )}
          </Card>

          {!readOnly ? (
            <Card title="变更草稿" variant="borderless" style={cardStyle}>
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                {draftError ? (
                  <Alert type="error" showIcon message={draftError} />
                ) : null}
                {applyMessage ? (
                  <Alert type="success" showIcon message={applyMessage} />
                ) : null}
                <Descriptions
                  column={1}
                  size="small"
                  styles={DESCRIPTION_STYLES}
                >
                  <Descriptions.Item label="资源路径">
                    {resourcePath || "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="目标资源">
                    {draftResourceId || resourcePath || "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="资源版本">
                    {snapshot?.version || "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="草稿来源">
                    {draftSource === "ai-plan" ? "AI 辅助草稿" : "手工编辑"}
                  </Descriptions.Item>
                </Descriptions>
                {supportedActions.length > 0 ? (
                  <Space
                    direction="vertical"
                    size={8}
                    style={{ width: "100%" }}
                  >
                    <Text strong>资源支持动作</Text>
                    <Space size={8} wrap>
                      {supportedActions.map((item) => (
                        <Button
                          key={item.action}
                          size="small"
                          type={action === item.action ? "primary" : "default"}
                          danger={item.dangerous}
                          onClick={() => handleSelectAction(item.action, item)}
                        >
                          {resolveJVMActionDisplay(item).label}
                        </Button>
                      ))}
                    </Space>
                    {selectedActionDisplay.description ? (
                      <Text type="secondary">
                        {selectedActionDisplay.description}
                      </Text>
                    ) : null}
                    {selectedActionDefinition?.payloadFields?.length ? (
                      <Text type="secondary">
                        Payload 字段：
                        {selectedActionDefinition.payloadFields
                          .map(
                            (field) =>
                              `${field.name}${field.required ? "(必填)" : ""}`,
                          )
                          .join("、")}
                      </Text>
                    ) : null}
                  </Space>
                ) : null}
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Text strong>动作</Text>
                  <Input
                    value={action}
                    onChange={(event) =>
                      handleSelectAction(
                        event.target.value,
                        selectedActionDefinition,
                      )
                    }
                    placeholder={
                      providerMode === "jmx"
                        ? "例如 set 或 invoke"
                        : "例如 put / clear / evict"
                    }
                    maxLength={64}
                  />
                  {action ? (
                    <Text type="secondary">
                      当前动作：
                      {formatJVMActionDisplayText(selectedActionDisplay)}
                    </Text>
                  ) : null}
                </Space>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Text strong>变更原因</Text>
                  <Input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="填写本次 JVM 资源变更原因"
                    maxLength={200}
                  />
                </Space>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Text strong>Payload(JSON)</Text>
                  <Text type="secondary">
                    预览会使用当前草稿；确认执行会使用最近一次成功预览的
                    request，修改草稿后请重新预览。
                    {selectedActionDefinition?.payloadExample && !snapshot?.sensitive
                      ? " 已按当前动作填充推荐模板。"
                      : ""}
                  </Text>
                  <TextArea
                    value={payloadText}
                    onChange={(event) => setPayloadText(event.target.value)}
                    autoSize={{ minRows: 8, maxRows: 18 }}
                    spellCheck={false}
                  />
                </Space>
                <Space size={12} wrap>
                  <Button
                    type="primary"
                    loading={previewLoading}
                    onClick={() => void handlePreview()}
                  >
                    预览变更
                  </Button>
                  <Button icon={<RobotOutlined />} onClick={handleAskAIForPlan}>
                    让 AI 生成计划
                  </Button>
                </Space>
              </Space>
            </Card>
          ) : null}
        </div>
      </JVMWorkspaceShell>

      <JVMChangePreviewModal
        open={previewOpen}
        preview={previewResult}
        applying={applyLoading}
        onCancel={() => {
          if (applyLoading) {
            return;
          }
          setPreviewOpen(false);
        }}
        onConfirm={() => void handleApply()}
      />
    </>
  );
};

export default JVMResourceBrowser;
