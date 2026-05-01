import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Button,
  message,
  Checkbox,
  Select,
  Alert,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Table,
  Tag,
  Switch,
  Segmented,
} from "antd";
import {
  DatabaseOutlined,
  FileTextOutlined,
  CloudOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LinkOutlined,
  EditOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  ApiOutlined,
  ClusterOutlined,
  CodeOutlined,
  GatewayOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  getDbIcon,
  getDbDefaultColor,
  getDbIconLabel,
  DB_ICON_TYPES,
  PRESET_ICON_COLORS,
} from "./DatabaseIcons";
import { useStore } from "../store";
import { buildOverlayWorkbenchTheme } from "../utils/overlayWorkbenchTheme";
import {
  isMacLikePlatform,
  normalizeOpacityForPlatform,
  resolveAppearanceValues,
} from "../utils/appearance";
import {
  getConnectionConfigLayoutKindLabel,
  getConnectionConfigSectionCopy,
  getStoredSecretPlaceholder,
  normalizeConnectionSecretErrorMessage,
  resolveConnectionTestFailureFeedback,
  resolveConnectionConfigLayout,
  summarizeConnectionTestFailureMessage,
  type ConnectionConfigSectionKey,
} from "../utils/connectionModalPresentation";
import { resolveConnectionSecretDraft } from "../utils/connectionSecretDraft";
import { getCustomConnectionDsnValidationMessage } from "../utils/customConnectionDsn";
import { DEFAULT_SSL_MODE, LEGACY_COMPAT_SSL_MODE, resolveEffectiveSSLMode, sslModeRiskDescription } from "../utils/sslMode";
import {
  extractBackendCustomDataSourceDefinitions,
  loadCustomDataSources,
  mergeBackendCustomDataSourceDefinitions,
  resolveCustomDataSourceFromConfig,
  type CustomDataSource,
} from "../utils/customDataSources";
import {
  applyNoAutoCapAttributes,
  noAutoCapInputProps,
} from "../utils/inputAutoCap";
import {
  buildDefaultJVMConnectionValues,
  buildJVMConnectionConfig,
  hasUnsupportedJVMDiagnosticTransport,
  hasUnsupportedJVMEditableModes,
  JVM_EDITABLE_MODES,
  normalizeEditableJVMModes,
  resolveEditableJVMModeSelection,
} from "../utils/jvmConnectionConfig";
import { resolveJVMModeMeta } from "../utils/jvmRuntimePresentation";
import {
  DBGetDatabases,
  GetCustomDriverDefinitions,
  GetDriverStatusList,
  MongoDiscoverMembers,
  TestConnection,
  RedisConnect,
  SelectDatabaseFile,
  SelectSSHKeyFile,
  TestJVMConnection,
} from "@compat/javanaviApp";
import { ConnectionConfig, MongoMemberInfo, SavedConnection } from "../types";

const { Text } = Typography;
type EditableJVMMode = (typeof JVM_EDITABLE_MODES)[number];
type ChoiceCardOption = {
  value: string;
  label: string;
  description?: string;
};
type ConnectionInputMode = "url" | "target";
const MAX_URI_LENGTH = 4096;
const MAX_URI_HOSTS = 32;
const MAX_TIMEOUT_SECONDS = 3600;
const CONNECTION_MODAL_WIDTH = 960;
const CONNECTION_MODAL_BODY_HEIGHT = 620;
const STEP1_SIDEBAR_DIVIDER_DARK = "rgba(255, 255, 255, 0.16)";
const STEP1_SIDEBAR_DIVIDER_LIGHT = "rgba(0, 0, 0, 0.08)";
type ConnectionSecretKey =
  | "primaryPassword"
  | "sshPassword"
  | "proxyPassword"
  | "httpTunnelPassword"
  | "mysqlReplicaPassword"
  | "mongoReplicaPassword"
  | "opaqueURI"
  | "opaqueDSN";

type ConnectionSecretClearState = Record<ConnectionSecretKey, boolean>;

const createEmptyConnectionSecretClearState =
  (): ConnectionSecretClearState => ({
    primaryPassword: false,
    sshPassword: false,
    proxyPassword: false,
    httpTunnelPassword: false,
    mysqlReplicaPassword: false,
    mongoReplicaPassword: false,
    opaqueURI: false,
    opaqueDSN: false,
  });

const getDefaultPortByType = (type: string) => {
  switch (type) {
    case "jvm":
      return 9010;
    case "mysql":
      return 3306;
    case "doris":
    case "diros":
      return 9030;
    case "sphinx":
      return 9306;
    case "clickhouse":
      return 9000;
    case "postgres":
      return 5432;
    case "redis":
      return 6379;
    case "tdengine":
      return 6041;
    case "oracle":
      return 1521;
    case "dameng":
      return 5236;
    case "kingbase":
      return 54321;
    case "sqlserver":
      return 1433;
    case "mongodb":
      return 27017;
    case "highgo":
      return 5866;
    case "mariadb":
      return 3306;
    case "vastbase":
      return 5432;
    case "sqlite":
      return 0;
    case "duckdb":
      return 0;
    default:
      return 3306;
  }
};

const singleHostUriSchemesByType: Record<string, string[]> = {
  postgres: ["postgresql", "postgres"],
  clickhouse: ["clickhouse"],
  oracle: ["oracle"],
  sqlserver: ["sqlserver"],
  redis: ["redis"],
  tdengine: ["tdengine"],
  dameng: ["dameng", "dm"],
  kingbase: ["kingbase"],
  highgo: ["highgo"],
  vastbase: ["vastbase"],
};

const sslSupportedTypes = new Set([
  "mysql",
  "mariadb",
  "doris",
  "diros",
  "sphinx",
  "dameng",
  "clickhouse",
  "postgres",
  "sqlserver",
  "oracle",
  "kingbase",
  "highgo",
  "vastbase",
  "mongodb",
  "redis",
  "tdengine",
]);

const supportsSSLForType = (type: string) =>
  sslSupportedTypes.has(
    String(type || "")
      .trim()
      .toLowerCase(),
  );

const isFileDatabaseType = (type: string) =>
  type === "sqlite" || type === "duckdb";

type DriverStatusSnapshot = {
  type: string;
  name: string;
  connectable: boolean;
  defaultDriverType?: string;
  defaultDriverName?: string;
  driverOptions?: DriverOption[];
  message?: string;
};

type DriverOption = {
  driverType: string;
  driverName: string;
  available: boolean;
  connectable: boolean;
  default?: boolean;
  reusedRuntime?: boolean;
  runtimeOwnerType?: string;
  runtimeOwnerName?: string;
  driverClassName?: string;
  message?: string;
};

const normalizeDriverType = (value: string): string => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "postgresql") return "postgres";
  if (normalized === "doris") return "diros";
  return normalized;
};

