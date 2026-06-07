import React, { lazy, Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Layout, Button, ConfigProvider, theme, message, Modal, Spin, Slider, Switch, Input, Select, Segmented, Tooltip, Badge } from 'antd';
import type { Locale } from 'antd/es/locale';
import type { CSSProperties } from 'react';
import enUSLocale from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/zh-cn';
import { PlusOutlined, ConsoleSqlOutlined, UploadOutlined, DownloadOutlined, BugOutlined, ToolOutlined, InfoCircleOutlined, GithubOutlined, SkinOutlined, CheckOutlined, SettingOutlined, LinkOutlined, BgColorsOutlined, AppstoreOutlined, RobotOutlined, HddOutlined, MenuFoldOutlined, MenuUnfoldOutlined, TableOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { BrowserOpenURL, Environment, EventsOn, WindowFullscreen, WindowGetPosition, WindowGetSize, WindowIsFullscreen, WindowIsMaximised, WindowIsMinimised, WindowIsNormal, WindowMaximise, WindowSetPosition, WindowSetSize, WindowToggleMaximise, WindowUnfullscreen } from '@compat/runtime';
import { DEFAULT_APPEARANCE, replaceConnectionTagsFromBackend, replaceSavedQueriesFromBackend, replaceSqlLogsFromBackend, useStore } from './store';
import type { SavedConnection } from './types';
import { blurToFilter, isMacLikePlatform, normalizeBlurForPlatform, normalizeOpacityForPlatform, isWindowsPlatform, resolveAppearanceValues, resolveTextInputSafeBackdropFilter } from './utils/appearance';
import { getDataGridColumnWidthModeOptions, sanitizeDataTableColumnWidthMode } from './utils/dataGridDisplay';
import { shouldHandleMacNativeFullscreenShortcut, shouldSuppressMacNativeEscapeExit } from './utils/macWindow';
import { shouldEnableMacWindowDiagnostics } from './utils/macWindowDiagnostics';
import { resolveAboutDisplayVersion } from './utils/appVersionDisplay';
import { buildOverlayWorkbenchTheme } from './utils/overlayWorkbenchTheme';
import { getConnectionWorkbenchState } from './utils/startupReadiness';
import {
  detectConnectionImportKind,
  isConnectionPackagePasswordRequiredError,
  resolveConnectionPackageExportResult,
  normalizeConnectionPackagePassword,
} from './utils/connectionExport';
import { getWindowsScaleFixNudgedWidth, hasWindowsViewportScaleDrift } from './utils/windowsScaleFix';
import { exportSuccessMessage } from './utils/exportResultMessage';
import {
  SHORTCUT_ACTION_DESCRIPTION_KEYS,
  SHORTCUT_ACTION_LABEL_KEYS,
  SHORTCUT_ACTION_META,
  SHORTCUT_ACTION_ORDER,
  ShortcutAction,
  canRecordShortcutForAction,
  eventToShortcut,
  getShortcutDisplay,
  isEditableElement,
  isShortcutMatch,
  normalizeShortcutCombo,
} from './utils/shortcuts';
import { shouldToggleMaximisedWindowForScaleFix } from './utils/windowStateUi';
import { resolveVisibleStartupWindowBounds } from './utils/windowRestoreBounds';
import {
  SIDEBAR_UTILITY_ITEM_KEYS,
  resolveAIEntryPlacement,
  resolveAIEdgeHandleAttachment,
  resolveAIEdgeHandleDockStyle,
  resolveAIEdgeHandleStyle,
} from './utils/aiEntryLayout';
import { CheckDesktopUpdate, ExportConnectionsPackage, GetAppInfo, GetConnectionTags, GetDataRootDirectoryInfo, GetErrorLog, GetErrorLogs, GetJobs, normalizeJob, GetLanguage, GetSavedConnections, GetSavedQueries, GetSqlLogs, ImportConnectionsPayload, InstallDesktopUpdate, LogWindowDiagnostic, RestartDesktopApp, SaveConnectionTags, SaveLanguage, SaveSavedQueries, SaveSqlLogs, SetErrorLogResolved, SetMacNativeWindowControls, SetWindowTranslucency, type ErrorLogPayload } from '@compat/javanaviApp';
import { DEFAULT_LANGUAGE, appLanguageOptions, currentHtmlLangValue, currentLanguageHeaderValue, installCompatibilityI18nFallback, setRuntimeLanguage, translate, type I18nKey } from './i18n';
import './App.css';

const ConnectionModal = lazy(() => import('./components/ConnectionModal'));
const ConnectionPackagePasswordModal = lazy(() => import('./components/ConnectionPackagePasswordModal'));
const DataSyncModal = lazy(() => import('./components/DataSyncModal'));
const DriverManagerModal = lazy(() => import('./components/DriverManagerModal'));
const LogPanel = lazy(() => import('./components/LogPanel'));
const AIChatPanel = lazy(() => import('./components/AIChatPanel'));
const AISettingsModal = lazy(() => import('./components/AISettingsModal'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const TabManager = lazy(() => import('./components/TabManager'));
const TaskCenterModal = lazy(() => import('./components/TaskCenterModal'));

const { Sider, Content } = Layout;
const MIN_UI_SCALE = 0.8;
const MAX_UI_SCALE = 1.25;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;
const DEFAULT_UI_SCALE = 1.0;
const DEFAULT_FONT_SIZE = 14;

const detectNavigatorPlatform = (): string => {
  if (typeof navigator === 'undefined') {
      return '';
  }
  const uaDataPlatform = (navigator as Navigator & {
      userAgentData?: { platform?: string };
  }).userAgentData?.platform;
  if (uaDataPlatform) {
      return uaDataPlatform;
  }
  return navigator.userAgent || '';
};


const mergeSavedConnections = (current: SavedConnection[], imported: SavedConnection[]): SavedConnection[] => {
  const merged = new Map<string, SavedConnection>();
  current.forEach((conn) => merged.set(conn.id, conn));
  imported.forEach((conn) => merged.set(conn.id, conn));
  return Array.from(merged.values());
};

type DesktopUpdateInfo = {
  available: boolean;
  currentVersion?: string;
  version?: string;
  body?: string;
  date?: string;
};

type AppInfo = {
  version: string;
  author: string;
  buildTime?: string;
  repoUrl?: string;
  communityUrl?: string;
  communityName?: string;
  communityGroupNumber?: string;
};

type LanguagePayload = {
  language?: string;
};

type DataRootInfo = {
  path?: string;
  defaultPath?: string;
  driverPath?: string;
  bootstrapPath?: string;
};

type DraggableResizeHandleStyle = CSSProperties & {
  WebkitAppRegion: 'drag';
  '--wails-draggable': 'drag';
};

const getErrorMessage = (error: unknown, fallback = ''): string => (
  error instanceof Error ? error.message : String(error || fallback)
);

type ConnectionPackageDialogMode = 'import' | 'export';

type ConnectionPackageDialogState = {
  open: boolean;
  mode: ConnectionPackageDialogMode;
  includeSecrets: boolean;
  useFilePassword: boolean;
  password: string;
  error: string;
  confirmLoading: boolean;
};

const createClosedConnectionPackageDialogState = (): ConnectionPackageDialogState => ({
  open: false,
  mode: 'export',
  includeSecrets: true,
  useFilePassword: false,
  password: '',
  error: '',
  confirmLoading: false,
});

function App() {
  const [antdLocale, setAntdLocale] = useState<Locale | undefined>(enUSLocale);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncModalDomain, setSyncModalDomain] = useState<'data' | 'schema'>('data');
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isTaskCenterOpen, setIsTaskCenterOpen] = useState(false);
  const [runningJobCount, setRunningJobCount] = useState(0);
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
  const windowState = useStore(state => state.windowState);
  const themeMode = useStore(state => state.theme);
  const language = useStore(state => state.language);
  const setLanguage = useStore(state => state.setLanguage);
  const t = useCallback((key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
  const setTheme = useStore(state => state.setTheme);
  const appearance = useStore(state => state.appearance);
  const setAppearance = useStore(state => state.setAppearance);
  const uiScale = useStore(state => state.uiScale);
  const setUiScale = useStore(state => state.setUiScale);
  const fontSize = useStore(state => state.fontSize);
  const setFontSize = useStore(state => state.setFontSize);
  const startupFullscreen = useStore(state => state.startupFullscreen);
  const setStartupFullscreen = useStore(state => state.setStartupFullscreen);
  const replaceConnections = useStore(state => state.replaceConnections);
  const shortcutOptions = useStore(state => state.shortcutOptions);
  const updateShortcut = useStore(state => state.updateShortcut);
  const resetShortcutOptions = useStore(state => state.resetShortcutOptions);
  const darkMode = themeMode === 'dark';
  const effectiveUiScale = Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Number(uiScale) || DEFAULT_UI_SCALE));
  const effectiveFontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(Number(fontSize) || DEFAULT_FONT_SIZE)));
  const tokenFontSize = Math.round(effectiveFontSize * effectiveUiScale);
  const tokenFontSizeSM = Math.max(10, Math.round(tokenFontSize * 0.86));
  const tokenFontSizeLG = Math.max(tokenFontSize + 1, Math.round(tokenFontSize * 1.14));
  const tokenControlHeight = Math.max(24, Math.round(32 * effectiveUiScale));
  const tokenControlHeightSM = Math.max(20, Math.round(24 * effectiveUiScale));
  const tokenControlHeightLG = Math.max(30, Math.round(40 * effectiveUiScale));
  const appComponentSize: 'small' | 'middle' | 'large' = effectiveUiScale <= 0.92 ? 'small' : (effectiveUiScale >= 1.12 ? 'large' : 'middle');
  const floatingLogButtonHeight = Math.max(30, Math.round(34 * effectiveUiScale));
  const resolvedAppearance = resolveAppearanceValues(appearance);
  const effectiveOpacity = normalizeOpacityForPlatform(resolvedAppearance.opacity);
  const effectiveBlur = normalizeBlurForPlatform(resolvedAppearance.blur);
  const blurFilter = blurToFilter(effectiveBlur);
  const [runtimePlatform, setRuntimePlatform] = useState('');
  const [runtimeBuildType, setRuntimeBuildType] = useState('');
  const [isLinuxRuntime, setIsLinuxRuntime] = useState(false);
  const [isStoreHydrated, setIsStoreHydrated] = useState(() => useStore.persist.hasHydrated());
  const [hasLoadedInitialConfig, setHasLoadedInitialConfig] = useState(false);
  const [focusedAIProviderId, setFocusedAIProviderId] = useState<string | undefined>(undefined);
  const [connectionPackageDialog, setConnectionPackageDialog] = useState<ConnectionPackageDialogState>(() => createClosedConnectionPackageDialogState());
  const [pendingConnectionImportPayload, setPendingConnectionImportPayload] = useState<string | null>(null);
  const connectionImportFileInputRef = useRef<HTMLInputElement | null>(null);
  const taskJobStatusRef = useRef<Map<string, string>>(new Map());
  const sidebarWidth = useStore(state => state.sidebarWidth);
  const setSidebarWidth = useStore(state => state.setSidebarWidth);
  const aiPanelVisible = useStore(state => state.aiPanelVisible);
  const toggleAIPanel = useStore(state => state.toggleAIPanel);
  const setAIPanelVisible = useStore(state => state.setAIPanelVisible);
  const windowDiagSequenceRef = React.useRef(0);
  const windowDiagLastSignatureRef = React.useRef('');
  const windowDiagLastAtRef = React.useRef(0);
  const connectionWorkbenchState = getConnectionWorkbenchState(isStoreHydrated, hasLoadedInitialConfig);

  const windowCornerRadius = 14;
  useEffect(() => {
    installCompatibilityI18nFallback();
  }, []);

  useEffect(() => {
      let cancelled = false;
      const updateRunningCount = () => {
          setRunningJobCount(Array.from(taskJobStatusRef.current.values()).filter((status) => status === 'running').length);
      };
      GetJobs(100)
          .then((jobs) => {
              if (!cancelled) {
                  taskJobStatusRef.current = new Map(jobs.map((job) => [job.jobId, job.status]));
                  updateRunningCount();
              }
          })
          .catch(() => undefined);
      const unsubscribeJobProgress = EventsOn<[unknown]>('job:progress', (payload) => {
          const job = normalizeJob(payload);
          if (!job.jobId) return;
          taskJobStatusRef.current.set(job.jobId, job.status);
          updateRunningCount();
      });
      const handleOpenTaskCenter = () => setIsTaskCenterOpen(true);
      window.addEventListener('javanavi:open-task-center', handleOpenTaskCenter as EventListener);
      return () => {
          cancelled = true;
          unsubscribeJobProgress();
          window.removeEventListener('javanavi:open-task-center', handleOpenTaskCenter as EventListener);
      };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (language === 'zh') {
      dayjs.locale('zh-cn');
      void import('antd/locale/zh_CN')
        .then((module) => {
          if (mounted) {
            setAntdLocale(module.default);
          }
        })
        .catch((error) => {
          console.warn('Failed to load Ant Design zh_CN locale; falling back to English.', error);
          if (mounted) setAntdLocale(enUSLocale);
        });
    } else {
      dayjs.locale('en');
      setAntdLocale(enUSLocale);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentHtmlLangValue(language);
    }
    setRuntimeLanguage(language);
    return () => {
      mounted = false;
    };
  }, [language]);

  useEffect(()=>{
    if (typeof document === 'undefined' || !document.body) {
        return;
    }
    switch(windowState){
        case 'fullscreen':
        case 'maximized':
            document.body.style.setProperty('--javanavi-border-radius', '0px');
            break;
        default:
            document.body.style.setProperty('--javanavi-border-radius', `${windowCornerRadius}px`);
            break;
    }
  }, [windowState]);

  // 同步 macOS 窗口透明度：opacity=1.0 且 blur=0 时关闭 NSVisualEffectView，
  // 避免 GPU 持续计算窗口背后的模糊合成
  useEffect(() => {
    try {
        void SetWindowTranslucency(resolvedAppearance.opacity, resolvedAppearance.blur).catch(() => undefined);
    } catch(e) { /* ignore */ }
  }, [resolvedAppearance.blur, resolvedAppearance.opacity]);

  useEffect(() => {
      let cancelled = false;
      try {
          Environment()
              .then((env) => {
                  if (cancelled) return;
                  const platform = String(env?.platform || '').toLowerCase();
                  setRuntimePlatform(platform);
                  setRuntimeBuildType(String(env?.buildType || '').toLowerCase());
                  setIsLinuxRuntime(platform === 'linux');
              })
              .catch(() => {
                  if (cancelled) return;
                  const platform = detectNavigatorPlatform();
                  const normalized = /linux/i.test(platform)
                      ? 'linux'
                      : (/mac/i.test(platform) ? 'darwin' : (/win/i.test(platform) ? 'windows' : ''));
                  setRuntimePlatform(normalized);
                  setIsLinuxRuntime(normalized === 'linux');
              });
      } catch(e) {
          if (cancelled) return;
          const platform = detectNavigatorPlatform();
          const normalized = /linux/i.test(platform)
              ? 'linux'
              : (/mac/i.test(platform) ? 'darwin' : (/win/i.test(platform) ? 'windows' : ''));
          setRuntimePlatform(normalized);
          setIsLinuxRuntime(normalized === 'linux');
      }
      return () => {
          cancelled = true;
      };
  }, []);

  useEffect(() => {
      if (isStoreHydrated) {
          return;
      }
      const unsubscribe = useStore.persist.onFinishHydration(() => {
          setIsStoreHydrated(true);
      });
      return () => {
          unsubscribe();
      };
  }, [isStoreHydrated]);

  useEffect(() => {
      if (!isStoreHydrated) {
          return;
      }

      let cancelled = false;
      const loadInitialConfig = async () => {
          try {
              const latestConnections = await GetSavedConnections();
              if (!cancelled && Array.isArray(latestConnections)) {
                  replaceConnections(latestConnections as SavedConnection[]);
              }
          } catch (err) {
              console.warn('Failed to load saved connections', err);
          }

          try {
              const latestConnectionTags = await GetConnectionTags();
              if (!cancelled && Array.isArray(latestConnectionTags)) {
                  if (latestConnectionTags.length > 0) {
                      replaceConnectionTagsFromBackend(latestConnectionTags);
                  } else {
                      const localConnectionTags = useStore.getState().connectionTags;
                      if (localConnectionTags.length > 0) {
                          await SaveConnectionTags(localConnectionTags);
                      } else {
                          replaceConnectionTagsFromBackend([]);
                      }
                  }
              }
          } catch (err) {
              console.warn('Failed to load connection groups', err);
          }

          try {
              const latestSavedQueries = await GetSavedQueries();
              if (!cancelled && Array.isArray(latestSavedQueries)) {
                  if (latestSavedQueries.length > 0) {
                      replaceSavedQueriesFromBackend(latestSavedQueries);
                  } else {
                      const localSavedQueries = useStore.getState().savedQueries;
                      if (localSavedQueries.length > 0) {
                          await SaveSavedQueries(localSavedQueries);
                      } else {
                          replaceSavedQueriesFromBackend([]);
                      }
                  }
              }
          } catch (err) {
              console.warn('Failed to load saved queries', err);
          }

          try {
              const latestSqlLogs = await GetSqlLogs();
              if (!cancelled && Array.isArray(latestSqlLogs)) {
                  if (latestSqlLogs.length > 0) {
                      replaceSqlLogsFromBackend(latestSqlLogs);
                  } else {
                      const localSqlLogs = useStore.getState().sqlLogs;
                      if (localSqlLogs.length > 0) {
                          await SaveSqlLogs(localSqlLogs);
                          replaceSqlLogsFromBackend(localSqlLogs);
                      } else {
                          replaceSqlLogsFromBackend([]);
                      }
                  }
              }
          } catch (err) {
              console.warn('Failed to load SQL logs', err);
          }


          try {
              const languageResult = await GetLanguage();
              const languagePayload = languageResult.data as LanguagePayload | undefined;
              if (!cancelled && languageResult?.success && languagePayload?.language) {
                  const nextLanguage = languagePayload.language === 'zh' ? 'zh' : 'en';
                  const currentLanguage = useStore.getState().language;
                  if (currentLanguage !== nextLanguage) {
                      useStore.getState().setLanguage(nextLanguage);
                  }
              }
          } catch (err) {
              console.warn('Failed to load language config', err);
          } finally {
              if (!cancelled) {
                  setHasLoadedInitialConfig(true);
              }
          }
      };

      void loadInitialConfig();
      return () => {
          cancelled = true;
      };
  }, [isStoreHydrated, replaceConnections]);

  useEffect(() => {
      let cancelled = false;
      let startupWindowTimer: number | null = null;
      const maxApplyAttempts = 6;
      const applyRetryDelayMs = 400;
      const settleDelayMs = 160;
      const useMaximiseForStartup = isWindowsPlatform();

      const checkStartupPreferenceApplied = async (): Promise<boolean> => {
          try {
              if (await WindowIsFullscreen()) {
                  return true;
              }
          } catch (_) {
              // ignore
          }
          try {
              if (await WindowIsMaximised()) {
                  return true;
              }
          } catch (_) {
              // ignore
          }
          return false;
      };

      const applyStartupWindowPreference = (attempt: number) => {
          if (startupWindowTimer !== null) {
              window.clearTimeout(startupWindowTimer);
          }
          startupWindowTimer = window.setTimeout(() => {
              if (cancelled) {
                  return;
              }
              if (!useStore.getState().startupFullscreen) {
                  return;
              }
              void Promise.resolve()
                  .then(async () => {
                      if (await checkStartupPreferenceApplied()) {
                          return;
                      }
                      // Windows 使用最大化，避免进入真正全屏后无法通过标题栏交互退出。
                      // 其他平台保持全屏优先、最大化兜底。
                      try {
                          if (useMaximiseForStartup) {
                              await WindowMaximise();
                              await new Promise((resolve) => window.setTimeout(resolve, settleDelayMs));
                          } else {
                              await WindowFullscreen();
                              await new Promise((resolve) => window.setTimeout(resolve, settleDelayMs));
                              if (await checkStartupPreferenceApplied()) {
                                  return;
                              }
                              await WindowMaximise();
                              await new Promise((resolve) => window.setTimeout(resolve, settleDelayMs));
                          }
                      } catch (e) {
                          console.warn("Wails Window APIs unavailable", e);
                      }

                      if (await checkStartupPreferenceApplied()) {
                          return;
                      }
                      if (attempt < maxApplyAttempts) {
                          applyStartupWindowPreference(attempt + 1);
                      }
                  });
          }, applyRetryDelayMs);
      };

      const restoreWindowState = async () => {
          if (cancelled) return;
          const state = useStore.getState();
          // startupFullscreen 设置优先
          if (state.startupFullscreen) {
              applyStartupWindowPreference(1);
              return;
          }
          // 根据上次保存的窗口状态恢复
          const savedState = state.windowState;
          if (savedState === 'fullscreen') {
              applyStartupWindowPreference(1);
              return;
          }
          if (savedState === 'maximized') {
              try { await WindowMaximise(); } catch (_) {}
              return;
          }
          // 普通窗口：恢复尺寸和位置
          const bounds = state.windowBounds;
          if (!bounds || bounds.width < 400 || bounds.height < 300) return;
          try {
              const nextBounds = resolveVisibleStartupWindowBounds(bounds, {
                  availWidth: window.screen?.availWidth || 0,
                  availHeight: window.screen?.availHeight || 0,
                  availLeft: (window.screen as Screen & { availLeft?: number })?.availLeft || 0,
                  availTop: (window.screen as Screen & { availTop?: number })?.availTop || 0,
              });
              if (
                  nextBounds.x !== bounds.x ||
                  nextBounds.y !== bounds.y ||
                  nextBounds.width !== bounds.width ||
                  nextBounds.height !== bounds.height
              ) {
                  void emitWindowDiagnostic('adjust:startup-window-bounds', {
                      from: bounds,
                      to: nextBounds,
                  });
                  state.setWindowBounds(nextBounds);
              }
              WindowSetSize(nextBounds.width, nextBounds.height);
              WindowSetPosition(nextBounds.x, nextBounds.y);
          } catch (e) {
              console.warn('Failed to restore window bounds', e);
          }
      };

      if (useStore.persist.hasHydrated()) {
          void restoreWindowState();
      }
      const unsubscribeHydration = useStore.persist.onFinishHydration(() => {
          if (cancelled) {
              return;
          }
          void restoreWindowState();
      });

      return () => {
          cancelled = true;
          if (startupWindowTimer !== null) {
              window.clearTimeout(startupWindowTimer);
          }
          unsubscribeHydration();
      };
  }, []);

  // 定时保存窗口状态、尺寸与位置
  useEffect(() => {
      const SAVE_INTERVAL_MS = 2000;
      let lastSaved = '';

      const saveWindowState = async () => {
          try {
              const [isFs, isMax] = await Promise.all([
                  WindowIsFullscreen().catch(() => false),
                  WindowIsMaximised().catch(() => false),
              ]);

              // 保存窗口状态
              const store = useStore.getState();
              const newState = isFs ? 'fullscreen' : (isMax ? 'maximized' : 'normal');
              if (store.windowState !== newState) {
                  void emitWindowDiagnostic('transition:windowState', {
                      from: store.windowState,
                      to: newState,
                  });
                  store.setWindowState(newState);
              }

              // 只在普通窗口模式下保存尺寸和位置
              if (isFs || isMax) return;

              const [size, pos] = await Promise.all([
                  WindowGetSize().catch(() => null),
                  WindowGetPosition().catch(() => null),
              ]);
              if (!size || !pos) return;
              const w = Math.trunc(Number(size.w || 0));
              const h = Math.trunc(Number(size.h || 0));
              const x = Math.trunc(Number(pos.x || 0));
              const y = Math.trunc(Number(pos.y || 0));
               if (w < 400 || h < 300) return;

               const key = `${w},${h},${x},${y}`;
               if (key === lastSaved) return;
               lastSaved = key;
               if (Math.abs(x) > 5000 || Math.abs(y) > 5000) {
                   void emitWindowDiagnostic('anomaly:windowBounds', { width: w, height: h, x, y });
               }
               store.setWindowBounds({ width: w, height: h, x, y });
            } catch (e) {
                // 静默忽略
            }
      };

      const timer = window.setInterval(saveWindowState, SAVE_INTERVAL_MS);
      return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
      if (!isWindowsPlatform()) {
          return;
      }

      let cancelled = false;
      let inFlight = false;
      let lastRatio = Number(window.devicePixelRatio) || 1;
      let lastFixAt = 0;
      let activationTimer: number | null = null;

      const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

      const fixWindowScaleIfNeeded = async (reason: 'activation' | 'ratio-change') => {
          if (cancelled || inFlight) return;
          const now = Date.now();
          if (now - lastFixAt < 700) return;
          inFlight = true;
          try {
              const [isFullscreen, isMaximised] = await Promise.all([
                  WindowIsFullscreen().catch(() => false),
                  WindowIsMaximised().catch(() => false),
              ]);

              // 全屏状态下只广播 resize，避免破坏用户的全屏上下文。
              if (isFullscreen) {
                  window.dispatchEvent(new Event('resize'));
                  lastFixAt = Date.now();
                  return;
              }

              const size = await WindowGetSize().catch(() => null);
              const width = Math.trunc(Number(size?.w || 0));
              const height = Math.trunc(Number(size?.h || 0));
              const hasViewportScaleDrift = hasWindowsViewportScaleDrift({
                  windowWidth: width,
                  innerWidth: window.innerWidth,
                  devicePixelRatio: Number(window.devicePixelRatio) || 1,
                  visualViewportScale: window.visualViewport?.scale,
              });

              if (isMaximised) {
                  if (!shouldToggleMaximisedWindowForScaleFix(reason, hasViewportScaleDrift)) {
                      window.dispatchEvent(new Event('resize'));
                      lastFixAt = Date.now();
                      return;
                  }

                  try {
                      WindowToggleMaximise();
                      await wait(48);
                      WindowToggleMaximise();
                      await wait(64);
                  } catch (e) {
                      console.warn("Wails Window maximise toggle unavailable in fixWindowScaleIfNeeded", e);
                  }
                  window.dispatchEvent(new Event('resize'));
                  lastFixAt = Date.now();
                  return;
              }

              if (width <= 0 || height <= 0) {
                  window.dispatchEvent(new Event('resize'));
                  lastFixAt = Date.now();
                  return;
              }

              if (reason !== 'ratio-change' && !hasViewportScaleDrift) {
                  window.dispatchEvent(new Event('resize'));
                  lastFixAt = Date.now();
                  return;
              }

              const nudgedWidth = getWindowsScaleFixNudgedWidth(width);
              try {
                  WindowSetSize(nudgedWidth, height);
                  await wait(28);
                  WindowSetSize(width, height);
              } catch(e) {}
              window.dispatchEvent(new Event('resize'));
              lastFixAt = Date.now();
          } catch(e) {
              console.warn("Wails Window APIs unavailable in fixWindowScaleIfNeeded", e);
          } finally {
              inFlight = false;
          }
      };

      const checkDevicePixelRatio = () => {
          if (cancelled) return;
          const currentRatio = Number(window.devicePixelRatio) || 1;
          if (Math.abs(currentRatio - lastRatio) < 0.02) {
              return;
          }
          lastRatio = currentRatio;
          void fixWindowScaleIfNeeded('ratio-change');
      };

      const scheduleActivationFix = () => {
          if (cancelled) return;
          if (activationTimer !== null) {
              window.clearTimeout(activationTimer);
          }
          activationTimer = window.setTimeout(() => {
              activationTimer = null;
              if (cancelled) return;
              void fixWindowScaleIfNeeded('activation');
          }, 80);
      };

      const handleWindowFocus = () => {
          if (cancelled) return;
          checkDevicePixelRatio();
          scheduleActivationFix();
      };

      const handleVisibilityChange = () => {
          if (cancelled) return;
          if (document.visibilityState !== 'visible') {
              return;
          }
          checkDevicePixelRatio();
          scheduleActivationFix();
      };

      const handlePageShow = () => {
          if (cancelled) return;
          checkDevicePixelRatio();
          scheduleActivationFix();
      };

      const pollTimer = window.setInterval(checkDevicePixelRatio, 900);
      window.addEventListener('resize', checkDevicePixelRatio);
      window.addEventListener('focus', handleWindowFocus);
      window.addEventListener('pageshow', handlePageShow);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
          cancelled = true;
          if (activationTimer !== null) {
              window.clearTimeout(activationTimer);
          }
          window.clearInterval(pollTimer);
          window.removeEventListener('resize', checkDevicePixelRatio);
          window.removeEventListener('focus', handleWindowFocus);
          window.removeEventListener('pageshow', handlePageShow);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
  }, []);

  // Background Helper
  const getBg = (darkHex: string) => {
      if (!darkMode) return `rgba(255, 255, 255, ${effectiveOpacity})`; // Light mode usually white

      // Parse hex to rgb
      const hex = darkHex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${effectiveOpacity})`;
  };
  // Specific colors
  const bgMain = getBg('#141414');
  const bgContent = getBg('#1d1d1d');
  const floatingLogButtonBorderColor = darkMode ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';
  const floatingLogButtonTextColor = darkMode ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.82)';
  const floatingLogButtonBgColor = darkMode
      ? `rgba(34, 34, 34, ${Math.max(effectiveOpacity, 0.82)})`
      : `rgba(255, 255, 255, ${Math.max(effectiveOpacity, 0.9)})`;
  const floatingLogButtonShadow = darkMode
      ? '0 8px 22px rgba(0,0,0,0.38)'
      : '0 8px 20px rgba(0,0,0,0.16)';
  const isOpaqueUtilityMode = resolvedAppearance.opacity >= 0.999 && resolvedAppearance.blur <= 0;
  const utilityButtonBgAlpha = darkMode
      ? Math.max(0.28, Math.min(0.76, effectiveOpacity * 0.72))
      : Math.max(0.52, Math.min(0.92, effectiveOpacity * 0.9));
  const utilityButtonBgColor = isOpaqueUtilityMode
      ? 'transparent'
      : (darkMode
          ? `rgba(20, 26, 38, ${utilityButtonBgAlpha})`
          : `rgba(255, 255, 255, ${utilityButtonBgAlpha})`);
  const utilityButtonBorderColor = isOpaqueUtilityMode
      ? (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(16,24,40,0.10)')
      : (darkMode
          ? `rgba(255,255,255,${Math.max(0.08, Math.min(0.18, effectiveOpacity * 0.16))})`
          : `rgba(16,24,40,${Math.max(0.06, Math.min(0.14, effectiveOpacity * 0.12))})`);
  const utilityButtonShadow = isOpaqueUtilityMode
      ? 'none'
      : (darkMode
          ? `0 8px 18px rgba(0,0,0,${Math.max(0.10, Math.min(0.22, effectiveOpacity * 0.24))})`
          : `0 8px 18px rgba(15,23,42,${Math.max(0.04, Math.min(0.12, effectiveOpacity * 0.12))})`);
  const isSidebarNarrow = sidebarWidth < 360;
  const isSidebarCompact = sidebarWidth < 320;
  const isSidebarUltraCompact = sidebarWidth < 260;
  const utilityButtonStyle = useMemo(() => ({
      height: Math.max(30, Math.round(32 * effectiveUiScale)),
      width: '100%',
      paddingInline: isSidebarCompact ? Math.max(8, Math.round(9 * effectiveUiScale)) : Math.max(10, Math.round(12 * effectiveUiScale)),
      borderRadius: 10,
      border: `1px solid ${utilityButtonBorderColor}`,
      background: utilityButtonBgColor,
      color: darkMode ? 'rgba(255,255,255,0.94)' : '#162033',
      boxShadow: utilityButtonShadow,
      backdropFilter: isOpaqueUtilityMode ? 'none' : blurFilter,
      WebkitBackdropFilter: isOpaqueUtilityMode ? 'none' : blurFilter,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: isSidebarCompact ? 4 : 6,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontSize: isSidebarCompact ? 13 : 14,
  }), [blurFilter, darkMode, effectiveUiScale, isOpaqueUtilityMode, isSidebarCompact, utilityButtonBgColor, utilityButtonBorderColor, utilityButtonShadow]);
  const disableLocalBackdropFilter = isMacLikePlatform();
  const textInputSafeBackdropFilter = resolveTextInputSafeBackdropFilter(blurFilter, disableLocalBackdropFilter);
  const overlayTheme = useMemo(
      () => buildOverlayWorkbenchTheme(darkMode, { disableBackdropFilter: disableLocalBackdropFilter }),
      [darkMode, disableLocalBackdropFilter],
  );

  const sidebarQuickActionBaseStyle = useMemo(() => ({
      height: Math.max(34, Math.round(36 * effectiveUiScale)),
      borderRadius: 12,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingInline: Math.max(12, Math.round(14 * effectiveUiScale)),
      fontWeight: 700,
      boxShadow: darkMode ? '0 8px 18px rgba(0,0,0,0.16)' : '0 8px 16px rgba(15,23,42,0.08)',
      backdropFilter: blurFilter,
      WebkitBackdropFilter: blurFilter,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }), [blurFilter, darkMode, effectiveUiScale]);
  const sidebarQueryActionStyle = useMemo(() => ({
      ...sidebarQuickActionBaseStyle,
      flex: '1 1 0',
      border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(16,24,40,0.10)'}`,
      background: darkMode ? `rgba(255,255,255,0.05)` : 'rgba(255,255,255,0.88)',
      color: darkMode ? 'rgba(255,255,255,0.92)' : '#162033',
    }), [darkMode, sidebarQuickActionBaseStyle]);
  const sidebarCreateConnectionActionStyle = useMemo(() => ({
      ...sidebarQuickActionBaseStyle,
      flex: '1 1 0',
      border: 'none',
      background: 'linear-gradient(135deg, rgba(34,197,94,0.96) 0%, rgba(22,163,74,0.92) 100%)',
      color: '#f3fff7',
    }), [sidebarQuickActionBaseStyle]);

  const utilityModalShellStyle = useMemo(() => ({
      background: overlayTheme.shellBg,
      border: overlayTheme.shellBorder,
      boxShadow: overlayTheme.shellShadow,
      backdropFilter: overlayTheme.shellBackdropFilter,
  }), [overlayTheme]);
  const utilityPanelStyle = useMemo(() => ({
      padding: 16,
      borderRadius: 14,
      border: overlayTheme.sectionBorder,
      background: overlayTheme.sectionBg,
  }), [overlayTheme]);
  const utilityMutedTextStyle = useMemo(() => ({
      color: overlayTheme.mutedText,
      fontSize: 12,
      lineHeight: 1.6,
  }), [overlayTheme]);
  const renderUtilityModalTitle = (icon: React.ReactNode, title: string, description: string) => (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: overlayTheme.iconBg, color: overlayTheme.iconColor, flexShrink: 0 }}>
              {icon}
          </div>
          <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>{title}</div>
              <div style={{ marginTop: 4, color: overlayTheme.mutedText, fontSize: 12, lineHeight: 1.6 }}>{description}</div>
          </div>
      </div>
  );
  const utilityActionCardStyle = useMemo(() => ({
      width: '100%',
      minHeight: 68,
      borderRadius: 14,
      border: overlayTheme.sectionBorder,
      background: overlayTheme.sectionBg,
      color: overlayTheme.titleText,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 14,
      paddingInline: 16,
      boxShadow: 'none',
      fontSize: 15,
      fontWeight: 600,
  }), [overlayTheme]);
  const utilityActionHintStyle = useMemo(() => ({
      fontSize: 12,
      color: overlayTheme.mutedText,
      fontWeight: 400,
      marginTop: 2,
  }), [overlayTheme]);

  const sidebarHorizontalPadding = isSidebarCompact ? 8 : 10;

  const addTab = useStore(state => state.addTab);
  const activeContext = useStore(state => state.activeContext);
  const connections = useStore(state => state.connections);
  const tabs = useStore(state => state.tabs);
  const activeTabId = useStore(state => state.activeTabId);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const isAboutOpenRef = React.useRef(false);
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<{ version: string; author: string; buildTime?: string; repoUrl?: string; communityUrl?: string; communityName?: string; communityGroupNumber?: string } | null>(null);
  const [desktopUpdateInfo, setDesktopUpdateInfo] = useState<DesktopUpdateInfo | null>(null);
  const [desktopUpdateChecking, setDesktopUpdateChecking] = useState(false);
  const [desktopUpdateInstalling, setDesktopUpdateInstalling] = useState(false);
  const [desktopUpdateInstalled, setDesktopUpdateInstalled] = useState(false);
  const aboutDisplayVersion = resolveAboutDisplayVersion(runtimeBuildType, aboutInfo?.version);

  const isMacRuntime = runtimePlatform === 'darwin'
      || (runtimePlatform === '' && /mac/i.test(detectNavigatorPlatform()));
  const isWindowsRuntime = runtimePlatform === 'windows'
      || (runtimePlatform === '' && isWindowsPlatform());
  const useNativeMacWindowControls = isMacRuntime && appearance.useNativeMacWindowControls === true;
  const macWindowDiagnosticsEnabled = shouldEnableMacWindowDiagnostics(
      isMacRuntime,
      import.meta.env.DEV,
      import.meta.env.VITE_JAVANAVI_ENABLE_MAC_WINDOW_DIAGNOSTICS,
  );

  const emitWindowDiagnostic = useCallback(async (stage: string, extra: Record<string, unknown> = {}) => {
      if (!macWindowDiagnosticsEnabled) {
          return;
      }
      try {
          const [isFullscreen, isMaximised, isMinimised, isNormal, size, position] = await Promise.all([
              WindowIsFullscreen().catch(() => false),
              WindowIsMaximised().catch(() => false),
              WindowIsMinimised().catch(() => false),
              WindowIsNormal().catch(() => false),
              WindowGetSize().catch(() => null),
              WindowGetPosition().catch(() => null),
          ]);
          const payload = {
              seq: ++windowDiagSequenceRef.current,
              ts: new Date().toISOString(),
              stage,
              nativeControls: useNativeMacWindowControls,
              documentVisible: document.visibilityState,
              documentHasFocus: document.hasFocus(),
              devicePixelRatio: Number(window.devicePixelRatio) || 1,
              windowState: {
                  isFullscreen,
                  isMaximised,
                  isMinimised,
                  isNormal,
              },
              size: size ? { w: Math.trunc(Number(size.w || 0)), h: Math.trunc(Number(size.h || 0)) } : null,
              position: position ? { x: Math.trunc(Number(position.x || 0)), y: Math.trunc(Number(position.y || 0)) } : null,
              extra,
          };
          const signature = JSON.stringify({
              stage,
              nativeControls: payload.nativeControls,
              visible: payload.documentVisible,
              focus: payload.documentHasFocus,
              state: payload.windowState,
              size: payload.size,
              position: payload.position,
              extra,
          });
          const now = Date.now();
          if (signature === windowDiagLastSignatureRef.current && now-windowDiagLastAtRef.current < 250) {
              return;
          }
          windowDiagLastSignatureRef.current = signature;
          windowDiagLastAtRef.current = now;
          await LogWindowDiagnostic(stage, JSON.stringify(payload));
      } catch (error) {
          console.warn('Failed to emit window diagnostic', error);
      }
  }, [macWindowDiagnosticsEnabled, useNativeMacWindowControls]);

  useEffect(() => {
      if (!isStoreHydrated || !isMacRuntime) {
          return;
      }

      try {
          void SetMacNativeWindowControls(useNativeMacWindowControls).catch(() => undefined);
      } catch (e) {
          console.warn('Wails API: SetMacNativeWindowControls unavailable', e);
      }
  }, [isMacRuntime, isStoreHydrated, useNativeMacWindowControls]);

  useEffect(() => {
      if (!macWindowDiagnosticsEnabled) {
          return;
      }

      let cancelled = false;
      let pollTimer: number | null = null;
      let burstTimer: number | null = null;

      const stopBurst = () => {
          if (pollTimer !== null) {
              window.clearInterval(pollTimer);
              pollTimer = null;
          }
          if (burstTimer !== null) {
              window.clearTimeout(burstTimer);
              burstTimer = null;
          }
      };

      const startBurst = (reason: string, extra: Record<string, unknown> = {}) => {
          if (cancelled) {
              return;
          }
          void emitWindowDiagnostic(`burst:start:${reason}`, extra);
          if (pollTimer === null) {
              pollTimer = window.setInterval(() => {
                  void emitWindowDiagnostic(`burst:tick:${reason}`);
              }, 250);
          }
          if (burstTimer !== null) {
              window.clearTimeout(burstTimer);
          }
          burstTimer = window.setTimeout(() => {
              stopBurst();
              void emitWindowDiagnostic(`burst:stop:${reason}`);
          }, 6000);
      };

      const handleFocus = () => {
          void emitWindowDiagnostic('event:focus');
      };
      const handleBlur = () => {
          void emitWindowDiagnostic('event:blur');
      };
      const handleResize = () => {
          void emitWindowDiagnostic('event:resize');
      };
      const handleVisibilityChange = () => {
          void emitWindowDiagnostic('event:visibilitychange', { visibility: document.visibilityState });
      };
      const handleEditableKeydown = (event: KeyboardEvent) => {
          if (!isEditableElement(event.target)) {
              return;
          }
          const key = String(event.key || '');
          const maybeFullscreenKey = key === 'Escape' || key.toLowerCase() === 'f' || key === 'Process';
          const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
          startBurst('editable-keydown', {
              key,
              code: String(event.code || ''),
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              maybeFullscreenKey,
              hasModifier,
          });
      };
      const handleCompositionStart = () => {
          startBurst('compositionstart');
      };
      const handleCompositionEnd = () => {
          startBurst('compositionend');
      };

      void emitWindowDiagnostic('session:start');
      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleBlur);
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleEditableKeydown, true);
      window.addEventListener('compositionstart', handleCompositionStart, true);
      window.addEventListener('compositionend', handleCompositionEnd, true);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
          cancelled = true;
          stopBurst();
          window.removeEventListener('focus', handleFocus);
          window.removeEventListener('blur', handleBlur);
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('keydown', handleEditableKeydown, true);
          window.removeEventListener('compositionstart', handleCompositionStart, true);
          window.removeEventListener('compositionend', handleCompositionEnd, true);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
  }, [emitWindowDiagnostic, macWindowDiagnosticsEnabled]);

  const loadAboutInfo = React.useCallback(async () => {
      setAboutLoading(true);
      const res = await GetAppInfo();
      if (res?.success) {
          setAboutInfo(res.data as AppInfo);
      } else {
          void message.error(t('message.appInfoFailed', { message: res?.message || t('message.unknownError') }));
      }
      setAboutLoading(false);
  }, [t]);

  const checkDesktopUpdate = React.useCallback(async () => {
      setDesktopUpdateChecking(true);
      setDesktopUpdateInstalled(false);
      const res = await CheckDesktopUpdate();
      if (res?.success) {
          const data = res.data as DesktopUpdateInfo;
          setDesktopUpdateInfo(data);
          if (data.available) {
              void message.success(t('update.available', { version: data.version || t('common.unknown') }));
          } else {
              void message.info(t('update.upToDate'));
          }
      } else {
          void message.error(t('update.checkFailed', { message: res?.message || t('message.unknownError') }));
      }
      setDesktopUpdateChecking(false);
  }, [t]);

  const installDesktopUpdate = React.useCallback(async () => {
      setDesktopUpdateInstalling(true);
      const res = await InstallDesktopUpdate();
      if (res?.success) {
          setDesktopUpdateInstalled(true);
          void message.success(t('update.installed'));
      } else {
          void message.error(t('update.installFailed', { message: res?.message || t('message.unknownError') }));
      }
      setDesktopUpdateInstalling(false);
  }, [t]);

  const restartDesktopApp = React.useCallback(() => {
      void RestartDesktopApp();
  }, []);

  const handleNewQuery = useCallback(() => {
      let connId = '';
      let db = '';

      // Priority: Active Tab Context (if connection still valid) > Sidebar Selection (activeContext)
      if (activeTabId) {
          const currentTab = tabs.find(t => t.id === activeTabId);
          if (currentTab && currentTab.connectionId && connections.some(c => c.id === currentTab.connectionId)) {
              connId = currentTab.connectionId;
              db = currentTab.dbName || '';
          }
      }

      // Fallback: Sidebar selection context (only if connection still valid)
      if (!connId && activeContext?.connectionId && connections.some(c => c.id === activeContext.connectionId)) {
          connId = activeContext.connectionId;
          db = activeContext.dbName || '';
      }

      addTab({
          id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: t('sidebar.newQuery'),
          type: 'query',
          connectionId: connId,
          dbName: db,
          query: ''
      });
  }, [activeTabId, tabs, connections, activeContext, addTab, t]);

  const closeConnectionPackageDialog = useCallback(() => {
      setConnectionPackageDialog(createClosedConnectionPackageDialogState());
      setPendingConnectionImportPayload(null);
  }, []);

  const refreshConnectionsAfterImport = useCallback(async (importedViews: SavedConnection[]) => {
      try {
          const latestConnections = await GetSavedConnections();
          if (!Array.isArray(latestConnections)) {
              throw new Error(t('connection.package.importRefreshFailed'));
          }
          replaceConnections(latestConnections as SavedConnection[]);
          return;
      } catch {
          const latestConnections = useStore.getState().connections;
          replaceConnections(mergeSavedConnections(latestConnections, importedViews));
      }
  }, [replaceConnections]);

  const importConnectionsPayload = useCallback(async (raw: string, password: string) => {
      const importedViews = await ImportConnectionsPayload(raw, password);
      if (!Array.isArray(importedViews)) {
          throw new Error(t('connection.package.importNoList'));
      }
      await refreshConnectionsAfterImport(importedViews as SavedConnection[]);
      return importedViews as SavedConnection[];
  }, [refreshConnectionsAfterImport]);

  const handleConnectionImportRaw = useCallback(async (raw: string) => {
      const importKind = detectConnectionImportKind(raw);

      if (importKind === 'invalid') {
          void message.error(t('connection.package.invalidFormat'));
          return;
      }

      try {
          setPendingConnectionImportPayload(null);
          const importedViews = await importConnectionsPayload(raw, '');
          if (importKind === 'mysql-workbench-xml' && importedViews.some(v => !v.hasPrimaryPassword)) {
              void message.warning(t('connection.package.importPartialPasswordWarning', { count: importedViews.length }));
          } else {
              void message.success(t('connection.package.importSuccess', { count: importedViews.length }));
          }
      } catch (e: unknown) {
          if (isConnectionPackagePasswordRequiredError(e)) {
              setPendingConnectionImportPayload(raw);
              setConnectionPackageDialog({
                  open: true,
                  mode: 'import',
                  includeSecrets: true,
                  useFilePassword: false,
                  password: '',
                  error: '',
                  confirmLoading: false,
              });
              return;
          }
          void message.error(getErrorMessage(e, t('connection.package.importFailed')));
      }
  }, [importConnectionsPayload, t]);

  const handleImportConnections = useCallback(() => {
      connectionImportFileInputRef.current?.click();
  }, []);

  const handleConnectionImportFileSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
          return;
      }

      try {
          const raw = await file.text();
          await handleConnectionImportRaw(raw);
      } catch (e: unknown) {
          void message.error(getErrorMessage(e, t('connection.package.importFailed')));
      }
  }, [handleConnectionImportRaw, t]);

  const handleExportConnections = async () => {
      if (connections.length === 0) {
          void message.warning(t('connection.package.noConnections'));
          return;
      }

      setConnectionPackageDialog({
          open: true,
          mode: 'export',
          includeSecrets: true,
          useFilePassword: false,
          password: '',
          error: '',
          confirmLoading: false,
      });
  };

  const handleConfirmConnectionPackageDialog = async () => {
      const password = normalizeConnectionPackagePassword(connectionPackageDialog.password);

      if (connectionPackageDialog.mode === 'import' && !password) {
          setConnectionPackageDialog((current) => ({
              ...current,
              error: t('connection.package.passwordRequired'),
          }));
          return;
      }

      if (
          connectionPackageDialog.mode === 'export'
          && connectionPackageDialog.includeSecrets
          && connectionPackageDialog.useFilePassword
          && !password
      ) {
          setConnectionPackageDialog((current) => ({
              ...current,
              error: t('connection.package.filePasswordRequired'),
          }));
          return;
      }

      setConnectionPackageDialog((current) => ({
          ...current,
          password: (
              current.mode === 'export'
              && (!current.includeSecrets || !current.useFilePassword)
          ) ? '' : password,
          error: '',
          confirmLoading: true,
      }));

      try {
          if (connectionPackageDialog.mode === 'export') {
              const res = await ExportConnectionsPackage({
                  includeSecrets: connectionPackageDialog.includeSecrets,
                  filePassword: (
                      connectionPackageDialog.includeSecrets
                      && connectionPackageDialog.useFilePassword
                  ) ? password : '',
              });
              const exportResult = resolveConnectionPackageExportResult(connectionPackageDialog, res);
              if (exportResult.kind === 'canceled') {
                  setConnectionPackageDialog(exportResult.nextDialog);
                  return;
              }
              if (exportResult.kind === 'failed') {
                  throw new Error(exportResult.error);
              }

              closeConnectionPackageDialog();
              void message.success(exportSuccessMessage(res, language, t('connection.package.exportSuccess')));
              return;
          }

          if (!pendingConnectionImportPayload) {
              throw new Error(t('connection.package.importPayloadMissing'));
          }

          const importedViews = await importConnectionsPayload(pendingConnectionImportPayload, password);
          closeConnectionPackageDialog();
          void message.success(t('connection.package.importSuccess', { count: importedViews.length }));
      } catch (e: unknown) {
          setConnectionPackageDialog((current) => ({
              ...current,
              confirmLoading: false,
              error: getErrorMessage(e, current.mode === 'export' ? t('connection.package.exportFailed') : t('connection.package.importFailed')),
          }));
      }
  };

  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [themeModalSection, setThemeModalSection] = useState<'theme' | 'appearance'>('theme');
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState(false);
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [capturingShortcutAction, setCapturingShortcutAction] = useState<ShortcutAction | null>(null);
  const [isDataRootModalOpen, setIsDataRootModalOpen] = useState(false);
  const [dataRootInfo, setDataRootInfo] = useState<DataRootInfo | null>(null);
  const [dataRootLoading, setDataRootLoading] = useState(false);
  const [isErrorLogModalOpen, setIsErrorLogModalOpen] = useState(false);
  const [errorLogSearch, setErrorLogSearch] = useState('');
  const [errorLogs, setErrorLogs] = useState<ErrorLogPayload[]>([]);
  const [selectedErrorLog, setSelectedErrorLog] = useState<ErrorLogPayload | null>(null);
  const [errorLogLoading, setErrorLogLoading] = useState(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);
  const aiEntryPlacement = resolveAIEntryPlacement();
  const aiEdgeHandleAttachment = resolveAIEdgeHandleAttachment(aiPanelVisible);
  const aiEdgeHandleDockStyle = useMemo(
      () => resolveAIEdgeHandleDockStyle(aiEdgeHandleAttachment),
      [aiEdgeHandleAttachment],
  );
  const aiEdgeHandleStyle = useMemo(() => (
      resolveAIEdgeHandleStyle({
          darkMode,
          aiPanelVisible,
          effectiveUiScale,
      })
  ), [aiPanelVisible, darkMode, effectiveUiScale]);
  const sidebarUtilityItems = useMemo(() => {
      const itemMap = {
          tasks: {
              key: 'tasks',
              title: t('taskCenter.title'),
              icon: <Badge count={runningJobCount} size="small"><ClockCircleOutlined /></Badge>,
              onClick: () => setIsTaskCenterOpen(true),
          },
          tools: {
              key: 'tools',
              title: t('sidebar.tools'),
              icon: <ToolOutlined />,
              onClick: () => setIsToolsModalOpen(true),
          },
          settings: {
              key: 'settings',
              title: t('sidebar.settings'),
              icon: <SettingOutlined />,
              onClick: () => setIsSettingsModalOpen(true),
          },
      } as const;

      return SIDEBAR_UTILITY_ITEM_KEYS.map((key) => itemMap[key]);
  }, [runningJobCount, t]);
  const renderAIEdgeHandle = () => (
      <Tooltip title={t('ai.assistant')}>
          <Button
              type="text"
              icon={<RobotOutlined />}
              onClick={toggleAIPanel}
              style={aiEdgeHandleStyle}
          >
              AI
          </Button>
      </Tooltip>
  );

  const loadDataRootInfo = useCallback(async () => {
      setDataRootLoading(true);
      try {
          const res = await GetDataRootDirectoryInfo();
          if (!res?.success) {
              throw new Error(res?.message || t('message.loadDataRootFailed'));
          }
          const data = (res?.data || {}) as DataRootInfo;
          setDataRootInfo(data);
      } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error || t('message.unknownError'));
          void message.error(t('message.loadDataRootFailedWithMessage', { message: errMsg }));
      } finally {
          setDataRootLoading(false);
      }
  }, []);

  useEffect(() => {
      if (!isDataRootModalOpen) {
          return;
      }
      void loadDataRootInfo();
  }, [isDataRootModalOpen, loadDataRootInfo]);

  const copyDataRootPath = useCallback(async (value?: string) => {
      const text = String(value || '').trim();
      if (!text) {
          return;
      }
      try {
          await navigator.clipboard.writeText(text);
          void message.success(t('settings.dataRoot.copied'));
      } catch {
          void message.error(t('settings.dataRoot.copyFailed'));
      }
  }, [t]);

  const renderDataRootPathRow = (label: string, value?: string) => {
      const text = String(value || '-');
      const canCopy = Boolean(value && value.trim());
      return (
          <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 500 }}>{label}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ ...utilityMutedTextStyle, flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: overlayTheme.sectionBorder, wordBreak: 'break-all' }}>
                      {text}
                  </div>
                  <Button disabled={!canCopy} onClick={() => void copyDataRootPath(value)}>
                      {t('settings.dataRoot.copy')}
                  </Button>
              </div>
          </div>
      );
  };

  const loadErrorLogs = useCallback(async (query = errorLogSearch) => {
      setErrorLogLoading(true);
      try {
          const logs = await GetErrorLogs(query, 200);
          setErrorLogs(logs);
          setSelectedErrorLog((current) => {
              if (!current) return logs[0] || null;
              return logs.find((log) => log.id === current.id) || logs[0] || null;
          });
      } catch (error: unknown) {
          void message.error(getErrorMessage(error, t('settings.errorLogs.loadFailed')));
      } finally {
          setErrorLogLoading(false);
      }
  }, [errorLogSearch, t]);

  useEffect(() => {
      if (!isErrorLogModalOpen) {
          return;
      }
      void loadErrorLogs();
  }, [isErrorLogModalOpen, loadErrorLogs]);

  const handleSearchErrorLog = useCallback(async () => {
      const query = errorLogSearch.trim();
      setErrorLogLoading(true);
      try {
          if (query.toUpperCase().startsWith('ERR-')) {
              const log = await GetErrorLog(query);
              const logs = log ? [log] : [];
              setErrorLogs(logs);
              setSelectedErrorLog(log);
              if (!log) {
                  void message.warning(t('settings.errorLogs.notFound'));
              }
          } else {
              const logs = await GetErrorLogs(query, 200);
              setErrorLogs(logs);
              setSelectedErrorLog(logs[0] || null);
          }
      } catch (error: unknown) {
          void message.error(getErrorMessage(error, t('settings.errorLogs.loadFailed')));
      } finally {
          setErrorLogLoading(false);
      }
  }, [errorLogSearch, t]);

  const handleToggleErrorLogResolved = useCallback(async () => {
      if (!selectedErrorLog) {
          return;
      }
      try {
          const updated = await SetErrorLogResolved(selectedErrorLog.id, !selectedErrorLog.resolved);
          if (updated) {
              setSelectedErrorLog(updated);
              setErrorLogs((logs) => logs.map((log) => log.id === updated.id ? updated : log));
          }
      } catch (error: unknown) {
          void message.error(getErrorMessage(error, t('settings.errorLogs.updateFailed')));
      }
  }, [selectedErrorLog, t]);



  // Log Panel: 最小高度按“工具栏 + 1 条日志行（微增）”限制
  const LOG_PANEL_TOOLBAR_HEIGHT = 32;
  const LOG_PANEL_SINGLE_ROW_HEIGHT = 39;
  const LOG_PANEL_MIN_VISIBLE_ROWS = 1;
  const LOG_PANEL_MIN_HEIGHT = LOG_PANEL_TOOLBAR_HEIGHT + (LOG_PANEL_SINGLE_ROW_HEIGHT * LOG_PANEL_MIN_VISIBLE_ROWS);
  const LOG_PANEL_MAX_HEIGHT = 800;
  const [logPanelHeight, setLogPanelHeight] = useState(Math.max(200, LOG_PANEL_MIN_HEIGHT));
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const SIDEBAR_COLLAPSED_WIDTH = 44;
  const visibleSidebarWidth = isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;
  const logResizeRef = React.useRef<{ startY: number, startHeight: number } | null>(null);
  const logGhostRef = React.useRef<HTMLDivElement>(null);

  const handleLogResizeStart = (e: React.MouseEvent) => {
      e.preventDefault();
      logResizeRef.current = { startY: e.clientY, startHeight: logPanelHeight };

      if (logGhostRef.current) {
          logGhostRef.current.style.top = `${e.clientY}px`;
          logGhostRef.current.style.display = 'block';
      }

      document.addEventListener('mousemove', handleLogResizeMove);
      document.addEventListener('mouseup', handleLogResizeUp);
  };

  const handleLogResizeMove = (e: MouseEvent) => {
      if (!logResizeRef.current) return;
      // Just update ghost line, no state update
      if (logGhostRef.current) {
          logGhostRef.current.style.top = `${e.clientY}px`;
      }
  };

  const handleLogResizeUp = (e: MouseEvent) => {
      if (logResizeRef.current) {
          const delta = logResizeRef.current.startY - e.clientY;
          const newHeight = Math.max(
              LOG_PANEL_MIN_HEIGHT,
              Math.min(LOG_PANEL_MAX_HEIGHT, logResizeRef.current.startHeight + delta)
          );
          setLogPanelHeight(newHeight);
      }

      if (logGhostRef.current) {
          logGhostRef.current.style.display = 'none';
      }

      logResizeRef.current = null;
      document.removeEventListener('mousemove', handleLogResizeMove);
      document.removeEventListener('mouseup', handleLogResizeUp);
  };

  const handleCreateConnection = () => {
      setEditingConnection(null);
      setIsModalOpen(true);
  };

  const handleEditConnection = (conn: SavedConnection) => {
      setEditingConnection(conn);
      setIsModalOpen(true);
  };

  const handleCloseModal = () => {
      setIsModalOpen(false);
      setEditingConnection(null);
  };

  const handleOpenDriverManagerFromConnection = () => {
      setIsModalOpen(false);
      setEditingConnection(null);
      setIsDriverModalOpen(true);
  };

  const handleCloseDriverManager = useCallback(() => {
      setIsDriverModalOpen(false);
  }, []);


  const handleOpenAISettings = useCallback((providerId?: string) => {
      setFocusedAIProviderId(providerId);
      setIsAISettingsOpen(true);
  }, []);

  const handleCloseAISettings = useCallback(() => {
      setIsAISettingsOpen(false);
      setFocusedAIProviderId(undefined);
  }, []);

  const handleTitleBarWindowToggle = async () => {
      const syncWindowStateFromRuntime = async () => {
          try {
              const [isFullscreen, isMaximised] = await Promise.all([
                  WindowIsFullscreen().catch(() => false),
                  WindowIsMaximised().catch(() => false),
              ]);
              useStore.getState().setWindowState(isFullscreen ? 'fullscreen' : (isMaximised ? 'maximized' : 'normal'));
          } catch {
              // ignore
          }
      };

      try {
          void emitWindowDiagnostic('action:titlebar-toggle:before');
          if (await WindowIsFullscreen()) {
              await WindowUnfullscreen();
              await syncWindowStateFromRuntime();
              void emitWindowDiagnostic('action:titlebar-toggle:after-unfullscreen');
              return;
          }
          if (useNativeMacWindowControls && isMacRuntime) {
              await WindowFullscreen();
              await syncWindowStateFromRuntime();
              void emitWindowDiagnostic('action:titlebar-toggle:after-fullscreen');
              return;
          }
          await WindowToggleMaximise();
          await syncWindowStateFromRuntime();
          void emitWindowDiagnostic('action:titlebar-toggle:after-toggle-maximise');
      } catch (_) {
          // ignore
      }
  };

  // Sidebar Resizing
  const sidebarDragRef = React.useRef<{ startX: number, startWidth: number } | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const ghostRef = React.useRef<HTMLDivElement>(null);
  const latestMouseX = React.useRef<number>(0); // Store latest mouse position

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      if (isSidebarCollapsed) {
          return;
      }

      if (ghostRef.current) {
          ghostRef.current.style.left = `${sidebarWidth}px`;
          ghostRef.current.style.display = 'block';
      }

      sidebarDragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      latestMouseX.current = e.clientX; // Init
      document.addEventListener('mousemove', handleSidebarMouseMove);
      document.addEventListener('mouseup', handleSidebarMouseUp);
  };

  const handleSidebarMouseMove = (e: MouseEvent) => {
      if (!sidebarDragRef.current) return;

      latestMouseX.current = e.clientX; // Always update latest pos

      if (rafRef.current) return; // Schedule once per frame

      rafRef.current = requestAnimationFrame(() => {
          if (!sidebarDragRef.current || !ghostRef.current) return;
          // Use latestMouseX.current instead of stale closure 'e.clientX'
          const delta = latestMouseX.current - sidebarDragRef.current.startX;
          const newWidth = Math.max(200, Math.min(600, sidebarDragRef.current.startWidth + delta));
          ghostRef.current.style.left = `${newWidth}px`;
          rafRef.current = null;
      });
  };

  const handleSidebarMouseUp = (e: MouseEvent) => {
      if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
      }

      if (sidebarDragRef.current) {
          // Use latest position for final commit too
          const delta = e.clientX - sidebarDragRef.current.startX;
          const newWidth = Math.max(200, Math.min(600, sidebarDragRef.current.startWidth + delta));
          setSidebarWidth(newWidth);
      }

      if (ghostRef.current) {
          ghostRef.current.style.display = 'none';
      }

      sidebarDragRef.current = null;
      document.removeEventListener('mousemove', handleSidebarMouseMove);
      document.removeEventListener('mouseup', handleSidebarMouseUp);
  };

  useEffect(() => {
    document.body.style.backgroundColor = 'transparent';
    document.body.style.color = darkMode ? '#ffffff' : '#000000';
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    document.body.style.fontSize = `${effectiveFontSize}px`;
    document.documentElement.style.setProperty('--javanavi-font-size', `${effectiveFontSize}px`);
  }, [darkMode, effectiveFontSize]);

  useEffect(() => {
      isAboutOpenRef.current = isAboutOpen;
  }, [isAboutOpen]);

  useEffect(() => {
      if (isAboutOpen) {
          void loadAboutInfo();
      }
  }, [isAboutOpen, loadAboutInfo]);

  useEffect(() => {
      const handleOpenShortcutSettingsEvent = () => {
          setIsShortcutModalOpen(true);
      };
      window.addEventListener('javanavi:open-shortcut-settings', handleOpenShortcutSettingsEvent as EventListener);
      return () => {
          window.removeEventListener('javanavi:open-shortcut-settings', handleOpenShortcutSettingsEvent as EventListener);
      };
  }, []);

  useEffect(() => {
      if (!isMacRuntime || !useNativeMacWindowControls) {
          return;
      }

      const handleMacNativeEscapeCapture = (event: KeyboardEvent) => {
          if (!shouldSuppressMacNativeEscapeExit(isMacRuntime, useNativeMacWindowControls, useStore.getState().windowState === 'fullscreen', event)) {
              return;
          }
          event.preventDefault();
          event.stopPropagation();
      };

      window.addEventListener('keydown', handleMacNativeEscapeCapture, true);
      return () => {
          window.removeEventListener('keydown', handleMacNativeEscapeCapture, true);
      };
  }, [isMacRuntime, useNativeMacWindowControls]);

  useEffect(() => {
      const handleGlobalF5Guard = (event: KeyboardEvent) => {
          if (event.key !== 'F5' && event.code !== 'F5') {
              return;
          }
          const plainF5 = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
          if (window.__JAVANAVI_DRIVER_MANAGER_OPEN__) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();
              if (plainF5) {
                  window.dispatchEvent(new CustomEvent('javanavi:driver-manager-refresh'));
              }
              return;
          }
          if (plainF5 && window.__JAVANAVI_ALLOW_F5__) {
              return;
          }
          event.preventDefault();
          event.stopPropagation();
      };

      window.addEventListener('keydown', handleGlobalF5Guard, true);
      return () => {
          window.removeEventListener('keydown', handleGlobalF5Guard, true);
      };
  }, []);

  useEffect(() => {
      const handleGlobalShortcut = (event: KeyboardEvent) => {
          const matchedAction = SHORTCUT_ACTION_ORDER.find((action) => {
              const meta = SHORTCUT_ACTION_META[action];
              if (meta.scope && meta.scope !== 'global') {
                  return false;
              }
              const binding = shortcutOptions[action];
              if (!binding?.enabled) {
                  return false;
              }
              if (isEditableElement(event.target) && !meta.allowInEditable) {
                  return false;
              }
              return isShortcutMatch(event, binding.combo);
          });

          if (!matchedAction) {
              return;
          }

          event.preventDefault();
          event.stopPropagation();

          switch (matchedAction) {
              case 'runQuery':
                  window.dispatchEvent(new CustomEvent('javanavi:run-active-query'));
                  break;
              case 'focusSidebarSearch':
                  window.dispatchEvent(new CustomEvent('javanavi:focus-sidebar-search'));
                  break;
              case 'newQueryTab':
                  handleNewQuery();
                  break;
              case 'toggleLogPanel':
                  setIsLogPanelOpen((prev) => !prev);
                  break;
              case 'toggleTheme':
                  setTheme(themeMode === 'dark' ? 'light' : 'dark');
                  break;
              case 'openShortcutManager':
                  setIsShortcutModalOpen(true);
                  break;
              case 'toggleMacFullscreen':
                  if (isMacRuntime && useNativeMacWindowControls) {
                      void handleTitleBarWindowToggle();
                  }
                  break;
          }
      };

      window.addEventListener('keydown', handleGlobalShortcut);
      return () => {
          window.removeEventListener('keydown', handleGlobalShortcut);
      };
  }, [handleNewQuery, handleTitleBarWindowToggle, isMacRuntime, shortcutOptions, themeMode, setTheme, useNativeMacWindowControls]);

  useEffect(() => {
      if (!capturingShortcutAction) {
          return;
      }

      const handleShortcutCapture = (event: KeyboardEvent) => {
          event.preventDefault();
          event.stopPropagation();

          if (event.key === 'Escape') {
              setCapturingShortcutAction(null);
              return;
          }

          const combo = eventToShortcut(event);
          if (!combo) {
              return;
          }

          const normalizedCombo = normalizeShortcutCombo(combo);
          if (!canRecordShortcutForAction(capturingShortcutAction, normalizedCombo)) {
              const meta = SHORTCUT_ACTION_META[capturingShortcutAction];
              void message.warning(meta.scope === 'aiComposer'
                  ? t('shortcuts.aiUnsupported')
                  : t('shortcuts.requiresModifier'));
              return;
          }
          const conflictAction = SHORTCUT_ACTION_ORDER.find((action) => {
              if (action === capturingShortcutAction) {
                  return false;
              }
              const binding = shortcutOptions[action];
              if (!binding?.enabled) {
                  return false;
              }
              return normalizeShortcutCombo(binding.combo) === normalizedCombo;
          });
          if (conflictAction) {
              void message.warning(t('shortcuts.conflict', { action: t(SHORTCUT_ACTION_LABEL_KEYS[conflictAction]) }));
              return;
          }

          updateShortcut(capturingShortcutAction, { combo: normalizedCombo, enabled: true });
          setCapturingShortcutAction(null);
      };

      window.addEventListener('keydown', handleShortcutCapture, true);
      return () => {
          window.removeEventListener('keydown', handleShortcutCapture, true);
      };
  }, [capturingShortcutAction, shortcutOptions, t, updateShortcut]);

  const linuxResizeHandleStyleBase = {
      position: 'fixed',
      zIndex: 12000,
      background: 'transparent',
      WebkitAppRegion: 'drag',
      '--wails-draggable': 'drag',
      userSelect: 'none'
  } satisfies DraggableResizeHandleStyle;

  const showLinuxResizeHandles = isLinuxRuntime;
  const resizeGuideColor = darkMode ? 'rgba(246, 196, 83, 0.55)' : 'rgba(24, 144, 255, 0.5)';

  return (
    <ConfigProvider
        locale={antdLocale}
        componentSize={appComponentSize}
        theme={{
            algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
            token: {
                fontSize: tokenFontSize,
                fontSizeSM: tokenFontSizeSM,
                fontSizeLG: tokenFontSizeLG,
                controlHeight: tokenControlHeight,
                controlHeightSM: tokenControlHeightSM,
                controlHeightLG: tokenControlHeightLG,
                colorBgLayout: 'transparent',
                colorBgContainer: darkMode
                    ? `rgba(29, 29, 29, ${effectiveOpacity})`
                    : `rgba(255, 255, 255, ${effectiveOpacity})`,
                colorBgElevated: darkMode
                    ? '#1f1f1f'
                    : '#ffffff',
                colorFillAlter: darkMode
                    ? `rgba(38, 38, 38, ${effectiveOpacity})`
                    : `rgba(250, 250, 250, ${effectiveOpacity})`,
                colorPrimary: darkMode ? '#f6c453' : '#1677ff',
                colorPrimaryHover: darkMode ? '#ffd666' : '#4096ff',
                colorPrimaryActive: darkMode ? '#d8a93b' : '#0958d9',
                colorInfo: darkMode ? '#f6c453' : '#1677ff',
                colorLink: darkMode ? '#ffd666' : '#1677ff',
                colorLinkHover: darkMode ? '#ffe58f' : '#4096ff',
                colorLinkActive: darkMode ? '#d8a93b' : '#0958d9',
                colorPrimaryBg: darkMode ? 'rgba(246, 196, 83, 0.22)' : '#e6f4ff',
                colorPrimaryBgHover: darkMode ? 'rgba(246, 196, 83, 0.30)' : '#bae0ff',
                colorPrimaryBorder: darkMode ? 'rgba(246, 196, 83, 0.45)' : '#91caff',
                colorPrimaryBorderHover: darkMode ? 'rgba(246, 196, 83, 0.60)' : '#69b1ff',
                controlItemBgActive: darkMode ? 'rgba(246, 196, 83, 0.20)' : 'rgba(22, 119, 255, 0.12)',
                controlItemBgActiveHover: darkMode ? 'rgba(246, 196, 83, 0.28)' : 'rgba(22, 119, 255, 0.18)',
                controlOutline: darkMode ? 'rgba(246, 196, 83, 0.50)' : 'rgba(5, 145, 255, 0.24)',
            },
            components: {
                Layout: {
                    bodyBg: 'transparent',
                    headerBg: 'transparent',
                    siderBg: 'transparent',
                    triggerBg: 'transparent'
                },
                Table: {
                    headerBg: 'transparent',
                    rowHoverBg: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.02)',
                },
                Tabs: {
                    cardBg: 'transparent',
                    itemActiveColor: darkMode ? '#ffd666' : '#1890ff',
                    itemHoverColor: darkMode ? '#ffe58f' : '#40a9ff',
                    itemSelectedColor: darkMode ? '#ffd666' : '#1677ff',
                    inkBarColor: darkMode ? '#ffd666' : '#1677ff',
                }
            }
        }}
    >
        <Layout style={{
            height: '100vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'transparent',
            borderRadius: showLinuxResizeHandles ? 0 : 'var(--javanavi-border-radius)',
            clipPath: showLinuxResizeHandles ? 'none' : 'inset(0 round var(--javanavi-border-radius))',
            backdropFilter: textInputSafeBackdropFilter,
            WebkitBackdropFilter: textInputSafeBackdropFilter,
        }}>
          <Layout style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          <Sider
            width={visibleSidebarWidth}
            collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
            collapsed={isSidebarCollapsed}
            trigger={null}
            style={{
                borderRight: '1px solid rgba(128,128,128,0.2)',
                position: 'relative',
                background: bgMain
            }}
          >
            <div style={{ height: '100%', display: isSidebarCollapsed ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '12px 6px', overflow: 'hidden' }}>
                    <Tooltip title={t('sidebar.expand')}>
                        <Button
                            type="text"
                            aria-label={t('sidebar.expand')}
                            icon={<MenuUnfoldOutlined />}
                            onClick={() => setIsSidebarCollapsed(false)}
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 10,
                                color: darkMode ? 'rgba(255,255,255,0.92)' : '#162033',
                                border: `1px solid ${utilityButtonBorderColor}`,
                                background: utilityButtonBgColor,
                                boxShadow: utilityButtonShadow,
                                backdropFilter: isOpaqueUtilityMode ? 'none' : blurFilter,
                                WebkitBackdropFilter: isOpaqueUtilityMode ? 'none' : blurFilter,
                                flexShrink: 0,
                            }}
                        />
                    </Tooltip>
                    <div style={{ width: 24, height: 1, background: darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(16,24,40,0.12)' }} />
                    <Tooltip title={t('sidebar.newConnection')}>
                        <Button type="text" aria-label={t('sidebar.newConnection')} icon={<PlusOutlined />} onClick={handleCreateConnection} style={{ ...utilityButtonStyle, width: 32, paddingInline: 0, flexShrink: 0 }} />
                    </Tooltip>
                    <Tooltip title={t('sidebar.newQuery')}>
                        <Button type="text" aria-label={t('sidebar.newQuery')} icon={<ConsoleSqlOutlined />} onClick={handleNewQuery} style={{ ...utilityButtonStyle, width: 32, paddingInline: 0, flexShrink: 0 }} />
                    </Tooltip>
                    <Tooltip title={t('taskCenter.title')}>
                        <Badge count={runningJobCount} size="small">
                            <Button type="text" aria-label={t('taskCenter.title')} icon={<ClockCircleOutlined />} onClick={() => setIsTaskCenterOpen(true)} style={{ ...utilityButtonStyle, width: 32, paddingInline: 0, flexShrink: 0 }} />
                        </Badge>
                    </Tooltip>
                    <div style={{ flex: 1 }} />
                    <Tooltip title={t('sidebar.sqlLog')}>
                        <Button
                            type={isLogPanelOpen ? "primary" : "text"}
                            aria-label={t('sidebar.sqlLog')}
                            icon={<BugOutlined />}
                            onClick={() => setIsLogPanelOpen(!isLogPanelOpen)}
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 10,
                                border: isLogPanelOpen ? undefined : `1px solid ${floatingLogButtonBorderColor}`,
                                color: isLogPanelOpen ? undefined : floatingLogButtonTextColor,
                                background: isLogPanelOpen ? undefined : floatingLogButtonBgColor,
                                boxShadow: floatingLogButtonShadow,
                                backdropFilter: blurFilter,
                                flexShrink: 0,
                            }}
                        />
                    </Tooltip>
                </div>
                <div style={{ height: '100%', display: isSidebarCollapsed ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: `12px ${sidebarHorizontalPadding}px 8px`, borderBottom: 'none', display: 'flex', alignItems: 'center', flexShrink: 0, gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sidebarUtilityItems.length}, minmax(0, 1fr))`, gap: 8, flex: 1, minWidth: 0 }}>
                            {sidebarUtilityItems.map((item) => (
                                <Tooltip key={item.key} title={item.title}>
                                    <Button type="text" icon={item.icon} style={utilityButtonStyle} onClick={item.onClick} />
                                </Tooltip>
                            ))}
                        </div>
                        <Tooltip title={t('sidebar.collapse')}>
                            <Button
                                type="text"
                                aria-label={t('sidebar.collapse')}
                                icon={<MenuFoldOutlined />}
                                onClick={() => setIsSidebarCollapsed(true)}
                                style={{ ...utilityButtonStyle, width: Math.max(30, Math.round(32 * effectiveUiScale)), paddingInline: 0, flexShrink: 0 }}
                            />
                        </Tooltip>
                    </div>
                    <div style={{ padding: `0 ${sidebarHorizontalPadding}px 10px`, borderBottom: 'none', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isSidebarCompact ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8, width: '100%' }}>
                            <Button icon={<PlusOutlined />} onClick={handleCreateConnection} title={t('sidebar.newConnection')} style={sidebarCreateConnectionActionStyle}>
                                {t('sidebar.newConnection')}
                            </Button>
                            <Button icon={<ConsoleSqlOutlined />} onClick={handleNewQuery} title={t('sidebar.newQuery')} style={sidebarQueryActionStyle}>
                                {t('sidebar.newQuery')}
                            </Button>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden', paddingBottom: 58, position: 'relative' }}>
                        <div style={{ height: '100%', opacity: connectionWorkbenchState.ready ? 1 : 0.72, pointerEvents: connectionWorkbenchState.ready ? 'auto' : 'none' }}>
                            <Suspense fallback={<div style={{ display: 'grid', height: '100%', placeItems: 'center' }}><Spin size="small" /></div>}>
                                <Sidebar onEditConnection={handleEditConnection} />
                            </Suspense>
                        </div>
                        {!connectionWorkbenchState.ready && (
                            <div
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: 16,
                                    background: darkMode ? 'rgba(7, 12, 20, 0.42)' : 'rgba(255, 255, 255, 0.58)',
                                    backdropFilter: 'blur(4px)',
                                    zIndex: 1,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        padding: '10px 14px',
                                        borderRadius: 999,
                                        background: darkMode ? 'rgba(15, 23, 36, 0.86)' : 'rgba(255, 255, 255, 0.94)',
                                        border: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(22,32,51,0.08)',
                                        boxShadow: darkMode ? '0 12px 24px rgba(0,0,0,0.26)' : '0 12px 24px rgba(15,23,42,0.08)',
                                        color: darkMode ? 'rgba(255,255,255,0.88)' : '#162033',
                                        fontSize: 12,
                                        fontWeight: 500,
                                    }}
                                >
                                    <Spin size="small" />
                                    <span>{connectionWorkbenchState.message}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Floating SQL Log Toggle */}
                    <div
                        style={{
                            position: 'absolute',
                            left: 10,
                            right: 14,
                            bottom: 10,
                            zIndex: 20,
                            pointerEvents: 'none'
                        }}
                    >
                        <Button
                            type={isLogPanelOpen ? "primary" : "text"}
                            icon={<BugOutlined />}
                            onClick={() => setIsLogPanelOpen(!isLogPanelOpen)}
                            style={isLogPanelOpen ? {
                                width: '100%',
                                height: floatingLogButtonHeight,
                                borderRadius: 999,
                                boxShadow: floatingLogButtonShadow,
                                pointerEvents: 'auto'
                            } : {
                                width: '100%',
                                height: floatingLogButtonHeight,
                                borderRadius: 999,
                                border: `1px solid ${floatingLogButtonBorderColor}`,
                                color: floatingLogButtonTextColor,
                                background: floatingLogButtonBgColor,
                                boxShadow: floatingLogButtonShadow,
                                backdropFilter: blurFilter,
                                pointerEvents: 'auto'
                            }}
                        >
                            {t('sidebar.sqlLog')}
                        </Button>
                    </div>
                </div>

            {!isSidebarCollapsed && (
                <div
                    onMouseDown={handleSidebarMouseDown}
                    style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '5px',
                        cursor: 'col-resize',
                        zIndex: 100,
                        // background: 'transparent' // transparent usually, visible on hover if desired
                    }}
                    title={t('sidebar.resizeHandle')}
                />
            )}
          </Sider>
           <Content style={{ background: bgContent, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
             <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'row', position: 'relative' }}>
               <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: bgContent, marginBottom: isLogPanelOpen ? 8 : 0, borderRadius: isLogPanelOpen ? 'var(--javanavi-border-radius)' : 0, clipPath: isLogPanelOpen ? 'inset(0 round var(--javanavi-border-radius))' : 'none' }}>
                  <Suspense fallback={<div style={{ display: 'grid', height: '100%', placeItems: 'center' }}><Spin /></div>}>
                    <TabManager />
                  </Suspense>
               </div>
               {aiEntryPlacement === 'content-edge' && aiEdgeHandleAttachment === 'content-shell' && (
                  <div style={aiEdgeHandleDockStyle}>
                      {renderAIEdgeHandle()}
                  </div>
               )}
               {aiPanelVisible && (
                  <div style={{ position: 'relative', display: 'flex', flexShrink: 0, overflow: 'visible' }}>
                      {aiEntryPlacement === 'content-edge' && aiEdgeHandleAttachment === 'panel-shell' && (
                          <div style={aiEdgeHandleDockStyle}>
                              {renderAIEdgeHandle()}
                          </div>
                      )}
                      <Suspense fallback={null}>
                        <AIChatPanel darkMode={darkMode} bgColor={bgContent} onClose={() => setAIPanelVisible(false)} onOpenSettings={() => {
                          handleOpenAISettings();
                        }} overlayTheme={overlayTheme} />
                      </Suspense>
                  </div>
               )}
             </div>
             {isLogPanelOpen && (
                 <Suspense fallback={null}>
                    <LogPanel
                        height={logPanelHeight}
                        onClose={() => setIsLogPanelOpen(false)}
                        onResizeStart={handleLogResizeStart}
                    />
                 </Suspense>
            )}
          </Content>
          </Layout>
          <input
            ref={connectionImportFileInputRef}
            type="file"
            accept=".javanavi-conn,.json,.xml,application/json,text/xml,application/xml,text/plain"
            style={{ display: 'none' }}
            onChange={handleConnectionImportFileSelected}
          />
          {isModalOpen && (
            <Suspense fallback={null}>
              <ConnectionModal
                open={isModalOpen}
                onClose={handleCloseModal}
                initialValues={editingConnection}
                onOpenDriverManager={handleOpenDriverManagerFromConnection}
              />
            </Suspense>
          )}
          <Modal
            title={renderUtilityModalTitle(<ToolOutlined />, t('tools.center.title'), t('tools.center.description'))}
            open={isToolsModalOpen}
            onCancel={() => setIsToolsModalOpen(false)}
            footer={null}
            width={560}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
            <div style={{ display: 'grid', gap: 12, padding: '12px 0' }}>
              {[
                {
                  key: 'import',
                  icon: <UploadOutlined />,
                  title: t('tools.import.title'),
                  description: t('tools.import.description'),
                  onClick: () => {
                    setIsToolsModalOpen(false);
                    void handleImportConnections();
                  },
                },
                {
                  key: 'export',
                  icon: <DownloadOutlined />,
                  title: t('tools.export.title'),
                  description: t('tools.export.description'),
                  onClick: () => {
                    setIsToolsModalOpen(false);
                    void handleExportConnections();
                  },
                },
                {
                  key: 'sync',
                  icon: <UploadOutlined rotate={90} />,
                  title: t('tools.sync.title'),
                  description: t('tools.sync.description'),
                  onClick: () => {
                    setSyncModalDomain('data');
                    setIsToolsModalOpen(false);
                    setIsSyncModalOpen(true);
                  },
                },
                {
                  key: 'schema-sync',
                  icon: <TableOutlined />,
                  title: t('tools.schemaSync.title'),
                  description: t('tools.schemaSync.description'),
                  onClick: () => {
                    setSyncModalDomain('schema');
                    setIsToolsModalOpen(false);
                    setIsSyncModalOpen(true);
                  },
                },
                {
                  key: 'drivers',
                  icon: <SettingOutlined />,
                  title: t('tools.drivers.title'),
                  description: t('tools.drivers.description'),
                  onClick: () => {
                    setIsToolsModalOpen(false);
                    setIsDriverModalOpen(true);
                  },
                },
                {
                  key: 'data-root',
                  icon: <HddOutlined />,
                  title: t('tools.dataRoot.title'),
                  description: t('tools.dataRoot.description'),
                  onClick: () => {
                    setIsToolsModalOpen(false);
                    setIsDataRootModalOpen(true);
                  },
                },
                {
                  key: 'shortcut-settings',
                  icon: <LinkOutlined />,
                  title: t('tools.shortcuts.title'),
                  description: t('tools.shortcuts.description'),
                  onClick: () => {
                    setIsToolsModalOpen(false);
                    setIsShortcutModalOpen(true);
                  },
                },
              ].map((item) => (
                <Button key={item.key} type="text" style={utilityActionCardStyle} onClick={item.onClick}>
                  <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: overlayTheme.iconBg, color: overlayTheme.iconColor, flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                    <span>{item.title}</span>
                    <span style={utilityActionHintStyle}>{item.description}</span>
                  </span>
                </Button>
              ))}
            </div>
          </Modal>
          <Modal
            title={renderUtilityModalTitle(<SettingOutlined />, t('settings.center.title'), t('settings.center.description'))}
            open={isSettingsModalOpen}
            onCancel={() => setIsSettingsModalOpen(false)}
            footer={null}
            width={560}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
            <div style={{ display: 'grid', gap: 12, padding: '12px 0' }}>
              <div style={utilityPanelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: overlayTheme.titleText }}>{t('settings.language.title')}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: overlayTheme.mutedText, lineHeight: 1.6 }}>{t('settings.language.description')}</div>
                  </div>
                  <Select
                    aria-label={t('language.selector.label')}
                    value={language}
                    style={{ minWidth: 180 }}
                    options={appLanguageOptions.map((option) => ({
                      value: option.value,
                      label: `${t(option.labelKey)}${option.value === DEFAULT_LANGUAGE ? ` · ${t('language.selector.defaultBadge')}` : ''}`,
                    }))}
                    onChange={(nextLanguage) => {
                      setLanguage(nextLanguage);
                      void SaveLanguage(nextLanguage);
                      void message.success(t('settings.language.applied', {
                        language: t(nextLanguage === 'zh' ? 'language.chinese' : 'language.english'),
                      }));
                    }}
                  />
                </div>
              </div>
              {[
                {
                  key: 'theme',
                  icon: <SkinOutlined />,
                  title: t('settings.themeAppearance.title'),
                  description: t('settings.themeAppearance.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    setThemeModalSection('theme');
                    setIsThemeModalOpen(true);
                  },
                },
                {
                  key: 'ai',
                  icon: <RobotOutlined />,
                  title: t('settings.ai.title'),
                  description: t('settings.ai.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    handleOpenAISettings();
                  },
                },
                {
                  key: 'error-logs',
                  icon: <BugOutlined />,
                  title: t('settings.errorLogs.title'),
                  description: t('settings.errorLogs.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    setIsErrorLogModalOpen(true);
                  },
                },
                {
                  key: 'about',
                  icon: <InfoCircleOutlined />,
                  title: t('settings.about.title'),
                  description: t('settings.about.description'),
                  onClick: () => {
                    setIsSettingsModalOpen(false);
                    setIsAboutOpen(true);
                  },
                },
              ].map((item) => (
                <Button key={item.key} type="text" style={utilityActionCardStyle} onClick={item.onClick}>
                  <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: overlayTheme.iconBg, color: overlayTheme.iconColor, flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ display: 'grid', gap: 4, textAlign: 'left', minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: overlayTheme.titleText }}>{item.title}</span>
                    <span style={{ fontSize: 12, color: overlayTheme.mutedText, whiteSpace: 'normal' }}>{item.description}</span>
                  </span>
                </Button>
              ))}
            </div>
          </Modal>
          <Modal
            title={renderUtilityModalTitle(<BugOutlined />, t('settings.errorLogs.title'), t('settings.errorLogs.description'))}
            open={isErrorLogModalOpen}
            onCancel={() => setIsErrorLogModalOpen(false)}
            footer={null}
            width={920}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
            <div style={{ display: 'grid', gap: 12, padding: '12px 0' }}>
              <div style={utilityPanelStyle}>
                <Input.Search
                  aria-label={t('settings.errorLogs.searchPlaceholder')}
                  placeholder={t('settings.errorLogs.searchPlaceholder')}
                  value={errorLogSearch}
                  allowClear
                  enterButton={t('common.search')}
                  onChange={(event) => setErrorLogSearch(event.target.value)}
                  onSearch={() => void handleSearchErrorLog()}
                />
                <div style={{ ...utilityMutedTextStyle, marginTop: 8 }}>{t('settings.errorLogs.searchHint')}</div>
              </div>
              <Spin spinning={errorLogLoading}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 330px) 1fr', gap: 12, minHeight: 360 }}>
                  <div style={{ ...utilityPanelStyle, maxHeight: 520, overflow: 'auto', padding: 10 }}>
                    {errorLogs.length === 0 ? (
                      <div style={{ ...utilityMutedTextStyle, textAlign: 'center', padding: '32px 8px' }}>{t('settings.errorLogs.empty')}</div>
                    ) : errorLogs.map((log) => {
                      const active = selectedErrorLog?.id === log.id;
                      return (
                        <button
                          key={log.id}
                          type="button"
                          onClick={() => setSelectedErrorLog(log)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            border: `1px solid ${active ? overlayTheme.iconColor : 'transparent'}`,
                            background: active ? overlayTheme.iconBg : 'transparent',
                            color: overlayTheme.titleText,
                            borderRadius: 10,
                            padding: 10,
                            cursor: 'pointer',
                            marginBottom: 8,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>{log.id}</span>
                            <span style={{ color: log.resolved ? '#16a34a' : '#dc2626', fontSize: 12 }}>{log.resolved ? t('settings.errorLogs.resolved') : t('settings.errorLogs.unresolved')}</span>
                          </div>
                          <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>{dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                          <div style={{ ...utilityMutedTextStyle, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.requestMethod} {log.requestPath}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ ...utilityPanelStyle, maxHeight: 520, overflow: 'auto' }}>
                    {selectedErrorLog ? (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>{selectedErrorLog.id}</div>
                            <div style={utilityMutedTextStyle}>{dayjs(selectedErrorLog.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                          </div>
                          <Button onClick={() => void handleToggleErrorLogResolved()}>
                            {selectedErrorLog.resolved ? t('settings.errorLogs.markUnresolved') : t('settings.errorLogs.markResolved')}
                          </Button>
                        </div>
                        {[
                          [t('settings.errorLogs.request'), `${selectedErrorLog.requestMethod} ${selectedErrorLog.requestPath}`],
                          [t('settings.errorLogs.type'), selectedErrorLog.errorType],
                          [t('settings.errorLogs.message'), selectedErrorLog.message],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <div style={{ fontWeight: 600, color: overlayTheme.titleText }}>{label}</div>
                            <div style={{ ...utilityMutedTextStyle, fontSize: 13, wordBreak: 'break-word' }}>{value}</div>
                          </div>
                        ))}
                        <div>
                          <div style={{ fontWeight: 600, color: overlayTheme.titleText, marginBottom: 6 }}>{t('settings.errorLogs.stackTrace')}</div>
                          <pre style={{ margin: 0, padding: 12, borderRadius: 10, background: darkMode ? 'rgba(15,23,42,0.72)' : 'rgba(248,250,252,0.92)', color: overlayTheme.titleText, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6 }}>{selectedErrorLog.stackTrace || t('common.unknown')}</pre>
                        </div>
                      </div>
                    ) : (
                      <div style={{ ...utilityMutedTextStyle, textAlign: 'center', padding: '80px 8px' }}>{t('settings.errorLogs.selectHint')}</div>
                    )}
                  </div>
                </div>
              </Spin>
            </div>
          </Modal>
          <Modal
            title={renderUtilityModalTitle(<HddOutlined />, t('settings.dataRoot.title'), t('settings.dataRoot.description'))}
            open={isDataRootModalOpen}
            onCancel={() => setIsDataRootModalOpen(false)}
            footer={null}
            width={720}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
            {dataRootLoading ? (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <Spin />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
                <div style={utilityPanelStyle}>
                  <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('settings.dataRoot.currentDirectory')}</div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {renderDataRootPathRow(t('settings.dataRoot.currentDirectory'), dataRootInfo?.path)}
                    {renderDataRootPathRow(t('settings.dataRoot.defaultDirectory'), dataRootInfo?.defaultPath)}
                    {renderDataRootPathRow(t('settings.dataRoot.driverDirectory'), dataRootInfo?.driverPath)}
                    {renderDataRootPathRow(t('settings.dataRoot.appDatabase'), dataRootInfo?.bootstrapPath)}
                  </div>
                </div>
              </div>
            )}
          </Modal>
          {isSyncModalOpen && (
            <Suspense fallback={null}>
              <DataSyncModal
                open={isSyncModalOpen}
                initialDomain={syncModalDomain}
                onClose={() => setIsSyncModalOpen(false)}
              />
            </Suspense>
          )}
          {isDriverModalOpen && (
            <Suspense fallback={null}>
              <DriverManagerModal
                open={isDriverModalOpen}
                onClose={handleCloseDriverManager}
              />
            </Suspense>
          )}
          {isAISettingsOpen && (
            <Suspense fallback={null}>
              <AISettingsModal
                open={isAISettingsOpen}
                onClose={handleCloseAISettings}
                darkMode={darkMode}
                overlayTheme={overlayTheme}
                focusProviderId={focusedAIProviderId}
              />
            </Suspense>
          )}
          {connectionPackageDialog.open && (
            <Suspense fallback={null}>
              <ConnectionPackagePasswordModal
                open={connectionPackageDialog.open}
                title={connectionPackageDialog.mode === 'export' ? t('connection.package.exportTitle') : t('connection.package.importTitle')}
                mode={connectionPackageDialog.mode}
                includeSecrets={connectionPackageDialog.includeSecrets}
                useFilePassword={connectionPackageDialog.useFilePassword}
                password={connectionPackageDialog.password}
                error={connectionPackageDialog.error}
                confirmLoading={connectionPackageDialog.confirmLoading}
                confirmText={connectionPackageDialog.mode === 'export' ? t('connection.package.startExport') : t('connection.package.startImport')}
                cancelText={t('common.cancel')}
                exportPasswordsText={t('connection.package.exportPasswords')}
                useFilePasswordText={t('connection.package.useFilePassword')}
                exportPasswordPlaceholder={t('connection.package.exportPasswordPlaceholder')}
                importPasswordPlaceholder={t('connection.package.importPasswordPlaceholder')}
                exportNoSecretsHelpText={t('connection.package.exportNoSecretsHelp')}
                exportPasswordHelpText={t('connection.package.exportPasswordHelp')}
                exportPasswordRecommendedHelpText={t('connection.package.exportPasswordRecommendedHelp')}
                onIncludeSecretsChange={(value) => {
                    setConnectionPackageDialog((current) => ({
                        ...current,
                        includeSecrets: value,
                        useFilePassword: value ? current.useFilePassword : false,
                        password: value ? current.password : '',
                        error: '',
                    }));
                }}
                onUseFilePasswordChange={(value) => {
                    setConnectionPackageDialog((current) => ({
                        ...current,
                        useFilePassword: value,
                        password: value ? current.password : '',
                        error: '',
                    }));
                }}
                onPasswordChange={(value) => {
                    setConnectionPackageDialog((current) => ({
                        ...current,
                        password: value,
                        error: '',
                    }));
                }}
                onConfirm={() => {
                    void handleConfirmConnectionPackageDialog();
                }}
                onCancel={closeConnectionPackageDialog}
              />
            </Suspense>
          )}
          <Modal
            title={renderUtilityModalTitle(<InfoCircleOutlined />, t('settings.about.title'), t('settings.about.description'))}
            open={isAboutOpen}
            onCancel={() => setIsAboutOpen(false)}
            styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' } }}
            footer={[
                <Button key="close" onClick={() => setIsAboutOpen(false)}>{t('common.close')}</Button>,
            ]}
          >
            {aboutLoading ? (
                <div style={{ padding: '16px 0', textAlign: 'center' }}>
                    <Spin />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={utilityPanelStyle}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                            <div>
                                <div style={{ marginBottom: 6, fontWeight: 600 }}>{t('about.version')}</div>
                                <div style={utilityMutedTextStyle}>{aboutDisplayVersion}</div>
                            </div>
                            <div>
                                <div style={{ marginBottom: 6, fontWeight: 600 }}>{t('about.author')}</div>
                                <div style={utilityMutedTextStyle}>{aboutInfo?.author || t('common.unknown')}</div>
                            </div>
                            {(aboutInfo?.communityUrl || aboutInfo?.communityName || aboutInfo?.communityGroupNumber) ? (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ marginBottom: 6, fontWeight: 600 }}>{t('about.community')}</div>
                                    {aboutInfo?.communityUrl ? (
                                        <a onClick={(e) => { e.preventDefault(); if (aboutInfo?.communityUrl) BrowserOpenURL(aboutInfo.communityUrl); }} href={aboutInfo.communityUrl}>{aboutInfo?.communityName || t('about.communityName')}</a>
                                    ) : (
                                        <div style={utilityMutedTextStyle}>{aboutInfo?.communityName || t('about.communityName')}{aboutInfo?.communityGroupNumber ? `：${aboutInfo.communityGroupNumber}` : ''}</div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <div style={utilityPanelStyle}>
                        <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('update.title')}</div>
                        <div style={{ display: 'grid', gap: 10 }}>
                            <div style={utilityMutedTextStyle}>
                                {desktopUpdateInstalled
                                    ? t('update.restartRequired')
                                    : desktopUpdateInfo
                                        ? (desktopUpdateInfo.available
                                            ? t('update.availableDescription', { version: desktopUpdateInfo.version || t('common.unknown') })
                                            : t('update.currentDescription'))
                                        : t('update.description')}
                            </div>
                            {desktopUpdateInfo?.body ? (
                                <div style={{ ...utilityMutedTextStyle, whiteSpace: 'pre-wrap' }}>{desktopUpdateInfo.body}</div>
                            ) : null}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                <Button loading={desktopUpdateChecking} onClick={() => { void checkDesktopUpdate(); }}>
                                    {t('update.check')}
                                </Button>
                                {desktopUpdateInfo?.available && !desktopUpdateInstalled ? (
                                    <Button type="primary" loading={desktopUpdateInstalling} onClick={() => { void installDesktopUpdate(); }}>
                                        {t('update.install')}
                                    </Button>
                                ) : null}
                                {desktopUpdateInstalled ? (
                                    <Button type="primary" onClick={restartDesktopApp}>
                                        {t('update.restart')}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div style={utilityPanelStyle}>
                        <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('about.projectLinks')}</div>
                        <div style={{ display: 'grid', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <GithubOutlined />
                                {aboutInfo?.repoUrl ? (
                                    <a onClick={(e) => { e.preventDefault(); if (aboutInfo?.repoUrl) BrowserOpenURL(aboutInfo.repoUrl); }} href={aboutInfo.repoUrl}>{aboutInfo.repoUrl}</a>
                                ) : t('common.unknown')}
                            </div>
                        </div>
                    </div>
                </div>
            )}
          </Modal>

          <Modal
              title={renderUtilityModalTitle(
                  themeModalSection === 'theme' ? <SkinOutlined /> : <BgColorsOutlined />,
                  themeModalSection === 'theme' ? t('theme.modal.themeTitle') : t('theme.modal.appearanceTitle'),
                  themeModalSection === 'theme'
                      ? t('theme.modal.themeDescription')
                      : t('theme.modal.appearanceDescription')
              )}
              open={isThemeModalOpen}
              onCancel={() => { setIsThemeModalOpen(false); setThemeModalSection('theme'); }}
              footer={null}
              width={820}
              styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8, height: 620, overflow: 'hidden' }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
          >
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 16, padding: '12px 0', height: '100%', minHeight: 0, overflow: 'hidden', alignItems: 'stretch' }}>
                  <div style={{ ...utilityPanelStyle, padding: 12, height: 'fit-content' }}>
                      <div style={{ marginBottom: 12, fontWeight: 600 }}>{t('theme.nav.title')}</div>
                      <div style={{ display: 'grid', gap: 10 }}>
                          {[
                              { key: 'theme', title: t('theme.nav.theme'), description: t('theme.nav.themeDescription'), icon: <SkinOutlined /> },
                              { key: 'appearance', title: t('theme.nav.appearance'), description: t('theme.nav.appearanceDescription'), icon: <BgColorsOutlined /> },
                          ].map((item) => {
                              const active = themeModalSection === item.key;
                              return (
                                  <button
                                      key={item.key}
                                      type="button"
                                      onClick={() => setThemeModalSection(item.key as 'theme' | 'appearance')}
                                      style={{
                                          textAlign: 'left',
                                          padding: '12px 12px',
                                          borderRadius: 12,
                                          border: `1px solid ${active
                                              ? (darkMode ? 'rgba(255,214,102,0.3)' : 'rgba(24,144,255,0.24)')
                                              : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                                          background: active
                                              ? (darkMode ? 'linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)' : 'linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)')
                                              : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                          color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                                          cursor: 'pointer',
                                      }}
                                  >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                          <span>{item.icon}</span>
                                          <span style={{ fontWeight: 700 }}>{item.title}</span>
                                      </div>
                                      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : utilityMutedTextStyle.color }}>
                                          {item.description}
                                      </div>
                                  </button>
                              );
                          })}
                      </div>
                  </div>
                  <div style={{ minWidth: 0, minHeight: 0, height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8, paddingBottom: 28 }}>
                      {themeModalSection === 'theme' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 10, fontWeight: 600 }}>{t('theme.nav.theme')}</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                                      {[
                                          { key: 'light', label: t('theme.light.label'), description: t('theme.light.description') },
                                          { key: 'dark', label: t('theme.dark.label'), description: t('theme.dark.description') },
                                      ].map((item) => {
                                          const active = themeMode === item.key;
                                          return (
                                              <button
                                                  key={item.key}
                                                  type="button"
                                                  onClick={() => setTheme(item.key as 'light' | 'dark')}
                                                  style={{
                                                      textAlign: 'left',
                                                      padding: '14px 14px',
                                                      borderRadius: 14,
                                                      border: `1px solid ${active
                                                          ? (darkMode ? 'rgba(255,214,102,0.3)' : 'rgba(24,144,255,0.24)')
                                                          : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)')}`,
                                                      background: active
                                                          ? (darkMode ? 'linear-gradient(180deg, rgba(255,214,102,0.12) 0%, rgba(255,214,102,0.06) 100%)' : 'linear-gradient(180deg, rgba(24,144,255,0.10) 0%, rgba(24,144,255,0.05) 100%)')
                                                          : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)'),
                                                      color: active ? (darkMode ? '#f5f7ff' : '#162033') : (darkMode ? 'rgba(255,255,255,0.82)' : '#3f4b5e'),
                                                      cursor: 'pointer',
                                                  }}
                                              >
                                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                      <span style={{ fontSize: 14, fontWeight: 700 }}>{item.label}</span>
                                                      {active ? <CheckOutlined style={{ color: darkMode ? '#ffd666' : '#1677ff' }} /> : null}
                                                  </div>
                                                  <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: active ? (darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(22,32,51,0.68)') : utilityMutedTextStyle.color }}>
                                                      {item.description}
                                                  </div>
                                              </button>
                                          );
                                      })}
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('appearance.scale')}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                      <Slider
                                        min={MIN_UI_SCALE}
                                        max={MAX_UI_SCALE}
                                        step={0.05}
                                        value={effectiveUiScale}
                                        onChange={(v) => setUiScale(Number(v))}
                                        style={{ flex: 1 }}
                                      />
                                      <span style={{ width: 56 }}>{Math.round(effectiveUiScale * 100)}%</span>
                                  </div>
                                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 4 }}>
                                      {t('appearance.scaleHint')}
                                  </div>
                              </div>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('appearance.fontSize')}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                      <Slider
                                        min={MIN_FONT_SIZE}
                                        max={MAX_FONT_SIZE}
                                        step={1}
                                        value={effectiveFontSize}
                                        onChange={(v) => setFontSize(Number(v))}
                                        style={{ flex: 1 }}
                                      />
                                      <span style={{ width: 56 }}>{effectiveFontSize}px</span>
                                  </div>
                              </div>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 10, fontWeight: 500 }}>{t('appearance.transparency')}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                                      <div>
                                          <div style={{ fontWeight: 500 }}>{t('appearance.enableTransparency')}</div>
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>{t('appearance.enableTransparencyDescription')}</div>
                                      </div>
                                      <Switch checked={appearance.enabled !== false} onChange={(checked) => setAppearance({ enabled: checked })} />
                                  </div>
                                  <div style={{ display: 'grid', gap: 14, opacity: appearance.enabled !== false ? 1 : 0.6 }}>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('appearance.opacity')}</div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                              <Slider
                                                min={0.1}
                                                max={1.0}
                                                step={0.05}
                                                disabled={appearance.enabled === false}
                                                value={appearance.opacity ?? 1.0}
                                                onChange={(v) => setAppearance({ opacity: v })}
                                                style={{ flex: 1 }}
                                              />
                                              <span style={{ width: 40 }}>{Math.round((appearance.opacity ?? 1.0) * 100)}%</span>
                                          </div>
                                      </div>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('appearance.blur')}</div>
                                          {isWindowsPlatform() ? (
                                              <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>
                                                  {t('appearance.windowsAcrylic')}
                                              </div>
                                          ) : (
                                              <>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                      <Slider
                                                        min={0}
                                                        max={20}
                                                        disabled={appearance.enabled === false}
                                                        value={appearance.blur ?? 0}
                                                        onChange={(v) => setAppearance({ blur: v })}
                                                        style={{ flex: 1 }}
                                                      />
                                                      <span style={{ width: 40 }}>{appearance.blur}px</span>
                                                  </div>
                                                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 4 }}>
                                                      {t('appearance.blurHint')}
                                                  </div>
                                              </>
                                          )}
                                      </div>
                                  </div>
                              </div>
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 10, fontWeight: 500 }}>{t('appearance.dataTableDisplay')}</div>
                                  <div style={{ display: 'grid', gap: 14 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                          <div>
                                              <div style={{ fontWeight: 500 }}>{t('appearance.showVerticalBorders')}</div>
                                              <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>{t('appearance.showVerticalBordersDescription')}</div>
                                          </div>
                                          <Switch
                                              checked={appearance.showDataTableVerticalBorders === true}
                                              onChange={(checked) => setAppearance({ showDataTableVerticalBorders: checked })}
                                          />
                                      </div>
                                      <div>
                                          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('appearance.columnWidthMode')}</div>
                                          <Segmented
                                              block
                                              options={getDataGridColumnWidthModeOptions(language)}
                                              value={appearance.dataTableColumnWidthMode}
                                              onChange={(value) => setAppearance({ dataTableColumnWidthMode: sanitizeDataTableColumnWidthMode(value) })}
                                          />
                                          <div style={{ ...utilityMutedTextStyle, marginTop: 8 }}>
                                              {t('appearance.columnWidthModeDescription')}
                                          </div>
                                      </div>
                                  </div>
                              </div>
                              {isMacRuntime ? (
                                  <div style={utilityPanelStyle}>
                                      <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('appearance.macWindowControls')}</div>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                          <div>
                                              <div style={{ fontWeight: 500 }}>{t('appearance.useNativeMacControls')}</div>
                                              <div style={{ ...utilityMutedTextStyle, marginTop: 4 }}>{t('appearance.useNativeMacControlsDescription')}</div>
                                          </div>
                                          <Switch
                                              checked={appearance.useNativeMacWindowControls === true}
                                              onChange={(checked) => setAppearance({ useNativeMacWindowControls: checked })}
                                          />
                                      </div>
                                      <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 8 }}>
                                          {t('appearance.useNativeMacControlsHint')}
                                      </div>
                                  </div>
                              ) : null}
                              <div style={utilityPanelStyle}>
                                  <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('appearance.startupWindow')}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                      <span>{isWindowsRuntime ? t('appearance.startFullscreenWindows') : t('appearance.startFullscreen')}</span>
                                      <Switch checked={startupFullscreen} onChange={(checked) => setStartupFullscreen(checked)} />
                                  </div>
                                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)', marginTop: 4 }}>
                                      {isWindowsRuntime ? t('appearance.startFullscreenWindowsHint') : t('appearance.startFullscreenHint')}
                                  </div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 12 }}>
                                  <Button
                                       onClick={() => {
                                           setUiScale(DEFAULT_UI_SCALE);
                                           setFontSize(DEFAULT_FONT_SIZE);
                                           setAppearance({ ...DEFAULT_APPEARANCE });
                                       }}
                                   >
                                       {t('common.restoreDefault')}
                                  </Button>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </Modal>

          <Modal
              title={renderUtilityModalTitle(<LinkOutlined />, t('shortcuts.title'), t('shortcuts.description'))}
              open={isShortcutModalOpen}
              onCancel={() => {
                  setIsShortcutModalOpen(false);
                  setCapturingShortcutAction(null);
              }}
              width={760}
              styles={{ content: utilityModalShellStyle, header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 }, body: { paddingTop: 8 }, footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 } }}
              footer={[
                  <Button
                      key="reset"
                      onClick={() => {
                          resetShortcutOptions();
                          setCapturingShortcutAction(null);
                          void message.success(t('shortcuts.restored'));
                      }}
                  >
                      {t('common.restoreDefault')}
                  </Button>,
                  <Button
                      key="close"
                      type="primary"
                      onClick={() => {
                          setIsShortcutModalOpen(false);
                          setCapturingShortcutAction(null);
                      }}
                  >
                      {t('common.close')}
                  </Button>,
              ]}
          >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                  <div style={utilityPanelStyle}>
                      <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>
                          {t('shortcuts.help')}
                      </div>
                  </div>
                  {SHORTCUT_ACTION_ORDER.map((action) => {
                      const meta = SHORTCUT_ACTION_META[action];
                      if (meta.platformOnly === 'mac' && !isMacRuntime) {
                          return null;
                      }
                      const binding = shortcutOptions[action] ?? { combo: '', enabled: false };
                      const isCapturing = capturingShortcutAction === action;
                      return (
                          <div
                              key={action}
                              style={{
                                  ...utilityPanelStyle,
                                  display: 'grid',
                                  gridTemplateColumns: '1fr auto',
                                  gap: 12,
                                  alignItems: 'center',
                                  padding: '10px 12px',
                              }}
                          >
                              <div>
                                  <div style={{ fontWeight: 500 }}>{t(SHORTCUT_ACTION_LABEL_KEYS[action])}</div>
                                  <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(16,24,40,0.55)' }}>{t(SHORTCUT_ACTION_DESCRIPTION_KEYS[action])}</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Input
                                      readOnly
                                      value={isCapturing ? t('shortcuts.pressShortcut') : getShortcutDisplay(binding.combo)}
                                      style={{ width: 180, fontFamily: 'Consolas, Menlo, Monaco, monospace' }}
                                  />
                                  <Button
                                      size="small"
                                      onClick={() => setCapturingShortcutAction((prev) => (prev === action ? null : action))}
                                  >
                                      {isCapturing ? t('shortcuts.recordCancel') : t('shortcuts.record')}
                                  </Button>
                                  <Switch
                                      checked={binding.enabled}
                                      onChange={(checked) => updateShortcut(action, { enabled: checked })}
                                  />
                              </div>
                          </div>
                      );
                  })}
              </div>
          </Modal>


          <Suspense fallback={null}>
              <TaskCenterModal
                  open={isTaskCenterOpen}
                  onClose={() => setIsTaskCenterOpen(false)}
                  onRunningCountChange={setRunningJobCount}
              />
          </Suspense>

          {showLinuxResizeHandles && (
              <>
                  {/* Linux Mint 下 frameless 仅局部可缩放：补四边四角命中层 */}
                  <div style={{ ...linuxResizeHandleStyleBase, top: 0, left: 14, right: 14, height: 6, cursor: 'ns-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, bottom: 0, left: 14, right: 14, height: 6, cursor: 'ns-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, top: 14, bottom: 14, left: 0, width: 6, cursor: 'ew-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, top: 14, bottom: 14, right: 0, width: 6, cursor: 'ew-resize' }} />

                  <div style={{ ...linuxResizeHandleStyleBase, top: 0, left: 0, width: 14, height: 14, cursor: 'nwse-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, top: 0, right: 0, width: 14, height: 14, cursor: 'nesw-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, bottom: 0, left: 0, width: 14, height: 14, cursor: 'nesw-resize' }} />
                  <div style={{ ...linuxResizeHandleStyleBase, bottom: 0, right: 0, width: 14, height: 14, cursor: 'nwse-resize' }} />
              </>
          )}

          {/* Ghost Resize Line for Sidebar */}
          <div
              ref={ghostRef}
              style={{
                  position: 'fixed',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: '4px',
                  background: resizeGuideColor,
                  zIndex: 9999,
                  pointerEvents: 'none',
                  display: 'none'
              }}
          />

          {/* Ghost Resize Line for Log Panel */}
          <div
              ref={logGhostRef}
              style={{
                  position: 'fixed',
                  left: visibleSidebarWidth, // Start from visible sidebar edge
                  right: 0,
                  height: '4px',
                  background: resizeGuideColor,
                  zIndex: 9999,
                  pointerEvents: 'none',
                  display: 'none',
                  cursor: 'row-resize'
              }}
          />
        </Layout>
    </ConfigProvider>
  );
}

export default App;
