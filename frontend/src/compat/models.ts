// JavaNavi compatibility DTOs mirrored from the generated Wails model contract.
// Source snapshot: generated models.ts @ a07eea7815d845545452afce86afdfa6f77d16ff


type CompatModelSource = Record<string, unknown> | string;
type CompatToolCallFunction = { name?: string; arguments?: string };
type CompatToolParameters = Record<string, unknown>;
type CompatDataRow = Record<string, unknown>;
type CompatModelConstructor<T> = new (source: CompatModelSource) => T;

function convertCompatValues<T>(value: unknown, ModelClass: CompatModelConstructor<T>, asMap: true): Record<string, T> | undefined;
function convertCompatValues<T>(value: unknown, ModelClass: CompatModelConstructor<T>, asMap?: false): T | T[] | undefined;
function convertCompatValues<T>(value: unknown, ModelClass: CompatModelConstructor<T>, asMap: boolean = false): T | T[] | Record<string, T> | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (Array.isArray(value)) {
        return value.map((item) => convertCompatValues(item, ModelClass) as T);
    }
    if (typeof value === 'object') {
        if (asMap) {
            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, new ModelClass(item as CompatModelSource)]),
            );
        }
        return new ModelClass(value as CompatModelSource);
    }
    return value as T;
}

function parseModelSource(source: CompatModelSource = {}): Record<string, never> {
    return typeof source === 'string' ? JSON.parse(source) as Record<string, never> : source as Record<string, never>;
}
export namespace ai {

	export class ToolCall {
	    id: string;
	    type: string;
	    // Go type: struct { Name string "json:\"name\""; Arguments string "json:\"arguments\"" }
	    function: CompatToolCallFunction;

	    static createFrom(source: CompatModelSource = {}) {
	        return new ToolCall(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.id = sourceRecord["id"];
	        this.type = sourceRecord["type"];
	        this.function = sourceRecord["function"] as CompatToolCallFunction;
	    }

	}
	export class Message {
	    role: string;
	    content: string;
	    images?: string[];
	    tool_call_id?: string;
	    tool_calls?: ToolCall[];

