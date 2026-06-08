import enUSMessages from './locales/en-US.json' with { type: 'json' };
import zhCNMessages from './locales/zh-CN.json' with { type: 'json' };

export const enUS = enUSMessages;
export type I18nKey = keyof typeof enUS;
export const zhCN: Record<I18nKey, string> = zhCNMessages;

export type AppLanguage = 'en' | 'zh';

type Primitive = string | number | boolean | null | undefined;
export type I18nParams = Record<string, Primitive>;

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export const isAppLanguage = (value: unknown): value is AppLanguage => value === 'en' || value === 'zh';

export const sanitizeLanguage = (value: unknown): AppLanguage => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh_cn' || normalized.startsWith('zh-')) {
    return 'zh';
  }
  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en_us' || normalized.startsWith('en-')) {
    return 'en';
  }
  return DEFAULT_LANGUAGE;
};



const bundles: Record<AppLanguage, Record<I18nKey, string>> = {
  en: enUS,
  zh: zhCN,
};

export const appLanguageOptions: Array<{ value: AppLanguage; labelKey: I18nKey }> = [
  { value: 'en', labelKey: 'language.english' },
  { value: 'zh', labelKey: 'language.chinese' },
];

export const interpolate = (template: string, params?: I18nParams): string => {
  if (!params) return template;
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key) => {
    const value = params[key];
    return value === null || value === undefined ? '' : String(value);
  });
};

export const translate = (language: AppLanguage, key: I18nKey, params?: I18nParams): string => {
  const bundle = bundles[sanitizeLanguage(language)] || enUS;
  const template = bundle[key] || enUS[key] || key;
  return interpolate(template, params);
};

export const translateBackendFallback = (language: AppLanguage, fallback: string): string => {
  const normalized = String(fallback || '').trim();
  if (!normalized) return translate(language, 'backend.fallback.ok');
  const fallbackMap: Record<string, I18nKey> = {
    OK: 'backend.fallback.ok',
    '事务提交成功': 'backend.fallback.applyChanges',
    'Transaction committed successfully': 'backend.fallback.applyChanges',
    '查询已取消': 'backend.fallback.queryCancelled',
    'Query cancelled': 'backend.fallback.queryCancelled',
    'Tables loaded': 'backend.fallback.tablesLoaded',
    'Query executed': 'backend.fallback.queryExecuted',
    'Query batch executed': 'backend.fallback.queryBatchExecuted',
    'Data root loaded': 'backend.fallback.dataRootLoaded',
    'Data exported': 'backend.fallback.dataExported',
    'Query exported': 'backend.fallback.queryExported',
    'Table exported': 'backend.fallback.tableExported',
    'Database SQL exported': 'backend.fallback.databaseSqlExported',
    'Tables SQL exported': 'backend.fallback.tablesSqlExported',
    'Tables data SQL exported': 'backend.fallback.tablesDataSqlExported',
    'Connections package exported': 'backend.fallback.connectionsPackageExported',
    'Empty response': 'backend.fallback.emptyResponse',
    'Request failed': 'backend.fallback.requestFailed',
    'Internal Server Error': 'backend.fallback.internalServerError',
    'Bad Request': 'backend.fallback.badRequest',
    'Forbidden': 'backend.fallback.forbidden',
    'Too Many Requests': 'backend.fallback.tooManyRequests',
    'Too many requests. Please retry later.': 'backend.fallback.tooManyRequests',
    '请求过于频繁，请稍后再试。': 'backend.fallback.tooManyRequests',
  };
  const key = fallbackMap[normalized];
  if (key) return translate(language, key);
  if (sanitizeLanguage(language) === 'zh' && !containsCjk(normalized)) {
    return translate(language, 'backend.fallback.requestFailed');
  }
  return normalized;
};


