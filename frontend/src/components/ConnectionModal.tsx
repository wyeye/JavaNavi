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
  MAX_TIMEOUT_SECONDS,
  buildUriFromValues,
  getDefaultPortByType,
  getUriPlaceholder,
  isFileDatabaseType,
  normalizeAddressList,
  normalizeFileDbPath,
  normalizeMongoSrvHostList,
  parseHostPort,
  parseUriToValues,
  supportsSSLForType,
  type ConnectionUriValues,
  toAddress,
} from "../utils/connectionUri";
import {
  extractBackendCustomDataSourceDefinitions,
  loadCustomDataSources,
  mergeBackendCustomDataSourceDefinitions,
  resolveCustomDataSourceFromConfig,
  type CustomDataSource,
} from "../utils/customDataSources";
import { filterDriverOptionsForDatabase, normalizeDriverSelectionType, resolveDefaultDriverTypeForDatabase } from "../utils/driverSelection";
import { buildRpcConnectionConfig } from "../utils/connectionRpcConfig";
import {
  applyNoAutoCapAttributes,
  noAutoCapInputProps,
} from "../utils/inputAutoCap";
import {
  DBGetDatabases,
  GetCustomDriverDefinitions,
  GetDriverStatusList,
  MongoDiscoverMembers,
  TestConnection,
  TestSSHConnection,
  RedisConnect,
  SelectSSHKeyFile,
  SaveConnection,
  type QueryResult,
} from "@compat/javanaviApp";
import type { ConnectionConfig, MongoMemberInfo, SavedConnection } from "../types";
import { connection } from "@compat/models";
import { translate, type I18nKey, type I18nParams } from "../i18n";

const { Text } = Typography;
type ChoiceCardOption = {
  value: string;
  label: string;
  description?: string;
};
type ConnectionInputMode = "url" | "target";
const CONNECTION_MODAL_WIDTH = 960;
const CONNECTION_MODAL_BODY_HEIGHT = 620;
const STEP1_SIDEBAR_DIVIDER_DARK = "rgba(255, 255, 255, 0.16)";
const STEP1_SIDEBAR_DIVIDER_LIGHT = "rgba(0, 0, 0, 0.08)";
type ConnectionSecretKey =
  | "primaryPassword"
  | "sshPassword"
  | "proxyPassword"
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
    mysqlReplicaPassword: false,
    mongoReplicaPassword: false,
    opaqueURI: false,
    opaqueDSN: false,
  });

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
  databaseType?: string;
  databaseName?: string;
  available: boolean;
  connectable: boolean;
  default?: boolean;
  reusedRuntime?: boolean;
  runtimeOwnerType?: string;
  runtimeOwnerName?: string;
  driverClassName?: string;
  message?: string;
};

type UnknownRecord = Record<string, unknown>;
type ConnectionFormValues = Record<string, unknown>;
type DriverStatusPayload = { drivers?: DriverStatusPayloadItem[] };
type DriverStatusPayloadItem = {
  type?: unknown;
  driverOptions?: DriverOptionPayload[];
  defaultDriverType?: unknown;
  defaultDriverName?: unknown;
  name?: unknown;
  connectable?: unknown;
  message?: unknown;
};
type DriverOptionPayload = {
  driverType?: unknown;
  driverName?: unknown;
  databaseType?: unknown;
  databaseName?: unknown;
  available?: unknown;
  connectable?: unknown;
  default?: unknown;
  defaultDriver?: unknown;
  reusedRuntime?: unknown;
  runtimeOwnerType?: unknown;
  runtimeOwnerName?: unknown;
  driverClassName?: unknown;
  message?: unknown;
};
type DatabaseRow = { Database?: unknown; database?: unknown };
type MongoDiscoverPayload = {
  members?: MongoMemberPayload[];
  replicaSet?: unknown;
};
type MongoMemberPayload = {
  host?: unknown;
  role?: unknown;
  state?: unknown;
  stateCode?: unknown;
  healthy?: unknown;
  isSelf?: unknown;
};
type NativeAppBridge = Partial<JavaNaviAppBridge> & {
  SelectDatabaseFile?: (currentPath: string, dbType: string) => Promise<QueryResult>;
};

const toRecord = (value: unknown): UnknownRecord => (
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}
);

const getErrorMessage = (error: unknown, fallback = "Unknown error"): string => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  const messageValue = toRecord(error).message;
  if (typeof messageValue === "string" && messageValue) return messageValue;
  if (error === null || error === undefined) return fallback;
  return String(error) || fallback;
};

const toNumberList = (value: unknown): number[] => (
  Array.isArray(value) ? value.map((entry) => Number(entry)) : []
);

const toStringList = (value: unknown): string[] | undefined => (
  Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : undefined
);

const queryArrayData = <T,>(result: QueryResult): T[] => (
  Array.isArray(result.data) ? result.data as T[] : []
);

