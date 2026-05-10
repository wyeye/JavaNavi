# JavaNavi Dependency Decision Gate


[中文](zh/dependency-decisions.md) | English
This decision log is maintained for JavaNavi's Java/Web/Desktop runtime. Product scope is informed by [GoNavi](https://github.com/Syngnat/GoNavi); dependency choices below document where JavaNavi intentionally uses Java or Web/Desktop replacements.

This file is the maintained dependency decision log for JavaNavi. Any new runtime dependency for Redis, MongoDB, AI providers, optional database drivers, event transports, packaging, or security-sensitive code must have an approved entry here before it is added to `backend/pom.xml`, `frontend/package.json`, root `package.json`, or related lockfiles.

## Gate policy

Each decision entry must include:

- **Decision ID** — stable identifier for this maintained decision log.
- **Package choice** — package/artifact names and versions or version-management source.
- **License and maintenance** — license compatibility, maintenance signal, and release cadence.
- **Scope** — runtime, optional, profile-scoped, build-only, or inherited UI dependency.
- **Verification** — maintained command(s) that prove the dependency is still wired honestly.
- **Secret/credential impact** — whether secrets, URLs, paths, prompts, or tokens cross the dependency.
- **Rejected alternatives** — at least one alternative and why it is not used now.

## Approved current dependencies

### Decision ID: DEP-FOUNDATION-SPRING-WEB

- **Package choice:** `org.springframework.boot:spring-boot-starter-web` via the Spring Boot parent.
- **License and maintenance:** Apache-2.0; actively maintained by the Spring project.
- **Scope:** Runtime foundation for the Java Web package and REST API.
- **Verification:** `scripts/package-web.sh` and backend `mvn package` package the jar and compile the API boundary.
- **Secret/credential impact:** HTTP boundary must enforce local-session and origin checks before credential-bearing calls.
- **Rejected alternatives:** Reintroduce Wails/Go runtime | violates the Java Web runtime target.

### Decision ID: DEP-FOUNDATION-SPRING-VALIDATION

- **Package choice:** `org.springframework.boot:spring-boot-starter-validation` via the Spring Boot parent.
- **License and maintenance:** Apache-2.0; Spring-managed.
- **Scope:** Request DTO validation for backend APIs.
- **Verification:** backend `mvn package` compiles validation annotations and controllers.
- **Secret/credential impact:** Validation messages must not echo raw secrets.
- **Rejected alternatives:** Manual controller validation only | duplicates rules and increases drift.

### Decision ID: DEP-FOUNDATION-SPRING-JDBC

- **Package choice:** `org.springframework.boot:spring-boot-starter-jdbc` via the Spring Boot parent.
- **License and maintenance:** Apache-2.0; Spring-managed.
- **Scope:** Runtime JDBC foundation for relational services.
- **Verification:** backend `mvn package` and package/startup smoke when needed.
- **Secret/credential impact:** JDBC URLs, passwords, and SQL errors must be redacted before responses/events/logs.
- **Rejected alternatives:** Direct driver-manager only without Spring JDBC | duplicates connection and exception handling.

### Decision ID: DEP-FOUNDATION-H2-DEMO

- **Package choice:** `com.h2database:h2` with runtime scope.
- **License and maintenance:** MPL 2.0 / EPL 1.0 dual license; maintained H2 project.
- **Scope:** Runtime demo/smoke database and browser adapter E2E fixture.
- **Verification:** backend package checks and local package startup exercise the H2-backed runtime path.
- **Secret/credential impact:** Demo flow is credentialless; redaction gate still runs alongside it.
- **Rejected alternatives:** External DB as default smoke | would require local credentials and destructive-fixture policy.

### Decision ID: DEP-FOUNDATION-MYSQL-DRIVER

- **Package choice:** `com.mysql:mysql-connector-j` with runtime scope.
- **License and maintenance:** GPLv2 with FOSS exception; actively maintained by Oracle/MySQL.
- **Scope:** Runtime MySQL-compatible JDBC profile for Java Web/full-driver builds; desktop slim excludes it by default.
- **Verification:** backend `mvn package` plus manual/runtime connection smoke when available.
- **Secret/credential impact:** Passwords and JDBC URLs are credential-bearing and must remain covered by runtime redaction behavior.
- **Rejected alternatives:** MariaDB driver as MySQL default | may be useful later, but current direct MySQL compatibility starts with Connector/J.