const ConnectionModal: React.FC<{
  open: boolean;
  onClose: () => void;
  initialValues?: SavedConnection | null;
  onOpenDriverManager?: () => void;
  onSaved?: (savedConnection: SavedConnection) => void | Promise<void>;
}> = ({ open, onClose, initialValues, onOpenDriverManager, onSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [useSSL, setUseSSL] = useState(false);
  const [useSSH, setUseSSH] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [useHttpTunnel, setUseHttpTunnel] = useState(false);
  const [dbType, setDbType] = useState("mysql");
  const [step, setStep] = useState(1); // 1: Select Type, 2: Configure
  const [activeGroup, setActiveGroup] = useState(0); // Active category index in step 1
  const [activeConfigSection, setActiveConfigSection] = useState<
    "basic" | "network" | "appearance"
  >("basic");
  const [customIconType, setCustomIconType] = useState<string | undefined>(
    undefined,
  );
  const [customIconColor, setCustomIconColor] = useState<string | undefined>(
    undefined,
  );
  const [activeNetworkConfig, setActiveNetworkConfig] = useState<
    "ssl" | "ssh" | "proxy" | "httpTunnel"
  >("ssl");
  const [testResult, setTestResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [testErrorLogOpen, setTestErrorLogOpen] = useState(false);
  const [dbList, setDbList] = useState<string[]>([]);
  const [redisDbList, setRedisDbList] = useState<number[]>([]); // Redis databases 0-15
  const [mongoMembers, setMongoMembers] = useState<MongoMemberInfo[]>([]);
  const [discoveringMembers, setDiscoveringMembers] = useState(false);
  const [uriFeedback, setUriFeedback] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [typeSelectWarning, setTypeSelectWarning] = useState<{
    driverName: string;
    reason: string;
  } | null>(null);
  const [customDataSources, setCustomDataSources] = useState<CustomDataSource[]>(
    () => loadCustomDataSources(),
  );
  const [driverStatusMap, setDriverStatusMap] = useState<
    Record<string, DriverStatusSnapshot>
  >({});
  const [driverStatusLoaded, setDriverStatusLoaded] = useState(false);
  const [selectingDbFile, setSelectingDbFile] = useState(false);
  const [selectingSSHKey, setSelectingSSHKey] = useState(false);
  const [clearSecrets, setClearSecrets] = useState<ConnectionSecretClearState>(
    createEmptyConnectionSecretClearState,
  );
  const testInFlightRef = useRef(false);
  const testTimerRef = useRef<number | null>(null);
  const addConnection = useStore((state) => state.addConnection);
  const updateConnection = useStore((state) => state.updateConnection);
  const theme = useStore((state) => state.theme);
  const appearance = useStore((state) => state.appearance);
  const darkMode = theme === "dark";
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const effectiveOpacity = normalizeOpacityForPlatform(
    resolvedAppearance.opacity,
  );
  const disableLocalBackdropFilter = isMacLikePlatform();
  const mysqlTopology = Form.useWatch("mysqlTopology", form) || "single";
  const mongoTopology = Form.useWatch("mongoTopology", form) || "single";
  const mongoSrv = Form.useWatch("mongoSrv", form) || false;
  const redisTopology = Form.useWatch("redisTopology", form) || "single";
  const sslMode = Form.useWatch("sslMode", form) || DEFAULT_SSL_MODE;
  const proxyType = Form.useWatch("proxyType", form) || "socks5";
  const mongoReadPreference =
    Form.useWatch("mongoReadPreference", form) || "primary";
  const mongoAuthMechanism = Form.useWatch("mongoAuthMechanism", form) || "";
  const jvmEnvironment = Form.useWatch("jvmEnvironment", form) || "dev";
  const jvmAllowedModes = Form.useWatch("jvmAllowedModes", form);
  const jvmPreferredMode = Form.useWatch("jvmPreferredMode", form) || "jmx";
  const jvmDiagnosticEnabled =
    Form.useWatch("jvmDiagnosticEnabled", form) || false;
  const jvmDiagnosticTransport =
    Form.useWatch("jvmDiagnosticTransport", form) || "agent-bridge";
  const uriDraft = Form.useWatch("uri", form) || "";
  const connectionInputModeDraft =
    Form.useWatch("connectionInputMode", form) || "target";
  const connectionInputMode: ConnectionInputMode =
    connectionInputModeDraft === "url" ? "url" : "target";
  const customDataSourceIdDraft =
    Form.useWatch("customDataSourceId", form) || "";
  const normalizedJvmAllowedModes = useMemo(
    () => normalizeEditableJVMModes(jvmAllowedModes),
    [jvmAllowedModes],
  );
  const selectedCustomDataSource = useMemo(
    () =>
      customDataSources.find(
        (source) => source.id === String(customDataSourceIdDraft || ""),
      ),
    [customDataSourceIdDraft, customDataSources],
  );
  const selectedCustomDataSourceStatus = selectedCustomDataSource?.runtimeStatus;
  const selectedCustomDataSourceRepairHints =
    selectedCustomDataSourceStatus?.repairHints || [];
  const hasUnsupportedJvmModeSelection = useMemo(
    () =>
      hasUnsupportedJVMEditableModes({
        allowedModes: jvmAllowedModes,
        preferredMode: jvmPreferredMode,
      }),
    [jvmAllowedModes, jvmPreferredMode],
  );
  const isMySQLLike =
    dbType === "mysql" ||
    dbType === "mariadb" ||
    dbType === "doris" ||
    dbType === "diros" ||
    dbType === "sphinx";
  const isSSLType = supportsSSLForType(dbType);
  const sslHintText = isMySQLLike
    ? "当 MySQL/MariaDB/Doris/Sphinx 开启安全传输策略时，请启用 SSL；本地自签证书场景可先用 Preferred 或 Skip Verify。"
    : dbType === "dameng"
      ? "达梦驱动启用 SSL 需要客户端证书与私钥路径（sslCertPath / sslKeyPath）。"
      : dbType === "sqlserver"
        ? "SQL Server 推荐在生产环境使用 Required，并关闭 TrustServerCertificate。"
        : dbType === "mongodb"
          ? "MongoDB 可通过 TLS 保护连接，证书校验异常时可先用 Skip Verify 验证连通性。"
          : "建议优先使用 Required；仅在测试环境或自签证书场景使用 Skip Verify。";

  const getSectionBg = (darkHex: string) => {
    if (!darkMode) {
      return `rgba(245, 245, 245, ${Math.max(effectiveOpacity, 0.92)})`;
    }
    const hex = darkHex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(effectiveOpacity, 0.82)})`;
  };

  const step1SidebarDividerColor = darkMode
    ? STEP1_SIDEBAR_DIVIDER_DARK
    : STEP1_SIDEBAR_DIVIDER_LIGHT;
  const step1SidebarActiveBg = darkMode
    ? "rgba(246, 196, 83, 0.20)"
    : "#e6f4ff";
  const step1SidebarActiveColor = darkMode ? "#ffd666" : "#1677ff";
  const overlayTheme = useMemo(
    () =>
      buildOverlayWorkbenchTheme(darkMode, {
        disableBackdropFilter: disableLocalBackdropFilter,
      }),
    [darkMode, disableLocalBackdropFilter],
  );

  const tunnelSectionStyle: React.CSSProperties = {
    padding: "12px",
    background: getSectionBg("#2a2a2a"),
    borderRadius: 6,
    marginTop: 12,
    border: darkMode
      ? "1px solid rgba(255, 255, 255, 0.16)"
      : "1px solid rgba(0, 0, 0, 0.06)",
  };

  useEffect(() => {
    if (!open) return;
    const applyForConnectionModal = () => {
      document
        .querySelectorAll(
          ".connection-modal-wrap input, .connection-modal-wrap textarea",
        )
        .forEach(applyNoAutoCapAttributes);
    };
    applyForConnectionModal();
    const observer = new MutationObserver(() => {
      applyForConnectionModal();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [open]);

  const modalShellStyle = useMemo(
    () => ({
      background: overlayTheme.shellBg,
      border: overlayTheme.shellBorder,
      boxShadow: overlayTheme.shellShadow,
      backdropFilter: overlayTheme.shellBackdropFilter,
    }),
    [overlayTheme],
  );

  const modalInnerSectionStyle = useMemo(
    () => ({
      padding: 14,
      borderRadius: 14,
      border: overlayTheme.sectionBorder,
      background: overlayTheme.sectionBg,
    }),
    [overlayTheme],
  );

  const modalMutedTextStyle = useMemo(
    () => ({
      color: overlayTheme.mutedText,
      fontSize: 12,
      lineHeight: 1.6,
    }),
    [overlayTheme],
  );

  const renderStoredSecretControls = ({
    fieldName,
    clearKey,
    hasStoredSecret,
    clearLabel,
    description,
  }: {
    fieldName: string;
    clearKey: ConnectionSecretKey;
    hasStoredSecret?: boolean;
    clearLabel: string;
    description: string;
  }) => {
    if (!initialValues || !hasStoredSecret) {
      return null;
    }
    return (
      <Form.Item
        noStyle
        shouldUpdate={(prev, next) => prev[fieldName] !== next[fieldName]}
      >
        {({ getFieldValue }) => {
          const draftValue = getFieldValue(fieldName);
          const hasDraftValue = String(draftValue ?? "") !== "";
          const cardBorder = darkMode
            ? "1px solid rgba(255,255,255,0.12)"
            : "1px solid rgba(16,24,40,0.08)";
          const cardBg = darkMode
            ? "rgba(255,255,255,0.03)"
            : "rgba(16,24,40,0.03)";
          const effectiveChecked = clearSecrets[clearKey] && !hasDraftValue;
          return (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 12px",
                borderRadius: 10,
                border: cardBorder,
                background: cardBg,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: overlayTheme.mutedText,
                  lineHeight: 1.6,
                  marginBottom: 8,
                }}
              >
                {hasDraftValue
                  ? "已输入新值，保存时会替换当前已保存内容。"
                  : description}
              </div>
              <Checkbox
                checked={effectiveChecked}
                disabled={hasDraftValue}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setClearSecrets((prev) => ({ ...prev, [clearKey]: checked }));
                }}
              >
                {clearLabel}
              </Checkbox>
            </div>
          );
        }}
      </Form.Item>
    );
  };
  const renderConnectionModalTitle = (
    icon: React.ReactNode,
    title: string,
    description: string,
  ) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          background: overlayTheme.iconBg,
          color: overlayTheme.iconColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: overlayTheme.titleText,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 4,
            color: overlayTheme.mutedText,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );

  const getConnectionOptionCardStyle = (
    _enabled: boolean,
  ): React.CSSProperties => ({
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid transparent",
    background: darkMode ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.72)",
    boxShadow: darkMode
      ? "inset 0 0 0 1px rgba(255,255,255,0.028)"
      : "inset 0 0 0 1px rgba(16,24,40,0.03)",
    transition: "all 120ms ease",
  });

  const jvmSectionCardStyle = (): React.CSSProperties => ({
    ...modalInnerSectionStyle,
    padding: 16,
  });

  const renderJvmSectionHeader = (
    icon: React.ReactNode,
    title: string,
    description: string,
    badge?: React.ReactNode,
  ) => (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            background: darkMode
              ? "rgba(255,214,102,0.14)"
              : "rgba(22,119,255,0.10)",
            color: darkMode ? "#ffd666" : "#1677ff",
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: darkMode ? "#f5f7ff" : "#162033",
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {title}
          </div>
          <div style={{ ...modalMutedTextStyle, marginTop: 4 }}>
            {description}
          </div>
        </div>
      </div>
      {badge ? <div style={{ flexShrink: 0 }}>{badge}</div> : null}
    </div>
  );

  const configSectionCardStyle = (): React.CSSProperties => ({
    padding: 16,
    borderRadius: 16,
    border: darkMode
      ? "1px solid rgba(255,255,255,0.08)"
      : "1px solid rgba(16,24,40,0.08)",
    background: darkMode
      ? "rgba(255,255,255,0.025)"
      : "rgba(255,255,255,0.70)",
    boxShadow: darkMode
      ? "inset 0 1px 0 rgba(255,255,255,0.04)"
      : "inset 0 1px 0 rgba(255,255,255,0.90)",
  });

  const renderConfigSectionCard = ({
    sectionKey,
    icon,
    children,
    badge,
  }: {
    sectionKey: ConnectionConfigSectionKey;
    icon: React.ReactNode;
    children: React.ReactNode;
    badge?: React.ReactNode;
  }) => {
    const copy = getConnectionConfigSectionCopy(sectionKey);
    return (
      <div
        data-connection-config-section={sectionKey}
        style={configSectionCardStyle()}
      >
        {renderJvmSectionHeader(icon, copy.title, copy.description, badge)}
        {children}
      </div>
    );
  };

  const clearConnectionTestResultForChoice = () => {
    if (testResult) {
      setTestResult(null);
      setTestErrorLogOpen(false);
    }
  };

  const setChoiceFieldValue = (fieldName: string, value: string | boolean) => {
    clearConnectionTestResultForChoice();
    form.setFieldValue(fieldName, value);
    if (
      fieldName === "mongoTopology" ||
      fieldName === "mongoSrv" ||
      fieldName === "host" ||
      fieldName === "port"
    ) {
      setMongoMembers([]);
    }
    if (fieldName === "redisTopology") {
      const supportedDbs = Array.from({ length: 16 }, (_, i) => i);
      setRedisDbList(supportedDbs);
      const selectedDbsRaw = form.getFieldValue("includeRedisDatabases");
      const selectedDbs = Array.isArray(selectedDbsRaw)
        ? selectedDbsRaw.map((entry: any) => Number(entry))
        : [];
      const validDbs = selectedDbs
        .filter((entry: number) => Number.isFinite(entry))
        .map((entry: number) => Math.trunc(entry))
        .filter((entry: number) => supportedDbs.includes(entry));
      form.setFieldValue(
        "includeRedisDatabases",
        validDbs.length > 0 ? validDbs : undefined,
      );
    }
    if (fieldName === "proxyType") {
      const nextType = String(value || "socks5").toLowerCase();
      const currentPort = Number(form.getFieldValue("proxyPort") || 0);
      if (nextType === "http") {
        if (!currentPort || currentPort === 1080) {
          form.setFieldValue("proxyPort", 8080);
        }
      } else if (!currentPort || currentPort === 8080) {
        form.setFieldValue("proxyPort", 1080);
      }
    }
  };

  const handleConnectionInputModeChange = (value: string | number) => {
    const nextMode: ConnectionInputMode = value === "url" ? "url" : "target";
    clearConnectionTestResultForChoice();
    setUriFeedback(null);
    if (nextMode === "target") {
      form.setFieldsValue({
        connectionInputMode: nextMode,
        uri: "",
      });
      return;
    }
    form.setFieldValue("connectionInputMode", nextMode);
  };

  const refreshCustomDataSources = () => {
    void refreshCustomDataSourceDefinitions();
  };

  const refreshCustomDataSourceDefinitions = async () => {
    const latest = loadCustomDataSources();
    try {
      const res = await GetCustomDriverDefinitions("");
      if (!res?.success) {
        setCustomDataSources(latest);
        return latest;
      }
      const merged = mergeBackendCustomDataSourceDefinitions(
        latest,
        extractBackendCustomDataSourceDefinitions(res),
        { backendAuthoritative: true },
      );
      setCustomDataSources(merged);
      return merged;
    } catch {
      setCustomDataSources(latest);
      return latest;
    }
  };

  const handleCustomDataSourceSelect = (sourceId: string) => {
    const source = customDataSources.find((item) => item.id === sourceId);
    if (!source) {
      form.setFieldValue("customDataSourceId", undefined);
      return;
    }
    clearConnectionTestResultForChoice();
    const currentDsn = String(form.getFieldValue("dsn") || "").trim();
    const currentName = String(form.getFieldValue("name") || "").trim();
    const nextValues: Record<string, any> = {
      customDataSourceId: source.id,
      driver: source.driverType || source.driver || "",
      connectionInputMode: "target",
      uri: "",
    };
    if (!currentName) {
      nextValues.name = source.name;
    }
    if (source.dsnTemplate && !currentDsn && !initialValues?.hasOpaqueDSN) {
      nextValues.dsn = source.dsnTemplate;
    }
    form.setFieldsValue(nextValues);
  };

  const renderChoiceCards = ({
    fieldName,
    value,
    options,
    minWidth = 180,
    onSelect,
  }: {
    fieldName: string;
    value: string;
    options: ChoiceCardOption[];
    minWidth?: number;
    onSelect?: (value: string) => void;
  }) => (
    <>
      <Form.Item name={fieldName} hidden>
        <Input {...noAutoCapInputProps} />
      </Form.Item>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
          gap: 10,
        }}
      >
        {options.map((option) => {
          const active = String(value ?? "") === option.value;
          return (
            <button
              key={option.value || "empty"}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onSelect
                  ? onSelect(option.value)
                  : setChoiceFieldValue(fieldName, option.value)
              }
              style={{
                textAlign: "left",
                padding: "12px 14px",
                borderRadius: 14,
                border: active
                  ? darkMode
                    ? "1px solid rgba(255,214,102,0.42)"
                    : "1px solid rgba(22,119,255,0.36)"
                  : darkMode
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(16,24,40,0.08)",
                background: active
                  ? darkMode
                    ? "rgba(255,214,102,0.10)"
                    : "rgba(22,119,255,0.07)"
                  : darkMode
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(16,24,40,0.03)",
                color: darkMode ? "#f5f7ff" : "#162033",
                cursor: "pointer",
                transition: "all 120ms ease",
                boxShadow: active
                  ? darkMode
                    ? "0 0 0 2px rgba(255,214,102,0.10)"
                    : "0 0 0 2px rgba(22,119,255,0.08)"
                  : "none",
              }}
            >
              <Space size={8} wrap>
                <Text strong>{option.label}</Text>
                {active ? <Tag color="blue">当前</Tag> : null}
              </Space>
              {option.description ? (
                <div style={{ ...modalMutedTextStyle, marginTop: 6 }}>
                  {option.description}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </>
  );

  const applyJvmModeSelection = (
    nextModes: EditableJVMMode[],
    preferredMode?: EditableJVMMode,
  ) => {
    const normalizedModes = normalizeEditableJVMModes(nextModes);
    const resolvedModes = normalizedModes.length ? normalizedModes : ["jmx"];
    const resolvedPreferred =
      preferredMode && resolvedModes.includes(preferredMode)
        ? preferredMode
        : resolvedModes.includes(jvmPreferredMode as EditableJVMMode)
          ? (jvmPreferredMode as EditableJVMMode)
          : resolvedModes[0];
    form.setFieldsValue({
      jvmAllowedModes: resolvedModes,
      jvmPreferredMode: resolvedPreferred,
      jvmEndpointEnabled: resolvedModes.includes("endpoint"),
      jvmAgentEnabled: resolvedModes.includes("agent"),
    });
  };

  const handleJvmModeCardSelect = (mode: EditableJVMMode) => {
    const enabled = normalizedJvmAllowedModes.includes(mode);
    applyJvmModeSelection(
      enabled ? normalizedJvmAllowedModes : [...normalizedJvmAllowedModes, mode],
      mode,
    );
  };

  const handleJvmModeToggle = (
    mode: EditableJVMMode,
    event: React.MouseEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    const enabled = normalizedJvmAllowedModes.includes(mode);
    if (!enabled) {
      applyJvmModeSelection([...normalizedJvmAllowedModes, mode], mode);
      return;
    }
    if (normalizedJvmAllowedModes.length <= 1) {
      return;
    }
    const nextModes = normalizedJvmAllowedModes.filter((item) => item !== mode);
    applyJvmModeSelection(nextModes, nextModes[0]);
  };

  const fetchDriverStatusMap = async (): Promise<
    Record<string, DriverStatusSnapshot>
  > => {
    const result: Record<string, DriverStatusSnapshot> = {};
    const res = await GetDriverStatusList("", "");
    if (!res?.success) {
      return result;
    }
    const data = (res?.data || {}) as any;
    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    drivers.forEach((item: any) => {
      const type = normalizeDriverType(String(item.type || "").trim());
      if (!type) return;
      result[type] = {
        type,
        name: String(item.name || item.type || type).trim(),
        connectable: !!item.connectable,
        defaultDriverType:
          normalizeDriverType(String(item.defaultDriverType || "").trim()) ||
          undefined,
        defaultDriverName:
          String(item.defaultDriverName || "").trim() || undefined,
        driverOptions: Array.isArray(item.driverOptions)
          ? item.driverOptions
              .map((option: any) => {
                const driverType = normalizeDriverType(
                  String(option.driverType || "").trim(),
                );
                if (!driverType) {
                  return null;
                }
                return {
                  driverType,
                  driverName: String(
                    option.driverName || option.driverType || driverType,
                  ).trim(),
                  available: !!option.available,
                  connectable: !!option.connectable,
                  default: !!option.default,
                  reusedRuntime: !!option.reusedRuntime,
                  runtimeOwnerType:
                    String(option.runtimeOwnerType || "").trim() || undefined,
                  runtimeOwnerName:
                    String(option.runtimeOwnerName || "").trim() || undefined,
                  driverClassName:
                    String(option.driverClassName || "").trim() || undefined,
                  message: String(option.message || "").trim() || undefined,
                } as DriverOption;
              })
              .filter((option: DriverOption | null): option is DriverOption =>
                Boolean(option),
              )
          : undefined,
        message: String(item.message || "").trim() || undefined,
      };
    });
    return result;
  };

  const refreshDriverStatus = async () => {
    try {
      const next = await fetchDriverStatusMap();
      setDriverStatusMap(next);
    } catch {
      setDriverStatusMap({});
    } finally {
      setDriverStatusLoaded(true);
    }
  };

  const resolveDriverUnavailableReason = async (
    type: string,
  ): Promise<string> => {
    const normalized = normalizeDriverType(type);
    if (!normalized || normalized === "custom") {
      return "";
    }
    let snapshot = driverStatusMap;
    if (!snapshot[normalized]) {
      snapshot = await fetchDriverStatusMap();
      setDriverStatusMap(snapshot);
    }
    const status = snapshot[normalized];
    if (!status || status.connectable) {
      return "";
    }
    return (
      status.message ||
      `${status.name || normalized} 驱动未安装启用，请先在驱动管理中安装`
    );
  };

  const promptInstallDriver = (driverType: string, reason: string) => {
    const normalized = normalizeDriverType(driverType);
    const snapshot = driverStatusMap[normalized];
    const driverName = snapshot?.name || normalized || "当前";
    Modal.confirm({
      title: `${driverName} 驱动不可用`,
      content: reason || `${driverName} 驱动未安装启用，请先在驱动管理中安装`,
      okText: "去驱动管理安装",
      cancelText: "取消",
      onOk: () => {
        onOpenDriverManager?.();
      },
    });
  };

  const parseHostPort = (
    raw: string,
    defaultPort: number,
  ): { host: string; port: number } | null => {
    const text = String(raw || "").trim();
    if (!text) {
      return null;
    }
    if (text.startsWith("[")) {
      const closingBracket = text.indexOf("]");
      if (closingBracket > 0) {
        const host = text.slice(1, closingBracket).trim();
        const portText = text
          .slice(closingBracket + 1)
          .trim()
          .replace(/^:/, "");
        const parsedPort = Number(portText);
        return {
          host: host || "localhost",
          port:
            Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
              ? parsedPort
              : defaultPort,
        };
      }
    }

    const colonCount = (text.match(/:/g) || []).length;
    if (colonCount === 1) {
      const splitIndex = text.lastIndexOf(":");
      const host = text.slice(0, splitIndex).trim();
      const portText = text.slice(splitIndex + 1).trim();
      const parsedPort = Number(portText);
      return {
        host: host || "localhost",
        port:
          Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
            ? parsedPort
            : defaultPort,
      };
    }

    return { host: text, port: defaultPort };
  };

  const toAddress = (host: string, port: number, defaultPort: number) => {
    const safeHost = String(host || "").trim() || "localhost";
    const safePort =
      Number.isFinite(Number(port)) && Number(port) > 0
        ? Number(port)
        : defaultPort;
    return `${safeHost}:${safePort}`;
  };

  const normalizeAddressList = (
    rawList: unknown,
    defaultPort: number,
  ): string[] => {
    const list = Array.isArray(rawList) ? rawList : [];
    const seen = new Set<string>();
    const result: string[] = [];
    list.forEach((entry) => {
      const parsed = parseHostPort(String(entry || ""), defaultPort);
      if (!parsed) {
        return;
      }
      const normalized = toAddress(parsed.host, parsed.port, defaultPort);
      if (seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      result.push(normalized);
    });
    return result;
  };

  const isValidUriHostEntry = (entry: string): boolean => {
    const text = String(entry || "").trim();
    if (!text) return false;
    if (text.length > 255) return false;
    // 拒绝明显的 DSN 片段或路径/空白，避免把非 URI 主机段误判为合法地址。
    if (/[()\\/\s]/.test(text)) return false;
    return true;
  };

  const normalizeMongoSrvHostList = (
    rawList: unknown,
    defaultPort: number,
  ): string[] => {
    const list = Array.isArray(rawList) ? rawList : [];
    const seen = new Set<string>();
    const result: string[] = [];
    list.forEach((entry) => {
      const parsed = parseHostPort(String(entry || ""), defaultPort);
      if (!parsed?.host) {
        return;
      }
      const host = String(parsed.host).trim();
      if (!host || seen.has(host)) {
        return;
      }
      seen.add(host);
      result.push(host);
    });
    return result;
  };

  const safeDecode = (text: string) => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  };

  const normalizeFileDbPath = (rawPath: string): string => {
    let pathText = String(rawPath || "").trim();
    if (!pathText) {
      return "";
    }
    // 兼容 sqlite:///C:/... 或 sqlite:///C:\... 解析后多出的前导斜杠。
    if (/^\/[a-zA-Z]:[\\/]/.test(pathText)) {
      pathText = pathText.slice(1);
    }
    // 兼容历史版本把 Windows 文件路径误拼成 :3306:3306。
    const legacyMatch = pathText.match(/^([a-zA-Z]:[\\/].*?)(?::\d+)+$/);
    if (legacyMatch?.[1]) {
      return legacyMatch[1];
    }
    return pathText;
  };

  const normalizeConnectionUriForParsing = (uriText: string, type: string) => {
    const trimmed = String(uriText || "").trim();
    if (!trimmed) {
      return "";
    }
    const normalizedType = String(type || "").trim().toLowerCase();

    if (/^jdbc:sqlserver:\/\//i.test(trimmed)) {
      const body = trimmed.replace(/^jdbc:sqlserver:\/\//i, "");
      const [targetText, ...rawParamParts] = body.split(";");
      const params = new URLSearchParams();
      rawParamParts.forEach((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex <= 0) {
          return;
        }
        const key = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();
        if (!key) {
          return;
        }
        const normalizedKey =
          key.toLowerCase() === "databasename" ? "database" : key;
        params.set(normalizedKey, value);
      });
      const databaseName = params.get("database") || "";
      params.delete("database");
      const query = params.toString();
      return `sqlserver://${targetText.trim()}${databaseName ? `/${encodeURIComponent(databaseName)}` : ""}${query ? `?${query}` : ""}`;
    }

    if (normalizedType === "oracle") {
      const oracleServiceMatch = trimmed.match(
        /^jdbc:oracle:thin:@\/\/([^/]+)\/(.+)$/i,
      );
      if (oracleServiceMatch) {
        return `oracle://${oracleServiceMatch[1]}/${oracleServiceMatch[2]}`;
      }
      const oracleSidMatch = trimmed.match(
        /^jdbc:oracle:thin:@([^:/]+)(?::(\d+))?:(.+)$/i,
      );
      if (oracleSidMatch) {
        return `oracle://${oracleSidMatch[1]}:${oracleSidMatch[2] || getDefaultPortByType("oracle")}/${oracleSidMatch[3]}`;
      }
    }

    return trimmed.replace(/^jdbc:/i, "");
  };

  const parseMultiHostUri = (uriText: string, expectedScheme: string) => {
    const prefix = `${expectedScheme}://`;
    if (!uriText.toLowerCase().startsWith(prefix)) {
      return null;
    }
    let rest = uriText.slice(prefix.length);
    const hashIndex = rest.indexOf("#");
    if (hashIndex >= 0) {
      rest = rest.slice(0, hashIndex);
    }
    let queryText = "";
    const queryIndex = rest.indexOf("?");
    if (queryIndex >= 0) {
      queryText = rest.slice(queryIndex + 1);
      rest = rest.slice(0, queryIndex);
    }

    let pathText = "";
    const slashIndex = rest.indexOf("/");
    if (slashIndex >= 0) {
      pathText = rest.slice(slashIndex + 1);
      rest = rest.slice(0, slashIndex);
    }

    let hostText = rest;
    let username = "";
    let password = "";
    const atIndex = rest.lastIndexOf("@");
    if (atIndex >= 0) {
      const userInfo = rest.slice(0, atIndex);
      hostText = rest.slice(atIndex + 1);
      const colonIndex = userInfo.indexOf(":");
      if (colonIndex >= 0) {
        username = safeDecode(userInfo.slice(0, colonIndex));
        password = safeDecode(userInfo.slice(colonIndex + 1));
      } else {
        username = safeDecode(userInfo);
      }
    }

    const hosts = hostText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return {
      username,
      password,
      hosts,
      database: safeDecode(pathText),
      params: new URLSearchParams(queryText),
    };
  };

  const parseSingleHostUri = (
    uriText: string,
    expectedSchemes: string[],
    defaultPort: number,
  ): {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    params: URLSearchParams;
  } | null => {
    let parsed: ReturnType<typeof parseMultiHostUri> | null = null;
    for (const scheme of expectedSchemes) {
      parsed = parseMultiHostUri(uriText, scheme);
      if (parsed) {
        break;
      }
    }
    if (!parsed) {
      return null;
    }
    if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
      return null;
    }
    if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
      return null;
    }
    const hostList = normalizeAddressList(parsed.hosts, defaultPort);
    if (!hostList.length) {
      return null;
    }
    const primary = parseHostPort(
      hostList[0] || `localhost:${defaultPort}`,
      defaultPort,
    );
    return {
      host: primary?.host || "localhost",
      port: primary?.port || defaultPort,
      username: parsed.username,
      password: parsed.password,
      database: parsed.database || "",
      params: parsed.params,
    };
  };

  const parseUriToValues = (
    uriText: string,
    type: string,
  ): Record<string, any> | null => {
    const trimmedUri = normalizeConnectionUriForParsing(uriText, type);
    if (!trimmedUri) {
      return null;
    }
    if (trimmedUri.length > MAX_URI_LENGTH) {
      return null;
    }

    if (
      type === "mysql" ||
      type === "mariadb" ||
      type === "diros" ||
      type === "sphinx"
    ) {
      const mysqlDefaultPort = getDefaultPortByType(type);
      const parsed =
        parseMultiHostUri(trimmedUri, "mysql") ||
        parseMultiHostUri(trimmedUri, "mariadb") ||
        parseMultiHostUri(trimmedUri, "diros") ||
        parseMultiHostUri(trimmedUri, "doris") ||
        parseMultiHostUri(trimmedUri, "sphinx");
      if (!parsed) {
        return null;
      }
      if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
        return null;
      }
      if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
        return null;
      }
      const hostList = normalizeAddressList(parsed.hosts, mysqlDefaultPort);
      if (!hostList.length) {
        return null;
      }
      const primary = parseHostPort(
        hostList[0] || `localhost:${mysqlDefaultPort}`,
        mysqlDefaultPort,
      );
      const timeoutValue = Number(parsed.params.get("timeout"));
      const topology = String(
        parsed.params.get("topology") || "",
      ).toLowerCase();
      const tlsValue = String(parsed.params.get("tls") || "")
        .trim()
        .toLowerCase();
      const sslMode =
        tlsValue === "true"
          ? "required"
          : tlsValue === "skip-verify"
            ? "skip-verify"
            : tlsValue === "preferred"
              ? "preferred"
              : "disable";
      return {
        host: primary?.host || "localhost",
        port: primary?.port || mysqlDefaultPort,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database || "",
        useSSL: sslMode !== "disable",
        sslMode,
        mysqlTopology:
          hostList.length > 1 || topology === "replica" ? "replica" : "single",
        mysqlReplicaHosts: hostList.slice(1),
        timeout:
          Number.isFinite(timeoutValue) && timeoutValue > 0
            ? Math.min(3600, Math.trunc(timeoutValue))
            : undefined,
      };
    }

    if (isFileDatabaseType(type)) {
      const rawPath = trimmedUri
        .replace(/^sqlite:(?:\/\/)?/i, "")
        .replace(/^duckdb:(?:\/\/)?/i, "")
        .trim();
      if (!rawPath) {
        return null;
      }
      return { host: normalizeFileDbPath(safeDecode(rawPath)) };
    }

    if (type === "redis") {
      const parsed =
        parseMultiHostUri(trimmedUri, "redis") ||
        parseMultiHostUri(trimmedUri, "rediss");
      if (!parsed) {
        return null;
      }
      if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
        return null;
      }
      if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
        return null;
      }
      const hostList = normalizeAddressList(parsed.hosts, 6379);
      if (!hostList.length) {
        return null;
      }
      const primary = parseHostPort(hostList[0] || "localhost:6379", 6379);
      const topologyParam = String(
        parsed.params.get("topology") || "",
      ).toLowerCase();
      const dbText = String(parsed.database || "")
        .trim()
        .replace(/^\//, "");
      const dbIndex = Number(dbText);
      const isRediss = trimmedUri.toLowerCase().startsWith("rediss://");
      const skipVerifyText = String(parsed.params.get("skip_verify") || "")
        .trim()
        .toLowerCase();
      const skipVerify =
        skipVerifyText === "1" ||
        skipVerifyText === "true" ||
        skipVerifyText === "yes" ||
        skipVerifyText === "on";
      return {
        host: primary?.host || "localhost",
        port: primary?.port || 6379,
        user: parsed.username || "",
        password: parsed.password || "",
        useSSL: isRediss,
        sslMode: isRediss
          ? skipVerify
            ? "skip-verify"
            : "required"
          : "disable",
        redisTopology:
          hostList.length > 1 || topologyParam === "cluster"
            ? "cluster"
            : "single",
        redisHosts: hostList.slice(1),
        redisDB:
          Number.isFinite(dbIndex) && dbIndex >= 0 && dbIndex <= 15
            ? Math.trunc(dbIndex)
            : 0,
      };
    }

    if (type === "mongodb") {
      const parsed =
        parseMultiHostUri(trimmedUri, "mongodb") ||
        parseMultiHostUri(trimmedUri, "mongodb+srv");
      if (!parsed) {
        return null;
      }
      if (!parsed.hosts.length || parsed.hosts.length > MAX_URI_HOSTS) {
        return null;
      }
      if (parsed.hosts.some((entry) => !isValidUriHostEntry(entry))) {
        return null;
      }
      const isSrv = trimmedUri.toLowerCase().startsWith("mongodb+srv://");
      const hostList = isSrv
        ? normalizeMongoSrvHostList(parsed.hosts, 27017)
        : normalizeAddressList(parsed.hosts, 27017);
      if (!hostList.length) {
        return null;
      }
      const primary = isSrv
        ? { host: hostList[0] || "localhost", port: 27017 }
        : parseHostPort(hostList[0] || "localhost:27017", 27017);
      const timeoutMs = Number(
        parsed.params.get("connectTimeoutMS") ||
          parsed.params.get("serverSelectionTimeoutMS"),
      );
      const tlsText = String(
        parsed.params.get("tls") || parsed.params.get("ssl") || "",
      )
        .trim()
        .toLowerCase();
      const tlsInsecureText = String(
        parsed.params.get("tlsInsecure") ||
          parsed.params.get("sslInsecure") ||
          "",
      )
        .trim()
        .toLowerCase();
      const tlsEnabled =
        tlsText === "1" ||
        tlsText === "true" ||
        tlsText === "yes" ||
        tlsText === "on";
      const tlsInsecure =
        tlsInsecureText === "1" ||
        tlsInsecureText === "true" ||
        tlsInsecureText === "yes" ||
        tlsInsecureText === "on";
      return {
        host: primary?.host || "localhost",
        port: primary?.port || 27017,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database || "",
        useSSL: tlsEnabled,
        sslMode: tlsEnabled
          ? tlsInsecure
            ? "skip-verify"
            : "required"
          : "disable",
        mongoTopology:
          hostList.length > 1 || !!parsed.params.get("replicaSet")
            ? "replica"
            : "single",
        mongoHosts: hostList.slice(1),
        mongoSrv: isSrv,
        mongoReplicaSet: parsed.params.get("replicaSet") || "",
        mongoAuthSource: parsed.params.get("authSource") || "",
        mongoReadPreference: parsed.params.get("readPreference") || "primary",
        mongoAuthMechanism: parsed.params.get("authMechanism") || "",
        timeout:
          Number.isFinite(timeoutMs) && timeoutMs > 0
            ? Math.min(MAX_TIMEOUT_SECONDS, Math.ceil(timeoutMs / 1000))
            : undefined,
        savePassword: true,
      };
    }

    const singleHostSchemes = singleHostUriSchemesByType[type];
    if (singleHostSchemes && singleHostSchemes.length > 0) {
      const parsed = parseSingleHostUri(
        trimmedUri,
        singleHostSchemes,
        getDefaultPortByType(type),
      );
      if (!parsed) {
        return null;
      }
      if (type === "oracle" && !String(parsed.database || "").trim()) {
        // Oracle 需要显式 service name，避免 URI 解析后放过必填校验。
        return null;
      }
      const parsedValues: Record<string, any> = {
        host: parsed.host,
        port: parsed.port,
        user: parsed.username,
        password: parsed.password,
        database: parsed.database,
      };

      if (supportsSSLForType(type)) {
        const normalizeBool = (raw: unknown) => {
          const text = String(raw ?? "")
            .trim()
            .toLowerCase();
          return (
            text === "1" || text === "true" || text === "yes" || text === "on"
          );
        };
        if (
          type === "postgres" ||
          type === "kingbase" ||
          type === "highgo" ||
          type === "vastbase"
        ) {
          const sslMode = String(parsed.params.get("sslmode") || "")
            .trim()
            .toLowerCase();
          if (sslMode) {
            parsedValues.useSSL = sslMode !== "disable" && sslMode !== "false";
            parsedValues.sslMode =
              sslMode === "disable" || sslMode === "false"
                ? "disable"
                : "required";
          }
        } else if (type === "sqlserver") {
          const encrypt = String(parsed.params.get("encrypt") || "")
            .trim()
            .toLowerCase();
          const trust = String(
            parsed.params.get("TrustServerCertificate") ||
              parsed.params.get("trustservercertificate") ||
              "",
          )
            .trim()
            .toLowerCase();
          const encrypted =
            encrypt === "true" ||
            encrypt === "mandatory" ||
            encrypt === "yes" ||
            encrypt === "1" ||
            encrypt === "strict";
          if (encrypted) {
            parsedValues.useSSL = true;
            parsedValues.sslMode =
              trust === "true" || trust === "1" || trust === "yes"
                ? "skip-verify"
                : "required";
          } else if (encrypt) {
            parsedValues.useSSL = false;
            parsedValues.sslMode = "disable";
          }
        } else if (type === "clickhouse") {
          const secure = String(
            parsed.params.get("secure") || parsed.params.get("tls") || "",
          )
            .trim()
            .toLowerCase();
          const skipVerify = normalizeBool(parsed.params.get("skip_verify"));
          if (secure) {
            parsedValues.useSSL = normalizeBool(secure);
            parsedValues.sslMode = skipVerify
              ? "skip-verify"
              : parsedValues.useSSL
                ? "required"
                : "disable";
          }
        } else if (type === "dameng") {
          const certPath = String(
            parsed.params.get("SSL_CERT_PATH") ||
              parsed.params.get("ssl_cert_path") ||
              parsed.params.get("sslCertPath") ||
              "",
          ).trim();
          const keyPath = String(
            parsed.params.get("SSL_KEY_PATH") ||
              parsed.params.get("ssl_key_path") ||
              parsed.params.get("sslKeyPath") ||
              "",
          ).trim();
          parsedValues.sslCertPath = certPath;
          parsedValues.sslKeyPath = keyPath;
          if (certPath || keyPath) {
            parsedValues.useSSL = true;
            parsedValues.sslMode = "required";
          }
        } else if (type === "oracle") {
          const ssl = String(
            parsed.params.get("SSL") || parsed.params.get("ssl") || "",
          )
            .trim()
            .toLowerCase();
          const sslVerify = String(
            parsed.params.get("SSL VERIFY") ||
              parsed.params.get("ssl verify") ||
              parsed.params.get("SSL_VERIFY") ||
              parsed.params.get("ssl_verify") ||
              "",
          )
            .trim()
            .toLowerCase();
          if (ssl) {
            parsedValues.useSSL = normalizeBool(ssl);
            if (!parsedValues.useSSL) {
              parsedValues.sslMode = "disable";
            } else {
              parsedValues.sslMode = normalizeBool(sslVerify || "true")
                ? "required"
                : "skip-verify";
            }
          }
        } else if (type === "tdengine") {
          const protocol = String(parsed.params.get("protocol") || "")
            .trim()
            .toLowerCase();
          const skipVerify = normalizeBool(parsed.params.get("skip_verify"));
          if (protocol === "wss") {
            parsedValues.useSSL = true;
            parsedValues.sslMode = skipVerify ? "skip-verify" : "required";
          } else if (protocol === "ws") {
            parsedValues.useSSL = false;
            parsedValues.sslMode = "disable";
          }
        }
      }
      return parsedValues;
    }

    return null;
  };

  const createUriAwareRequiredRule =
    (messageText: string, validateValue?: (value: unknown) => boolean) =>
    ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
      validator(_: unknown, value: unknown) {
        const inputMode =
          String(getFieldValue("connectionInputMode") || "target") === "url"
            ? "url"
            : "target";
        if (inputMode === "url") {
          return Promise.resolve();
        }
        const valid = validateValue
          ? validateValue(value)
          : String(value ?? "").trim() !== "";
        return valid
          ? Promise.resolve()
          : Promise.reject(new Error(messageText));
      },
    });

  const createConnectionUriRule =
    () =>
    ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
      validator(_: unknown, value: unknown) {
        const inputMode =
          String(getFieldValue("connectionInputMode") || "target") === "url"
            ? "url"
            : "target";
        if (inputMode !== "url") {
          return Promise.resolve();
        }
        const uriText = String(value || "").trim();
        const keepsStoredUri =
          !!initialValues?.hasOpaqueURI && !clearSecrets.opaqueURI;
        if (!uriText) {
          return keepsStoredUri
            ? Promise.resolve()
            : Promise.reject(
                new Error("请输入连接 URL，或切换到目标地址填写"),
              );
        }
        const type = String(getFieldValue("type") || dbType)
          .trim()
          .toLowerCase();
        return parseUriToValues(uriText, type)
          ? Promise.resolve()
          : Promise.reject(
              new Error("连接 URL 格式不支持；请检查 URL 或切换到目标地址填写"),
            );
      },
    });

  const createCustomDsnRule = () => ({
    validator(_: unknown, value: unknown) {
      const validationMessage = getCustomConnectionDsnValidationMessage({
        dsnInput: value,
        hasStoredSecret: initialValues?.hasOpaqueDSN,
        clearStoredSecret: clearSecrets.opaqueDSN,
      });
      return validationMessage
        ? Promise.reject(new Error(validationMessage))
        : Promise.resolve();
    },
  });

  const getUriPlaceholder = () => {
    if (
      dbType === "mysql" ||
      dbType === "mariadb" ||
      dbType === "diros" ||
      dbType === "sphinx"
    ) {
      const defaultPort = getDefaultPortByType(dbType);
      const scheme = dbType === "diros" ? "doris" : "mysql";
      return `${scheme}://user:pass@127.0.0.1:${defaultPort},127.0.0.2:${defaultPort}/db_name?topology=replica`;
    }
    if (isFileDatabaseType(dbType)) {
      return dbType === "duckdb"
        ? "duckdb:///Users/name/demo.duckdb"
        : "sqlite:///Users/name/demo.sqlite";
    }
    if (dbType === "mongodb") {
      return "mongodb+srv://user:pass@cluster0.example.com/db_name?authSource=admin&authMechanism=SCRAM-SHA-256";
    }
    if (dbType === "clickhouse") {
      return "clickhouse://default:pass@127.0.0.1:9000/default";
    }
    if (dbType === "redis") {
      return "redis://:pass@127.0.0.1:6379,127.0.0.2:6379/0?topology=cluster";
    }
    if (dbType === "oracle") {
      return "oracle://user:pass@127.0.0.1:1521/ORCLPDB1";
    }
    return "例如: postgres://user:pass@127.0.0.1:5432/db_name";
  };

  const buildUriFromValues = (values: any) => {
    const type = String(values.type || "")
      .trim()
      .toLowerCase();
    const defaultPort = getDefaultPortByType(type);
    const host = String(values.host || "localhost").trim();
    const port = Number(values.port || defaultPort);
    const user = String(values.user || "").trim();
    const password = String(values.password || "");
    const database = String(values.database || "").trim();
    const timeout = Number(values.timeout || 30);
    const encodedAuth = user
      ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@`
      : "";

    if (
      type === "mysql" ||
      type === "mariadb" ||
      type === "diros" ||
      type === "sphinx"
    ) {
      const primary = toAddress(host, port, defaultPort);
      const replicas =
        values.mysqlTopology === "replica"
          ? normalizeAddressList(values.mysqlReplicaHosts, defaultPort)
          : [];
      const hosts = normalizeAddressList([primary, ...replicas], defaultPort);
      const params = new URLSearchParams();
      if (hosts.length > 1 || values.mysqlTopology === "replica") {
        params.set("topology", "replica");
      }
      if (values.useSSL) {
        const mode = String(values.sslMode || DEFAULT_SSL_MODE)
          .trim()
          .toLowerCase();
        if (mode === "required") {
          params.set("tls", "true");
        } else if (mode === "skip-verify") {
          params.set("tls", "skip-verify");
        } else {
          params.set("tls", "preferred");
        }
      }
      if (Number.isFinite(timeout) && timeout > 0) {
        params.set("timeout", String(timeout));
      }
      const dbPath = database ? `/${encodeURIComponent(database)}` : "/";
      const query = params.toString();
      const scheme = type === "diros" ? "doris" : "mysql";
      return `${scheme}://${encodedAuth}${hosts.join(",")}${dbPath}${query ? `?${query}` : ""}`;
    }

    if (type === "redis") {
      const primary = toAddress(host, port, 6379);
      const clusterHosts =
        values.redisTopology === "cluster"
          ? normalizeAddressList(values.redisHosts, 6379)
          : [];
      const hosts = normalizeAddressList([primary, ...clusterHosts], 6379);
      const params = new URLSearchParams();
      if (hosts.length > 1 || values.redisTopology === "cluster") {
        params.set("topology", "cluster");
      }
      const redisUser = String(values.user || "").trim();
      const redisPassword = String(values.password || "");
      let redisAuth = "";
      if (redisUser || redisPassword) {
        const encodedPassword = redisPassword
          ? encodeURIComponent(redisPassword)
          : "";
        redisAuth = redisUser
          ? `${encodeURIComponent(redisUser)}${redisPassword ? `:${encodedPassword}` : ""}@`
          : `:${encodedPassword}@`;
      }
      const redisDB = Number.isFinite(Number(values.redisDB))
        ? Math.max(0, Math.min(15, Math.trunc(Number(values.redisDB))))
        : 0;
      const dbPath = `/${redisDB}`;
      if (values.useSSL) {
        const mode = String(values.sslMode || DEFAULT_SSL_MODE)
          .trim()
          .toLowerCase();
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("skip_verify", "true");
        }
      }
      const query = params.toString();
      const scheme = values.useSSL ? "rediss" : "redis";
      return `${scheme}://${redisAuth}${hosts.join(",")}${dbPath}${query ? `?${query}` : ""}`;
    }

    if (isFileDatabaseType(type)) {
      const pathText = normalizeFileDbPath(String(values.host || "").trim());
      if (!pathText) {
        return `${type}://`;
      }
      return `${type}://${encodeURI(pathText)}`;
    }

    if (type === "mongodb") {
      const useSrv = !!values.mongoSrv;
      const primaryAddress = useSrv
        ? parseHostPort(host, 27017)?.host || host || "localhost"
        : toAddress(host, port, 27017);
      const extraNodes =
        values.mongoTopology === "replica"
          ? useSrv
            ? normalizeMongoSrvHostList(values.mongoHosts, 27017)
            : normalizeAddressList(values.mongoHosts, 27017)
          : [];
      const hosts = useSrv
        ? normalizeMongoSrvHostList([primaryAddress, ...extraNodes], 27017)
        : normalizeAddressList([primaryAddress, ...extraNodes], 27017);
      const scheme = useSrv ? "mongodb+srv" : "mongodb";
      const params = new URLSearchParams();
      const authSource = String(
        values.mongoAuthSource || database || "admin",
      ).trim();
      if (authSource) {
        params.set("authSource", authSource);
      }
      const replicaSet = String(values.mongoReplicaSet || "").trim();
      if (replicaSet) {
        params.set("replicaSet", replicaSet);
      }
      const readPreference = String(values.mongoReadPreference || "").trim();
      if (readPreference) {
        params.set("readPreference", readPreference);
      }
      const authMechanism = String(values.mongoAuthMechanism || "").trim();
      if (authMechanism) {
        params.set("authMechanism", authMechanism);
      }
      if (values.useSSL) {
        const mode = String(values.sslMode || DEFAULT_SSL_MODE)
          .trim()
          .toLowerCase();
        params.set("tls", "true");
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("tlsInsecure", "true");
        } else {
          params.delete("tlsInsecure");
        }
      }
      if (Number.isFinite(timeout) && timeout > 0) {
        params.set("connectTimeoutMS", String(timeout * 1000));
        params.set("serverSelectionTimeoutMS", String(timeout * 1000));
      }
      const dbPath = database ? `/${encodeURIComponent(database)}` : "/";
      const query = params.toString();
      return `${scheme}://${encodedAuth}${hosts.join(",")}${dbPath}${query ? `?${query}` : ""}`;
    }

    const scheme = type === "postgres" ? "postgresql" : type;
    const dbPath = database ? `/${encodeURIComponent(database)}` : "";
    const params = new URLSearchParams();
    if (supportsSSLForType(type) && values.useSSL) {
      const mode = String(values.sslMode || DEFAULT_SSL_MODE)
        .trim()
        .toLowerCase();
      if (
        type === "postgres" ||
        type === "kingbase" ||
        type === "highgo" ||
        type === "vastbase"
      ) {
        params.set("sslmode", "require");
      } else if (type === "sqlserver") {
        params.set("encrypt", "true");
        params.set(
          "TrustServerCertificate",
          mode === "skip-verify" || mode === "preferred" ? "true" : "false",
        );
      } else if (type === "clickhouse") {
        params.set("secure", "true");
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("skip_verify", "true");
        }
      } else if (type === "dameng") {
        const certPath = String(values.sslCertPath || "").trim();
        const keyPath = String(values.sslKeyPath || "").trim();
        if (certPath) params.set("SSL_CERT_PATH", certPath);
        if (keyPath) params.set("SSL_KEY_PATH", keyPath);
      } else if (type === "oracle") {
        params.set("SSL", "TRUE");
        params.set("SSL VERIFY", mode === "required" ? "TRUE" : "FALSE");
      } else if (type === "tdengine") {
        params.set("protocol", "wss");
        if (mode === "skip-verify" || mode === "preferred") {
          params.set("skip_verify", "true");
        }
      }
    } else if (supportsSSLForType(type)) {
      if (
        type === "postgres" ||
        type === "kingbase" ||
        type === "highgo" ||
        type === "vastbase"
      ) {
        params.set("sslmode", "disable");
      } else if (type === "sqlserver") {
        params.set("encrypt", "disable");
        params.set("TrustServerCertificate", "true");
      } else if (type === "tdengine") {
        params.set("protocol", "ws");
      }
    }
    const query = params.toString();
    return `${scheme}://${encodedAuth}${toAddress(host, port, defaultPort)}${dbPath}${query ? `?${query}` : ""}`;
  };

  const handleGenerateURI = () => {
    try {
      const values = form.getFieldsValue(true);
      const uri = buildUriFromValues(values);
      form.setFieldValue("uri", uri);
      setUriFeedback({ type: "success", message: "URI 已生成" });
    } catch {
      setUriFeedback({ type: "error", message: "生成 URI 失败" });
    }
  };

  const handleParseURI = () => {
    try {
      const uriText = String(form.getFieldValue("uri") || "").trim();
      const type = String(form.getFieldValue("type") || dbType)
        .trim()
        .toLowerCase();
      if (!uriText) {
        setUriFeedback({ type: "warning", message: "请先输入 URI" });
        return;
      }
      const parsedValues = parseUriToValues(uriText, type);
      if (!parsedValues) {
        setUriFeedback({
          type: "error",
          message: "当前 URI 与数据源类型不匹配，或 URI 格式不支持",
        });
        return;
      }
      form.setFieldsValue({ ...parsedValues, uri: uriText });
      if (testResult) {
        setTestResult(null);
      }
      setUriFeedback({ type: "success", message: "已根据 URI 回填连接参数" });
    } catch {
      setUriFeedback({
        type: "error",
        message: "URI 解析失败，请检查格式后重试",
      });
    }
  };

  const handleCopyURI = async () => {
    let uriText = String(form.getFieldValue("uri") || "").trim();
    if (!uriText) {
      const values = form.getFieldsValue(true);
      uriText = buildUriFromValues(values);
      form.setFieldValue("uri", uriText);
    }
    if (!uriText) {
      setUriFeedback({ type: "warning", message: "没有可复制的 URI" });
      return;
    }
    try {
      await navigator.clipboard.writeText(uriText);
      setUriFeedback({ type: "success", message: "URI 已复制" });
    } catch {
      setUriFeedback({ type: "error", message: "复制失败" });
    }
  };

  const handleSelectSSHKeyFile = async () => {
    if (selectingSSHKey) {
      return;
    }
    try {
      setSelectingSSHKey(true);
      const currentPath = String(form.getFieldValue("sshKeyPath") || "").trim();
      const res = await SelectSSHKeyFile(currentPath);
      if (res?.success) {
        const data = res.data || {};
        const selectedPath =
          typeof data === "string" ? data : String(data.path || "").trim();
        if (selectedPath) {
          form.setFieldValue("sshKeyPath", selectedPath);
        }
      } else if (res?.message !== "已取消") {
        message.error(`选择私钥文件失败: ${res?.message || "未知错误"}`);
      }
    } catch (e: any) {
      message.error(`选择私钥文件失败: ${e?.message || String(e)}`);
    } finally {
      setSelectingSSHKey(false);
    }
  };

  const handleSelectDatabaseFile = async () => {
    if (selectingDbFile) {
      return;
    }
    try {
      setSelectingDbFile(true);
      const currentPath = String(form.getFieldValue("host") || "").trim();
      const res = await SelectDatabaseFile(currentPath, dbType);
      if (res?.success) {
        const data = res.data || {};
        const selectedPath =
          typeof data === "string" ? data : String(data.path || "").trim();
        if (selectedPath) {
          form.setFieldValue("host", normalizeFileDbPath(selectedPath));
        }
      } else if (res?.message !== "已取消") {
        message.error(`选择数据库文件失败: ${res?.message || "未知错误"}`);
      }
    } catch (e: any) {
      message.error(`选择数据库文件失败: ${e?.message || String(e)}`);
    } finally {
      setSelectingDbFile(false);
    }
  };

  useEffect(() => {
    if (open) {
      setLoading(false);
      testInFlightRef.current = false;
      if (testTimerRef.current !== null) {
        window.clearTimeout(testTimerRef.current);
        testTimerRef.current = null;
      }
      setTestResult(null); // Reset test result
      setTestErrorLogOpen(false);
      setDbList([]);
      setRedisDbList([]);
      setMongoMembers([]);
      setUriFeedback(null);
      setCustomIconType(undefined);
      setCustomIconColor(undefined);
      setClearSecrets(createEmptyConnectionSecretClearState());
      setTypeSelectWarning(null);
      setDriverStatusLoaded(false);
      const latestCustomDataSources = loadCustomDataSources();
      setCustomDataSources(latestCustomDataSources);
      void refreshCustomDataSourceDefinitions();
      void refreshDriverStatus();
      if (initialValues) {
        // Edit mode: Go directly to step 2
        setStep(2);
        const config: any = initialValues.config || {};
        const configType = String(config.type || "mysql");
        const isJvmConfigType = configType === "jvm";
        const selectedInitialCustomDataSource =
          configType === "custom"
            ? resolveCustomDataSourceFromConfig(latestCustomDataSources, config)
            : undefined;
        const defaultPort = getDefaultPortByType(configType);
        const isFileDbConfigType = isFileDatabaseType(configType);
        const jvmDefaultValues = buildDefaultJVMConnectionValues();
        const normalizedHosts = isFileDbConfigType
          ? []
          : normalizeAddressList(config.hosts, defaultPort);
        const primaryAddress = isFileDbConfigType
          ? null
          : parseHostPort(
              normalizedHosts[0] ||
                toAddress(
                  config.host || "localhost",
                  Number(config.port || defaultPort),
                  defaultPort,
                ),
              defaultPort,
            );
        const primaryHost = isFileDbConfigType
          ? normalizeFileDbPath(String(config.host || ""))
          : primaryAddress?.host || String(config.host || "localhost");
        const primaryPort = isFileDbConfigType
          ? 0
          : primaryAddress?.port || Number(config.port || defaultPort);
        const mysqlReplicaHosts =
          configType === "mysql" ||
          configType === "mariadb" ||
          configType === "diros" ||
          configType === "sphinx"
            ? normalizedHosts.slice(1)
            : [];
        const mongoHosts =
          configType === "mongodb" ? normalizedHosts.slice(1) : [];
        const redisHosts =
          configType === "redis" ? normalizedHosts.slice(1) : [];
        const mysqlIsReplica =
          String(config.topology || "").toLowerCase() === "replica" ||
          mysqlReplicaHosts.length > 0;
        const mongoIsReplica =
          String(config.topology || "").toLowerCase() === "replica" ||
          mongoHosts.length > 0 ||
          !!config.replicaSet;
        const redisIsCluster =
          String(config.topology || "").toLowerCase() === "cluster" ||
          redisHosts.length > 0;
        const {
          allowedModes: resolvedJvmAllowedModes,
          preferredMode: resolvedJvmPreferredMode,
        } = resolveEditableJVMModeSelection({
          allowedModes: config.jvm?.allowedModes,
          preferredMode: config.jvm?.preferredMode,
        });
        const resolvedJvmTimeout = isJvmConfigType
          ? Number(config.jvm?.endpoint?.timeoutSeconds || config.timeout || 30)
          : Number(config.timeout || 30);
        const hasHttpTunnel = !!config.useHttpTunnel;
        const hasProxy = !hasHttpTunnel && !!config.useProxy;
        const initialConnectionInputMode: ConnectionInputMode =
          !isJvmConfigType &&
          (String(config.uri || "").trim() || initialValues.hasOpaqueURI)
            ? "url"
            : "target";
        form.setFieldsValue({
          type: configType,
          name: initialValues.name,
          host: primaryHost,
          port: primaryPort,
          user: config.user,
          password: config.password,
          database: config.database,
          uri: config.uri || "",
          connectionInputMode: initialConnectionInputMode,
          includeDatabases: initialValues.includeDatabases,
          includeRedisDatabases: initialValues.includeRedisDatabases,
          useSSL: !!config.useSSL,
          sslMode: config.sslMode || DEFAULT_SSL_MODE,
          sslCertPath: config.sslCertPath || "",
          sslKeyPath: config.sslKeyPath || "",
          useSSH: config.useSSH,
          sshHost: config.ssh?.host,
          sshPort: config.ssh?.port,
          sshUser: config.ssh?.user,
          sshPassword: config.ssh?.password,
          sshKeyPath: config.ssh?.keyPath,
          useProxy: hasProxy,
          proxyType: config.proxy?.type || "socks5",
          proxyHost: config.proxy?.host,
          proxyPort: config.proxy?.port,
          proxyUser: config.proxy?.user,
          proxyPassword: config.proxy?.password,
          useHttpTunnel: hasHttpTunnel,
          httpTunnelHost: config.httpTunnel?.host,
          httpTunnelPort: config.httpTunnel?.port || 8080,
          httpTunnelUser: config.httpTunnel?.user,
          httpTunnelPassword: config.httpTunnel?.password,
          customDataSourceId: selectedInitialCustomDataSource?.id,
          driver: config.driver,
          dsn: config.dsn,
          timeout: resolvedJvmTimeout,
          mysqlTopology: mysqlIsReplica ? "replica" : "single",
          mysqlReplicaHosts: mysqlReplicaHosts,
          mysqlReplicaUser: config.mysqlReplicaUser || "",
          mysqlReplicaPassword: config.mysqlReplicaPassword || "",
          mongoTopology: mongoIsReplica ? "replica" : "single",
          mongoHosts: mongoHosts,
          redisTopology: redisIsCluster ? "cluster" : "single",
          redisHosts: redisHosts,
          mongoSrv: !!config.mongoSrv,
          mongoReplicaSet: config.replicaSet || "",
          mongoAuthSource: config.authSource || "",
          mongoReadPreference: config.readPreference || "primary",
          mongoAuthMechanism: config.mongoAuthMechanism || "",
          savePassword: config.savePassword !== false,
          redisDB: Number.isFinite(Number(config.redisDB))
            ? Number(config.redisDB)
            : 0,
          mongoReplicaUser: config.mongoReplicaUser || "",
          mongoReplicaPassword: config.mongoReplicaPassword || "",
          jvmReadOnly: isJvmConfigType
            ? (config.jvm?.readOnly ?? jvmDefaultValues.jvmReadOnly)
            : jvmDefaultValues.jvmReadOnly,
          jvmAllowedModes: isJvmConfigType
            ? resolvedJvmAllowedModes
            : jvmDefaultValues.jvmAllowedModes,
          jvmPreferredMode: isJvmConfigType
            ? resolvedJvmPreferredMode
            : jvmDefaultValues.jvmPreferredMode,
          jvmEnvironment: isJvmConfigType
            ? config.jvm?.environment || jvmDefaultValues.jvmEnvironment
            : jvmDefaultValues.jvmEnvironment,
          jvmEndpointEnabled: isJvmConfigType
            ? (config.jvm?.endpoint?.enabled ??
              resolvedJvmAllowedModes.includes("endpoint"))
            : jvmDefaultValues.jvmEndpointEnabled,
          jvmEndpointBaseUrl: isJvmConfigType
            ? config.jvm?.endpoint?.baseUrl || ""
            : jvmDefaultValues.jvmEndpointBaseUrl,
          jvmEndpointApiKey: isJvmConfigType
            ? config.jvm?.endpoint?.apiKey || ""
            : jvmDefaultValues.jvmEndpointApiKey,
          jvmAgentEnabled: isJvmConfigType
            ? (config.jvm?.agent?.enabled ??
              resolvedJvmAllowedModes.includes("agent"))
            : jvmDefaultValues.jvmAgentEnabled,
          jvmAgentBaseUrl: isJvmConfigType
            ? config.jvm?.agent?.baseUrl || ""
            : jvmDefaultValues.jvmAgentBaseUrl,
          jvmAgentApiKey: isJvmConfigType
            ? config.jvm?.agent?.apiKey || ""
            : jvmDefaultValues.jvmAgentApiKey,
          jvmDiagnosticEnabled: isJvmConfigType
            ? (config.jvm?.diagnostic?.enabled ??
              jvmDefaultValues.jvmDiagnosticEnabled)
            : jvmDefaultValues.jvmDiagnosticEnabled,
          jvmDiagnosticTransport: isJvmConfigType
            ? config.jvm?.diagnostic?.transport ||
              jvmDefaultValues.jvmDiagnosticTransport
            : jvmDefaultValues.jvmDiagnosticTransport,
          jvmDiagnosticBaseUrl: isJvmConfigType
            ? config.jvm?.diagnostic?.baseUrl || ""
            : jvmDefaultValues.jvmDiagnosticBaseUrl,
          jvmDiagnosticTargetId: isJvmConfigType
            ? config.jvm?.diagnostic?.targetId || ""
            : jvmDefaultValues.jvmDiagnosticTargetId,
          jvmDiagnosticApiKey: isJvmConfigType
            ? config.jvm?.diagnostic?.apiKey || ""
            : jvmDefaultValues.jvmDiagnosticApiKey,
          jvmDiagnosticAllowObserveCommands: isJvmConfigType
            ? (config.jvm?.diagnostic?.allowObserveCommands ??
              jvmDefaultValues.jvmDiagnosticAllowObserveCommands)
            : jvmDefaultValues.jvmDiagnosticAllowObserveCommands,
          jvmDiagnosticAllowTraceCommands: isJvmConfigType
            ? (config.jvm?.diagnostic?.allowTraceCommands ??
              jvmDefaultValues.jvmDiagnosticAllowTraceCommands)
            : jvmDefaultValues.jvmDiagnosticAllowTraceCommands,
          jvmDiagnosticAllowMutatingCommands: isJvmConfigType
            ? (config.jvm?.diagnostic?.allowMutatingCommands ??
              jvmDefaultValues.jvmDiagnosticAllowMutatingCommands)
            : jvmDefaultValues.jvmDiagnosticAllowMutatingCommands,
          jvmDiagnosticTimeoutSeconds: isJvmConfigType
            ? Number(
                config.jvm?.diagnostic?.timeoutSeconds ||
                  jvmDefaultValues.jvmDiagnosticTimeoutSeconds,
              )
            : jvmDefaultValues.jvmDiagnosticTimeoutSeconds,
          jvmEndpointTimeoutSeconds: resolvedJvmTimeout,
          jvmJmxHost:
            isJvmConfigType &&
            config.jvm?.jmx?.host &&
            config.jvm.jmx.host !== primaryHost
              ? config.jvm.jmx.host
              : "",
          jvmJmxPort:
            isJvmConfigType &&
            Number(config.jvm?.jmx?.port) > 0 &&
            Number(config.jvm.jmx.port) !== Number(primaryPort || defaultPort)
              ? Number(config.jvm.jmx.port)
              : undefined,
          jvmJmxUsername: isJvmConfigType
            ? config.jvm?.jmx?.username || ""
            : "",
          jvmJmxPassword: isJvmConfigType
            ? config.jvm?.jmx?.password || ""
            : "",
        });
        setUseSSL(!!config.useSSL);
        setCustomIconType(initialValues.iconType);
        setCustomIconColor(initialValues.iconColor);
        setUseSSH(config.useSSH || false);
        setUseProxy(hasProxy);
        setUseHttpTunnel(hasHttpTunnel);
        setDbType(configType);
        if (config.useSSL && supportsSSLForType(configType)) {
          setActiveNetworkConfig("ssl");
        } else if (config.useSSH) {
          setActiveNetworkConfig("ssh");
        } else if (hasProxy) {
          setActiveNetworkConfig("proxy");
        } else if (hasHttpTunnel) {
          setActiveNetworkConfig("httpTunnel");
        } else {
          setActiveNetworkConfig("ssl");
        }
        // 如果是 Redis 编辑模式，设置已保存的 Redis 数据库列表
        if (configType === "redis") {
          setRedisDbList(Array.from({ length: 16 }, (_, i) => i));
        }
      } else {
        // Create mode: Start at step 1
        setActiveConfigSection("basic");
        setStep(1);
        form.resetFields();
        setUseSSL(false);
        setUseSSH(false);
        setUseProxy(false);
        setUseHttpTunnel(false);
        setDbType("mysql");
        form.setFieldsValue({
          customDataSourceId: undefined,
          driver: undefined,
          dsn: undefined,
        });
        setActiveGroup(0);
        setActiveConfigSection("basic");
        setActiveNetworkConfig("ssl");
      }
    }
  }, [open, initialValues]);

  useEffect(() => {
    return () => {
      if (testTimerRef.current !== null) {
        window.clearTimeout(testTimerRef.current);
        testTimerRef.current = null;
      }
    };
  }, []);

  const buildSavedConnectionInput = (config: ConnectionConfig, values: any) => {
    const resolvedConnectionInputMode: ConnectionInputMode =
      values.connectionInputMode === "url" ? "url" : "target";
    const connectionId =
      initialValues?.id || config.id || Date.now().toString();
    const primaryDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasPrimaryPassword,
      valueInput: config.password,
      clearSecret: clearSecrets.primaryPassword,
      forceClear: values.type === "mongodb" && values.savePassword === false,
    });
    const sshDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasSSHPassword,
      valueInput: config.ssh?.password,
      clearSecret: clearSecrets.sshPassword,
      forceClear: !config.useSSH,
    });
    const proxyDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasProxyPassword,
      valueInput: config.proxy?.password,
      clearSecret: clearSecrets.proxyPassword,
      forceClear: !config.useProxy,
    });
    const httpTunnelDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasHttpTunnelPassword,
      valueInput: config.httpTunnel?.password,
      clearSecret: clearSecrets.httpTunnelPassword,
      forceClear: !config.useHttpTunnel,
    });
    const mysqlReplicaEnabled =
      (config.type === "mysql" ||
        config.type === "mariadb" ||
        config.type === "diros" ||
        config.type === "sphinx") &&
      config.topology === "replica";
    const mysqlReplicaDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasMySQLReplicaPassword,
      valueInput: config.mysqlReplicaPassword,
      clearSecret: clearSecrets.mysqlReplicaPassword,
      forceClear: !mysqlReplicaEnabled,
    });
    const mongoReplicaEnabled =
      config.type === "mongodb" &&
      config.topology === "replica" &&
      values.savePassword !== false;
    const mongoReplicaDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasMongoReplicaPassword,
      valueInput: config.mongoReplicaPassword,
      clearSecret: clearSecrets.mongoReplicaPassword,
      forceClear: !mongoReplicaEnabled,
    });
    const opaqueUriDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasOpaqueURI,
      valueInput: config.uri,
      clearSecret: clearSecrets.opaqueURI,
      forceClear:
        values.type === "custom" ||
        values.type === "jvm" ||
        resolvedConnectionInputMode !== "url",
      trimInput: true,
    });
    const opaqueDsnDraft = resolveConnectionSecretDraft({
      hasSecret: initialValues?.hasOpaqueDSN,
      valueInput: config.dsn,
      clearSecret: clearSecrets.opaqueDSN,
      forceClear: values.type !== "custom",
      trimInput: true,
    });
    const isRedisType = values.type === "redis";
    const displayHost = String(
      (config as any).host || values.host || "",
    ).trim();
    const nextName =
      values.name ||
      (isFileDatabaseType(values.type)
        ? values.type === "duckdb"
          ? "DuckDB DB"
          : "SQLite DB"
        : values.type === "redis"
          ? `Redis ${displayHost}`
          : displayHost);

    return {
      id: connectionId,
      name: nextName,
      config: {
        ...config,
        id: connectionId,
        password: primaryDraft.value,
        ssh: {
          ...(config.ssh || {
            host: "",
            port: 22,
            user: "",
            password: "",
            keyPath: "",
          }),
          password: sshDraft.value,
        },
        proxy: {
          ...(config.proxy || {
            type: "socks5",
            host: "",
            port: 1080,
            user: "",
            password: "",
          }),
          password: proxyDraft.value,
        },
        httpTunnel: {
          ...(config.httpTunnel || {
            host: "",
            port: 8080,
            user: "",
            password: "",
          }),
          password: httpTunnelDraft.value,
        },
        uri: opaqueUriDraft.value,
        dsn: opaqueDsnDraft.value,
        mysqlReplicaPassword: mysqlReplicaDraft.value,
        mongoReplicaPassword: mongoReplicaDraft.value,
      },
      includeDatabases: values.includeDatabases,
      includeRedisDatabases: isRedisType
        ? values.includeRedisDatabases
        : undefined,
      iconType: customIconType || "",
      iconColor: customIconColor || "",
      clearPrimaryPassword: primaryDraft.clearStoredSecret,
      clearSSHPassword: sshDraft.clearStoredSecret,
      clearProxyPassword: proxyDraft.clearStoredSecret,
      clearHttpTunnelPassword: httpTunnelDraft.clearStoredSecret,
      clearMySQLReplicaPassword: mysqlReplicaDraft.clearStoredSecret,
      clearMongoReplicaPassword: mongoReplicaDraft.clearStoredSecret,
      clearOpaqueURI: opaqueUriDraft.clearStoredSecret,
      clearOpaqueDSN: opaqueDsnDraft.clearStoredSecret,
    };
  };
  const handleOk = async () => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      const unavailableReason = await resolveDriverUnavailableReason(
        values.type,
      );
      if (unavailableReason) {
        message.warning(unavailableReason);
        promptInstallDriver(values.type, unavailableReason);
        return;
      }
      setLoading(true);

      const config = await buildConfig(values, true);
      const payload = buildSavedConnectionInput(config, values);
      const backendApp = (window as any).go?.app?.App;
      const savedConnection = await backendApp?.SaveConnection?.(payload);
      if (!savedConnection) {
        throw new Error("保存连接失败：后端接口不可用");
      }

      if (initialValues) {
        updateConnection(savedConnection);
        message.success("配置已更新（未连接）");
      } else {
        addConnection(savedConnection);
        message.success("配置已保存（未连接）");
      }

      if (onSaved) {
        void Promise.resolve(onSaved(savedConnection)).catch(
          (error: unknown) => {
            console.warn("Failed to refresh post-save state", error);
            void message.warning(
              "配置已保存，但安全更新状态暂未刷新，请稍后重新检查",
            );
          },
        );
      }

      form.resetFields();
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
      setUseHttpTunnel(false);
      setDbType("mysql");
      setStep(1);
      setClearSecrets(createEmptyConnectionSecretClearState());
      onClose();
    } catch (e: any) {
      message.error(
        normalizeConnectionSecretErrorMessage(e?.message || e, "保存失败"),
      );
    } finally {
      setLoading(false);
    }
  };

  const requestTest = () => {
    if (loading) return;
    if (testTimerRef.current !== null) return;
    testTimerRef.current = window.setTimeout(() => {
      testTimerRef.current = null;
      handleTest();
    }, 0);
  };

  const withClientTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> => {
    let timer: number | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = window.setTimeout(
            () => reject(new Error(timeoutMessage)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    }
  };

  const getBlockingSecretClearMessage = (values: any): string | null => {
    if (
      clearSecrets.primaryPassword &&
      !isFileDatabaseType(values.type) &&
      String(values.password ?? "") === ""
    ) {
      return "测试连接前请填写新的密码，或取消清除已保存密码";
    }
    if (
      clearSecrets.sshPassword &&
      values.useSSH &&
      String(values.sshPassword ?? "") === ""
    ) {
      return "测试连接前请填写新的 SSH 密码，或取消清除已保存 SSH 密码";
    }
    if (
      clearSecrets.proxyPassword &&
      values.useProxy &&
      !values.useHttpTunnel &&
      String(values.proxyPassword ?? "") === ""
    ) {
      return "测试连接前请填写新的代理密码，或取消清除已保存代理密码";
    }
    if (
      clearSecrets.httpTunnelPassword &&
      values.useHttpTunnel &&
      String(values.httpTunnelPassword ?? "") === ""
    ) {
      return "测试连接前请填写新的隧道密码，或取消清除已保存隧道密码";
    }
    if (
      clearSecrets.mysqlReplicaPassword &&
      (values.type === "mysql" ||
        values.type === "mariadb" ||
        values.type === "diros" ||
        values.type === "sphinx") &&
      values.mysqlTopology === "replica" &&
      String(values.mysqlReplicaPassword ?? "") === ""
    ) {
      return "测试连接前请填写新的从库密码，或取消清除已保存从库密码";
    }
    if (
      clearSecrets.mongoReplicaPassword &&
      values.type === "mongodb" &&
      values.mongoTopology === "replica" &&
      String(values.mongoReplicaPassword ?? "") === ""
    ) {
      return "测试连接前请填写新的副本集密码，或取消清除已保存副本集密码";
    }
    if (
      values.type === "mongodb" &&
      values.savePassword === false &&
      initialValues?.hasPrimaryPassword &&
      String(values.password ?? "") === ""
    ) {
      return "测试连接前请填写新的 MongoDB 密码，或重新勾选保存密码";
    }
    return null;
  };
  const applyTestFailureFeedback = (feedback: { message: string }) => {
    void message.destroy("connection-test-failure");
    setTestResult({ type: "error", message: feedback.message });
  };

  const handleTest = async () => {
    if (testInFlightRef.current) return;
    testInFlightRef.current = true;
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      const unavailableReason = await resolveDriverUnavailableReason(
        values.type,
      );
      if (unavailableReason) {
        applyTestFailureFeedback(
          resolveConnectionTestFailureFeedback({
            kind: "driver_unavailable",
            reason: unavailableReason,
            fallback: "驱动未安装启用",
          }),
        );
        promptInstallDriver(values.type, unavailableReason);
        return;
      }
      const blockingSecretClearMessage = getBlockingSecretClearMessage(values);
      if (blockingSecretClearMessage) {
        applyTestFailureFeedback(
          resolveConnectionTestFailureFeedback({
            kind: "secret_blocked",
            reason: blockingSecretClearMessage,
            fallback: "连接参数不完整",
          }),
        );
        return;
      }
      setLoading(true);
      setTestResult(null);
      const config = await buildConfig(values, false);
      if (initialValues?.id) {
        config.id = initialValues.id;
      }
      const timeoutSecondsRaw = Number(values.timeout);
      const timeoutSeconds =
        Number.isFinite(timeoutSecondsRaw) && timeoutSecondsRaw > 0
          ? Math.min(timeoutSecondsRaw, MAX_TIMEOUT_SECONDS)
          : 30;
      const rpcTimeoutMs = (timeoutSeconds + 5) * 1000;

      // Use different API for Redis / JVM
      const isRedisType = values.type === "redis";
      const isJVMType = values.type === "jvm";
      const res = await withClientTimeout(
        isJVMType
          ? TestJVMConnection(config as any)
          : isRedisType
            ? RedisConnect(config as any)
            : TestConnection(config as any),
        rpcTimeoutMs,
        `连接测试超时（>${timeoutSeconds} 秒），请检查网络/代理/SSH配置后重试`,
      );

      if (res.success) {
        void message.destroy("connection-test-failure");
        setTestResult({ type: "success", message: res.message });
        if (values.type === "custom") {
          const selectedSource = customDataSources.find(
            (source) => source.id === String(values.customDataSourceId || ""),
          );
          if (selectedSource) {
            const nextSource: CustomDataSource = {
              ...selectedSource,
              runtimeStatus: {
                ...(selectedSource.runtimeStatus || {}),
                connectionTested: true,
                checkedAt: Date.now(),
              },
              updatedAt: Date.now(),
            };
            setCustomDataSources(
              mergeBackendCustomDataSourceDefinitions(
                customDataSources.map((source) =>
                  source.id === nextSource.id ? nextSource : source,
                ),
                [],
              ),
            );
          }
        }
        if (isRedisType) {
          setRedisDbList(Array.from({ length: 16 }, (_, i) => i));
        } else if (!isJVMType) {
          // Other databases: fetch database list
          const dbRes = await withClientTimeout(
            DBGetDatabases(config as any),
            rpcTimeoutMs,
            `连接成功但拉取数据库列表超时（>${timeoutSeconds} 秒）`,
          );
          if (dbRes.success) {
            const dbRows = Array.isArray(dbRes.data) ? dbRes.data : [];
            const dbs = dbRows
              .map((row: any) => row?.Database || row?.database)
              .filter(
                (name: any) => typeof name === "string" && name.trim() !== "",
              );
            setDbList(dbs);
            if (dbs.length === 0) {
              message.warning(
                values.type === "dameng"
                  ? "连接成功，但未获取到可见 schema；请检查当前账号权限或默认 schema 配置"
                  : "连接成功，但未获取到可见数据库列表",
              );
            }
          } else {
            setDbList([]);
            message.warning(
              `连接成功，但获取数据库列表失败：${normalizeConnectionSecretErrorMessage(dbRes.message, "未知错误")}`,
            );
          }
        }
      } else {
        applyTestFailureFeedback(
          resolveConnectionTestFailureFeedback({
            kind: "runtime",
            reason: res?.message,
            fallback: "连接被拒绝或参数无效，请检查后重试",
          }),
        );
      }
    } catch (e: unknown) {
      if (e && typeof e === "object" && "errorFields" in e) {
        applyTestFailureFeedback(
          resolveConnectionTestFailureFeedback({
            kind: "validation",
            reason: "",
            fallback: "请先完善必填项后再测试连接",
          }),
        );
        return;
      }
      const reason =
        e instanceof Error ? e.message : typeof e === "string" ? e : "未知异常";
      applyTestFailureFeedback(
        resolveConnectionTestFailureFeedback({
          kind: "runtime",
          reason,
          fallback: "未知异常",
        }),
      );
    } finally {
      testInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleDiscoverMongoMembers = async () => {
    if (discoveringMembers || dbType !== "mongodb") {
      return;
    }
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      setDiscoveringMembers(true);
      const blockingSecretClearMessage = getBlockingSecretClearMessage(values);
      if (blockingSecretClearMessage) {
        message.error(blockingSecretClearMessage);
        return;
      }
      const config = await buildConfig(values, false);
      if (initialValues?.id) {
        config.id = initialValues.id;
      }
      const result = await MongoDiscoverMembers(config as any);
      if (!result.success) {
        message.error(
          normalizeConnectionSecretErrorMessage(result.message, "成员发现失败"),
        );
        return;
      }
      const data = (result.data as Record<string, any>) || {};
      const membersRaw = Array.isArray(data.members) ? data.members : [];
      const members: MongoMemberInfo[] = membersRaw
        .map((item: any) => ({
          host: String(item.host || "").trim(),
          role: String(item.role || item.state || "UNKNOWN").trim(),
          state: String(item.state || item.role || "UNKNOWN").trim(),
          stateCode: Number(item.stateCode || 0),
          healthy: !!item.healthy,
          isSelf: !!item.isSelf,
        }))
        .filter((item: MongoMemberInfo) => !!item.host);
      setMongoMembers(members);
      if (!form.getFieldValue("mongoReplicaSet") && data.replicaSet) {
        form.setFieldValue("mongoReplicaSet", String(data.replicaSet));
      }
      message.success(result.message || `发现 ${members.length} 个成员`);
    } catch (error: any) {
      message.error(
        normalizeConnectionSecretErrorMessage(
          error?.message || error,
          "成员发现失败",
        ),
      );
    } finally {
      setDiscoveringMembers(false);
    }
  };

  const buildConfig = async (
    values: any,
    forPersist: boolean,
  ): Promise<ConnectionConfig> => {
    const mergedValues = { ...values };
    if (
      String(mergedValues.type || "")
        .trim()
        .toLowerCase() === "jvm"
    ) {
      if (
        hasUnsupportedJVMEditableModes({
          allowedModes: mergedValues.jvmAllowedModes,
          preferredMode: mergedValues.jvmPreferredMode,
        })
      ) {
        throw new Error(
          "当前连接包含未支持的 JVM 模式；请先调整为 JMX、Endpoint 或 Agent 后再测试或保存",
        );
      }
      if (
        hasUnsupportedJVMDiagnosticTransport(
          mergedValues.jvmDiagnosticTransport,
        )
      ) {
        throw new Error(
          "当前连接包含未支持的 JVM 诊断 transport；请先调整为 agent-bridge 或 arthas-tunnel 后再测试或保存",
        );
      }
      const existingDiagnostic = initialValues?.config?.jvm?.diagnostic;
      if (
        mergedValues.jvmDiagnosticEnabled === undefined &&
        existingDiagnostic?.enabled !== undefined
      ) {
        mergedValues.jvmDiagnosticEnabled = existingDiagnostic.enabled;
      }
      if (
        String(mergedValues.jvmDiagnosticTransport || "").trim() === "" &&
        existingDiagnostic?.transport
      ) {
        mergedValues.jvmDiagnosticTransport = existingDiagnostic.transport;
      }
      if (
        String(mergedValues.jvmDiagnosticBaseUrl || "").trim() === "" &&
        existingDiagnostic?.baseUrl
      ) {
        mergedValues.jvmDiagnosticBaseUrl = existingDiagnostic.baseUrl;
      }
      if (
        String(mergedValues.jvmDiagnosticTargetId || "").trim() === "" &&
        existingDiagnostic?.targetId
      ) {
        mergedValues.jvmDiagnosticTargetId = existingDiagnostic.targetId;
      }
      if (
        String(mergedValues.jvmDiagnosticApiKey || "").trim() === "" &&
        existingDiagnostic?.apiKey
      ) {
        mergedValues.jvmDiagnosticApiKey = existingDiagnostic.apiKey;
      }
      if (
        mergedValues.jvmDiagnosticAllowObserveCommands === undefined &&
        existingDiagnostic?.allowObserveCommands !== undefined
      ) {
        mergedValues.jvmDiagnosticAllowObserveCommands =
          existingDiagnostic.allowObserveCommands;
      }
      if (
        mergedValues.jvmDiagnosticAllowTraceCommands === undefined &&
        existingDiagnostic?.allowTraceCommands !== undefined
      ) {
        mergedValues.jvmDiagnosticAllowTraceCommands =
          existingDiagnostic.allowTraceCommands;
      }
      if (
        mergedValues.jvmDiagnosticAllowMutatingCommands === undefined &&
        existingDiagnostic?.allowMutatingCommands !== undefined
      ) {
        mergedValues.jvmDiagnosticAllowMutatingCommands =
          existingDiagnostic.allowMutatingCommands;
      }
      if (
        (mergedValues.jvmDiagnosticTimeoutSeconds === undefined ||
          mergedValues.jvmDiagnosticTimeoutSeconds === null ||
          mergedValues.jvmDiagnosticTimeoutSeconds === "") &&
        Number(existingDiagnostic?.timeoutSeconds) > 0
      ) {
        mergedValues.jvmDiagnosticTimeoutSeconds = Number(
          existingDiagnostic?.timeoutSeconds,
        );
      }
      const resolvedJvmAllowedModes = normalizeEditableJVMModes(
        mergedValues.jvmAllowedModes,
      );
      const resolvedJvmTimeout = Number(mergedValues.timeout || 30);
      const preferredJvmMode = String(mergedValues.jvmPreferredMode || "")
        .trim()
        .toLowerCase();
      const resolvedJvmPreferredMode =
        resolvedJvmAllowedModes.find((mode) => mode === preferredJvmMode) ||
        resolvedJvmAllowedModes[0];
      return buildJVMConnectionConfig({
        ...buildDefaultJVMConnectionValues(),
        ...mergedValues,
        jvmAllowedModes: resolvedJvmAllowedModes,
        jvmPreferredMode: resolvedJvmPreferredMode,
        jvmEndpointEnabled: resolvedJvmAllowedModes.includes("endpoint"),
        jvmAgentEnabled: resolvedJvmAllowedModes.includes("agent"),
        timeout: resolvedJvmTimeout,
        jvmEndpointTimeoutSeconds: resolvedJvmTimeout,
      });
    }
    const type = String(mergedValues.type || "").toLowerCase();
    const resolvedConnectionInputMode: ConnectionInputMode =
      mergedValues.connectionInputMode === "url" ? "url" : "target";
    const shouldUseConnectionUri =
      type !== "custom" && resolvedConnectionInputMode === "url";
    if (!shouldUseConnectionUri) {
      mergedValues.uri = "";
    }
    const parsedUriValues = shouldUseConnectionUri
      ? parseUriToValues(mergedValues.uri, mergedValues.type)
      : null;
    if (parsedUriValues) {
      Object.entries(parsedUriValues).forEach(([key, value]) => {
        // 连接 URL / 目标地址由显式模式二选一；只有 URL 模式才用解析结果
        // 覆盖目标地址字段，目标地址模式会清空并忽略历史 URL。
        if (value !== undefined && value !== null) {
          (mergedValues as any)[key] = value;
        }
      });
    }

    const defaultPort = getDefaultPortByType(type);
    const isFileDbType = isFileDatabaseType(type);
    const sslCapableType = supportsSSLForType(type);

    // Redis 默认不展示用户名字段；若 URI 可解析则以 URI 为准覆盖 user，
    // 同时清理历史默认值 root，避免 go-redis 发送 ACL AUTH(user, pass) 导致 WRONGPASS。
    if (type === "redis") {
      if (
        parsedUriValues &&
        Object.prototype.hasOwnProperty.call(parsedUriValues, "user")
      ) {
        mergedValues.user = String((parsedUriValues as any).user || "");
      } else if (String(mergedValues.user || "").trim() === "root") {
        mergedValues.user = "";
      }
    }
    const effectiveUseSSL = sslCapableType && !!mergedValues.useSSL;
    const sslMode = resolveEffectiveSSLMode(mergedValues.sslMode, effectiveUseSSL);
    const sslCertPath = sslCapableType
      ? String(mergedValues.sslCertPath || "").trim()
      : "";
    const sslKeyPath = sslCapableType
      ? String(mergedValues.sslKeyPath || "").trim()
      : "";
    if (type === "dameng" && effectiveUseSSL && (!sslCertPath || !sslKeyPath)) {
      throw new Error("达梦启用 SSL 时必须填写证书路径与私钥路径");
    }

    let primaryHost = "localhost";
    let primaryPort = defaultPort;
    if (isFileDbType) {
      // 文件型数据库（sqlite/duckdb）这里的 host 即数据库文件路径，不应参与 host:port 拼接与解析。
      primaryHost = normalizeFileDbPath(String(mergedValues.host || "").trim());
      primaryPort = 0;
    } else {
      const parsedPrimary = parseHostPort(
        toAddress(
          mergedValues.host || "localhost",
          Number(mergedValues.port || defaultPort),
          defaultPort,
        ),
        defaultPort,
      );
      primaryHost = parsedPrimary?.host || "localhost";
      primaryPort = parsedPrimary?.port || defaultPort;
    }

    let hosts: string[] = [];
    let topology: "single" | "replica" | "cluster" | undefined;
    let replicaSet = "";
    let authSource = "";
    let readPreference = "";
    let mysqlReplicaUser = "";
    let mysqlReplicaPassword = "";
    let mongoSrvEnabled = false;
    let mongoAuthMechanism = "";
    let mongoReplicaUser = "";
    let mongoReplicaPassword = "";
    const savePassword =
      type === "mongodb" ? mergedValues.savePassword !== false : true;

    if (
      type === "mysql" ||
      type === "mariadb" ||
      type === "diros" ||
      type === "sphinx"
    ) {
      const replicas =
        mergedValues.mysqlTopology === "replica"
          ? normalizeAddressList(mergedValues.mysqlReplicaHosts, defaultPort)
          : [];
      const allHosts = normalizeAddressList(
        [`${primaryHost}:${primaryPort}`, ...replicas],
        defaultPort,
      );
      if (mergedValues.mysqlTopology === "replica" || allHosts.length > 1) {
        hosts = allHosts;
        topology = "replica";
        mysqlReplicaUser = String(mergedValues.mysqlReplicaUser || "").trim();
        mysqlReplicaPassword = String(mergedValues.mysqlReplicaPassword || "");
      } else {
        topology = "single";
      }
    }

    if (type === "mongodb") {
      mongoSrvEnabled = !!mergedValues.mongoSrv;
      const extraHosts =
        mergedValues.mongoTopology === "replica"
          ? mongoSrvEnabled
            ? normalizeMongoSrvHostList(mergedValues.mongoHosts, defaultPort)
            : normalizeAddressList(mergedValues.mongoHosts, defaultPort)
          : [];
      const primarySeed = mongoSrvEnabled
        ? primaryHost
        : `${primaryHost}:${primaryPort}`;
      const allHosts = mongoSrvEnabled
        ? normalizeMongoSrvHostList([primarySeed, ...extraHosts], defaultPort)
        : normalizeAddressList([primarySeed, ...extraHosts], defaultPort);
      if (
        mergedValues.mongoTopology === "replica" ||
        allHosts.length > 1 ||
        mergedValues.mongoReplicaSet
      ) {
        hosts = allHosts;
        topology = "replica";
        mongoReplicaUser = String(mergedValues.mongoReplicaUser || "").trim();
        mongoReplicaPassword = String(mergedValues.mongoReplicaPassword || "");
      } else {
        topology = "single";
      }
      replicaSet = String(mergedValues.mongoReplicaSet || "").trim();
      authSource = String(
        mergedValues.mongoAuthSource || mergedValues.database || "admin",
      ).trim();
      readPreference = String(
        mergedValues.mongoReadPreference || "primary",
      ).trim();
      mongoAuthMechanism = String(mergedValues.mongoAuthMechanism || "")
        .trim()
        .toUpperCase();
    }

    if (type === "redis") {
      const clusterNodes =
        mergedValues.redisTopology === "cluster"
          ? normalizeAddressList(mergedValues.redisHosts, defaultPort)
          : [];
      const allHosts = normalizeAddressList(
        [`${primaryHost}:${primaryPort}`, ...clusterNodes],
        defaultPort,
      );
      if (mergedValues.redisTopology === "cluster" || allHosts.length > 1) {
        hosts = allHosts;
        topology = "cluster";
      } else {
        topology = "single";
      }
      mergedValues.redisDB = Number.isFinite(Number(mergedValues.redisDB))
        ? Math.max(0, Math.min(15, Math.trunc(Number(mergedValues.redisDB))))
        : 0;
    }

    const sshConfig = mergedValues.useSSH
      ? {
          host: mergedValues.sshHost,
          port: Number(mergedValues.sshPort),
          user: mergedValues.sshUser,
          password: mergedValues.sshPassword || "",
          keyPath: mergedValues.sshKeyPath || "",
        }
      : { host: "", port: 22, user: "", password: "", keyPath: "" };
    const effectiveUseHttpTunnel =
      !isFileDbType && !!mergedValues.useHttpTunnel;
    const effectiveUseProxy =
      !isFileDbType && !!mergedValues.useProxy && !effectiveUseHttpTunnel;
    const proxyTypeRaw = String(
      mergedValues.proxyType || "socks5",
    ).toLowerCase();
    const proxyType: "socks5" | "http" =
      proxyTypeRaw === "http" ? "http" : "socks5";
    const proxyConfig: NonNullable<ConnectionConfig["proxy"]> =
      effectiveUseProxy
        ? {
            type: proxyType,
            host: String(mergedValues.proxyHost || "").trim(),
            port: Number(
              mergedValues.proxyPort || (proxyTypeRaw === "http" ? 8080 : 1080),
            ),
            user: String(mergedValues.proxyUser || "").trim(),
            password: mergedValues.proxyPassword || "",
          }
        : {
            type: "socks5",
            host: "",
            port: 1080,
            user: "",
            password: "",
          };
    const httpTunnelConfig: NonNullable<ConnectionConfig["httpTunnel"]> =
      effectiveUseHttpTunnel
        ? {
            host: String(mergedValues.httpTunnelHost || "").trim(),
            port: Number(mergedValues.httpTunnelPort || 8080),
            user: String(mergedValues.httpTunnelUser || "").trim(),
            password: mergedValues.httpTunnelPassword || "",
          }
        : {
            host: "",
            port: 8080,
            user: "",
            password: "",
          };
    if (effectiveUseHttpTunnel) {
      if (!httpTunnelConfig.host) {
        throw new Error("HTTP 隧道主机不能为空");
      }
      if (
        !Number.isFinite(httpTunnelConfig.port) ||
        httpTunnelConfig.port <= 0 ||
        httpTunnelConfig.port > 65535
      ) {
        throw new Error("HTTP 隧道端口必须在 1-65535 之间");
      }
    }

    const keepPassword = !forPersist || savePassword;
    const normalizedConfigType = normalizeDriverType(type);
    const selectedDriverForConfig =
      type === "custom"
        ? String(mergedValues.driver || "").trim()
        : type === "jvm"
          ? undefined
          : normalizeDriverType(String(mergedValues.driver || "")) ||
            driverStatusMap[normalizedConfigType]?.defaultDriverType ||
            normalizedConfigType;
    const selectedCustomSource =
      type === "custom"
        ? customDataSources.find(
            (source) =>
              source.id === String(mergedValues.customDataSourceId || ""),
          )
        : undefined;
    const existingCustomOptions =
      type === "custom" && initialValues?.config?.options
        ? initialValues.config.options
        : {};
    const customConnectionOptions =
      type === "custom"
        ? Object.fromEntries(
            Object.entries({
              ...existingCustomOptions,
              customDataSourceId: selectedCustomSource?.id || "",
              customDataSourceName: selectedCustomSource?.name || "",
              customDataSourceDriverType:
                selectedCustomSource?.driverType ||
                selectedCustomSource?.driver ||
                selectedDriverForConfig ||
                "",
              customDataSourceDriverClassName:
                selectedCustomSource?.driverClassName || "",
              customDataSourceDefaultDriver:
                selectedCustomSource?.driverType ||
                selectedCustomSource?.driver ||
                selectedDriverForConfig ||
                "",
            }).filter(([, value]) => String(value || "").trim() !== ""),
          )
        : undefined;

    return {
      type: mergedValues.type,
      host: primaryHost,
      port: Number(primaryPort || 0),
      user: mergedValues.user || "",
      password: keepPassword ? mergedValues.password || "" : "",
      savePassword: savePassword,
      database: mergedValues.database || "",
      useSSL: effectiveUseSSL,
      sslMode: effectiveUseSSL ? sslMode : "disable",
      sslCertPath: sslCertPath,
      sslKeyPath: sslKeyPath,
      useSSH: !!mergedValues.useSSH,
      ssh: sshConfig,
      useProxy: effectiveUseProxy,
      proxy: proxyConfig,
      useHttpTunnel: effectiveUseHttpTunnel,
      httpTunnel: httpTunnelConfig,
      driver: selectedDriverForConfig,
      dsn: String(mergedValues.dsn || "").trim(),
      options: customConnectionOptions,
      timeout: Number(mergedValues.timeout || 30),
      redisDB: Number.isFinite(Number(mergedValues.redisDB))
        ? Math.max(0, Math.min(15, Math.trunc(Number(mergedValues.redisDB))))
        : 0,
      uri: shouldUseConnectionUri ? String(mergedValues.uri || "").trim() : "",
      hosts: hosts,
      topology: topology,
      mysqlReplicaUser: mysqlReplicaUser,
      mysqlReplicaPassword: keepPassword ? mysqlReplicaPassword : "",
      replicaSet: replicaSet,
      authSource: authSource,
      readPreference: readPreference,
      mongoSrv: mongoSrvEnabled,
      mongoAuthMechanism: mongoAuthMechanism,
      mongoReplicaUser: mongoReplicaUser,
      mongoReplicaPassword: keepPassword ? mongoReplicaPassword : "",
    };
  };

  const handleTypeSelect = (type: string) => {
    const normalized = normalizeDriverType(type);
    const snapshot = driverStatusMap[normalized];
    if (snapshot && !snapshot.connectable) {
      const driverName = snapshot.name || type;
      const reason =
        snapshot.message ||
        `${driverName} 驱动未安装启用，请先在驱动管理中安装`;
      setTypeSelectWarning({ driverName, reason });
      return;
    }
    setTypeSelectWarning(null);
    setDbType(type);
    const defaultSelectedDriver =
      snapshot?.defaultDriverType || normalized || type;
    form.setFieldsValue(
      type === "custom" || type === "jvm"
        ? {
            type: type,
            connectionInputMode: "target",
            uri: "",
            ...(type === "custom"
              ? {
                  customDataSourceId: undefined,
                  driver: "",
                  dsn: "",
                }
              : {}),
          }
        : {
            type: type,
            driver: defaultSelectedDriver,
            connectionInputMode: "target",
            uri: "",
          },
    );

    const defaultPort = getDefaultPortByType(type);
    if (type === "jvm") {
      const jvmDefaultValues = buildDefaultJVMConnectionValues();
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
      setUseHttpTunnel(false);
      form.setFieldsValue({
        ...jvmDefaultValues,
        user: "",
        password: "",
        database: "",
        useSSL: false,
        sslMode: undefined,
        sslCertPath: undefined,
        sslKeyPath: undefined,
        useSSH: false,
        sshHost: "",
        sshPort: 22,
        sshUser: "",
        sshPassword: "",
        sshKeyPath: "",
        useProxy: false,
        proxyType: "socks5",
        proxyHost: "",
        proxyPort: 1080,
        proxyUser: "",
        proxyPassword: "",
        useHttpTunnel: false,
        httpTunnelHost: "",
        httpTunnelPort: 8080,
        httpTunnelUser: "",
        httpTunnelPassword: "",
        timeout: 30,
        connectionInputMode: "target",
        uri: "",
        includeDatabases: undefined,
        includeRedisDatabases: undefined,
        mysqlTopology: "single",
        redisTopology: "single",
        mongoTopology: "single",
        mongoSrv: false,
        mongoReadPreference: "primary",
        mongoReplicaSet: "",
        mongoAuthSource: "",
        mongoAuthMechanism: "",
        savePassword: true,
        mysqlReplicaHosts: [],
        redisHosts: [],
        mongoHosts: [],
        mysqlReplicaUser: "",
        mysqlReplicaPassword: "",
        mongoReplicaUser: "",
        mongoReplicaPassword: "",
        redisDB: 0,
        jvmEndpointTimeoutSeconds: 30,
        jvmJmxHost: "",
        jvmJmxPort: undefined,
        jvmJmxUsername: "",
        jvmJmxPassword: "",
        jvmAgentEnabled: false,
        jvmAgentBaseUrl: "",
        jvmAgentApiKey: "",
      });
    } else if (isFileDatabaseType(type)) {
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
      setUseHttpTunnel(false);
      form.setFieldsValue({
        host: "",
        port: 0,
        user: "",
        password: "",
        database: "",
        useSSL: false,
        sslMode: DEFAULT_SSL_MODE,
        sslCertPath: "",
        sslKeyPath: "",
        useSSH: false,
        sshHost: "",
        sshPort: 22,
        sshUser: "",
        sshPassword: "",
        sshKeyPath: "",
        useProxy: false,
        proxyType: "socks5",
        proxyHost: "",
        proxyPort: 1080,
        proxyUser: "",
        proxyPassword: "",
        useHttpTunnel: false,
        httpTunnelHost: "",
        httpTunnelPort: 8080,
        httpTunnelUser: "",
        httpTunnelPassword: "",
        connectionInputMode: "target",
        uri: "",
        mysqlTopology: "single",
        redisTopology: "single",
        mongoTopology: "single",
        mongoSrv: false,
        mongoReadPreference: "primary",
        mongoReplicaSet: "",
        mongoAuthSource: "",
        mongoAuthMechanism: "",
        savePassword: true,
        mysqlReplicaHosts: [],
        redisHosts: [],
        mongoHosts: [],
        mysqlReplicaUser: "",
        mysqlReplicaPassword: "",
        mongoReplicaUser: "",
        mongoReplicaPassword: "",
        redisDB: 0,
      });
    } else if (type === "custom") {
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
      setUseHttpTunnel(false);
      form.setFieldsValue({
        host: "",
        port: 0,
        user: "",
        password: "",
        database: "",
        useSSL: false,
        sslMode: undefined,
        sslCertPath: undefined,
        sslKeyPath: undefined,
        useSSH: false,
        sshHost: "",
        sshPort: 22,
        sshUser: "",
        sshPassword: "",
        sshKeyPath: "",
        useProxy: false,
        proxyType: "socks5",
        proxyHost: "",
        proxyPort: 1080,
        proxyUser: "",
        proxyPassword: "",
        useHttpTunnel: false,
        httpTunnelHost: "",
        httpTunnelPort: 8080,
        httpTunnelUser: "",
        httpTunnelPassword: "",
        timeout: 30,
        connectionInputMode: "target",
        uri: "",
        mysqlTopology: "single",
        redisTopology: "single",
        mongoTopology: "single",
        mongoSrv: false,
        mongoReadPreference: "primary",
        mongoReplicaSet: "",
        mongoAuthSource: "",
        mongoAuthMechanism: "",
        savePassword: true,
        mysqlReplicaHosts: [],
        redisHosts: [],
        mongoHosts: [],
        mysqlReplicaUser: "",
        mysqlReplicaPassword: "",
        mongoReplicaUser: "",
        mongoReplicaPassword: "",
        redisDB: 0,
      });
    } else {
      const defaultUser =
        type === "clickhouse" ? "default" : type === "redis" ? "" : "root";
      const sslCapableType = supportsSSLForType(type);
      setUseSSL(false);
      setUseHttpTunnel(false);
      form.setFieldsValue({
        user: defaultUser,
        database: "",
        port: defaultPort,
        useSSL: sslCapableType ? false : undefined,
        sslMode: sslCapableType ? DEFAULT_SSL_MODE : undefined,
        sslCertPath: sslCapableType ? "" : undefined,
        sslKeyPath: sslCapableType ? "" : undefined,
        useHttpTunnel: false,
        httpTunnelHost: "",
        httpTunnelPort: 8080,
        httpTunnelUser: "",
        httpTunnelPassword: "",
        connectionInputMode: "target",
        uri: "",
        mysqlTopology: "single",
        redisTopology: "single",
        mongoTopology: "single",
        mongoSrv: false,
        mongoReadPreference: "primary",
        mongoReplicaSet: "",
        mongoAuthSource: "",
        mongoAuthMechanism: "",
        savePassword: true,
        mysqlReplicaHosts: [],
        redisHosts: [],
        mongoHosts: [],
        mysqlReplicaUser: "",
        mysqlReplicaPassword: "",
        mongoReplicaUser: "",
        mongoReplicaPassword: "",
        redisDB: 0,
      });
    }

    setMongoMembers([]);
    setStep(2);

    if (!driverStatusLoaded || !snapshot) {
      void refreshDriverStatus();
    }
  };

  const isFileDb = isFileDatabaseType(dbType);
  const isCustom = dbType === "custom";
  const isRedis = dbType === "redis";
  const isJVM = dbType === "jvm";
  const isConnectionUrlMode =
    !isCustom && !isJVM && connectionInputMode === "url";
  const hasConnectionUriDraft = String(uriDraft || "").trim() !== "";
  const keepsStoredConnectionUri =
    !!initialValues?.hasOpaqueURI &&
    !clearSecrets.opaqueURI &&
    !hasConnectionUriDraft;
  const connectionConfigLayout = resolveConnectionConfigLayout(dbType);
  const unsupportedJvmModeMessage =
    isJVM && hasUnsupportedJvmModeSelection
      ? "当前连接包含未支持的 JVM 模式。此版本只支持 JMX / Endpoint / Agent，请先调整允许模式和首选模式后再继续。"
      : "";
  const currentDriverType = normalizeDriverType(dbType);
  const currentDriverSnapshot = driverStatusMap[currentDriverType];
  const currentAvailableDriverOptions = useMemo(
    () =>
      (currentDriverSnapshot?.driverOptions || []).filter(
        (option) => option.available && option.connectable,
      ),
    [currentDriverSnapshot],
  );
  const showJdbcDriverSelector =
    !isCustom && !isJVM && currentAvailableDriverOptions.length > 1;
  const currentDriverUnavailableReason =
    currentDriverType !== "custom" &&
    currentDriverSnapshot &&
    !currentDriverSnapshot.connectable
      ? currentDriverSnapshot.message ||
        `${currentDriverSnapshot.name || dbType} 驱动未安装启用`
      : "";
  const driverStatusChecking =
    currentDriverType !== "custom" && !driverStatusLoaded && step === 2;

  useEffect(() => {
    if (!open || step !== 2 || isCustom || isJVM || !currentDriverSnapshot) {
      return;
    }
    const defaultDriverType =
      currentDriverSnapshot.defaultDriverType || currentDriverType;
    if (!defaultDriverType) {
      return;
    }
    const availableDriverTypes = currentAvailableDriverOptions.map(
      (option) => option.driverType,
    );
    const currentValue = normalizeDriverType(
      String(form.getFieldValue("driver") || ""),
    );
    const initialDriver = normalizeDriverType(
      String((initialValues?.config as any)?.driver || ""),
    );
    const shouldApplyConfiguredDefault =
      !initialDriver &&
      currentValue === currentDriverType &&
      defaultDriverType !== currentDriverType;
    if (
      !currentValue ||
      shouldApplyConfiguredDefault ||
      (availableDriverTypes.length > 0 &&
        !availableDriverTypes.includes(currentValue))
    ) {
      form.setFieldValue("driver", defaultDriverType);
    }
  }, [
    currentAvailableDriverOptions,
    currentDriverSnapshot,
    currentDriverType,
    form,
    initialValues,
    isCustom,
    isJVM,
    open,
    step,
  ]);

  const dbTypeGroups = [
    {
      label: "关系型数据库",
      items: [
        {
          key: "mysql",
          name: "MySQL",
          icon: getDbIcon("mysql", undefined, 36),
        },
        {
          key: "mariadb",
          name: "MariaDB",
          icon: getDbIcon("mariadb", undefined, 36),
        },
        {
          key: "diros",
          name: "Doris",
          icon: getDbIcon("diros", undefined, 36),
        },
        {
          key: "sphinx",
          name: "Sphinx",
          icon: getDbIcon("sphinx", undefined, 36),
        },
        {
          key: "clickhouse",
          name: "ClickHouse",
          icon: getDbIcon("clickhouse", undefined, 36),
        },
        {
          key: "postgres",
          name: "PostgreSQL",
          icon: getDbIcon("postgres", undefined, 36),
        },
        {
          key: "sqlserver",
          name: "SQL Server",
          icon: getDbIcon("sqlserver", undefined, 36),
        },
        {
          key: "sqlite",
          name: "SQLite",
          icon: getDbIcon("sqlite", undefined, 36),
        },
        {
          key: "duckdb",
          name: "DuckDB",
          icon: getDbIcon("duckdb", undefined, 36),
        },
        {
          key: "oracle",
          name: "Oracle",
          icon: getDbIcon("oracle", undefined, 36),
        },
      ],
    },
    {
      label: "国产数据库",
      items: [
        {
          key: "dameng",
          name: "Dameng (达梦)",
          icon: getDbIcon("dameng", undefined, 36),
        },
        {
          key: "kingbase",
          name: "Kingbase (人大金仓)",
          icon: getDbIcon("kingbase", undefined, 36),
        },
        {
          key: "highgo",
          name: "HighGo (瀚高)",
          icon: getDbIcon("highgo", undefined, 36),
        },
        {
          key: "vastbase",
          name: "Vastbase (海量)",
          icon: getDbIcon("vastbase", undefined, 36),
        },
      ],
    },
    {
      label: "NoSQL",
      items: [
        {
          key: "mongodb",
          name: "MongoDB",
          icon: getDbIcon("mongodb", undefined, 36),
        },
        {
          key: "redis",
          name: "Redis",
          icon: getDbIcon("redis", undefined, 36),
        },
      ],
    },
    {
      label: "时序数据库",
      items: [
        {
          key: "tdengine",
          name: "TDengine",
          icon: getDbIcon("tdengine", undefined, 36),
        },
      ],
    },
    {
      label: "其他",
      items: [
        {
          key: "jvm",
          name: "JVM Runtime",
          icon: getDbIcon("jvm", undefined, 36),
        },
        {
          key: "custom",
          name: "自定义数据源",
          icon: getDbIcon("custom", undefined, 36),
        },
      ],
    },
  ];

  const dbTypes = dbTypeGroups.flatMap((g) => g.items);
  const getDbTypeHint = (type: string) => {
    switch (type) {
      case "jvm":
        return "JMX / Endpoint / Agent";
      case "custom":
        return "先选数据源，再填驱动/DSN";
      case "redis":
        return "单机 / 集群";
      case "mongodb":
        return "单机 / 副本集";
      case "sqlite":
      case "duckdb":
        return "本地文件连接";
      default:
        return "标准连接配置";
    }
  };

  const renderStep1 = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
      }}
    >
      <div style={{ ...modalInnerSectionStyle, paddingBottom: 12 }}>
        <div
          style={{
            marginBottom: 12,
            color: darkMode ? "#f5f7ff" : "#162033",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          选择数据源
        </div>
        <div style={modalMutedTextStyle}>
          先选择目标数据库或中间件类型，再进入详细连接参数配置。
        </div>
      </div>
      {typeSelectWarning && (
        <Alert
          type="warning"
          showIcon
          closable
          message={`${typeSelectWarning.driverName} 驱动未启用`}
          description={
            <Space size={8}>
              <span>{typeSelectWarning.reason}</span>
              <Button
                type="link"
                size="small"
                onClick={() => onOpenDriverManager?.()}
              >
                去驱动管理安装
              </Button>
            </Space>
          }
          onClose={() => setTypeSelectWarning(null)}
        />
      )}
      <div
        style={{
          ...modalInnerSectionStyle,
          display: "flex",
          flex: 1,
          minHeight: 0,
          padding: 12,
        }}
      >
        {/* 左侧分类导航 */}
        <div
          style={{
            width: 148,
            borderRight: `1px solid ${step1SidebarDividerColor}`,
            paddingRight: 10,
            flexShrink: 0,
            overflowY: "auto",
          }}
        >
          {dbTypeGroups.map((group, idx) => (
            <div
              key={group.label}
              onClick={() => setActiveGroup(idx)}
              style={{
                padding: "11px 12px",
                cursor: "pointer",
                borderRadius: 12,
                marginBottom: 6,
                background:
                  activeGroup === idx ? step1SidebarActiveBg : "transparent",
                color:
                  activeGroup === idx ? step1SidebarActiveColor : undefined,
                fontWeight: activeGroup === idx ? 700 : 500,
                transition: "all 0.2s",
                fontSize: 13,
              }}
            >
              {group.label}
            </div>
          ))}
        </div>
        {/* 右侧数据源卡片 */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            paddingLeft: 18,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <Row gutter={[14, 14]}>
            {dbTypeGroups[activeGroup]?.items.map((item) => (
              <Col span={12} key={item.key}>
                <Card
                  hoverable
                  onClick={() => {
                    void handleTypeSelect(item.key);
                  }}
                  style={{
                    cursor: "pointer",
                    minHeight: 92,
                    borderRadius: 16,
                    border: darkMode
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid rgba(16,24,40,0.08)",
                    background: darkMode
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(255,255,255,0.80)",
                  }}
                  styles={{
                    body: {
                      padding: 14,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      height: "100%",
                    },
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      background: darkMode
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(22,119,255,0.08)",
                    }}
                  >
                    {item.icon}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text
                      strong
                      style={{
                        fontSize: 14,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "100%",
                        display: "block",
                      }}
                    >
                      {item.name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {getDbTypeHint(item.key)}
                    </Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const baseInfoSection = (
      <div style={modalInnerSectionStyle}>
        <div
          style={{
            marginBottom: 12,
            color: darkMode ? "#f5f7ff" : "#162033",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          基础信息
        </div>
        <div style={{ ...modalMutedTextStyle, marginBottom: 16 }}>
          常用参数集中在左侧，优先完成连接建立所需的最小输入。
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {renderConfigSectionCard({
            sectionKey: "identity",
            icon: <ApiOutlined />,
            badge: (
              <Tag>
                {getConnectionConfigLayoutKindLabel(connectionConfigLayout.kind)}
              </Tag>
            ),
            children: (
              <Form.Item name="name" label="连接名称" style={{ marginBottom: 0 }}>
                <Input
                  {...noAutoCapInputProps}
                  placeholder={
                    isJVM
                      ? "例如：本地 JVM / 订单服务 JVM"
                      : "例如：本地测试库"
                  }
                />
              </Form.Item>
            ),
          })}

          {!isCustom &&
            !isJVM &&
            renderConfigSectionCard({
              sectionKey: "uri",
              icon: <LinkOutlined />,
              children: (
                <>
                  <Form.Item
                    name="connectionInputMode"
                    label="填写方式"
                    help="选择连接 URL 或目标地址其中一种方式填写；保存/测试只读取当前选中的方式。"
                    style={{ marginBottom: isConnectionUrlMode ? 14 : 0 }}
                  >
                    <Segmented
                      block
                      options={[
                        {
                          label: "连接 URL",
                          value: "url",
                        },
                        {
                          label: isFileDb ? "数据库文件" : "目标地址",
                          value: "target",
                        },
                      ]}
                      onChange={handleConnectionInputModeChange}
                    />
                  </Form.Item>
                  {!isConnectionUrlMode && (
                    <Alert
                      showIcon
                      type="info"
                      message={
                        isFileDb
                          ? "当前使用数据库文件路径"
                          : "当前使用目标地址"
                      }
                      description="切换到目标地址会清空连接 URL，避免历史 URL 在保存或测试时覆盖下方主机、端口或文件路径。"
                    />
                  )}
                  {isConnectionUrlMode && (
                    <>
                      <Form.Item
                        name="uri"
                        label="连接 URL（可复制粘贴）"
                        help={
                          hasConnectionUriDraft
                            ? "URL 模式下保存/测试仅使用此连接 URL；如要填写主机、端口或文件路径，请切换到目标地址。"
                            : keepsStoredConnectionUri
                              ? "当前保留已保存连接 URL；输入新 URL 可替换，或切换到目标地址清除已保存 URL。"
                              : "URL 模式下必须填写连接 URL；支持从参数生成、复制到剪贴板，或粘贴后一键解析回填参数。"
                        }
                        rules={[createConnectionUriRule()]}
                      >
                        <Input.TextArea
                          {...noAutoCapInputProps}
                          rows={3}
                          placeholder={getUriPlaceholder()}
                        />
                      </Form.Item>
                      <Space
                        size={8}
                        style={{ marginBottom: uriFeedback ? 12 : 16 }}
                        wrap
                      >
                        <Button onClick={handleGenerateURI}>生成 URL</Button>
                        <Button onClick={handleParseURI}>从 URL 解析</Button>
                        <Button onClick={handleCopyURI}>复制 URL</Button>
                      </Space>
                      {uriFeedback && (
                        <Alert
                          showIcon
                          closable
                          type={uriFeedback.type}
                          message={uriFeedback.message}
                          onClose={() => setUriFeedback(null)}
                          style={{ marginBottom: 16 }}
                        />
                      )}
                      {renderStoredSecretControls({
                        fieldName: "uri",
                        clearKey: "opaqueURI",
                        hasStoredSecret: initialValues?.hasOpaqueURI,
                        clearLabel: "清除已保存 URL",
                        description:
                          "当前已保存连接 URL。留空表示继续沿用，输入新值表示替换。",
                      })}
                    </>
                  )}
                </>
              ),
            })}

          {showJdbcDriverSelector &&
            renderConfigSectionCard({
              sectionKey: "driverSelection",
              icon: <ClusterOutlined />,
              badge: currentDriverSnapshot?.defaultDriverName ? (
                <Tag color="blue">
                  默认：{currentDriverSnapshot.defaultDriverName}
                </Tag>
              ) : undefined,
              children: (
                <Form.Item
                  name="driver"
                  label="JDBC 驱动"
                  help="该数据源有多个可用兼容驱动；未选择时使用驱动管理中的默认驱动。"
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    placeholder="选择 JDBC 驱动"
                    popupMatchSelectWidth={false}
                    options={currentAvailableDriverOptions.map((option) => ({
                      value: option.driverType,
                      label: (
                        <Space size={6} wrap>
                          <span>{option.driverName}</span>
                          {option.default ? <Tag color="blue">默认</Tag> : null}
                          {option.reusedRuntime ? (
                            <Tag color="default">复用 runtime</Tag>
                          ) : null}
                        </Space>
                      ),
                    }))}
                    onChange={() => {
                      setTestResult(null);
                      setTestErrorLogOpen(false);
                    }}
                  />
                </Form.Item>
              ),
            })}

          {isCustom ? (
            <>
              {renderConfigSectionCard({
                sectionKey: "customDriver",
                icon: <CodeOutlined />,
                children: (
                  <>
                    <Alert
                      showIcon
                      type="info"
                      message="先在驱动管理新增自定义数据源，然后在这里直接选择"
                      description="自定义数据源的 Jar、名称与 DSN 模板都在驱动管理中维护；新建连接只选择已有数据源并填写实际 DSN。"
                      style={{ marginBottom: 16 }}
                    />
                    {customDataSources.length === 0 && (
                      <Alert
                        showIcon
                        type="warning"
                        message="还没有自定义数据源"
                        description="请先到驱动管理点击“新增自定义数据源”，上传 Jar 并填写 DSN 模板。"
                        style={{ marginBottom: 16 }}
                        action={
                          onOpenDriverManager ? (
                            <Button size="small" onClick={onOpenDriverManager}>
                              打开驱动管理
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                    <Form.Item
                      name="customDataSourceId"
                      label="自定义数据源"
                      rules={[
                        {
                          required: true,
                          message: "请先选择自定义数据源",
                        },
                      ]}
                    >
                      <Select
                        placeholder="选择已在驱动管理中创建的数据源"
                        popupMatchSelectWidth={false}
                        options={customDataSources.map((source) => ({
                          value: source.id,
                          label: `${source.name}（驱动：${source.driverType || source.driver || "未识别"}）`,
                        }))}
                        onChange={handleCustomDataSourceSelect}
                        notFoundContent="暂无自定义数据源，请先到驱动管理新增"
                      />
                    </Form.Item>
                    <Space size={8} wrap style={{ marginBottom: 16 }}>
                      {onOpenDriverManager ? (
                        <Button onClick={onOpenDriverManager}>打开驱动管理</Button>
                      ) : null}
                      <Button onClick={refreshCustomDataSources}>刷新列表</Button>
                      {selectedCustomDataSource ? (
                        <Tag color="blue">
                          当前：{selectedCustomDataSource.name}
                        </Tag>
                      ) : (
                        <Tag>未选择数据源</Tag>
                      )}
                      {selectedCustomDataSourceStatus?.definitionUsable ? (
                        <Tag color="success">定义可用</Tag>
                      ) : selectedCustomDataSourceStatus?.driverLoadable ? (
                        <Tag color="warning">驱动可加载</Tag>
                      ) : selectedCustomDataSource ? (
                        <Tag color="error">需修复/待校验</Tag>
                      ) : null}
                    </Space>
                    {selectedCustomDataSource?.description && (
                      <Alert
                        showIcon
                        type="success"
                        message={selectedCustomDataSource.description}
                        style={{ marginBottom: 16 }}
                      />
                    )}
                    {selectedCustomDataSource ? (
                      <Alert
                        showIcon
                        type={
                          selectedCustomDataSourceStatus?.definitionUsable
                            ? "success"
                            : selectedCustomDataSourceStatus?.driverLoadable
                              ? "warning"
                              : "error"
                        }
                        message={
                          selectedCustomDataSourceStatus?.message ||
                          "自定义数据源定义状态未知，请在驱动管理中校验"
                        }
                        description={(
                          <Space direction="vertical" size={4}>
                            <Text>
                              Driver Class：
                              {selectedCustomDataSource.driverClassName ||
                                "未发现/未记录"}
                            </Text>
                            {selectedCustomDataSource.version ? (
                              <Text>版本：{selectedCustomDataSource.version}</Text>
                            ) : null}
                            {selectedCustomDataSource.jarFileNames?.length ? (
                              <Text>
                                Jar：{selectedCustomDataSource.jarFileNames.join("、")}
                              </Text>
                            ) : null}
                            {selectedCustomDataSourceRepairHints.length > 0 ? (
                              <Text type="secondary">
                                修复建议：{selectedCustomDataSourceRepairHints.join("；")}
                              </Text>
                            ) : null}
                          </Space>
                        )}
                        style={{ marginBottom: 16 }}
                      />
                    ) : null}
                    <Form.Item
                      name="driver"
                      label="驱动标识"
                      rules={[
                        {
                          required: true,
                          message: "请选择包含驱动标识的自定义数据源",
                        },
                      ]}
                      help="由驱动管理上传 Jar 后自动生成；如需变更，请回到驱动管理重新新增自定义数据源。"
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        disabled
                        placeholder="选择自定义数据源后自动带出"
                      />
                    </Form.Item>
                  </>
                ),
              })}
              {renderConfigSectionCard({
                sectionKey: "customDsn",
                icon: <FileTextOutlined />,
                children: (
                  <>
                    <Form.Item
                      name="dsn"
                      label="连接字符串 (DSN)"
                      rules={[createCustomDsnRule()]}
                      help={
                        selectedCustomDataSource?.dsnTemplate
                          ? `当前数据源模板：${selectedCustomDataSource.dsnTemplate}`
                          : "填写该自定义数据源对应驱动要求的 JDBC URL 或 DSN。"
                      }
                    >
                      <Input.TextArea
                        {...noAutoCapInputProps}
                        rows={4}
                        placeholder={
                          selectedCustomDataSource?.dsnTemplate ||
                          "例如: jdbc:trino://localhost:8080/catalog/schema"
                        }
                      />
                    </Form.Item>
                    {selectedCustomDataSource?.dsnHelp ? (
                      <Alert
                        showIcon
                        type="info"
                        message="DSN 填写说明"
                        description={selectedCustomDataSource.dsnHelp}
                        style={{ marginBottom: 16 }}
                      />
                    ) : null}
                    {renderStoredSecretControls({
                      fieldName: "dsn",
                      clearKey: "opaqueDSN",
                      hasStoredSecret: initialValues?.hasOpaqueDSN,
                      clearLabel: "清除已保存 DSN",
                      description:
                        "当前已保存连接字符串。留空表示继续沿用，输入新值表示替换。",
                    })}
                  </>
                ),
              })}
              {renderConfigSectionCard({
                sectionKey: "credentials",
                icon: <SafetyCertificateOutlined />,
                children: (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 16,
                      }}
                    >
                      <Form.Item
                        name="user"
                        label="用户名 (可选)"
                        style={{ marginBottom: 0 }}
                        help="如果所选 JDBC 驱动支持 user 属性，可在这里填写；也可以继续放在 DSN 中。"
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder="例如：db_user"
                        />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label="密码 (可选)"
                        style={{ marginBottom: 0 }}
                        help="保存后走现有密文存储；留空不覆盖已保存密码。"
                      >
                        <Input.Password
                          {...noAutoCapInputProps}
                          placeholder={getStoredSecretPlaceholder({
                            hasStoredSecret: initialValues?.hasPrimaryPassword,
                            emptyPlaceholder: "数据库密码",
                            retainedLabel: "已保存密码",
                          })}
                        />
                      </Form.Item>
                    </div>
                    {renderStoredSecretControls({
                      fieldName: "password",
                      clearKey: "primaryPassword",
                      hasStoredSecret: initialValues?.hasPrimaryPassword,
                      clearLabel: "清除已保存密码",
                      description:
                        "当前已保存自定义连接密码。留空表示继续沿用，输入新值表示替换。",
                    })}
                    <Alert
                      showIcon
                      type="info"
                      message="密码也可以继续写在 DSN 中"
                      description="这里填写的用户名/密码会作为 JDBC connection properties 传给驱动；少数驱动如果只接受 DSN 参数，请按驱动文档在 DSN 中配置。"
                      style={{ marginTop: 16, marginBottom: 0 }}
                    />
                  </>
                ),
              })}
            </>
          ) : isJVM ? (
          <>
            {unsupportedJvmModeMessage && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="检测到未支持的 JVM 模式"
                description={unsupportedJvmModeMessage}
              />
            )}
            <div style={{ display: "grid", gap: 16 }}>
              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <GatewayOutlined />,
                  "目标 JVM",
                  "定义连接树中的主机入口和基础运行环境。",
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 120px",
                    gap: 16,
                    alignItems: "start",
                  }}
                >
                  <Form.Item
                    name="host"
                    label="主机地址"
                    rules={[{ required: true, message: "请输入 JVM 主机地址" }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input {...noAutoCapInputProps} placeholder="localhost" />
                  </Form.Item>
                  <Form.Item
                    name="port"
                    label="主端口"
                    rules={[{ required: true, message: "请输入 JVM 端口号" }]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber style={{ width: "100%" }} min={1} max={65535} />
                  </Form.Item>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 16,
                    marginTop: 16,
                  }}
                >
                  <div style={{ display: "grid", gap: 8 }}>
                    <Text strong>环境</Text>
                    {renderChoiceCards({
                      fieldName: "jvmEnvironment",
                      value: String(jvmEnvironment),
                      minWidth: 120,
                      options: [
                        {
                          value: "dev",
                          label: "开发 / 测试",
                          description: "本地或测试环境。",
                        },
                        {
                          value: "uat",
                          label: "预发 / 验收",
                          description: "上线前验证环境。",
                        },
                        {
                          value: "prod",
                          label: "生产",
                          description: "生产 JVM，默认更谨慎。",
                        },
                      ],
                    })}
                  </div>
                  <Form.Item
                    name="timeout"
                    label="连接超时（秒）"
                    rules={[
                      {
                        type: "number",
                        min: 1,
                        max: 300,
                        message: "超时时间范围: 1-300 秒",
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      style={{ width: "100%" }}
                      min={1}
                      max={300}
                      placeholder="30"
                    />
                  </Form.Item>
                  <Form.Item
                    name="jvmReadOnly"
                    label="安全策略"
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Checkbox>只读优先</Checkbox>
                  </Form.Item>
                </div>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <ClusterOutlined />,
                  "接入模式",
                  "通过卡片选择允许使用的 JVM 通道；已启用卡片再次点击会设为首选。",
                )}
                <Form.Item
                  name="jvmAllowedModes"
                  hidden
                  rules={[
                    {
                      required: true,
                      message: "请至少选择一种 JVM 接入模式",
                    },
                  ]}
                >
                  <Select mode="multiple" />
                </Form.Item>
                <Form.Item
                  name="jvmPreferredMode"
                  hidden
                  rules={[
                    {
                      required: true,
                      message: "请选择首选 JVM 接入模式",
                    },
                  ]}
                >
                  <Input {...noAutoCapInputProps} />
                </Form.Item>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 14,
                  }}
                >
                  {JVM_EDITABLE_MODES.map((mode) => {
                    const meta = resolveJVMModeMeta(mode);
                    const enabled = normalizedJvmAllowedModes.includes(mode);
                    const preferred = jvmPreferredMode === mode;
                    return (
                      <div
                        key={mode}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleJvmModeCardSelect(mode)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleJvmModeCardSelect(mode);
                          }
                        }}
                        aria-pressed={enabled}
                        style={{
                          textAlign: "left",
                          padding: 14,
                          borderRadius: 16,
                          border: enabled
                            ? darkMode
                              ? "1px solid rgba(255,214,102,0.36)"
                              : "1px solid rgba(22,119,255,0.34)"
                            : darkMode
                              ? "1px solid rgba(255,255,255,0.08)"
                              : "1px solid rgba(16,24,40,0.08)",
                          background: enabled
                            ? darkMode
                              ? "rgba(255,214,102,0.08)"
                              : "rgba(22,119,255,0.06)"
                            : darkMode
                              ? "rgba(255,255,255,0.03)"
                              : "rgba(16,24,40,0.03)",
                          boxShadow: preferred
                            ? darkMode
                              ? "0 0 0 2px rgba(255,214,102,0.12)"
                              : "0 0 0 2px rgba(22,119,255,0.10)"
                            : "none",
                          color: darkMode ? "#f5f7ff" : "#162033",
                          cursor: "pointer",
                          transition: "all 120ms ease",
                        }}
                      >
                        <Space size={8} wrap>
                          <Tag color={enabled ? "blue" : "default"}>
                            {meta.label}
                          </Tag>
                          {preferred ? <Tag color="green">首选</Tag> : null}
                          {!enabled ? <Tag>未启用</Tag> : null}
                        </Space>
                        <div style={{ ...modalMutedTextStyle, marginTop: 8 }}>
                          {mode === "jmx"
                            ? "标准 MBean 与线程、内存、类加载等运行时指标。"
                            : mode === "endpoint"
                              ? "通过服务端管理接口读取 JVM 资源与配置。"
                              : "通过 JavaNavi Java Agent 提供更完整的增强能力。"}
                        </div>
                        <Button
                          size="small"
                          type={enabled ? "default" : "primary"}
                          disabled={enabled && normalizedJvmAllowedModes.length <= 1}
                          onClick={(event) => handleJvmModeToggle(mode, event)}
                          style={{ marginTop: 12, borderRadius: 999 }}
                        >
                          {enabled ? "停用" : "启用并设为首选"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ ...modalMutedTextStyle, marginTop: 12 }}>
                  当前首选：
                  {resolveJVMModeMeta(String(jvmPreferredMode || "jmx")).label}
                  。至少保留一种接入模式，停用首选模式时会自动切换到剩余模式。
                </div>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <ApiOutlined />,
                  "JMX",
                  "标准 JVM 管理通道，可覆盖主机/端口并配置认证。",
                  <Tag color={normalizedJvmAllowedModes.includes("jmx") ? "green" : "default"}>
                    {normalizedJvmAllowedModes.includes("jmx") ? "已启用" : "未启用"}
                  </Tag>,
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 120px",
                    gap: 16,
                  }}
                >
                  <Form.Item
                    name="jvmJmxHost"
                    label="JMX 主机覆盖（可选）"
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      {...noAutoCapInputProps}
                      disabled={!normalizedJvmAllowedModes.includes("jmx")}
                      placeholder="留空沿用主机地址"
                    />
                  </Form.Item>
                  <Form.Item
                    name="jvmJmxPort"
                    label="JMX 端口"
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      style={{ width: "100%" }}
                      min={1}
                      max={65535}
                      disabled={!normalizedJvmAllowedModes.includes("jmx")}
                      placeholder="沿用主端口"
                    />
                  </Form.Item>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 16,
                    marginTop: 16,
                  }}
                >
                  <Form.Item
                    name="jvmJmxUsername"
                    label="JMX 用户名（可选）"
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      {...noAutoCapInputProps}
                      disabled={!normalizedJvmAllowedModes.includes("jmx")}
                      placeholder="未开启认证可留空"
                    />
                  </Form.Item>
                  <Form.Item
                    name="jvmJmxPassword"
                    label="JMX 密码（可选）"
                    style={{ marginBottom: 0 }}
                  >
                    <Input.Password
                      {...noAutoCapInputProps}
                      disabled={!normalizedJvmAllowedModes.includes("jmx")}
                      placeholder="未开启认证可留空"
                    />
                  </Form.Item>
                </div>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <CodeOutlined />,
                  "Endpoint",
                  "连接应用暴露的 JVM 管理端点，适合已有运维 API 的服务。",
                  <Tag
                    color={
                      normalizedJvmAllowedModes.includes("endpoint")
                        ? "green"
                        : "default"
                    }
                  >
                    {normalizedJvmAllowedModes.includes("endpoint")
                      ? "已启用"
                      : "未启用"}
                  </Tag>,
                )}
                <Form.Item
                  name="jvmEndpointBaseUrl"
                  label="Endpoint 地址"
                  rules={[
                    {
                      required: jvmPreferredMode === "endpoint",
                      message: "启用 Endpoint 模式时请输入 Endpoint 地址",
                    },
                  ]}
                  help="例如 Spring Boot Actuator 或自定义管理接口地址。"
                >
                  <Input
                    {...noAutoCapInputProps}
                    disabled={!normalizedJvmAllowedModes.includes("endpoint")}
                    placeholder="例如：https://orders.internal/manage/jvm"
                  />
                </Form.Item>
                <Form.Item
                  name="jvmEndpointApiKey"
                  label="Endpoint API Key（可选）"
                  style={{ marginBottom: 0 }}
                >
                  <Input.Password
                    {...noAutoCapInputProps}
                    disabled={!normalizedJvmAllowedModes.includes("endpoint")}
                    placeholder="端点受 Token 保护时填写"
                  />
                </Form.Item>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <ThunderboltOutlined />,
                  "Agent",
                  "连接 JavaNavi Java Agent 管理端口，用于增强采集和诊断链路。",
                  <Tag color={normalizedJvmAllowedModes.includes("agent") ? "green" : "default"}>
                    {normalizedJvmAllowedModes.includes("agent") ? "已启用" : "未启用"}
                  </Tag>,
                )}
                <Form.Item
                  name="jvmAgentBaseUrl"
                  label="Agent 地址"
                  rules={[
                    {
                      required: jvmPreferredMode === "agent",
                      message: "启用 Agent 模式时请输入 Agent 地址",
                    },
                  ]}
                  help="目标 Java 服务需要以 -javaagent 方式启动 JavaNavi Agent。"
                >
                  <Input
                    {...noAutoCapInputProps}
                    disabled={!normalizedJvmAllowedModes.includes("agent")}
                    placeholder="例如：http://127.0.0.1:19090/javanavi/agent/jvm"
                  />
                </Form.Item>
                <Form.Item
                  name="jvmAgentApiKey"
                  label="Agent API Key（可选）"
                  style={{ marginBottom: 0 }}
                >
                  <Input.Password
                    {...noAutoCapInputProps}
                    disabled={!normalizedJvmAllowedModes.includes("agent")}
                    placeholder="Agent 启用 Token 校验时填写"
                  />
                </Form.Item>
              </div>

              <div style={jvmSectionCardStyle()}>
                {renderJvmSectionHeader(
                  <SafetyCertificateOutlined />,
                  "诊断增强",
                  "开启后可创建 JVM 诊断会话并执行受控 Arthas/诊断命令。",
                  <Form.Item
                    name="jvmDiagnosticEnabled"
                    valuePropName="checked"
                    style={{ marginBottom: 0 }}
                  >
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>,
                )}
                {jvmDiagnosticEnabled ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "220px minmax(0, 1fr)",
                        gap: 16,
                      }}
                    >
                      <div style={{ display: "grid", gap: 8 }}>
                        <Text strong>诊断传输</Text>
                        {renderChoiceCards({
                          fieldName: "jvmDiagnosticTransport",
                          value: String(jvmDiagnosticTransport),
                          options: [
                            {
                              value: "agent-bridge",
                              label: "Agent Bridge",
                              description: "通过 JavaNavi Agent 桥接诊断命令。",
                            },
                            {
                              value: "arthas-tunnel",
                              label: "Arthas Tunnel",
                              description: "连接官方 Tunnel / Web Console。",
                            },
                          ],
                        })}
                      </div>
                      <Form.Item
                        name="jvmDiagnosticBaseUrl"
                        label={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? "Arthas Tunnel 地址"
                            : "诊断 Bridge 地址"
                        }
                        rules={[
                          {
                            required: true,
                            message:
                              jvmDiagnosticTransport === "arthas-tunnel"
                                ? "请输入 Arthas Tunnel Server 地址"
                                : "请输入诊断 Bridge 地址",
                          },
                        ]}
                        help={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? "例如：http://127.0.0.1:7777，支持反向代理后的访问前缀。"
                            : "例如：http://127.0.0.1:19091/javanavi/diag"
                        }
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder={
                            jvmDiagnosticTransport === "arthas-tunnel"
                              ? "http://127.0.0.1:7777"
                              : "http://127.0.0.1:19091/javanavi/diag"
                          }
                        />
                      </Form.Item>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) 220px",
                        gap: 16,
                      }}
                    >
                      <Form.Item
                        name="jvmDiagnosticTargetId"
                        label={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? "目标实例标识（AgentId）"
                            : "目标实例标识"
                        }
                        rules={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? [
                                {
                                  required: true,
                                  message:
                                    "Arthas Tunnel 模式必须填写目标实例标识",
                                },
                              ]
                            : undefined
                        }
                        help={
                          jvmDiagnosticTransport === "arthas-tunnel"
                            ? "填写 Arthas Tunnel 中目标 JVM 的 agentId。"
                            : "可选，用于在桥接端区分具体 JVM 实例。"
                        }
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder={
                            jvmDiagnosticTransport === "arthas-tunnel"
                              ? "例如：orders-app_A1B2C3D4E5"
                              : "例如：orders-prod-01"
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name="jvmDiagnosticTimeoutSeconds"
                        label="诊断超时（秒）"
                        rules={[
                          {
                            type: "number",
                            min: 1,
                            max: 300,
                            message: "诊断超时时间范围: 1-300 秒",
                          },
                        ]}
                      >
                        <InputNumber style={{ width: "100%" }} min={1} max={300} />
                      </Form.Item>
                    </div>
                    <Form.Item
                      name="jvmDiagnosticApiKey"
                      label="诊断 API Key（可选）"
                    >
                      <Input.Password
                        {...noAutoCapInputProps}
                        placeholder="诊断桥接端启用 Token 校验时填写"
                      />
                    </Form.Item>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 10,
                      }}
                    >
                      {[
                        {
                          name: "jvmDiagnosticAllowObserveCommands",
                          label: "观察类命令",
                          description: "thread、dashboard、jvm 等只读排查命令。",
                        },
                        {
                          name: "jvmDiagnosticAllowTraceCommands",
                          label: "跟踪类命令",
                          description: "trace、watch 等对目标有额外开销的命令。",
                        },
                        {
                          name: "jvmDiagnosticAllowMutatingCommands",
                          label: "高风险命令",
                          description: "可能改变运行态或造成明显性能影响的命令。",
                        },
                      ].map((item) => (
                        <div
                          key={item.name}
                          style={{
                            padding: 12,
                            borderRadius: 14,
                            background: darkMode
                              ? "rgba(255,255,255,0.04)"
                              : "rgba(16,24,40,0.04)",
                          }}
                        >
                          <Form.Item
                            name={item.name}
                            valuePropName="checked"
                            style={{ marginBottom: 6 }}
                          >
                            <Checkbox>{item.label}</Checkbox>
                          </Form.Item>
                          <div style={modalMutedTextStyle}>
                            {item.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      ...modalMutedTextStyle,
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: darkMode
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(16,24,40,0.04)",
                    }}
                  >
                    关闭时只保存 JVM 连接与监控能力，不显示诊断会话入口。
                  </div>
                )}
              </div>
            </div>
          </>
          ) : (
            <>
              {!isConnectionUrlMode &&
                renderConfigSectionCard({
                  sectionKey: isFileDb ? "fileTarget" : "target",
                  icon: isFileDb ? <FileTextOutlined /> : <GatewayOutlined />,
                  children: (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) 120px",
                        gap: 16,
                        alignItems: "start",
                      }}
                    >
                      <Form.Item
                        name="host"
                        label={
                          isFileDb ? "文件路径 (绝对路径)" : "主机地址 (Host)"
                        }
                        rules={[createUriAwareRequiredRule("请输入地址/路径")]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder={
                            isFileDb
                              ? dbType === "duckdb"
                                ? "/path/to/db.duckdb"
                                : "/path/to/db.sqlite"
                              : "localhost"
                          }
                        />
                      </Form.Item>
                      {isFileDb ? (
                        <Form.Item label=" " style={{ marginBottom: 0 }}>
                          <Button
                            style={{ width: "100%" }}
                            onClick={handleSelectDatabaseFile}
                            loading={selectingDbFile}
                          >
                            浏览...
                          </Button>
                        </Form.Item>
                      ) : (
                        <Form.Item
                          name="port"
                          label="端口 (Port)"
                          rules={[
                            createUriAwareRequiredRule(
                              "请输入端口号",
                              (value) => Number(value) > 0,
                            ),
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber style={{ width: "100%" }} />
                        </Form.Item>
                      )}
                    </div>
                  ),
                })}

              {(dbType === "postgres" ||
                dbType === "kingbase" ||
                dbType === "highgo" ||
                dbType === "vastbase") &&
                renderConfigSectionCard({
                  sectionKey: "service",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="database"
                      label="默认连接数据库（可选）"
                      help="留空会自动尝试 postgres、template1、与当前用户名同名数据库"
                      style={{ marginBottom: 0 }}
                    >
                      <Input {...noAutoCapInputProps} placeholder="例如：appdb" />
                    </Form.Item>
                  ),
                })}

              {dbType === "oracle" &&
                renderConfigSectionCard({
                  sectionKey: "service",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="database"
                      label="服务名 (Service Name)"
                      rules={[
                        createUriAwareRequiredRule(
                          "请输入 Oracle 服务名（例如 ORCLPDB1）",
                        ),
                      ]}
                      help="请填写监听器注册的 SERVICE_NAME（不是用户名）。例如：ORCLPDB1"
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder="例如：ORCLPDB1"
                      />
                    </Form.Item>
                  ),
                })}

              {isMySQLLike &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: renderChoiceCards({
                    fieldName: "mysqlTopology",
                    value: String(mysqlTopology),
                    options: [
                      {
                        value: "single",
                        label: "单机模式",
                        description: "只连接一个主库地址，适合本地和单实例。",
                      },
                      {
                        value: "replica",
                        label: "主从模式",
                        description: "主库优先，可配置从库地址用于切换。",
                      },
                    ],
                  }),
                })}

              {isMySQLLike &&
                mysqlTopology === "replica" &&
                renderConfigSectionCard({
                  sectionKey: "replica",
                  icon: <ClusterOutlined />,
                  children: (
                    <>
                      <Form.Item
                        name="mysqlReplicaHosts"
                        label="从库地址列表"
                        help="可输入多个从库地址，格式：host:port（回车确认）"
                      >
                        <Select
                          mode="tags"
                          placeholder="例如：10.10.0.12:3306、10.10.0.13:3306"
                          tokenSeparators={[",", ";", " "]}
                        />
                      </Form.Item>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="mysqlReplicaUser"
                          label="从库用户名（可选）"
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder="留空沿用主库用户名"
                          />
                        </Form.Item>
                        <Form.Item
                          name="mysqlReplicaPassword"
                          label="从库密码（可选）"
                          style={{ marginBottom: 0 }}
                        >
                          <Input.Password
                            {...noAutoCapInputProps}
                            placeholder={getStoredSecretPlaceholder({
                              hasStoredSecret:
                                initialValues?.hasMySQLReplicaPassword,
                              emptyPlaceholder: "留空沿用主库密码",
                              retainedLabel: "已保存从库密码",
                            })}
                          />
                        </Form.Item>
                      </div>
                      {renderStoredSecretControls({
                        fieldName: "mysqlReplicaPassword",
                        clearKey: "mysqlReplicaPassword",
                        hasStoredSecret: initialValues?.hasMySQLReplicaPassword,
                        clearLabel: "清除已保存从库密码",
                        description:
                          "当前已保存从库密码。留空表示继续沿用，输入新值表示替换。",
                      })}
                    </>
                  ),
                })}

              {dbType === "mongodb" &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: renderChoiceCards({
                    fieldName: "mongoTopology",
                    value: String(mongoTopology),
                    options: [
                      {
                        value: "single",
                        label: "单机模式",
                        description: "只连接一个 MongoDB 节点。",
                      },
                      {
                        value: "replica",
                        label: "副本集 / 多节点",
                        description: "配置副本集名称和多个候选节点。",
                      },
                    ],
                  }),
                })}

              {dbType === "mongodb" &&
                renderConfigSectionCard({
                  sectionKey: "mongoDiscovery",
                  icon: <ApiOutlined />,
                  children: (
                    <>
                      <Form.Item name="mongoSrv" hidden valuePropName="checked">
                        <Checkbox />
                      </Form.Item>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 10,
                        }}
                      >
                        {[
                          {
                            value: false,
                            label: "标准地址",
                            description: "使用 host:port 直连或副本集节点列表。",
                          },
                          {
                            value: true,
                            label: "SRV 地址",
                            description:
                              "使用 mongodb+srv，由 DNS 发现目标节点。",
                          },
                        ].map((option) => {
                          const active = mongoSrv === option.value;
                          return (
                            <button
                              key={String(option.value)}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setChoiceFieldValue("mongoSrv", option.value)
                              }
                              style={{
                                textAlign: "left",
                                padding: "12px 14px",
                                borderRadius: 14,
                                border: active
                                  ? darkMode
                                    ? "1px solid rgba(255,214,102,0.42)"
                                    : "1px solid rgba(22,119,255,0.36)"
                                  : darkMode
                                    ? "1px solid rgba(255,255,255,0.08)"
                                    : "1px solid rgba(16,24,40,0.08)",
                                background: active
                                  ? darkMode
                                    ? "rgba(255,214,102,0.10)"
                                    : "rgba(22,119,255,0.07)"
                                  : darkMode
                                    ? "rgba(255,255,255,0.03)"
                                    : "rgba(16,24,40,0.03)",
                                color: darkMode ? "#f5f7ff" : "#162033",
                                cursor: "pointer",
                              }}
                            >
                              <Space size={8} wrap>
                                <Text strong>{option.label}</Text>
                                {active ? <Tag color="blue">当前</Tag> : null}
                              </Space>
                              <div
                                style={{
                                  ...modalMutedTextStyle,
                                  marginTop: 6,
                                }}
                              >
                                {option.description}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {mongoSrv && useSSH && (
                        <Alert
                          type="warning"
                          showIcon
                          style={{ marginTop: 12 }}
                          message="SRV 与 SSH 隧道同时启用时，可能依赖本地 DNS 解析能力"
                        />
                      )}
                    </>
                  ),
                })}

              {dbType === "mongodb" &&
                mongoTopology === "replica" &&
                renderConfigSectionCard({
                  sectionKey: "replica",
                  icon: <ClusterOutlined />,
                  children: (
                    <>
                      <Form.Item
                        name="mongoHosts"
                        label={
                          mongoSrv ? "附加 SRV 主机（可选）" : "附加节点地址"
                        }
                        help={
                          mongoSrv
                            ? "可输入多个候选主机名，格式：host；若留空则仅使用上方主机。"
                            : "可输入多个节点地址，格式：host:port（回车确认）"
                        }
                      >
                        <Select
                          mode="tags"
                          placeholder={
                            mongoSrv
                              ? "例如：cluster-a.example.com、cluster-b.example.com"
                              : "例如：10.10.0.12:27017、10.10.0.13:27017"
                          }
                          tokenSeparators={[",", ";", " "]}
                        />
                      </Form.Item>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="mongoReplicaSet"
                          label="副本集名称（可选）"
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder="例如：rs0"
                          />
                        </Form.Item>
                        <Form.Item
                          name="mongoReplicaUser"
                          label="副本集用户名（可选）"
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder="留空沿用主用户名"
                          />
                        </Form.Item>
                      </div>
                      <Form.Item
                        name="mongoReplicaPassword"
                        label="副本集密码（可选）"
                        style={{ marginTop: 16, marginBottom: 0 }}
                      >
                        <Input.Password
                          {...noAutoCapInputProps}
                          placeholder={getStoredSecretPlaceholder({
                            hasStoredSecret:
                              initialValues?.hasMongoReplicaPassword,
                            emptyPlaceholder: "留空沿用主密码",
                            retainedLabel: "已保存副本集密码",
                          })}
                        />
                      </Form.Item>
                      {renderStoredSecretControls({
                        fieldName: "mongoReplicaPassword",
                        clearKey: "mongoReplicaPassword",
                        hasStoredSecret: initialValues?.hasMongoReplicaPassword,
                        clearLabel: "清除已保存副本集密码",
                        description:
                          "当前已保存副本集密码。留空表示继续沿用，输入新值表示替换。",
                      })}
                      <Space
                        size={8}
                        style={{ marginTop: 12, marginBottom: 12 }}
                      >
                        <Button
                          onClick={handleDiscoverMongoMembers}
                          loading={discoveringMembers}
                        >
                          自动发现成员
                        </Button>
                      </Space>
                      {mongoMembers.length > 0 && (
                        <Table
                          size="small"
                          rowKey={(record) => record.host}
                          pagination={false}
                          dataSource={mongoMembers}
                          style={{ marginBottom: 12 }}
                          columns={[
                            { title: "Host", dataIndex: "host", width: "48%" },
                            {
                              title: "角色",
                              dataIndex: "role",
                              width: "32%",
                              render: (
                                value: string,
                                record: MongoMemberInfo,
                              ) => (
                                <Tag
                                  color={record.isSelf ? "blue" : "default"}
                                >
                                  {value || "UNKNOWN"}
                                </Tag>
                              ),
                            },
                            {
                              title: "健康",
                              dataIndex: "healthy",
                              width: "20%",
                              render: (value: boolean) => (
                                <Tag color={value ? "success" : "error"}>
                                  {value ? "正常" : "异常"}
                                </Tag>
                              ),
                            },
                          ]}
                        />
                      )}
                    </>
                  ),
                })}

              {dbType === "mongodb" &&
                renderConfigSectionCard({
                  sectionKey: "mongoPolicy",
                  icon: <ThunderboltOutlined />,
                  children: (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 16,
                      }}
                    >
                      <Form.Item
                        name="mongoAuthSource"
                        label="认证库 (authSource)"
                        style={{ marginBottom: 0 }}
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder="默认使用 database 或 admin"
                        />
                      </Form.Item>
                      <div style={{ display: "grid", gap: 8 }}>
                        <Text strong>读偏好 (readPreference)</Text>
                        {renderChoiceCards({
                          fieldName: "mongoReadPreference",
                          value: String(mongoReadPreference),
                          minWidth: 130,
                          options: [
                            {
                              value: "primary",
                              label: "primary",
                              description: "只读主节点。",
                            },
                            {
                              value: "primaryPreferred",
                              label: "primaryPreferred",
                              description: "主节点优先。",
                            },
                            {
                              value: "secondary",
                              label: "secondary",
                              description: "只读从节点。",
                            },
                            {
                              value: "secondaryPreferred",
                              label: "secondaryPreferred",
                              description: "从节点优先。",
                            },
                            {
                              value: "nearest",
                              label: "nearest",
                              description: "选择最近节点。",
                            },
                          ],
                        })}
                      </div>
                    </div>
                  ),
                })}

              {isRedis &&
                renderConfigSectionCard({
                  sectionKey: "connectionMode",
                  icon: <ClusterOutlined />,
                  children: (
                    <>
                      {renderChoiceCards({
                        fieldName: "redisTopology",
                        value: String(redisTopology),
                        options: [
                          {
                            value: "single",
                            label: "单机模式",
                            description: "只连接一个 Redis 节点。",
                          },
                          {
                            value: "cluster",
                            label: "集群模式",
                            description: "Redis Cluster，配置多个种子节点。",
                          },
                        ],
                      })}
                      {redisTopology === "cluster" && (
                        <Form.Item
                          name="redisHosts"
                          label="集群附加节点地址"
                          help="主节点使用上方主机地址；这里填写其他种子节点，格式：host:port"
                          style={{ marginTop: 16, marginBottom: 0 }}
                        >
                          <Select
                            mode="tags"
                            placeholder="例如：10.10.0.12:6379、10.10.0.13:6379"
                            tokenSeparators={[",", ";", " "]}
                          />
                        </Form.Item>
                      )}
                    </>
                  ),
                })}

              {isRedis &&
                renderConfigSectionCard({
                  sectionKey: "credentials",
                  icon: <SafetyCertificateOutlined />,
                  children: (
                    <>
                      <Form.Item name="password" label="密码 (可选)">
                        <Input.Password
                          {...noAutoCapInputProps}
                          placeholder={getStoredSecretPlaceholder({
                            hasStoredSecret: initialValues?.hasPrimaryPassword,
                            emptyPlaceholder:
                              "Redis 密码（如果设置了 requirepass）",
                            retainedLabel: "已保存 Redis 密码",
                          })}
                        />
                      </Form.Item>
                      {renderStoredSecretControls({
                        fieldName: "password",
                        clearKey: "primaryPassword",
                        hasStoredSecret: initialValues?.hasPrimaryPassword,
                        clearLabel: "清除已保存密码",
                        description:
                          "当前已保存 Redis 密码。留空表示继续沿用，输入新值表示替换。",
                      })}
                    </>
                  ),
                })}

              {isRedis &&
                renderConfigSectionCard({
                  sectionKey: "databaseScope",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="includeRedisDatabases"
                      label="显示数据库 (留空显示全部)"
                      help="连接测试成功后可选择"
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        mode="multiple"
                        placeholder="选择显示的数据库 (0-15)"
                        allowClear
                      >
                        {redisDbList.map((db) => (
                          <Select.Option key={db} value={db}>
                            db{db}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  ),
                })}

              {!isFileDb &&
                !isRedis &&
                renderConfigSectionCard({
                  sectionKey: "credentials",
                  icon: <SafetyCertificateOutlined />,
                  children: (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            dbType === "mongodb"
                              ? "minmax(0, 1fr) minmax(0, 1fr) 180px"
                              : "repeat(2, minmax(0, 1fr))",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="user"
                          label="用户名"
                          rules={
                            dbType === "mongodb"
                              ? []
                              : [createUriAwareRequiredRule("请输入用户名")]
                          }
                          style={{ marginBottom: 0 }}
                        >
                          <Input {...noAutoCapInputProps} />
                        </Form.Item>
                        <Form.Item
                          name="password"
                          label="密码"
                          style={{ marginBottom: 0 }}
                        >
                          <Input.Password
                            {...noAutoCapInputProps}
                            placeholder={getStoredSecretPlaceholder({
                              hasStoredSecret:
                                initialValues?.hasPrimaryPassword,
                              emptyPlaceholder: "密码",
                              retainedLabel: "已保存密码",
                            })}
                          />
                        </Form.Item>
                        {dbType === "mongodb" && (
                          <div style={{ display: "grid", gap: 8 }}>
                            <Text strong>验证方式</Text>
                            {renderChoiceCards({
                              fieldName: "mongoAuthMechanism",
                              value: String(mongoAuthMechanism),
                              minWidth: 150,
                              options: [
                                {
                                  value: "",
                                  label: "自动协商",
                                  description: "交给驱动按服务端能力选择。",
                                },
                                {
                                  value: "NONE",
                                  label: "无认证",
                                  description: "不发送认证信息。",
                                },
                                {
                                  value: "SCRAM-SHA-1",
                                  label: "SCRAM-SHA-1",
                                  description: "兼容旧版本 MongoDB。",
                                },
                                {
                                  value: "SCRAM-SHA-256",
                                  label: "SCRAM-SHA-256",
                                  description: "推荐的 SCRAM 认证。",
                                },
                                {
                                  value: "MONGODB-AWS",
                                  label: "MONGODB-AWS",
                                  description: "AWS IAM 认证。",
                                },
                              ],
                            })}
                          </div>
                        )}
                      </div>
                      {renderStoredSecretControls({
                        fieldName: "password",
                        clearKey: "primaryPassword",
                        hasStoredSecret: initialValues?.hasPrimaryPassword,
                        clearLabel: "清除已保存密码",
                        description:
                          "当前已保存主连接密码。留空表示继续沿用，输入新值表示替换。",
                      })}
                      {dbType === "mongodb" && (
                        <Form.Item
                          name="savePassword"
                          valuePropName="checked"
                          style={{ marginTop: 12, marginBottom: 0 }}
                        >
                          <Checkbox>保存密码</Checkbox>
                        </Form.Item>
                      )}
                    </>
                  ),
                })}

              {!isFileDb &&
                !isRedis &&
                renderConfigSectionCard({
                  sectionKey: "databaseScope",
                  icon: <DatabaseOutlined />,
                  children: (
                    <Form.Item
                      name="includeDatabases"
                      label="显示数据库 (留空显示全部)"
                      help="连接测试成功后可选择"
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        mode="multiple"
                        placeholder="选择显示的数据库"
                        allowClear
                      >
                        {dbList.map((db) => (
                          <Select.Option key={db} value={db}>
                            {db}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  ),
                })}
            </>
          )}
        </div>
      </div>
    );

    const networkSecuritySection =
      !isFileDb && !isJVM
        ? (() => {
            const networkItems: Array<{
              key: "ssl" | "ssh" | "proxy" | "httpTunnel";
              title: string;
              description: string;
              enabled: boolean;
            }> = [
              ...(isSSLType
                ? [
                    {
                      key: "ssl" as const,
                      title: "SSL/TLS",
                      description: "加密与证书校验",
                      enabled: useSSL,
                    },
                  ]
                : []),
              {
                key: "ssh",
                title: "SSH 隧道",
                description: "跳板机 / 堡垒机转发",
                enabled: useSSH,
              },
              {
                key: "proxy",
                title: "代理",
                description: "SOCKS5 / HTTP CONNECT",
                enabled: useProxy,
              },
              {
                key: "httpTunnel",
                title: "HTTP 隧道",
                description: "独立 HTTP CONNECT 路由",
                enabled: useHttpTunnel,
              },
            ];
            const resolvedNetworkConfig = networkItems.some(
              (item) => item.key === activeNetworkConfig,
            )
              ? activeNetworkConfig
              : networkItems[0]?.key || "ssh";
            const renderNetworkPanel = () => {
              if (resolvedNetworkConfig === "ssl") {
                return (
                  <div style={{ ...modalInnerSectionStyle, padding: 14 }}>
                    <div
                      style={{
                        marginBottom: 8,
                        color: darkMode ? "#f5f7ff" : "#162033",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      SSL/TLS
                    </div>
                    <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                      为连接链路增加加密与证书校验控制，适合生产或跨网络访问场景。
                    </div>
                    {!useSSL ? (
                      <div
                        style={{
                          ...modalMutedTextStyle,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: darkMode
                            ? "rgba(255,255,255,0.03)"
                            : "rgba(16,24,40,0.04)",
                        }}
                      >
                        左侧勾选“SSL/TLS”后，可在这里配置模式、证书与校验策略。
                      </div>
                    ) : (
                      <div style={tunnelSectionStyle}>
                        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                          <Text strong>SSL 模式</Text>
                          {renderChoiceCards({
                            fieldName: "sslMode",
                            value: String(sslMode),
                            options: [
                              {
                                value: "preferred",
                                label: "Preferred",
                                description: sslModeRiskDescription(LEGACY_COMPAT_SSL_MODE),
                              },
                              {
                                value: "required",
                                label: "Required",
                                description: sslModeRiskDescription("required"),
                              },
                              {
                                value: "skip-verify",
                                label: "Skip Verify",
                                description: sslModeRiskDescription("skip-verify"),
                              },
                            ],
                          })}
                        </div>
                        {dbType === "dameng" && (
                          <>
                            <Form.Item
                              name="sslCertPath"
                              label="客户端证书路径 (SSL_CERT_PATH)"
                              rules={[
                                {
                                  required: true,
                                  message: "达梦 SSL 需要证书路径",
                                },
                              ]}
                              style={{ marginBottom: 8 }}
                            >
                              <Input
                                {...noAutoCapInputProps}
                                placeholder="例如: C:\certs\client-cert.pem"
                              />
                            </Form.Item>
                            <Form.Item
                              name="sslKeyPath"
                              label="客户端私钥路径 (SSL_KEY_PATH)"
                              rules={[
                                {
                                  required: true,
                                  message: "达梦 SSL 需要私钥路径",
                                },
                              ]}
                              style={{ marginBottom: 8 }}
                            >
                              <Input
                                {...noAutoCapInputProps}
                                placeholder="例如: C:\certs\client-key.pem"
                              />
                            </Form.Item>
                          </>
                        )}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {sslHintText}
                        </Text>
                      </div>
                    )}
                  </div>
                );
              }
              if (resolvedNetworkConfig === "ssh") {
                return (
                  <div style={{ ...modalInnerSectionStyle, padding: 14 }}>
                    <div
                      style={{
                        marginBottom: 8,
                        color: darkMode ? "#f5f7ff" : "#162033",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      SSH 隧道
                    </div>
                    <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                      通过跳板机或堡垒机转发数据库连接，适合内网或受限网络环境。
                    </div>
                    {!useSSH ? (
                      <div
                        style={{
                          ...modalMutedTextStyle,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: darkMode
                            ? "rgba(255,255,255,0.03)"
                            : "rgba(16,24,40,0.04)",
                        }}
                      >
                        左侧勾选“SSH
                        隧道”后，可在这里填写主机、端口、用户名、密码和私钥路径。
                      </div>
                    ) : (
                      <div style={tunnelSectionStyle}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) 120px",
                            gap: 16,
                          }}
                        >
                          <Form.Item
                            name="sshHost"
                            label="SSH 主机 (域名或IP)"
                            rules={[
                              { required: useSSH, message: "请输入SSH主机" },
                            ]}
                            style={{ flex: 1 }}
                          >
                            <Input
                              {...noAutoCapInputProps}
                              placeholder="例如: ssh.example.com 或 192.168.1.100"
                            />
                          </Form.Item>
                          <Form.Item
                            name="sshPort"
                            label="端口"
                            rules={[
                              { required: useSSH, message: "请输入SSH端口" },
                            ]}
                            style={{ width: 100 }}
                          >
                            <InputNumber style={{ width: "100%" }} />
                          </Form.Item>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 16,
                          }}
                        >
                          <Form.Item
                            name="sshUser"
                            label="SSH 用户"
                            rules={[
                              { required: useSSH, message: "请输入SSH用户" },
                            ]}
                            style={{ flex: 1 }}
                          >
                            <Input
                              {...noAutoCapInputProps}
                              placeholder="root"
                            />
                          </Form.Item>
                          <Form.Item
                            name="sshPassword"
                            label="SSH 密码"
                            style={{ flex: 1 }}
                          >
                            <Input.Password
                              {...noAutoCapInputProps}
                              placeholder={getStoredSecretPlaceholder({
                                hasStoredSecret: initialValues?.hasSSHPassword,
                                emptyPlaceholder: "密码",
                                retainedLabel: "已保存 SSH 密码",
                              })}
                            />
                          </Form.Item>
                        </div>
                        <Form.Item
                          label="私钥路径 (可选)"
                          help="例如: /Users/name/.ssh/id_rsa"
                        >
                          <Space.Compact style={{ width: "100%" }}>
                            <Form.Item name="sshKeyPath" noStyle>
                              <Input
                                {...noAutoCapInputProps}
                                placeholder="绝对路径"
                              />
                            </Form.Item>
                            <Button
                              onClick={handleSelectSSHKeyFile}
                              loading={selectingSSHKey}
                            >
                              浏览...
                            </Button>
                          </Space.Compact>
                        </Form.Item>
                        {renderStoredSecretControls({
                          fieldName: "sshPassword",
                          clearKey: "sshPassword",
                          hasStoredSecret: initialValues?.hasSSHPassword,
                          clearLabel: "清除已保存 SSH 密码",
                          description:
                            "当前已保存 SSH 密码。留空表示继续沿用，输入新值表示替换。",
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              if (resolvedNetworkConfig === "proxy") {
                return (
                  <div style={{ ...modalInnerSectionStyle, padding: 14 }}>
                    <div
                      style={{
                        marginBottom: 8,
                        color: darkMode ? "#f5f7ff" : "#162033",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      代理
                    </div>
                    <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                      适合借助本地代理软件或中间网关转发数据库流量。
                    </div>
                    {!useProxy ? (
                      <div
                        style={{
                          ...modalMutedTextStyle,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: darkMode
                            ? "rgba(255,255,255,0.03)"
                            : "rgba(16,24,40,0.04)",
                        }}
                      >
                        左侧勾选“代理”后，可在这里选择代理类型并填写主机、端口与认证信息。
                      </div>
                    ) : (
                      <div style={tunnelSectionStyle}>
                        <Form.Item
                          name="proxyHost"
                          label="代理主机"
                          rules={[
                            { required: useProxy, message: "请输入代理主机" },
                          ]}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder="例如: 127.0.0.1 或 proxy.company.com"
                          />
                        </Form.Item>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) 120px",
                            gap: 16,
                          }}
                        >
                          <div style={{ display: "grid", gap: 8 }}>
                            <Text strong>代理类型</Text>
                            {renderChoiceCards({
                              fieldName: "proxyType",
                              value: String(proxyType),
                              minWidth: 150,
                              options: [
                                {
                                  value: "socks5",
                                  label: "SOCKS5",
                                  description: "常见本地代理和网关代理。",
                                },
                                {
                                  value: "http",
                                  label: "HTTP CONNECT",
                                  description: "通过 HTTP CONNECT 建立隧道。",
                                },
                              ],
                            })}
                          </div>
                          <Form.Item
                            name="proxyPort"
                            label="端口"
                            rules={[
                              { required: useProxy, message: "请输入代理端口" },
                            ]}
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber
                              style={{ width: "100%" }}
                              min={1}
                              max={65535}
                            />
                          </Form.Item>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 16,
                          }}
                        >
                          <Form.Item
                            name="proxyUser"
                            label="代理用户名（可选）"
                            style={{ flex: 1 }}
                          >
                            <Input
                              {...noAutoCapInputProps}
                              placeholder="留空表示无认证"
                            />
                          </Form.Item>
                          <Form.Item
                            name="proxyPassword"
                            label="代理密码（可选）"
                            style={{ flex: 1 }}
                          >
                            <Input.Password
                              {...noAutoCapInputProps}
                              placeholder={getStoredSecretPlaceholder({
                                hasStoredSecret:
                                  initialValues?.hasProxyPassword,
                                emptyPlaceholder: "留空表示无认证",
                                retainedLabel: "已保存代理密码",
                              })}
                            />
                          </Form.Item>
                        </div>
                        {renderStoredSecretControls({
                          fieldName: "proxyPassword",
                          clearKey: "proxyPassword",
                          hasStoredSecret: initialValues?.hasProxyPassword,
                          clearLabel: "清除已保存代理密码",
                          description:
                            "当前已保存代理密码。留空表示继续沿用，输入新值表示替换。",
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div style={{ ...modalInnerSectionStyle, padding: 14 }}>
                  <div
                    style={{
                      marginBottom: 8,
                      color: darkMode ? "#f5f7ff" : "#162033",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    HTTP 隧道
                  </div>
                  <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                    与代理模式互斥，适合单独指定一条 HTTP CONNECT 隧道路由。
                  </div>
                  {!useHttpTunnel ? (
                    <div
                      style={{
                        ...modalMutedTextStyle,
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: darkMode
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(16,24,40,0.04)",
                      }}
                    >
                      左侧勾选“HTTP 隧道”后，可在这里填写隧道目标与认证信息。
                    </div>
                  ) : (
                    <div style={tunnelSectionStyle}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) 120px",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="httpTunnelHost"
                          label="隧道主机"
                          rules={[
                            {
                              required: useHttpTunnel,
                              message: "请输入隧道主机",
                            },
                          ]}
                          style={{ flex: 1 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder="例如: tunnel.company.com 或 127.0.0.1"
                          />
                        </Form.Item>
                        <Form.Item
                          name="httpTunnelPort"
                          label="端口"
                          rules={[
                            {
                              required: useHttpTunnel,
                              message: "请输入隧道端口",
                            },
                          ]}
                          style={{ width: 120 }}
                        >
                          <InputNumber
                            style={{ width: "100%" }}
                            min={1}
                            max={65535}
                          />
                        </Form.Item>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 16,
                        }}
                      >
                        <Form.Item
                          name="httpTunnelUser"
                          label="隧道用户名（可选）"
                          style={{ flex: 1 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder="留空表示无认证"
                          />
                        </Form.Item>
                        <Form.Item
                          name="httpTunnelPassword"
                          label="隧道密码（可选）"
                          style={{ flex: 1 }}
                        >
                          <Input.Password
                            {...noAutoCapInputProps}
                            placeholder={getStoredSecretPlaceholder({
                              hasStoredSecret:
                                initialValues?.hasHttpTunnelPassword,
                              emptyPlaceholder: "留空表示无认证",
                              retainedLabel: "已保存隧道密码",
                            })}
                          />
                        </Form.Item>
                      </div>
                      {renderStoredSecretControls({
                        fieldName: "httpTunnelPassword",
                        clearKey: "httpTunnelPassword",
                        hasStoredSecret: initialValues?.hasHttpTunnelPassword,
                        clearLabel: "清除已保存隧道密码",
                        description:
                          "当前已保存隧道密码。留空表示继续沿用，输入新值表示替换。",
                      })}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        与“使用代理”互斥，启用后将通过 HTTP CONNECT
                        建立独立隧道。
                      </Text>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div style={modalInnerSectionStyle}>
                <div
                  style={{
                    marginBottom: 12,
                    color: darkMode ? "#f5f7ff" : "#162033",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  网络与安全
                </div>
                <div style={{ ...modalMutedTextStyle, marginBottom: 16 }}>
                  上方稳定列出所有连接方式，下方固定展示当前方式的配置详情，避免启用后页面重新排布，同时给详情区留出足够宽度。
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  {networkItems.map((item) => {
                    const active = item.key === resolvedNetworkConfig;
                    const activeColor = darkMode ? "#ffd666" : "#1677ff";
                    return (
                      <div
                        key={item.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveNetworkConfig(item.key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveNetworkConfig(item.key);
                          }
                        }}
                        style={{
                          ...getConnectionOptionCardStyle(item.enabled),
                          borderColor: active
                            ? darkMode
                              ? "rgba(255,214,102,0.46)"
                              : "rgba(24,144,255,0.36)"
                            : "transparent",
                          background: active
                            ? darkMode
                              ? "linear-gradient(180deg, rgba(255,214,102,0.14) 0%, rgba(255,214,102,0.08) 100%)"
                              : "linear-gradient(180deg, rgba(24,144,255,0.12) 0%, rgba(24,144,255,0.06) 100%)"
                            : getConnectionOptionCardStyle(item.enabled)
                                .background,
                          boxShadow: active
                            ? darkMode
                              ? "0 0 0 1px rgba(255,214,102,0.18) inset, 0 12px 26px rgba(0,0,0,0.16)"
                              : "0 0 0 1px rgba(24,144,255,0.14) inset, 0 12px 22px rgba(24,144,255,0.10)"
                            : "none",
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              marginTop: 8,
                              borderRadius: 999,
                              background: active ? activeColor : "transparent",
                              border: active
                                ? "none"
                                : darkMode
                                  ? "1px solid rgba(255,255,255,0.12)"
                                  : "1px solid rgba(16,24,40,0.12)",
                              flexShrink: 0,
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              minWidth: 0,
                              flex: 1,
                            }}
                          >
                            <Form.Item
                              name={
                                item.key === "ssl"
                                  ? "useSSL"
                                  : item.key === "ssh"
                                    ? "useSSH"
                                    : item.key === "proxy"
                                      ? "useProxy"
                                      : "useHttpTunnel"
                              }
                              valuePropName="checked"
                              noStyle
                            >
                              <Checkbox />
                            </Form.Item>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: darkMode ? "#f5f7ff" : "#162033",
                                  }}
                                >
                                  {item.title}
                                </span>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                  }}
                                >
                                  {active && (
                                    <span
                                      style={{
                                        padding: "2px 8px",
                                        borderRadius: 999,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: activeColor,
                                        background: darkMode
                                          ? "rgba(255,214,102,0.16)"
                                          : "rgba(24,144,255,0.12)",
                                      }}
                                    >
                                      当前编辑
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: item.enabled
                                        ? activeColor
                                        : darkMode
                                          ? "rgba(255,255,255,0.38)"
                                          : "rgba(16,24,40,0.36)",
                                    }}
                                  >
                                    {item.enabled ? "已启用" : "未启用"}
                                  </span>
                                </div>
                              </div>
                              <div
                                style={{
                                  marginTop: 4,
                                  ...modalMutedTextStyle,
                                  color: active
                                    ? darkMode
                                      ? "rgba(255,255,255,0.72)"
                                      : "rgba(22,32,51,0.68)"
                                    : modalMutedTextStyle.color,
                                }}
                              >
                                {item.description}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginBottom: 16 }}>{renderNetworkPanel()}</div>
                <div style={{ ...modalInnerSectionStyle, padding: 12 }}>
                  <div
                    style={{
                      marginBottom: 10,
                      color: darkMode ? "#f5f7ff" : "#162033",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    高级连接
                  </div>
                  <Form.Item
                    name="timeout"
                    label="连接超时 (秒)"
                    help="数据库连接超时时间，默认 30 秒"
                    rules={[
                      {
                        type: "number",
                        min: 1,
                        max: 300,
                        message: "超时时间范围: 1-300 秒",
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      style={{ width: "100%" }}
                      min={1}
                      max={300}
                      placeholder="30"
                    />
                  </Form.Item>
                </div>
              </div>
            );
          })()
        : null;

    return (
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          type: "mysql",
          host: "localhost",
          port: 3306,
          database: "",
          user: "root",
          useSSL: false,
          sslMode: DEFAULT_SSL_MODE,
          sslCertPath: "",
          sslKeyPath: "",
          useSSH: false,
          sshPort: 22,
          useProxy: false,
          proxyType: "socks5",
          proxyPort: 1080,
          useHttpTunnel: false,
          httpTunnelPort: 8080,
          timeout: 30,
          connectionInputMode: "target",
          uri: "",
          mysqlTopology: "single",
          redisTopology: "single",
          mongoTopology: "single",
          mongoSrv: false,
          mongoReadPreference: "primary",
          mongoAuthMechanism: "",
          savePassword: true,
          mysqlReplicaHosts: [],
          redisHosts: [],
          mongoHosts: [],
          mysqlReplicaUser: "",
          mysqlReplicaPassword: "",
          mongoReplicaUser: "",
          mongoReplicaPassword: "",
          redisDB: 0,
          jvmReadOnly: true,
          jvmAllowedModes: ["jmx"],
          jvmPreferredMode: "jmx",
          jvmEnvironment: "dev",
          jvmEndpointEnabled: false,
          jvmEndpointBaseUrl: "",
          jvmEndpointApiKey: "",
          jvmAgentEnabled: false,
          jvmAgentBaseUrl: "",
          jvmAgentApiKey: "",
          jvmDiagnosticEnabled: false,
          jvmDiagnosticTransport: "agent-bridge",
          jvmDiagnosticBaseUrl: "",
          jvmDiagnosticTargetId: "",
          jvmDiagnosticApiKey: "",
          jvmDiagnosticAllowObserveCommands: true,
          jvmDiagnosticAllowTraceCommands: false,
          jvmDiagnosticAllowMutatingCommands: false,
          jvmDiagnosticTimeoutSeconds: 15,
          jvmEndpointTimeoutSeconds: 30,
          jvmJmxHost: "",
          jvmJmxPort: undefined,
          jvmJmxUsername: "",
          jvmJmxPassword: "",
        }}
        onValuesChange={(changed) => {
          if (testResult) {
            setTestResult(null);
            setTestErrorLogOpen(false);
          }
          if (changed.uri !== undefined || changed.type !== undefined) {
            setUriFeedback(null);
          }
          if (changed.useSSL !== undefined) {
            setUseSSL(changed.useSSL);
            if (changed.useSSL) {
              setActiveNetworkConfig("ssl");
              if (form.getFieldValue("sslMode") === "disable") {
                form.setFieldValue("sslMode", DEFAULT_SSL_MODE);
              }
            }
          }
          if (changed.useSSH !== undefined) {
            setUseSSH(changed.useSSH);
            if (changed.useSSH) setActiveNetworkConfig("ssh");
          }
          if (changed.useProxy !== undefined) {
            const enabledProxy = !!changed.useProxy;
            setUseProxy(enabledProxy);
            if (enabledProxy) setActiveNetworkConfig("proxy");
            if (enabledProxy && form.getFieldValue("useHttpTunnel")) {
              form.setFieldValue("useHttpTunnel", false);
              setUseHttpTunnel(false);
            }
          }
          if (changed.proxyType !== undefined) {
            const nextType = String(
              changed.proxyType || "socks5",
            ).toLowerCase();
            if (nextType === "http") {
              const currentPort = Number(form.getFieldValue("proxyPort") || 0);
              if (!currentPort || currentPort === 1080) {
                form.setFieldValue("proxyPort", 8080);
              }
            } else {
              const currentPort = Number(form.getFieldValue("proxyPort") || 0);
              if (!currentPort || currentPort === 8080) {
                form.setFieldValue("proxyPort", 1080);
              }
            }
          }
          if (changed.useHttpTunnel !== undefined) {
            const enabledHttpTunnel = !!changed.useHttpTunnel;
            setUseHttpTunnel(enabledHttpTunnel);
            if (enabledHttpTunnel) setActiveNetworkConfig("httpTunnel");
            if (enabledHttpTunnel && form.getFieldValue("useProxy")) {
              form.setFieldValue("useProxy", false);
              setUseProxy(false);
            }
            if (enabledHttpTunnel) {
              const currentPort = Number(
                form.getFieldValue("httpTunnelPort") || 0,
              );
              if (!currentPort || currentPort <= 0) {
                form.setFieldValue("httpTunnelPort", 8080);
              }
            }
          }
          if (changed.type !== undefined) setDbType(changed.type);
          if (changed.jvmAllowedModes !== undefined) {
            const resolvedModes = normalizeEditableJVMModes(
              changed.jvmAllowedModes,
            );
            const currentPreferredMode = String(
              form.getFieldValue("jvmPreferredMode") || "",
            )
              .trim()
              .toLowerCase();
            const resolvedPreferredMode =
              resolvedModes.find((mode) => mode === currentPreferredMode) ||
              resolvedModes[0];
            form.setFieldValue("jvmAllowedModes", resolvedModes);
            form.setFieldValue("jvmPreferredMode", resolvedPreferredMode);
            form.setFieldValue(
              "jvmEndpointEnabled",
              resolvedModes.includes("endpoint"),
            );
            form.setFieldValue(
              "jvmAgentEnabled",
              resolvedModes.includes("agent"),
            );
          }
          if (changed.redisTopology !== undefined) {
            const supportedDbs = Array.from({ length: 16 }, (_, i) => i);
            setRedisDbList(supportedDbs);
            const selectedDbsRaw = form.getFieldValue("includeRedisDatabases");
            const selectedDbs = Array.isArray(selectedDbsRaw)
              ? selectedDbsRaw.map((entry: any) => Number(entry))
              : [];
            const validDbs = selectedDbs
              .filter((entry: number) => Number.isFinite(entry))
              .map((entry: number) => Math.trunc(entry))
              .filter((entry: number) => supportedDbs.includes(entry));
            form.setFieldValue(
              "includeRedisDatabases",
              validDbs.length > 0 ? validDbs : undefined,
            );
          }
          if (
            changed.type !== undefined ||
            changed.host !== undefined ||
            changed.port !== undefined ||
            changed.mongoHosts !== undefined ||
            changed.mongoTopology !== undefined ||
            changed.mongoSrv !== undefined
          ) {
            setMongoMembers([]);
          }
        }}
      >
        <Form.Item name="type" hidden>
          <Input {...noAutoCapInputProps} />
        </Form.Item>
        {currentDriverUnavailableReason && (
          <Alert
            showIcon
            type="warning"
            style={{ marginBottom: 12 }}
            message="当前数据源驱动未启用"
            description={
              <Space size={8}>
                <span>{currentDriverUnavailableReason}</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onOpenDriverManager?.()}
                >
                  去驱动管理安装
                </Button>
              </Space>
            }
          />
        )}
        {(() => {
          const sectionItems: Array<{
            key: "basic" | "network" | "appearance";
            title: string;
            description: string;
            icon: React.ReactNode;
          }> = [
            {
              key: "basic",
              title: "基础信息",
              description: isJVM
                ? "JVM 目标、接入模式、JMX、Endpoint、Agent 与诊断增强"
                : "名称、地址、认证、URI 与数据库范围",
              icon: <DatabaseOutlined />,
            },
            ...(!isCustom && !isFileDb && !isJVM
              ? [
                  {
                    key: "network" as const,
                    title: "网络与安全",
                    description: "SSL、SSH、代理与高级连接",
                    icon: <CloudOutlined />,
                  },
                ]
              : []),
            {
              key: "appearance",
              title: "外观",
              description: "自定义图标与颜色",
              icon: <BgColorsOutlined />,
            },
          ];
          const resolvedSection = sectionItems.some(
            (item) => item.key === activeConfigSection,
          )
            ? activeConfigSection
            : sectionItems[0]?.key || "basic";

          const effectiveIconType = customIconType || dbType;
          const effectiveIconColor =
            customIconColor || getDbDefaultColor(effectiveIconType);

          const appearanceSection = (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ ...modalInnerSectionStyle, padding: 16 }}>
                <div
                  style={{
                    marginBottom: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    color: darkMode ? "#f5f7ff" : "#162033",
                  }}
                >
                  图标
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DB_ICON_TYPES.map((iconKey) => {
                    const isActive = effectiveIconType === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        title={getDbIconLabel(iconKey)}
                        onClick={() =>
                          setCustomIconType(
                            iconKey === dbType ? undefined : iconKey,
                          )
                        }
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          display: "grid",
                          placeItems: "center",
                          border: `2px solid ${isActive ? effectiveIconColor : darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                          background: isActive
                            ? darkMode
                              ? "rgba(255,255,255,0.08)"
                              : "rgba(24,144,255,0.06)"
                            : "transparent",
                          cursor: "pointer",
                          transition: "all 120ms ease",
                        }}
                      >
                        {getDbIcon(
                          iconKey,
                          isActive ? effectiveIconColor : undefined,
                          22,
                        )}
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: darkMode
                      ? "rgba(255,255,255,0.45)"
                      : "rgba(0,0,0,0.35)",
                  }}
                >
                  当前：{getDbIconLabel(effectiveIconType)}
                </div>
              </div>
              <div style={{ ...modalInnerSectionStyle, padding: 16 }}>
                <div
                  style={{
                    marginBottom: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    color: darkMode ? "#f5f7ff" : "#162033",
                  }}
                >
                  颜色
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  {PRESET_ICON_COLORS.map((presetColor) => {
                    const isActive = effectiveIconColor === presetColor;
                    return (
                      <button
                        key={presetColor}
                        type="button"
                        onClick={() =>
                          setCustomIconColor(
                            presetColor === getDbDefaultColor(effectiveIconType)
                              ? undefined
                              : presetColor,
                          )
                        }
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: presetColor,
                          border: isActive
                            ? `2.5px solid ${darkMode ? "#fff" : "#162033"}`
                            : "2px solid transparent",
                          cursor: "pointer",
                          transition: "all 120ms ease",
                          boxShadow: isActive
                            ? `0 0 0 2px ${presetColor}40`
                            : "none",
                        }}
                      />
                    );
                  })}
                  <input
                    type="color"
                    value={effectiveIconColor}
                    onChange={(e) =>
                      setCustomIconColor(
                        e.target.value === getDbDefaultColor(effectiveIconType)
                          ? undefined
                          : e.target.value,
                      )
                    }
                    title="自定义颜色"
                    style={{
                      width: 28,
                      height: 28,
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      borderRadius: 6,
                      background: "transparent",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  ...modalInnerSectionStyle,
                  padding: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: darkMode ? "#f5f7ff" : "#162033",
                  }}
                >
                  预览
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {getDbIcon(effectiveIconType, effectiveIconColor, 24)}
                  <span
                    style={{
                      fontSize: 14,
                      color: darkMode ? "#e0e0e0" : "#333",
                    }}
                  >
                    {form.getFieldValue("name") || "连接名称"}
                  </span>
                </div>
                {(customIconType || customIconColor) && (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => {
                      setCustomIconType(undefined);
                      setCustomIconColor(undefined);
                    }}
                  >
                    重置为默认
                  </Button>
                )}
              </div>
            </div>
          );

          const currentSectionContent =
            resolvedSection === "basic"
              ? baseInfoSection
              : resolvedSection === "appearance"
                ? appearanceSection
                : networkSecuritySection;

          if (sectionItems.length <= 1) {
            return currentSectionContent;
          }

          return (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "220px minmax(0, 1fr)",
                gap: 18,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  ...modalInnerSectionStyle,
                  padding: 12,
                  position: "sticky",
                  top: 0,
                }}
              >
                <div
                  style={{
                    marginBottom: 12,
                    color: darkMode ? "#f5f7ff" : "#162033",
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                  }}
                >
                  配置分区
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {sectionItems.map((item) => {
                    const active = item.key === resolvedSection;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveConfigSection(item.key)}
                        style={{
                          textAlign: "left",
                          padding: "12px 12px 12px 14px",
                          borderRadius: 14,
                          border: `1px solid ${
                            active
                              ? darkMode
                                ? "rgba(255,214,102,0.3)"
                                : "rgba(24,144,255,0.24)"
                              : darkMode
                                ? "rgba(255,255,255,0.045)"
                                : "rgba(16,24,40,0.055)"
                          }`,
                          background: active
                            ? darkMode
                              ? "linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)"
                              : "linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)"
                            : darkMode
                              ? "rgba(255,255,255,0.02)"
                              : "rgba(255,255,255,0.7)",
                          color: active
                            ? darkMode
                              ? "#f5f7ff"
                              : "#162033"
                            : darkMode
                              ? "rgba(255,255,255,0.76)"
                              : "#3f4b5e",
                          cursor: "pointer",
                          transition: "all 120ms ease",
                          boxShadow: active
                            ? darkMode
                              ? "0 10px 24px rgba(0,0,0,0.18)"
                              : "0 10px 22px rgba(24,144,255,0.08)"
                            : "none",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 10,
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                              background: active
                                ? darkMode
                                  ? "rgba(255,214,102,0.16)"
                                  : "rgba(24,144,255,0.14)"
                                : darkMode
                                  ? "rgba(255,255,255,0.05)"
                                  : "rgba(16,24,40,0.05)",
                              color: active
                                ? darkMode
                                  ? "#ffd666"
                                  : "#1677ff"
                                : darkMode
                                  ? "rgba(255,255,255,0.55)"
                                  : "#627089",
                            }}
                          >
                            {item.icon}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <span style={{ fontSize: 14, fontWeight: 700 }}>
                                {item.title}
                              </span>
                              <span
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 999,
                                  background: active
                                    ? darkMode
                                      ? "#ffd666"
                                      : "#1677ff"
                                    : "transparent",
                                  border: active
                                    ? "none"
                                    : darkMode
                                      ? "1px solid rgba(255,255,255,0.12)"
                                      : "1px solid rgba(16,24,40,0.12)",
                                }}
                              />
                            </div>
                            <div
                              style={{
                                marginTop: 5,
                                fontSize: 12,
                                lineHeight: 1.55,
                                color: active
                                  ? darkMode
                                    ? "rgba(255,255,255,0.68)"
                                    : "rgba(22,32,51,0.68)"
                                  : darkMode
                                    ? "rgba(255,255,255,0.42)"
                                    : "rgba(63,75,94,0.62)",
                              }}
                            >
                              {item.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>{currentSectionContent}</div>
            </div>
          );
        })()}
      </Form>
    );
  };

  const getFooter = () => {
    if (step === 1) {
      return [
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
      ];
    }
    const isTestSuccess = testResult?.type === "success";
    const hasTestError = !!testResult && !isTestSuccess;
    const testFailureSummary = hasTestError
      ? summarizeConnectionTestFailureMessage(testResult?.message, "连接失败")
      : "";
    const operationBlocked =
      !!currentDriverUnavailableReason ||
      driverStatusChecking ||
      !!unsupportedJvmModeMessage;
    return (
      <div
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "4px 2px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          {!initialValues && (
            <Button key="back" onClick={() => setStep(1)}>
              上一步
            </Button>
          )}
          {testResult ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 24,
                padding: "0 10px",
                borderRadius: 999,
                border: isTestSuccess
                  ? "1px solid rgba(82, 196, 26, 0.35)"
                  : "1px solid rgba(255, 77, 79, 0.35)",
                background: isTestSuccess
                  ? "rgba(82, 196, 26, 0.10)"
                  : "rgba(255, 77, 79, 0.10)",
                color: isTestSuccess ? "#389e0d" : "#cf1322",
                fontSize: 12,
                lineHeight: "22px",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
              }}
            >
              {isTestSuccess ? <CheckCircleFilled /> : <CloseCircleFilled />}
              <span>{isTestSuccess ? "连接成功" : "连接失败"}</span>
            </span>
          ) : null}
          {hasTestError && (
            <span
              data-connection-test-error-summary="true"
              title={testFailureSummary}
              style={{
                minWidth: 0,
                flex: 1,
                color: "#cf1322",
                fontSize: 12,
                lineHeight: "20px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {testFailureSummary}
            </span>
          )}
          {hasTestError && (
            <Button
              size="small"
              icon={<FileTextOutlined />}
              style={{
                height: 24,
                borderRadius: 999,
                padding: "0 10px",
                borderColor: "#ffccc7",
                background: "#fff2f0",
                color: "#cf1322",
              }}
              onClick={() => setTestErrorLogOpen(true)}
            >
              查看原因
            </Button>
          )}
        </div>
        <Space size={8} style={{ flexShrink: 0 }}>
          <Button
            key="test"
            loading={loading}
            disabled={operationBlocked}
            onClick={requestTest}
          >
            测试连接
          </Button>
          <Button key="cancel" onClick={onClose}>
            取消
          </Button>
          <Button
            key="submit"
            type="primary"
            loading={loading}
            disabled={operationBlocked}
            onClick={handleOk}
          >
            保存
          </Button>
        </Space>
      </div>
    );
  };

  const getTitle = () => {
    if (step === 1) {
      return renderConnectionModalTitle(
        <AppstoreOutlined />,
        "选择数据源类型",
        "按数据库、中间件或文件类型快速进入对应的连接配置流程。",
      );
    }
    const typeName = dbTypes.find((t) => t.key === dbType)?.name || dbType;
    return initialValues
      ? renderConnectionModalTitle(
          <EditOutlined />,
          "编辑连接",
          `调整 ${typeName} 连接的参数、认证方式与网络选项。`,
        )
      : renderConnectionModalTitle(
          <LinkOutlined />,
          `新建 ${typeName} 连接`,
          "填写连接参数、测试连通性，并保存到连接树中。",
        );
  };

  const modalBodyStyle = {
    padding: "12px 24px 18px",
    height: CONNECTION_MODAL_BODY_HEIGHT,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
  };

  return (
    <>
      <Modal
        title={getTitle()}
        open={open}
        onCancel={onClose}
        footer={getFooter()}
        centered
        wrapClassName="connection-modal-wrap"
        width={CONNECTION_MODAL_WIDTH}
        zIndex={10001}
        destroyOnHidden
        maskClosable={false}
        styles={{
          content: modalShellStyle,
          header: {
            background: "transparent",
            borderBottom: "none",
            paddingBottom: 8,
          },
          body: modalBodyStyle,
          footer: {
            background: "transparent",
            borderTop: "none",
            paddingTop: 10,
          },
        }}
      >
        {step === 1 ? renderStep1() : renderStep2()}
      </Modal>
      <Modal
        title={renderConnectionModalTitle(
          <FileTextOutlined />,
          "测试连接失败原因",
          "查看本次测试连接的完整错误上下文，便于快速定位配置问题。",
        )}
        open={testErrorLogOpen}
        onCancel={() => setTestErrorLogOpen(false)}
        centered
        width={760}
        zIndex={10003}
        destroyOnHidden
        styles={{
          content: modalShellStyle,
          header: {
            background: "transparent",
            borderBottom: "none",
            paddingBottom: 8,
          },
          body: { paddingTop: 8 },
          footer: {
            background: "transparent",
            borderTop: "none",
            paddingTop: 10,
          },
        }}
        footer={[
          <Button key="close" onClick={() => setTestErrorLogOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <pre
          style={{
            margin: 0,
            maxHeight: "50vh",
            overflowY: "auto",
            padding: 12,
            borderRadius: 6,
            background: "#fff2f0",
            border: "1px solid #ffccc7",
            color: "#a8071a",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            lineHeight: "20px",
            fontSize: 13,
          }}
        >
          {String(testResult?.message || "暂无失败日志")}
        </pre>
      </Modal>
    </>
  );
};

export default ConnectionModal;