const toSavedConnection = (value: connection.SavedConnectionView): SavedConnection => {
  const raw = toRecord(value);
  const configRaw = toRecord(raw.config);
  const normalizedType = normalizeDriverType(String(configRaw.type || configRaw.driverType || "mysql"));
  const useSSL = configRaw.useSSL === true;
  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    config: {
      ...configRaw,
      id: String(configRaw.id || raw.id || ""),
      type: normalizedType,
      host: String(configRaw.host || "localhost"),
      port: Number(configRaw.port || getDefaultPortByType(normalizedType)),
      user: String(configRaw.user || configRaw.username || ""),
      password: String(configRaw.password || ""),
      database: String(configRaw.database || ""),
      useSSL,
      sslMode: resolveEffectiveSSLMode(configRaw.sslMode, useSSL),
    } as ConnectionConfig,
    includeDatabases: toStringList(raw.includeDatabases),
    includeRedisDatabases: toNumberList(raw.includeRedisDatabases),
    iconType: typeof raw.iconType === "string" ? raw.iconType : undefined,
    iconColor: typeof raw.iconColor === "string" ? raw.iconColor : undefined,
    secretRef: typeof raw.secretRef === "string" ? raw.secretRef : undefined,
    hasPrimaryPassword: raw.hasPrimaryPassword === true,
    hasSSHPassword: raw.hasSSHPassword === true,
    hasProxyPassword: raw.hasProxyPassword === true,
    hasMySQLReplicaPassword: raw.hasMySQLReplicaPassword === true,
    hasMongoReplicaPassword: raw.hasMongoReplicaPassword === true,
    hasOpaqueURI: raw.hasOpaqueURI === true,
    hasOpaqueDSN: raw.hasOpaqueDSN === true,
  };
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
    "ssl" | "ssh" | "proxy"
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
  const sshKeyUploadInputRef = useRef<HTMLInputElement | null>(null);
  const addConnection = useStore((state) => state.addConnection);
  const updateConnection = useStore((state) => state.updateConnection);
  const theme = useStore((state) => state.theme);
  const appearance = useStore((state) => state.appearance);
  const language = useStore((state) => state.language);
  const t = useMemo(() => (key: I18nKey, params?: I18nParams) => translate(language, key, params), [language]);
  const getLocalizedDbIconLabel = (type: string): string => {
    const key = normalizeDriverType(type);
    switch (key) {
      case "mysql":
        return "MySQL";
      case "mariadb":
        return "MariaDB";
      case "postgres":
        return "PostgreSQL";
      case "redis":
        return "Redis";
      case "mongodb":
        return "MongoDB";
      case "oracle":
        return "Oracle";
      case "sqlserver":
        return "SQL Server";
      case "clickhouse":
        return "ClickHouse";
      case "sqlite":
        return "SQLite";
      case "duckdb":
        return "DuckDB";
      case "diros":
        return "Doris";
      case "sphinx":
        return "Sphinx";
      case "kingbase":
        return t("connectionModal.dbName.kingbase");
      case "dameng":
        return t("connectionModal.dbName.dameng");
      case "vastbase":
        return t("connectionModal.dbName.vastbase");
      case "highgo":
        return t("connectionModal.dbName.highgo");
      case "tdengine":
        return "TDengine";
      case "custom":
        return t("connectionModal.dbName.custom");
      default:
        return String(type || "");
    }
  };
  const nativeApp: NativeAppBridge | null =
    typeof window !== "undefined" ? window.go?.app?.App ?? null : null;
  const canBrowseDatabaseFile =
    typeof nativeApp?.SelectDatabaseFile === "function";
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
  const uriDraft = Form.useWatch("uri", form) || "";
  const connectionInputModeDraft =
    Form.useWatch("connectionInputMode", form) || "target";
  const connectionInputMode: ConnectionInputMode =
    connectionInputModeDraft === "url" ? "url" : "target";
  const customDataSourceIdDraft =
    Form.useWatch("customDataSourceId", form) || "";
  const selectedCustomDataSource = useMemo(
    () =>
      customDataSources.find(
        (source) => source.id === String(customDataSourceIdDraft || ""),
      ),
    [customDataSourceIdDraft, customDataSources],
  );
  const selectedCustomDataSourceStatus =
    selectedCustomDataSource?.runtimeStatus;
  const selectedCustomDataSourceRepairHints =
    selectedCustomDataSourceStatus?.repairHints || [];
  const isMySQLLike =
    dbType === "mysql" ||
    dbType === "mariadb" ||
    dbType === "doris" ||
    dbType === "diros" ||
    dbType === "sphinx";
  const isSSLType = supportsSSLForType(dbType);
  const sslHintText = isMySQLLike
    ? t("connectionModal.ssl.hint.mysqlLike")
    : dbType === "dameng"
      ? t("connectionModal.ssl.hint.dameng")
      : dbType === "sqlserver"
        ? t("connectionModal.ssl.hint.sqlserver")
        : dbType === "mongodb"
          ? t("connectionModal.ssl.hint.mongodb")
          : t("connectionModal.ssl.hint.default");

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
                  ? t("connectionModal.secret.newValueNotice")
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
    const copy = getConnectionConfigSectionCopy(sectionKey, language);
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
      const selectedDbs = toNumberList(selectedDbsRaw);
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
    const nextValues: ConnectionFormValues = {
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
                {active ? <Tag color="blue">{t("connectionModal.common.current")}</Tag> : null}
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

  const fetchDriverStatusMap = async (): Promise<
    Record<string, DriverStatusSnapshot>
  > => {
    const result: Record<string, DriverStatusSnapshot> = {};
    const res = await GetDriverStatusList("", "");
    if (!res?.success) {
      return result;
    }
    const data = toRecord(res?.data) as DriverStatusPayload;
    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    drivers.forEach((item) => {
      const type = normalizeDriverType(String(item.type || "").trim());
      if (!type) return;
      const parsedDriverOptions: DriverOption[] = Array.isArray(item.driverOptions)
        ? item.driverOptions
            .map((option) => {
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
                databaseType:
                  normalizeDriverType(String(option.databaseType || "").trim()) ||
                  undefined,
                databaseName: String(option.databaseName || "").trim() || undefined,
                available: !!option.available,
                connectable: !!option.connectable,
                default: !!option.default || !!option.defaultDriver,
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
        : [];
      const driverOptions = filterDriverOptionsForDatabase<DriverOption>(type, parsedDriverOptions);
      const rawDefaultDriverType = String(item.defaultDriverType || "").trim();
      const defaultDriverType = resolveDefaultDriverTypeForDatabase(
        type,
        rawDefaultDriverType,
        driverOptions,
      ) || undefined;
      const defaultDriverName =
        driverOptions.find((option) => option.driverType === defaultDriverType)
          ?.driverName ||
        (normalizeDriverSelectionType(rawDefaultDriverType) === defaultDriverType
          ? String(item.defaultDriverName || "").trim()
          : "") ||
        defaultDriverType;
      result[type] = {
        type,
        name: String(item.name || item.type || type).trim(),
        connectable: !!item.connectable,
        defaultDriverType,
        defaultDriverName,
        driverOptions,
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
      t("connectionModal.driver.unavailableReason", { driver: status.name || normalized })
    );
  };

  const promptInstallDriver = (driverType: string, reason: string) => {
    const normalized = normalizeDriverType(driverType);
    const snapshot = driverStatusMap[normalized];
    const driverName = snapshot?.name || normalized || t("connectionModal.common.current");
    Modal.confirm({
      title: t("connectionModal.driver.unavailableTitle", { driver: driverName }),
      content: reason || t("connectionModal.driver.unavailableReason", { driver: driverName }),
      okText: t("connectionModal.driver.installAction"),
      cancelText: t("common.cancel"),
      onOk: () => {
        onOpenDriverManager?.();
      },
    });
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
                new Error(t("connectionModal.validation.uriRequired")),
              );
        }
        const type = String(getFieldValue("type") || dbType)
          .trim()
          .toLowerCase();
        return parseUriToValues(uriText, type)
          ? Promise.resolve()
          : Promise.reject(
              new Error(t("connectionModal.validation.uriInvalid")),
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

  const handleGenerateURI = () => {
    try {
      const values = form.getFieldsValue(true);
      const uri = buildUriFromValues(values);
      form.setFieldValue("uri", uri);
      setUriFeedback({ type: "success", message: t("connectionModal.uri.generated") });
    } catch {
      setUriFeedback({ type: "error", message: t("connectionModal.uri.generateFailed") });
    }
  };

  const handleParseURI = () => {
    try {
      const uriText = String(form.getFieldValue("uri") || "").trim();
      const type = String(form.getFieldValue("type") || dbType)
        .trim()
        .toLowerCase();
      if (!uriText) {
        setUriFeedback({ type: "warning", message: t("connectionModal.uri.inputRequired") });
        return;
      }
      const parsedValues = parseUriToValues(uriText, type);
      if (!parsedValues) {
        setUriFeedback({
          type: "error",
          message: t("connectionModal.uri.typeMismatch"),
        });
        return;
      }
      form.setFieldsValue({ ...parsedValues, uri: uriText });
      if (testResult) {
        setTestResult(null);
      }
      setUriFeedback({ type: "success", message: t("connectionModal.uri.parsed") });
    } catch {
      setUriFeedback({
        type: "error",
        message: t("connectionModal.uri.parseFailed"),
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
      setUriFeedback({ type: "warning", message: t("connectionModal.uri.copyEmpty") });
      return;
    }
    try {
      await navigator.clipboard.writeText(uriText);
      setUriFeedback({ type: "success", message: t("connectionModal.uri.copied") });
    } catch {
      setUriFeedback({ type: "error", message: t("connectionModal.clipboard.copyFailed") });
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
        const data = res.data;
        const selectedPath =
          typeof data === "string" ? data : String(toRecord(data).path || "").trim();
        if (selectedPath) {
          form.setFieldValue("sshKeyPath", selectedPath);
          return;
        }
      }
      sshKeyUploadInputRef.current?.click();
    } catch (e: unknown) {
      message.error(t("connectionModal.ssh.keySelectFailed", { message: getErrorMessage(e, t("message.unknownError")) }));
    } finally {
      setSelectingSSHKey(false);
    }
  };

  const handleSSHKeyUploadSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    form.setFieldValue("sshKeyPath", file.name);
    message.info(t("connectionModal.ssh.webKeyRecorded"));
  };

  const handleTestSSHConnection = async () => {
    if (loading) {
      return;
    }
    try {
      const values = form.getFieldsValue(true) as ConnectionFormValues;
      const sshConfig = {
        id: initialValues?.id,
        name: initialValues?.name || String(values.name || ""),
        type: String(values.type || dbType || "mysql"),
        host: String(values.host || "localhost"),
        port: Number(values.port || getDefaultPortByType(String(values.type || dbType || "mysql"))),
        user: String(values.user || ""),
        password: String(values.password ?? ""),
        database: String(values.database || ""),
        timeout: Number(values.timeout || 30),
        useSSH: true,
        ssh: {
          host: String(values.sshHost || ""),
          port: Number(values.sshPort || 22),
          user: String(values.sshUser || ""),
          password: String(values.sshPassword ?? ""),
          keyPath: String(values.sshKeyPath || ""),
        },
      } as ConnectionConfig;
      if (!sshConfig.ssh?.host || !sshConfig.ssh?.user) {
        message.error(t("connectionModal.ssh.hostUserRequired"));
        return;
      }
      setLoading(true);
      const timeoutSecondsRaw = Number(values.timeout);
      const timeoutSeconds =
        Number.isFinite(timeoutSecondsRaw) && timeoutSecondsRaw > 0
          ? Math.min(timeoutSecondsRaw, MAX_TIMEOUT_SECONDS)
          : 30;
      const res = await withClientTimeout(
        TestSSHConnection(buildRpcConnectionConfig(sshConfig)),
        (timeoutSeconds + 5) * 1000,
        t("connectionModal.ssh.testTimeout", { seconds: timeoutSeconds }),
      );
      if (res.success) {
        message.success(t("connectionModal.ssh.success"));
      } else {
        message.error(t("connectionModal.ssh.failed", { message: getErrorMessage(res.message, t("message.unknownError")) }));
      }
    } catch (e: unknown) {
      message.error(t("connectionModal.ssh.failed", { message: getErrorMessage(e, t("message.unknownError")) }));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDatabaseFile = async () => {
    if (selectingDbFile) {
      return;
    }
    if (typeof nativeApp?.SelectDatabaseFile !== "function") {
      message.warning(t("connectionModal.file.webPathRequired"));
      return;
    }
    try {
      setSelectingDbFile(true);
      const currentPath = String(form.getFieldValue("host") || "").trim();
      const res = await nativeApp["SelectDatabaseFile"](currentPath, dbType);
      if (res?.success !== false) {
        const data = res?.data ?? res;
        const dataRecord = toRecord(data);
        const selectedPath =
          typeof data === "string"
            ? data
            : String(dataRecord.path || dataRecord.filePath || "").trim();
        if (selectedPath) {
          form.setFieldValue("host", normalizeFileDbPath(selectedPath));
        }
      } else if (!new Set([t("connectionModal.file.selectCancelled"), translate("zh", "connectionModal.file.selectCancelled")]).has(String(res?.message || ""))) {
        message.error(t("connectionModal.file.selectFailed", { message: String(res?.message || t("message.unknownError")) }));
      }
    } catch (e: unknown) {
      message.error(t("connectionModal.file.selectFailed", { message: getErrorMessage(e, t("message.unknownError")) }));
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
        const config = initialValues.config || {};
        const configType = String(config.type || "mysql");
        const selectedInitialCustomDataSource =
          configType === "custom"
            ? resolveCustomDataSourceFromConfig(latestCustomDataSources, config)
            : undefined;
        const defaultPort = getDefaultPortByType(configType);
        const isFileDbConfigType = isFileDatabaseType(configType);
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
        const hasProxy = !!config.useProxy;
        const initialConnectionInputMode: ConnectionInputMode =
          String(config.uri || "").trim() || initialValues.hasOpaqueURI
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
          customDataSourceId: selectedInitialCustomDataSource?.id,
          driver: config.driver,
          dsn: config.dsn,
          timeout: Number(config.timeout || 30),
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
        });
        setUseSSL(!!config.useSSL);
        setCustomIconType(initialValues.iconType);
        setCustomIconColor(initialValues.iconColor);
        setUseSSH(config.useSSH || false);
        setUseProxy(hasProxy);
        setDbType(configType);
        if (config.useSSL && supportsSSLForType(configType)) {
          setActiveNetworkConfig("ssl");
        } else if (config.useSSH) {
          setActiveNetworkConfig("ssh");
        } else if (hasProxy) {
          setActiveNetworkConfig("proxy");
        } else {
          setActiveNetworkConfig("ssl");
        }
        // In Redis edit mode, restore the saved Redis database list.
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

  const buildSavedConnectionInput = (
    config: ConnectionConfig,
    values: ConnectionFormValues,
  ): connection.SavedConnectionInput => {
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
    const displayHost = String(config.host || values.host || "").trim();
    const nextName = String(
      values.name ||
      (isFileDatabaseType(String(values.type || ""))
        ? values.type === "duckdb"
          ? "DuckDB DB"
          : "SQLite DB"
        : values.type === "redis"
          ? `Redis ${displayHost}`
          : displayHost),
    );
    const payloadConfig = {
      ...config,
      id: connectionId,
      password: primaryDraft.value,
      ssh: {
        host: config.ssh?.host || "",
        port: config.ssh?.port || 22,
        user: config.ssh?.user || "",
        keyPath: config.ssh?.keyPath || "",
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
      uri: opaqueUriDraft.value,
      dsn: opaqueDsnDraft.value,
      mysqlReplicaPassword: mysqlReplicaDraft.value,
      mongoReplicaPassword: mongoReplicaDraft.value,
    };
    const includeDatabases = toStringList(values.includeDatabases);
    const includeRedisDatabases = isRedisType
      ? toNumberList(values.includeRedisDatabases)
      : undefined;

    return new connection.SavedConnectionInput({
      id: connectionId,
      name: nextName,
      config: new connection.ConnectionConfig(payloadConfig as Record<string, unknown>),
      includeDatabases,
      includeRedisDatabases,
      iconType: customIconType || "",
      iconColor: customIconColor || "",
      clearPrimaryPassword: primaryDraft.clearStoredSecret,
      clearSSHPassword: sshDraft.clearStoredSecret,
      clearProxyPassword: proxyDraft.clearStoredSecret,
      clearMySQLReplicaPassword: mysqlReplicaDraft.clearStoredSecret,
      clearMongoReplicaPassword: mongoReplicaDraft.clearStoredSecret,
      clearOpaqueURI: opaqueUriDraft.clearStoredSecret,
      clearOpaqueDSN: opaqueDsnDraft.clearStoredSecret,
    });
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
      const savedConnection = toSavedConnection(await SaveConnection(payload));
      if (!savedConnection) {
        throw new Error(t("connectionModal.save.backendUnavailable"));
      }

      if (initialValues) {
        updateConnection(savedConnection);
        message.success(t("connectionModal.save.updatedOffline"));
      } else {
        addConnection(savedConnection);
        message.success(t("connectionModal.save.createdOffline"));
      }

      if (onSaved) {
        void Promise.resolve(onSaved(savedConnection)).catch(
          (error: unknown) => {
            console.warn("Failed to refresh post-save state", error);
            void message.warning(
              t("connectionModal.save.refreshStateWarning"),
            );
          },
        );
      }

      form.resetFields();
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
      setDbType("mysql");
      setStep(1);
      setClearSecrets(createEmptyConnectionSecretClearState());
      onClose();
    } catch (e: unknown) {
      message.error(
        normalizeConnectionSecretErrorMessage(getErrorMessage(e), t("connectionModal.error.saveFailed"), language),
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

  const getBlockingSecretClearMessage = (
    values: ConnectionFormValues,
  ): string | null => {
    if (
      clearSecrets.primaryPassword &&
      !isFileDatabaseType(String(values.type || "")) &&
      String(values.password ?? "") === ""
    ) {
      return t("connectionModal.secret.blockPrimary");
    }
    if (
      clearSecrets.sshPassword &&
      values.useSSH &&
      String(values.sshPassword ?? "") === ""
    ) {
      return t("connectionModal.secret.blockSsh");
    }
    if (
      clearSecrets.proxyPassword &&
      values.useProxy &&
      String(values.proxyPassword ?? "") === ""
    ) {
      return t("connectionModal.secret.blockProxy");
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
      return t("connectionModal.secret.blockMysqlReplica");
    }
    if (
      clearSecrets.mongoReplicaPassword &&
      values.type === "mongodb" &&
      values.mongoTopology === "replica" &&
      String(values.mongoReplicaPassword ?? "") === ""
    ) {
      return t("connectionModal.secret.blockMongoReplica");
    }
    if (
      values.type === "mongodb" &&
      values.savePassword === false &&
      initialValues?.hasPrimaryPassword &&
      String(values.password ?? "") === ""
    ) {
      return t("connectionModal.secret.blockMongoPasswordSave");
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
            fallback: t("connectionModal.error.driverUnavailable"),
            language,
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
            fallback: t("connectionModal.error.connectionParamsIncomplete"),
            language,
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

      const isRedisType = values.type === "redis";
      const rpcConfig = buildRpcConnectionConfig(config);
      const res = await withClientTimeout(
        isRedisType
          ? RedisConnect(rpcConfig)
          : TestConnection(rpcConfig),
        rpcTimeoutMs,
        t("connectionModal.test.timeout", { seconds: timeoutSeconds }),
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
        } else {
          // Other databases: fetch database list
          const dbRes = await withClientTimeout(
            DBGetDatabases(rpcConfig),
            rpcTimeoutMs,
            t("connectionModal.test.databaseListTimeout", { seconds: timeoutSeconds }),
          );
          if (dbRes.success) {
            const dbRows = queryArrayData<DatabaseRow>(dbRes);
            const dbs = dbRows
              .map((row) => row?.Database || row?.database)
              .filter(
                (name): name is string => typeof name === "string" && name.trim() !== "",
              );
            setDbList(dbs);
            if (dbs.length === 0) {
              message.warning(
                values.type === "dameng"
                  ? t("connectionModal.test.noVisibleSchema")
                  : t("connectionModal.test.noVisibleDatabases"),
              );
            }
          } else {
            setDbList([]);
            message.warning(
              t("connectionModal.test.databaseListFailed", { message: normalizeConnectionSecretErrorMessage(dbRes.message, t("message.unknownError"), language) }),
            );
          }
        }
      } else {
        applyTestFailureFeedback(
          resolveConnectionTestFailureFeedback({
            kind: "runtime",
            reason: res?.message,
            fallback: t("connectionModal.error.connectionRejected"),
            language,
          }),
        );
      }
    } catch (e: unknown) {
      if (e && typeof e === "object" && "errorFields" in e) {
        applyTestFailureFeedback(
          resolveConnectionTestFailureFeedback({
            kind: "validation",
            reason: "",
            fallback: t("connectionModal.error.requiredFields"),
            language,
          }),
        );
        return;
      }
      const reason =
        e instanceof Error ? e.message : typeof e === "string" ? e : t("connectionModal.error.unknownException");
      applyTestFailureFeedback(
        resolveConnectionTestFailureFeedback({
          kind: "runtime",
          reason,
          fallback: t("connectionModal.error.unknownException"),
          language,
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
      const result = await MongoDiscoverMembers(buildRpcConnectionConfig(config));
      if (!result.success) {
        message.error(
          normalizeConnectionSecretErrorMessage(result.message, t("connectionModal.error.memberDiscoveryFailed"), language),
        );
        return;
      }
      const data = toRecord(result.data) as MongoDiscoverPayload;
      const membersRaw = Array.isArray(data.members) ? data.members : [];
      const members: MongoMemberInfo[] = membersRaw
        .map((item) => ({
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
      message.success(result.message || t("connectionModal.mongo.membersDiscovered", { count: members.length }));
    } catch (error: unknown) {
      message.error(
        normalizeConnectionSecretErrorMessage(
          getErrorMessage(error),
          t("connectionModal.error.memberDiscoveryFailed"),
          language,
        ),
      );
    } finally {
      setDiscoveringMembers(false);
    }
  };

  const buildConfig = async (
    values: ConnectionFormValues,
    forPersist: boolean,
  ): Promise<ConnectionConfig> => {
    const mergedValues: ConnectionFormValues = { ...values };
    const type = String(mergedValues.type || "").toLowerCase();
    const resolvedConnectionInputMode: ConnectionInputMode =
      mergedValues.connectionInputMode === "url" ? "url" : "target";
    const shouldUseConnectionUri =
      type !== "custom" && resolvedConnectionInputMode === "url";
    if (!shouldUseConnectionUri) {
      mergedValues.uri = "";
    }
    const parsedUriValues = shouldUseConnectionUri
      ? parseUriToValues(String(mergedValues.uri || ""), String(mergedValues.type || type))
      : null;
    if (parsedUriValues) {
      Object.entries(parsedUriValues).forEach(([key, value]) => {
        // Connection URL and target address are mutually exclusive; only URL mode uses parsed values.
        // Parsed URL values overwrite target address fields; target mode clears and ignores the historical URL.
        if (value !== undefined && value !== null) {
          mergedValues[key] = value as ConnectionUriValues[keyof ConnectionUriValues];
        }
      });
    }

    const defaultPort = getDefaultPortByType(type);
    const isFileDbType = isFileDatabaseType(type);
    const sslCapableType = supportsSSLForType(type);

    // Redis does not show the username by default. If the URI is parsed, use its user value.
    // Also clear the legacy default root user to avoid go-redis sending ACL AUTH(user, pass) and triggering WRONGPASS.
    if (type === "redis") {
      if (
        parsedUriValues &&
        Object.prototype.hasOwnProperty.call(parsedUriValues, "user")
      ) {
        mergedValues.user = String(parsedUriValues.user || "");
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
      throw new Error(t("connectionModal.error.damengSslRequired"));
    }

    let primaryHost = "localhost";
    let primaryPort = defaultPort;
    if (isFileDbType) {
      // For file databases (sqlite/duckdb), host stores the database file path and must not be parsed as host:port.
      primaryHost = normalizeFileDbPath(String(mergedValues.host || "").trim());
      primaryPort = 0;
    } else {
      const parsedPrimary = parseHostPort(
        toAddress(
          String(mergedValues.host || "localhost"),
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
          host: String(mergedValues.sshHost || ""),
          port: Number(mergedValues.sshPort),
          user: String(mergedValues.sshUser || ""),
          password: String(mergedValues.sshPassword || ""),
          keyPath: String(mergedValues.sshKeyPath || ""),
        }
      : { host: "", port: 22, user: "", password: "", keyPath: "" };
    const effectiveUseProxy = !isFileDbType && !!mergedValues.useProxy;
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
            password: String(mergedValues.proxyPassword || ""),
          }
        : {
            type: "socks5",
            host: "",
            port: 1080,
            user: "",
            password: "",
          };

    const keepPassword = !forPersist || savePassword;
    const normalizedConfigType = normalizeDriverType(type);
    const selectedDriverForConfig =
      type === "custom"
        ? String(mergedValues.driver || "").trim()
        : resolveDefaultDriverTypeForDatabase(
            normalizedConfigType,
            normalizeDriverType(String(mergedValues.driver || "")) ||
              driverStatusMap[normalizedConfigType]?.defaultDriverType,
            driverStatusMap[normalizedConfigType]?.driverOptions || [],
          ) || normalizedConfigType;
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
      type: String(mergedValues.type || "mysql"),
      host: primaryHost,
      port: Number(primaryPort || 0),
      user: String(mergedValues.user || ""),
      password: keepPassword ? String(mergedValues.password || "") : "",
      savePassword: savePassword,
      database: String(mergedValues.database || ""),
      useSSL: effectiveUseSSL,
      sslMode: effectiveUseSSL ? sslMode : "disable",
      sslCertPath: sslCertPath,
      sslKeyPath: sslKeyPath,
      useSSH: !!mergedValues.useSSH,
      ssh: sshConfig,
      useProxy: effectiveUseProxy,
      proxy: proxyConfig,
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
        t("connectionModal.driver.unavailableReason", { driver: driverName });
      setTypeSelectWarning({ driverName, reason });
      return;
    }
    setTypeSelectWarning(null);
    setDbType(type);
    const defaultSelectedDriver =
      snapshot?.defaultDriverType || normalized || type;
    form.setFieldsValue(
      type === "custom"
        ? {
            type: type,
            connectionInputMode: "target",
            uri: "",
            customDataSourceId: undefined,
            driver: "",
            dsn: "",
          }
        : {
            type: type,
            driver: defaultSelectedDriver,
            connectionInputMode: "target",
            uri: "",
          },
    );

    const defaultPort = getDefaultPortByType(type);
    if (isFileDatabaseType(type)) {
      setUseSSL(false);
      setUseSSH(false);
      setUseProxy(false);
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
      form.setFieldsValue({
        user: defaultUser,
        database: "",
        port: defaultPort,
        useSSL: sslCapableType ? false : undefined,
        sslMode: sslCapableType ? DEFAULT_SSL_MODE : undefined,
        sslCertPath: sslCapableType ? "" : undefined,
        sslKeyPath: sslCapableType ? "" : undefined,
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
  const isConnectionUrlMode =
    !isCustom && connectionInputMode === "url";
  const hasConnectionUriDraft = String(uriDraft || "").trim() !== "";
  const keepsStoredConnectionUri =
    !!initialValues?.hasOpaqueURI &&
    !clearSecrets.opaqueURI &&
    !hasConnectionUriDraft;
  const connectionConfigLayout = resolveConnectionConfigLayout(dbType);
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
    !isCustom && currentAvailableDriverOptions.length > 1;
  const currentDriverUnavailableReason =
    currentDriverType !== "custom" &&
    currentDriverSnapshot &&
    !currentDriverSnapshot.connectable
      ? currentDriverSnapshot.message ||
        t("connectionModal.error.driverUnavailable")
      : "";
  const driverStatusChecking =
    currentDriverType !== "custom" && !driverStatusLoaded && step === 2;

  useEffect(() => {
    if (!open || step !== 2 || isCustom || !currentDriverSnapshot) {
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
      String(initialValues?.config?.driver || ""),
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
    open,
    step,
  ]);

  const dbTypeGroups = [
    {
      label: t("connectionModal.dbGroup.relational"),
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
      label: t("connectionModal.dbGroup.domestic"),
      items: [
        {
          key: "dameng",
          name: t("connectionModal.dbName.dameng"),
          icon: getDbIcon("dameng", undefined, 36),
        },
        {
          key: "kingbase",
          name: t("connectionModal.dbName.kingbase"),
          icon: getDbIcon("kingbase", undefined, 36),
        },
        {
          key: "highgo",
          name: t("connectionModal.dbName.highgo"),
          icon: getDbIcon("highgo", undefined, 36),
        },
        {
          key: "vastbase",
          name: t("connectionModal.dbName.vastbase"),
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
      label: t("connectionModal.dbGroup.timeSeries"),
      items: [
        {
          key: "tdengine",
          name: "TDengine",
          icon: getDbIcon("tdengine", undefined, 36),
        },
      ],
    },
    {
      label: t("connectionModal.dbGroup.other"),
      items: [
        {
          key: "custom",
          name: t("connectionModal.dbName.custom"),
          icon: getDbIcon("custom", undefined, 36),
        },
      ],
    },
  ];

  const dbTypes = dbTypeGroups.flatMap((g) => g.items);
  const getDbTypeHint = (type: string) => {
    switch (type) {
      case "custom":
        return t("connectionModal.dbHint.custom");
      case "redis":
        return t("connectionModal.dbHint.redis");
      case "mongodb":
        return t("connectionModal.dbHint.mongodb");
      case "sqlite":
      case "duckdb":
        return t("connectionModal.dbHint.file");
      default:
        return t("connectionModal.dbHint.standard");
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
          {t("connectionModal.step1.title")}
        </div>
        <div style={modalMutedTextStyle}>
          {t("connectionModal.step1.description")}
        </div>
      </div>
      {typeSelectWarning && (
        <Alert
          type="warning"
          showIcon
          closable
          message={t("connectionModal.driver.disabledMessage", { driver: typeSelectWarning.driverName })}
          description={
            <Space size={8}>
              <span>{typeSelectWarning.reason}</span>
              <Button
                type="link"
                size="small"
                onClick={() => onOpenDriverManager?.()}
              >
                {t("connectionModal.driver.installAction")}
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
        {/* Left category navigation */}
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
        {/* Data source cards */}
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
          {t("connectionModal.baseInfo.title")}
        </div>
        <div style={{ ...modalMutedTextStyle, marginBottom: 16 }}>
          {t("connectionModal.baseInfo.description")}
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {renderConfigSectionCard({
            sectionKey: "identity",
            icon: <ApiOutlined />,
            badge: (
              <Tag>
                {getConnectionConfigLayoutKindLabel(connectionConfigLayout.kind, language)}
              </Tag>
            ),
            children: (
              <Form.Item name="name" label={t("connectionModal.identity.nameLabel")} style={{ marginBottom: 0 }}>
                <Input
                  {...noAutoCapInputProps}
                  placeholder={t("connectionModal.identity.namePlaceholder")}
                />
              </Form.Item>
            ),
          })}

          {!isCustom &&
            renderConfigSectionCard({
              sectionKey: "uri",
              icon: <LinkOutlined />,
              children: (
                <>
                  <Form.Item
                    name="connectionInputMode"
                    label={t("connectionModal.uri.inputModeLabel")}
                    help={t("connectionModal.uri.inputModeHelp")}
                    style={{ marginBottom: isConnectionUrlMode ? 14 : 0 }}
                  >
                    <Segmented
                      block
                      options={[
                        {
                          label: t("connectionModal.uri.urlOption"),
                          value: "url",
                        },
                        {
                          label: isFileDb ? t("connectionModal.uri.fileOption") : t("connectionModal.uri.targetOption"),
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
                          ? t("connectionModal.uri.fileModeMessage")
                          : t("connectionModal.uri.targetModeMessage")
                      }
                      description={t("connectionModal.uri.targetModeDescription")}
                    />
                  )}
                  {isConnectionUrlMode && (
                    <>
                      <Form.Item
                        name="uri"
                        label={t("connectionModal.uri.urlLabel")}
                        help={
                          hasConnectionUriDraft
                            ? t("connectionModal.uri.urlHelpDraft")
                            : keepsStoredConnectionUri
                              ? t("connectionModal.uri.urlHelpStored")
                              : t("connectionModal.uri.urlHelpEmpty")
                        }
                        rules={[createConnectionUriRule()]}
                      >
                        <Input.TextArea
                          {...noAutoCapInputProps}
                          rows={3}
                          placeholder={getUriPlaceholder(dbType)}
                        />
                      </Form.Item>
                      <Space
                        size={8}
                        style={{ marginBottom: uriFeedback ? 12 : 16 }}
                        wrap
                      >
                        <Button onClick={handleGenerateURI}>{t("connectionModal.uri.generateButton")}</Button>
                        <Button onClick={handleParseURI}>{t("connectionModal.uri.parseButton")}</Button>
                        <Button onClick={handleCopyURI}>{t("connectionModal.uri.copyButton")}</Button>
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
                        clearLabel: t("connectionModal.uri.clearStoredUrl"),
                        description:
                          t("connectionModal.uri.storedUrlDescription"),
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
                  {t("connectionModal.jdbc.defaultBadge", { name: currentDriverSnapshot.defaultDriverName })}
                </Tag>
              ) : undefined,
              children: (
                <Form.Item
                  name="driver"
                  label={t("connectionModal.jdbc.driverLabel")}
                  help={t("connectionModal.jdbc.driverHelp")}
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    placeholder={t("connectionModal.jdbc.driverPlaceholder")}
                    popupMatchSelectWidth={false}
                    options={currentAvailableDriverOptions.map((option) => ({
                      value: option.driverType,
                      label: (
                        <Space size={6} wrap>
                          <span>{option.driverName}</span>
                          {option.default ? <Tag color="blue">{t("common.default")}</Tag> : null}
                          {option.reusedRuntime ? (
                            <Tag color="default">{t("connectionModal.jdbc.reuseRuntime")}</Tag>
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
                      message={t("connectionModal.custom.noticeTitle")}
                      description={t("connectionModal.custom.noticeDescription")}
                      style={{ marginBottom: 16 }}
                    />
                    {customDataSources.length === 0 && (
                      <Alert
                        showIcon
                        type="warning"
                        message={t("connectionModal.custom.emptyTitle")}
                        description={t("connectionModal.custom.emptyDescription")}
                        style={{ marginBottom: 16 }}
                        action={
                          onOpenDriverManager ? (
                            <Button size="small" onClick={onOpenDriverManager}>
                              {t("connectionModal.custom.openDriverManager")}
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                    <Form.Item
                      name="customDataSourceId"
                      label={t("connectionModal.custom.dataSourceLabel")}
                      rules={[
                        {
                          required: true,
                          message: t("connectionModal.custom.required"),
                        },
                      ]}
                    >
                      <Select
                        placeholder={t("connectionModal.custom.placeholder")}
                        popupMatchSelectWidth={false}
                        options={customDataSources.map((source) => ({
                          value: source.id,
                          label: t("connectionModal.custom.selectOptionLabel", { name: source.name, driver: source.driverType || source.driver || t("connectionModal.custom.unidentifiedDriver") }),
                        }))}
                        onChange={handleCustomDataSourceSelect}
                        notFoundContent={t("connectionModal.custom.notFound")}
                      />
                    </Form.Item>
                    <Space size={8} wrap style={{ marginBottom: 16 }}>
                      {onOpenDriverManager ? (
                        <Button onClick={onOpenDriverManager}>{t("connectionModal.custom.openDriverManager")}</Button>
                      ) : null}
                      <Button onClick={refreshCustomDataSources}>{t("connectionModal.custom.refreshList")}</Button>
                      {selectedCustomDataSource ? (
                        <Tag color="blue">
                          {t("connectionModal.custom.currentSource", { name: selectedCustomDataSource.name })}
                        </Tag>
                      ) : (
                        <Tag>{t("connectionModal.custom.notSelected")}</Tag>
                      )}
                      {selectedCustomDataSourceStatus?.definitionUsable ? (
                        <Tag color="success">{t("connectionModal.custom.definitionUsable")}</Tag>
                      ) : selectedCustomDataSourceStatus?.driverLoadable ? (
                        <Tag color="warning">{t("connectionModal.custom.driverLoadable")}</Tag>
                      ) : selectedCustomDataSource ? (
                        <Tag color="error">{t("connectionModal.custom.repairNeeded")}</Tag>
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
                          t("connectionModal.custom.statusUnknown")
                        }
                        description={(
                          <Space direction="vertical" size={4}>
                            <Text>
                              {t("connectionModal.custom.driverClassLabel")}
                              {selectedCustomDataSource.driverClassName ||
                                t("connectionModal.custom.driverClassMissing")}
                            </Text>
                            {selectedCustomDataSource.version ? (
                              <Text>{t("connectionModal.custom.versionLabel", { version: selectedCustomDataSource.version })}</Text>
                            ) : null}
                            {selectedCustomDataSource.jarFileNames?.length ? (
                              <Text>
                                {t("connectionModal.custom.jarLabel")} {selectedCustomDataSource.jarFileNames.join(", ")}
                              </Text>
                            ) : null}
                            {selectedCustomDataSourceRepairHints.length > 0 ? (
                              <Text type="secondary">
                                {t("connectionModal.custom.repairHintsLabel", { hints: selectedCustomDataSourceRepairHints.join("; ") })}
                              </Text>
                            ) : null}
                          </Space>
                        )}
                        style={{ marginBottom: 16 }}
                      />
                    ) : null}
                    <Form.Item
                      name="driver"
                      label={t("connectionModal.custom.driverFieldLabel")}
                      rules={[
                        {
                          required: true,
                          message: t("connectionModal.custom.driverFieldRequired"),
                        },
                      ]}
                      help={t("connectionModal.custom.driverFieldHelp")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        disabled
                        placeholder={t("connectionModal.custom.driverFieldPlaceholder")}
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
                      label={t("connectionModal.custom.dsnLabel")}
                      rules={[createCustomDsnRule()]}
                      help={
                        selectedCustomDataSource?.dsnTemplate
                          ? t("connectionModal.custom.dsnTemplateHelp", { template: selectedCustomDataSource.dsnTemplate })
                          : t("connectionModal.custom.dsnHelpDefault")
                      }
                    >
                      <Input.TextArea
                        {...noAutoCapInputProps}
                        rows={4}
                        placeholder={
                          selectedCustomDataSource?.dsnTemplate ||
                          t("connectionModal.custom.dsnPlaceholder")
                        }
                      />
                    </Form.Item>
                    {selectedCustomDataSource?.dsnHelp ? (
                      <Alert
                        showIcon
                        type="info"
                        message={t("connectionModal.custom.dsnHelpTitle")}
                        description={selectedCustomDataSource.dsnHelp}
                        style={{ marginBottom: 16 }}
                      />
                    ) : null}
                    {renderStoredSecretControls({
                      fieldName: "dsn",
                      clearKey: "opaqueDSN",
                      hasStoredSecret: initialValues?.hasOpaqueDSN,
                      clearLabel: t("connectionModal.custom.clearStoredDsn"),
                      description:
                        t("connectionModal.custom.storedDsnDescription"),
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
                        label={t("connectionModal.custom.usernameLabel")}
                        style={{ marginBottom: 0 }}
                        help={t("connectionModal.custom.usernameHelp")}
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder={t("connectionModal.custom.usernamePlaceholder")}
                        />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label={t("connectionModal.custom.passwordLabel")}
                        style={{ marginBottom: 0 }}
                        help={t("connectionModal.custom.passwordHelp")}
                      >
                        <Input.Password
                          {...noAutoCapInputProps}
                          placeholder={getStoredSecretPlaceholder({
                            hasStoredSecret: initialValues?.hasPrimaryPassword,
                            emptyPlaceholder: t("connectionModal.custom.passwordPlaceholder"),
                            retainedLabel: t("connectionModal.custom.retainedPasswordLabel"),
                          }, language)}
                        />
                      </Form.Item>
                    </div>
                    {renderStoredSecretControls({
                      fieldName: "password",
                      clearKey: "primaryPassword",
                      hasStoredSecret: initialValues?.hasPrimaryPassword,
                      clearLabel: t("connectionModal.custom.clearSavedPassword"),
                      description:
                        t("connectionModal.custom.storedPasswordDescription"),
                    })}
                    <Alert
                      showIcon
                      type="info"
                      message={t("connectionModal.custom.credentialsNoticeTitle")}
                      description={t("connectionModal.custom.credentialsNoticeDescription")}
                      style={{ marginTop: 16, marginBottom: 0 }}
                    />
                  </>
                ),
              })}
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
                        gridTemplateColumns:
                          isFileDb && !canBrowseDatabaseFile
                            ? "minmax(0, 1fr)"
                            : "minmax(0, 1fr) 120px",
                        gap: 16,
                        alignItems: "start",
                      }}
                    >
                      <Form.Item
                        name="host"
                        label={
                          isFileDb ? t("connectionModal.target.filePathLabel") : t("connectionModal.target.hostLabel")
                        }
                        rules={[createUriAwareRequiredRule(t("connectionModal.target.addressRequired"))]}
                        extra={
                          isFileDb && !canBrowseDatabaseFile
                            ? t("connectionModal.target.fileAbsolutePathHelp")
                            : undefined
                        }
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
                      {isFileDb && canBrowseDatabaseFile ? (
                        <Form.Item label=" " style={{ marginBottom: 0 }}>
                          <Button
                            style={{ width: "100%" }}
                            onClick={handleSelectDatabaseFile}
                            loading={selectingDbFile}
                          >
                            {t("connectionModal.target.browse")}
                          </Button>
                        </Form.Item>
                      ) : !isFileDb ? (
                        <Form.Item
                          name="port"
                          label={t("connectionModal.target.portLabel")}
                          rules={[
                            createUriAwareRequiredRule(
                              t("connectionModal.target.portRequired"),
                              (value) => Number(value) > 0,
                            ),
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber style={{ width: "100%" }} />
                        </Form.Item>
                      ) : null}
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
                      label={t("connectionModal.service.defaultDatabaseLabel")}
                      help={t("connectionModal.service.defaultDatabaseHelp")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input {...noAutoCapInputProps} placeholder={t("connectionModal.service.defaultDatabasePlaceholder")} />
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
                      label={t("connectionModal.service.oracleServiceNameLabel")}
                      rules={[
                        createUriAwareRequiredRule(
                          t("connectionModal.service.oracleServiceNameRequired"),
                        ),
                      ]}
                      help={t("connectionModal.service.oracleServiceNameHelp")}
                      style={{ marginBottom: 0 }}
                    >
                      <Input
                        {...noAutoCapInputProps}
                        placeholder={t("connectionModal.service.oracleServiceNamePlaceholder")}
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
                        label: t("connectionModal.topology.singleLabel"),
                        description: t("connectionModal.topology.mysqlSingleDescription"),
                      },
                      {
                        value: "replica",
                        label: t("connectionModal.topology.primaryReplicaLabel"),
                        description: t("connectionModal.topology.mysqlReplicaDescription"),
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
                        label={t("connectionModal.mysql.replicaHostsLabel")}
                        help={t("connectionModal.mysql.replicaHostsHelp")}
                      >
                        <Select
                          mode="tags"
                          placeholder={t("connectionModal.mysql.replicaHostsPlaceholder")}
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
                          label={t("connectionModal.mysql.replicaUserLabel")}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t("connectionModal.mysql.replicaUserPlaceholder")}
                          />
                        </Form.Item>
                        <Form.Item
                          name="mysqlReplicaPassword"
                          label={t("connectionModal.mysql.replicaPasswordLabel")}
                          style={{ marginBottom: 0 }}
                        >
                          <Input.Password
                            {...noAutoCapInputProps}
                            placeholder={getStoredSecretPlaceholder({
                              hasStoredSecret:
                                initialValues?.hasMySQLReplicaPassword,
                              emptyPlaceholder: t("connectionModal.mysql.replicaPasswordPlaceholder"),
                              retainedLabel: t("connectionModal.mysql.retainedReplicaPasswordLabel"),
                            }, language)}
                          />
                        </Form.Item>
                      </div>
                      {renderStoredSecretControls({
                        fieldName: "mysqlReplicaPassword",
                        clearKey: "mysqlReplicaPassword",
                        hasStoredSecret: initialValues?.hasMySQLReplicaPassword,
                        clearLabel: t("connectionModal.mysql.clearReplicaPassword"),
                        description:
                          t("connectionModal.mysql.storedReplicaPasswordDescription"),
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
                        label: t("connectionModal.topology.singleLabel"),
                        description: t("connectionModal.topology.mongodbSingleDescription"),
                      },
                      {
                        value: "replica",
                        label: t("connectionModal.topology.mongodbReplicaLabel"),
                        description: t("connectionModal.topology.mongodbReplicaDescription"),
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
                            label: t("connectionModal.mongo.discovery.standardLabel"),
                            description: t("connectionModal.mongo.discovery.standardDescription"),
                          },
                          {
                            value: true,
                            label: t("connectionModal.mongo.discovery.srvLabel"),
                            description:
                              t("connectionModal.mongo.discovery.srvDescription"),
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
                                {active ? <Tag color="blue">{t("connectionModal.common.current")}</Tag> : null}
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
                          message={t("connectionModal.mongo.discovery.srvSshWarning")}
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
                          mongoSrv ? t("connectionModal.mongo.hostsSrvLabel") : t("connectionModal.mongo.hostsLabel")
                        }
                        help={
                          mongoSrv
                            ? t("connectionModal.mongo.hostsSrvHelp")
                            : t("connectionModal.mongo.hostsHelp")
                        }
                      >
                        <Select
                          mode="tags"
                          placeholder={
                            mongoSrv
                              ? t("connectionModal.mongo.hostsSrvPlaceholder")
                              : t("connectionModal.mongo.hostsPlaceholder")
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
                          label={t("connectionModal.mongo.replicaSetLabel")}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t("connectionModal.mongo.replicaSetPlaceholder")}
                          />
                        </Form.Item>
                        <Form.Item
                          name="mongoReplicaUser"
                          label={t("connectionModal.mongo.replicaUserLabel")}
                          style={{ marginBottom: 0 }}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t("connectionModal.mongo.replicaUserPlaceholder")}
                          />
                        </Form.Item>
                      </div>
                      <Form.Item
                        name="mongoReplicaPassword"
                        label={t("connectionModal.mongo.replicaPasswordLabel")}
                        style={{ marginTop: 16, marginBottom: 0 }}
                      >
                        <Input.Password
                          {...noAutoCapInputProps}
                          placeholder={getStoredSecretPlaceholder({
                            hasStoredSecret:
                              initialValues?.hasMongoReplicaPassword,
                            emptyPlaceholder: t("connectionModal.mongo.replicaPasswordPlaceholder"),
                            retainedLabel: t("connectionModal.mongo.retainedReplicaPasswordLabel"),
                          }, language)}
                        />
                      </Form.Item>
                      {renderStoredSecretControls({
                        fieldName: "mongoReplicaPassword",
                        clearKey: "mongoReplicaPassword",
                        hasStoredSecret: initialValues?.hasMongoReplicaPassword,
                        clearLabel: t("connectionModal.mongo.clearReplicaPassword"),
                        description:
                          t("connectionModal.mongo.storedReplicaPasswordDescription"),
                      })}
                      <Space
                        size={8}
                        style={{ marginTop: 12, marginBottom: 12 }}
                      >
                        <Button
                          onClick={handleDiscoverMongoMembers}
                          loading={discoveringMembers}
                        >
                          {t("connectionModal.mongo.discoverMembers")}
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
                              title: t("connectionModal.mongo.memberRole"),
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
                              title: t("connectionModal.mongo.memberHealth"),
                              dataIndex: "healthy",
                              width: "20%",
                              render: (value: boolean) => (
                                <Tag color={value ? "success" : "error"}>
                                  {value ? t("connectionModal.mongo.memberHealthOk") : t("connectionModal.mongo.memberHealthBad")}
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
                        label={t("connectionModal.mongo.authSourceLabel")}
                        style={{ marginBottom: 0 }}
                      >
                        <Input
                          {...noAutoCapInputProps}
                          placeholder={t("connectionModal.mongo.authSourcePlaceholder")}
                        />
                      </Form.Item>
                      <div style={{ display: "grid", gap: 8 }}>
                        <Text strong>{t("connectionModal.mongo.readPreferenceLabel")}</Text>
                        {renderChoiceCards({
                          fieldName: "mongoReadPreference",
                          value: String(mongoReadPreference),
                          minWidth: 130,
                          options: [
                            {
                              value: "primary",
                              label: "primary",
                              description: t("connectionModal.mongo.readPreference.primaryDescription"),
                            },
                            {
                              value: "primaryPreferred",
                              label: "primaryPreferred",
                              description: t("connectionModal.mongo.readPreference.primaryPreferredDescription"),
                            },
                            {
                              value: "secondary",
                              label: "secondary",
                              description: t("connectionModal.mongo.readPreference.secondaryDescription"),
                            },
                            {
                              value: "secondaryPreferred",
                              label: "secondaryPreferred",
                              description: t("connectionModal.mongo.readPreference.secondaryPreferredDescription"),
                            },
                            {
                              value: "nearest",
                              label: "nearest",
                              description: t("connectionModal.mongo.readPreference.nearestDescription"),
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
                            label: t("connectionModal.topology.singleLabel"),
                            description: t("connectionModal.topology.redisSingleDescription"),
                          },
                          {
                            value: "cluster",
                            label: t("connectionModal.redis.clusterLabel"),
                            description: t("connectionModal.redis.clusterDescription"),
                          },
                        ],
                      })}
                      {redisTopology === "cluster" && (
                        <Form.Item
                          name="redisHosts"
                          label={t("connectionModal.redis.hostsLabel")}
                          help={t("connectionModal.redis.hostsHelp")}
                          style={{ marginTop: 16, marginBottom: 0 }}
                        >
                          <Select
                            mode="tags"
                            placeholder={t("connectionModal.redis.hostsPlaceholder")}
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
                      <Form.Item name="password" label={t("connectionModal.custom.passwordLabel")}>
                        <Input.Password
                          {...noAutoCapInputProps}
                          placeholder={getStoredSecretPlaceholder({
                            hasStoredSecret: initialValues?.hasPrimaryPassword,
                            emptyPlaceholder:
                              t("connectionModal.redis.passwordPlaceholder"),
                            retainedLabel: t("connectionModal.redis.retainedPasswordLabel"),
                          }, language)}
                        />
                      </Form.Item>
                      {renderStoredSecretControls({
                        fieldName: "password",
                        clearKey: "primaryPassword",
                        hasStoredSecret: initialValues?.hasPrimaryPassword,
                        clearLabel: t("connectionModal.custom.clearSavedPassword"),
                        description:
                          t("connectionModal.redis.storedPasswordDescription"),
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
                      label={t("connectionModal.databaseScope.label")}
                      help={t("connectionModal.databaseScope.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        mode="multiple"
                        placeholder={t("connectionModal.databaseScope.redisPlaceholder")}
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
                          label={t("connectionModal.credentials.usernameLabel")}
                          rules={
                            dbType === "mongodb"
                              ? []
                              : [createUriAwareRequiredRule(t("connectionModal.credentials.usernameRequired"))]
                          }
                          style={{ marginBottom: 0 }}
                        >
                          <Input {...noAutoCapInputProps} />
                        </Form.Item>
                        <Form.Item
                          name="password"
                          label={t("connectionModal.credentials.passwordLabel")}
                          style={{ marginBottom: 0 }}
                        >
                          <Input.Password
                            {...noAutoCapInputProps}
                            placeholder={getStoredSecretPlaceholder({
                              hasStoredSecret:
                                initialValues?.hasPrimaryPassword,
                              emptyPlaceholder: t("connectionModal.credentials.passwordPlaceholder"),
                              retainedLabel: t("connectionModal.custom.retainedPasswordLabel"),
                            }, language)}
                          />
                        </Form.Item>
                        {dbType === "mongodb" && (
                          <div style={{ display: "grid", gap: 8 }}>
                            <Text strong>{t("connectionModal.mongo.authMechanismLabel")}</Text>
                            {renderChoiceCards({
                              fieldName: "mongoAuthMechanism",
                              value: String(mongoAuthMechanism),
                              minWidth: 150,
                              options: [
                                {
                                  value: "",
                                  label: t("connectionModal.mongo.auth.autoLabel"),
                                  description: t("connectionModal.mongo.auth.autoDescription"),
                                },
                                {
                                  value: "NONE",
                                  label: t("connectionModal.mongo.auth.noneLabel"),
                                  description: t("connectionModal.mongo.auth.noneDescription"),
                                },
                                {
                                  value: "SCRAM-SHA-1",
                                  label: "SCRAM-SHA-1",
                                  description: t("connectionModal.mongo.auth.scramSha1Description"),
                                },
                                {
                                  value: "SCRAM-SHA-256",
                                  label: "SCRAM-SHA-256",
                                  description: t("connectionModal.mongo.auth.scramSha256Description"),
                                },
                                {
                                  value: "MONGODB-AWS",
                                  label: "MONGODB-AWS",
                                  description: t("connectionModal.mongo.auth.awsDescription"),
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
                        clearLabel: t("connectionModal.custom.clearSavedPassword"),
                        description:
                          t("connectionModal.credentials.storedPrimaryPasswordDescription"),
                      })}
                      {dbType === "mongodb" && (
                        <Form.Item
                          name="savePassword"
                          valuePropName="checked"
                          style={{ marginTop: 12, marginBottom: 0 }}
                        >
                          <Checkbox>{t("connectionModal.credentials.savePassword")}</Checkbox>
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
                      label={t("connectionModal.databaseScope.label")}
                      help={t("connectionModal.databaseScope.help")}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        mode="multiple"
                        placeholder={t("connectionModal.databaseScope.placeholder")}
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
      !isFileDb
        ? (() => {
            const networkItems: Array<{
              key: "ssl" | "ssh" | "proxy";
              title: string;
              description: string;
              enabled: boolean;
            }> = [
              ...(isSSLType
                ? [
                    {
                      key: "ssl" as const,
                      title: "SSL/TLS",
                      description: t("connectionModal.network.ssl.description"),
                      enabled: useSSL,
                    },
                  ]
                : []),
              {
                key: "ssh",
                title: t("connectionModal.network.ssh.title"),
                description: t("connectionModal.network.ssh.description"),
                enabled: useSSH,
              },
              {
                key: "proxy",
                title: t("connectionModal.network.proxy.title"),
                description: t("connectionModal.network.proxy.description"),
                enabled: useProxy,
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
                      {t("connectionModal.ssl.sectionDescription")}
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
                        {t("connectionModal.ssl.disabledDescription")}
                      </div>
                    ) : (
                      <div style={tunnelSectionStyle}>
                        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                          <Text strong>{t("connectionModal.ssl.modeLabel")}</Text>
                          {renderChoiceCards({
                            fieldName: "sslMode",
                            value: String(sslMode),
                            options: [
                              {
                                value: "preferred",
                                label: t("connectionModal.ssl.mode.preferred"),
                                description: sslModeRiskDescription(LEGACY_COMPAT_SSL_MODE),
                              },
                              {
                                value: "required",
                                label: t("connectionModal.ssl.mode.required"),
                                description: sslModeRiskDescription("required"),
                              },
                              {
                                value: "skip-verify",
                                label: t("connectionModal.ssl.mode.skipVerify"),
                                description: sslModeRiskDescription("skip-verify"),
                              },
                            ],
                          })}
                        </div>
                        {dbType === "dameng" && (
                          <>
                            <Form.Item
                              name="sslCertPath"
                              label={t("connectionModal.ssl.certPathLabel")}
                              rules={[
                                {
                                  required: true,
                                  message: t("connectionModal.ssl.certPathRequired"),
                                },
                              ]}
                              style={{ marginBottom: 8 }}
                            >
                              <Input
                                {...noAutoCapInputProps}
                                placeholder={t("connectionModal.ssl.certPathPlaceholder")}
                              />
                            </Form.Item>
                            <Form.Item
                              name="sslKeyPath"
                              label={t("connectionModal.ssl.keyPathLabel")}
                              rules={[
                                {
                                  required: true,
                                  message: t("connectionModal.ssl.keyPathRequired"),
                                },
                              ]}
                              style={{ marginBottom: 8 }}
                            >
                              <Input
                                {...noAutoCapInputProps}
                                placeholder={t("connectionModal.ssl.keyPathPlaceholder")}
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
                      {t("connectionModal.network.ssh.title")}
                    </div>
                    <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                      {t("connectionModal.ssh.sectionDescription")}
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
                        {t("connectionModal.ssh.disabledDescription")}
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
                            label={t("connectionModal.ssh.hostLabel")}
                            rules={[
                              { required: useSSH, message: t("connectionModal.ssh.hostRequired") },
                            ]}
                            style={{ flex: 1 }}
                          >
                            <Input
                              {...noAutoCapInputProps}
                              placeholder={t("connectionModal.ssh.hostPlaceholder")}
                            />
                          </Form.Item>
                          <Form.Item
                            name="sshPort"
                            label={t("connectionModal.network.portLabel")}
                            rules={[
                              { required: useSSH, message: t("connectionModal.ssh.portRequired") },
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
                            label={t("connectionModal.ssh.userLabel")}
                            rules={[
                              { required: useSSH, message: t("connectionModal.ssh.userRequired") },
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
                            label={t("connectionModal.ssh.passwordLabel")}
                            style={{ flex: 1 }}
                          >
                            <Input.Password
                              {...noAutoCapInputProps}
                              placeholder={getStoredSecretPlaceholder({
                                hasStoredSecret: initialValues?.hasSSHPassword,
                                emptyPlaceholder: t("connectionModal.credentials.passwordPlaceholder"),
                                retainedLabel: t("connectionModal.ssh.retainedPasswordLabel"),
                              }, language)}
                            />
                          </Form.Item>
                        </div>
                        <Form.Item
                          label={t("connectionModal.ssh.privateKeyPathLabel")}
                          help={t("connectionModal.ssh.privateKeyPathHelp")}
                        >
                          <Space.Compact style={{ width: "100%" }}>
                            <Form.Item name="sshKeyPath" noStyle>
                              <Input
                                {...noAutoCapInputProps}
                                placeholder={t("connectionModal.ssh.privateKeyPathPlaceholder")}
                              />
                            </Form.Item>
                            <Button
                              onClick={handleSelectSSHKeyFile}
                              loading={selectingSSHKey}
                            >
                              {t("connectionModal.target.browse")}
                            </Button>
                            <Button
                              onClick={handleTestSSHConnection}
                              loading={loading}
                            >
                              {t("connectionModal.ssh.testButton")}
                            </Button>
                          </Space.Compact>
                        </Form.Item>
                        {renderStoredSecretControls({
                          fieldName: "sshPassword",
                          clearKey: "sshPassword",
                          hasStoredSecret: initialValues?.hasSSHPassword,
                          clearLabel: t("connectionModal.ssh.clearSavedPassword"),
                          description: t("connectionModal.ssh.storedPasswordDescription"),
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
                      {t("connectionModal.network.proxy.title")}
                    </div>
                    <div style={{ ...modalMutedTextStyle, marginBottom: 14 }}>
                      {t("connectionModal.proxy.sectionDescription")}
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
                        {t("connectionModal.proxy.disabledDescription")}
                      </div>
                    ) : (
                      <div style={tunnelSectionStyle}>
                        <Form.Item
                          name="proxyHost"
                          label={t("connectionModal.proxy.hostLabel")}
                          rules={[
                            { required: useProxy, message: t("connectionModal.proxy.hostRequired") },
                          ]}
                        >
                          <Input
                            {...noAutoCapInputProps}
                            placeholder={t("connectionModal.proxy.hostPlaceholder")}
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
                            <Text strong>{t("connectionModal.proxy.typeLabel")}</Text>
                            {renderChoiceCards({
                              fieldName: "proxyType",
                              value: String(proxyType),
                              minWidth: 150,
                              options: [
                                {
                                  value: "socks5",
                                  label: "SOCKS5",
                                  description: t("connectionModal.proxy.socks5Description"),
                                },
                                {
                                  value: "http",
                                  label: "HTTP CONNECT",
                                  description: t("connectionModal.proxy.httpDescription"),
                                },
                              ],
                            })}
                          </div>
                          <Form.Item
                            name="proxyPort"
                            label={t("connectionModal.network.portLabel")}
                            rules={[
                              { required: useProxy, message: t("connectionModal.proxy.portRequired") },
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
                            label={t("connectionModal.proxy.usernameLabel")}
                            style={{ flex: 1 }}
                          >
                            <Input
                              {...noAutoCapInputProps}
                              placeholder={t("connectionModal.proxy.noAuthPlaceholder")}
                            />
                          </Form.Item>
                          <Form.Item
                            name="proxyPassword"
                            label={t("connectionModal.proxy.passwordLabel")}
                            style={{ flex: 1 }}
                          >
                            <Input.Password
                              {...noAutoCapInputProps}
                              placeholder={getStoredSecretPlaceholder({
                                hasStoredSecret:
                                  initialValues?.hasProxyPassword,
                                emptyPlaceholder: t("connectionModal.proxy.noAuthPlaceholder"),
                                retainedLabel: t("connectionModal.proxy.retainedPasswordLabel"),
                              }, language)}
                            />
                          </Form.Item>
                        </div>
                        {renderStoredSecretControls({
                          fieldName: "proxyPassword",
                          clearKey: "proxyPassword",
                          hasStoredSecret: initialValues?.hasProxyPassword,
                          clearLabel: t("connectionModal.proxy.clearSavedPassword"),
                          description: t("connectionModal.proxy.storedPasswordDescription"),
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return null;
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
                  {t("connectionModal.network.title")}
                </div>
                <div style={{ ...modalMutedTextStyle, marginBottom: 16 }}>
                  {t("connectionModal.network.description")}
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
                                    : "useProxy"
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
                                      {t("connectionModal.network.currentEditing")}
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
                                    {item.enabled ? t("connectionModal.network.enabled") : t("connectionModal.network.disabled")}
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
                    {t("connectionModal.advanced.title")}
                  </div>
                  <Form.Item
                    name="timeout"
                    label={t("connectionModal.advanced.timeoutLabel")}
                    help={t("connectionModal.advanced.timeoutHelp")}
                    rules={[
                      {
                        type: "number",
                        min: 1,
                        max: 300,
                        message: t("connectionModal.advanced.timeoutRange"),
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
            const enabledSSH = !!changed.useSSH;
            setUseSSH(enabledSSH);
            if (enabledSSH) {
              setActiveNetworkConfig("ssh");
              if (form.getFieldValue("useProxy")) {
                form.setFieldValue("useProxy", false);
                setUseProxy(false);
              }
            }
          }
          if (changed.useProxy !== undefined) {
            const enabledProxy = !!changed.useProxy;
            setUseProxy(enabledProxy);
            if (enabledProxy) {
              setActiveNetworkConfig("proxy");
              if (form.getFieldValue("useSSH")) {
                form.setFieldValue("useSSH", false);
                setUseSSH(false);
              }
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
          if (changed.type !== undefined) setDbType(changed.type);
          if (changed.redisTopology !== undefined) {
            const supportedDbs = Array.from({ length: 16 }, (_, i) => i);
            setRedisDbList(supportedDbs);
            const selectedDbsRaw = form.getFieldValue("includeRedisDatabases");
            const selectedDbs = toNumberList(selectedDbsRaw);
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
            message={t("connectionModal.error.driverUnavailable")}
            description={
              <Space size={8}>
                <span>{currentDriverUnavailableReason}</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => onOpenDriverManager?.()}
                >
                  {t("connectionModal.driver.installAction")}
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
              title: t("connectionModal.baseInfo.title"),
              description: t("connectionModal.config.basic.description"),
              icon: <DatabaseOutlined />,
            },
            ...(!isCustom && !isFileDb
              ? [
                  {
                    key: "network" as const,
                    title: t("connectionModal.network.title"),
                    description: t("connectionModal.config.network.description"),
                    icon: <CloudOutlined />,
                  },
                ]
              : []),
            {
              key: "appearance",
              title: t("connectionModal.appearance.title"),
              description: t("connectionModal.appearance.description"),
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
                  {t("connectionModal.appearance.iconLabel")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DB_ICON_TYPES.map((iconKey) => {
                    const isActive = effectiveIconType === iconKey;
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        title={getLocalizedDbIconLabel(iconKey)}
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
                  {t("connectionModal.appearance.currentIcon", { name: getLocalizedDbIconLabel(effectiveIconType) })}
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
                  {t("connectionModal.appearance.colorLabel")}
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
                    title={t("connectionModal.appearance.customColorTitle")}
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
                  {t("connectionModal.appearance.preview")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {getDbIcon(effectiveIconType, effectiveIconColor, 24)}
                  <span
                    style={{
                      fontSize: 14,
                      color: darkMode ? "#e0e0e0" : "#333",
                    }}
                  >
                    {form.getFieldValue("name") || t("connectionModal.appearance.connectionNamePlaceholder")}
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
                    {t("connectionModal.appearance.resetDefault")}
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
                  {t("connectionModal.configSection.title")}
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
          {t("common.cancel")}
        </Button>,
      ];
    }
    const isTestSuccess = testResult?.type === "success";
    const hasTestError = !!testResult && !isTestSuccess;
    const testFailureSummary = hasTestError
      ? summarizeConnectionTestFailureMessage(testResult?.message, t("connectionModal.error.connectionFailed"), language)
      : "";
    const operationBlocked =
      !!currentDriverUnavailableReason || driverStatusChecking;
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
              {t("connectionModal.footer.previous")}
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
              <span>{isTestSuccess ? t("connectionModal.footer.success") : t("connectionModal.error.connectionFailed")}</span>
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
              {t("connectionModal.footer.viewReason")}
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
            {t("connectionModal.footer.test")}
          </Button>
          <Button key="cancel" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            key="submit"
            type="primary"
            loading={loading}
            disabled={operationBlocked}
            onClick={handleOk}
          >
            {t("common.save")}
          </Button>
        </Space>
      </div>
    );
  };

  const getTitle = () => {
    if (step === 1) {
      return renderConnectionModalTitle(
        <AppstoreOutlined />,
        t("connectionModal.modal.selectTypeTitle"),
        t("connectionModal.modal.selectTypeDescription"),
      );
    }
    const typeName = dbTypes.find((t) => t.key === dbType)?.name || dbType;
    return initialValues
      ? renderConnectionModalTitle(
          <EditOutlined />,
          t("connectionModal.modal.editTitle"),
          t("connectionModal.modal.editDescription", { type: typeName }),
        )
      : renderConnectionModalTitle(
          <LinkOutlined />,
          t("connectionModal.modal.createTitle", { type: typeName }),
          t("connectionModal.modal.createDescription"),
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
      <input
        ref={sshKeyUploadInputRef}
        type="file"
        accept=".pem,.key,.ppk,id_rsa,id_ed25519"
        style={{ display: "none" }}
        onChange={handleSSHKeyUploadSelected}
      />
      <Modal
        title={renderConnectionModalTitle(
          <FileTextOutlined />,
          t("connectionModal.errorLog.title"),
          t("connectionModal.errorLog.description"),
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
            {t("common.close")}
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
          {String(testResult?.message || t("connectionModal.errorLog.empty"))}
        </pre>
      </Modal>
    </>
  );
};

export default ConnectionModal;