### Decision ID: DEP-FOUNDATION-POSTGRESQL-DRIVER

- **Package choice:** `org.postgresql:postgresql` with runtime scope.
- **License and maintenance:** BSD-2-Clause; actively maintained PostgreSQL JDBC driver.
- **Scope:** Runtime PostgreSQL-compatible JDBC profile for Java Web/full-driver builds; desktop slim excludes it by default.
- **Verification:** backend `mvn package` plus manual/runtime connection smoke when available.
- **Secret/credential impact:** Passwords and JDBC URLs are credential-bearing and must remain covered by runtime redaction behavior.
- **Rejected alternatives:** Generic user-supplied JDBC placeholder first | defers too much behavior and weakens runtime evidence.

### Decision ID: DEP-SQLITE-XERIAL-JDBC

- **Package choice:** `org.xerial:sqlite-jdbc:3.53.0.0` with runtime scope.
- **License and maintenance:** Apache-2.0; maintained Xerial driver that follows SQLite release versions and bundles native libraries for major desktop/server OSs in the default jar.
- **Scope:** Optional SQLite file-database runtime profile; desktop slim excludes it by default and exposes managed download status.
- **Verification:** backend `mvn package` plus manual/runtime SQLite and driver-manager smoke when needed.
- **Secret/credential impact:** SQLite file paths can reveal local usernames and project names, so API errors and managed driver metadata must continue through `SecretRedactor`.
- **Rejected alternatives:** Reimplement the SQLite file format directly | high correctness risk and no JDBC metadata compatibility.

### Decision ID: DEP-DUCKDB-JDBC

- **Package choice:** `org.duckdb:duckdb_jdbc:1.5.2.0` with runtime scope.
- **License and maintenance:** MIT; maintained by the DuckDB project with current Java/JDBC artifacts published to Maven Central.
- **Scope:** Optional DuckDB file-database runtime profile; desktop slim excludes it by default and exposes managed download status.
- **Verification:** backend `mvn package` plus manual/runtime DuckDB and driver-manager smoke when needed.
- **Secret/credential impact:** DuckDB file paths can reveal local usernames and project names, so API errors and managed driver metadata must continue through `SecretRedactor`.
- **Rejected alternatives:** Route DuckDB through SQLite/H2 compatibility | SQL dialect and storage semantics do not match.

### Decision ID: DEP-EXTENDED-JDBC-DRIVER-PROFILES

- **Package choice:** `com.microsoft.sqlserver:mssql-jdbc:13.4.0.jre11`, `com.oracle.database.jdbc:ojdbc11:23.26.1.0.0`, `com.dameng:DmJdbcDriver18:8.1.3.140`, `com.taosdata.jdbc:taos-jdbcdriver:3.8.3`, and `com.clickhouse:clickhouse-jdbc:0.9.8`, all with runtime scope.
- **License and maintenance:** Vendor-published JDBC artifacts available from Maven Central; profile usage is isolated by `driverType` and no transitive driver is invoked unless matching profile is selected.
- **Scope:** Optional JDBC runtime set managed through Driver Manager downloads/uploads; packaged builds expose managed download status by default.
- **Verification:** backend `mvn package` plus manual/runtime optional-driver smoke when needed.
- **Secret/credential impact:** These profiles carry credential-bearing JDBC URLs/options and must continue through `SecretRedactor`, `SecretStore`, and connection error redaction gates.
- **Rejected alternatives:** Use dynamic user-supplied JDBC jars first | requires classloader isolation, trust prompts, malware scanning, and a separate security design.

### Decision ID: DEP-CONNECTION-PACKAGE-CRYPTO

