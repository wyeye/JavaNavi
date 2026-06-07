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
import { getRuntimeLanguage, translate, type I18nKey, type I18nParams } from '../i18n';

const { Paragraph, Text } = Typography;

const driverText = (key: I18nKey, params?: I18nParams): string => translate(getRuntimeLanguage(), key, params);

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
    return row.runtimeAvailable
      ? driverText('driverManager.statusBuiltInAvailable')
      : driverText('driverManager.statusBuiltInPending');
  }
  if (row.reusedDriverType) {
    const name = row.reusedDriverName || row.reusedDriverType;
    return row.connectable
      ? driverText('driverManager.statusReuse', { name })
      : driverText('driverManager.statusWaitingFor', { name });
  }
  if (progress && (progress.status === 'start' || progress.status === 'downloading')) {
    return driverText('driverManager.statusInstallingPercent', { percent: Math.round(progress.percent) });
  }
  if (row.connectable) {
    return driverText('driverManager.statusAvailable');
  }
  if (row.packageInstalled) {
    return driverText('driverManager.statusInstalled');
  }
  if (row.managedDownload || row.downloadRequired) {
    return driverText('driverManager.statusPendingInstall');
  }
  return driverText('driverManager.statusDisabled');
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
    return driverText('driverManager.noJarFilesSelected');
  }
  return names.length > 3
    ? driverText('driverManager.jarFileSummaryWithMore', { names: names.slice(0, 3).join('、'), count: names.length })
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
      label: option.displayLabel || option.version || driverText('driverManager.defaultVersion'),
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
    label: driverText('driverManager.yearGroup', { year }),
    options: yearGroups.get(year) || [],
  }));
  if (others.length > 0) {
    grouped.push({ label: driverText('driverManager.other'), options: others });
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
    {showDefaultTag ? <Tag color="blue" style={defaultDriverTagStyle}>{driverText('driverManager.default')}</Tag> : null}
    {showReusedRuntimeTag ? <Tag color="default" style={defaultDriverTagStyle}>{driverText('driverManager.reuseRuntime')}</Tag> : null}
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
            throw new Error(res?.message || driverText('driverManager.loadDriverStatusFailed'));
          }

          const data = toRecord<DriverStatusResponseData>(res?.data);
          const resolvedDir = String(data.downloadDir || '').trim();
          const drivers: DriverStatusItem[] = Array.isArray(data.drivers) ? data.drivers.map((item) => toRecord<DriverStatusItem>(item)) : [];
          if (drivers.length === 0) {
            throw new Error(driverText('driverManager.driverStatusEmpty'));
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
          lastErrorText = getErrorMessage(error, driverText('driverManager.loadDriverStatusFailed'));
          if (attempt < retryCount) {
            await sleep(DRIVER_STATUS_RETRY_DELAY_MS * (attempt + 1));
          }
        }
      }
      setStatusLoadError(lastErrorText || driverText('driverManager.loadDriverStatusFailed'));
      if (toastOnError) {
        message.error(lastErrorText || driverText('driverManager.loadDriverStatusFailed'));
      }
      return false;
    } catch (err: unknown) {
      const errText = getErrorMessage(err);
      setStatusLoadError(errText);
      if (toastOnError) {
        message.error(driverText('driverManager.loadDriverStatusFailedWithMessage', { message: errText }));
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
        throw new Error(res?.message || driverText('driverManager.loadCustomDataSourceDefinitionsFailed'));
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
        message.error(getErrorMessage(error, driverText('driverManager.loadCustomDataSourceDefinitionsFailed')));
      }
      return latestSources;
    } finally {
      setCustomDefinitionLoading(false);
    }
  }, []);

  const validateCustomDataSource = useCallback(async (source: CustomDataSource) => {
    const driverType = String(source.driverType || source.driver || '').trim();
    if (!driverType) {
      message.warning(driverText('driverManager.thisCustomDataSourceIsMissingADriver'));
      return;
    }
    setCustomDefinitionValidating((prev) => ({ ...prev, [source.id]: true }));
    try {
      const res = await ValidateCustomDriverDefinition(driverType, downloadDirRef.current);
      if (!res?.success) {
        throw new Error(res?.message || driverText('driverManager.validateCustomDataSourceFailed'));
      }
      const definition = extractBackendCustomDataSourceDefinition(res);
      const merged = definition ? createCustomDataSourceFromBackendDefinition(definition, source) : null;
      if (!merged) {
        throw new Error(driverText('driverManager.noUsableCustomDataSourceDefinition'));
      }
      const nextSources = upsertCustomDataSource(loadCustomDataSources(), merged);
      setCustomDataSources(nextSources);
      if (merged.runtimeStatus?.definitionUsable) {
        message.success(driverText('driverManager.definitionAvailableForName', { name: merged.name }));
      } else {
        message.warning((merged.runtimeStatus?.message || driverText('driverManager.needsRepairForName', { name: merged.name })));
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error, driverText('driverManager.validateCustomDataSourceFailed')));
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
          message.error(res?.message || driverText('driverManager.driverNetworkCheckFailed'));
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
        summary: String(data.summary || '').trim() || driverText('driverManager.driverNetworkCheckCompleted'),
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
        message.error(driverText('driverManager.driverNetworkCheckFailedWithMessage', { message: getErrorMessage(err) }));
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
          message.error((res?.message || driverText('driverManager.versionListFailedForName', { name: row.name })));
        }
        return [] as DriverVersionOption[];
      }
      const data = toRecord<DriverVersionListPayload & { metadataBacked?: unknown; metadataError?: unknown; message?: unknown }>(res?.data);
      const rawVersions: DriverVersionPayload[] = Array.isArray(data.versions) ? data.versions.map((item) => toRecord<DriverVersionPayload>(item)) : [];
      const metadataBacked = data.metadataBacked === true;
      const metadataError = String(data.metadataError || '').trim();
      const limitedMessage = String(data.message || '').trim()
        || (metadataError
          ? driverText('driverManager.metadataUnavailableRecommendedOnlyWithMessage', { message: metadataError })
          : driverText('driverManager.metadataUnavailableRecommendedOnly'));
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
          const baseLabel = String(item.displayLabel || '').trim() || version || driverText('driverManager.defaultVersion');
          const displayLabel = active
            ? driverText('driverManager.downloadedVersionStatus', { version: baseLabel, status: driverText('driverManager.currentlyActive') })
            : installed
              ? driverText('driverManager.downloadedVersionStatus', { version: baseLabel, status: driverText('driverManager.downloaded') })
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
            displayLabel: fallbackVersion || driverText('driverManager.defaultVersion'),
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
        message.error(driverText('driverManager.loadVersionListFailedWithMessage', { name: row.name, message: getErrorMessage(err) }));
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
        message.error(result?.message || driverText('driverManager.saveMavenRepositoryFailed'));
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
      message.success(driverText('driverManager.theMavenRepositoryHasBeenSavedFutureVersion'));
    } catch (err: unknown) {
      message.error(driverText('driverManager.saveMavenRepositoryFailedWithMessage', { message: getErrorMessage(err) }));
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
        message.error(result?.message || driverText('driverManager.setDefaultDriverFailed'));
        return;
      }
      const resultData = toRecord<DriverStatusItem>(result.data);
      message.success(driverText('driverManager.setDefaultDriverSucceeded', { driver: row.name || row.type, target: String(resultData.defaultDriverName || targetDriverType) }));
      await refreshStatus(false);
    } catch (err: unknown) {
      message.error(driverText('driverManager.setDefaultDriverFailedWithMessage', { message: getErrorMessage(err) }));
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
      const fileSummary = summarizeJarFileNames(files);
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
          message.error(driverText('driverManager.enterTheDriverVersionForTheUploadedJar'));
          return;
        }
        modalRef?.destroy();
        finish(version);
      };
      modalRef = Modal.confirm({
        title: driverText('driverManager.uploadVersionPromptForName', { name: row.name || row.type }),
        okText: driverText('driverManager.startUpload'),
        cancelText: driverText('driverManager.cancel'),
        content: (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text type="secondary">{driverText('driverManager.jarFilesSelectedConfirmTheVersionWrittenTo')}</Text>
            {fileSummary ? <Text type="secondary" style={{ fontSize: 12 }}>{fileSummary}</Text> : null}
            <Input
              autoFocus
              defaultValue={DEFAULT_UPLOAD_DRIVER_VERSION}
              placeholder={driverText('driverManager.uploadedJarVersion')}
              autoComplete="off"
              onChange={(event) => {
                currentValue = event.target.value;
              }}
              onPressEnter={confirmVersion}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {driverText('driverManager.defaultUploadVersionNotice', { version: DEFAULT_UPLOAD_DRIVER_VERSION })}
            </Text>
          </Space>
        ),
        onOk: () => {
          const version = currentValue.trim();
          if (!version) {
            message.error(driverText('driverManager.enterTheDriverVersionForTheUploadedJar'));
            return Promise.reject(new Error(driverText('driverManager.uploadDriverVersionMissing')));
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
        message.error(driverText('driverManager.uploadTheJdbcJarForThisCustomData'));
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
      appendOperationLog(driverType, driverText('driverManager.customUploadStartLog', { version, files: fileNames.join(', ') }));
      const result = await UploadLocalDriverPackage(driverType, files, downloadDir, version);
      if (!result?.success) {
        const errText = result?.message || driverText('driverManager.uploadCustomJdbcJarFailed');
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
      appendOperationLog(driverType, driverText('driverManager.customDataSourceCreatedEnabledLog', { name: hydratedSource.name }));
      message.success(driverText('driverManager.customDataSourceAdded', { name: hydratedSource.name }));
      setCustomDataSourceModalOpen(false);
      setCustomDataSourceFiles([]);
      customDataSourceForm.resetFields();
      await refreshStatus(false);
      await refreshCustomDefinitions(false);
    } catch (error: unknown) {
      if (isAntdValidationError(error)) {
        return;
      }
      message.error(getErrorMessage(error, driverText('driverManager.addCustomDataSourceFailed')));
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
      title: driverText('driverManager.removeCustomDataSourceTitle', { name: source.name }),
      content: driverText('driverManager.thisOnlyRemovesTheDataSourceEntryFrom'),
      okText: driverText('driverManager.remove'),
      okButtonProps: { danger: true },
      cancelText: driverText('driverManager.cancel'),
      onOk: () => {
        const nextSources = removeCustomDataSource(loadCustomDataSources(), source.id);
        setCustomDataSources(nextSources);
        message.success(driverText('driverManager.customDataSourceRemoved', { name: source.name }));
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
        message: driverText('driverManager.startInstall'),
        percent: 0,
      },
    }));
    appendOperationLog(row.type, row.connectable ? driverText('driverManager.installStartDownloadSwitchLog') : driverText('driverManager.installStartAutoLog'));
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
        const errText = result?.message || driverText('driverManager.installDriverFailed', { name: row.name });
        appendOperationLog(row.type, `[ERROR] ${errText}`);
        message.error(errText);
        return;
      }
      const versionTip = selectedVersion ? `(${selectedVersion})` : '';
      appendOperationLog(row.type, driverText('driverManager.mavenDriverEnabledLog', { version: versionTip }));
      message.success(driverText('driverManager.driverDownloadedEnabled', { name: row.name, version: versionTip }));
      refreshStatus(false);
    } finally {
      setActionState({ driverType: '', kind: '' });
    }
  }, [appendOperationLog, downloadDir, loadVersionOptions, refreshStatus, selectedVersionMap, versionMap]);

  const uploadDriverFromJarFiles = useCallback(async (row: DriverStatusRow) => {
    if (!row.managedJarUploadAllowed) {
      message.warning(driverText('driverManager.builtInDataSourcesDoNotSupportJar'));
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
    const versionTip = selectedVersion ? `(${selectedVersion})` : '';
    appendOperationLog(row.type, driverText('driverManager.uploadJarStartLog', { version: versionTip, files: files.map((file) => file.name).join(', ') }));
    try {
      const result = await UploadLocalDriverPackage(row.type, files, downloadDir, selectedVersion);
      if (!result?.success) {
        const errText = result?.message || driverText('driverManager.uploadJdbcJarFailed', { name: row.name });
        appendOperationLog(row.type, `[ERROR] ${errText}`);
        message.error(errText);
        return;
      }
      appendOperationLog(row.type, driverText('driverManager.uploadJarDoneLog', { version: versionTip }).trim());
      message.success(driverText('driverManager.jdbcJarUploadedEnabled', { name: row.name, version: versionTip }));
      await refreshStatus(false);
    } finally {
      setActionState({ driverType: '', kind: '' });
    }
  }, [appendOperationLog, downloadDir, pickJarFiles, promptUploadDriverVersion, refreshStatus]);

  const openDriverDirectory = useCallback(async () => {
    try {
      const res = await OpenDriverDownloadDirectory(downloadDir);
      if (!res?.success) {
        throw new Error(res?.message || driverText('driverManager.openDriverDirectoryFailedWithMessage', { message: '' }));
      }
      const data = toRecord<DriverDirectoryPayload>(res.data);
      const opened = !!data.opened;
      const pathText = String(data.path || data.directory || downloadDir || '').trim();
      const responseMessage = String(data.message || '').trim();
      if (opened) {
        message.success((responseMessage || driverText('driverManager.openedDriverDirectoryWithPath', { path: pathText || '-' })));
        return;
      }
      if (pathText && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(pathText);
          message.warning(driverText('driverManager.pathCopiedAfterOpenFailed', { message: responseMessage || driverText('driverManager.unableToOpenTheDriverDirectoryAutomatically'), path: pathText }));
          return;
        } catch {
          // Clipboard is best effort only; fall through to the visible path message.
        }
      }
      message.warning((responseMessage || driverText('driverManager.openDriverDirectoryManually', { path: pathText || '-' })));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error || driverText('message.unknownError'));
      message.error(driverText('driverManager.openDriverDirectoryFailedWithMessage', { message: errMsg }));
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
    appendOperationLog(row.type, driverText('driverManager.removeDriverStartLog'));
    try {
      const result = await RemoveDriverPackage(row.type, downloadDir);
      if (!result?.success) {
        const errText = result?.message || driverText('driverManager.removeDriverFailed', { name: row.name });
        appendOperationLog(row.type, `[ERROR] ${errText}`);
        message.error(errText);
        return;
      }
      appendOperationLog(row.type, driverText('driverManager.removeDriverDoneLog'));
      message.success(driverText('driverManager.driverRemoved', { name: row.name }));
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
      return <Text type="secondary">{driverText('driverManager.builtInDriversRequireNoAction')}</Text>;
    }

    const loadingInstallOrRemove =
      actionState.driverType === row.type && (actionState.kind === 'install' || actionState.kind === 'remove');
    const loadingUpload = actionState.driverType === row.type && actionState.kind === 'upload';
    const logs = operationLogMap[row.type] || [];
    const hasLogs = logs.length > 0;

    if (row.reusedDriverType) {
      return (
        <Space size={8} wrap>
          <Text type="secondary">{driverText('driverManager.managedByOwner', { owner: row.reusedDriverName || row.reusedDriverType })}</Text>
          <Button size={buttonSize} disabled={!hasLogs} onClick={() => openDriverLog(row.type)}>
            {driverText('driverManager.viewLogs')}
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
        {row.connectable ? driverText('driverManager.switchVersion') : driverText('driverManager.installAndEnable')}
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
        {driverText('driverManager.remove')}
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
        {driverText('driverManager.installAndEnable')}
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
            {driverText('driverManager.uploadJar')}
          </Button>
        ) : null}
        <Button size={buttonSize} type={hasLogs ? 'default' : 'text'} disabled={!hasLogs} onClick={() => openDriverLog(row.type)}>
          {driverText('driverManager.viewLogs')}
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
        ...(row.installedVersions || []).map((item) => driverText('driverManager.downloadedVersionStatus', { version: item.version, status: item.active ? driverText('driverManager.currentlyActive') : driverText('driverManager.downloaded') })),
        row.message,
        row.installSourceLabel,
        row.installSourceDetail,
        row.installMode,
        row.defaultDriverName ? driverText('driverManager.defaultDriverWithName', { name: row.defaultDriverName }) : '',
        ...(row.driverOptions || []).map((option) => driverText('driverManager.driverOptionSummary', { name: option.driverName, defaultText: option.default ? driverText('driverManager.default') : '', reusedText: option.reusedRuntime ? driverText('driverManager.reuseRuntime') : '' })),
        row.reusedDriverType ? driverText('driverManager.reuseRuntimeName', { name: row.reusedDriverName || row.reusedDriverType }) : '',
        row.builtIn ? driverText('driverManager.builtIn') : row.managedDownload ? driverText('driverManager.onDemandDownload') : driverText('driverManager.external'),
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
      ? driverText('driverManager.needsAttention')
      : statusFilter === 'available'
        ? driverText('driverManager.availableDrivers')
        : statusFilter === 'custom'
          ? driverText('driverManager.custom')
          : driverText('driverManager.all');
    if (normalizedSearchKeyword || statusFilter !== 'all') {
      return driverText('driverManager.filterMatches', { filter: filterName, matched: filteredRows.length, total: rows.length });
    }
    return driverText('driverManager.totalDrivers', { count: rows.length });
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
        title: driverText('driverManager.dataSource'),
        key: 'name',
        width: 220,
        render: (_: string, row: DriverStatusRow) => {
          const tags = [
            row.builtIn ? <Tag key="built-in" color="success">{driverText('driverManager.builtIn')}</Tag> : null,
            isCustomDriverRow(row) ? <Tag key="custom" color="purple">{driverText('driverManager.custom')}</Tag> : null,
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
        title: driverText('driverManager.status'),
        key: 'status',
        width: 120,
        render: (_: string, row: DriverStatusRow) => {
          const progress = progressMap[row.type];
          const activeProgress = progress && (progress.status === 'start' || progress.status === 'downloading');
          return (
            <div className="driver-manager-status-cell">
              <Tag color={driverStatusColor(row, progress)} style={{ marginInlineEnd: 0 }}>
                {driverStatusLabel(row, progress)}
              </Tag>
              {activeProgress ? <Progress percent={Math.max(1, Math.min(99, Math.round(progress.percent || 0)))} size="small" /> : null}
            </div>
          );
        },
      },
      {
        title: driverText('driverManager.version'),
        key: 'driverVersion',
        width: 130,
        render: (_: string, row: DriverStatusRow) => {
          if (row.builtIn) {
            return <Text type="secondary">{driverText('driverManager.builtIn')}</Text>;
          }
          const version = row.installedVersion || row.pinnedVersion || '-';
          const count = row.installedVersionCount || row.installedVersions?.length || 0;
          return (
            <div className="driver-manager-version-cell">
              <Text>{version}</Text>
              {count > 1 ? <Text type="secondary" style={{ fontSize: 12 }}>{driverText('driverManager.downloadedVersionsCount', { count })}</Text> : null}
            </div>
          );
        },
      },
      {
        title: driverText('driverManager.source'),
        key: 'installSource',
        width: 150,
        render: (_: string, row: DriverStatusRow) => {
          const label = row.installSourceLabel || (row.packageInstalled || row.connectable ? driverText('driverManager.driverMetadata') : driverText('driverManager.notInstalled'));
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
      title: driverText('driverManager.actions'),
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
          <span>{driverText('driverManager.driverManager')}</span>
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
              {driverText('driverManager.refresh')}
            </Button>
            <Button key="network" onClick={() => checkNetworkStatus(true)} loading={networkChecking}>
              {driverText('driverManager.networkCheck')}
            </Button>
            <Button key="close" type="primary" onClick={onClose}>
              {driverText('driverManager.close')}
            </Button>
          </Space>
        </div>
      )}
    >
      <div ref={modalContentRef} className="driver-manager-content">
        <div className="driver-manager-status-grid">
          <div className="driver-manager-status-card">
            <Text type="secondary">{driverText('driverManager.networkStatus')}</Text>
            <div className={networkUnreachable ? 'driver-manager-status-value driver-manager-status-value-error' : 'driver-manager-status-value driver-manager-status-value-success'}>
              {networkStatus ? (networkUnreachable ? driverText('driverManager.unreachable') : driverText('driverManager.normal')) : (networkChecking ? driverText('driverManager.checking') : driverText('driverManager.notChecked'))}
              {repositoryConnectivityLatencyMs !== undefined && !networkUnreachable ? <span>{repositoryConnectivityLatencyMs}ms</span> : null}
            </div>
          </div>
          <div className="driver-manager-status-card">
            <Text type="secondary">{driverText('driverManager.totalDrivers')}</Text>
            <div className="driver-manager-status-value">{driverText('driverManager.countWithUnit', { count: rows.length })}</div>
          </div>
          <div className="driver-manager-status-card">
            <Text type="secondary">{driverText('driverManager.needsAttention')}</Text>
            <div className={attentionDriverCount > 0 ? 'driver-manager-status-value driver-manager-status-value-warning' : 'driver-manager-status-value'}>
              {driverText('driverManager.countWithUnit', { count: attentionDriverCount })}
            </div>
          </div>
          <div className="driver-manager-status-card">
            <Text type="secondary">{driverText('driverManager.availableDrivers')}</Text>
            <div className="driver-manager-status-value driver-manager-status-value-success">{driverText('driverManager.countWithUnit', { count: availableDriverCount })}</div>
          </div>
        </div>

        {networkStatus && networkUnreachable ? (
          <Alert
            type="error"
            showIcon
            message={showDownloadChainAlert ? driverText('driverManager.driverDownloadChainHostsAreUnreachable') : driverText('driverManager.driverDownloadNetworkIsUnreachable')}
            description={showDownloadChainAlert
              ? driverText('driverManager.allowHostsWarning', { hosts: downloadRequiredHostText })
              : networkStatus.summary}
          />
        ) : null}

        <div className="driver-manager-config-strip">
          <div className="driver-manager-config-rows">
            <div className="driver-manager-config-row">
              <div className="driver-manager-config-main">
                <Tag color={networkStatus?.repositoryConfigured ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
                  {networkStatus?.repositoryConfigured ? driverText('driverManager.customMavenRepository') : driverText('driverManager.defaultMavenRepository')}
                </Tag>
                <Text ellipsis={{ tooltip: repositoryURL || networkStatus?.defaultRepositoryURL || 'https://repo.maven.apache.org/maven2' }}>
                  {repositoryURL || networkStatus?.defaultRepositoryURL || 'https://repo.maven.apache.org/maven2'}
                </Text>
              </div>
              <Space size={8} wrap>
                <Button size="small" onClick={() => setRepositoryEditing(true)}>{driverText('driverManager.edit')}</Button>
                <Button size="small" onClick={() => checkNetworkStatus(true)} loading={networkChecking}>{driverText('driverManager.networkCheck')}</Button>
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
                    {driverText('driverManager.save')}
                  </Button>
                  <Button disabled={repositorySaving} onClick={() => void configureRepository('')}>
                    {driverText('driverManager.restoreDefaults')}
                  </Button>
                  <Button disabled={repositorySaving} onClick={() => setRepositoryEditing(false)}>
                    {driverText('driverManager.cancel')}
                  </Button>
                </Space.Compact>
              </div>
            ) : null}
            <div className="driver-manager-config-row">
              <div className="driver-manager-config-main">
                <Tag color="default" style={{ marginInlineEnd: 0 }}>{driverText('driverManager.driverDirectory')}</Tag>
                <Text type="secondary" ellipsis={{ tooltip: downloadDir || '-' }}>
                  {downloadDir || '-'}
                </Text>
              </div>
              <Button size="small" onClick={() => void openDriverDirectory()} icon={<FolderOpenOutlined />}>{driverText('driverManager.openDirectory')}</Button>
            </div>
          </div>
        </div>

        <div className="driver-manager-toolbar">
          <Space size={8} wrap>
            <Button size="small" type={statusFilter === 'all' ? 'primary' : 'default'} onClick={() => setStatusFilter('all')}>{driverText('driverManager.all')}</Button>
            <Button size="small" type={statusFilter === 'attention' ? 'primary' : 'default'} onClick={() => setStatusFilter('attention')}>{driverText('driverManager.needsAttention')}</Button>
            <Button size="small" type={statusFilter === 'available' ? 'primary' : 'default'} onClick={() => setStatusFilter('available')}>{driverText('driverManager.availableDrivers')}</Button>
            <Button size="small" type={statusFilter === 'custom' ? 'primary' : 'default'} onClick={() => setStatusFilter('custom')}>{driverText('driverManager.customFilterCount', { count: customDriverCount })}</Button>
          </Space>
          <div className="driver-manager-toolbar-actions">
            <Input.Search
              allowClear
              placeholder={driverText('driverManager.searchDriverNameTypeForExampleDuckDBOr')}
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            <Button type="primary" icon={<DatabaseOutlined />} onClick={openCustomDataSourceCreator}>
              {driverText('driverManager.addCustomDataSource')}
            </Button>
          </div>
        </div>

        {statusLoadError && rows.length === 0 ? (
          <Alert
            type="warning"
            showIcon
            message={driverText('driverManager.driverStatusHasNotLoadedSuccessfullyYet')}
            description={driverText('driverManager.autoRetryReason', { reason: statusLoadError })}
            action={(
              <Button size="small" icon={<ReloadOutlined />} onClick={() => void refreshStatus(true, { retryCount: DRIVER_STATUS_INITIAL_RETRY_COUNT })}>
                {driverText('driverManager.refresh')}
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
                  ? driverText('driverManager.noDriverMatched', { keyword: String(searchKeyword || '').trim() })
                  : driverText('driverManager.noDriverDataYet'),
              }}
            />
          </div>

          {activeDriverRow ? (
          <div ref={detailPanelRef} className="driver-manager-detail-panel">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div className="driver-manager-detail-header">
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{driverText('driverManager.currentSelection')}</Text>
                    <div className="driver-manager-detail-title">{activeDriverRow.name || activeDriverRow.type}</div>
                    <Text type="secondary">{activeDriverRow.type}</Text>
                  </div>
                  <Button size="small" onClick={() => setSelectedDriverType('')}>{driverText('driverManager.collapseDetails')}</Button>
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{driverText('driverManager.currentStatus')}</Text>
                  <div style={{ marginTop: 6 }}>
                    <Tag color={driverStatusColor(activeDriverRow, progressMap[activeDriverRow.type])}>
                      {driverStatusLabel(activeDriverRow, progressMap[activeDriverRow.type])}
                    </Tag>
                  </div>
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{driverText('driverManager.defaultDriver')}</Text>
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
                  <Text type="secondary">{driverText('driverManager.version')}</Text>
                  {activeDriverRow.builtIn ? (
                    <div className="driver-manager-detail-value">{driverText('driverManager.builtIn')}</div>
                  ) : activeDriverRow.reusedDriverType ? (
                    <div className="driver-manager-detail-value">
                      {driverText('driverManager.reuse')} {activeDriverRow.reusedDriverName || activeDriverRow.reusedDriverType}{activeDriverRow.installedVersion ? ` ${activeDriverRow.installedVersion}` : ''}
                    </div>
                  ) : (activeDriverRow.packageInstalled || activeDriverRow.connectable) && !activeDriverRow.managedDownload ? (
                    <div className="driver-manager-detail-value">
                      {activeDriverRow.installedVersion
                        ? driverText('driverManager.installedVersionReplaceable', { version: activeDriverRow.installedVersion })
                        : driverText('driverManager.installedCanBeReplacedAfterRemoval')}
                    </div>
                  ) : (
                    <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 8 }}>
                      <Select
                        size="small"
                        style={{ width: '100%' }}
                        loading={!!versionLoadingMap[activeDriverRow.type]}
                        disabled={actionState.driverType === activeDriverRow.type}
                        placeholder={(versionMap[activeDriverRow.type] || []).length > 0 ? driverText('driverManager.selectDriverVersion') : driverText('driverManager.clickToExpandAndLoadVersions')}
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
                        <Text type="secondary" style={{ fontSize: 12 }}>{driverText('driverManager.currentActiveVersion', { version: activeDriverRow.installedVersion })}</Text>
                      ) : null}
                      {activeDriverRow.installedVersions?.length ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {driverText('driverManager.downloadedVersionsCount', { count: activeDriverRow.installedVersions.length })}
                        </Text>
                      ) : null}
                      {versionNoticeMap[activeDriverRow.type] ? (
                        <Text type="warning" style={{ fontSize: 12 }}>
                          {versionNoticeMap[activeDriverRow.type].message}
                        </Text>
                      ) : null}
                    </Space>
                  )}
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{driverText('driverManager.source')}</Text>
                  <div style={{ marginTop: 6 }}>
                    <Tag color={driverSourceTagColor(activeDriverRow.installSource)}>{activeDriverRow.installSourceLabel || '-'}</Tag>
                  </div>
                  {activeDriverRow.installSourceDetail ? <Text type="secondary" style={{ fontSize: 12 }}>{activeDriverRow.installSourceDetail}</Text> : null}
                </div>
                <div className="driver-manager-detail-card">
                  <Text type="secondary">{driverText('driverManager.path')}</Text>
                  <Paragraph copyable={{ text: activeDriverRow.installDir || downloadDir || '-' }} className="driver-manager-detail-path">
                    {activeDriverRow.installDir || downloadDir || '-'}
                  </Paragraph>
                </div>
                <div className="driver-manager-detail-card driver-manager-detail-actions">
                  <Text type="secondary">{driverText('driverManager.actions')}</Text>
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
              label: driverText('driverManager.customDefinitionsCount', { count: customDataSources.length }),
              children: (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Alert
                    showIcon
                    type="info"
                    message={driverText('driverManager.customDataSourceDefinitionsStoreDriversAndJars')}
                    description={driverText('driverManager.theBackendOnlyReturnsSanitizedDefinitionMetadataDriver')}
                    action={(
                      <Button size="small" icon={<ReloadOutlined />} loading={customDefinitionLoading} onClick={() => void refreshCustomDefinitions(true)}>
                        {driverText('driverManager.syncBackendDefinitions')}
                      </Button>
                    )}
                  />
                  {customDataSources.length === 0 ? (
                    <Alert showIcon type="warning" message={driverText('driverManager.noCustomDataSourceDefinitionsYet')} description={driverText('driverManager.clickAddCustomDataSourceToUploadA')} />
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
                              {status?.definitionUsable ? <Tag color="success">{driverText('driverManager.definitionAvailable')}</Tag> : status?.driverLoadable ? <Tag color="warning">{driverText('driverManager.driverLoadable')}</Tag> : <Tag>{driverText('driverManager.unchecked')}</Tag>}
                              {source.installSource === 'manual-upload' ? <Tag color="purple">{driverText('driverManager.manualUpload')}</Tag> : null}
                              {source.installSource === 'maven-download' ? <Tag color="geekblue">{driverText('driverManager.mavenDownload')}</Tag> : null}
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>{driverText('driverManager.driverClassValue', { className: source.driverClassName || driverText('driverManager.pendingBackendDiscoveryValidation') })}</Text>
                            {source.dsnTemplate ? <Text type="secondary" ellipsis={{ tooltip: source.dsnTemplate }} style={{ maxWidth: 760 }}>{driverText('driverManager.dsnTemplateValue', { dsn: source.dsnTemplate })}</Text> : null}
                            {source.jarFileNames?.length ? <Text type="secondary" style={{ fontSize: 12 }}>{driverText('driverManager.jarListValue', { files: source.jarFileNames.join('、') })}</Text> : null}
                            {status?.message ? <Text type={status.definitionUsable ? 'secondary' : 'danger'} style={{ fontSize: 12 }}>{driverText('driverManager.statusValue', { message: status.message })}</Text> : null}
                            {repairHints.length > 0 ? <Text type="secondary" style={{ fontSize: 12 }}>{driverText('driverManager.repairSuggestionsValue', { hints: repairHints.join('；') })}</Text> : null}
                          </Space>
                          <Space size={8} wrap style={{ justifyContent: 'flex-end' }}>
                            <Button size="small" loading={!!customDefinitionValidating[source.id]} onClick={() => void validateCustomDataSource(source)}>{driverText('driverManager.validateRepairStatus')}</Button>
                            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => removeSavedCustomDataSource(source)}>{driverText('driverManager.removeRecord')}</Button>
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
        title={driverText('driverManager.addCustomDataSource')}
        open={customDataSourceModalOpen}
        onCancel={() => {
          if (!customDataSourceSaving) {
            setCustomDataSourceModalOpen(false);
          }
        }}
        onOk={() => void handleCreateCustomDataSource()}
        okText={driverText('driverManager.uploadAndSave')}
        cancelText={driverText('driverManager.cancel')}
        confirmLoading={customDataSourceSaving}
        maskClosable={!customDataSourceSaving}
        destroyOnHidden
        width={680}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="info"
            message={driverText('driverManager.createACustomDataSourceInDriverManager')}
            description={driverText('driverManager.uploadTheJarDiscoverTheDriverClassName')}
          />
          <Form form={customDataSourceForm} layout="vertical">
            <Form.Item label={driverText('driverManager.jdbcJar')} required>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space size={8} wrap>
                  <Button
                    icon={<UploadOutlined />}
                    onClick={() => void chooseCustomDataSourceJarFiles()}
                    disabled={customDataSourceSaving}
                  >
                    {driverText('driverManager.chooseJarFiles')}
                  </Button>
                  <Text type={customDataSourceFiles.length > 0 ? undefined : 'secondary'}>
                    {summarizeJarFileNames(customDataSourceFiles)}
                  </Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {driverText('driverManager.multiJarUploadNotice', { version: DEFAULT_UPLOAD_DRIVER_VERSION })}
                </Text>
              </Space>
            </Form.Item>
            <Form.Item
              name="name"
              label={driverText('driverManager.dataSourceName')}
              rules={[
                { required: true, message: driverText('driverManager.enterACustomDataSourceName') },
                { max: 64, message: driverText('driverManager.dataSourceNamesCanBeUpTo64') },
              ]}
            >
              <Input placeholder={driverText('driverManager.forExampleTrinoDB2InHouseAnalyticsEngine')} autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="dsnTemplate"
              label={driverText('driverManager.dsnTemplateConnectionStringTemplate')}
              rules={[
                { required: true, message: driverText('driverManager.enterTheDsnTemplate') },
                { max: 4096, message: driverText('driverManager.dsnTemplatesCanBeUpTo4096Characters') },
              ]}
              help={driverText('driverManager.whenCreatingANewConnectionForThisData')}
            >
              <Input.TextArea
                rows={4}
                placeholder={driverText('driverManager.forExampleJdbcTrinoHost8080CatalogSchema')}
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item
              name="dsnHelp"
              label={driverText('driverManager.dsnInstructions')}
              rules={[{ max: 4096, message: driverText('driverManager.dsnNotesCanBeUpTo4096Characters') }]}
              help={driverText('driverManager.youCanWriteRequiredParametersCommonCatalogSchema')}
            >
              <Input.TextArea
                rows={3}
                placeholder={driverText('driverManager.forExampleReplaceHostCatalogAndSchemaWith')}
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item
              name="description"
              label={driverText('driverManager.definitionNotesOptional')}
              rules={[{ max: 1024, message: driverText('driverManager.notesCanBeUpTo1024Characters') }]}
            >
              <Input.TextArea
                rows={2}
                placeholder={driverText('driverManager.forExampleAnInternalTrinoSetupContainingOnly')}
                autoComplete="off"
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
      <Modal
        title={driverText('driverManager.driverLogTitleWithName', { name: activeLogRow?.name || logDriverType })}
        open={logModalOpen}
        onCancel={() => setLogModalOpen(false)}
        footer={[
          <Button key="close-log" type="primary" onClick={() => setLogModalOpen(false)}>
            {driverText('driverManager.close')}
          </Button>,
        ]}
        width={780}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {activeLogRow?.installDir ? (
            <Paragraph copyable={{ text: activeLogRow.installDir }} style={{ marginBottom: 0 }}>
              {driverText('driverManager.installDirectoryValue', { path: activeLogRow.installDir })}
            </Paragraph>
          ) : null}
          {activeLogRow?.executablePath ? (
            <Paragraph copyable={{ text: activeLogRow.executablePath }} style={{ marginBottom: 0 }}>
              {driverText('driverManager.driverExecutableValue', { path: activeLogRow.executablePath })}
            </Paragraph>
          ) : null}
          {activeDriverLogLines.length > 0 ? (
            <pre style={{ margin: 0, maxHeight: 360, overflow: 'auto', padding: 12, background: logBlockBackground, color: logBlockTextColor, borderRadius: 8, border: `1px solid ${logBlockBorderColor}`, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {activeDriverLogLines.join('\n')}
            </pre>
          ) : (
            <Text type="secondary">{driverText('driverManager.noOperationLogsAreAvailableForThisDriver')}</Text>
          )}
        </Space>
      </Modal>
    </Modal>
  );
};

export default DriverManagerModal;
