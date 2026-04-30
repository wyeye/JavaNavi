# JavaNavi Web Compatibility Contract


[中文](zh/web-compatibility-contract.md) | English
This contract keeps JavaNavi's React UI compatible with GoNavi-inspired workflows while translating runtime calls to JavaNavi Java/Web APIs.

## Goal

The JavaNavi React UI must run without Wails or Go runtime dependencies. JavaNavi therefore owns a compatibility adapter that preserves the frontend-facing Wails method names while translating them to Java Web contracts.

## Adapter modules

| Module | Responsibility |
|---|---|
| `frontend/src/compat/javanaviApp.ts` | Expose App-compatible functions formerly imported from `wailsjs/go/app/App`. |
| `frontend/src/compat/aiService.ts` | Expose AI service functions formerly imported from `wailsjs/go/aiservice/Service`. |
| `frontend/src/compat/runtime.ts` | Expose `EventsOn`, `EventsOff`, browser URL, quit/window no-op, and window-state compatibility. |
| `frontend/src/compat/models.ts` | Curated or generated DTOs matching adapter-visible shapes. |

Application components should import only these modules or path aliases that point at these modules. Direct imports from generated Wails files are forbidden outside migration fixtures/tests.

## Transport mapping

| Wails shape | Java Web replacement | Notes |
|---|---|---|
| `App.SomeMethod(args...) -> Promise<QueryResult>` | `fetch('/api/compat/app/some-method', { method: 'POST', body })` | Adapter returns `QueryResult` to UI. Backend may use internal DTOs behind translation. |
| AI service calls | `/api/compat/ai/*` | Streaming uses event channel. |
| `EventsOn(name, handler)` | SSE or WebSocket subscription through runtime adapter | Adapter hides transport choice. |
| Query / SQL file / JVM cancellation | Dedicated cancel endpoints | Cancellation IDs remain adapter-visible. |
| Native file open/save dialogs | Browser upload/download or managed server workspace | No arbitrary local path selection in Java Web v1. |
| Wails window controls | Browser-safe no-op, settings update, or documented deferred desktop-only behavior | Must not break UI in browser. |

## Adapter-visible response envelope

The React UI sees the JavaNavi-compatible `QueryResult` shape until components are intentionally refactored later:

```json
{
  "success": true,
  "message": "",
  "data": {},
  "fields": [],
  "queryId": "optional-cancel-id"
}
```

Failure shape:

```json
{
  "success": false,
  "message": "human-readable failure",
  "data": null
}
```

Backend controllers may return richer Java DTOs internally only if adapter contract tests prove the frontend-visible shape remains compatible.

## Endpoint naming policy

Compatibility implementation should prefer stable endpoints while the inherited Wails-facing call shape is migrated behind JavaNavi-owned adapters:

```text
/api/compat/app/{method-name-kebab}
/api/compat/ai/{method-name-kebab}
/api/compat/events
/api/compat/files/*
/api/compat/workspace/*
```

Later implementation may introduce domain-native endpoints, but adapter functions must remain the only component-facing compatibility seam until a focused contract update intentionally moves a component to a new API.

## Event contract

Progress and stream events require fixtures or runtime smoke coverage before a UI-facing workflow is considered maintained. Current high-priority event names:

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

Each event payload must include enough fields for UI progress/error state and must be documented in fixtures before implementation is marked complete.

## File workflow contract

Browser-safe replacements are mandatory:

1. User-selected input file: browser upload to JavaNavi endpoint.
2. Generated output: browser download response.
3. Long-running server-side file work: managed server workspace ID, not arbitrary local path.
4. Existing path fields in React state may remain as labels/IDs during transition, but must not imply unrestricted local filesystem access.

## Capability status contract

JavaNavi may expose capability status so the UI can prevent unavailable operations from looking enabled:

```json
{
  "id": "DBQueryWithCancel",
  "status": "stub-disabled",
  "phase": "Phase 3",
  "message": "Cancellable query Java endpoint not implemented yet"
}
```

Allowed status values for function/capability rows:

- `implemented`
- `stub-disabled`
- `web-replacement`
- `deferred`
- `unsupported-with-rationale`

A disabled/deferred/unsupported status must render as disabled or clearly unavailable in the UI.

## Phase 2 local-session transport requirement

Phase 2 uses `/api/v1/*` endpoints for the current compatibility shell while the broader `/api/compat/*` surface is still being expanded. Unsafe credential-bearing requests must include the process-local session token issued by:

```text
GET /api/v1/session
```

The frontend compatibility adapter owns this handshake. Application components must not fetch or persist the token directly; they should continue calling adapter functions such as `DBQuery`, `DBConnect`, and `TestConnection`.

Current Java-backed shell endpoints:

| Endpoint | Purpose | Local-session required |
|---|---|---|
| `GET /api/v1/health` | Backend health and contract version | No |
| `GET /api/v1/capabilities` | Current capability metadata | No |
| `GET /api/v1/session` | Process-local token metadata and secret-store status | No |
| `POST /api/v1/connections/test` | Demo/H2 connection test shape | Yes |
| `POST /api/v1/connections/open` | Validate and open/reuse a managed MySQL/PostgreSQL JDBC pool; demo returns unpooled status | Yes |
| `GET /api/v1/connections/pools` | Non-secret managed pool status for diagnostics | No |
| `POST /api/v1/connections/close` | Close a managed JDBC pool by adapter-visible connection ID | Yes |
| `GET /api/v1/schema/tables` | Demo schema listing | No |
| `POST /api/v1/schema/tables` | Connection-scoped table/view listing | Yes |
| `POST /api/v1/schema/columns` | JavaNavi-compatible column definitions | Yes |
| `POST /api/v1/schema/columns/all` | JavaNavi-compatible autocomplete column definitions across tables | Yes |
| `POST /api/v1/schema/indexes` | JavaNavi-compatible index definitions | Yes |
| `POST /api/v1/schema/foreign-keys` | JavaNavi-compatible imported foreign key definitions | Yes |
| `POST /api/v1/schema/triggers` | JavaNavi-compatible trigger definitions where the JDBC dialect exposes information schema rows | Yes |
| `POST /api/v1/schema/show-create-table` | MySQL `SHOW CREATE TABLE` or metadata fallback DDL | Yes |
| `POST /api/v1/query` | Demo/H2/MySQL/PostgreSQL single SQL execution; SELECT rows or write affected-row shape | Yes |
| `POST /api/v1/query/multi` | JavaNavi-compatible multi-statement result-set array for mixed read/write batches | Yes |
| `POST /api/v1/query/cancel` | Cancel a running query by adapter-visible `queryId` via JDBC `Statement.cancel` where supported | Yes |
| `POST /api/v1/apply-changes` | DataGrid `ChangeSet` insert/update/delete transaction for relational tables | Yes |
| `POST /api/v1/ddl/clear-tables` | Delete all rows from selected relational tables | Yes |
| `POST /api/v1/ddl/truncate-tables` | Truncate selected relational tables where the dialect supports `TRUNCATE TABLE` | Yes |
| `POST /api/v1/ddl/create-database` | Create a database/schema using JavaNavi's direct JDBC dialect layer | Yes |
| `POST /api/v1/ddl/drop-database` | Drop a database/schema using JavaNavi's direct JDBC dialect layer | Yes |
| `POST /api/v1/ddl/rename-database` | Rename a database/schema where the dialect supports direct rename; MySQL-compatible drivers return an explicit unsupported result matching JavaNavi behavior | Yes |
| `POST /api/v1/ddl/drop-table` | Drop a table in a requested database/schema | Yes |
| `POST /api/v1/ddl/drop-view` | Drop a view in a requested database/schema | Yes |
| `POST /api/v1/ddl/drop-function` | Drop a routine/function in a requested database/schema where supported by the dialect | Yes |
| `POST /api/v1/ddl/rename-table` | Rename a table in a requested database/schema | Yes |
| `POST /api/v1/ddl/rename-view` | Rename a view in a requested database/schema | Yes |
| `POST /api/v1/app/sql-directory/select` | Return/create a JavaNavi managed SQL workspace directory instead of opening an OS directory picker | Yes |
| `POST /api/v1/app/sql-directory/list` | List SQL files/directories under the managed SQL workspace | Yes |
| `POST /api/v1/app/sql-file/read` | Read a SQL file from the managed SQL workspace | Yes |
| `POST /api/v1/app/sql-file/write` | Save SQL content to a managed workspace path for JavaNavi `WriteSQLFile(filePath, sql)` quick-save parity | Yes |

Future `/api/compat/*` or domain-native endpoints must preserve the same origin/session/redaction controls before accepting real credentials.

## Browser adapter evidence

The maintained compatibility seam is the JavaNavi browser adapter plus the Java Web package. When this seam changes, validate it by building the frontend, packaging the Java Web jar, starting the local package, and exercising the browser adapter paths from a real browser or equivalent runtime harness.

Current adapter paths to cover:

- app runtime: `GetAppInfo`, `CheckForUpdates`, `CheckForUpdatesSilently`, `GetDataRootDirectoryInfo`, `GetSecurityUpdateStatus`;
- relational demo path: `DBConnect`, `DBQuery`;
- saved connections and secrets: `SaveConnection`, `GetSavedConnections`, `DuplicateConnection`, `DeleteConnection`, `ExportConnectionsPackage`, `SaveGlobalProxy`, `GetGlobalProxyConfig`;
- SQL workspace: `SelectSQLDirectory`, `WriteSQLFile`, `ReadSQLFile`, `ListSQLDirectory`.

The evidence path must verify that the frontend obtains a process-local session token itself, browser calls reach `/api/v1/*`, saved connection/global proxy passwords are redacted after entering `SecretStore`, and JavaNavi connection package export metadata is visible to the browser adapter.
