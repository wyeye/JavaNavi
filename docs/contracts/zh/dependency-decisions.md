# JavaNavi 依赖决策门禁

中文 | [English](../dependency-decisions.md)

本文档维护 JavaNavi Java/Web/Desktop 运行时的依赖决策。产品范围参考并感谢 [GoNavi](https://github.com/Syngnat/GoNavi)；下面的依赖选择说明 JavaNavi 在哪些地方采用 Java 或 Web/Desktop 替代实现。

任何 Redis、MongoDB、AI provider、JVM/JMX helper、可选数据库 driver、事件传输、打包或安全敏感代码的新 runtime 依赖，都必须先在本文档中获得批准，再加入 `backend/pom.xml`、`frontend/package.json`、根 `package.json` 或相关 lockfile。

## 门禁策略

每个决策条目必须包含：

- **Decision ID** — 本维护决策日志使用的稳定标识。
- **Package choice** — 包/artifact 名称、版本或版本管理来源。
- **License and maintenance** — 许可兼容性、维护状态与发布节奏。
- **Scope** — runtime、optional、profile-scoped、build-only 或继承 UI 依赖。
- **Verification** — 证明该依赖仍被诚实接入的维护命令。
- **Secret/credential impact** — secret、URL、路径、prompt 或 token 是否经过该依赖。
- **Rejected alternatives** — 至少一个当前未采用的替代方案及原因。

## 当前已批准依赖

### Decision ID: DEP-FOUNDATION-SPRING-WEB

- **Package choice:** 通过 Spring Boot parent 引入 `org.springframework.boot:spring-boot-starter-web`。
- **License and maintenance:** Apache-2.0；Spring 项目活跃维护。
- **Scope:** Java Web 包与 REST API 的 runtime 基础。
- **Verification:** `scripts/package-web.sh` 与后端 `mvn package` 会打包 jar 并编译 API 边界。
- **Secret/credential impact:** HTTP 边界必须在处理凭据请求前执行 local-session 与 origin 检查。
- **Rejected alternatives:** 重新引入 Wails/Go runtime | 违背 Java Web runtime 目标。

### Decision ID: DEP-FOUNDATION-SPRING-VALIDATION

- **Package choice:** 通过 Spring Boot parent 引入 `org.springframework.boot:spring-boot-starter-validation`。
- **License and maintenance:** Apache-2.0；由 Spring 管理。
- **Scope:** 后端 API 请求 DTO 校验。
- **Verification:** 后端 `mvn package` 编译 validation 注解和 controller。
- **Secret/credential impact:** 校验消息不能回显原始 secret。
- **Rejected alternatives:** 只做 controller 手写校验 | 会重复规则并增加漂移。

### Decision ID: DEP-FOUNDATION-SPRING-JDBC

- **Package choice:** 通过 Spring Boot parent 引入 `org.springframework.boot:spring-boot-starter-jdbc`。
- **License and maintenance:** Apache-2.0；由 Spring 管理。
- **Scope:** 关系型服务的 JDBC runtime 基础。
- **Verification:** 后端 `mvn package`，以及按需进行 package/startup smoke。
- **Secret/credential impact:** JDBC URL、密码与 SQL 异常必须在响应、事件和日志前脱敏。
- **Rejected alternatives:** 只用 DriverManager 不用 Spring JDBC | 会重复连接与异常处理逻辑。

### Decision ID: DEP-FOUNDATION-H2-DEMO

- **Package choice:** runtime scope 的 `com.h2database:h2`。
- **License and maintenance:** MPL 2.0 / EPL 1.0 双许可；H2 项目维护中。
- **Scope:** demo/smoke 数据库与浏览器适配器 E2E fixture。
- **Verification:** 后端 package 检查与本地 package 启动会覆盖 H2 runtime 路径。
- **Secret/credential impact:** demo 流程无凭据；脱敏门禁仍会同时运行。
- **Rejected alternatives:** 外部数据库作为默认 smoke | 需要本地凭据和破坏性 fixture 策略。

### Decision ID: DEP-FOUNDATION-MYSQL-DRIVER

- **Package choice:** runtime scope 的 `com.mysql:mysql-connector-j`。
- **License and maintenance:** GPLv2 with FOSS exception；Oracle/MySQL 活跃维护。
- **Scope:** Java Web/full-driver 构建的 MySQL-compatible JDBC profile；desktop slim 默认排除。
- **Verification:** 后端 `mvn package`，以及可用时的手动/runtime 连接 smoke。
- **Secret/credential impact:** 密码和 JDBC URL 携带凭据，必须继续由 runtime 脱敏行为覆盖。
- **Rejected alternatives:** MariaDB driver 作为 MySQL 默认实现 | 后续可能有用，但当前直接 MySQL 兼容从 Connector/J 开始。

### Decision ID: DEP-FOUNDATION-POSTGRESQL-DRIVER

- **Package choice:** runtime scope 的 `org.postgresql:postgresql`。
- **License and maintenance:** BSD-2-Clause；PostgreSQL JDBC driver 活跃维护。
- **Scope:** Java Web/full-driver 构建的 PostgreSQL-compatible JDBC profile；desktop slim 默认排除。
- **Verification:** 后端 `mvn package`，以及可用时的手动/runtime 连接 smoke。
- **Secret/credential impact:** 密码和 JDBC URL 携带凭据，必须继续由 runtime 脱敏行为覆盖。
- **Rejected alternatives:** 先做泛型用户自带 JDBC placeholder | 推迟过多行为并削弱运行时证据。

### Decision ID: DEP-SQLITE-XERIAL-JDBC

- **Package choice:** runtime scope 的 `org.xerial:sqlite-jdbc:3.53.0.0`。
- **License and maintenance:** Apache-2.0；Xerial driver 跟随 SQLite 发布并为主流桌面/服务端 OS 打包 native library。
- **Scope:** 可选 SQLite 文件数据库 runtime profile；desktop slim 默认排除并显示受管下载状态。
- **Verification:** 后端 `mvn package`，以及按需进行手动/runtime SQLite 与 driver-manager smoke。
- **Secret/credential impact:** SQLite 文件路径可能泄漏本地用户名和项目名，因此 API 错误与受管 driver metadata 必须继续经过 `SecretRedactor`。
- **Rejected alternatives:** 直接重写 SQLite 文件格式 | 正确性风险高，也无法获得 JDBC metadata 兼容。

### Decision ID: DEP-DUCKDB-JDBC

- **Package choice:** runtime scope 的 `org.duckdb:duckdb_jdbc:1.5.2.0`。
- **License and maintenance:** MIT；DuckDB 项目维护，当前 Java/JDBC artifact 发布到 Maven Central。
- **Scope:** 可选 DuckDB 文件数据库 runtime profile；desktop slim 默认排除并显示受管下载状态。
- **Verification:** 后端 `mvn package`，以及按需进行手动/runtime DuckDB 与 driver-manager smoke。
- **Secret/credential impact:** DuckDB 文件路径可能泄漏本地用户名和项目名，因此 API 错误与受管 driver metadata 必须继续经过 `SecretRedactor`。
- **Rejected alternatives:** 通过 SQLite/H2 模拟 DuckDB | SQL 方言与存储语义不匹配。

### Decision ID: DEP-EXTENDED-JDBC-DRIVER-PROFILES

- **Package choice:** runtime scope 的 `com.microsoft.sqlserver:mssql-jdbc:13.4.0.jre11`、`com.oracle.database.jdbc:ojdbc11:23.26.1.0.0`、`com.dameng:DmJdbcDriver18:8.1.3.140`、`com.taosdata.jdbc:taos-jdbcdriver:3.8.3`、`com.clickhouse:clickhouse-jdbc:0.9.8`。
- **License and maintenance:** 厂商发布的 Maven Central JDBC artifact；按 `driverType` 隔离使用，只有匹配 profile 才加载。
- **Scope:** Java Web/full-driver 构建的可选 JDBC profile；desktop slim 默认排除并显示受管下载状态。
- **Verification:** 后端 `mvn package`，以及按需进行手动/runtime 可选 driver smoke。
- **Secret/credential impact:** 这些 profile 携带凭据型 JDBC URL/options，必须继续经过 `SecretRedactor`、`SecretStore` 与连接错误脱敏门禁。
- **Rejected alternatives:** 优先动态加载用户自带 JDBC jar | 需要 classloader 隔离、信任提示、恶意扫描与单独安全设计。

### Decision ID: DEP-DESKTOP-SLIM-PROFILE

- **Package choice:** Maven profile `desktop-slim`，默认由 `scripts/package-desktop-sidecar.sh` 选择，除非 `DESKTOP_PACKAGE_PROFILE` 覆盖。
- **License and maintenance:** 不引入新依赖；只控制已批准可选 JDBC artifact 是否嵌入桌面包。
- **Scope:** 桌面打包 profile。保留 Spring/Web/JDBC 基础、H2、Redis/Mongo direct runtime 与连接包加密；从首阶段桌面安装包排除外部 JDBC driver jar。
- **Verification:** `npm run desktop:stage` 使用所选 profile stage 桌面 jar；修改 driver 打包时检查 staged jar/profile 输出。
- **Secret/credential impact:** 不新增凭据边界。被排除的可选 driver 在受管下载/上传前不可加载。
- **Rejected alternatives:** 首个桌面安装包内置所有可选 JDBC driver | 会让包体积被低频 driver jar 主导。

### Decision ID: DEP-CONNECTION-PACKAGE-CRYPTO

- **Package choice:** 后端构建中已固定的 Bouncy Castle provider API。
- **License and maintenance:** MIT-style Bouncy Castle license；当前 Java provider 线维护 Argon2 与 AES/GCM primitives。
- **Scope:** `.javanavi-conn` 连接恢复包的后端 runtime 加密兼容。
- **Verification:** 后端 `mvn package`，以及按需进行手动/runtime saved-connection 导入导出与脱敏 smoke。
- **Secret/credential impact:** 在内存中处理包密码与加密 secret bundle；导入/导出仍只通过 JavaNavi `SecretStore` 存储 secret。
- **Rejected alternatives:** 在项目代码中实现 Argon2id | 密码学风险高且审计面更大。

### Decision ID: DEP-FOUNDATION-REACT-UI

- **Package choice:** `frontend/package.json` 中现有 React 18、Ant Design、Monaco、Mermaid、Recharts、Zustand 及支撑前端栈。
- **License and maintenance:** 继承前端依赖；通过 npm lockfile 与 build 检查维护。
- **Scope:** 浏览器 UI runtime 与前端构建工具。
- **Verification:** `npm --prefix frontend run build` 与 Java Web package 启动 smoke。
- **Secret/credential impact:** 浏览器代码不得记录 adapter/event 中的 API key/password；服务端 payload 的脱敏仍以后端为准。
- **Rejected alternatives:** 在本次文档/清理中替换 UI 库栈 | 会把产品重设计风险混入文档维护。

### Decision ID: DEP-DESKTOP-TAURI

- **Package choice:** 根 `package.json` 中的 `@tauri-apps/cli` v2 与 `src-tauri` 下 Rust 侧 Tauri crate。
- **License and maintenance:** Tauri v2 栈；由 Tauri 项目活跃维护。
- **Scope:** 可选原生桌面壳与 Java sidecar 生命周期。
- **Verification:** `npm run desktop:stage`、`npm run desktop:build`，以及宿主平台依赖安装后可运行的 Rust/Cargo 检查。
- **Secret/credential impact:** 桌面打开本地日志/数据目录并带数据目录启动后端；不新增远程凭据边界。
- **Rejected alternatives:** 原生 UI 重写 | 当前壳可保留 Web UI 与 API 契约，无需重写。

## Pending / guarded dependency families

### Decision ID: DEP-REDIS-CLIENT

- **Status:** 当前后端依赖中已有 direct Java 实现/runtime profile。
- **Required verification:** 修改该区域时进行手动/runtime Redis smoke 与 UI-facing 浏览器适配器检查。
- **Secret/credential impact:** Redis 密码/URI 必须保持脱敏。

### Decision ID: DEP-MONGODB-CLIENT

- **Status:** 当前后端依赖中已有 direct Java 实现/runtime profile。
- **Required verification:** 修改该区域时进行手动/runtime MongoDB smoke 与 UI-facing 浏览器适配器检查。
- **Secret/credential impact:** MongoDB URI、SCRAM 凭据和 TLS 路径必须保持脱敏。

### Decision ID: DEP-AI-PROVIDER-SDK

- **Status:** 未采用厂商 SDK；JavaNavi 当前通过 JDK HTTP API 调用 OpenAI-compatible HTTP。
- **Allowed artifacts only after approval:** OpenAI/Anthropic/Azure 等 provider SDK 使用前必须新增决策条目。
- **Required verification:** 修改该区域时进行手动/runtime AI provider smoke 与 secret redaction 检查。
- **Secret/credential impact:** API key、base URL、header、prompt 与 stream chunk 都需要脱敏/日志纪律。

### Decision ID: DEP-JVM-JMX

- **Status:** 当前本地诊断使用 JDK 内置 management/JMX API。
- **Allowed artifacts only after approval:** Jolokia/OSHI 等第三方 helper 需要新增决策条目。
- **Required verification:** 修改该区域时进行手动/runtime JVM diagnostics smoke 与 diagnostic event 浏览器适配器检查。
- **Secret/credential impact:** 诊断输出可能包含环境 secret，进入事件/日志前必须脱敏。

### Decision ID: DEP-EVENT-TRANSPORT

- **Status:** 使用现有 Spring Web 与浏览器 SSE/EventSource API，无额外依赖。
- **Package choice:** 不新增依赖。
- **License and maintenance:** 由现有 Spring Web 与浏览器 API 覆盖。
- **Scope:** 服务端到浏览器的 progress/token/chunk stream；REST 仍负责 command/cancel 路径。
- **Verification:** Java Web package 启动、手动/runtime AI stream smoke，以及按需检查 event chunk。
- **Secret/credential impact:** Event payload 绝不能包含原始 password、API key、bearer token、private key 或带凭据 URI。
- **Rejected alternatives:** WebSocket-first transport | 当前需求是服务端到浏览器 stream，尚未证明需要双向传输。
