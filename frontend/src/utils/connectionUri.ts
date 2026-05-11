import { DEFAULT_SSL_MODE } from "./sslMode";

export const getDefaultPortByType = (type: string) => {
  switch (type) {
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

const MAX_URI_LENGTH = 4096;
const MAX_URI_HOSTS = 32;
export const MAX_TIMEOUT_SECONDS = 3600;

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

export const supportsSSLForType = (type: string) =>
  sslSupportedTypes.has(
    String(type || "")
      .trim()
      .toLowerCase(),
  );

export const isFileDatabaseType = (type: string) =>
  type === "sqlite" || type === "duckdb";

export const parseHostPort = (
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

export const toAddress = (host: string, port: number, defaultPort: number) => {
  const safeHost = String(host || "").trim() || "localhost";
  const safePort =
    Number.isFinite(Number(port)) && Number(port) > 0
      ? Number(port)
      : defaultPort;
  return `${safeHost}:${safePort}`;
};

export const normalizeAddressList = (
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

export const normalizeMongoSrvHostList = (
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

export const normalizeFileDbPath = (rawPath: string): string => {
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

export const parseUriToValues = (
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

export const getUriPlaceholder = (dbType: string) => {
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

export const buildUriFromValues = (values: any) => {
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