const DRIVER_MANAGER_COMPATIBILITY_FALLBACKS: Record<string, string> = {
  '默认': 'Default',
  '复用 runtime': 'Reuse runtime',
  '拉取驱动状态失败': 'Failed to load driver status',
  '驱动状态为空，请稍后重试': 'Driver status is empty. Please try again later.',
  '加载自定义数据源定义失败': 'Failed to load custom data source definitions',
  '该自定义数据源缺少驱动标识，请重新上传 Jar 修复': 'This custom data source is missing a driver identifier. Re-upload the Jar to fix it.',
  '校验自定义数据源失败': 'Failed to validate the custom data source',
  '后端未返回可用的自定义数据源定义': 'The backend did not return any usable custom data source definitions',
  '驱动网络检测失败': 'Driver network check failed',
  '驱动网络检测已完成': 'Driver network check completed',
  '保存 Maven 源失败': 'Failed to save the Maven repository',
  'Maven 源已保存，后续版本列表、自动下载与首次连接会使用该源': 'The Maven repository has been saved; future version lists, auto-downloads, and first connections will use it.',
  '设置默认驱动失败': 'Failed to set the default driver',
  '请输入上传 Jar 的驱动版本': 'Enter the driver version for the uploaded Jar',
  '上传 Jar 版本': 'Uploaded Jar version',
  '请先上传该自定义数据源的 JDBC Jar': 'Upload the JDBC Jar for this custom data source first',
  '新增自定义数据源失败': 'Failed to add custom data source',
  '这只会从新建连接的选择列表移除该数据源记录，不会删除已经上传到驱动目录的 Jar 文件。': 'This only removes the data source entry from the new-connection selector; it will not delete the Jar file already uploaded to the driver directory.',
  '打开驱动目录失败': 'Failed to open the driver directory',
  '无法自动打开驱动目录': 'Unable to open the driver directory automatically',
  '已打开驱动目录：': 'Opened driver directory:',
  '重要提醒：驱动下载链路域名不可达': 'Important: driver download chain hosts are unreachable',
  '重要提醒：驱动下载网络不可达': 'Important: driver download network is unreachable',
  '当前 Maven 驱动源或其依赖域名不可达。请检查网络连通性、Maven 源地址或本机代理规则。': 'The current Maven driver source or its dependency hosts are unreachable. Check network connectivity, Maven repository settings, or local proxy rules.',
  '需要放行的域名：': 'Required hosts to allow: ',
  '查看网络检测明细': 'View network check details',
  '恢复默认': 'Restore defaults',
  '当前生效：': 'Current active:',
  '（自定义）': '(custom)',
  '（默认）': '(default)',
  '驱动目录与复用说明': 'Driver directory and reuse notes',
  '查看驱动目录与复用说明': 'View driver directory and reuse notes',
  '打开驱动目录': 'Open driver directory',
  '新增自定义数据源': 'Add custom data source',
  '自定义数据源定义': 'Custom data source definitions',
  '还没有自定义数据源定义': 'No custom data source definitions yet',
  '定义可用': 'Definition available',
  '驱动可加载': 'Driver loadable',
  '未校验': 'Unchecked',
  '手动上传': 'Manual upload',
  'Maven 下载': 'Maven download',
  '待后端发现/校验': 'Pending backend discovery/validation',
  '校验/修复状态': 'Validate / repair status',
  '移除记录': 'Remove record',
  '驱动状态暂未加载成功': 'Driver status has not loaded successfully yet',
  '上传并保存': 'Upload and save',
  '在驱动管理中创建自定义数据源': 'Create a custom data source in Driver Manager',
  '数据源': 'Data source',
  '数据源名称': 'Data source name',
  '安装包大小': 'Package size',
  '状态': 'Status',
  '来源': 'Source',
  '默认驱动': 'Default driver',
  '安装进度': 'Install progress',
  '驱动版本': 'Driver version',
  '操作': 'Actions',
  'DSN 模板（连接字符串模板）': 'DSN template (connection string template)',
  'DSN 填写说明': 'DSN instructions',
  '定义说明（可选）': 'Definition notes (optional)',
  '驱动日志': 'Driver log',
  '安装目录：': 'Install directory:',
  '驱动可执行文件：': 'Driver executable:',
  '当前驱动暂无操作日志。': 'No operation logs are available for this driver.',
  '开始上传': 'Start upload',
  '关闭': 'Close',
  '刷新': 'Refresh',
  '网络检测': 'Network check',
  '保存': 'Save',
  '移除': 'Remove',
  '默认版本': 'Default version',
  '其他': 'Other',
  '内置可用': 'Built-in available',
  '内置待接入': 'Built-in pending integration',
  '复用': 'Reuse',
  '等待': 'Waiting for',
  '安装中': 'Installing',
  '已启用': 'Enabled',
  '已安装': 'Installed',
  '待下载': 'Pending download',
  '未启用': 'Disabled',
  '新增连接默认使用此驱动，也可在连接表单中改选。': 'New connections use this driver by default, but you can change it in the connection form.',
  '暂无多个可用兼容驱动。': 'No multiple compatible drivers are available yet.',
  '依赖': 'Dependency',
  '已安装（移除后可更换）': 'Installed (can be replaced after removal)',
  '选择驱动版本': 'Select driver version',
  '点击展开加载版本': 'Click to expand and load versions',
  'Maven metadata 不可用，仅显示推荐版本': 'Maven metadata is unavailable; only the recommended version is shown',
  'Maven metadata 不可用，仅显示推荐版本：': 'Maven metadata is unavailable; only the recommended version is shown: ',
  '当前启用：': 'Currently active:',
  '由': 'Managed by',
  '管理': 'management',
  '日志': 'Log',
  '下载/切换版本': 'Download / switch version',
  '安装启用': 'Install and enable',
  '上传 Jar': 'Upload Jar',
  '计算中...': 'Calculating...',
  '驱动元数据': 'Driver metadata',
  '未安装': 'Not installed',
  '内置': 'Built-in',
  '按需下载': 'On-demand download',
  '外置': 'External',
  '已下载': 'Downloaded',
  '当前启用': 'Currently active',
  '匹配': 'Matches',
  '共': 'Total',
  '个驱动': 'drivers',
  '当前仅支持 MongoDB 1.17.x 和 2.x；更老 1.x 暂不提供安装。': 'Only MongoDB 1.17.x and 2.x are supported for now; older 1.x versions are not offered.',
  '已下载 ': 'Downloaded ',
  ' 个版本：': ' version(s): ',
  'JavaNavi Web 会展示每个 JavaNavi 驱动的真实 Java 可用性；外部 JDBC 驱动默认按需下载或手动上传，只有实际可用后才会显示为已启用。来源列会区分 Maven 下载、手动上传、内置 runtime 与复用 runtime。': 'JavaNavi Web shows the real Java availability of each JavaNavi driver; external JDBC drivers are downloaded on demand or uploaded manually and only show as enabled once they are actually available. The source column distinguishes Maven downloads, manual uploads, built-in runtime, and reused runtime.',
  '当前 Maven 源：': 'Current Maven repository:',
  '；配置状态：': '; configuration status:',
  '已自定义': 'Custom',
  'Maven 源配置可用性：': 'Maven repository availability:',
  '可达': 'reachable',
  '不可达': 'unreachable',
  '暂无结果': 'No result yet',
  '未检测到系统代理环境变量。': 'No system proxy environment variables were detected.',
  '正在检测驱动下载网络...': 'Checking driver download network...',
  '尚未完成网络检测': 'Network check is not complete yet',
  'Maven 源配置': 'Maven repository settings',
  '自动安装和首次连接按需下载会使用这里配置的 Maven 仓库根地址，例如 Maven Central、阿里云或公司 Nexus/Artifactory。': 'Auto-install and first-connection downloads will use the Maven repository root configured here, such as Maven Central, Alibaba Cloud, or a company Nexus/Artifactory.',
  '自动下载和手动上传的驱动都会落盘到以下目录；后续版本升级可重复复用已下载驱动。': 'Automatically downloaded and manually uploaded drivers are stored in the directory below; later upgrades can reuse the downloaded drivers.',
  '点击上传 Jar 并选择文件后，会弹窗填写实际驱动版本，默认值为“': 'After clicking Upload Jar and choosing files, a dialog will ask for the actual driver version; the default value is “',
  '驱动根目录：': 'Driver root directory:',
  '运行日志文件：': 'Runtime log file:',
  '搜索驱动名称/类型（如 DuckDB、clickhouse）': 'Search driver name/type (for example, DuckDB or clickhouse)',
  '自定义数据源定义（': 'Custom data source definitions (',
  '自定义数据源定义保存驱动与 Jar；连接只保存 DSN、凭据和实例选项': 'Custom data source definitions store drivers and Jars; connections only store the DSN, credentials, and instance options.',
  '后端只返回脱敏定义元数据：驱动类、版本、Jar 文件名/校验和、驱动可加载和定义可用状态；连接是否成功仅在新建连接测试后记录。': 'The backend only returns sanitized definition metadata: driver class, version, Jar filename/checksum, whether the driver can load, and whether the definition is available; whether a connection succeeds is only recorded after testing a new connection.',
  '同步后端定义': 'Sync backend definitions',
  '点击“新增自定义数据源”上传 JDBC Jar，保存后可在新建连接中复用。': 'Click “Add custom data source” to upload a JDBC Jar; after saving, it can be reused in new connections.',
  'DSN 模板：': 'DSN template:',
  'DSN 说明：': 'DSN notes:',
  '状态：': 'Status:',
  '修复建议：': 'Repair suggestions:',
  '已自动重试；仍失败时可点击“刷新”。原因：': 'Auto-retried; if it still fails, click “Refresh”. Reason:',
  '未找到匹配“': 'No driver matched “',
  '暂无驱动数据': 'No driver data yet',
  '选择 Jar 文件': 'Choose Jar files',
  '支持一次选择主驱动 Jar 和依赖 Jar；上传版本默认写入“': 'You can select the main driver Jar and dependency Jars at once; the upload version defaults to “',
  '请输入自定义数据源名称': 'Enter a custom data source name',
  '数据源名称最多 64 个字符': 'Data source names can be up to 64 characters',
  '例如：Trino / DB2 / 自研分析库': 'For example: Trino / DB2 / in-house analytics engine',
  '请输入 DSN 模板': 'Enter the DSN template',
  'DSN 模板最多 4096 个字符': 'DSN templates can be up to 4096 characters',
  '选择该数据源新建连接时会自动带出模板，保存连接时以连接表单中最终填写的 DSN 为准。': 'When creating a new connection for this data source, the template is auto-filled; the final DSN in the connection form wins when saving.',
  '例如：jdbc:trino://host:8080/catalog/schema': 'For example: jdbc:trino://host:8080/catalog/schema',
  'DSN 说明最多 4096 个字符': 'DSN notes can be up to 4096 characters',
  '可写必填参数、常见 catalog/schema 示例或该驱动的连接注意事项。': 'You can write required parameters, common catalog/schema examples, or driver-specific connection notes.',
  '例如：请将 host、catalog、schema 替换为实际环境。': 'For example: replace host, catalog, and schema with your real environment values.',
  '说明最多 1024 个字符': 'Notes can be up to 1024 characters',
  '例如：公司内网 Trino，只包含主驱动和必要依赖 Jar。': 'For example: an internal Trino setup containing only the main driver and required dependency Jars.',
  '驱动日志 - ': 'Driver log - ',
  '定义可用；连接测试需在新建连接中执行': 'Definition is available; run the connection test from the new-connection flow.',
  '需要修复': 'Needs repair',
};

