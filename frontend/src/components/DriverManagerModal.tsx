import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Collapse, Form, Input, Modal, Progress, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DatabaseOutlined, DeleteOutlined, DownloadOutlined, FolderOpenOutlined, InfoCircleFilled, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { EventsOn } from '@compat/runtime';
import { useStore } from '../store';
import { normalizeOpacityForPlatform, resolveAppearanceValues } from '../utils/appearance';
import {
  createCustomDataSource,
  createCustomDataSourceFromBackendDefinition,
  extractBackendCustomDataSourceDefinition,
  extractBackendCustomDataSourceDefinitions,
  loadCustomDataSources,
  mergeBackendCustomDataSourceDefinitions,
  removeCustomDataSource,
  upsertCustomDataSource,
  type CustomDataSource,
} from '../utils/customDataSources';
import {
  CheckDriverNetworkStatus,
  ConfigureDefaultDriver,
  ConfigureDriverRepositoryURL,
  DownloadDriverPackage,
  GetCustomDriverDefinitions,
  GetDriverVersionList,
  GetDriverVersionPackageSize,
  GetDriverStatusList,
  OpenDriverDownloadDirectory,
  RemoveDriverPackage,
  UploadLocalDriverPackage,
  ValidateCustomDriverDefinition,
} from '@compat/javanaviApp';
import { filterDriverOptionsForDatabase, normalizeDriverSelectionType, resolveDefaultDriverTypeForDatabase } from '../utils/driverSelection';
import { getRuntimeLanguage, translateCompatibilityFallback } from '../i18n';

const { Paragraph, Text } = Typography;

const compatText = (text: string, kind: 'text' | 'jsx' | 'message' = 'text') => translateCompatibilityFallback(getRuntimeLanguage(), text, kind);

type JsonRecord = Record<string, unknown>;

type DriverStatusResponseData = {
  downloadDir?: unknown;
  drivers?: unknown;
};

type DriverStatusItem = JsonRecord & {
  type?: unknown;
  name?: unknown;
  builtIn?: unknown;
  managedJarUploadAllowed?: unknown;
  managedDownload?: unknown;
  downloadRequired?: unknown;
  reusedDriverType?: unknown;
  reusedDriverName?: unknown;
  pinnedVersion?: unknown;
  installedVersion?: unknown;
  installedVersions?: unknown;
  installedVersionCount?: unknown;
  packageSizeText?: unknown;
  runtimeAvailable?: unknown;
  packageInstalled?: unknown;
  connectable?: unknown;
  defaultDownloadUrl?: unknown;
  installDir?: unknown;
  packagePath?: unknown;
  executablePath?: unknown;
  downloadedAt?: unknown;
  installMode?: unknown;
  installSource?: unknown;
  installSourceLabel?: unknown;
  installSourceDetail?: unknown;
  defaultDriverType?: unknown;
  defaultDriverName?: unknown;
  driverOptions?: unknown;
  message?: unknown;
};

type DriverOptionPayload = JsonRecord & {
  driverType?: unknown;
  driverName?: unknown;
  databaseType?: unknown;
  databaseName?: unknown;
  available?: unknown;
  connectable?: unknown;
  default?: unknown;
  defaultDriver?: unknown;
  runtimeOwnerType?: unknown;
  runtimeOwnerName?: unknown;
  reusedRuntime?: unknown;
  driverClassName?: unknown;
  message?: unknown;
};

type DriverInstalledVersionPayload = JsonRecord & {
  version?: unknown;
  active?: unknown;
  installMode?: unknown;
  installSource?: unknown;
  downloadedAt?: unknown;
  installDir?: unknown;
  filePath?: unknown;
};

type DriverNetworkStatusPayload = JsonRecord & {
  checks?: unknown;
  reachable?: unknown;
  summary?: unknown;
  downloadChainReachable?: unknown;
  downloadRequiredHosts?: unknown;
  checkedAt?: unknown;
  logPath?: unknown;
  repositoryURL?: unknown;
  repositoryUrl?: unknown;
  configuredRepositoryURL?: unknown;
  configuredRepositoryUrl?: unknown;
  defaultRepositoryURL?: unknown;
  defaultRepositoryUrl?: unknown;
  repositoryConfigured?: unknown;
};

type DriverNetworkProbePayload = JsonRecord & {
  name?: unknown;
  url?: unknown;
  reachable?: unknown;
  httpStatus?: unknown;
  latencyMs?: unknown;
  tcpLatencyMs?: unknown;
  httpLatencyMs?: unknown;
  method?: unknown;
  error?: unknown;
};

type DriverVersionListPayload = JsonRecord & {
  versions?: unknown;
};

type DriverVersionPayload = JsonRecord & {
  version?: unknown;
  downloadUrl?: unknown;
  packageSizeText?: unknown;
  recommended?: unknown;
  source?: unknown;
  year?: unknown;
  displayLabel?: unknown;
};

type DriverPackageSizePayload = JsonRecord & {
  packageSizeText?: unknown;
};

type DriverRepositoryPayload = JsonRecord & {
  repositoryUrl?: unknown;
  repositoryURL?: unknown;
};

type DriverDirectoryPayload = JsonRecord & {
  opened?: unknown;
  path?: unknown;
  directory?: unknown;
  message?: unknown;
};

type AntdValidationError = { errorFields?: unknown };

type VersionSelectOption = { value: string; label: string };
type VersionSelectGroup = { label: string; options: VersionSelectOption[] };
type VersionSelectEntry = VersionSelectOption | VersionSelectGroup;

const toRecord = <T extends JsonRecord>(value: unknown): T => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as T : {} as T
);

const getErrorMessage = (error: unknown, fallback = ''): string => (
  error instanceof Error ? error.message : String(error || fallback)
);

const isAntdValidationError = (error: unknown): error is AntdValidationError => (
  !!error && typeof error === 'object' && 'errorFields' in error
);

const toStringRecord = (value: unknown): Record<string, string> => {
  const record = toRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, String(item ?? '')]),
  );
};

type DriverOption = {
  driverType: string;
  driverName: string;
  databaseType?: string;
  databaseName?: string;
  available: boolean;
  connectable: boolean;
  default?: boolean;
  runtimeOwnerType?: string;
  runtimeOwnerName?: string;
  reusedRuntime?: boolean;
  driverClassName?: string;
  message?: string;
};

type DriverStatusRow = {
  type: string;
  name: string;
  builtIn: boolean;
  managedJarUploadAllowed?: boolean;
  managedDownload?: boolean;
  downloadRequired?: boolean;
  reusedDriverType?: string;
  reusedDriverName?: string;
  pinnedVersion?: string;
  installedVersion?: string;
  installedVersions?: DriverInstalledVersion[];
  installedVersionCount?: number;
  packageSizeText?: string;
  runtimeAvailable: boolean;
  packageInstalled: boolean;
  connectable: boolean;
  defaultDownloadUrl?: string;
  installDir?: string;
  packagePath?: string;
  executablePath?: string;
  downloadedAt?: string;
  installMode?: string;
  installSource?: string;
  installSourceLabel?: string;
  installSourceDetail?: string;
  defaultDriverType?: string;
  defaultDriverName?: string;
  driverOptions?: DriverOption[];
  message?: string;
};

type DriverInstalledVersion = {
  version: string;
  active?: boolean;
  installMode?: string;
  installSource?: string;
  downloadedAt?: string;
  installDir?: string;
  filePath?: string;
};

type DriverProgressEvent = {
  driverType?: string;
  status?: 'start' | 'downloading' | 'done' | 'error';
  message?: string;
  percent?: number;
};

type ProgressState = {
  status: 'start' | 'downloading' | 'done' | 'error';
  message: string;
  percent: number;
};

type DriverActionKind = '' | 'install' | 'remove' | 'upload';
type DriverStatusFilter = 'all' | 'attention' | 'available' | 'custom';

type DriverLogEntry = {
  time: string;
  text: string;
  signature: string;
};

type DriverNetworkProbe = {
  name: string;
  url: string;
  reachable: boolean;
  httpStatus?: number;
  latencyMs?: number;
  tcpLatencyMs?: number;
  httpLatencyMs?: number;
  method?: string;
  error?: string;
};

type DriverNetworkStatus = {
  reachable: boolean;
  summary: string;
  downloadChainReachable?: boolean;
  downloadRequiredHosts?: string[];
  checks: DriverNetworkProbe[];
  checkedAt?: string;
  logPath?: string;
  repositoryURL?: string;
  repositoryUrl?: string;
  configuredRepositoryURL?: string;
  configuredRepositoryUrl?: string;
  defaultRepositoryURL?: string;
  defaultRepositoryUrl?: string;
  repositoryConfigured?: boolean;
};

const parseOptionalLatency = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
};

const isRepositoryConnectivityProbe = (probe?: DriverNetworkProbe | null): boolean => (
  probe?.name === 'Maven driver repository' || probe?.name === 'Built-in driver matrix'
);

const sharedInfoAlertIcon = <InfoCircleFilled style={{ fontSize: 24 }} />;

type DriverVersionOption = {
  version: string;
  downloadUrl: string;
  packageSizeText?: string;
  recommended?: boolean;
  installed?: boolean;
  active?: boolean;
  source?: string;
  year?: string;
  displayLabel?: string;
};

type DriverVersionNotice = {
  message: string;
};

const buildVersionOptionKey = (option: DriverVersionOption) => `${option.version}@@${option.downloadUrl}`;
const buildVersionSizeLoadingKey = (driverType: string, optionKey: string) => `${driverType}@@${optionKey}`;
const DRIVER_TABLE_SCROLL_X = 720;
const DRIVER_STATUS_CACHE_TTL_MS = 60 * 1000;
const DRIVER_NETWORK_CACHE_TTL_MS = 5 * 60 * 1000;
const DRIVER_STATUS_INITIAL_RETRY_COUNT = 3;
const DRIVER_STATUS_RETRY_DELAY_MS = 500;
const DEFAULT_UPLOAD_DRIVER_VERSION = '上传-1.0';
const CUSTOM_DRIVER_TYPE_PREFIX = 'custom-';
const normalizeDriverSearchText = (value: string) => String(value || '').trim().toLowerCase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const defaultDriverLabelStyle: React.CSSProperties = {
  alignItems: 'center',
  display: 'inline-flex',
  gap: 4,
  maxWidth: '100%',
  minWidth: 0,
  overflow: 'hidden',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};
const defaultDriverNameStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const defaultDriverTagStyle: React.CSSProperties = {
  flex: '0 0 auto',
  marginInlineEnd: 0,
};

const driverSourceTagColor = (source?: string) => {
  switch (String(source || '').trim()) {
    case 'maven-download':
      return 'geekblue';
    case 'manual-upload':
      return 'purple';
    case 'backend-runtime':
    case 'runtime':
      return 'success';
    case 'reused-runtime':
      return 'cyan';
    case 'not-installed':
      return 'default';
    default:
      return 'blue';
  }
};


const isDriverRowAvailable = (row: DriverStatusRow): boolean => (
  row.connectable || (row.builtIn && row.runtimeAvailable)
);

const isDriverRowAttention = (row: DriverStatusRow): boolean => (
  !isDriverRowAvailable(row) && !row.builtIn && (
    !!row.managedDownload ||
    !!row.downloadRequired ||
    !!row.packageInstalled ||
    !!row.managedJarUploadAllowed ||
    !!row.message
  )
);

const isCustomDriverRow = (row: DriverStatusRow): boolean => (
  String(row.type || '').startsWith(CUSTOM_DRIVER_TYPE_PREFIX) ||
  String(row.installSource || '').trim() === 'manual-upload'
);

