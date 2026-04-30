import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  ClearOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RocketOutlined,
  ToolOutlined,
} from "@ant-design/icons";

import { EventsOn } from "@compat/runtime";
import { useStore } from "../store";
import type {
  JVMDiagnosticAuditRecord,
  JVMDiagnosticCapability,
  JVMDiagnosticEventChunk,
  JVMDiagnosticSessionHandle,
  TabData,
} from "../types";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
import { resolveJVMDiagnosticCompletionItems } from "../utils/jvmDiagnosticCompletion";
import {
  createJVMDiagnosticRedactionState,
  formatJVMDiagnosticTransportLabel,
  JVM_DIAGNOSTIC_COMMAND_PRESETS,
  redactJVMDiagnosticChunkContent,
  redactJVMDiagnosticOutput,
  type JVMDiagnosticRedactionState,
} from "../utils/jvmDiagnosticPresentation";
import JVMCommandPresetBar from "./jvm/JVMCommandPresetBar";
import JVMDiagnosticHistory from "./jvm/JVMDiagnosticHistory";
import JVMDiagnosticOutput from "./jvm/JVMDiagnosticOutput";

const { Text, Paragraph } = Typography;
const JVM_DIAGNOSTIC_EDITOR_LANGUAGE = "jvm-diagnostic";
let jvmDiagnosticCompletionDisposable: { dispose?: () => void } | null = null;

type JVMDiagnosticConsoleProps = {
  tab: TabData;
};

const DEFAULT_COMMAND =
  JVM_DIAGNOSTIC_COMMAND_PRESETS.find((item) => item.category === "observe")
    ?.command || "thread -n 5";

const DIAGNOSTIC_WORKFLOW_STEPS = [
  {
    index: "01",
    title: "检查能力",
    description: "只读取诊断通道、流式输出与命令权限，不创建会话。",
  },
  {
    index: "02",
    title: "新建会话",
    description: "创建诊断上下文，后续命令都会绑定到这个会话。",
  },
  {
    index: "03",
    title: "执行命令",
    description: "会话建立后显示命令编辑器、原因输入与模板。",
  },
];

const commandEditorShellStyle = (darkMode: boolean): React.CSSProperties => ({
  borderRadius: 14,
  border: darkMode
    ? "1px solid rgba(255,255,255,0.12)"
    : "1px solid rgba(22,119,255,0.16)",
  background: darkMode ? "rgba(5,12,20,0.68)" : "rgba(246,249,253,0.92)",
  boxShadow: darkMode
    ? "inset 0 0 0 1px rgba(255,255,255,0.03)"
    : "inset 0 0 0 1px rgba(255,255,255,0.86)",
  overflow: "hidden",
});

const registerJVMDiagnosticMonacoSupport = (monaco: any) => {
  const languageRegistry = monaco.languages as Record<string, any>;
  if (!languageRegistry.__javanaviJvmDiagnosticLanguageRegistered) {
    languageRegistry.__javanaviJvmDiagnosticLanguageRegistered = true;
    monaco.languages.register({ id: JVM_DIAGNOSTIC_EDITOR_LANGUAGE });
  }

  if (jvmDiagnosticCompletionDisposable?.dispose) {
    jvmDiagnosticCompletionDisposable.dispose();
  }

  jvmDiagnosticCompletionDisposable =
    monaco.languages.registerCompletionItemProvider(
      JVM_DIAGNOSTIC_EDITOR_LANGUAGE,
      {
        triggerCharacters: [" ", "-", ".", "@", "'", "\"", "{", "/"],
        provideCompletionItems: (model: any, position: any) => {
          const textBeforeCursor = model.getValueInRange(
            new monaco.Range(1, 1, position.lineNumber, position.column),
          );
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = resolveJVMDiagnosticCompletionItems(
            textBeforeCursor,
          ).map((item, index) => ({
            label: item.label,
            kind:
              item.scope === "command"
                ? monaco.languages.CompletionItemKind.Keyword
                : item.isSnippet
                  ? monaco.languages.CompletionItemKind.Snippet
                  : monaco.languages.CompletionItemKind.Value,
            insertText:
              item.scope === "command"
                ? `${item.insertText} `
                : item.insertText,
            insertTextRules: item.isSnippet
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            detail: item.detail,
            documentation: item.documentation,
            range,
            sortText: `${item.scope === "command" ? "0" : "1"}-${String(index).padStart(3, "0")}`,
            command:
              item.scope === "command"
                ? { id: "editor.action.triggerSuggest" }
                : undefined,
          }));

          return { suggestions };
        },
      },
    );
};