	    static createFrom(source: CompatModelSource = {}) {
	        return new Message(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.role = sourceRecord["role"];
	        this.content = sourceRecord["content"];
	        this.images = sourceRecord["images"];
	        this.tool_call_id = sourceRecord["tool_call_id"];
	        this.tool_calls = convertCompatValues(sourceRecord["tool_calls"], ToolCall) as ToolCall[] | undefined;
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
	    transportEnabled?: boolean;
	    transportCapability?: string;
	    modelDiscoverySupported?: boolean;
	    maxTokens: number;
	    temperature: number;

	    static createFrom(source: CompatModelSource = {}) {
	        return new ProviderConfig(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.id = sourceRecord["id"];
	        this.type = sourceRecord["type"];
	        this.name = sourceRecord["name"];
	        this.apiKey = sourceRecord["apiKey"];
	        this.secretRef = sourceRecord["secretRef"];
	        this.hasSecret = sourceRecord["hasSecret"];
	        this.baseUrl = sourceRecord["baseUrl"];
	        this.model = sourceRecord["model"];
	        this.models = sourceRecord["models"];
	        this.apiFormat = sourceRecord["apiFormat"];
	        this.headers = sourceRecord["headers"];
	        this.transportEnabled = sourceRecord["transportEnabled"];
	        this.transportCapability = sourceRecord["transportCapability"];
	        this.modelDiscoverySupported = sourceRecord["modelDiscoverySupported"];
	        this.maxTokens = sourceRecord["maxTokens"];
	        this.temperature = sourceRecord["temperature"];
	    }
	}
	export class SafetyResult {
	    allowed: boolean;
	    operationType: string;
	    requiresConfirm: boolean;
	    warningMessage?: string;

	    static createFrom(source: CompatModelSource = {}) {
	        return new SafetyResult(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.allowed = sourceRecord["allowed"];
	        this.operationType = sourceRecord["operationType"];
	        this.requiresConfirm = sourceRecord["requiresConfirm"];
	        this.warningMessage = sourceRecord["warningMessage"];
	    }
	}
	export class ToolFunction {
	    name: string;
	    description: string;
	    parameters: CompatToolParameters;

	    static createFrom(source: CompatModelSource = {}) {
	        return new ToolFunction(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.name = sourceRecord["name"];
	        this.description = sourceRecord["description"];
	        this.parameters = sourceRecord["parameters"];
	    }
	}
	export class Tool {
	    type: string;
	    function: ToolFunction;

	    static createFrom(source: CompatModelSource = {}) {
	        return new Tool(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.type = sourceRecord["type"];
	        this.function = convertCompatValues(sourceRecord["function"], ToolFunction) as ToolFunction;
	    }

	}


}

export namespace app {

	export class ConnectionExportOptions {
	    includeSecrets: boolean;
	    filePassword?: string;

	    static createFrom(source: CompatModelSource = {}) {
	        return new ConnectionExportOptions(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.includeSecrets = sourceRecord["includeSecrets"];
	        this.filePassword = sourceRecord["filePassword"];
	    }
	}

}

export namespace connection {

	export class UpdateRow {
	    keys: CompatDataRow;
	    values: CompatDataRow;

	    static createFrom(source: CompatModelSource = {}) {
	        return new UpdateRow(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.keys = sourceRecord["keys"];
	        this.values = sourceRecord["values"];
	    }
	}
	export class ChangeSet {
	    inserts: CompatDataRow[];
	    updates: UpdateRow[];
	    deletes: CompatDataRow[];
	    locatorStrategy?: string;

	    static createFrom(source: CompatModelSource = {}) {
	        return new ChangeSet(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.inserts = sourceRecord["inserts"];
	        this.updates = convertCompatValues(sourceRecord["updates"], UpdateRow) as UpdateRow[] || [];
	        this.deletes = sourceRecord["deletes"];
	        this.locatorStrategy = sourceRecord["locatorStrategy"];
	    }

	}
	export class HTTPTunnelConfig {
	    host: string;
	    port: number;
	    user?: string;
	    password?: string;

	    static createFrom(source: CompatModelSource = {}) {
	        return new HTTPTunnelConfig(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.host = sourceRecord["host"];
	        this.port = sourceRecord["port"];
	        this.user = sourceRecord["user"];
	        this.password = sourceRecord["password"];
	    }
	}
	export class ProxyConfig {
	    type: string;
	    host: string;
	    port: number;
	    user?: string;
	    password?: string;

	    static createFrom(source: CompatModelSource = {}) {
	        return new ProxyConfig(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.type = sourceRecord["type"];
	        this.host = sourceRecord["host"];
	        this.port = sourceRecord["port"];
	        this.user = sourceRecord["user"];
	        this.password = sourceRecord["password"];
	    }
	}
	export class SSHConfig {
	    host: string;
	    port: number;
	    user: string;
	    password: string;
	    keyPath: string;

	    static createFrom(source: CompatModelSource = {}) {
	        return new SSHConfig(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.host = sourceRecord["host"];
	        this.port = sourceRecord["port"];
	        this.user = sourceRecord["user"];
	        this.password = sourceRecord["password"];
	        this.keyPath = sourceRecord["keyPath"];
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
	    ssh?: SSHConfig;
	    useProxy?: boolean;
	    proxy?: ProxyConfig;
	    useHttpTunnel?: boolean;
	    httpTunnel?: HTTPTunnelConfig;
	    driver?: string;
	    dsn?: string;
	    options?: Record<string, string>;
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

	    static createFrom(source: CompatModelSource = {}) {
	        return new ConnectionConfig(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.id = sourceRecord["id"];
	        this.type = sourceRecord["type"];
	        this.host = sourceRecord["host"];
	        this.port = sourceRecord["port"];
	        this.user = sourceRecord["user"];
	        this.password = sourceRecord["password"];
	        this.savePassword = sourceRecord["savePassword"];
	        this.database = sourceRecord["database"];
	        this.useSSL = sourceRecord["useSSL"];
	        this.sslMode = sourceRecord["sslMode"];
	        this.sslCertPath = sourceRecord["sslCertPath"];
	        this.sslKeyPath = sourceRecord["sslKeyPath"];
	        this.useSSH = sourceRecord["useSSH"];
	        this.ssh = convertCompatValues(sourceRecord["ssh"], SSHConfig) as SSHConfig | undefined;
	        this.useProxy = sourceRecord["useProxy"];
	        this.proxy = convertCompatValues(sourceRecord["proxy"], ProxyConfig) as ProxyConfig | undefined;
	        this.useHttpTunnel = sourceRecord["useHttpTunnel"];
	        this.httpTunnel = convertCompatValues(sourceRecord["httpTunnel"], HTTPTunnelConfig) as HTTPTunnelConfig | undefined;
	        this.driver = sourceRecord["driver"];
	        this.dsn = sourceRecord["dsn"];
	        this.options = sourceRecord["options"];
	        this.timeout = sourceRecord["timeout"];
	        this.redisDB = sourceRecord["redisDB"];
	        this.uri = sourceRecord["uri"];
	        this.hosts = sourceRecord["hosts"];
	        this.topology = sourceRecord["topology"];
	        this.mysqlReplicaUser = sourceRecord["mysqlReplicaUser"];
	        this.mysqlReplicaPassword = sourceRecord["mysqlReplicaPassword"];
	        this.replicaSet = sourceRecord["replicaSet"];
	        this.authSource = sourceRecord["authSource"];
	        this.readPreference = sourceRecord["readPreference"];
	        this.mongoSrv = sourceRecord["mongoSrv"];
	        this.mongoAuthMechanism = sourceRecord["mongoAuthMechanism"];
	        this.mongoReplicaUser = sourceRecord["mongoReplicaUser"];
	        this.mongoReplicaPassword = sourceRecord["mongoReplicaPassword"];
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

	    static createFrom(source: CompatModelSource = {}) {
	        return new GlobalProxyView(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.enabled = sourceRecord["enabled"];
	        this.type = sourceRecord["type"];
	        this.host = sourceRecord["host"];
	        this.port = sourceRecord["port"];
	        this.user = sourceRecord["user"];
	        this.password = sourceRecord["password"];
	        this.hasPassword = sourceRecord["hasPassword"];
	        this.secretRef = sourceRecord["secretRef"];
	    }
	}







	export class QueryResult {
	    success: boolean;
	    message: string;
	    data: unknown;
	    fields?: string[];
	    queryId?: string;
	    revealMessage?: string;
	    revealTargetPath?: string;
	    revealDirectory?: string;
	    revealMethod?: string;
	    revealed?: boolean;
	    revealSelected?: boolean;

	    static createFrom(source: CompatModelSource = {}) {
	        return new QueryResult(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.success = sourceRecord["success"];
	        this.message = sourceRecord["message"];
	        this.data = sourceRecord["data"];
	        this.fields = sourceRecord["fields"];
	        this.queryId = sourceRecord["queryId"];
	        this.revealMessage = sourceRecord["revealMessage"];
	        this.revealTargetPath = sourceRecord["revealTargetPath"];
	        this.revealDirectory = sourceRecord["revealDirectory"];
	        this.revealMethod = sourceRecord["revealMethod"];
	        this.revealed = sourceRecord["revealed"];
	        this.revealSelected = sourceRecord["revealSelected"];
	    }
	}

	export class SaveGlobalProxyInput {
	    enabled: boolean;
	    type: string;
	    host: string;
	    port: number;
	    user?: string;
	    password?: string;

	    static createFrom(source: CompatModelSource = {}) {
	        return new SaveGlobalProxyInput(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.enabled = sourceRecord["enabled"];
	        this.type = sourceRecord["type"];
	        this.host = sourceRecord["host"];
	        this.port = sourceRecord["port"];
	        this.user = sourceRecord["user"];
	        this.password = sourceRecord["password"];
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

	    static createFrom(source: CompatModelSource = {}) {
	        return new SavedConnectionInput(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.id = sourceRecord["id"];
	        this.name = sourceRecord["name"];
	        this.config = convertCompatValues(sourceRecord["config"], ConnectionConfig) as ConnectionConfig;
	        this.includeDatabases = sourceRecord["includeDatabases"];
	        this.includeRedisDatabases = sourceRecord["includeRedisDatabases"];
	        this.iconType = sourceRecord["iconType"];
	        this.iconColor = sourceRecord["iconColor"];
	        this.clearPrimaryPassword = sourceRecord["clearPrimaryPassword"];
	        this.clearSSHPassword = sourceRecord["clearSSHPassword"];
	        this.clearProxyPassword = sourceRecord["clearProxyPassword"];
	        this.clearHttpTunnelPassword = sourceRecord["clearHttpTunnelPassword"];
	        this.clearMySQLReplicaPassword = sourceRecord["clearMySQLReplicaPassword"];
	        this.clearMongoReplicaPassword = sourceRecord["clearMongoReplicaPassword"];
	        this.clearOpaqueURI = sourceRecord["clearOpaqueURI"];
	        this.clearOpaqueDSN = sourceRecord["clearOpaqueDSN"];
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

	    static createFrom(source: CompatModelSource = {}) {
	        return new SavedConnectionView(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.id = sourceRecord["id"];
	        this.name = sourceRecord["name"];
	        this.config = convertCompatValues(sourceRecord["config"], ConnectionConfig) as ConnectionConfig;
	        this.includeDatabases = sourceRecord["includeDatabases"];
	        this.includeRedisDatabases = sourceRecord["includeRedisDatabases"];
	        this.iconType = sourceRecord["iconType"];
	        this.iconColor = sourceRecord["iconColor"];
	        this.secretRef = sourceRecord["secretRef"];
	        this.hasPrimaryPassword = sourceRecord["hasPrimaryPassword"];
	        this.hasSSHPassword = sourceRecord["hasSSHPassword"];
	        this.hasProxyPassword = sourceRecord["hasProxyPassword"];
	        this.hasHttpTunnelPassword = sourceRecord["hasHttpTunnelPassword"];
	        this.hasMySQLReplicaPassword = sourceRecord["hasMySQLReplicaPassword"];
	        this.hasMongoReplicaPassword = sourceRecord["hasMongoReplicaPassword"];
	        this.hasOpaqueURI = sourceRecord["hasOpaqueURI"];
	        this.hasOpaqueDSN = sourceRecord["hasOpaqueDSN"];
	    }

	}

}


export namespace redis {

	export class ZSetMember {
	    member: string;
	    score: number;

	    static createFrom(source: CompatModelSource = {}) {
	        return new ZSetMember(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.member = sourceRecord["member"];
	        this.score = sourceRecord["score"];
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

	    static createFrom(source: CompatModelSource = {}) {
	        return new TableOptions(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.insert = sourceRecord["insert"];
	        this.update = sourceRecord["update"];
	        this.delete = sourceRecord["delete"];
	        this.selectedInsertPks = sourceRecord["selectedInsertPks"];
	        this.selectedUpdatePks = sourceRecord["selectedUpdatePks"];
	        this.selectedDeletePks = sourceRecord["selectedDeletePks"];
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

	    static createFrom(source: CompatModelSource = {}) {
	        return new SyncConfig(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.sourceConfig = convertCompatValues(sourceRecord["sourceConfig"], connection.ConnectionConfig) as connection.ConnectionConfig;
	        this.targetConfig = convertCompatValues(sourceRecord["targetConfig"], connection.ConnectionConfig) as connection.ConnectionConfig;
	        this.tables = sourceRecord["tables"];
	        this.sourceQuery = sourceRecord["sourceQuery"];
	        this.content = sourceRecord["content"];
	        this.mode = sourceRecord["mode"];
	        this.jobId = sourceRecord["jobId"];
	        this.autoAddColumns = sourceRecord["autoAddColumns"];
	        this.targetTableStrategy = sourceRecord["targetTableStrategy"];
	        this.createIndexes = sourceRecord["createIndexes"];
	        this.mongoCollectionName = sourceRecord["mongoCollectionName"];
	        this.tableOptions = convertCompatValues(sourceRecord["tableOptions"], TableOptions, true);
	    }

	}
	export class SyncResult {
	    success: boolean;
	    cancelled?: boolean;
	    message: string;
	    logs: string[];
	    tablesSynced: number;
	    rowsInserted: number;
	    rowsUpdated: number;
	    rowsDeleted: number;

	    static createFrom(source: CompatModelSource = {}) {
	        return new SyncResult(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.success = sourceRecord["success"];
	        this.cancelled = sourceRecord["cancelled"];
	        this.message = sourceRecord["message"];
	        this.logs = sourceRecord["logs"];
	        this.tablesSynced = sourceRecord["tablesSynced"];
	        this.rowsInserted = sourceRecord["rowsInserted"];
	        this.rowsUpdated = sourceRecord["rowsUpdated"];
	        this.rowsDeleted = sourceRecord["rowsDeleted"];
	    }
	}

}

export namespace schemaSync {

	export class DiffItem {
	    id: string;
	    tableName: string;
	    objectType: string;
	    objectName: string;
	    changeType: string;
	    summary: string;
	    supported: boolean;
	    unsupportedReason?: string;
	    requiresDeleteConfirm?: boolean;
	    sql?: string[];
	    sqlStatements?: string[];
	    warnings?: string[];

	    static createFrom(source: CompatModelSource = {}) {
	        return new DiffItem(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.id = sourceRecord["id"];
	        this.tableName = sourceRecord["tableName"];
	        this.objectType = sourceRecord["objectType"];
	        this.objectName = sourceRecord["objectName"];
	        this.changeType = sourceRecord["changeType"];
	        this.summary = sourceRecord["summary"];
	        this.supported = sourceRecord["supported"];
	        this.unsupportedReason = sourceRecord["unsupportedReason"];
	        this.requiresDeleteConfirm = sourceRecord["requiresDeleteConfirm"];
	        this.sql = sourceRecord["sql"];
	        this.sqlStatements = sourceRecord["sqlStatements"];
	        this.warnings = sourceRecord["warnings"];
	    }
	}
	export class TableDiff {
	    table: string;
	    sourceExists?: boolean;
	    targetTableExists?: boolean;
	    canSync?: boolean;
	    schemaDiffCount?: number;
	    message?: string;
	    warnings?: string[];
	    items?: DiffItem[];
	    selectedItemIds?: string[];
	    deleteItemIds?: string[];

	    static createFrom(source: CompatModelSource = {}) {
	        return new TableDiff(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.table = sourceRecord["table"];
	        this.sourceExists = sourceRecord["sourceExists"];
	        this.targetTableExists = sourceRecord["targetTableExists"];
	        this.canSync = sourceRecord["canSync"];
	        this.schemaDiffCount = sourceRecord["schemaDiffCount"];
	        this.message = sourceRecord["message"];
	        this.warnings = sourceRecord["warnings"];
	        this.items = convertCompatValues(sourceRecord["items"], DiffItem) as DiffItem[] | undefined;
	        this.selectedItemIds = sourceRecord["selectedItemIds"];
	        this.deleteItemIds = sourceRecord["deleteItemIds"];
	    }

	}
	export class RunConfig {
	    sourceConfig: connection.ConnectionConfig;
	    targetConfig: connection.ConnectionConfig;
	    sourceDatabase: string;
	    targetDatabase: string;
	    tables: string[];
	    selectedItemIds?: string[];
	    confirmedDeleteItemIds?: string[];
	    jobId?: string;

	    static createFrom(source: CompatModelSource = {}) {
	        return new RunConfig(source);
	    }

	    constructor(source: CompatModelSource = {}) {
	        const sourceRecord = parseModelSource(source);
	        this.sourceConfig = convertCompatValues(sourceRecord["sourceConfig"], connection.ConnectionConfig) as connection.ConnectionConfig;
	        this.targetConfig = convertCompatValues(sourceRecord["targetConfig"], connection.ConnectionConfig) as connection.ConnectionConfig;
	        this.sourceDatabase = sourceRecord["sourceDatabase"];
	        this.targetDatabase = sourceRecord["targetDatabase"];
	        this.tables = sourceRecord["tables"];
	        this.selectedItemIds = sourceRecord["selectedItemIds"];
	        this.confirmedDeleteItemIds = sourceRecord["confirmedDeleteItemIds"];
	        this.jobId = sourceRecord["jobId"];
	    }

	}
}
