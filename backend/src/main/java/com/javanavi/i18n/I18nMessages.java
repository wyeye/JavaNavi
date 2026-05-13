package com.javanavi.i18n;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class I18nMessages {
    private final Map<String, String> en = new LinkedHashMap<>();
    private final Map<String, String> zh = new LinkedHashMap<>();

    public I18nMessages() {
        put("request.invalid", "Invalid request: {message}", "请求无效：{message}");
        put("request.validation", "Request did not match the JavaNavi compatibility contract.", "请求不符合 JavaNavi 兼容接口约定。");
        put("request.notFound", "Requested API endpoint was not found.", "请求的 API 不存在。");
        put("request.nullPointer", "Internal server error.", "服务内部异常。");
        put("request.rateLimited", "Too many requests. Please retry later.", "请求过于频繁，请稍后再试。");
        put("request.unexpected", "Request failed: {message}", "请求处理失败：{message}");
        put("backend.untranslatedError", "Operation failed.", "操作失败，请查看后端日志。");
        put("app.state", "Application state error: {message}", "应用状态异常：{message}");
        put("query.notRunning", "Query does not exist or has already completed.", "查询不存在或已经完成。");
        put("connection.unsupportedDriver", "Connection failed: {message}", "连接失败：{message}");
        put("connection.jdbcProfiles", "JavaNavi currently wires JDBC drivers for bundled relational, file, analytics, time-series, and custom DSN runtime profiles.", "JavaNavi 当前支持内置关系型、文件型、分析型、时序型以及自定义 DSN runtime 的 JDBC 驱动配置。");
        put("connection.compatProfiles", "JavaNavi currently wires JDBC drivers for mysql-compatible, postgresql-compatible, sqlite, duckdb, and custom JDBC DSN profiles.", "JavaNavi 当前支持 MySQL 兼容、PostgreSQL 兼容、SQLite、DuckDB 与自定义 JDBC DSN 配置。");
        put("connection.demoOnly", "Only demo/h2 driverType is wired in the phase-1 API shell.", "当前 phase-1 API shell 仅接入 demo/h2 driverType。");
        put("query.readOnlySelectOnly", "Phase-1 query endpoint only allows read-only SELECT statements.", "Phase-1 查询接口仅允许只读 SELECT 语句。");
        put("connection.failed", "Connection failed.", "连接失败。");
        put("connection.jdbcRuntimeUnavailable", "JDBC driver runtime service is not available in this verification context.", "JDBC 驱动运行时服务在当前验证上下文中不可用。");
        put("connection.customDsnRequired", "Custom JDBC connection string is required.", "自定义 JDBC 连接字符串不能为空。");
        put("connection.customDsnJdbcUrlRequired", "Custom JDBC connection string must be a jdbc: URL for driver {driver}.", "自定义 JDBC 连接字符串必须是驱动 {driver} 的 jdbc: URL。");
        put("connection.sqlitePathRequired", "SQLite connection file path is required.", "SQLite 连接文件路径不能为空。");
        put("connection.sqliteUrlControlChars", "SQLite JDBC URL contains unsupported control characters.", "SQLite JDBC URL 包含不支持的控制字符。");
        put("connection.sqlitePathControlChars", "SQLite connection file path contains unsupported control characters.", "SQLite 连接文件路径包含不支持的控制字符。");
        put("connection.sqlitePathQueryFragment", "SQLite connection file path must not contain URL query or fragment control characters.", "SQLite 连接文件路径不能包含 URL 查询或片段控制字符。");
        put("connection.duckdbPathRequired", "DuckDB connection file path is required.", "DuckDB 连接文件路径不能为空。");
        put("connection.duckdbUrlControlChars", "DuckDB JDBC URL contains unsupported control characters.", "DuckDB JDBC URL 包含不支持的控制字符。");
        put("connection.duckdbPathControlChars", "DuckDB connection file path contains unsupported control characters.", "DuckDB 连接文件路径包含不支持的控制字符。");
        put("connection.duckdbPathQueryFragment", "DuckDB connection file path must not contain URL query or fragment control characters.", "DuckDB 连接文件路径不能包含 URL 查询或片段控制字符。");
        put("connection.customJdbcUrlControlChars", "Custom JDBC URL contains unsupported control characters.", "自定义 JDBC URL 包含不支持的控制字符。");
        put("connection.externalFieldRequired", "Connection {field} is required for external JDBC drivers.", "外部 JDBC 驱动连接字段 {field} 不能为空。");
        put("connection.databaseControlChars", "Connection database contains unsupported URL control characters.", "连接数据库名包含不支持的 URL 控制字符。");
        put("mongodb.configRequired", "MongoDB connection config is required.", "MongoDB 连接配置不能为空。");
        put("mongodb.skipExampleHost", "JavaNavi skipped MongoDB network probing for documentation/example host.", "JavaNavi 已跳过文档/示例主机的 MongoDB 网络探测。");
        put("events.invalidFixture", "Invalid event fixture: {message}", "事件样例无效：{message}");
        put("drivers.invalidRequest", "Invalid driver request: {message}", "驱动请求无效：{message}");
        put("drivers.state", "Driver state error: {message}", "驱动状态异常：{message}");
        put("files.invalidRequest", "Invalid file workflow request: {message}", "文件流程请求无效：{message}");
        put("files.state", "File workflow state error: {message}", "文件流程状态异常：{message}");
        put("redis.operationFailed", "Redis operation failed: {message}", "Redis 操作失败：{message}");
        put("security.originRejected", "Request origin is not allowed for JavaNavi local API.", "请求来源不允许访问 JavaNavi 本地 API。");
        put("security.localSessionRequired", "A valid JavaNavi local session token is required for credential-bearing API calls.", "涉及凭据的 API 调用需要有效的 JavaNavi 本地会话令牌。");
        put("common.operationSucceeded", "Operation succeeded.", "操作成功。");
        put("common.connectionSucceeded", "Connection succeeded.", "连接成功。");
        put("common.setSucceeded", "Saved successfully.", "设置成功。");
        put("common.deleteSucceeded", "Deleted successfully.", "删除成功。");
        put("common.addSucceeded", "Added successfully.", "添加成功。");
        put("common.renameSucceeded", "Renamed successfully.", "重命名成功。");
        put("common.clearSucceeded", "Cleared successfully.", "清空成功。");
        put("redis.keyGone", "Redis key does not exist or has expired.", "Redis Key 不存在或已过期。");
        put("redis.commandRequired", "Command is required.", "命令不能为空。");
        put("redis.databaseRange", "Database index must be between 0 and 15.", "数据库索引必须在 0-15 之间。");
        put("redis.membersRequired", "members cannot be empty.", "members 不能为空。");
        put("redis.streamFieldsRequired", "Stream fields cannot be empty.", "Stream 字段不能为空。");
        put("redis.unsupportedType", "Unsupported Redis data type: {type}", "不支持的 Redis 数据类型：{type}");
        put("redis.runtimeExclusion", "Redis SSH/Proxy/HTTP Tunnel runtime is not supported yet; use direct Redis TCP.", "Redis 暂不支持 SSH/Proxy/HTTP Tunnel 运行时；请使用直连 Redis TCP。");
        put("redis.connectionFailed", "Redis connection failed: {message}", "Redis 连接失败：{message}");
        put("redis.commandFailed", "Redis command execution failed: {message}", "Redis 命令执行失败：{message}");
        put("redis.required", "{name} cannot be empty.", "{name} 不能为空。");
        put("redis.unsupportedTypePrefix", "Unsupported Redis data type: {type}", "不支持的 Redis 数据类型：{type}");
        put("sync.targetTableMissing", "Target table {table} does not exist or its column definition was not read.", "目标表 {table} 不存在或未读取到字段定义。");
        put("sync.tableSelectionRequired", "JDBC table sync requires at least one source/target table selection.", "JDBC 表同步要求至少选择一个源/目标表。");
        put("sync.pkColumnMissing", "Source result is missing target primary key column {column}; table-to-table diff sync cannot run.", "源表结果缺少目标主键列 {column}，无法执行表到表差异同步。");
        put("sync.sqlTargetNoPk", "Target table has no primary key; SQL result-set diff analysis is not supported.", "目标表无主键，不支持基于 SQL 结果集的差异分析。");
        put("sync.sqlTargetCompositePk", "Target table has composite primary key ({columns}); SQL result-set diff analysis is not supported yet.", "目标表为复合主键（{columns}），暂不支持基于 SQL 结果集的差异分析。");
        put("sync.sqlDataOnly", "SQL result-set sync currently supports data-only sync only.", "SQL 结果集同步当前仅支持仅同步数据。");
        put("sync.sqlSingleTargetRequired", "SQL result-set sync requires exactly one target table.", "SQL 结果集同步要求且仅允许选择一个目标表。");
        put("drivers.unsupportedType", "Unsupported driver type: {type}", "不支持的驱动类型：{type}");
        put("drivers.invalidCustomId", "Invalid custom driver identifier: {type}", "无效的自定义驱动标识：{type}");
        put("drivers.jdbcJarOnly", "Only JDBC Jar files are supported: {file}", "仅支持上传 JDBC Jar 文件：{file}");
        put("drivers.noJdbcDriverInJar", "No java.sql.Driver was found in the uploaded Jar. Ensure this is a JDBC 4+ driver Jar and includes META-INF/services/java.sql.Driver.", "未能在上传的 Jar 中识别 java.sql.Driver，请确认这是 JDBC 4+ 驱动 Jar 并包含 META-INF/services/java.sql.Driver。");
        put("drivers.unsupportedDownloadType", "Unsupported on-demand JDBC driver type: {type}", "不支持按需下载的 JDBC 驱动类型：{type}");
        put("drivers.workspaceReady", "JavaNavi Web Driver Manager is using the local managed workspace; JDBC drivers can be downloaded from Maven Central and verified on demand.", "JavaNavi Web 驱动管理已使用本地受管工作区；JDBC 驱动可按需从 Maven Central 下载并校验。");
        put("drivers.workspaceUnavailable", "JavaNavi Web driver workspace is unavailable. Check data directory permissions.", "JavaNavi Web 驱动工作区不可用，请检查数据目录权限。");
        put("drivers.workspaceDirectoryUnavailable", "Workspace directory is unavailable", "工作区目录不可用");
        put("drivers.invalidRepositoryUrl", "Invalid repository URL", "Maven 源地址无效");
        put("drivers.httpFallbackFailed", "HTTP {status}; fallback to GET failed", "HTTP {status}；回退 GET 失败");
        put("drivers.httpFallbackFailedWithReason", "HTTP {status}; fallback to GET failed: {reason}", "HTTP {status}；回退 GET 失败：{reason}");
        put("drivers.httpStatus", "HTTP {status}", "HTTP {status}");
        put("drivers.requestInterrupted", "Request interrupted", "请求已中断");
        put("drivers.connectionTimedOut", "Connection timed out", "连接超时");
        put("drivers.readTimedOut", "Read timed out", "读取超时");
        put("drivers.dnsLookupFailed", "DNS lookup failed", "DNS 解析失败");
        put("drivers.tlsHandshakeFailed", "TLS handshake failed", "TLS 握手失败");
        put("drivers.connectionRefused", "Connection refused", "连接被拒绝");
        put("drivers.noRouteToHost", "No route to host", "无可达路由");
        put("drivers.defaultMustBeAvailable", "Only an available compatible driver can be set as the default driver.", "只能把已可用的兼容驱动设置为默认驱动");
        put("drivers.uploadOneJar", "Upload at least one JDBC Jar file.", "请至少上传一个 JDBC Jar 文件");
        put("drivers.versionRequiredBeforeUpload", "Enter a driver version before uploading JDBC Jars.", "上传 JDBC Jar 前请输入驱动版本");
        put("drivers.uploadNonEmptyJar", "Upload at least one non-empty JDBC Jar file.", "请至少上传一个非空 JDBC Jar 文件");
        put("drivers.builtinCannotRemove", "Built-in drivers cannot be removed.", "内置驱动不可移除");
        put("drivers.onDemandDownload", "On-demand download", "按需下载");
        put("drivers.mavenSourcePrefix", "Maven source: ", "Maven 源：");
        put("drivers.recommendedSuffix", " (recommended)", "（推荐）");
        put("drivers.uploadVersionFallback", "upload-1.0", "上传-1.0");
        put("drivers.emptyVersionMetadata", "Maven metadata did not contain usable versions.", "Maven metadata 未包含可用版本");
        put("drivers.versionMetadataUnavailable", "Only the recommended version is shown because Maven metadata is unavailable: {reason}", "Maven metadata 不可用，仅显示推荐版本：{reason}");
        put("drivers.openDirDisabledPrefix", "Automatic directory opening is disabled in this environment. Copy the path manually: ", "自动打开目录已被当前环境禁用，请手动复制路径：");
        put("drivers.openedDirPrefix", "Opened driver directory: ", "已打开驱动目录：");
        put("drivers.openDirInterruptedPrefix", "Opening the driver directory was interrupted. Copy the path manually: ", "打开驱动目录被中断，请手动复制路径：");
        put("drivers.openDirFailedPrefix", "Unable to open the driver directory automatically. Copy the path manually: ", "无法自动打开驱动目录，请手动复制路径：");
        put("drivers.missingJdbcDownloadable", "This backend package does not include the JDBC driver; download it on demand in Driver Manager or let the first connection download it automatically.", "当前后端包未内置该 JDBC 驱动；可在驱动管理器中按需下载，或首次连接时自动下载。");
        put("drivers.missingUseFullBuild", "This backend package does not include the driver; download it on demand in Driver Manager or upload the JDBC Jar manually.", "当前后端包未内置该驱动；请在驱动管理器中按需下载，或手动上传 JDBC Jar。");
        put("drivers.metadataRegisteredPrefix", "Driver package metadata registered; ", "驱动包元数据已登记；");
        put("drivers.missingCanDownloadJar", "This backend package does not include the driver; download the JDBC Jar on demand through Driver Manager.", "当前后端包未内置该驱动；可通过驱动管理器按需下载 JDBC Jar");
        put("drivers.missingUseFullJdbcPackage", "This backend package does not include the driver; download it on demand in Driver Manager or upload the JDBC Jar manually.", "当前后端包未内置该驱动；请在驱动管理器中按需下载，或手动上传 JDBC Jar。");
        put("drivers.builtinDriverNoSuffix", "Built-in driver: ", "内置驱动");
        put("common.switchSucceeded", "Switched successfully.", "切换成功");
        put("drivers.mavenDownload", "Maven download", "Maven 下载");
        put("drivers.mavenSourceDownload", "Download from Maven source", "通过 Maven 源下载");
        put("drivers.manualUpload", "Manual upload", "手动上传");
        put("drivers.uploadInstallDetail", "Installed by uploading a Jar through Driver Manager", "通过驱动管理上传 Jar 安装");
        put("drivers.metadata", "Driver metadata", "驱动元数据");
        put("drivers.notInstalled", "Not installed", "未安装");
        put("drivers.builtinRuntime", "Built-in runtime", "内置 runtime");
        put("drivers.builtinDriver", "Built-in driver", "内置驱动");
        put("drivers.noDownloadNeeded", "No extension package download is required.", "无需下载扩展包");
        put("drivers.noVersionNeeded", "No version selection is required.", "无需选择版本");
        put("drivers.noInstallNeeded", "No extension package installation is required.", "无需安装扩展包");
        put("drivers.noUploadNeeded", "No extension package upload is required.", "无需上传扩展包");
        put("drivers.openDirDisabled", "Automatic directory opening is disabled in this environment. Copy the path manually: {path}", "自动打开目录已被当前环境禁用，请手动复制路径：{path}");
        put("drivers.openedDir", "Opened driver directory: {path}", "已打开驱动目录：{path}");
        put("drivers.openDirInterrupted", "Opening the driver directory was interrupted. Copy the path manually: {path}", "打开驱动目录被中断，请手动复制路径：{path}");
        put("drivers.openDirFailed", "Unable to open the driver directory automatically. Copy the path manually: {path}{suffix}", "无法自动打开驱动目录，请手动复制路径：{path}{suffix}");
        put("drivers.metadataRemoved", "Driver package metadata removed.", "驱动包元数据已移除");
        put("drivers.metadataCacheRemoved", "Driver package metadata and cached Jar removed.", "驱动包元数据与缓存 Jar 已移除");
        put("drivers.customJarUploaded", "Custom data source JDBC Jar uploaded and enabled.", "自定义数据源 JDBC Jar 已上传并启用。");
        put("drivers.customDefinitionUsable", "Custom JDBC definition is usable. DSN-level connection is not tested yet.", "自定义 JDBC 定义可用；尚未测试 DSN 级连接。");
        put("drivers.customDefinitionRepairRequired", "Custom JDBC definition requires repair.", "自定义 JDBC 定义需要修复。");
        put("drivers.customDefinitionMetadataMissing", "Re-upload this custom JDBC Jar so JavaNavi can recreate driver metadata.", "请重新上传此自定义 JDBC Jar，以便 JavaNavi 重新生成驱动元数据。");
        put("drivers.customDefinitionJarMissing", "The managed Jar files are missing. Upload the custom driver package again.", "受管 Jar 文件缺失，请重新上传自定义驱动包。");
        put("drivers.customDefinitionClassMissing", "No driver class is recorded. Upload a Jar that exposes java.sql.Driver via service metadata.", "未记录驱动类，请上传通过服务元数据暴露 java.sql.Driver 的 Jar。");
        put("drivers.customDefinitionClassLoadFailed", "The JDBC driver class could not be loaded. Include required dependency Jars and re-upload.", "无法加载 JDBC 驱动类，请包含所需依赖 Jar 后重新上传。");
        put("drivers.defaultIncompatible", "{driver} cannot be used as a compatible driver for {database}.", "{driver} 不能作为 {database} 的兼容驱动。");
        put("drivers.reuseManagedByOwner", "{driver} reuses the {owner} JDBC driver. Manage this driver in the {owner} row.", "{driver} 复用 {owner} JDBC 驱动，请在 {owner} 行管理该驱动。");
        put("drivers.reuseRuntimeStatus", "{driver} is currently reusing the {owner} JDBC driver; {driver} was not downloaded or installed separately.", "{driver} 当前复用 {owner} JDBC 驱动；未单独下载或安装 {driver} 驱动。");
        put("drivers.reuseRuntimeDependency", "{driver} depends on the {owner} JDBC driver. Download or import it in the {owner} row first.", "{driver} 依赖 {owner} JDBC 驱动；请在 {owner} 行下载或导入后使用。");
        put("drivers.reuseRuntimeLabel", "Reusing {owner} driver", "复用 {owner} 驱动");
        put("drivers.reuseRuntimeSourceLabel", "Reusing {owner} · {label}", "复用 {owner} · {label}");
        put("drivers.reuseRuntimeSourceDetail", "{driver} reuses the {owner} JDBC runtime", "{driver} 复用 {owner} JDBC runtime");
        put("drivers.recordedMetadata", "JavaNavi Web recorded driver metadata in the managed workspace; runtime activation remains explicit in the status row.", "JavaNavi Web 已在受管工作区记录驱动元数据；runtime 激活状态请以状态行显示为准。");
        put("drivers.recordedLocalImport", "JavaNavi Web recorded a managed local driver-package import.", "JavaNavi Web 已记录一次受管本地驱动包导入。");
        put("drivers.runtimeDirectoryManaged", "JavaNavi Web driver runtime directory is managed inside the backend data directory.", "JavaNavi Web 驱动 runtime 目录由后端数据目录统一管理。");
        put("drivers.uploadPathEscaped", "Uploaded JDBC driver files must stay inside the JavaNavi managed data directory.", "上传的 JDBC 驱动文件必须保留在 JavaNavi 受管数据目录内。");
        put("drivers.uploadFileEscaped", "Uploaded JDBC driver file path escaped the managed upload directory.", "上传的 JDBC 驱动文件路径越过了受管上传目录。");
        put("drivers.storeUploadedJar", "Unable to store uploaded JDBC driver jar: {file}", "无法保存上传的 JDBC 驱动 Jar：{file}");
        put("drivers.workspacePathManaged", "Driver workspace paths must stay inside the JavaNavi managed data directory.", "驱动工作区路径必须保留在 JavaNavi 受管数据目录内。");
        put("drivers.writeMetadataFailed", "Unable to write JavaNavi driver package metadata.", "无法写入 JavaNavi 驱动包元数据。");
        put("drivers.readMetadataFailed", "Unable to read JavaNavi driver package metadata.", "无法读取 JavaNavi 驱动包元数据。");
        put("drivers.writeDefaultsFailed", "Unable to write JavaNavi default driver settings.", "无法写入 JavaNavi 默认驱动设置。");
        put("drivers.readDefaultsFailed", "Unable to read JavaNavi default driver settings.", "无法读取 JavaNavi 默认驱动设置。");
        put("drivers.prepareWorkspaceFailed", "Unable to prepare JavaNavi driver workspace.", "无法准备 JavaNavi 驱动工作区。");
        put("drivers.removeMetadataFailed", "Unable to remove JavaNavi driver package metadata.", "无法移除 JavaNavi 驱动包元数据。");
        put("drivers.removeTempUploadFailed", "Unable to remove temporary JDBC driver upload.", "无法移除临时 JDBC 驱动上传目录。");
        put("connections.unsupportedPackage", "Unsupported connection restore package format.", "不支持的连接恢复包格式");
        put("connections.importTooLarge", "Connection import file is too large.", "连接导入文件过大");
        put("connections.badPasswordOrCorrupt", "File password is incorrect or the file is corrupted.", "文件密码错误或文件已损坏");
        put("connections.packageTooLarge", "Connection restore package is too large.", "连接恢复包过大");
        put("connections.passwordRequired", "Restore package password is required.", "恢复包密码不能为空");
        put("sync.sqlDiffDone", "SQL result-set diff analysis completed.", "SQL 结果集差异分析完成");
        put("sync.sqlPreview", "SQL result-set sync preview.", "SQL 结果集同步预览");
        put("sync.jdbcDiffDone", "JDBC table-to-table diff analysis completed.", "JDBC 表到表差异分析完成");
        put("sync.jdbcPreview", "JDBC table-to-table sync preview.", "JDBC 表到表同步预览");
        put("schemaSync.analysisCompleted", "Schema sync analysis completed.", "结构同步分析完成。");
        put("schemaSync.noChanges", "No structure changes detected.", "未检测到结构变更。");
        put("schemaSync.changesDetected", "Structure changes detected.", "检测到结构变更。");
        put("schemaSync.previewLoaded", "Schema sync preview loaded.", "结构同步预览已加载。");
        put("schemaSync.previewSummary", "Schema diff preview", "结构差异预览");
        put("schemaSync.runCompleted", "Structure sync completed.", "结构同步完成。");
        put("schemaSync.deleteConfirmRequired", "Delete confirmation is required before executing structure sync.", "执行结构同步前需要确认删除类变更。");
        put("schemaSync.failed", "Structure sync failed.", "结构同步失败。");
        put("files.selectOnlyExport", "Only SELECT/WITH query export is supported.", "仅支持 SELECT/WITH 查询导出");
        put("files.safeTableRequired", "Table name is required and may contain only safe identifier characters.", "表名不能为空，且只能包含安全标识符字符。");
        put("files.revealExportDisabled", "Automatic export file reveal is disabled in this environment. Copy the file path manually: {path}", "自动定位导出文件已被当前环境禁用，请手动复制文件路径：{path}");
        put("files.revealedExportFile", "Export completed and the file has been selected in the system file manager: {path}", "导出完成，已在系统文件管理器中定位文件：{path}");
        put("files.openedExportDirectory", "Export completed and the containing directory has been opened: {directory}", "导出完成，已打开文件所在目录：{directory}");
        put("files.revealExportInterrupted", "Export completed, but opening the exported file location was interrupted. Copy the file path manually: {path}", "导出完成，但打开导出文件位置时被中断，请手动复制文件路径：{path}");
        put("files.revealExportFailed", "Export completed, but the exported file location could not be opened automatically. Copy the file path manually: {path}{suffix}", "导出完成，但无法自动打开导出文件位置，请手动复制文件路径：{path}{suffix}");
        put("events.readSource", "Read source data", "读取源数据");
        put("events.writeTarget", "Write target table", "写入目标表");
        put("events.complete", "Complete", "完成");
        put("ai.prompt.explainSql", "Explain the current SQL intent, potential risks, and optimization opportunities.", "解释当前 SQL 的执行意图、潜在风险和可优化点。");
        put("ai.prompt.optimizeSql", "Optimize the SQL without changing semantics and include index recommendations.", "在不改变语义的前提下优化 SQL，并说明索引建议。");
        put("ai.prompt.generateQuery", "Generate a read-only query from the current database schema and avoid destructive statements by default.", "根据当前数据库结构生成只读查询，默认避免破坏性语句。");
        put("ai.prompt.summarizeResult", "Summarize key patterns, outliers, and recommended follow-up analysis for the result set.", "总结结果集的关键模式、异常值和后续分析建议。");
        put("backend.localizedFallback", "{message}", "{message}");
    }

    public String message(String code, Object... args) {
        return message(I18nContext.language(), code, args);
    }

    public String message(AppLanguage language, String code, Object... args) {
        String template = (language == AppLanguage.ZH ? zh : en).get(code);
        if (template == null) {
            template = en.getOrDefault(code, code);
        }
        return interpolate(template, args);
    }

    public String localizeFallback(String message) {
        String normalized = message == null ? "" : message.trim();
        if (normalized.isBlank()) {
            return message("common.operationSucceeded");
        }
        Map<String, String> fallbackCodes = Map.ofEntries(
                Map.entry("Connection OK", "common.connectionSucceeded"),
                Map.entry("Connection failed", "connection.failed"),
                Map.entry("Too many requests. Please retry later.", "request.rateLimited"),
                Map.entry("Too many requests for /api/v1/query", "request.rateLimited"),
                Map.entry("Too many requests for /api/v1/query/multi", "request.rateLimited"),
                Map.entry("request.rateLimited", "request.rateLimited"),
                Map.entry("Internal Server Error", "request.nullPointer"),
                Map.entry("AI provider payload is required.", "request.invalid"),
                Map.entry("AI provider endpoint is required.", "request.invalid"),
                Map.entry("AI provider endpoint must use http or https.", "request.invalid"),
                Map.entry("AI provider endpoint host is required.", "request.invalid"),
                Map.entry("AI provider/session id is required.", "request.invalid"),
                Map.entry("Unable to read JavaNavi AI state.", "app.state"),
                Map.entry("Unable to write JavaNavi AI state.", "app.state"),
                Map.entry("Unable to write JavaNavi app state.", "app.state"),
                Map.entry("Unable to read JavaNavi app state.", "app.state"),
                Map.entry("Unable to write JavaNavi diagnostic log.", "app.state"),
                Map.entry("Unable to export JavaNavi connections package.", "app.state"),
                Map.entry("Unable to derive JavaNavi connection package app key.", "app.state"),
                Map.entry("Unable to read JavaNavi saved connections.", "app.state"),
                Map.entry("Unable to write JavaNavi saved connections.", "app.state"),
                Map.entry("Please upload a non-empty SQL file.", "request.invalid"),
                Map.entry("Selected path does not exist in the JavaNavi managed SQL workspace.", "request.invalid"),
                Map.entry("Selected path is not a SQL file in the JavaNavi managed workspace.", "request.invalid"),
                Map.entry("Selected path is a directory, not a SQL file.", "request.invalid"),
                Map.entry("SQL workspace path must not be empty.", "request.invalid"),
                Map.entry("SQL file names must not contain path separators.", "request.invalid"),
                Map.entry("Workspace name must not be empty.", "request.invalid"),
                Map.entry("Workspace names must not contain path separators.", "request.invalid"),
                Map.entry("Connection payload is required.", "request.invalid"),
                Map.entry("Connection package item is required.", "request.invalid"),
                Map.entry("Connection id is required.", "request.invalid"),
                Map.entry("At least one table is required.", "request.invalid"),
                Map.entry("New database name must differ from the old database name.", "request.invalid"),
                Map.entry("Function signature must end with ')'.", "request.invalid"),
                Map.entry("Function signature contains unsupported SQL control characters.", "request.invalid"),
                Map.entry("MongoDB compatibility service is not available.", "mongodb.configRequired"),
                Map.entry("Demo/H2 connection is not available in this service context.", "connection.demoOnly"),
                Map.entry("Managed JDBC pools are currently available for mysql-compatible, postgresql-compatible, sqlite, and duckdb runtime profiles.", "connection.compatProfiles"),
                Map.entry("SHA-256 is required for JavaNavi pool fingerprints.", "app.state"),
                Map.entry("Resolved JDBC driver artifact path escaped the install directory.", "drivers.workspacePathManaged"),
                Map.entry("Resolved custom JDBC driver artifact path escaped the install directory.", "drivers.workspacePathManaged"),
                Map.entry("Custom JDBC driver directory escaped the managed driver root.", "drivers.workspacePathManaged"),
                Map.entry("Unable to list custom JDBC driver definitions.", "drivers.readMetadataFailed"),
                Map.entry("Unable to inspect installed JDBC driver versions.", "drivers.readMetadataFailed"),
                Map.entry("Unable to read JDBC driver package metadata.", "drivers.readMetadataFailed"),
                Map.entry("Unable to write JDBC driver package metadata.", "drivers.writeMetadataFailed"),
                Map.entry("Unable to read JDBC driver runtime settings.", "drivers.readDefaultsFailed"),
                Map.entry("Unable to write JDBC driver runtime settings.", "drivers.writeDefaultsFailed"),
                Map.entry("Driver version is required.", "drivers.versionRequiredBeforeUpload"),
                Map.entry("orderedMap requires key/value pairs", "request.invalid"),
                Map.entry("Unsupported compatibility event fixture family", "events.invalidFixture"),
                Map.entry("Upload a non-empty CSV or JSON import file.", "files.invalidRequest"),
                Map.entry("Only CSV and JSON import files are supported.", "files.invalidRequest"),
                Map.entry("Import files must stay inside the JavaNavi managed import workspace.", "files.invalidRequest"),
                Map.entry("Import file does not exist in the JavaNavi managed workspace.", "files.invalidRequest"),
                Map.entry("File workflow path must stay inside the JavaNavi managed workspace.", "files.invalidRequest"),
                Map.entry("MongoDB command cannot be empty.", "request.invalid"),
                Map.entry("MongoDB command must be a JSON object or supported SELECT statement.", "request.invalid"),
                Map.entry("MongoDB OP_MSG body is too short.", "request.invalid"),
                Map.entry("Only MongoDB OP_MSG body section kind 0 is supported.", "request.invalid"),
                Map.entry("Unterminated BSON cstring.", "request.invalid"),
                Map.entry("Secret key must not be blank.", "request.invalid"),
                Map.entry("Secret store format is not recognized.", "app.state"),
                Map.entry("SHA-256 digest is required for JavaNavi session fingerprints", "app.state"),
                Map.entry("Data sync only supports relational databases. Redis and MongoDB are not supported here.", "request.invalid"),
                Map.entry("MongoDB connection config is required.", "mongodb.configRequired"),
                Map.entry("JavaNavi skipped MongoDB network probing for documentation/example host.", "mongodb.skipExampleHost"),
                Map.entry("JavaNavi currently wires JDBC drivers for bundled relational, file, analytics, time-series, and custom DSN runtime profiles.", "connection.jdbcProfiles"),
                Map.entry("JavaNavi currently wires JDBC drivers for mysql-compatible, postgresql-compatible, sqlite, duckdb, and custom JDBC DSN profiles.", "connection.compatProfiles"),
                Map.entry("Only demo/h2 driverType is wired in the phase-1 API shell.", "connection.demoOnly"),
                Map.entry("JavaNavi Web driver runtime directory is managed inside the backend data directory.", "drivers.runtimeDirectoryManaged"),
                Map.entry("JavaNavi Web recorded driver metadata in the managed workspace; runtime activation remains explicit in the status row.", "drivers.recordedMetadata"),
                Map.entry("JavaNavi Web recorded a managed local driver-package import.", "drivers.recordedLocalImport"),
                Map.entry("连接成功", "common.connectionSucceeded"),
                Map.entry("设置成功", "common.setSucceeded"),
                Map.entry("删除成功", "common.deleteSucceeded"),
                Map.entry("添加成功", "common.addSucceeded"),
                Map.entry("重命名成功", "common.renameSucceeded"),
                Map.entry("清空成功", "common.clearSucceeded"),
                Map.entry("Redis Key 不存在或已过期", "redis.keyGone"),
                Map.entry("命令不能为空", "redis.commandRequired"),
                Map.entry("数据库索引必须在 0-15 之间", "redis.databaseRange"),
                Map.entry("members 不能为空", "redis.membersRequired"),
                Map.entry("Stream 字段不能为空", "redis.streamFieldsRequired"),
                Map.entry("JDBC 表同步要求至少选择一个源/目标表。", "sync.tableSelectionRequired"),
                Map.entry("目标表无主键，不支持基于 SQL 结果集的差异分析。", "sync.sqlTargetNoPk"),
                Map.entry("SQL 结果集同步当前仅支持仅同步数据。", "sync.sqlDataOnly"),
                Map.entry("SQL 结果集同步要求且仅允许选择一个目标表。", "sync.sqlSingleTargetRequired"),
                Map.entry("未能在上传的 Jar 中识别 java.sql.Driver，请确认这是 JDBC 4+ 驱动 Jar 并包含 META-INF/services/java.sql.Driver。", "drivers.noJdbcDriverInJar"),
                Map.entry("只能把已可用的兼容驱动设置为默认驱动", "drivers.defaultMustBeAvailable"),
                Map.entry("请至少上传一个 JDBC Jar 文件", "drivers.uploadOneJar"),
                Map.entry("上传 JDBC Jar 前请输入驱动版本", "drivers.versionRequiredBeforeUpload"),
                Map.entry("请至少上传一个非空 JDBC Jar 文件", "drivers.uploadNonEmptyJar"),
                Map.entry("内置驱动不可移除", "drivers.builtinCannotRemove"),
                Map.entry("切换成功", "common.switchSucceeded"),
                Map.entry("Maven 下载", "drivers.mavenDownload"),
                Map.entry("通过 Maven 源下载", "drivers.mavenSourceDownload"),
                Map.entry("手动上传", "drivers.manualUpload"),
                Map.entry("通过驱动管理上传 Jar 安装", "drivers.uploadInstallDetail"),
                Map.entry("驱动元数据", "drivers.metadata"),
                Map.entry("未安装", "drivers.notInstalled"),
                Map.entry("内置 runtime", "drivers.builtinRuntime"),
                Map.entry("内置驱动", "drivers.builtinDriver"),
                Map.entry("无需下载扩展包", "drivers.noDownloadNeeded"),
                Map.entry("无需选择版本", "drivers.noVersionNeeded"),
                Map.entry("无需安装扩展包", "drivers.noInstallNeeded"),
                Map.entry("无需上传扩展包", "drivers.noUploadNeeded"),
                Map.entry("驱动包元数据已移除", "drivers.metadataRemoved"),
                Map.entry("驱动包元数据与缓存 Jar 已移除", "drivers.metadataCacheRemoved"),
                Map.entry("自定义数据源 JDBC Jar 已上传并启用。", "drivers.customJarUploaded"),
                Map.entry("Custom JDBC definition is usable. DSN-level connection is not tested yet.", "drivers.customDefinitionUsable"),
                Map.entry("自定义 JDBC 定义可用；尚未测试 DSN 级连接。", "drivers.customDefinitionUsable"),
                Map.entry("Custom JDBC definition requires repair.", "drivers.customDefinitionRepairRequired"),
                Map.entry("自定义 JDBC 定义需要修复。", "drivers.customDefinitionRepairRequired"),
                Map.entry("Re-upload this custom JDBC Jar so JavaNavi can recreate driver metadata.", "drivers.customDefinitionMetadataMissing"),
                Map.entry("请重新上传此自定义 JDBC Jar，以便 JavaNavi 重新生成驱动元数据。", "drivers.customDefinitionMetadataMissing"),
                Map.entry("The managed Jar files are missing. Upload the custom driver package again.", "drivers.customDefinitionJarMissing"),
                Map.entry("受管 Jar 文件缺失，请重新上传自定义驱动包。", "drivers.customDefinitionJarMissing"),
                Map.entry("No driver class is recorded. Upload a Jar that exposes java.sql.Driver via service metadata.", "drivers.customDefinitionClassMissing"),
                Map.entry("未记录驱动类，请上传通过服务元数据暴露 java.sql.Driver 的 Jar。", "drivers.customDefinitionClassMissing"),
                Map.entry("The JDBC driver class could not be loaded. Include required dependency Jars and re-upload.", "drivers.customDefinitionClassLoadFailed"),
                Map.entry("无法加载 JDBC 驱动类，请包含所需依赖 Jar 后重新上传。", "drivers.customDefinitionClassLoadFailed"),
                Map.entry("不支持的连接恢复包格式", "connections.unsupportedPackage"),
                Map.entry("连接导入文件过大", "connections.importTooLarge"),
                Map.entry("文件密码错误或文件已损坏", "connections.badPasswordOrCorrupt"),
                Map.entry("连接恢复包过大", "connections.packageTooLarge"),
                Map.entry("恢复包密码不能为空", "connections.passwordRequired"),
                Map.entry("SQL 结果集差异分析完成", "sync.sqlDiffDone"),
                Map.entry("SQL 结果集同步预览", "sync.sqlPreview"),
                Map.entry("JDBC 表到表差异分析完成", "sync.jdbcDiffDone"),
                Map.entry("JDBC 表到表同步预览", "sync.jdbcPreview"),
                Map.entry("Schema sync analysis completed.", "schemaSync.analysisCompleted"),
                Map.entry("No structure changes detected.", "schemaSync.noChanges"),
                Map.entry("Structure changes detected.", "schemaSync.changesDetected"),
                Map.entry("Schema sync preview loaded.", "schemaSync.previewLoaded"),
                Map.entry("Schema diff preview", "schemaSync.previewSummary"),
                Map.entry("Structure sync completed.", "schemaSync.runCompleted"),
                Map.entry("Delete confirmation is required before executing structure sync.", "schemaSync.deleteConfirmRequired"),
                Map.entry("Structure sync failed.", "schemaSync.failed"),
                Map.entry("结构同步分析完成。", "schemaSync.analysisCompleted"),
                Map.entry("未检测到结构变更。", "schemaSync.noChanges"),
                Map.entry("检测到结构变更。", "schemaSync.changesDetected"),
                Map.entry("结构同步预览已加载。", "schemaSync.previewLoaded"),
                Map.entry("结构差异预览", "schemaSync.previewSummary"),
                Map.entry("结构同步完成。", "schemaSync.runCompleted"),
                Map.entry("执行结构同步前需要确认删除类变更。", "schemaSync.deleteConfirmRequired"),
                Map.entry("结构同步失败。", "schemaSync.failed"),
                Map.entry("仅支持 SELECT/WITH 查询导出", "files.selectOnlyExport"),
                Map.entry("表名不能为空，且只能包含安全标识符字符。", "files.safeTableRequired"),
                Map.entry("自动定位导出文件已被当前环境禁用，请手动复制文件路径：", "files.revealExportDisabled"),
                Map.entry("导出完成，已在系统文件管理器中定位文件：", "files.revealedExportFile"),
                Map.entry("导出完成，已打开文件所在目录：", "files.openedExportDirectory"),
                Map.entry("导出完成，但打开导出文件位置时被中断，请手动复制文件路径：", "files.revealExportInterrupted"),
                Map.entry("导出完成，但无法自动打开导出文件位置，请手动复制文件路径：", "files.revealExportFailed"),
                Map.entry("读取源数据", "events.readSource"),
                Map.entry("写入目标表", "events.writeTarget"),
                Map.entry("完成", "events.complete"),
                Map.entry("JavaNavi Web 驱动管理已使用本地受管工作区；JDBC 驱动可按需从 Maven Central 下载并校验。", "drivers.workspaceReady"),
                Map.entry("JavaNavi Web 驱动工作区不可用，请检查数据目录权限。", "drivers.workspaceUnavailable"),
                Map.entry("按需下载", "drivers.onDemandDownload"),
                Map.entry("Maven 源：", "drivers.mavenSourcePrefix"),
                Map.entry("（推荐）", "drivers.recommendedSuffix"),
                Map.entry("上传-1.0", "drivers.uploadVersionFallback"),
                Map.entry("自动打开目录已被当前环境禁用，请手动复制路径：", "drivers.openDirDisabledPrefix"),
                Map.entry("已打开驱动目录：", "drivers.openedDirPrefix"),
                Map.entry("打开驱动目录被中断，请手动复制路径：", "drivers.openDirInterruptedPrefix"),
                Map.entry("无法自动打开驱动目录，请手动复制路径：", "drivers.openDirFailedPrefix"),
                Map.entry("当前后端包未内置该 JDBC 驱动；可在驱动管理器中按需下载，或首次连接时自动下载。", "drivers.missingJdbcDownloadable"),
                Map.entry("当前后端包未内置该驱动；请在驱动管理器中按需下载，或手动上传 JDBC Jar。", "drivers.missingUseFullBuild"),
                Map.entry("驱动包元数据已登记；", "drivers.metadataRegisteredPrefix"),
                Map.entry("当前后端包未内置该驱动；可通过驱动管理器按需下载 JDBC Jar", "drivers.missingCanDownloadJar")
        );
        String code = fallbackCodes.get(normalized);
        if (code != null) {
            return message(code);
        }
        return localizePattern(normalized);
    }

    private String localizePattern(String normalized) {
        if (normalized.contains("ApiRateLimitExceededException") || normalized.contains("Too many requests")) {
            return message("request.rateLimited");
        }
        if (normalized.startsWith("Provider returned HTTP")) {
            return message("request.invalid", "message", message("backend.untranslatedError"));
        }
        if (normalized.startsWith("AI provider endpoint targets a local or private network host")) {
            return message("request.invalid", "message", message("backend.untranslatedError"));
        }
        if (normalized.contains("SQL workspace paths must stay inside the JavaNavi managed SQL workspace.")) {
            return message("request.invalid", "message", "SQL 工作区路径必须位于 JavaNavi 管理的 SQL 工作区内。");
        }
        if (normalized.startsWith("Unable to ") && normalized.contains("JavaNavi app state")) {
            return message("app.state", "message", "无法读写 JavaNavi 应用状态。");
        }
        if (normalized.startsWith("Unable to ") && normalized.contains("JavaNavi SQL workspace")) {
            return message("app.state", "message", "无法访问 JavaNavi SQL 工作区。");
        }
        if (normalized.startsWith("Unable to ") && normalized.contains("JavaNavi import")) {
            return message("files.state", "message", "无法处理 JavaNavi 导入文件。");
        }
        if (normalized.startsWith("Unable to ") && normalized.contains("JavaNavi export")) {
            return message("files.state", "message", "无法处理 JavaNavi 导出文件。");
        }
        if (normalized.startsWith("Data sync ") || normalized.startsWith("Full overwrite data sync") || normalized.startsWith("Source table has no readable columns:")) {
            return message("request.invalid", "message", "数据同步请求无效。");
        }
        if (normalized.startsWith("Unsupported DDL operation:")) {
            return message("request.invalid", "message", "不支持的 DDL 操作。");
        }
        if (normalized.startsWith("File databases do not support") || normalized.startsWith("MySQL/MariaDB-compatible JDBC does not support") || normalized.startsWith("Current PostgreSQL connection") || normalized.startsWith("Current driver does not support")) {
            return message("request.invalid", "message", "当前数据源不支持该数据库操作。");
        }
        if (normalized.startsWith("No PostgreSQL metadata columns found for table:") || normalized.startsWith("No metadata columns found for table:")) {
            String table = normalized.substring(normalized.lastIndexOf(':') + 1).trim();
            return message("request.invalid", "message", "未读取到表字段元数据：" + table);
        }
        if (normalized.startsWith("Schema metadata") && normalized.endsWith("is required.")) {
            return message("request.invalid", "message", "结构元数据不能为空。");
        }
        if (normalized.startsWith("Local JDBC driver package path does not exist:")) {
            return message("drivers.invalidRequest", "message", "本地 JDBC 驱动包路径不存在。");
        }
        if (normalized.startsWith("No JDBC jar files found")) {
            return message("drivers.invalidRequest", "message", "未找到 JDBC Jar 文件。");
        }
        if (normalized.startsWith("Unable to copy") || normalized.startsWith("Unable to load JDBC driver") || normalized.startsWith("Unable to download JDBC driver") || normalized.startsWith("Interrupted while downloading JDBC driver") || normalized.startsWith("HTTP ")) {
            return message("drivers.state", "message", message("backend.untranslatedError"));
        }
        if (normalized.startsWith("Invalid custom JDBC driver type:") || normalized.startsWith("Invalid Maven JDBC driver version:")) {
            return message("drivers.invalidRequest", "message", message("backend.untranslatedError"));
        }
        if (normalized.startsWith("MongoDB command returned") || normalized.startsWith("MongoDB command failed:")) {
            return message("request.invalid", "message", "MongoDB 命令执行失败。");
        }
        if (normalized.startsWith("Invalid BSON") || normalized.startsWith("Unsupported BSON") || normalized.startsWith("MongoDB response") || normalized.startsWith("Unsupported MongoDB wire opcode:")) {
            return message("request.invalid", "message", "MongoDB 响应格式无效。");
        }
        if (normalized.startsWith("MongoDB ") && normalized.endsWith(" is required.")) {
            return message("request.invalid", "message", "MongoDB 必填字段不能为空。");
        }
        if (normalized.startsWith("不支持的 Redis 数据类型:")) {
            return message("redis.unsupportedType", "type", normalized.substring("不支持的 Redis 数据类型:".length()).trim());
        }
        if (normalized.startsWith("Redis 连接失败:")) {
            return message("redis.connectionFailed", "message", normalized.substring("Redis 连接失败:".length()).trim());
        }
        if (normalized.startsWith("Redis 命令执行失败:")) {
            return message("redis.commandFailed", "message", normalized.substring("Redis 命令执行失败:".length()).trim());
        }
        if (normalized.startsWith("目标表 ") && normalized.endsWith(" 不存在或未读取到字段定义。")) {
            String table = normalized.substring("目标表 ".length(), normalized.length() - " 不存在或未读取到字段定义。".length()).trim();
            return message("sync.targetTableMissing", "table", table);
        }
        if (normalized.startsWith("源表结果缺少目标主键列 ") && normalized.endsWith("，无法执行表到表差异同步。")) {
            String column = normalized.substring("源表结果缺少目标主键列 ".length(), normalized.length() - "，无法执行表到表差异同步。".length()).trim();
            return message("sync.pkColumnMissing", "column", column);
        }
        if (normalized.startsWith("目标表为复合主键（") && normalized.endsWith("），暂不支持基于 SQL 结果集的差异分析。")) {
            String columns = normalized.substring("目标表为复合主键（".length(), normalized.length() - "），暂不支持基于 SQL 结果集的差异分析。".length()).trim();
            return message("sync.sqlTargetCompositePk", "columns", columns);
        }
        if (normalized.startsWith("Unsupported JDBC driver type:")) {
            return message("drivers.unsupportedType", "type", normalized.substring("Unsupported JDBC driver type:".length()).trim());
        }
        if (normalized.startsWith("No uploaded custom JDBC driver is available for driver type:")) {
            return message("drivers.missingCanDownloadJar") + ": " + normalized.substring("No uploaded custom JDBC driver is available for driver type:".length()).trim();
        }
        if (normalized.startsWith("不支持的驱动类型:")) {
            return message("drivers.unsupportedType", "type", normalized.substring("不支持的驱动类型:".length()).trim());
        }
        if (normalized.startsWith("无效的自定义驱动标识:")) {
            return message("drivers.invalidCustomId", "type", normalized.substring("无效的自定义驱动标识:".length()).trim());
        }
        if (normalized.endsWith(" 不能为空")) {
            return message("redis.required", "name", normalized.substring(0, normalized.length() - " 不能为空".length()).trim());
        }
        if (normalized.contains(" 不能作为 ") && normalized.endsWith(" 的兼容驱动")) {
            int split = normalized.indexOf(" 不能作为 ");
            String driver = normalized.substring(0, split).trim();
            String database = normalized.substring(split + " 不能作为 ".length(), normalized.length() - " 的兼容驱动".length()).trim();
            return message("drivers.defaultIncompatible", "driver", driver, "database", database);
        }
        if (normalized.contains(" 复用 ") && normalized.endsWith(" 行管理该驱动")) {
            int split = normalized.indexOf(" 复用 ");
            String driver = normalized.substring(0, split).trim();
            String rest = normalized.substring(split + " 复用 ".length());
            int ownerSplit = rest.indexOf(" JDBC 驱动，请在 ");
            String owner = ownerSplit >= 0 ? rest.substring(0, ownerSplit).trim() : rest.trim();
            return message("drivers.reuseManagedByOwner", "driver", driver, "owner", owner);
        }
        if (normalized.startsWith("仅支持上传 JDBC Jar 文件:")) {
            return message("drivers.jdbcJarOnly", "file", normalized.substring("仅支持上传 JDBC Jar 文件:".length()).trim());
        }
        if (normalized.startsWith("不支持按需下载的 JDBC 驱动类型:")) {
            return message("drivers.unsupportedDownloadType", "type", normalized.substring("不支持按需下载的 JDBC 驱动类型:".length()).trim());
        }
        if (normalized.startsWith("Automatic export file reveal is disabled in this environment. Copy the file path manually:")) {
            return message("files.revealExportDisabled", "path", normalized.substring("Automatic export file reveal is disabled in this environment. Copy the file path manually:".length()).trim());
        }
        if (normalized.startsWith("Export completed and the file has been selected in the system file manager:")) {
            return message("files.revealedExportFile", "path", normalized.substring("Export completed and the file has been selected in the system file manager:".length()).trim());
        }
        if (normalized.startsWith("Export completed and the containing directory has been opened:")) {
            return message("files.openedExportDirectory", "directory", normalized.substring("Export completed and the containing directory has been opened:".length()).trim());
        }
        if (normalized.startsWith("Export completed, but opening the exported file location was interrupted. Copy the file path manually:")) {
            return message("files.revealExportInterrupted", "path", normalized.substring("Export completed, but opening the exported file location was interrupted. Copy the file path manually:".length()).trim());
        }
        if (normalized.startsWith("Export completed, but the exported file location could not be opened automatically. Copy the file path manually:")) {
            return message("files.revealExportFailed", "path", normalized.substring("Export completed, but the exported file location could not be opened automatically. Copy the file path manually:".length()).trim(), "suffix", "");
        }
        if (I18nContext.language() == AppLanguage.ZH && !containsCjk(normalized)) {
            return message("backend.untranslatedError");
        }
        return normalized;
    }

    private boolean containsCjk(String value) {
        return value != null && value.codePoints().anyMatch(codePoint -> codePoint >= 0x4E00 && codePoint <= 0x9FFF);
    }

    private void put(String code, String enMessage, String zhMessage) {
        en.put(code, enMessage);
        zh.put(code, zhMessage);
    }

    private static String interpolate(String template, Object... args) {
        String result = template;
        if (args == null) {
            return result;
        }
        for (int index = 0; index + 1 < args.length; index += 2) {
            String key = String.valueOf(args[index]);
            String value = args[index + 1] == null ? "" : String.valueOf(args[index + 1]);
            result = result.replace("{" + key + "}", value);
        }
        return result;
    }
}