export const isJVMDiagnosticTerminalPhase = (phase?: string): boolean =>
  ["completed", "failed", "canceled"].includes(
    String(phase || "").toLowerCase().trim(),
  );

export const createJVMDiagnosticLocalPendingChunk = ({
  sessionId,
  commandId,
  command,
  timestamp = Date.now(),
}: {
  sessionId: string;
  commandId: string;
  command: string;
  timestamp?: number;
}): JVMDiagnosticEventChunk => ({
  sessionId,
  commandId,
  event: "diagnostic",
  phase: "running",
  content: `已提交诊断命令，等待后端输出：${command}`,
  timestamp,
  metadata: {
    source: "local-pending",
  },
});

export const createJVMDiagnosticRunningRecord = ({
  connectionId,
  sessionId,
  commandId,
  transport,
  command,
  source,
  reason,
  timestamp = Date.now(),
}: {
  connectionId: string;
  sessionId: string;
  commandId: string;
  transport: string;
  command: string;
  source?: string;
  reason?: string;
  timestamp?: number;
}): JVMDiagnosticAuditRecord => ({
  timestamp,
  connectionId,
  sessionId,
  commandId,
  transport,
  command,
  source,
  reason,
  status: "running",
});

const buildJVMDiagnosticRedactionKey = (
  chunk: Pick<JVMDiagnosticEventChunk, "sessionId" | "commandId">,
): string => `${chunk.sessionId || "unknown-session"}::${chunk.commandId || "unknown-command"}`;

