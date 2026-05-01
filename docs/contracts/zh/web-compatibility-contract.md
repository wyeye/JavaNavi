# JavaNavi Web 兼容契约

中文 | [English](../web-compatibility-contract.md)

本文档让 JavaNavi 的 React UI 能继续承载参考 [GoNavi](https://github.com/Syngnat/GoNavi) 的数据库管理工作流，同时把运行时调用转换为 JavaNavi Java/Web API。JavaNavi 感谢 GoNavi 对产品行为和交互方式提供的开源参考。

## 目标

JavaNavi React UI 必须在没有 Wails 或 Go runtime 依赖的情况下运行。因此 JavaNavi 拥有一层兼容适配器：它保留前端可见的方法形状，同时把调用翻译到 Java Web 契约。

## Adapter 模块

| 模块 | 职责 |
|---|---|
| `frontend/src/compat/javanaviApp.ts` | 暴露原本来自 `wailsjs/go/app/App` 的 App-compatible functions。 |
| `frontend/src/compat/aiService.ts` | 暴露原本来自 `wailsjs/go/aiservice/Service` 的 AI service functions。 |
| `frontend/src/compat/runtime.ts` | 暴露 `EventsOn`、`EventsOff`、browser URL、quit/window no-op 与 window-state 兼容能力。 |
| `frontend/src/compat/models.ts` | 维护 adapter-visible DTO 形状。 |

应用组件只能导入这些模块或指向这些模块的 path alias。除迁移 fixture/test 外，禁止直接导入 generated Wails 文件。

## 传输映射

| Wails 形状 | Java Web 替代 | 说明 |
|---|---|---|
| `App.SomeMethod(args...) -> Promise<QueryResult>` | `fetch('/api/compat/app/some-method', { method: 'POST', body })` | Adapter 向 UI 返回 `QueryResult`。后端可在翻译层后使用内部 DTO。 |
| AI service calls | `/api/compat/ai/*` | Streaming 使用 event channel。 |
| `EventsOn(name, handler)` | runtime adapter 下的 SSE 或 WebSocket subscription | Adapter 隐藏传输选择。 |
| Query / SQL file / JVM cancellation | 专用 cancel endpoint | Cancellation ID 保持 adapter-visible。 |
| 原生打开/保存文件对话框 | 浏览器上传/下载或受管 server workspace | Java Web v1 不提供任意本地路径选择。 |
| Wails window controls | 浏览器安全 no-op、settings update 或 documented deferred desktop-only behavior | 不得破坏浏览器 UI。 |

## Adapter 可见响应 envelope

React UI 在组件有意重构前看到 JavaNavi-compatible `QueryResult` 形状：

```json
{
  "success": true,
  "message": "",
  "data": {},
  "fields": [],
  "queryId": "optional-cancel-id"
}
```

失败形状：

```json
{
  "success": false,
  "message": "human-readable failure",
  "data": null
}
```

后端 controller 只有在 adapter contract tests 证明前端可见形状兼容时，才可以在内部返回更丰富 Java DTO。

## Endpoint 命名策略

兼容实现应在把继承的 Wails-facing 调用形状迁移到 JavaNavi 自有 adapter 背后时，优先使用稳定 endpoint：

```text
/api/compat/app/{method-name-kebab}
/api/compat/ai/{method-name-kebab}
/api/compat/events
/api/compat/files/*
/api/compat/workspace/*
```

后续可以引入 domain-native endpoint，但 adapter function 必须保持唯一 component-facing compatibility seam，直到 focused contract update 有意把某个组件迁移到新 API。

## Event 契约

Progress 与 stream event 在被视为已维护的 UI-facing workflow 前，需要有 fixture 或 runtime smoke 覆盖。当前高优先级 event name：

- `sync:log`
- `sync:progress`
- `sync:start`
- `sync:done`
- `sqlfile:progress`
- `import:progress`
- `driver:download-progress`
- `update:download-progress`
- `ai:stream:{sessionId}`
- `jvm:diagnostic:{tabId}`

每个 event payload 必须包含足够支撑 UI progress/error state 的字段，并在标记实现完成前得到文档或验证覆盖。

## 文件工作流契约

浏览器安全替代是强制要求：

1. 用户选择输入文件：浏览器上传到 JavaNavi endpoint。
2. 生成输出：浏览器 download response。
3. 长时间服务端文件工作：使用受管 server workspace ID，而不是任意本地路径。
4. React state 中已有 path 字段可以在过渡期作为 label/ID 保留，但不得暗示 unrestricted local filesystem access。

## Capability status 契约

JavaNavi 可以暴露 capability status，避免 UI 把不可用操作显示为可用：

```json
{
  "id": "DBQueryWithCancel",
  "status": "stub-disabled",
  "phase": "Phase 3",
  "message": "Cancellable query Java endpoint not implemented yet"
}
```

允许的状态值：

- `implemented`
- `stub-disabled`
- `web-replacement`
- `deferred`
- `unsupported-with-rationale`

disabled/deferred/unsupported 状态必须在 UI 中显示为 disabled 或明确不可用。

## Local-session 传输要求

当前兼容 shell 对 `/api/v1/*` endpoint 使用 per-client local session。Unsafe credential-bearing request 必须受以下 endpoint 建立的 session 保护：

```text
GET /api/v1/session
```

前端兼容适配器负责该握手。应用组件不得直接 fetch 或持久化 token；应继续调用 `DBQuery`、`DBConnect`、`TestConnection` 等 adapter function。当前后端通过 HttpOnly SameSite cookie 设置 session；仅当后端为兼容性显式返回 token 时，adapter 才发送 legacy session header。SSE bridge 同样按 local-session 隔离：subscriber 只接收 bridge-ready 以及同一 session 认证请求发布的 runtime/AI/job event，不接收其它已认证浏览器 session 的 event。

当前 Java-backed shell endpoint 包括 health/session、受 local-session cookie 保护且按 session 隔离的 SSE event stream、connection test/open/close、schema metadata、query/multi/cancel、apply changes、DDL、SQL workspace read/write/list/select 等；新增 `/api/compat/*` 或 domain-native endpoint 必须保留相同 origin/session/redaction 控制，之后才能接收真实凭据。

## 浏览器适配器证据

当前维护的 compatibility seam 是 JavaNavi 浏览器适配器与 Java Web package。该 seam 变更时，应构建前端、打包 Java Web jar、启动本地 package，并从真实浏览器或等价 runtime harness 覆盖浏览器适配器路径。

当前需要覆盖的 adapter 路径包括：

- app runtime: `GetAppInfo`、`CheckForUpdates`、`CheckForUpdatesSilently`、`GetDataRootDirectoryInfo`、`GetSecurityUpdateStatus`；
- relational demo path: `DBConnect`、`DBQuery`；
- saved connections and secrets: `SaveConnection`、`GetSavedConnections`、`DuplicateConnection`、`DeleteConnection`、`ExportConnectionsPackage`、`SaveGlobalProxy`、`GetGlobalProxyConfig`；
- SQL workspace: `SelectSQLDirectory`、`WriteSQLFile`、`ReadSQLFile`、`ListSQLDirectory`。

证据路径必须验证前端会通过 adapter 建立 local session 且不持久化 token，浏览器调用能抵达 `/api/v1/*`，SSE event 不跨 local-session 边界，保存连接/global proxy 密码进入 `SecretStore` 后被脱敏，以及 JavaNavi connection package export metadata 可被浏览器 adapter 看到。