const driverStatusLabel = (row: DriverStatusRow, progress?: ProgressState): string => {
  if (row.builtIn) {
    return row.runtimeAvailable ? '内置可用' : '内置待接入';
  }
  if (row.reusedDriverType) {
    return row.connectable ? `复用 ${row.reusedDriverName || row.reusedDriverType}` : `等待 ${row.reusedDriverName || row.reusedDriverType}`;
  }
  if (progress && (progress.status === 'start' || progress.status === 'downloading')) {
    return `安装中 ${Math.round(progress.percent)}%`;
  }
  if (row.connectable) {
    return '可用';
  }
  if (row.packageInstalled) {
    return '已安装';
  }
  if (row.managedDownload || row.downloadRequired) {
    return '待安装';
  }
  return '未启用';
};

const driverStatusColor = (row: DriverStatusRow, progress?: ProgressState): string => {
  if (progress && (progress.status === 'start' || progress.status === 'downloading')) return 'processing';
  if (isDriverRowAvailable(row)) return 'success';
  if (isDriverRowAttention(row) || row.packageInstalled) return 'warning';
  return 'default';
};

const customDriverTypeSlug = (value: string): string => {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || `datasource-${Date.now().toString(36)}`;
};

const createUniqueCustomDriverType = (name: string, existingDriverTypes: Iterable<string>): string => {
  const used = new Set(
    Array.from(existingDriverTypes)
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const base = `${CUSTOM_DRIVER_TYPE_PREFIX}${customDriverTypeSlug(name)}`.slice(0, 64);
  if (!used.has(base)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${CUSTOM_DRIVER_TYPE_PREFIX}${Date.now().toString(36)}`;
};

const summarizeJarFileNames = (files: File[]): string => {
  const names = files.map((file) => String(file.name || '').trim()).filter(Boolean);
  if (names.length === 0) {
    return '未选择 Jar 文件';
  }
  return names.length > 3
    ? `${names.slice(0, 3).join('、')} 等 ${names.length} 个文件`
    : names.join('、');
};

let driverStatusSnapshotCache: { rows: DriverStatusRow[]; downloadDir: string; cachedAt: number } | null = null;
let driverNetworkSnapshotCache: { status: DriverNetworkStatus; cachedAt: number } | null = null;

const isFreshCache = (cachedAt: number, ttlMs: number): boolean => Date.now() - cachedAt <= ttlMs;

const buildVersionSelectOptions = (options: DriverVersionOption[]): VersionSelectEntry[] => {
  if (options.length === 0) {
    return [];
  }

  const yearGroups = new Map<string, VersionSelectOption[]>();
  const others: VersionSelectOption[] = [];
  options.forEach((option) => {
    const selectOption: VersionSelectOption = {
      value: buildVersionOptionKey(option),
      label: option.displayLabel || option.version || compatText('默认版本'),
    };
    const year = String(option.year || '').trim();
    if (!year) {
      others.push(selectOption);
      return;
    }
    const group = yearGroups.get(year) || [];
    group.push(selectOption);
    yearGroups.set(year, group);
  });

  const sortedYears = Array.from(yearGroups.keys()).sort((a, b) => {
    const left = Number.parseInt(a, 10);
    const right = Number.parseInt(b, 10);
    const leftValid = Number.isFinite(left);
    const rightValid = Number.isFinite(right);
    if (leftValid && rightValid) {
      return right - left;
    }
    return b.localeCompare(a);
  });

  const grouped: VersionSelectGroup[] = sortedYears.map((year) => ({
    label: `${year} 年`,
    options: yearGroups.get(year) || [],
  }));
  if (others.length > 0) {
    grouped.push({ label: compatText('其他'), options: others });
  }
  return grouped;
};

const renderDefaultDriverLabel = (
  driverName: string,
  showDefaultTag?: boolean,
  showReusedRuntimeTag?: boolean,
) => (
  <span style={defaultDriverLabelStyle}>
    <span style={defaultDriverNameStyle}>{driverName}</span>
    {showDefaultTag ? <Tag color="blue" style={defaultDriverTagStyle}>默认</Tag> : null}
    {showReusedRuntimeTag ? <Tag color="default" style={defaultDriverTagStyle}>复用 runtime</Tag> : null}
  </span>
);

const DriverManagerModal: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const [customDataSourceForm] = Form.useForm();
  const theme = useStore((state) => state.theme);
  const appearance = useStore((state) => state.appearance);
  const darkMode = theme === 'dark';
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const opacity = normalizeOpacityForPlatform(resolvedAppearance.opacity);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const tableScrollTargetsRef = useRef<HTMLElement[]>([]);
  const externalHScrollRef = useRef<HTMLDivElement | null>(null);
  const horizontalSyncSourceRef = useRef<'table' | 'external' | ''>('');
  const [loading, setLoading] = useState(false);
  const [downloadDir, setDownloadDir] = useState('');
  const [networkChecking, setNetworkChecking] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<DriverNetworkStatus | null>(null);
  const [repositoryURL, setRepositoryURL] = useState('');
  const [repositorySaving, setRepositorySaving] = useState(false);
  const [repositoryEditing, setRepositoryEditing] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<DriverStatusFilter>('all');
  const [selectedDriverType, setSelectedDriverType] = useState('');
  const [rows, setRows] = useState<DriverStatusRow[]>([]);
  const [actionState, setActionState] = useState<{ driverType: string; kind: DriverActionKind }>({ driverType: '', kind: '' });
  const [progressMap, setProgressMap] = useState<Record<string, ProgressState>>({});
  const [operationLogMap, setOperationLogMap] = useState<Record<string, DriverLogEntry[]>>({});
  const [logDriverType, setLogDriverType] = useState('');
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [versionMap, setVersionMap] = useState<Record<string, DriverVersionOption[]>>({});
  const [versionNoticeMap, setVersionNoticeMap] = useState<Record<string, DriverVersionNotice>>({});
  const [selectedVersionMap, setSelectedVersionMap] = useState<Record<string, string>>({});
  const [versionLoadingMap, setVersionLoadingMap] = useState<Record<string, boolean>>({});
  const [versionSizeLoadingMap, setVersionSizeLoadingMap] = useState<Record<string, boolean>>({});
  const [defaultDriverSavingKey, setDefaultDriverSavingKey] = useState('');
  const [customDataSources, setCustomDataSources] = useState<CustomDataSource[]>(() => loadCustomDataSources());
  const [customDataSourceModalOpen, setCustomDataSourceModalOpen] = useState(false);
  const [customDataSourceFiles, setCustomDataSourceFiles] = useState<File[]>([]);
  const [customDataSourceSaving, setCustomDataSourceSaving] = useState(false);
  const [customDefinitionLoading, setCustomDefinitionLoading] = useState(false);
  const [customDefinitionValidating, setCustomDefinitionValidating] = useState<Record<string, boolean>>({});
  const [horizontalScrollWidth, setHorizontalScrollWidth] = useState(DRIVER_TABLE_SCROLL_X);
  const [statusLoadError, setStatusLoadError] = useState('');
  const downloadDirRef = useRef(downloadDir);
  const repositoryURLRef = useRef(repositoryURL);

  useEffect(() => {
    downloadDirRef.current = downloadDir;
  }, [downloadDir]);

  useEffect(() => {
    repositoryURLRef.current = repositoryURL;
  }, [repositoryURL]);

  const appendOperationLog = useCallback((
    driverType: string,
    text: string,
    signature?: string,
    mode: 'append' | 'update-last' = 'append',
  ) => {
    const normalized = String(driverType || '').trim().toLowerCase();
    const content = String(text || '').trim();
    if (!normalized || !content) {
      return;
    }
    const sign = String(signature || content).trim() || content;
    const now = new Date().toLocaleTimeString();
    setOperationLogMap((prev) => {
      const history = prev[normalized] || [];
      if (history.length > 0) {
        const last = history[history.length - 1];
        if (last.signature === sign) {
          if (mode === 'update-last') {
            if (last.text === content) {
              return prev;
            }
            const nextHistory = [...history];
            nextHistory[nextHistory.length - 1] = {
              ...last,
              text: content,
              time: now,
            };
            return { ...prev, [normalized]: nextHistory };
          }
          return prev;
        }
      }
      const nextHistory = [
        ...history,
        {
          time: now,
          text: content,
          signature: sign,
        },
      ];
      const sliced = nextHistory.length > 200 ? nextHistory.slice(nextHistory.length - 200) : nextHistory;
      return { ...prev, [normalized]: sliced };
    });
  }, []);

  const refreshHorizontalScrollState = useCallback(() => {
    const tableContainer = tableContainerRef.current;
    const targets = tableContainer
      ? [
          ...new Set(
            [
              ...Array.from(tableContainer.querySelectorAll('.ant-table-content')),
              ...Array.from(tableContainer.querySelectorAll('.ant-table-body')),
            ].filter((node): node is HTMLElement => node instanceof HTMLElement),
          ),
        ]
      : tableScrollTargetsRef.current;
    if (!targets || targets.length === 0) {
      setHorizontalScrollWidth(DRIVER_TABLE_SCROLL_X);
      return;
    }

    const nextWidth = Math.max(
      DRIVER_TABLE_SCROLL_X,
      ...targets.map((target) => Math.max(0, target.scrollWidth)),
    );
    setHorizontalScrollWidth((prev) => (prev === nextWidth ? prev : nextWidth));

    const externalScroll = externalHScrollRef.current;
    if (!externalScroll || horizontalSyncSourceRef.current === 'external') {
      return;
    }
    const preferredTarget =
      targets.find((target) => target.scrollWidth > target.clientWidth + 1) ||
      targets[0];
    const targetScrollLeft = preferredTarget?.scrollLeft || 0;
    if (Math.abs(externalScroll.scrollLeft - targetScrollLeft) > 1) {
      externalScroll.scrollLeft = targetScrollLeft;
    }
  }, []);

  const applyExternalScrollToTableTargets = useCallback(() => {
    const tableContainer = tableContainerRef.current;
    const externalScroll = externalHScrollRef.current;
    if (!(tableContainer instanceof HTMLElement) || !(externalScroll instanceof HTMLDivElement)) {
      return;
    }
    if (horizontalSyncSourceRef.current === 'table') {
      return;
    }

    const liveTargets = [
      ...new Set(
        [
          ...Array.from(tableContainer.querySelectorAll('.ant-table-content')),
          ...Array.from(tableContainer.querySelectorAll('.ant-table-body')),
        ].filter((node): node is HTMLElement => node instanceof HTMLElement),
      ),
    ];
    if (liveTargets.length === 0) {
      return;
    }

    horizontalSyncSourceRef.current = 'external';
    liveTargets.forEach((target) => {
      if (target.scrollWidth <= target.clientWidth + 1) {
        return;
      }
      if (Math.abs(target.scrollLeft - externalScroll.scrollLeft) > 1) {
        target.scrollLeft = externalScroll.scrollLeft;
      }
    });
    horizontalSyncSourceRef.current = '';
  }, []);

  const refreshStatus = useCallback(async (
    toastOnError = true,
    options?: { showLoading?: boolean; retryCount?: number },
  ): Promise<boolean> => {
    const showLoading = options?.showLoading ?? true;
    const retryCount = Math.max(0, options?.retryCount ?? 0);
    if (showLoading) {
      setLoading(true);
    }
    try {
      let lastErrorText = '';
      for (let attempt = 0; attempt <= retryCount; attempt += 1) {
        try {
          const res = await GetDriverStatusList(downloadDirRef.current, '');
          if (!res?.success) {
            throw new Error(res?.message || '拉取驱动状态失败');
          }

          const data = toRecord<DriverStatusResponseData>(res?.data);
          const resolvedDir = String(data.downloadDir || '').trim();
          const drivers: DriverStatusItem[] = Array.isArray(data.drivers) ? data.drivers.map((item) => toRecord<DriverStatusItem>(item)) : [];
          if (drivers.length === 0) {
            throw new Error('驱动状态为空，请稍后重试');
          }

          const effectiveDownloadDir = resolvedDir || downloadDirRef.current;
          if (resolvedDir) {
            setDownloadDir(resolvedDir);
          }

          const nextRows: DriverStatusRow[] = drivers.map((item) => {
            const rowType = String(item.type || '').trim();
            const parsedDriverOptions: DriverOption[] = Array.isArray(item.driverOptions)
              ? item.driverOptions
                  .map((rawOption: unknown) => {
                    const option = toRecord<DriverOptionPayload>(rawOption);
                    const driverType = String(option.driverType || '').trim();
                    if (!driverType) {
                      return null;
                    }
                    return {
                      driverType,
                      driverName: String(option.driverName || option.driverType || driverType).trim(),
                      databaseType: String(option.databaseType || '').trim() || undefined,
                      databaseName: String(option.databaseName || '').trim() || undefined,
                      available: !!option.available,
                      connectable: !!option.connectable,
                      default: !!option.default || !!option.defaultDriver,
                      runtimeOwnerType: String(option.runtimeOwnerType || '').trim() || undefined,
                      runtimeOwnerName: String(option.runtimeOwnerName || '').trim() || undefined,
                      reusedRuntime: !!option.reusedRuntime,
                      driverClassName: String(option.driverClassName || '').trim() || undefined,
                      message: String(option.message || '').trim() || undefined,
                    } as DriverOption;
                  })
                  .filter((option: DriverOption | null): option is DriverOption => !!option)
              : [];
            const driverOptions = filterDriverOptionsForDatabase<DriverOption>(rowType, parsedDriverOptions);
            const rawDefaultDriverType = String(item.defaultDriverType || '').trim();
            const defaultDriverType = resolveDefaultDriverTypeForDatabase(rowType, rawDefaultDriverType, driverOptions);
            const defaultDriverName = driverOptions.find((option) => option.driverType === defaultDriverType)?.driverName
              || (normalizeDriverSelectionType(rawDefaultDriverType) === defaultDriverType ? String(item.defaultDriverName || '').trim() : '')
              || defaultDriverType;
            return {
              type: rowType,
              name: String(item.name || item.type || '').trim(),
              builtIn: !!item.builtIn,
              managedJarUploadAllowed: !!item.managedJarUploadAllowed,
              managedDownload: !!item.managedDownload,
              downloadRequired: !!item.downloadRequired,
              reusedDriverType: String(item.reusedDriverType || '').trim() || undefined,
              reusedDriverName: String(item.reusedDriverName || '').trim() || undefined,
              pinnedVersion: String(item.pinnedVersion || '').trim() || undefined,
              installedVersion: String(item.installedVersion || '').trim() || undefined,
              installedVersions: Array.isArray(item.installedVersions)
                ? item.installedVersions
                    .map((rawEntry: unknown) => {
                      const entry = toRecord<DriverInstalledVersionPayload>(rawEntry);
                      const version = String(entry.version || '').trim();
                      if (!version) {
                        return null;
                      }
                      return {
                        version,
                        active: !!entry.active,
                        installMode: String(entry.installMode || '').trim() || undefined,
                        installSource: String(entry.installSource || '').trim() || undefined,
                        downloadedAt: String(entry.downloadedAt || '').trim() || undefined,
                        installDir: String(entry.installDir || '').trim() || undefined,
                        filePath: String(entry.filePath || '').trim() || undefined,
                      } as DriverInstalledVersion;
                    })
                    .filter((entry: DriverInstalledVersion | null): entry is DriverInstalledVersion => !!entry)
                : undefined,
              installedVersionCount: Number.isFinite(Number(item.installedVersionCount))
                ? Number(item.installedVersionCount)
                : undefined,
              packageSizeText: String(item.packageSizeText || '').trim() || undefined,
              runtimeAvailable: !!item.runtimeAvailable,
              packageInstalled: !!item.packageInstalled,
              connectable: !!item.connectable,
              defaultDownloadUrl: String(item.defaultDownloadUrl || '').trim() || undefined,
              installDir: String(item.installDir || '').trim() || undefined,
              packagePath: String(item.packagePath || '').trim() || undefined,
              executablePath: String(item.executablePath || '').trim() || undefined,
              downloadedAt: String(item.downloadedAt || '').trim() || undefined,
              installMode: String(item.installMode || '').trim() || undefined,
              installSource: String(item.installSource || '').trim() || undefined,
              installSourceLabel: String(item.installSourceLabel || '').trim() || undefined,
              installSourceDetail: String(item.installSourceDetail || '').trim() || undefined,
              defaultDriverType: defaultDriverType || undefined,
              defaultDriverName: defaultDriverName || undefined,
              driverOptions,
              message: String(item.message || '').trim() || undefined,
            };
          });
          setRows(nextRows);
          setStatusLoadError('');
          driverStatusSnapshotCache = {
            rows: nextRows,
            downloadDir: effectiveDownloadDir,
            cachedAt: Date.now(),
          };
          return true;
        } catch (error: unknown) {
          lastErrorText = getErrorMessage(error, '拉取驱动状态失败');
          if (attempt < retryCount) {
            await sleep(DRIVER_STATUS_RETRY_DELAY_MS * (attempt + 1));
          }
        }
      }
      setStatusLoadError(lastErrorText || '拉取驱动状态失败');
      if (toastOnError) {
        message.error(compatText(lastErrorText || '拉取驱动状态失败', 'message'));
      }
      return false;
    } catch (err: unknown) {
      const errText = getErrorMessage(err);
      setStatusLoadError(errText);
      if (toastOnError) {
        message.error(compatText(`拉取驱动状态失败：${errText}`, 'message'));
      }
      return false;
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      window.__JAVANAVI_DRIVER_MANAGER_OPEN__ = false;
      return undefined;
    }

    window.__JAVANAVI_DRIVER_MANAGER_OPEN__ = true;
    const handleDriverManagerRefresh = () => {
      void refreshStatus(true);
    };
    window.addEventListener('javanavi:driver-manager-refresh', handleDriverManagerRefresh);
    return () => {
      window.removeEventListener('javanavi:driver-manager-refresh', handleDriverManagerRefresh);
      window.__JAVANAVI_DRIVER_MANAGER_OPEN__ = false;
    };
  }, [open, refreshStatus]);

  const refreshCustomDefinitions = useCallback(async (toastOnError = false): Promise<CustomDataSource[]> => {
    setCustomDefinitionLoading(true);
    try {
      const latestSources = loadCustomDataSources();
      const res = await GetCustomDriverDefinitions(downloadDirRef.current);
      if (!res?.success) {
        throw new Error(res?.message || '加载自定义数据源定义失败');
      }
      const nextSources = mergeBackendCustomDataSourceDefinitions(
        latestSources,
        extractBackendCustomDataSourceDefinitions(res),
        { backendAuthoritative: true },
      );
      setCustomDataSources(nextSources);
      return nextSources;
    } catch (error: unknown) {
      const latestSources = loadCustomDataSources();
      setCustomDataSources(latestSources);
      if (toastOnError) {
        message.error(compatText(getErrorMessage(error, '加载自定义数据源定义失败'), 'message'));
      }
      return latestSources;
    } finally {
      setCustomDefinitionLoading(false);
    }
  }, []);

  const validateCustomDataSource = useCallback(async (source: CustomDataSource) => {
    const driverType = String(source.driverType || source.driver || '').trim();
    if (!driverType) {
      message.warning(compatText('该自定义数据源缺少驱动标识，请重新上传 Jar 修复', 'message'));
      return;
    }
    setCustomDefinitionValidating((prev) => ({ ...prev, [source.id]: true }));
    try {
      const res = await ValidateCustomDriverDefinition(driverType, downloadDirRef.current);
      if (!res?.success) {
        throw new Error(res?.message || '校验自定义数据源失败');
      }
      const definition = extractBackendCustomDataSourceDefinition(res);
      const merged = definition ? createCustomDataSourceFromBackendDefinition(definition, source) : null;
      if (!merged) {
        throw new Error('后端未返回可用的自定义数据源定义');
      }
      const nextSources = upsertCustomDataSource(loadCustomDataSources(), merged);
      setCustomDataSources(nextSources);
      if (merged.runtimeStatus?.definitionUsable) {
        message.success(compatText(`${merged.name} 定义可用；连接测试需在新建连接中执行`, 'message'));
      } else {
        message.warning(compatText(merged.runtimeStatus?.message || `${merged.name} 需要修复`, 'message'));
      }
    } catch (error: unknown) {
      message.error(compatText(getErrorMessage(error, '校验自定义数据源失败'), 'message'));
    } finally {
      setCustomDefinitionValidating((prev) => ({ ...prev, [source.id]: false }));
    }
  }, []);

  const checkNetworkStatus = useCallback(async (
    toastOnError = false,
    options?: { showLoading?: boolean },
  ) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) {
      setNetworkChecking(true);
    }
    try {
      const res = await CheckDriverNetworkStatus();
      if (!res?.success) {
        if (toastOnError) {
          message.error(compatText(res?.message || '驱动网络检测失败', 'message'));
        }
        return;
      }
      const data = toRecord<DriverNetworkStatusPayload>(res?.data);
      const checks: DriverNetworkProbePayload[] = Array.isArray(data.checks) ? data.checks.map((item) => toRecord<DriverNetworkProbePayload>(item)) : [];
      const normalizedChecks: DriverNetworkProbe[] = checks.map((item) => ({
        name: String(item.name || '').trim(),
        url: String(item.url || '').trim(),
        reachable: !!item.reachable,
        httpStatus: parseOptionalLatency(item.httpStatus),
        latencyMs: parseOptionalLatency(item.latencyMs),
        tcpLatencyMs: parseOptionalLatency(item.tcpLatencyMs),
        httpLatencyMs: parseOptionalLatency(item.httpLatencyMs),
        method: String(item.method || '').trim().toUpperCase() || undefined,
        error: String(item.error || '').trim() || undefined,
      }));
      const nextStatus: DriverNetworkStatus = {
        reachable: !!data.reachable,
        summary: String(data.summary || '').trim() || compatText('驱动网络检测已完成'),
        downloadChainReachable: typeof data.downloadChainReachable === 'boolean' ? data.downloadChainReachable : undefined,
        downloadRequiredHosts: Array.isArray(data.downloadRequiredHosts)
          ? data.downloadRequiredHosts.map((item: unknown) => String(item || '').trim()).filter(Boolean)
          : undefined,
        checkedAt: String(data.checkedAt || '').trim() || undefined,
        checks: normalizedChecks,
        logPath: String(data.logPath || '').trim() || undefined,
        repositoryURL: String(data.repositoryURL || data.repositoryUrl || '').trim() || undefined,
        repositoryUrl: String(data.repositoryUrl || data.repositoryURL || '').trim() || undefined,
        configuredRepositoryURL: String(data.configuredRepositoryURL || data.configuredRepositoryUrl || '').trim() || undefined,
        configuredRepositoryUrl: String(data.configuredRepositoryUrl || data.configuredRepositoryURL || '').trim() || undefined,
        defaultRepositoryURL: String(data.defaultRepositoryURL || data.defaultRepositoryUrl || '').trim() || undefined,
        defaultRepositoryUrl: String(data.defaultRepositoryUrl || data.defaultRepositoryURL || '').trim() || undefined,
        repositoryConfigured: !!data.repositoryConfigured,
      };
      setNetworkStatus(nextStatus);
      const nextRepositoryURL = nextStatus.repositoryURL || nextStatus.repositoryUrl || nextStatus.defaultRepositoryURL || nextStatus.defaultRepositoryUrl || '';
      if (nextRepositoryURL) {
        setRepositoryURL(nextRepositoryURL);
      }
      driverNetworkSnapshotCache = {
        status: nextStatus,
        cachedAt: Date.now(),
      };
    } catch (err: unknown) {
      if (toastOnError) {
        message.error(compatText(`驱动网络检测失败：${getErrorMessage(err)}`, 'message'));
      }
    } finally {
      if (showLoading) {
        setNetworkChecking(false);
      }
    }
  }, []);

  const loadVersionOptions = useCallback(async (row: DriverStatusRow, toastOnError = false) => {
    if (row.builtIn) {
      return [] as DriverVersionOption[];
    }
    const driverType = String(row.type || '').trim();
    if (!driverType) {
      return [] as DriverVersionOption[];
    }
    setVersionLoadingMap((prev) => ({ ...prev, [driverType]: true }));
    try {
      const res = await GetDriverVersionList(driverType, repositoryURLRef.current);
      if (!res?.success) {
        if (toastOnError) {
          message.error(compatText(res?.message || `${row.name} 版本列表加载失败`, 'message'));
        }
        return [] as DriverVersionOption[];
      }
      const data = toRecord<DriverVersionListPayload & { metadataBacked?: unknown; metadataError?: unknown; message?: unknown }>(res?.data);
      const rawVersions: DriverVersionPayload[] = Array.isArray(data.versions) ? data.versions.map((item) => toRecord<DriverVersionPayload>(item)) : [];
      const metadataBacked = data.metadataBacked === true;
      const metadataError = String(data.metadataError || '').trim();
      const limitedMessage = String(data.message || '').trim()
        || (metadataError ? `Maven metadata 不可用，仅显示推荐版本：${metadataError}` : 'Maven metadata 不可用，仅显示推荐版本');
      const installedVersions = new Set((row.installedVersions || []).map((item) => item.version).filter(Boolean));
      const activeVersion = String(row.installedVersion || '').trim();
      const options: DriverVersionOption[] = rawVersions
        .map((item) => {
          const version = String(item.version || '').trim();
          const downloadUrl = String(item.downloadUrl || '').trim();
          if (!version && !downloadUrl) {
            return null;
          }
          const installed = !!version && installedVersions.has(version);
          const active = !!version && activeVersion === version;
          const baseLabel = String(item.displayLabel || '').trim() || version || compatText('默认版本');
          const displayLabel = active
            ? `${baseLabel}（当前启用）`
            : installed
              ? `${baseLabel}（已下载）`
              : baseLabel;
          return {
            version,
            downloadUrl,
            packageSizeText: String(item.packageSizeText || '').trim() || undefined,
            recommended: !!item.recommended,
            installed,
            active,
            source: String(item.source || '').trim() || undefined,
            year: String(item.year || '').trim() || undefined,
            displayLabel,
          } as DriverVersionOption;
        })
        .filter((item: DriverVersionOption | null): item is DriverVersionOption => !!item);

      if (options.length === 0) {
        const fallbackVersion = String(row.pinnedVersion || '').trim();
        const fallbackURL = String(row.defaultDownloadUrl || '').trim();
        if (fallbackVersion || fallbackURL) {
          options.push({
            version: fallbackVersion,
            downloadUrl: fallbackURL,
            recommended: true,
            source: 'fallback',
            displayLabel: fallbackVersion || compatText('默认版本'),
          });
        }
      }

      setVersionMap((prev) => ({ ...prev, [driverType]: options }));
      setVersionNoticeMap((prev) => {
        if (metadataBacked || options.length > 1) {
          if (!prev[driverType]) {
            return prev;
          }
          const next = { ...prev };
          delete next[driverType];
          return next;
        }
        return {
          ...prev,
          [driverType]: {
            message: limitedMessage,
          },
        };
      });
      setSelectedVersionMap((prev) => {
        const currentKey = prev[driverType];
        if (currentKey && options.some((option) => buildVersionOptionKey(option) === currentKey)) {
          return prev;
        }
        const preferred =
          options.find((option) => option.version === row.installedVersion) ||
          options.find((option) => option.version === row.pinnedVersion) ||
          options.find((option) => option.recommended) ||
          options[0];
        if (!preferred) {
          return prev;
        }
        return { ...prev, [driverType]: buildVersionOptionKey(preferred) };
      });
      return options;
    } catch (err: unknown) {
      if (toastOnError) {
        message.error(compatText(`加载 ${row.name} 版本列表失败：${getErrorMessage(err)}`, 'message'));
      }
      return [] as DriverVersionOption[];
    } finally {
      setVersionLoadingMap((prev) => ({ ...prev, [driverType]: false }));
    }
  }, []);

  const loadVersionPackageSize = useCallback(async (row: DriverStatusRow, optionKey: string) => {
    if (row.builtIn) {
      return;
    }
    const driverType = String(row.type || '').trim();
    if (!driverType || !optionKey) {
      return;
    }

    const options = versionMap[driverType] || [];
    const selectedOption = options.find((item) => buildVersionOptionKey(item) === optionKey);
    if (!selectedOption) {
      return;
    }
    if (String(selectedOption.packageSizeText || '').trim()) {
      return;
    }

    const versionText = String(selectedOption.version || '').trim();
    if (!versionText) {
      return;
    }

    const loadingKey = buildVersionSizeLoadingKey(driverType, optionKey);
    if (versionSizeLoadingMap[loadingKey]) {
      return;
    }

    setVersionSizeLoadingMap((prev) => ({ ...prev, [loadingKey]: true }));
    try {
      const res = await GetDriverVersionPackageSize(driverType, versionText);
      if (!res?.success) {
        return;
      }
      const data = toRecord<DriverPackageSizePayload>(res?.data);
      const sizeText = String(data.packageSizeText || '').trim();
      if (!sizeText) {
        return;
      }

      setVersionMap((prev) => {
        const current = prev[driverType] || [];
        let changed = false;
        const next = current.map((item) => {
          if (buildVersionOptionKey(item) !== optionKey) {
            return item;
          }
          if (String(item.packageSizeText || '').trim() === sizeText) {
            return item;
          }
          changed = true;
          return { ...item, packageSizeText: sizeText };
        });
        if (!changed) {
          return prev;
        }
        return { ...prev, [driverType]: next };
      });
    } finally {
      setVersionSizeLoadingMap((prev) => {
        if (!prev[loadingKey]) {
          return prev;
        }
        const next = { ...prev };
        delete next[loadingKey];
        return next;
      });
    }
  }, [versionMap, versionSizeLoadingMap]);

  const configureRepository = useCallback(async (nextURL?: string) => {
    const targetURL = typeof nextURL === 'string' ? nextURL : repositoryURL;
    setRepositorySaving(true);
    try {
      const result = await ConfigureDriverRepositoryURL(targetURL);
      if (!result?.success) {
        message.error(compatText(result?.message || '保存 Maven 源失败', 'message'));
        return;
      }
      const data = toRecord<DriverRepositoryPayload>(result?.data);
      const effectiveURL = String(data.repositoryUrl || data.repositoryURL || '').trim();
      setRepositoryURL(effectiveURL);
      setRepositoryEditing(false);
      setVersionMap({});
      setVersionNoticeMap({});
      setSelectedVersionMap({});
      driverNetworkSnapshotCache = null;
      await checkNetworkStatus(false, { showLoading: false });
      message.success(compatText('Maven 源已保存，后续版本列表、自动下载与首次连接会使用该源', 'message'));
    } catch (err: unknown) {
      message.error(compatText(`保存 Maven 源失败：${getErrorMessage(err)}`, 'message'));
    } finally {
      setRepositorySaving(false);
    }
  }, [checkNetworkStatus, repositoryURL]);

  const configureDefaultDriver = useCallback(async (row: DriverStatusRow, driverType: string) => {
    const targetDriverType = String(driverType || '').trim();
    if (!row.type || !targetDriverType) {
      return;
    }
    const savingKey = `${row.type}:${targetDriverType}`;
    setDefaultDriverSavingKey(savingKey);
    try {
      const result = await ConfigureDefaultDriver(row.type, targetDriverType, downloadDir);
      if (!result?.success) {
        message.error(compatText(result?.message || '设置默认驱动失败', 'message'));
        return;
      }
      const resultData = toRecord<DriverStatusItem>(result.data);
      message.success(compatText(`${row.name || row.type} 默认驱动已设置为 ${String(resultData.defaultDriverName || targetDriverType)}`, 'message'));
      await refreshStatus(false);
    } catch (err: unknown) {
      message.error(compatText(`设置默认驱动失败：${getErrorMessage(err)}`, 'message'));
    } finally {
      setDefaultDriverSavingKey('');
    }
  }, [downloadDir, refreshStatus]);

  const pickJarFiles = useCallback(() => {
    return new Promise<File[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.jar,application/java-archive,application/x-java-archive';
      input.multiple = true;
      input.onchange = () => {
        resolve(Array.from(input.files || []));
      };
      input.addEventListener('cancel', () => resolve([]), { once: true });
      input.click();
    });
  }, []);

  const promptUploadDriverVersion = useCallback((row: DriverStatusRow, files: File[]) => {
    return new Promise<string | null>((resolve) => {
      let settled = false;
      let currentValue = DEFAULT_UPLOAD_DRIVER_VERSION;
      let modalRef: ReturnType<typeof Modal.confirm> | null = null;
      const fileNames = files
        .map((file) => String(file.name || '').trim())
        .filter(Boolean);
      const fileSummary = fileNames.length > 3
        ? `${fileNames.slice(0, 3).join('、')} 等 ${fileNames.length} 个文件`
        : fileNames.join('、');
      const finish = (version: string | null) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(version);
      };
      const confirmVersion = () => {
        const version = currentValue.trim();
        if (!version) {
          message.error(compatText('请输入上传 Jar 的驱动版本', 'message'));
          return;
        }
        modalRef?.destroy();
        finish(version);
      };
      modalRef = Modal.confirm({
        title: compatText(`填写 ${row.name || row.type} 上传版本`),
        okText: compatText('开始上传'),
        cancelText: compatText('取消'),
        content: (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text type="secondary">{compatText('已选择 Jar 文件，上传前请确认写入驱动元数据的版本。', 'jsx')}</Text>
            {fileSummary ? <Text type="secondary" style={{ fontSize: 12 }}>{compatText(fileSummary, 'jsx')}</Text> : null}
            <Input
              autoFocus
              defaultValue={DEFAULT_UPLOAD_DRIVER_VERSION}
              placeholder={compatText('上传 Jar 版本')}
              autoComplete="off"
              onChange={(event) => {
                currentValue = event.target.value;
              }}
              onPressEnter={confirmVersion}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {compatText(`默认使用“${DEFAULT_UPLOAD_DRIVER_VERSION}”；该版本仅标识手动上传来源，不影响 Maven 下载版本。`, 'jsx')}
            </Text>
          </Space>
        ),
        onOk: () => {
          const version = currentValue.trim();
          if (!version) {
            message.error(compatText('请输入上传 Jar 的驱动版本', 'message'));
            return Promise.reject(new Error('missing upload driver version'));
          }
          finish(version);
          return undefined;
        },
        onCancel: () => finish(null),
      });
    });
  }, []);

  const openCustomDataSourceCreator = useCallback(() => {
    customDataSourceForm.resetFields();
    setCustomDataSourceFiles([]);
    setCustomDataSourceModalOpen(true);
  }, [customDataSourceForm]);

  const chooseCustomDataSourceJarFiles = useCallback(async () => {
    const files = await pickJarFiles();
    if (files.length > 0) {
      setCustomDataSourceFiles(files);
    }
  }, [pickJarFiles]);

  const handleCreateCustomDataSource = useCallback(async () => {
    try {
      const values = await customDataSourceForm.validateFields();
      const files = customDataSourceFiles;
      if (files.length === 0) {
        message.error(compatText('请先上传该自定义数据源的 JDBC Jar', 'message'));
        return;
      }
      const sourceName = String(values.name || '').trim();
      const dsnTemplate = String(values.dsnTemplate || '').trim();
      const latestSources = loadCustomDataSources();
      const existingDriverTypes = [
        ...latestSources.map((source) => source.driver || ''),
        ...rows.map((row) => row.type),
      ];
      const driverType = createUniqueCustomDriverType(sourceName, existingDriverTypes);
      const version = DEFAULT_UPLOAD_DRIVER_VERSION;
      const fileNames = files.map((file) => String(file.name || '').trim()).filter(Boolean);

      setCustomDataSourceSaving(true);
      appendOperationLog(driverType, `[START] 新增自定义数据源并上传 JDBC Jar（${version}）：${fileNames.join(', ')}`);
      const result = await UploadLocalDriverPackage(driverType, files, downloadDir, version);
      if (!result?.success) {
        const errText = result?.message || '上传自定义数据源 JDBC Jar 失败';
        appendOperationLog(driverType, `[ERROR] ${errText}`);
        message.error(errText);
        return;
      }

      const source = createCustomDataSource({
        name: sourceName,
        driverType,
        version,
        dsnTemplate,
        dsnHelp: String(values.dsnHelp || '').trim(),
        description: String(values.description || '').trim(),
        installSource: 'manual-upload',
        jarFileNames: fileNames,
      });
      const backendDefinition = extractBackendCustomDataSourceDefinition(result);
      const hydratedSource = backendDefinition
        ? createCustomDataSourceFromBackendDefinition(backendDefinition, source) || source
        : source;
      const nextCustomDataSources = upsertCustomDataSource(latestSources, hydratedSource);
      setCustomDataSources(nextCustomDataSources);
      appendOperationLog(driverType, `[DONE] 自定义数据源 ${hydratedSource.name} 已创建并启用`);
      message.success(compatText(`已新增自定义数据源：${hydratedSource.name}`, 'message'));
      setCustomDataSourceModalOpen(false);
      setCustomDataSourceFiles([]);
      customDataSourceForm.resetFields();
      await refreshStatus(false);
      await refreshCustomDefinitions(false);
    } catch (error: unknown) {
      if (isAntdValidationError(error)) {
        return;
      }
      message.error(compatText(getErrorMessage(error, '新增自定义数据源失败'), 'message'));
    } finally {
      setCustomDataSourceSaving(false);
    }
  }, [
    appendOperationLog,
    customDataSourceFiles,
    customDataSourceForm,
    downloadDir,
    refreshCustomDefinitions,
    refreshStatus,
    rows,
  ]);

  const removeSavedCustomDataSource = useCallback((source: CustomDataSource) => {
    Modal.confirm({
      title: compatText(`移除自定义数据源 ${source.name}`, 'message'),
      content: compatText('这只会从新建连接的选择列表移除该数据源记录，不会删除已经上传到驱动目录的 Jar 文件。', 'message'),
      okText: compatText('移除'),
      okButtonProps: { danger: true },
      cancelText: compatText('取消'),
      onOk: () => {
        const nextSources = removeCustomDataSource(loadCustomDataSources(), source.id);
        setCustomDataSources(nextSources);
        message.success(compatText(`已移除自定义数据源：${source.name}`, 'message'));
      },
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setHorizontalScrollWidth(DRIVER_TABLE_SCROLL_X);
      tableScrollTargetsRef.current = [];
      setStatusFilter('all');
      setSelectedDriverType('');
      setRepositoryEditing(false);
      return;
    }
    setCustomDataSources(loadCustomDataSources());

    const cachedStatus = driverStatusSnapshotCache;
    const hasCachedStatus = !!cachedStatus && cachedStatus.rows.length > 0;
    if (hasCachedStatus) {
      setRows(cachedStatus.rows);
      if (cachedStatus.downloadDir) {
        setDownloadDir(cachedStatus.downloadDir);
      }
    }
    const shouldRefreshStatus = !hasCachedStatus || !isFreshCache(cachedStatus!.cachedAt, DRIVER_STATUS_CACHE_TTL_MS);
    if (shouldRefreshStatus) {
      void refreshStatus(false, {
        showLoading: !hasCachedStatus,
        retryCount: hasCachedStatus ? 1 : DRIVER_STATUS_INITIAL_RETRY_COUNT,
      });
    }
    void refreshCustomDefinitions(false);

    const cachedNetwork = driverNetworkSnapshotCache;
    const hasCachedNetwork = !!cachedNetwork;
    if (cachedNetwork) {
      setNetworkStatus(cachedNetwork.status);
    }
    const shouldRefreshNetwork = !cachedNetwork || !isFreshCache(cachedNetwork.cachedAt, DRIVER_NETWORK_CACHE_TTL_MS);
    if (shouldRefreshNetwork) {
      void checkNetworkStatus(false, { showLoading: !hasCachedNetwork });
    }
  }, [checkNetworkStatus, open, refreshCustomDefinitions, refreshStatus]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const tableContainer = tableContainerRef.current;
    const externalScroll = externalHScrollRef.current;
    if (!(tableContainer instanceof HTMLElement) || !(externalScroll instanceof HTMLDivElement)) {
      return;
    }

    let currentTargets: HTMLElement[] = [];
    let rafId: number | null = null;
    let bodyResizeObserver: ResizeObserver | null = null;
    let containerResizeObserver: ResizeObserver | null = null;

    const pickSyncTarget = () => {
      if (currentTargets.length === 0) {
        return null;
      }
      return currentTargets.find((target) => target.scrollWidth > target.clientWidth + 1) || currentTargets[0];
    };

    const syncFromTableTarget = (event?: Event) => {
      const source = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      const activeTarget = source || pickSyncTarget();
      if (!activeTarget) {
        return;
      }
      if (horizontalSyncSourceRef.current === 'external') {
        return;
      }
      horizontalSyncSourceRef.current = 'table';
      if (Math.abs(externalScroll.scrollLeft - activeTarget.scrollLeft) > 1) {
        externalScroll.scrollLeft = activeTarget.scrollLeft;
      }
      horizontalSyncSourceRef.current = '';
    };

    const bindCurrentTableTargets = () => {
      const nextTargets = [
        ...new Set(
          [
            ...Array.from(tableContainer.querySelectorAll('.ant-table-content')),
            ...Array.from(tableContainer.querySelectorAll('.ant-table-body')),
          ].filter((node): node is HTMLElement => node instanceof HTMLElement),
        ),
      ];

      const sameTargets =
        nextTargets.length === currentTargets.length &&
        nextTargets.every((target, index) => target === currentTargets[index]);
      if (sameTargets) {
        return;
      }

      currentTargets.forEach((target) => {
        target.removeEventListener('scroll', syncFromTableTarget);
        bodyResizeObserver?.unobserve(target);
      });

      currentTargets = nextTargets;
      tableScrollTargetsRef.current = nextTargets;
      currentTargets.forEach((target) => {
        target.addEventListener('scroll', syncFromTableTarget, { passive: true });
        bodyResizeObserver?.observe(target);
      });

      refreshHorizontalScrollState();
      syncFromTableTarget();
    };

    const scheduleRefresh = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        bindCurrentTableTargets();
        refreshHorizontalScrollState();
      });
    };

    const mutationObserver = new MutationObserver(scheduleRefresh);
    mutationObserver.observe(tableContainer, { childList: true, subtree: true });

    bodyResizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleRefresh) : null;
    containerResizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleRefresh) : null;
    containerResizeObserver?.observe(tableContainer);
    if (typeof ResizeObserver !== 'undefined') {
      modalContentRef.current && containerResizeObserver?.observe(modalContentRef.current);
    }
    window.addEventListener('resize', scheduleRefresh);

    scheduleRefresh();
    return () => {
      mutationObserver.disconnect();
      window.removeEventListener('resize', scheduleRefresh);
      currentTargets.forEach((target) => {
        target.removeEventListener('scroll', syncFromTableTarget);
      });
      if (bodyResizeObserver) {
        bodyResizeObserver.disconnect();
      }
      if (containerResizeObserver) {
        containerResizeObserver.disconnect();
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [open, refreshHorizontalScrollState]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const off = EventsOn('driver:download-progress', (event: DriverProgressEvent) => {
      if (!event) {
        return;
      }
      const driverType = String(event.driverType || '').trim().toLowerCase();
      const status = event.status;
      if (!driverType || !status) {
        return;
      }
      const messageText = String(event.message || '').trim();
      const percent = Math.max(0, Math.min(100, Number(event.percent || 0)));
      setProgressMap((prev) => ({
        ...prev,
        [driverType]: {
          status,
          message: messageText,
          percent,
        },
      }));
      const progressText = `${Math.round(percent)}%`;
      const statusText = String(status || '').toUpperCase();
      const lineText = `[${statusText}] ${messageText || '-'} (${progressText})`;
      const lineSignature = `${statusText}|${messageText || '-'}`;
      appendOperationLog(driverType, lineText, lineSignature, 'update-last');
    });
    return () => {
      off();
    };
  }, [appendOperationLog, open]);

  const installDriver = useCallback(async (row: DriverStatusRow) => {
    setActionState({ driverType: row.type, kind: 'install' });
    setProgressMap((prev) => ({
      ...prev,
      [row.type]: {
        status: 'start',
        message: '开始安装',
        percent: 0,
      },
    }));
    appendOperationLog(row.type, row.connectable ? '[START] 开始下载/切换 Maven 驱动版本' : '[START] 开始自动安装');
    try {
      let options = versionMap[row.type] || [];
      if (options.length === 0) {
        options = await loadVersionOptions(row, true);
      }
      const selectedKey = selectedVersionMap[row.type];
      const selectedOption =
        options.find((item) => buildVersionOptionKey(item) === selectedKey) ||
        options.find((item) => item.recommended) ||
        options[0];
      const selectedVersion = selectedOption?.version || row.pinnedVersion || '';
      const selectedDownloadURL = selectedOption?.downloadUrl || row.defaultDownloadUrl || '';

      const result = await DownloadDriverPackage(row.type, selectedVersion, selectedDownloadURL, downloadDir);
      if (!result?.success) {
        const errText = result?.message || compatText(`安装 ${row.name} 失败`, 'message');
        appendOperationLog(row.type, `[ERROR] ${errText}`);
        message.error(errText);
        return;
      }
      const versionTip = selectedVersion ? `（${selectedVersion}）` : '';
      appendOperationLog(row.type, `[DONE] Maven 驱动版本已启用 ${versionTip}`);
      message.success(compatText(`${row.name}${versionTip} 已下载并启用`, 'message'));
      refreshStatus(false);
    } finally {
      setActionState({ driverType: '', kind: '' });
    }
  }, [appendOperationLog, downloadDir, loadVersionOptions, refreshStatus, selectedVersionMap, versionMap]);

  const uploadDriverFromJarFiles = useCallback(async (row: DriverStatusRow) => {
    if (!row.managedJarUploadAllowed) {
      message.warning(compatText('内置数据源不支持上传 Jar，请直接下载驱动', 'message'));
      return;
    }
    const files = await pickJarFiles();
    if (files.length === 0) {
      return;
    }
    const selectedVersion = await promptUploadDriverVersion(row, files);
    if (!selectedVersion) {
      return;
    }
    setActionState({ driverType: row.type, kind: 'upload' });
    const versionTip = selectedVersion ? `（${selectedVersion}）` : '';
    appendOperationLog(row.type, `[START] 开始上传 JDBC Jar${versionTip}：${files.map((file) => file.name).join(', ')}`);
    try {
      const result = await UploadLocalDriverPackage(row.type, files, downloadDir, selectedVersion);
      if (!result?.success) {
        const errText = result?.message || compatText(`上传 ${row.name} JDBC Jar 失败`, 'message');
        appendOperationLog(row.type, `[ERROR] ${errText}`);
        message.error(errText);
        return;
      }
      appendOperationLog(row.type, `[DONE] JDBC Jar 上传安装完成 ${versionTip}`.trim());
      message.success(compatText(`${row.name}${versionTip} JDBC Jar 已上传并启用`, 'message'));
      await refreshStatus(false);
    } finally {
      setActionState({ driverType: '', kind: '' });
    }
  }, [appendOperationLog, downloadDir, pickJarFiles, promptUploadDriverVersion, refreshStatus]);

  const openDriverDirectory = useCallback(async () => {
    try {
      const res = await OpenDriverDownloadDirectory(downloadDir);
      if (!res?.success) {
        throw new Error(res?.message || '打开驱动目录失败');
      }
      const data = toRecord<DriverDirectoryPayload>(res.data);
      const opened = !!data.opened;
      const pathText = String(data.path || data.directory || downloadDir || '').trim();
      const responseMessage = String(data.message || '').trim();
      if (opened) {
        message.success(compatText(responseMessage || `已打开驱动目录：${pathText || '-'}`, 'message'));
        return;
      }
      if (pathText && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(pathText);
          message.warning(compatText(`${responseMessage || '无法自动打开驱动目录'}；路径已复制：${pathText}`, 'message'));
          return;
        } catch {
          // Clipboard is best effort only; fall through to the visible path message.
        }
      }
      message.warning(compatText(responseMessage || `无法自动打开驱动目录，请手动打开：${pathText || '-'}`, 'message'));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error || '未知错误');
      message.error(compatText(`打开驱动目录失败: ${errMsg}`, 'message'));
    }
  }, [downloadDir]);

  const openDriverLog = useCallback((driverType: string) => {
    const normalized = String(driverType || '').trim().toLowerCase();
    if (!normalized) {
      return;
    }
    setLogDriverType(normalized);
    setLogModalOpen(true);
  }, []);

  const removeDriver = useCallback(async (row: DriverStatusRow) => {
    setActionState({ driverType: row.type, kind: 'remove' });
    appendOperationLog(row.type, '[START] 开始移除驱动');
    try {
      const result = await RemoveDriverPackage(row.type, downloadDir);
      if (!result?.success) {
        const errText = result?.message || compatText(`移除 ${row.name} 失败`, 'message');
        appendOperationLog(row.type, `[ERROR] ${errText}`);
        message.error(errText);
        return;
      }
      appendOperationLog(row.type, '[DONE] 驱动移除完成');
      message.success(compatText(`${row.name} 已移除`, 'message'));
      setProgressMap((prev) => {
        const next = { ...prev };
        delete next[row.type];
        return next;
      });
      refreshStatus(false);
    } finally {
      setActionState({ driverType: '', kind: '' });
    }
  }, [appendOperationLog, downloadDir, refreshStatus]);

  const renderDriverActions = useCallback((row: DriverStatusRow, buttonSize: 'small' | 'middle' = 'small') => {
    if (row.builtIn) {
      return <Text type="secondary">{compatText('内置驱动无需操作')}</Text>;
    }

    const loadingInstallOrRemove =
      actionState.driverType === row.type && (actionState.kind === 'install' || actionState.kind === 'remove');
    const loadingUpload = actionState.driverType === row.type && actionState.kind === 'upload';
    const logs = operationLogMap[row.type] || [];
    const hasLogs = logs.length > 0;

    if (row.reusedDriverType) {
      return (
        <Space size={8} wrap>
          <Text type="secondary">{compatText(`由 ${row.reusedDriverName || row.reusedDriverType} 管理`, 'jsx')}</Text>
          <Button size={buttonSize} disabled={!hasLogs} onClick={() => openDriverLog(row.type)}>
            {compatText('查看日志')}
          </Button>
        </Space>
      );
    }

    const canMavenDownload = !!row.managedDownload;
    const downloadAction = canMavenDownload ? (
      <Button
        size={buttonSize}
        type="primary"
        icon={<DownloadOutlined />}
        loading={loadingInstallOrRemove}
        onClick={() => installDriver(row)}
      >
        {row.connectable ? compatText('切换版本') : compatText('安装启用')}
      </Button>
    ) : null;
    const removeAction = row.connectable ? (
      <Button
        size={buttonSize}
        danger
        icon={<DeleteOutlined />}
        loading={loadingInstallOrRemove}
        onClick={() => removeDriver(row)}
      >
        {compatText('移除')}
      </Button>
    ) : null;
    const mainAction = downloadAction || removeAction || (
      <Button
        size={buttonSize}
        type="primary"
        icon={<DownloadOutlined />}
        loading={loadingInstallOrRemove}
        onClick={() => installDriver(row)}
      >
        {compatText('安装启用')}
      </Button>
    );

    return (
      <Space size={8} wrap>
        {mainAction}
        {downloadAction && removeAction ? removeAction : null}
        {row.managedJarUploadAllowed ? (
          <Button
            size={buttonSize}
            icon={<UploadOutlined />}
            loading={loadingUpload}
            onClick={() => uploadDriverFromJarFiles(row)}
          >
            {compatText('上传 Jar')}
          </Button>
        ) : null}
        <Button size={buttonSize} type={hasLogs ? 'default' : 'text'} disabled={!hasLogs} onClick={() => openDriverLog(row.type)}>
          {compatText('查看日志')}
        </Button>
      </Space>
    );
  }, [actionState, installDriver, openDriverLog, operationLogMap, removeDriver, uploadDriverFromJarFiles]);



  const activeLogRow = useMemo(() => {
    if (!logDriverType) {
      return undefined;
    }
    return rows.find((item) => item.type === logDriverType);
  }, [logDriverType, rows]);
  const normalizedSearchKeyword = useMemo(() => normalizeDriverSearchText(searchKeyword), [searchKeyword]);
  const searchedRows = useMemo(() => {
    if (!normalizedSearchKeyword) {
      return rows;
    }
    return rows.filter((row) => {
      const searchableParts = [
        row.name,
        row.type,
        row.pinnedVersion,
        row.installedVersion,
        ...(row.installedVersions || []).map((item) => compatText(`${item.version} ${item.active ? '当前启用' : '已下载'}`, 'jsx')),
        row.message,
        row.installSourceLabel,
        row.installSourceDetail,
        row.installMode,
        row.defaultDriverName ? compatText(`默认驱动 ${row.defaultDriverName}`, 'jsx') : '',
        ...(row.driverOptions || []).map((option) => compatText(`${option.driverName} ${option.default ? '默认' : ''} ${option.reusedRuntime ? '复用 runtime' : ''}`, 'jsx')),
        row.reusedDriverType ? compatText(`复用 ${row.reusedDriverName || row.reusedDriverType}`, 'jsx') : '',
        row.builtIn ? compatText('内置') : row.managedDownload ? compatText('按需下载') : compatText('外置'),
        driverStatusLabel(row, progressMap[row.type]),
      ];
      const searchableText = normalizeDriverSearchText(searchableParts.filter(Boolean).join(' '));
      return searchableText.includes(normalizedSearchKeyword);
    });
  }, [normalizedSearchKeyword, progressMap, rows]);
  const attentionDriverCount = useMemo(() => rows.filter(isDriverRowAttention).length, [rows]);
  const availableDriverCount = useMemo(() => rows.filter(isDriverRowAvailable).length, [rows]);
  const customDriverCount = useMemo(() => rows.filter(isCustomDriverRow).length + customDataSources.length, [customDataSources.length, rows]);
  const filteredRows = useMemo(() => {
    switch (statusFilter) {
      case 'attention':
        return searchedRows.filter(isDriverRowAttention);
      case 'available':
        return searchedRows.filter(isDriverRowAvailable);
      case 'custom':
        return searchedRows.filter(isCustomDriverRow);
      default:
        return searchedRows;
    }
  }, [searchedRows, statusFilter]);
  const filterSummaryText = useMemo(() => {
    const filterName = statusFilter === 'attention'
      ? '待处理'
      : statusFilter === 'available'
        ? '可用驱动'
        : statusFilter === 'custom'
          ? '自定义'
          : '全部';
    if (normalizedSearchKeyword || statusFilter !== 'all') {
      return compatText(`${filterName}：匹配 ${filteredRows.length} / ${rows.length}`, 'jsx');
    }
    return compatText(`共 ${rows.length} 个驱动`, 'jsx');
  }, [filteredRows.length, normalizedSearchKeyword, rows.length, statusFilter]);

  useEffect(() => {
    if (!open || !selectedDriverType) {
      return;
    }
    if (!filteredRows.some((row) => row.type === selectedDriverType)) {
      setSelectedDriverType('');
    }
  }, [filteredRows, open, selectedDriverType]);

  const activeDriverRow = useMemo(() => {
    if (!selectedDriverType) {
      return undefined;
    }
    return filteredRows.find((row) => row.type === selectedDriverType);
  }, [filteredRows, selectedDriverType]);

  useEffect(() => {
    if (!activeDriverRow) {
      return undefined;
    }
    const frameId = requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeDriverRow]);

  const columns = useMemo<ColumnsType<DriverStatusRow>>(() => {
    const baseColumns: ColumnsType<DriverStatusRow> = [
      {
        title: compatText('数据源'),
        key: 'name',
        width: 220,
        render: (_: string, row: DriverStatusRow) => {
          const tags = [
            row.builtIn ? <Tag key="built-in" color="success">{compatText('内置')}</Tag> : null,
            isCustomDriverRow(row) ? <Tag key="custom" color="purple">{compatText('自定义')}</Tag> : null,
          ].filter(Boolean);
          return (
            <div className="driver-manager-driver-cell">
              <div className="driver-manager-driver-name">{row.name || row.type}</div>
              <Space size={4} wrap>
                <Text type="secondary" style={{ fontSize: 12 }}>{row.type}</Text>
                {tags}
              </Space>
            </div>
          );
        },
      },
      {
        title: compatText('状态'),
        key: 'status',
        width: 120,
        render: (_: string, row: DriverStatusRow) => {
          const progress = progressMap[row.type];
          const activeProgress = progress && (progress.status === 'start' || progress.status === 'downloading');
          return (
            <div className="driver-manager-status-cell">
              <Tag color={driverStatusColor(row, progress)} style={{ marginInlineEnd: 0 }}>
                {compatText(driverStatusLabel(row, progress), 'jsx')}
              </Tag>
              {activeProgress ? <Progress percent={Math.max(1, Math.min(99, Math.round(progress.percent || 0)))} size="small" /> : null}
            </div>
          );
        },
      },
      {
        title: compatText('版本'),
        key: 'driverVersion',
        width: 130,
        render: (_: string, row: DriverStatusRow) => {
          if (row.builtIn) {
            return <Text type="secondary">{compatText('内置')}</Text>;
          }
          const version = row.installedVersion || row.pinnedVersion || '-';
          const count = row.installedVersionCount || row.installedVersions?.length || 0;
          return (
            <div className="driver-manager-version-cell">
              <Text>{version}</Text>
              {count > 1 ? <Text type="secondary" style={{ fontSize: 12 }}>{compatText(`已下载 ${count} 个版本`, 'jsx')}</Text> : null}
            </div>
          );
        },
      },
      {
        title: compatText('来源'),
        key: 'installSource',
        width: 150,
        render: (_: string, row: DriverStatusRow) => {
          const label = compatText(row.installSourceLabel || (row.packageInstalled || row.connectable ? '驱动元数据' : '未安装'));
          return (
            <div className="driver-manager-source-cell">
              <Tag color={driverSourceTagColor(row.installSource)} style={{ width: 'fit-content', marginInlineEnd: 0 }}>
                {label}
              </Tag>
              {row.installSourceDetail ? (
                <Text type="secondary" ellipsis={{ tooltip: row.installSourceDetail }} style={{ fontSize: 12, maxWidth: 132 }}>
                  {row.installSourceDetail}
                </Text>
              ) : null}
            </div>
          );
        },
      },
    ];
    const actionColumn: ColumnsType<DriverStatusRow>[number] = {
      title: compatText('操作'),
      key: 'actions',
      width: 240,
      render: (_: string, row: DriverStatusRow) => renderDriverActions(row),
    };
    return activeDriverRow ? baseColumns : [...baseColumns, actionColumn];
  }, [activeDriverRow, progressMap, renderDriverActions]);

  const activeDriverLogs = operationLogMap[logDriverType] || [];
  const activeDriverLogLines = activeDriverLogs.map((item) => `[${item.time}] ${item.text}`);
  const downloadRequiredHosts = (networkStatus?.downloadRequiredHosts || []).filter(Boolean);
  const showDownloadChainAlert = networkStatus?.downloadChainReachable === false;
  const networkUnreachable = networkStatus?.reachable === false;
  const downloadRequiredHostText = (downloadRequiredHosts.length > 0
    ? downloadRequiredHosts
    : ['repo.maven.apache.org']).join('、');
  const repositoryConnectivityProbe = networkStatus?.checks.find((item) => item.name === 'Maven driver repository')
    || networkStatus?.checks.find((item) => item.name === 'Built-in driver matrix')
    || null;
  const repositoryConnectivityLatencyMs = repositoryConnectivityProbe
    && isRepositoryConnectivityProbe(repositoryConnectivityProbe)
    ? (repositoryConnectivityProbe.httpLatencyMs ?? repositoryConnectivityProbe.latencyMs ?? repositoryConnectivityProbe.tcpLatencyMs)
    : undefined;
  const logBlockBackground = darkMode
    ? `rgba(28, 28, 28, ${Math.max(opacity, 0.82)})`
    : `rgba(255, 255, 255, ${Math.max(opacity, 0.92)})`;
  const logBlockBorderColor = darkMode ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)';
  const logBlockTextColor = darkMode ? 'rgba(255, 255, 255, 0.88)' : 'rgba(0, 0, 0, 0.88)';

  return (
    <Modal
      title={(
        <Space size={10}>
          <DatabaseOutlined />
          <span>{compatText('驱动管理')}</span>
        </Space>
      )}
      open={open}
      onCancel={onClose}
      width={1180}
      style={{ top: 24 }}
      styles={{
        body: {
          maxHeight: 'calc(100vh - 180px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: 18,
        },
      }}
      destroyOnHidden
      footer={(
        <div className="driver-manager-footer">
          <div
            ref={externalHScrollRef}
            className="driver-manager-hscroll"
            aria-hidden={false}
            onScroll={applyExternalScrollToTableTargets}
          >
            <div className="driver-manager-hscroll-inner" style={{ width: `${Math.max(horizontalScrollWidth, 1)}px` }} />
          </div>
          <Space className="driver-manager-footer-actions" size={8}>
            <Button key="refresh" icon={<ReloadOutlined />} onClick={() => refreshStatus(true)} loading={loading}>
              {compatText('刷新')}
            </Button>
            <Button key="network" onClick={() => checkNetworkStatus(true)} loading={networkChecking}>
              {compatText('网络检测')}
            </Button>
            <Button key="close" type="primary" onClick={onClose}>
              {compatText('关闭')}
            </Button>
          </Space>
        </div>
      )}
    >
      <div ref={modalContentRef} className="driver-manager-content">
        <div className="driver-manager-status-grid">
          <div className="driver-manager-status-card">
            <Text type="secondary">{compatText('网络状态')}</Text>
            <div className={networkUnreachable ? 'driver-manager-status-value driver-manager-status-value-error' : 'driver-manager-status-value driver-manager-status-value-success'}>
              {networkStatus ? (networkUnreachable ? compatText('不可达') : compatText('正常')) : (networkChecking ? compatText('检测中') : compatText('未检测'))}
              {repositoryConnectivityLatencyMs !== undefined && !networkUnreachable ? <span>{repositoryConnectivityLatencyMs}ms</span> : null}
            </div>
          </div>
          <div className="driver-manager-status-card">
            <Text type="secondary">{compatText('驱动总数')}</Text>
            <div className="driver-manager-status-value">{compatText(`${rows.length} 个`, 'jsx')}</div>
          </div>
          <div className="driver-manager-status-card">
            <Text type="secondary">{compatText('待处理')}</Text>
            <div className={attentionDriverCount > 0 ? 'driver-manager-status-value driver-manager-status-value-warning' : 'driver-manager-status-value'}>
              {compatText(`${attentionDriverCount} 个`, 'jsx')}
            </div>
          </div>
          <div className="driver-manager-status-card">
            <Text type="secondary">{compatText('可用驱动')}</Text>
            <div className="driver-manager-status-value driver-manager-status-value-success">{compatText(`${availableDriverCount} 个`, 'jsx')}</div>
          </div>
        </div>

        {networkStatus && networkUnreachable ? (
          <Alert
            type="error"
            showIcon
            message={showDownloadChainAlert ? compatText('驱动下载链路域名不可达') : compatText('驱动下载网络不可达')}
            description={showDownloadChainAlert
              ? compatText(`请检查 Maven 源、代理规则或放行域名：${downloadRequiredHostText}。`, 'jsx')
              : networkStatus.summary}
          />
        ) : null}

        <div className="driver-manager-config-strip">
          <div className="driver-manager-config-rows">
            <div className="driver-manager-config-row">
              <div className="driver-manager-config-main">
                <Tag color={networkStatus?.repositoryConfigured ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
                  {networkStatus?.repositoryConfigured ? compatText('自定义 Maven 源') : compatText('默认 Maven 源')}
                </Tag>
                <Text ellipsis={{ tooltip: repositoryURL || networkStatus?.defaultRepositoryURL || 'https://repo.maven.apache.org/maven2' }}>
                  {repositoryURL || networkStatus?.defaultRepositoryURL || 'https://repo.maven.apache.org/maven2'}
                </Text>
              </div>
              <Space size={8} wrap>
                <Button size="small" onClick={() => setRepositoryEditing(true)}>{compatText('编辑')}</Button>
                <Button size="small" onClick={() => checkNetworkStatus(true)} loading={networkChecking}>{compatText('网络检测')}</Button>
              </Space>
            </div>
            {repositoryEditing ? (
              <div className="driver-manager-repository-editor">
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={repositoryURL}
                    placeholder="https://repo.maven.apache.org/maven2"
                    onChange={(event) => setRepositoryURL(event.target.value)}
                    onPressEnter={() => void configureRepository()}
                  />
                  <Button loading={repositorySaving} onClick={() => void configureRepository()}>
                    {compatText('保存')}
                  </Button>
                  <Button disabled={repositorySaving} onClick={() => void configureRepository('')}>
                    {compatText('恢复默认')}
                  </Button>
                  <Button disabled={repositorySaving} onClick={() => setRepositoryEditing(false)}>
                    {compatText('取消')}
                  </Button>
                </Space.Compact>
              </div>
            ) : null}
            <div className="driver-manager-config-row">
              <div className="driver-manager-config-main">
                <Tag color="default" style={{ marginInlineEnd: 0 }}>{compatText('驱动目录')}</Tag>
                <Text type="secondary" ellipsis={{ tooltip: downloadDir || '-' }}>
                  {downloadDir || '-'}
                </Text>
              </div>
              <Button size="small" onClick={() => void openDriverDirectory()} icon={<FolderOpenOutlined />}>{compatText('打开目录')}</Button>
            </div>
          </div>
        </div>

        <div className="driver-manager-toolbar">
          <Space size={8} wrap>
            <Button size="small" type={statusFilter === 'all' ? 'primary' : 'default'} onClick={() => setStatusFilter('all')}>{compatText('全部')}</Button>
            <Button size="small" type={statusFilter === 'attention' ? 'primary' : 'default'} onClick={() => setStatusFilter('attention')}>{compatText('待处理')}</Button>
            <Button size="small" type={statusFilter === 'available' ? 'primary' : 'default'} onClick={() => setStatusFilter('available')}>{compatText('可用驱动')}</Button>
            <Button size="small" type={statusFilter === 'custom' ? 'primary' : 'default'} onClick={() => setStatusFilter('custom')}>{compatText(`自定义 ${customDriverCount}`, 'jsx')}</Button>
          </Space>
          <div className="driver-manager-toolbar-actions">
            <Input.Search
              allowClear
              placeholder={compatText('搜索驱动名称/类型（如 DuckDB、clickhouse）')}
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            <Button type="primary" icon={<DatabaseOutlined />} onClick={openCustomDataSourceCreator}>
              {compatText('新增自定义数据源')}
            </Button>
          </div>
        </div>

        {statusLoadError && rows.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message={compatText('驱动状态暂未加载成功')}
            description={compatText(`已自动重试；仍失败时可点击“刷新”。原因：${statusLoadError}`, 'jsx')}
            action={(
              <Button size="small" icon={<ReloadOutlined />} onClick={() => void refreshStatus(true, { retryCount: DRIVER_STATUS_INITIAL_RETRY_COUNT })}>
                {compatText('刷新')}
              </Button>
            )}
          />
        ) : null}

        <div className={`driver-manager-main-grid${activeDriverRow ? ' driver-manager-main-grid-selected' : ''}`}>
          <div
            ref={tableContainerRef}
            className="driver-manager-list-panel driver-manager-table-wrap driver-manager-table-wrap-external-active"
          >
            <Table
              className="driver-manager-table driver-manager-compact-table"
              rowKey="type"
              loading={loading}
              columns={columns}
              dataSource={filteredRows}
              pagination={false}
              size="middle"
              sticky={false}
              scroll={{ x: DRIVER_TABLE_SCROLL_X }}
              rowClassName={(row) => row.type === activeDriverRow?.type ? 'driver-manager-row-selected-soft' : ''}
              onRow={(row) => ({
                onClick: () => setSelectedDriverType((current) => (current === row.type ? '' : row.type)),
              })}
              locale={{
                emptyText: normalizedSearchKeyword
                  ? compatText(`未找到匹配“${String(searchKeyword || '').trim()}”的驱动`, 'jsx')
                  : compatText('暂无驱动数据'),
              }}
            />
          </div>

          {activeDriverRow ? (
          <div ref={detailPanelRef} className="driver-manager-detail-panel">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div className="driver-manager-detail-header">
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{compatText('当前选择')}</Text>
                    <div className="driver-manager-detail-title">{activeDriverRow.name || activeDriverRow.type}</div>
                    <Text type="secondary">{activeDriverRow.type}</Text>
                  </div>
                  <Button size="small" onClick={() => setSelectedDriverType('')}>{compatText('收起详情')}</Button>
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{compatText('当前状态')}</Text>
                  <div style={{ marginTop: 6 }}>
                    <Tag color={driverStatusColor(activeDriverRow, progressMap[activeDriverRow.type])}>
                      {compatText(driverStatusLabel(activeDriverRow, progressMap[activeDriverRow.type]), 'jsx')}
                    </Tag>
                  </div>
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{compatText('默认驱动')}</Text>
                  <div style={{ marginTop: 8 }}>
                    {(activeDriverRow.driverOptions || []).length > 1 ? (
                      <Select
                        size="small"
                        style={{ width: '100%' }}
                        value={activeDriverRow.defaultDriverType || activeDriverRow.type}
                        loading={defaultDriverSavingKey.startsWith(`${activeDriverRow.type}:`)}
                        disabled={defaultDriverSavingKey.startsWith(`${activeDriverRow.type}:`)}
                        popupMatchSelectWidth={false}
                        optionLabelProp="label"
                        options={(activeDriverRow.driverOptions || []).map((option) => ({
                          value: option.driverType,
                          disabled: !option.available || !option.connectable,
                          label: renderDefaultDriverLabel(option.driverName, option.default, option.reusedRuntime),
                        }))}
                        onChange={(value) => void configureDefaultDriver(activeDriverRow, value)}
                      />
                    ) : (
                      <Text>{activeDriverRow.defaultDriverName || activeDriverRow.name || activeDriverRow.type}</Text>
                    )}
                  </div>
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{compatText('版本')}</Text>
                  {activeDriverRow.builtIn ? (
                    <div className="driver-manager-detail-value">{compatText('内置')}</div>
                  ) : activeDriverRow.reusedDriverType ? (
                    <div className="driver-manager-detail-value">
                      {compatText('复用')} {activeDriverRow.reusedDriverName || activeDriverRow.reusedDriverType}{activeDriverRow.installedVersion ? ` ${activeDriverRow.installedVersion}` : ''}
                    </div>
                  ) : (activeDriverRow.packageInstalled || activeDriverRow.connectable) && !activeDriverRow.managedDownload ? (
                    <div className="driver-manager-detail-value">
                      {activeDriverRow.installedVersion
                        ? compatText(`${activeDriverRow.installedVersion}（移除后可更换）`, 'jsx')
                        : compatText('已安装（移除后可更换）')}
                    </div>
                  ) : (
                    <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 8 }}>
                      <Select
                        size="small"
                        style={{ width: '100%' }}
                        loading={!!versionLoadingMap[activeDriverRow.type]}
                        disabled={actionState.driverType === activeDriverRow.type}
                        placeholder={(versionMap[activeDriverRow.type] || []).length > 0 ? compatText('选择驱动版本') : compatText('点击展开加载版本')}
                        value={selectedVersionMap[activeDriverRow.type]}
                        options={buildVersionSelectOptions(versionMap[activeDriverRow.type] || [])}
                        onOpenChange={(open) => {
                          const options = versionMap[activeDriverRow.type] || [];
                          const selectedKey = selectedVersionMap[activeDriverRow.type];
                          if (open && options.length === 0 && !versionLoadingMap[activeDriverRow.type]) {
                            void loadVersionOptions(activeDriverRow, true);
                            return;
                          }
                          if (open && selectedKey) {
                            void loadVersionPackageSize(activeDriverRow, selectedKey);
                          }
                        }}
                        onChange={(value) => {
                          setSelectedVersionMap((prev) => ({ ...prev, [activeDriverRow.type]: value }));
                          void loadVersionPackageSize(activeDriverRow, value);
                        }}
                      />
                      {activeDriverRow.installedVersion ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>{compatText(`当前启用：${activeDriverRow.installedVersion}`, 'jsx')}</Text>
                      ) : null}
                      {activeDriverRow.installedVersions?.length ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {compatText(`已下载 ${activeDriverRow.installedVersions.length} 个版本`, 'jsx')}
                        </Text>
                      ) : null}
                      {versionNoticeMap[activeDriverRow.type] ? (
                        <Text type="warning" style={{ fontSize: 12 }}>
                          {compatText(versionNoticeMap[activeDriverRow.type].message, 'jsx')}
                        </Text>
                      ) : null}
                    </Space>
                  )}
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{compatText('来源')}</Text>
                  <div style={{ marginTop: 6 }}>
                    <Tag color={driverSourceTagColor(activeDriverRow.installSource)}>{compatText(activeDriverRow.installSourceLabel || '-')}</Tag>
                  </div>
                  {activeDriverRow.installSourceDetail ? <Text type="secondary" style={{ fontSize: 12 }}>{activeDriverRow.installSourceDetail}</Text> : null}
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{compatText('路径')}</Text>
                  <Paragraph copyable={{ text: activeDriverRow.installDir || downloadDir || '-' }} className="driver-manager-detail-path">
                    {activeDriverRow.installDir || downloadDir || '-'}
                  </Paragraph>
                </div>
                <div className="driver-manager-detail-card driver-manager-detail-actions">
                  <Text type="secondary">{compatText('操作')}</Text>
                  <div className="driver-manager-detail-actions-body">
                    {renderDriverActions(activeDriverRow, 'middle')}
                  </div>
                </div>
              </Space>
          </div>
          ) : null}
        </div>

        <Collapse
          className="driver-manager-custom-collapse"
          size="small"
          items={[
            {
              key: 'custom-data-sources',
              label: compatText(`自定义数据源定义（${customDataSources.length}）`),
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    showIcon
                    type="info"
                    message={compatText('自定义数据源定义保存驱动与 Jar；连接只保存 DSN、凭据和实例选项')}
                    description={compatText('后端只返回脱敏定义元数据：驱动类、版本、Jar 文件名/校验和、驱动可加载和定义可用状态；连接是否成功仅在新建连接测试后记录。', 'jsx')}
                    action={(
                      <Button size="small" icon={<ReloadOutlined />} loading={customDefinitionLoading} onClick={() => void refreshCustomDefinitions(true)}>
                        {compatText('同步后端定义')}
                      </Button>
                    )}
                  />
                  {customDataSources.length === 0 ? (
                    <Alert showIcon type="warning" message={compatText('还没有自定义数据源定义')} description={compatText('点击“新增自定义数据源”上传 JDBC Jar，保存后可在新建连接中复用。', 'jsx')} />
                  ) : (
                    customDataSources.map((source) => {
                      const status = source.runtimeStatus;
                      const repairHints = status?.repairHints || [];
                      return (
                        <div key={source.id} className="driver-manager-custom-source-card">
                          <Space direction="vertical" size={4} style={{ minWidth: 0 }}>
                            <Space size={6} wrap>
                              <Text strong>{source.name}</Text>
                              {source.driverType ? <Tag color="blue">{source.driverType}</Tag> : null}
                              {source.version ? <Tag color="purple">{source.version}</Tag> : null}
                              {status?.definitionUsable ? <Tag color="success">{compatText('定义可用')}</Tag> : status?.driverLoadable ? <Tag color="warning">{compatText('驱动可加载')}</Tag> : <Tag>{compatText('未校验')}</Tag>}
                              {source.installSource === 'manual-upload' ? <Tag color="purple">{compatText('手动上传')}</Tag> : null}
                              {source.installSource === 'maven-download' ? <Tag color="geekblue">{compatText('Maven 下载')}</Tag> : null}
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>{compatText(`Driver Class：${source.driverClassName || '待后端发现/校验'}`, 'jsx')}</Text>
                            {source.dsnTemplate ? <Text type="secondary" ellipsis={{ tooltip: source.dsnTemplate }} style={{ maxWidth: 760 }}>{compatText(`DSN 模板：${source.dsnTemplate}`, 'jsx')}</Text> : null}
                            {source.jarFileNames?.length ? <Text type="secondary" style={{ fontSize: 12 }}>{compatText(`Jar：${source.jarFileNames.join('、')}`, 'jsx')}</Text> : null}
                            {status?.message ? <Text type={status.definitionUsable ? 'secondary' : 'danger'} style={{ fontSize: 12 }}>{compatText(`状态：${status.message}`, 'jsx')}</Text> : null}
                            {repairHints.length > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>{compatText(`修复建议：${repairHints.join('；')}`, 'jsx')}</Text> : null}
                          </Space>
                          <Space size={8} wrap style={{ justifyContent: 'flex-end' }}>
                            <Button size="small" loading={!!customDefinitionValidating[source.id]} onClick={() => void validateCustomDataSource(source)}>{compatText('校验/修复状态')}</Button>
                            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => removeSavedCustomDataSource(source)}>{compatText('移除记录')}</Button>
                          </Space>
                        </div>
                      );
                    })
                  )}
                </Space>
              ),
            },
          ]}
        />
      </div>
      <Modal
        title={compatText('新增自定义数据源')}
        open={customDataSourceModalOpen}
        onCancel={() => {
          if (!customDataSourceSaving) {
            setCustomDataSourceModalOpen(false);
          }
        }}
        onOk={() => void handleCreateCustomDataSource()}
        okText={compatText('上传并保存')}
        cancelText={compatText('取消')}
        confirmLoading={customDataSourceSaving}
        maskClosable={!customDataSourceSaving}
        destroyOnHidden
        width={680}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="info"
            message={compatText('在驱动管理中创建自定义数据源')}
            description={compatText('这里完成 Jar 上传、驱动类发现、数据源命名和 DSN 指引配置；新建连接只选择定义并填写实际 DSN/凭据。', 'jsx')}
          />
          <Form form={customDataSourceForm} layout="vertical">
            <Form.Item label={compatText('JDBC Jar')} required>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space size={8} wrap>
                  <Button
                    icon={<UploadOutlined />}
                    onClick={() => void chooseCustomDataSourceJarFiles()}
                    disabled={customDataSourceSaving}
                  >
                    {compatText('选择 Jar 文件')}
                  </Button>
                  <Text type={customDataSourceFiles.length > 0 ? undefined : 'secondary'}>
                    {compatText(summarizeJarFileNames(customDataSourceFiles), 'jsx')}
                  </Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {compatText(`支持一次选择主驱动 Jar 和依赖 Jar；上传版本默认写入“${DEFAULT_UPLOAD_DRIVER_VERSION}”。`, 'jsx')}
                </Text>
              </Space>
            </Form.Item>
            <Form.Item
              name="name"
              label={compatText('数据源名称')}
              rules={[
                { required: true, message: compatText('请输入自定义数据源名称') },
                { max: 64, message: compatText('数据源名称最多 64 个字符') },
              ]}
            >
              <Input placeholder={compatText('例如：Trino / DB2 / 自研分析库')} autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="dsnTemplate"
              label={compatText('DSN 模板（连接字符串模板）')}
              rules={[
                { required: true, message: compatText('请输入 DSN 模板') },
                { max: 4096, message: compatText('DSN 模板最多 4096 个字符') },
              ]}
              help={compatText('选择该数据源新建连接时会自动带出模板，保存连接时以连接表单中最终填写的 DSN 为准。', 'jsx')}
            >
              <Input.TextArea
                rows={4}
                placeholder={compatText('例如：jdbc:trino://host:8080/catalog/schema')} 
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item
              name="dsnHelp"
              label={compatText('DSN 填写说明')}
              rules={[{ max: 4096, message: compatText('DSN 说明最多 4096 个字符') }]}
              help={compatText('可写必填参数、常见 catalog/schema 示例或该驱动的连接注意事项。', 'jsx')}
            >
              <Input.TextArea
                rows={3}
                placeholder={compatText('例如：请将 host、catalog、schema 替换为实际环境。')} 
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item
              name="description"
              label={compatText('定义说明（可选）')}
              rules={[{ max: 1024, message: compatText('说明最多 1024 个字符') }]}
            >
              <Input.TextArea
                rows={2}
                placeholder={compatText('例如：公司内网 Trino，只包含主驱动和必要依赖 Jar。')} 
                autoComplete="off"
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
      <Modal
        title={compatText(`驱动日志 - ${activeLogRow?.name || logDriverType}`)}
        open={logModalOpen}
        onCancel={() => setLogModalOpen(false)}
        footer={[
          <Button key="close-log" type="primary" onClick={() => setLogModalOpen(false)}>
            {compatText('关闭')}
          </Button>,
        ]}
        width={780}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {activeLogRow?.installDir ? (
            <Paragraph copyable={{ text: activeLogRow.installDir }} style={{ marginBottom: 0 }}>
              {compatText(`安装目录：${activeLogRow.installDir}`, 'jsx')}
            </Paragraph>
          ) : null}
          {activeLogRow?.executablePath ? (
            <Paragraph copyable={{ text: activeLogRow.executablePath }} style={{ marginBottom: 0 }}>
              {compatText(`驱动可执行文件：${activeLogRow.executablePath}`, 'jsx')}
            </Paragraph>
          ) : null}
          {activeDriverLogLines.length > 0 ? (
            <pre style={{ margin: 0, maxHeight: 360, overflow: 'auto', padding: 12, background: logBlockBackground, color: logBlockTextColor, borderRadius: 8, border: `1px solid ${logBlockBorderColor}`, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {activeDriverLogLines.join('\n')}
            </pre>
          ) : (
            <Text type="secondary">{compatText('当前驱动暂无操作日志。')}</Text>
          )}
        </Space>
      </Modal>
    </Modal>
  );
};

export default DriverManagerModal;