const JVMDiagnosticConsole: React.FC<JVMDiagnosticConsoleProps> = ({ tab }) => {
  const connection = useStore((state) =>
    state.connections.find((item) => item.id === tab.connectionId),
  );
  const draft = useStore(
    (state) => state.jvmDiagnosticDrafts[tab.id] || { command: "" },
  );
  const chunks = useStore(
    (state) => state.jvmDiagnosticOutputs[tab.id] || [],
  );
  const setDraft = useStore((state) => state.setJVMDiagnosticDraft);
  const appendOutput = useStore((state) => state.appendJVMDiagnosticOutput);
  const clearOutput = useStore((state) => state.clearJVMDiagnosticOutput);
  const darkMode = useStore((state) => state.theme === "dark");
  const [capabilities, setCapabilities] = useState<JVMDiagnosticCapability[]>([]);
  const [session, setSession] = useState<JVMDiagnosticSessionHandle | null>(null);
  const [records, setRecords] = useState<JVMDiagnosticAuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [commandRunning, setCommandRunning] = useState(false);
  const [activeCommandId, setActiveCommandId] = useState("");
  const [error, setError] = useState("");
  const activeCommandIdRef = useRef("");
  const terminalCommandIdsRef = useRef<Set<string>>(new Set());
  const redactionStatesRef = useRef<Record<string, JVMDiagnosticRedactionState>>({});

  const redactDiagnosticContent = useCallback(
    (
      content: string,
      chunk: Pick<JVMDiagnosticEventChunk, "sessionId" | "commandId">,
    ) => {
      const key = buildJVMDiagnosticRedactionKey(chunk);
      const state =
        redactionStatesRef.current[key] || createJVMDiagnosticRedactionState();
      redactionStatesRef.current[key] = state;
      return redactJVMDiagnosticChunkContent(content, state);
    },
    [],
  );

  const redactDiagnosticChunk = useCallback(
    (chunk: JVMDiagnosticEventChunk, options: { keepState?: boolean } = {}) => {
      const key = buildJVMDiagnosticRedactionKey(chunk);
      const safeChunk = {
        ...chunk,
        content: redactDiagnosticContent(String(chunk.content || ""), chunk),
      };
      if (
        !options.keepState &&
        isJVMDiagnosticTerminalPhase(chunk.phase) &&
        !redactionStatesRef.current[key]?.insideSensitivePem &&
        !redactionStatesRef.current[key]?.sawSensitivePem
      ) {
        delete redactionStatesRef.current[key];
      }
      return safeChunk;
    },
    [redactDiagnosticContent],
  );

  const finishActiveCommand = useCallback((commandId: string) => {
    if (!commandId || activeCommandIdRef.current !== commandId) {
      return;
    }
    activeCommandIdRef.current = "";
    setCommandRunning(false);
    setActiveCommandId("");
  }, []);

  useEffect(() => {
    if (!draft.command) {
      setDraft(tab.id, { command: DEFAULT_COMMAND, source: "manual" });
    }
  }, [draft.command, setDraft, tab.id]);

  const diagnosticTransport = useMemo(
    () => connection?.config.jvm?.diagnostic?.transport || "agent-bridge",
    [connection],
  );
  const rpcConnectionConfig = useMemo(
    () =>
      connection
        ? buildRpcConnectionConfig(connection.config, { id: connection.id })
        : null,
    [connection],
  );
  const effectiveSession = useMemo(
    () =>
      session ||
      (draft.sessionId
        ? {
            sessionId: draft.sessionId,
            transport: diagnosticTransport,
            startedAt: 0,
          }
        : null),
    [diagnosticTransport, draft.sessionId, session],
  );
  const hasSession = Boolean(effectiveSession?.sessionId);

  const loadAuditRecords = useCallback(async () => {
    if (!connection) {
      setRecords([]);
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMListDiagnosticAuditRecords !== "function") {
      return;
    }

    setHistoryLoading(true);
    try {
      const result = await backendApp.JVMListDiagnosticAuditRecords(connection.id, 20);
      if (result?.success === false) {
        throw new Error(String(result?.message || "加载诊断历史失败"));
      }
      setRecords(Array.isArray(result?.data) ? result.data : []);
    } catch (err: any) {
      setError(redactJVMDiagnosticOutput(err?.message || "加载诊断历史失败"));
    } finally {
      setHistoryLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.targetTabId !== tab.id || !detail.plan) {
        return;
      }

      const planTransport = String(detail.plan.transport || diagnosticTransport);
      if (planTransport !== diagnosticTransport) {
        setError(
          `AI 计划的诊断 transport 为 ${planTransport}，与当前控制台 ${diagnosticTransport} 不一致，请重新生成计划后再应用。`,
        );
        return;
      }

      setError("");
      setDraft(tab.id, {
        command: String(detail.plan.command || ""),
        reason: String(detail.plan.reason || ""),
        source: "ai-plan",
      });
      message.success("AI 诊断计划已回填到控制台");
    };

    window.addEventListener("javanavi:jvm-apply-diagnostic-plan", handler);
    return () =>
      window.removeEventListener("javanavi:jvm-apply-diagnostic-plan", handler);
  }, [diagnosticTransport, setDraft, tab.id]);

  useEffect(() => {
    void loadAuditRecords();
  }, [loadAuditRecords]);

  useEffect(() => {
    const eventName = "jvm:diagnostic:chunk";
    const stopListening = EventsOn(eventName, (payload: {
      tabId?: string;
      chunk?: JVMDiagnosticEventChunk;
    }) => {
      if (!payload || payload.tabId !== tab.id || !payload.chunk) {
        return;
      }

      const safeChunk = redactDiagnosticChunk(payload.chunk);
      appendOutput(tab.id, [safeChunk]);
      if (safeChunk.phase === "failed") {
        setError(safeChunk.content || "诊断命令执行失败");
      }
      if (safeChunk.commandId && isJVMDiagnosticTerminalPhase(safeChunk.phase)) {
        terminalCommandIdsRef.current.add(safeChunk.commandId);
        finishActiveCommand(safeChunk.commandId);
        void loadAuditRecords();
      }
    });

    return () => {
      if (typeof stopListening === "function") {
        stopListening();
      }
    };
  }, [appendOutput, finishActiveCommand, loadAuditRecords, redactDiagnosticChunk, tab.id]);

  const handleProbe = async () => {
    if (!rpcConnectionConfig) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMProbeDiagnosticCapabilities !== "function") {
      setError("JVMProbeDiagnosticCapabilities 后端方法不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMProbeDiagnosticCapabilities(
        rpcConnectionConfig,
      );
      if (result?.success === false) {
        throw new Error(String(result?.message || "检查诊断能力失败"));
      }
      setCapabilities(Array.isArray(result?.data) ? result.data : []);
    } catch (err: any) {
      setCapabilities([]);
      setError(redactJVMDiagnosticOutput(err?.message || "检查诊断能力失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    if (!rpcConnectionConfig) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMStartDiagnosticSession !== "function") {
      setError("JVMStartDiagnosticSession 后端方法不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMStartDiagnosticSession(
        rpcConnectionConfig,
        {
          title: "JVM 诊断控制台",
          reason: draft.reason || "控制台启动会话",
        },
      );
      if (result?.success === false) {
        throw new Error(String(result?.message || "创建诊断会话失败"));
      }
      const nextSession = (result?.data || null) as JVMDiagnosticSessionHandle | null;
      setSession(nextSession);
      if (nextSession?.sessionId) {
        setDraft(tab.id, { sessionId: nextSession.sessionId });
      }
      void loadAuditRecords();
    } catch (err: any) {
      setSession(null);
      setError(redactJVMDiagnosticOutput(err?.message || "创建诊断会话失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteCommand = async () => {
    if (!rpcConnectionConfig) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMExecuteDiagnosticCommand !== "function") {
      setError("JVMExecuteDiagnosticCommand 后端方法不可用");
      return;
    }
    if (!effectiveSession?.sessionId) {
      setError("请先创建诊断会话，再执行命令");
      return;
    }
    const command = draft.command.trim();
    if (!command) {
      setError("诊断命令不能为空");
      return;
    }

    const sessionId = effectiveSession.sessionId;
    const commandId = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const source = draft.source || "manual";
    const reason = (draft.reason || "").trim();
    activeCommandIdRef.current = commandId;
    terminalCommandIdsRef.current.delete(commandId);
    setCommandRunning(true);
    setActiveCommandId(commandId);
    setError("");
    appendOutput(tab.id, [
      createJVMDiagnosticLocalPendingChunk({
        sessionId,
        commandId,
        command,
      }),
    ]);
    setRecords((current) => [
      createJVMDiagnosticRunningRecord({
        connectionId: connection?.id || rpcConnectionConfig.id || "",
        sessionId,
        commandId,
        transport: diagnosticTransport,
        command,
        source,
        reason,
      }),
      ...current.filter((record) => record.commandId !== commandId),
    ].slice(0, 20));
    try {
      const result = await backendApp.JVMExecuteDiagnosticCommand(
        rpcConnectionConfig,
        tab.id,
        {
          sessionId,
          commandId,
          command,
          source,
          reason,
        },
      );
      if (result?.success === false) {
        throw new Error(String(result?.message || "执行诊断命令失败"));
      }
      if (result?.message) {
        message.warning(
          redactDiagnosticContent(String(result.message), { sessionId, commandId }),
        );
      }
      const terminalSeen = terminalCommandIdsRef.current.has(commandId);
      if (!terminalSeen) {
        appendOutput(tab.id, [
          redactDiagnosticChunk(
            {
              sessionId,
              commandId,
              event: "diagnostic",
              phase: "completed",
              content: "诊断命令调用已返回，但未收到后端终态事件，前端已兜底结束等待状态。",
              timestamp: Date.now(),
              metadata: {
                source: "frontend-fallback",
              },
            },
            { keepState: true },
          ),
        ]);
      }
      finishActiveCommand(commandId);
      await loadAuditRecords();
      if (!terminalSeen) {
        setRecords((current) => {
          const index = current.findIndex((record) => record.commandId === commandId);
          if (index >= 0) {
            const next = [...current];
            next[index] = { ...next[index], status: "completed" };
            return next;
          }
          return [
            {
              ...createJVMDiagnosticRunningRecord({
                connectionId: connection?.id || rpcConnectionConfig.id || "",
                sessionId,
                commandId,
                transport: diagnosticTransport,
                command,
                source,
                reason,
              }),
              status: "completed",
            },
            ...current,
          ].slice(0, 20);
        });
      }
    } catch (err: any) {
      const rawMessageText = String(err?.message || "执行诊断命令失败");
      let messageText = "";
      if (!terminalCommandIdsRef.current.has(commandId)) {
        const safeChunk = redactDiagnosticChunk({
          sessionId,
          commandId,
          event: "diagnostic",
          phase: "failed",
          content: rawMessageText,
          timestamp: Date.now(),
          metadata: {
            source: "frontend-fallback",
          },
        });
        messageText = safeChunk.content;
        appendOutput(tab.id, [safeChunk]);
        setRecords((current) =>
          current.map((record) =>
            record.commandId === commandId
              ? { ...record, status: "failed" }
              : record,
          ),
        );
      } else {
        messageText = redactDiagnosticContent(rawMessageText, { sessionId, commandId });
      }
      finishActiveCommand(commandId);
      setError(messageText);
    }
  };

  const handleCancelCommand = async () => {
    if (!rpcConnectionConfig || !effectiveSession?.sessionId || !activeCommandId) {
      return;
    }
    const backendApp = (window as any).go?.app?.App;
    if (typeof backendApp?.JVMCancelDiagnosticCommand !== "function") {
      setError("JVMCancelDiagnosticCommand 后端方法不可用");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await backendApp.JVMCancelDiagnosticCommand(
        rpcConnectionConfig,
        tab.id,
        effectiveSession.sessionId,
        activeCommandId,
      );
      if (result?.success === false) {
        throw new Error(String(result?.message || "取消诊断命令失败"));
      }
      message.info("已发送取消请求");
    } catch (err: any) {
      setError(redactJVMDiagnosticOutput(err?.message || "取消诊断命令失败"));
    } finally {
      setLoading(false);
    }
  };

  const handleCommandEditorBeforeMount: BeforeMount = (monaco) => {
    registerJVMDiagnosticMonacoSupport(monaco);
  };

  const handleCommandEditorMount: OnMount = (editor, monaco) => {
    monaco.editor.setTheme(darkMode ? "transparent-dark" : "transparent-light");

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      void handleExecuteCommand();
    });
  };

  if (!connection) {
    return <Empty description="连接不存在或已被删除" style={{ marginTop: 64 }} />;
  }

  const pageBackground = darkMode
    ? "radial-gradient(circle at top left, rgba(22,119,255,0.20), transparent 34%), linear-gradient(135deg, #101820 0%, #141414 54%, #1d2228 100%)"
    : "radial-gradient(circle at top left, rgba(22,119,255,0.16), transparent 32%), linear-gradient(135deg, #f4f8ff 0%, #f8fbff 48%, #ffffff 100%)";
  const heroBackground = darkMode
    ? "linear-gradient(135deg, rgba(22,119,255,0.18), rgba(82,196,26,0.07))"
    : "linear-gradient(135deg, rgba(22,119,255,0.12), rgba(19,194,194,0.06))";
  const panelBg = darkMode ? "rgba(18,24,32,0.86)" : "rgba(255,255,255,0.92)";
  const panelBorder = darkMode
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(22,119,255,0.10)";
  const mutedPanelBg = darkMode
    ? "rgba(255,255,255,0.045)"
    : "rgba(22,119,255,0.045)";
  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    border: panelBorder,
    background: panelBg,
    boxShadow: darkMode
      ? "0 18px 42px rgba(0, 0, 0, 0.24)"
      : "0 16px 38px rgba(24, 54, 96, 0.07)",
  };
  const compactCardStyles = {
    header: {
      borderBottom: darkMode
        ? "1px solid rgba(255,255,255,0.07)"
        : "1px solid rgba(15,23,42,0.06)",
      padding: "14px 18px",
    },
    body: { padding: 18 },
  };
  const actionButtonStyle: React.CSSProperties = {
    height: 36,
    borderRadius: 12,
    paddingInline: 14,
    fontWeight: 600,
  };
  const renderCardTitle = (
    icon: React.ReactNode,
    title: string,
    description?: string,
  ) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          color: darkMode ? "#91caff" : "#1677ff",
          background: darkMode
            ? "rgba(22,119,255,0.18)"
            : "rgba(22,119,255,0.10)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <Text strong>{title}</Text>
        {description ? (
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            {description}
          </Text>
        ) : null}
      </span>
    </div>
  );
  const renderCapabilityContent = () =>
    capabilities.length ? (
      <div style={{ display: "grid", gap: 10 }}>
        <Text strong>能力检查结果</Text>
        <div style={{ display: "grid", gap: 8 }}>
          {capabilities.map((item) => (
            <div
              key={item.transport}
              style={{
                padding: 12,
                borderRadius: 14,
                border: darkMode
                  ? "1px solid rgba(255,255,255,0.08)"
                  : "1px solid rgba(22,119,255,0.12)",
                background: mutedPanelBg,
              }}
            >
              <Space size={6} wrap>
                <Tag color="processing">
                  {formatJVMDiagnosticTransportLabel(item.transport)}
                </Tag>
                <Tag color={item.canOpenSession ? "green" : "red"}>
                  {item.canOpenSession ? "可建会话" : "不可建会话"}
                </Tag>
                <Tag color={item.canStream ? "green" : "red"}>
                  {item.canStream ? "流式输出" : "不支持流式"}
                </Tag>
                <Tag color={item.allowObserveCommands ? "green" : "red"}>
                  {item.allowObserveCommands ? "观察命令" : "禁止观察"}
                </Tag>
                {item.allowTraceCommands ? <Tag color="gold">跟踪命令</Tag> : null}
                {item.allowMutatingCommands ? <Tag color="red">高风险命令</Tag> : null}
              </Space>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <Alert
        type="info"
        showIcon
        message="尚未检查能力"
        description="能力检查只读取通道权限和命令策略，不会创建会话或执行命令。"
      />
    );

  return (
    <div
      style={{
        padding: 18,
        display: "grid",
        gap: 16,
        height: "100%",
        minHeight: 0,
        overflow: "auto",
        alignContent: "start",
        background: pageBackground,
      }}
      data-jvm-diagnostic-console="true"
    >
      <Card
        variant="borderless"
        styles={{ body: { padding: 18 } }}
        style={{
          ...cardStyle,
          background: heroBackground,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 18,
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Text type="secondary">JVM 诊断</Text>
            <Typography.Title level={3} style={{ margin: "2px 0 6px" }}>
              JVM 诊断工作台
            </Typography.Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              <Text strong>{connection.name}</Text>
              <Text type="secondary">
                {" "}· {connection.config.host || "unknown"}:{connection.config.port || 0}
                {" "}· {formatJVMDiagnosticTransportLabel(diagnosticTransport)}
              </Text>
            </Paragraph>
          </div>

          <Space wrap size={8} style={{ justifyContent: "flex-end" }}>
            <Tag color={hasSession ? "green" : "default"}>
              {hasSession ? "会话已建立" : "未建会话"}
            </Tag>
            {commandRunning ? <Tag color="processing">命令执行中</Tag> : null}
            <Button
              icon={<ToolOutlined />}
              style={actionButtonStyle}
              onClick={() => void handleProbe()}
              loading={loading}
            >
              检查能力
            </Button>
            <Button
              icon={<RocketOutlined />}
              type={hasSession ? "default" : "primary"}
              style={actionButtonStyle}
              onClick={() => void handleStartSession()}
              loading={loading}
            >
              {hasSession ? "重建会话" : "新建会话"}
            </Button>
            {hasSession ? (
              <Button
                icon={<PlayCircleOutlined />}
                type="primary"
                style={actionButtonStyle}
                onClick={() => void handleExecuteCommand()}
                loading={commandRunning}
              >
                执行命令
              </Button>
            ) : null}
            {hasSession ? (
              <Button
                danger
                icon={<PauseCircleOutlined />}
                style={actionButtonStyle}
                disabled={!commandRunning || !effectiveSession?.sessionId || !activeCommandId}
                onClick={() => void handleCancelCommand()}
                loading={loading && commandRunning}
              >
                取消命令
              </Button>
            ) : null}
          </Space>
        </div>
        {error ? <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} /> : null}
      </Card>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns:
            "minmax(min(100%, 520px), 1.16fr) minmax(min(100%, 340px), 0.84fr)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {!hasSession ? (
            <Card
              title={renderCardTitle(
                <RocketOutlined />,
                "开始一次诊断",
                "先建立会话，再显示命令编辑器和模板",
              )}
              variant="borderless"
              style={cardStyle}
              styles={compactCardStyles}
            >
              <div style={{ display: "grid", gap: 16 }}>
                <Alert
                  type="info"
                  showIcon
                  message="命令输入将在会话建立后显示"
                  description="这样可以避免未绑定会话时误以为命令已经可执行，也能保证审计记录、输出流和取消命令都绑定到同一个会话。"
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
                    gap: 10,
                  }}
                >
                  {DIAGNOSTIC_WORKFLOW_STEPS.map((step) => (
                    <div
                      key={step.index}
                      style={{
                        padding: 14,
                        borderRadius: 16,
                        border: darkMode
                          ? "1px solid rgba(255,255,255,0.08)"
                          : "1px solid rgba(22,119,255,0.12)",
                        background: mutedPanelBg,
                      }}
                    >
                      <Text
                        strong
                        style={{
                          color: darkMode ? "#91caff" : "#1677ff",
                          fontSize: 12,
                        }}
                      >
                        {step.index}
                      </Text>
                      <div style={{ marginTop: 6 }}>
                        <Text strong>{step.title}</Text>
                      </div>
                      <Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
                        {step.description}
                      </Paragraph>
                    </div>
                  ))}
                </div>
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    style={actionButtonStyle}
                    loading={loading}
                    onClick={() => void handleStartSession()}
                  >
                    新建诊断会话
                  </Button>
                  <Button
                    icon={<ToolOutlined />}
                    style={actionButtonStyle}
                    loading={loading}
                    onClick={() => void handleProbe()}
                  >
                    先检查能力
                  </Button>
                </Space>
              </div>
            </Card>
          ) : (
            <>
              <Card
                title={renderCardTitle(
                  <PlayCircleOutlined />,
                  "命令输入",
                  "支持自动补全，按 Ctrl/Cmd + Enter 执行",
                )}
                variant="borderless"
                style={cardStyle}
                styles={compactCardStyles}
              >
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <Text strong>诊断命令</Text>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      输入 Arthas/诊断命令，例如 thread -n 5、dashboard、jvm；也可以从下方模板一键回填。
                    </Paragraph>
                    <div
                      data-jvm-diagnostic-command-editor-shell="true"
                      style={commandEditorShellStyle(darkMode)}
                    >
                      <Editor
                        beforeMount={handleCommandEditorBeforeMount}
                        height={180}
                        language={JVM_DIAGNOSTIC_EDITOR_LANGUAGE}
                        theme={
                          darkMode ? "transparent-dark" : "transparent-light"
                        }
                        value={draft.command}
                        onMount={handleCommandEditorMount}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          automaticLayout: true,
                          scrollBeyondLastLine: false,
                          wordWrap: "on",
                          quickSuggestions: {
                            other: true,
                            comments: false,
                            strings: true,
                          },
                          suggestOnTriggerCharacters: true,
                          lineNumbers: "off",
                          folding: false,
                          glyphMargin: false,
                          renderLineHighlight: "all",
                          roundedSelection: true,
                        }}
                        onChange={(value) =>
                          setDraft(tab.id, {
                            command: value || "",
                            source: "manual",
                          })
                        }
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <Text strong>诊断原因（可选）</Text>
                    <Input
                      value={draft.reason || ""}
                      placeholder="例如：排查 CPU 飙高、确认线程阻塞、定位慢方法"
                      onChange={(event) =>
                        setDraft(tab.id, { reason: event.target.value })
                      }
                    />
                    <Text type="secondary">
                      用于审计记录和 AI 上下文理解，不会作为 Arthas 命令发送到目标 JVM。
                    </Text>
                  </div>
                </div>
              </Card>

              <Card
                title={renderCardTitle(<ToolOutlined />, "命令模板")}
                variant="borderless"
                style={cardStyle}
                styles={compactCardStyles}
              >
                <JVMCommandPresetBar
                  onSelectPreset={(preset) =>
                    setDraft(tab.id, {
                      command: preset.command,
                      reason: preset.description,
                      source: "manual",
                    })
                  }
                />
              </Card>
            </>
          )}

          {hasSession || chunks.length ? (
            <Card
              title={renderCardTitle(
                <PlayCircleOutlined />,
                "实时输出",
                "按后端事件流追加显示",
              )}
              variant="borderless"
              style={cardStyle}
              styles={compactCardStyles}
            >
              <JVMDiagnosticOutput chunks={chunks} maxHeight={320} />
            </Card>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <Card
            title={renderCardTitle(
              <ToolOutlined />,
              "会话与能力",
              "当前通道、权限与快捷维护",
            )}
            variant="borderless"
            style={cardStyle}
            styles={compactCardStyles}
          >
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 14,
                  borderRadius: 16,
                  background: mutedPanelBg,
                }}
              >
                <Space size={6} wrap>
                  <Tag color={hasSession ? "green" : "default"}>
                    {hasSession ? "会话已建立" : "未建会话"}
                  </Tag>
                  <Tag>{formatJVMDiagnosticTransportLabel(diagnosticTransport)}</Tag>
                  <Tag color={commandRunning ? "processing" : "green"}>
                    {commandRunning ? "命令执行中" : "空闲"}
                  </Tag>
                </Space>
                {effectiveSession?.sessionId ? (
                  <Text
                    code
                    copyable
                    style={{ whiteSpace: "normal", wordBreak: "break-all" }}
                  >
                    {effectiveSession.sessionId}
                  </Text>
                ) : (
                  <Text type="secondary">创建会话后会在这里显示会话 ID。</Text>
                )}
              </div>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                检查能力不会执行命令；执行命令前必须先建会话。审计历史展示最近命令记录，未建会话时也可能包含过去会话的记录。
              </Paragraph>
              <Space wrap>
                <Button
                  size="small"
                  icon={<ClearOutlined />}
                  onClick={() => clearOutput(tab.id)}
                >
                  清空输出
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => void loadAuditRecords()}
                  loading={historyLoading}
                >
                  刷新历史
                </Button>
              </Space>
              {renderCapabilityContent()}
            </Space>
          </Card>

          <Card
            title={renderCardTitle(
              <HistoryOutlined />,
              "审计历史",
              "最近命令和执行状态",
            )}
            variant="borderless"
            style={cardStyle}
            styles={compactCardStyles}
          >
            <JVMDiagnosticHistory
              session={effectiveSession}
              records={records}
              showSession={false}
              maxHeight={340}
            />
          </Card>
        </div>
      </div>
    </div>
  );
};

export default JVMDiagnosticConsole;