export const translateCompatibilityFallback = (
  language: AppLanguage,
  fallback: string,
  kind: 'text' | 'jsx' | 'message' = 'text',
): string => {
  const normalized = String(fallback || '').trim();
  if (!normalized) return fallback;
  if (sanitizeLanguage(language) === 'zh' || !containsCjk(normalized)) return normalized;
  const exact = DRIVER_MANAGER_COMPATIBILITY_FALLBACKS[normalized];
  if (exact) return exact;
  if (normalized.startsWith('驱动日志 - ')) return `Driver log - ${normalized.slice('驱动日志 - '.length)}`;
  if (normalized.startsWith('安装目录：')) return `Install directory: ${normalized.slice('安装目录：'.length)}`;
  if (normalized.startsWith('驱动可执行文件：')) return `Driver executable: ${normalized.slice('驱动可执行文件：'.length)}`;
  if (normalized.startsWith('当前生效：')) return `Current active: ${normalized.slice('当前生效：'.length)}`;
  if (normalized.startsWith('当前启用：')) return `Currently active: ${normalized.slice('当前启用：'.length)}`;
  if (normalized.startsWith('当前 Maven 源：')) return `Current Maven repository: ${normalized.slice('当前 Maven 源：'.length)}`;
  if (normalized.startsWith('检测到代理环境变量：')) return `Detected proxy environment variables: ${normalized.slice('检测到代理环境变量：'.length)}`;
  if (normalized.startsWith('运行日志文件：')) return `Runtime log file: ${normalized.slice('运行日志文件：'.length)}`;
  if (normalized.startsWith('DSN 模板：')) return `DSN template: ${normalized.slice('DSN 模板：'.length)}`;
  if (normalized.startsWith('DSN 说明：')) return `DSN notes: ${normalized.slice('DSN 说明：'.length)}`;
  if (normalized.startsWith('状态：')) return `Status: ${normalized.slice('状态：'.length)}`;
  if (normalized.startsWith('修复建议：')) return `Repair suggestions: ${normalized.slice('修复建议：'.length)}`;
  if (normalized.startsWith('已新增自定义数据源：')) return `Added custom data source: ${normalized.slice('已新增自定义数据源：'.length)}`;
  if (normalized.startsWith('已移除自定义数据源：')) return `Removed custom data source: ${normalized.slice('已移除自定义数据源：'.length)}`;
  if (normalized.startsWith('拉取驱动状态失败：')) return `Failed to load driver status: ${normalized.slice('拉取驱动状态失败：'.length)}`;
  if (normalized.endsWith(' 定义可用；连接测试需在新建连接中执行')) return `${normalized.slice(0, -16)} definition is available; run the connection test from the new-connection flow.`;
  if (normalized.endsWith(' 需要修复')) return `${normalized.slice(0, -5)} needs repair`;
  if (normalized.startsWith('驱动网络检测失败：')) return `Driver network check failed: ${normalized.slice('驱动网络检测失败：'.length)}`;
  if (normalized.startsWith('Maven metadata 不可用，仅显示推荐版本：')) return `Maven metadata is unavailable; only the recommended version is shown: ${normalized.slice('Maven metadata 不可用，仅显示推荐版本：'.length)}`;
  if (normalized.endsWith(' 版本列表加载失败')) return `${normalized.slice(0, -8)} version list failed to load`;
  if (normalized.startsWith('加载 ') && normalized.includes(' 版本列表失败：')) {
    const [name, reason] = normalized.slice(3).split(' 版本列表失败：');
    return `Failed to load ${name} version list: ${reason}`;
  }
  if (normalized.includes(' 默认驱动已设置为 ')) {
    const [name, target] = normalized.split(' 默认驱动已设置为 ');
    return `${name} default driver was set to ${target}`;
  }
  if (normalized.startsWith('由 ') && normalized.endsWith(' 管理')) return `Managed by ${normalized.slice(2, -3)}`;
  if (normalized.startsWith('设置默认驱动失败：')) return `Failed to set the default driver: ${normalized.slice('设置默认驱动失败：'.length)}`;
  if (normalized.startsWith('默认使用“') && normalized.includes('”；该版本仅标识手动上传来源，不影响 Maven 下载版本。')) {
    const version = normalized.slice(5, normalized.indexOf('”；'));
    return `Default is “${version}”; this version only labels the manual-upload source and does not affect Maven download versions.`;
  }
  if (normalized.startsWith('移除自定义数据源 ')) return `Remove custom data source ${normalized.slice('移除自定义数据源 '.length)}`;
  if (normalized.endsWith(' 已下载并启用')) return `${normalized.slice(0, -7)} downloaded and enabled`;
  if (normalized.startsWith('已打开驱动目录：')) return `Opened driver directory: ${normalized.slice('已打开驱动目录：'.length)}`;
  if (normalized.includes('；路径已复制：')) {
    const [left, right] = normalized.split('；路径已复制：');
    return `${translateCompatibilityFallback('en', left, kind)}; copied path: ${right}`;
  }
  if (normalized.startsWith('无法自动打开驱动目录，请手动打开：')) return `Unable to open the driver directory automatically. Open it manually: ${normalized.slice('无法自动打开驱动目录，请手动打开：'.length)}`;
  if (normalized.startsWith('打开驱动目录失败: ')) return `Failed to open the driver directory: ${normalized.slice('打开驱动目录失败: '.length)}`;
  if (normalized.endsWith(' 已移除')) return `${normalized.slice(0, -4)} removed`;
  if (normalized.endsWith('（已安装，移除后可更换）')) return `${normalized.slice(0, -12)} (installed; remove to change)`;
  if (normalized.startsWith('若仍失败，请在代理规则放行：') && normalized.endsWith('；仍无法调整规则时，再考虑开启 TUN 模式。')) {
    const hosts = normalized.slice('若仍失败，请在代理规则放行：'.length, -17);
    return `If it still fails, allow in proxy rules: ${hosts}; if you still cannot adjust the rules, consider enabling TUN mode.`;
  }
  if (normalized.startsWith('驱动根目录：')) return `Driver root directory: ${normalized.slice('驱动根目录：'.length)}`;
  if (normalized.startsWith('已自动重试；仍失败时可点击“刷新”。原因：')) return `Auto-retried; if it still fails, click “Refresh”. Reason: ${normalized.slice('已自动重试；仍失败时可点击“刷新”。原因：'.length)}`;
  if (normalized === '取消') return 'Cancel';
  if (normalized.startsWith('未找到匹配“') && normalized.endsWith('”的驱动')) {
    return `No driver matched “${normalized.slice(6, -4)}”`;
  }
  if (normalized.startsWith('自定义数据源定义（') && normalized.endsWith('）')) {
    return `Custom data source definitions (${normalized.slice(9, -1)})`;
  }
  if (normalized.startsWith('填写 ')) {
    const suffix = normalized.slice(3);
    if (suffix.endsWith(' 上传版本')) {
      return `Enter upload version for ${suffix.slice(0, -5)}`;
    }
  }
  if (normalized.includes('驱动管理')) return normalized.replace(/驱动管理/g, 'Driver Manager');
  if (normalized.includes('Maven 源')) return normalized.replace(/Maven 源/g, 'Maven repository');
  if (normalized.includes('JDBC Jar')) return normalized.replace(/JDBC Jar/g, 'JDBC Jar');
  if (normalized.includes('Jar')) return normalized.replace(/Jar/g, 'Jar');
  return translate('en', MESSAGE_FALLBACK_KEYS[kind]);
};

