// JavaNavi compatibility DTOs mirrored from the generated Wails model contract.
// Source snapshot: generated models.ts @ a07eea7815d845545452afce86afdfa6f77d16ff
export namespace ai {
	
	export class ToolCall {
	    id: string;
	    type: string;
	    // Go type: struct { Name string "json:\"name\""; Arguments string "json:\"arguments\"" }
	    function: any;
	
	    static createFrom(source: any = {}) {
	        return new ToolCall(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.function = this.convertValues(source["function"], Object);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Message {
	    role: string;
	    content: string;
	    images?: string[];
	    tool_call_id?: string;
	    tool_calls?: ToolCall[];
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	        this.images = source["images"];
	        this.tool_call_id = source["tool_call_id"];
	        this.tool_calls = this.convertValues(source["tool_calls"], ToolCall);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProviderConfig {
	    id: string;
	    type: string;
	    name: string;
	    apiKey: string;
	    secretRef?: string;
	    hasSecret?: boolean;
	    baseUrl: string;
	    model: string;
	    models?: string[];
	    apiFormat?: string;
	    headers?: Record<string, string>;
	    maxTokens: number;
	    temperature: number;
	
	    static createFrom(source: any = {}) {
	        return new ProviderConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.name = source["name"];
	        this.apiKey = source["apiKey"];
	        this.secretRef = source["secretRef"];
	        this.hasSecret = source["hasSecret"];
	        this.baseUrl = source["baseUrl"];
	        this.model = source["model"];
	        this.models = source["models"];
	        this.apiFormat = source["apiFormat"];
	        this.headers = source["headers"];
	        this.maxTokens = source["maxTokens"];
	        this.temperature = source["temperature"];
	    }
	}
	export class SafetyResult {
	    allowed: boolean;
	    operationType: string;
	    requiresConfirm: boolean;
	    warningMessage?: string;
	
	    static createFrom(source: any = {}) {
	        return new SafetyResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allowed = source["allowed"];
	        this.operationType = source["operationType"];
	        this.requiresConfirm = source["requiresConfirm"];
	        this.warningMessage = source["warningMessage"];
	    }
	}
	export class ToolFunction {
	    name: string;
	    description: string;
	    parameters: any;
	
	    static createFrom(source: any = {}) {
	        return new ToolFunction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.parameters = source["parameters"];
	    }
	}
	export class Tool {
	    type: string;
	    function: ToolFunction;
	
	    static createFrom(source: any = {}) {
	        return new Tool(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.function = this.convertValues(source["function"], ToolFunction);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace app {
	
	export class ConnectionExportOptions {
	    includeSecrets: boolean;
	    filePassword?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionExportOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.includeSecrets = source["includeSecrets"];
	        this.filePassword = source["filePassword"];
	    }
	}
	export class SecurityUpdateOptions {
	    allowPartial?: boolean;
	    writeBackup?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SecurityUpdateOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allowPartial = source["allowPartial"];
	        this.writeBackup = source["writeBackup"];
	    }
	}
	export class RestartSecurityUpdateRequest {
	    migrationId?: string;
	    sourceType: string;
	    rawPayload?: string;
	    options?: SecurityUpdateOptions;
	
	    static createFrom(source: any = {}) {
	        return new RestartSecurityUpdateRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.migrationId = source["migrationId"];
	        this.sourceType = source["sourceType"];
	        this.rawPayload = source["rawPayload"];
	        this.options = this.convertValues(source["options"], SecurityUpdateOptions);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RetrySecurityUpdateRequest {
	    migrationId?: string;
	
	    static createFrom(source: any = {}) {
	        return new RetrySecurityUpdateRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.migrationId = source["migrationId"];
	    }
	}
	export class SecurityUpdateIssue {
	    id: string;
	    scope: string;
	    refId?: string;
	    title: string;
	    severity: string;
	    status: string;
	    reasonCode: string;
	    action: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new SecurityUpdateIssue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.scope = source["scope"];
	        this.refId = source["refId"];
	        this.title = source["title"];
	        this.severity = source["severity"];
	        this.status = source["status"];
	        this.reasonCode = source["reasonCode"];
	        this.action = source["action"];
	        this.message = source["message"];
	    }
	}
	
	export class SecurityUpdateSummary {
	    total: number;
	    updated: number;
	    pending: number;
	    skipped: number;
	    failed: number;
	
	    static createFrom(source: any = {}) {
	        return new SecurityUpdateSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.updated = source["updated"];
	        this.pending = source["pending"];
	        this.skipped = source["skipped"];
	        this.failed = source["failed"];
	    }
	}
	export class SecurityUpdateStatus {
	    schemaVersion?: number;
	    migrationId?: string;
	    overallStatus: string;
	    sourceType?: string;
	    reminderVisible: boolean;
	    canStart: boolean;
	    canPostpone: boolean;
	    canRetry: boolean;
	    backupAvailable: boolean;
	    backupPath?: string;
	    startedAt?: string;
	    updatedAt?: string;
	    completedAt?: string;
	    postponedAt?: string;
	    summary: SecurityUpdateSummary;
	    issues: SecurityUpdateIssue[];
	    lastError?: string;
	
	    static createFrom(source: any = {}) {
	        return new SecurityUpdateStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schemaVersion = source["schemaVersion"];
	        this.migrationId = source["migrationId"];
	        this.overallStatus = source["overallStatus"];
	        this.sourceType = source["sourceType"];
	        this.reminderVisible = source["reminderVisible"];
	        this.canStart = source["canStart"];
	        this.canPostpone = source["canPostpone"];
	        this.canRetry = source["canRetry"];
	        this.backupAvailable = source["backupAvailable"];
	        this.backupPath = source["backupPath"];
	        this.startedAt = source["startedAt"];
	        this.updatedAt = source["updatedAt"];
	        this.completedAt = source["completedAt"];
	        this.postponedAt = source["postponedAt"];
	        this.summary = this.convertValues(source["summary"], SecurityUpdateSummary);
	        this.issues = this.convertValues(source["issues"], SecurityUpdateIssue);
	        this.lastError = source["lastError"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class StartSecurityUpdateRequest {
	    sourceType: string;
	    rawPayload?: string;
	    options?: SecurityUpdateOptions;
	
	    static createFrom(source: any = {}) {
	        return new StartSecurityUpdateRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceType = source["sourceType"];
	        this.rawPayload = source["rawPayload"];
	        this.options = this.convertValues(source["options"], SecurityUpdateOptions);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace connection {
	
	export class UpdateRow {
	    keys: Record<string, any>;
	    values: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new UpdateRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.keys = source["keys"];
	        this.values = source["values"];
	    }
	}
	export class ChangeSet {
	    inserts: any[];
	    updates: UpdateRow[];
	    deletes: any[];
	    locatorStrategy?: string;
	
	    static createFrom(source: any = {}) {
	        return new ChangeSet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.inserts = source["inserts"];
	        this.updates = this.convertValues(source["updates"], UpdateRow);
	        this.deletes = source["deletes"];
	        this.locatorStrategy = source["locatorStrategy"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class JVMDiagnosticConfig {
	    enabled?: boolean;
	    transport?: string;
	    baseUrl?: string;
	    targetId?: string;
	    apiKey?: string;
	    allowObserveCommands?: boolean;
	    allowTraceCommands?: boolean;
	    allowMutatingCommands?: boolean;
	    timeoutSeconds?: number;
	
	    static createFrom(source: any = {}) {
	        return new JVMDiagnosticConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.transport = source["transport"];
	        this.baseUrl = source["baseUrl"];
	        this.targetId = source["targetId"];
	        this.apiKey = source["apiKey"];
	        this.allowObserveCommands = source["allowObserveCommands"];
	        this.allowTraceCommands = source["allowTraceCommands"];
	        this.allowMutatingCommands = source["allowMutatingCommands"];
	        this.timeoutSeconds = source["timeoutSeconds"];
	    }
	}
	export class JVMAgentConfig {
	    enabled?: boolean;
	    baseUrl?: string;
	    apiKey?: string;
	    timeoutSeconds?: number;
	
	    static createFrom(source: any = {}) {
	        return new JVMAgentConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.timeoutSeconds = source["timeoutSeconds"];
	    }
	}
	export class JVMEndpointConfig {
	    enabled?: boolean;
	    baseUrl?: string;
	    apiKey?: string;
	    timeoutSeconds?: number;
	
	    static createFrom(source: any = {}) {
	        return new JVMEndpointConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.timeoutSeconds = source["timeoutSeconds"];
	    }
	}
	export class JVMJMXConfig {
	    enabled?: boolean;
	    host?: string;
	    port?: number;
	    username?: string;
	    password?: string;
	    domainAllowlist?: string[];
	
	    static createFrom(source: any = {}) {
	        return new JVMJMXConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.domainAllowlist = source["domainAllowlist"];
	    }
	}
	export class JVMConfig {
	    environment?: string;
	    readOnly?: boolean;
	    allowedModes?: string[];
	    preferredMode?: string;
	    jmx?: JVMJMXConfig;
	    endpoint?: JVMEndpointConfig;
	    agent?: JVMAgentConfig;
	    diagnostic?: JVMDiagnosticConfig;
	
	    static createFrom(source: any = {}) {
	        return new JVMConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.environment = source["environment"];
	        this.readOnly = source["readOnly"];
	        this.allowedModes = source["allowedModes"];
	        this.preferredMode = source["preferredMode"];
	        this.jmx = this.convertValues(source["jmx"], JVMJMXConfig);
	        this.endpoint = this.convertValues(source["endpoint"], JVMEndpointConfig);
	        this.agent = this.convertValues(source["agent"], JVMAgentConfig);
	        this.diagnostic = this.convertValues(source["diagnostic"], JVMDiagnosticConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HTTPTunnelConfig {
	    host: string;
	    port: number;
	    user?: string;
	    password?: string;
	
	    static createFrom(source: any = {}) {
	        return new HTTPTunnelConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.password = source["password"];
	    }
	}
	export class ProxyConfig {
	    type: string;
	    host: string;
	    port: number;
	    user?: string;
	    password?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProxyConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.password = source["password"];
	    }
	}
	export class SSHConfig {
	    host: string;
	    port: number;
	    user: string;
	    password: string;
	    keyPath: string;
	
	    static createFrom(source: any = {}) {
	        return new SSHConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.password = source["password"];
	        this.keyPath = source["keyPath"];
	    }
	}
	export class ConnectionConfig {
	    id?: string;
	    type: string;
	    host: string;
	    port: number;
	    user: string;
	    password: string;
	    savePassword?: boolean;
	    database: string;
	    useSSL?: boolean;
	    sslMode?: string;
	    sslCertPath?: string;
	    sslKeyPath?: string;
	    useSSH: boolean;
	    ssh: SSHConfig;
	    useProxy?: boolean;
	    proxy?: ProxyConfig;
	    useHttpTunnel?: boolean;
	    httpTunnel?: HTTPTunnelConfig;
	    driver?: string;
	    dsn?: string;
	    timeout?: number;
	    redisDB?: number;
	    uri?: string;
	    hosts?: string[];
	    topology?: string;
	    mysqlReplicaUser?: string;
	    mysqlReplicaPassword?: string;
	    replicaSet?: string;
	    authSource?: string;
	    readPreference?: string;
	    mongoSrv?: boolean;
	    mongoAuthMechanism?: string;
	    mongoReplicaUser?: string;
	    mongoReplicaPassword?: string;
	    jvm?: JVMConfig;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.password = source["password"];
	        this.savePassword = source["savePassword"];
	        this.database = source["database"];
	        this.useSSL = source["useSSL"];
	        this.sslMode = source["sslMode"];
	        this.sslCertPath = source["sslCertPath"];
	        this.sslKeyPath = source["sslKeyPath"];
	        this.useSSH = source["useSSH"];
	        this.ssh = this.convertValues(source["ssh"], SSHConfig);
	        this.useProxy = source["useProxy"];
	        this.proxy = this.convertValues(source["proxy"], ProxyConfig);
	        this.useHttpTunnel = source["useHttpTunnel"];
	        this.httpTunnel = this.convertValues(source["httpTunnel"], HTTPTunnelConfig);
	        this.driver = source["driver"];
	        this.dsn = source["dsn"];
	        this.timeout = source["timeout"];
	        this.redisDB = source["redisDB"];
	        this.uri = source["uri"];
	        this.hosts = source["hosts"];
	        this.topology = source["topology"];
	        this.mysqlReplicaUser = source["mysqlReplicaUser"];
	        this.mysqlReplicaPassword = source["mysqlReplicaPassword"];
	        this.replicaSet = source["replicaSet"];
	        this.authSource = source["authSource"];
	        this.readPreference = source["readPreference"];
	        this.mongoSrv = source["mongoSrv"];
	        this.mongoAuthMechanism = source["mongoAuthMechanism"];
	        this.mongoReplicaUser = source["mongoReplicaUser"];
	        this.mongoReplicaPassword = source["mongoReplicaPassword"];
	        this.jvm = this.convertValues(source["jvm"], JVMConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GlobalProxyView {
	    enabled: boolean;
	    type: string;
	    host: string;
	    port: number;
	    user?: string;
	    password?: string;
	    hasPassword?: boolean;
	    secretRef?: string;
	
	    static createFrom(source: any = {}) {
	        return new GlobalProxyView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.type = source["type"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.password = source["password"];
	        this.hasPassword = source["hasPassword"];
	        this.secretRef = source["secretRef"];
	    }
	}
	
	
	
	
	
	
	
	export class QueryResult {
	    success: boolean;
	    message: string;
	    data: any;
	    fields?: string[];
	    queryId?: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.data = source["data"];
	        this.fields = source["fields"];
	        this.queryId = source["queryId"];
	    }
	}
	
	export class SaveGlobalProxyInput {
	    enabled: boolean;
	    type: string;
	    host: string;
	    port: number;
	    user?: string;
	    password?: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveGlobalProxyInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.type = source["type"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.password = source["password"];
	    }
	}
	export class SavedConnectionInput {
	    id?: string;
	    name: string;
	    config: ConnectionConfig;
	    includeDatabases?: string[];
	    includeRedisDatabases?: number[];
	    iconType?: string;
	    iconColor?: string;
	    clearPrimaryPassword?: boolean;
	    clearSSHPassword?: boolean;
	    clearProxyPassword?: boolean;
	    clearHttpTunnelPassword?: boolean;
	    clearMySQLReplicaPassword?: boolean;
	    clearMongoReplicaPassword?: boolean;
	    clearOpaqueURI?: boolean;
	    clearOpaqueDSN?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SavedConnectionInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.config = this.convertValues(source["config"], ConnectionConfig);
	        this.includeDatabases = source["includeDatabases"];
	        this.includeRedisDatabases = source["includeRedisDatabases"];
	        this.iconType = source["iconType"];
	        this.iconColor = source["iconColor"];
	        this.clearPrimaryPassword = source["clearPrimaryPassword"];
	        this.clearSSHPassword = source["clearSSHPassword"];
	        this.clearProxyPassword = source["clearProxyPassword"];
	        this.clearHttpTunnelPassword = source["clearHttpTunnelPassword"];
	        this.clearMySQLReplicaPassword = source["clearMySQLReplicaPassword"];
	        this.clearMongoReplicaPassword = source["clearMongoReplicaPassword"];
	        this.clearOpaqueURI = source["clearOpaqueURI"];
	        this.clearOpaqueDSN = source["clearOpaqueDSN"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SavedConnectionView {
	    id: string;
	    name: string;
	    config: ConnectionConfig;
	    includeDatabases?: string[];
	    includeRedisDatabases?: number[];
	    iconType?: string;
	    iconColor?: string;
	    secretRef?: string;
	    hasPrimaryPassword?: boolean;
	    hasSSHPassword?: boolean;
	    hasProxyPassword?: boolean;
	    hasHttpTunnelPassword?: boolean;
	    hasMySQLReplicaPassword?: boolean;
	    hasMongoReplicaPassword?: boolean;
	    hasOpaqueURI?: boolean;
	    hasOpaqueDSN?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SavedConnectionView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.config = this.convertValues(source["config"], ConnectionConfig);
	        this.includeDatabases = source["includeDatabases"];
	        this.includeRedisDatabases = source["includeRedisDatabases"];
	        this.iconType = source["iconType"];
	        this.iconColor = source["iconColor"];
	        this.secretRef = source["secretRef"];
	        this.hasPrimaryPassword = source["hasPrimaryPassword"];
	        this.hasSSHPassword = source["hasSSHPassword"];
	        this.hasProxyPassword = source["hasProxyPassword"];
	        this.hasHttpTunnelPassword = source["hasHttpTunnelPassword"];
	        this.hasMySQLReplicaPassword = source["hasMySQLReplicaPassword"];
	        this.hasMongoReplicaPassword = source["hasMongoReplicaPassword"];
	        this.hasOpaqueURI = source["hasOpaqueURI"];
	        this.hasOpaqueDSN = source["hasOpaqueDSN"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace jvm {
	
	export class ChangeRequest {
	    providerMode: string;
	    resourceId: string;
	    action: string;
	    reason: string;
	    source?: string;
	    expectedVersion?: string;
	    confirmationToken?: string;
	    payload?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new ChangeRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.providerMode = source["providerMode"];
	        this.resourceId = source["resourceId"];
	        this.action = source["action"];
	        this.reason = source["reason"];
	        this.source = source["source"];
	        this.expectedVersion = source["expectedVersion"];
	        this.confirmationToken = source["confirmationToken"];
	        this.payload = source["payload"];
	    }
	}
	export class DiagnosticCommandRequest {
	    sessionId: string;
	    commandId: string;
	    command: string;
	    source?: string;
	    reason?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticCommandRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.commandId = source["commandId"];
	        this.command = source["command"];
	        this.source = source["source"];
	        this.reason = source["reason"];
	    }
	}
	export class DiagnosticSessionRequest {
	    title?: string;
	    reason?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticSessionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.reason = source["reason"];
	    }
	}

}

export namespace redis {
	
	export class ZSetMember {
	    member: string;
	    score: number;
	
	    static createFrom(source: any = {}) {
	        return new ZSetMember(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.member = source["member"];
	        this.score = source["score"];
	    }
	}

}

export namespace sync {
	
	export class TableOptions {
	    insert?: boolean;
	    update?: boolean;
	    delete?: boolean;
	    selectedInsertPks?: string[];
	    selectedUpdatePks?: string[];
	    selectedDeletePks?: string[];
	
	    static createFrom(source: any = {}) {
	        return new TableOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.insert = source["insert"];
	        this.update = source["update"];
	        this.delete = source["delete"];
	        this.selectedInsertPks = source["selectedInsertPks"];
	        this.selectedUpdatePks = source["selectedUpdatePks"];
	        this.selectedDeletePks = source["selectedDeletePks"];
	    }
	}
	export class SyncConfig {
	    sourceConfig: connection.ConnectionConfig;
	    targetConfig: connection.ConnectionConfig;
	    tables: string[];
	    sourceQuery?: string;
	    content?: string;
	    mode: string;
	    jobId?: string;
	    autoAddColumns?: boolean;
	    targetTableStrategy?: string;
	    createIndexes?: boolean;
	    mongoCollectionName?: string;
	    tableOptions?: Record<string, TableOptions>;
	
	    static createFrom(source: any = {}) {
	        return new SyncConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceConfig = this.convertValues(source["sourceConfig"], connection.ConnectionConfig);
	        this.targetConfig = this.convertValues(source["targetConfig"], connection.ConnectionConfig);
	        this.tables = source["tables"];
	        this.sourceQuery = source["sourceQuery"];
	        this.content = source["content"];
	        this.mode = source["mode"];
	        this.jobId = source["jobId"];
	        this.autoAddColumns = source["autoAddColumns"];
	        this.targetTableStrategy = source["targetTableStrategy"];
	        this.createIndexes = source["createIndexes"];
	        this.mongoCollectionName = source["mongoCollectionName"];
	        this.tableOptions = this.convertValues(source["tableOptions"], TableOptions, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SyncResult {
	    success: boolean;
	    message: string;
	    logs: string[];
	    tablesSynced: number;
	    rowsInserted: number;
	    rowsUpdated: number;
	    rowsDeleted: number;
	
	    static createFrom(source: any = {}) {
	        return new SyncResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.logs = source["logs"];
	        this.tablesSynced = source["tablesSynced"];
	        this.rowsInserted = source["rowsInserted"];
	        this.rowsUpdated = source["rowsUpdated"];
	        this.rowsDeleted = source["rowsDeleted"];
	    }
	}

}