- **Package choice:** Bouncy Castle provider APIs already pinned in the backend build.
- **License and maintenance:** MIT-style Bouncy Castle license; current Java provider line with maintained Argon2 and AES/GCM primitives.
- **Scope:** Backend runtime crypto compatibility for `.javanavi-conn` connection restore packages.
- **Verification:** backend `mvn package` plus manual/runtime saved-connection import/export and redaction smoke when needed.
- **Secret/credential impact:** Processes package passwords and encrypted secret bundles in memory; import/export still stores secrets only through JavaNavi `SecretStore`.
- **Rejected alternatives:** Implement Argon2id in project code | high cryptographic risk and larger audit surface.

### Decision ID: DEP-FOUNDATION-REACT-UI

- **Package choice:** Existing React 18, Ant Design, Monaco, Mermaid, Recharts, Zustand, and supporting frontend stack in `frontend/package.json`.
- **License and maintenance:** Inherited frontend dependencies; maintained through npm lockfile and build checks.
- **Scope:** Browser UI runtime and build-time frontend tooling.
- **Verification:** `npm --prefix frontend run build` and Java Web package startup smoke.
- **Secret/credential impact:** Browser code must not log API keys/passwords from adapters/events; backend redaction remains authoritative for server-origin payloads.
- **Rejected alternatives:** Replace the UI library stack during cleanup | would mix product redesign risk into repository hygiene.

### Decision ID: DEP-DESKTOP-TAURI

- **Package choice:** `@tauri-apps/cli` v2 in root `package.json` plus Rust-side Tauri crates under `src-tauri`.
- **License and maintenance:** Tauri v2 stack; actively maintained by the Tauri project.
- **Scope:** Optional native desktop shell and Java sidecar lifecycle.
- **Verification:** `npm run desktop:stage`, `npm run desktop:build`, and Rust/Cargo checks when host platform dependencies are installed.
- **Secret/credential impact:** Desktop opens local logs/data directories and launches the backend with a data directory; no new remote credential boundary.
- **Rejected alternatives:** Native UI rewrite | unnecessary because current shell preserves the web UI and API contract.

## Pending / guarded dependency families

### Decision ID: DEP-REDIS-CLIENT

- **Status:** Fulfilled by direct Java implementation/runtime profile currently present in backend dependencies.
- **Required verification:** manual/runtime Redis smoke and browser adapter checks for UI-facing calls when this area changes.
- **Secret/credential impact:** Redis passwords/URIs must remain redacted.

### Decision ID: DEP-MONGODB-CLIENT

- **Status:** Fulfilled by direct Java implementation/runtime profile currently present in backend dependencies.
- **Required verification:** manual/runtime MongoDB smoke and browser adapter checks for UI-facing calls when this area changes.
- **Secret/credential impact:** MongoDB URIs, SCRAM credentials, and TLS paths must remain redacted.

### Decision ID: DEP-AI-PROVIDER-SDK

- **Status:** No vendor SDK adopted; JavaNavi currently uses OpenAI-compatible HTTP over JDK HTTP APIs. Anthropic, Gemini, and Claude CLI formats remain manual-model configuration until provider-specific transports are approved and implemented.
- **Allowed artifacts only after approval:** Provider SDKs such as OpenAI/Anthropic/Azure SDKs require a new decision entry before use.
- **Required verification:** manual/runtime AI provider smoke and secret redaction checks when this area changes.
- **Secret/credential impact:** API keys, base URLs, headers, prompts, and stream chunks require redaction/logging discipline.


### Decision ID: DEP-EVENT-TRANSPORT

- **Status:** Approved via existing Spring Web and browser SSE/EventSource APIs.
- **Package choice:** No extra dependency.
- **License and maintenance:** Covered by existing Spring Web and browser APIs.
- **Scope:** Server-to-browser progress/token/chunk streams; REST remains command/cancel path.
- **Verification:** Java Web package startup, manual/runtime AI stream smoke, and event chunk checks when this area changes.
- **Secret/credential impact:** Event payloads must never include raw passwords, API keys, bearer tokens, private keys, or credential-bearing URIs.
- **Rejected alternatives:** WebSocket-first transport | current needs are server-to-browser streams, and bidirectional transport has not been proven necessary.