export const containsCjk = (value: unknown): boolean => /[\u4e00-\u9fff]/.test(String(value ?? ''));

export const localizeCjkFallback = (
  language: AppLanguage,
  value: string,
  englishFallback: string = translate(language, 'generic.frontend.defaultChineseNotice'),
): string => {
  const text = String(value ?? '');
  return sanitizeLanguage(language) === 'zh' || !containsCjk(text) ? text : englishFallback;
};

export const currentLanguageHeaderValue = (language: AppLanguage): string => (sanitizeLanguage(language) === 'zh' ? 'zh-CN' : 'en');

export const currentHtmlLangValue = (language: AppLanguage): string => (sanitizeLanguage(language) === 'zh' ? 'zh-CN' : 'en');

export const languageStorageKey = 'javanavi.language';

export const setRuntimeLanguage = (language: AppLanguage): void => {
  const sanitized = sanitizeLanguage(language);
  if (typeof window !== 'undefined') {
    (window as unknown as { __javanaviLanguage?: AppLanguage }).__javanaviLanguage = sanitized;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(languageStorageKey, sanitized);
    } catch {
      // Ignore storage failures; the Zustand store remains the authoritative source.
    }
  }
};

export const getRuntimeLanguage = (): AppLanguage => {
  if (typeof window !== 'undefined') {
    const runtimeLanguage = (window as unknown as { __javanaviLanguage?: unknown }).__javanaviLanguage;
    if (isAppLanguage(runtimeLanguage)) {
      return runtimeLanguage;
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const storedLanguage = localStorage.getItem(languageStorageKey);
      if (storedLanguage) {
        return sanitizeLanguage(storedLanguage);
      }
      const persisted = localStorage.getItem('lite-db-storage');
      if (persisted) {
        const parsed = JSON.parse(persisted);
        const state = parsed?.state && typeof parsed.state === 'object' ? parsed.state : parsed;
        return sanitizeLanguage(state?.language);
      }
    } catch {
      // Ignore storage failures and continue to the persisted app store fallback.
    }
  }
  return DEFAULT_LANGUAGE;
};

const MESSAGE_FALLBACK_KEYS: Record<'text' | 'jsx' | 'message', I18nKey> = {
  text: 'generic.frontend.defaultChineseNotice',
  jsx: 'generic.frontend.chineseOnlyJsx',
  message: 'generic.frontend.chineseOnlyMessage',
};

export const installCompatibilityI18nFallback = (): void => {
  if (typeof window === 'undefined') return;
  const target = globalThis as typeof globalThis & {
    __javanaviI18nCompatText?: (text: string, kind?: string) => string;
  };
  target.__javanaviI18nCompatText = (text: string, kind = 'text') => {
    if (getRuntimeLanguage() === 'zh' || !containsCjk(text)) {
      return text;
    }
    return translateCompatibilityFallback('en', text, kind as 'text' | 'jsx' | 'message');
  };
};
