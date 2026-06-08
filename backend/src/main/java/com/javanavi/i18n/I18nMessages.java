package com.javanavi.i18n;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.TreeSet;

@Component
public class I18nMessages {
    private final Map<String, String> en = new LinkedHashMap<>();
    private final Map<String, String> zh = new LinkedHashMap<>();
    private final Map<String, String> messageAliases = new LinkedHashMap<>();

    public I18nMessages() {
        en.putAll(loadMessages("i18n/messages_en.properties"));
        zh.putAll(loadMessages("i18n/messages_zh_CN.properties"));
        indexMessageAliases();
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
        String code = messageAliases.get(normalized);
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
            return message("request.invalid", "message", message("app.sqlWorkspacePathManaged"));
        }
        if (normalized.startsWith("Executing SQL statement ")) {
            String progress = normalized.substring("Executing SQL statement ".length()).trim();
            int split = progress.indexOf("/");
            if (split >= 0) {
                return message("job.stage.executingSqlStatement", "current", progress.substring(0, split).trim(), "total", progress.substring(split + 1).trim());
            }
        }
        if (normalized.startsWith("Executed SQL statement ")) {
            String progress = normalized.substring("Executed SQL statement ".length()).trim();
            int split = progress.indexOf("/");
            if (split >= 0) {
                return message("job.stage.executedSqlStatement", "current", progress.substring(0, split).trim(), "total", progress.substring(split + 1).trim());
            }
        }
        if (normalized.startsWith("Job not found:")) {
            return message("job.error.notFound", "jobId", normalized.substring("Job not found:".length()).trim());
        }
        if (normalized.startsWith("Job cancelled:")) {
            return message("job.error.cancelled", "jobId", normalized.substring("Job cancelled:".length()).trim());
        }
        if (normalized.startsWith("Unable to ") && normalized.contains("JavaNavi app state")) {
            return message("app.state", "message", message("app.stateReadWriteFailed"));
        }
        if (normalized.startsWith("Unable to ") && normalized.contains("JavaNavi SQL workspace")) {
            return message("app.state", "message", message("app.sqlWorkspaceAccessFailed"));
        }
        if (normalized.startsWith("Unable to ") && normalized.contains("JavaNavi import")) {
            return message("files.state", "message", message("files.importProcessingFailed"));
        }
        if (normalized.startsWith("Unable to ") && normalized.contains("JavaNavi export")) {
            return message("files.state", "message", message("files.exportProcessingFailed"));
        }
        if (normalized.startsWith("Data sync ") || normalized.startsWith("Full overwrite data sync") || normalized.startsWith("Source table has no readable columns:")) {
            return message("request.invalid", "message", message("sync.requestInvalid"));
        }
        if (normalized.startsWith("Unsupported DDL operation:")) {
            return message("request.invalid", "message", message("ddl.unsupportedOperation"));
        }
        if (normalized.startsWith("File databases do not support") || normalized.startsWith("MySQL/MariaDB-compatible JDBC does not support") || normalized.startsWith("Current PostgreSQL connection") || normalized.startsWith("Current driver does not support")) {
            return message("request.invalid", "message", message("database.operationUnsupported"));
        }
        if (normalized.startsWith("No PostgreSQL metadata columns found for table:") || normalized.startsWith("No metadata columns found for table:")) {
            String table = normalized.substring(normalized.lastIndexOf(':') + 1).trim();
            return message("request.invalid", "message", message("database.metadataColumnsMissing", "table", table));
        }
        if (normalized.startsWith("Schema metadata") && normalized.endsWith("is required.")) {
            return message("request.invalid", "message", message("database.schemaMetadataRequired"));
        }
        if (normalized.startsWith("Local JDBC driver package path does not exist:")) {
            return message("drivers.invalidRequest", "message", message("drivers.localPackageMissing"));
        }
        if (normalized.startsWith("No JDBC jar files found")) {
            return message("drivers.invalidRequest", "message", message("drivers.noJdbcJarFound"));
        }
        if (normalized.startsWith("Unable to copy") || normalized.startsWith("Unable to load JDBC driver") || normalized.startsWith("Unable to download JDBC driver") || normalized.startsWith("Interrupted while downloading JDBC driver") || normalized.startsWith("HTTP ")) {
            return message("drivers.state", "message", normalized);
        }
        if (normalized.startsWith("Invalid custom JDBC driver type:") || normalized.startsWith("Invalid Maven JDBC driver version:")) {
            return message("drivers.invalidRequest", "message", normalized);
        }
        if (normalized.startsWith("MongoDB command returned") || normalized.startsWith("MongoDB command failed:")) {
            return message("request.invalid", "message", message("mongodb.commandFailed"));
        }
        if (normalized.startsWith("Invalid BSON") || normalized.startsWith("Unsupported BSON") || normalized.startsWith("MongoDB response") || normalized.startsWith("Unsupported MongoDB wire opcode:")) {
            return message("request.invalid", "message", message("mongodb.responseInvalid"));
        }
        if (normalized.startsWith("MongoDB ") && normalized.endsWith(" is required.")) {
            return message("request.invalid", "message", message("mongodb.requiredFieldMissing"));
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

    private void indexMessageAliases() {
        for (String code : en.keySet()) {
            messageAliases.putIfAbsent(code, code);
        }
        indexMessageAliases(en);
        indexMessageAliases(zh);
    }

    private void indexMessageAliases(Map<String, String> messages) {
        for (Map.Entry<String, String> entry : messages.entrySet()) {
            String template = entry.getValue() == null ? "" : entry.getValue().trim();
            if (!template.isBlank() && !template.contains("{")) {
                messageAliases.putIfAbsent(template, entry.getKey());
            }
        }
    }


    private static Map<String, String> loadMessages(String resourcePath) {
        Properties properties = new Properties();
        try (InputStream input = I18nMessages.class.getClassLoader().getResourceAsStream(resourcePath)) {
            if (input == null) {
                throw new IllegalStateException("Missing i18n resource: " + resourcePath);
            }
            properties.load(new InputStreamReader(input, StandardCharsets.UTF_8));
        } catch (IOException error) {
            throw new IllegalStateException("Unable to load i18n resource: " + resourcePath, error);
        }
        Map<String, String> result = new LinkedHashMap<>();
        for (String key : new TreeSet<>(properties.stringPropertyNames())) {
            result.put(key, properties.getProperty(key));
        }
        return result;
    }

    private boolean containsCjk(String value) {
        return value != null && value.codePoints().anyMatch(codePoint -> codePoint >= 0x4E00 && codePoint <= 0x9FFF);
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
