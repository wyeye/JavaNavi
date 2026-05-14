# JavaNavi

[中文](README_CN.md) | English

JavaNavi is a Java + React local web and desktop database client. It is developed with [GoNavi](https://github.com/Syngnat/GoNavi) as an important product and interaction reference, while using a Java/Spring Boot backend, a React frontend, and an optional Tauri desktop shell for JavaNavi's maintained runtime.

## Acknowledgements

JavaNavi thanks the [GoNavi](https://github.com/Syngnat/GoNavi) project and its contributors. GoNavi's database-management workflows, multi-database scope, SQL editor experience, AI assistant, data sync, Redis/MongoDB workbenches, import/export flows, and driver-management ideas provide the key reference point for this implementation. GoNavi is an Apache-2.0 licensed open-source project; JavaNavi keeps its own Java/Web/Desktop implementation and documents where browser or desktop constraints require different runtime behavior.

## Current status

- React UI lives under `frontend/` and calls JavaNavi-owned `frontend/src/compat/*` adapters instead of direct Wails runtime imports.
- Spring Boot serves `/api/*` and the React static build from one jar.
- The local web package keeps loopback/session/origin checks before credential-bearing requests.
- The frontend language selector supports English and Chinese; English is the default language.
- Runtime compatibility coverage is maintained through focused scripts for browser adapter, security redaction, i18n, packaging, and desktop sidecar behavior.

## Feature scope

JavaNavi follows GoNavi's product direction where it is useful for a Java/Web/Desktop runtime:

- relational database browsing, querying, editing, metadata, and SQL file workflows;
- Redis, MongoDB, data sync, file import/export, and driver-management workbenches;
- AI-assisted SQL/chat workflows through configurable providers;
- local web packaging and an optional Tauri desktop shell with managed Java sidecar lifecycle.

Browser-safe replacements are used where arbitrary native dialogs or OS-level actions are not appropriate for a local web package. Desktop-specific capabilities are documented separately.

## Project layout

```text
backend/   Spring Boot API, local-session/security controls, JDBC/services, and static asset host
frontend/  React UI behind JavaNavi compatibility adapters
src-tauri/ Optional Tauri v2 desktop shell and Java sidecar launcher
docs/      Key runtime contracts and desktop documentation
scripts/   Packaging, startup, and active verification scripts
```

## Prerequisites

- Java 17+
- Maven 3.6.3+
- Node.js 20.19+
- npm 10+

This machine currently uses:

```bash
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

## Development

Backend API during development:

```bash
cd backend
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 mvn -Dmaven.repo.local=../.m2/repository spring-boot:run
```

Frontend dev server:

```bash
cd frontend
npm ci
npm run dev
```

The frontend dev proxy sends `/api/*` requests to `http://127.0.0.1:8080` or `http://localhost:8080` depending on Vite configuration. CORS is restricted to local Vite origins.

## Language selection

JavaNavi defaults to English and supports Chinese through the Settings language selector. The frontend persists the selected language, updates the document language, and sends language headers to the backend. Backend prompts, API failure messages, and exception responses should use the Java i18n message registry instead of hard-coded user-visible text.

## Java Web package

Build one jar with React static assets:

```bash
./scripts/package-web.sh
```

Start the one-process Java Web package:

```bash
./scripts/start-web-package.sh
```

The package binds to `127.0.0.1:8080` by default and serves:

- UI: `http://127.0.0.1:8080/`
- API health: `http://127.0.0.1:8080/api/v1/health`
- local session metadata: `http://127.0.0.1:8080/api/v1/session`

## Desktop package (Tauri + Java sidecar)

JavaNavi also has a Tauri v2 desktop shell using the Spring Boot web jar as a managed Java sidecar. The desktop path preserves the React UI and `/api/v1/*` contract: Tauri starts the jar on a dynamic `127.0.0.1` port, waits for `/api/v1/health`, then opens the native window to the backend-served UI.

Additional desktop prerequisites:

- Rust/Cargo and Tauri platform dependencies for native build/dev.
- End users do not need to install Java separately: `desktop:stage` bundles a minimized Java 17 runtime under `src-tauri/resources/java-runtime`. Developers may still override it with `JAVANAVI_DESKTOP_JAVA` or `JAVA_HOME`.

Commands:

```bash
npm ci
npm run desktop:stage
npm run desktop:dev
npm run desktop:build
```

`desktop:stage` reuses `scripts/package-web.sh`, copies the generated jar to `src-tauri/resources/javanavi-backend.jar`, and creates a minimized Java runtime at `src-tauri/resources/java-runtime` for bundling. Generated jars, runtimes, and native build outputs are not committed.

Desktop staging/build now uses the same backend jar semantics as Java Web. External JDBC drivers including MySQL, PostgreSQL, SQLite, DuckDB, Oracle, SQL Server, Dameng, TDengine, and ClickHouse are not bundled by default; Driver Manager shows them as **待下载** until they are downloaded on demand or uploaded manually as JDBC Jar(s).

Desktop packages now include a Tauri automatic updater that checks the GitHub Release endpoint `https://github.com/wyeye/JavaNavi/releases/latest/download/latest.json` from the About dialog. Signing/notarization and native UI rewrite remain out of scope. See [Desktop documentation](docs/desktop-tauri.md) for lifecycle, updater, logs, verification, and troubleshooting details.

## GitHub Actions release builds

The workflow at `.github/workflows/desktop-release.yml` builds Tauri desktop packages on GitHub-hosted AMD64 and arm64 runners for Linux, Windows, and macOS. Branch pushes upload workflow artifacts; `v*` tags use `tauri-apps/tauri-action` to publish signed packages, signatures, and `latest.json` to the matching GitHub Release. The updater uses `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets.

## Key documentation

The README files are the documentation index. Only essential bilingual runtime documents remain under `docs/`:

- Desktop shell: [English](docs/desktop-tauri.md) / [中文](docs/zh/desktop-tauri.md)
- Dependency decisions: [English](docs/contracts/dependency-decisions.md) / [中文](docs/contracts/zh/dependency-decisions.md)
- Web compatibility contract: [English](docs/contracts/web-compatibility-contract.md) / [中文](docs/contracts/zh/web-compatibility-contract.md)
- Security and trust boundary: [English](docs/contracts/security-trust-boundary.md) / [中文](docs/contracts/zh/security-trust-boundary.md)
- Browser-safe file workflow: [English](docs/contracts/file-workflow-contract.md) / [中文](docs/contracts/zh/file-workflow-contract.md)

Temporary audit notes, planning records, duplicate indexes, and non-essential examples should stay outside the maintained docs tree, for example under `.omx/`.

## Verification

The repository no longer keeps standalone validation/research scripts under `scripts/`. Use direct build and packaging commands as the maintained local evidence path:

```bash
git diff --check
npm --prefix frontend run build
cd backend && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 mvn package
./scripts/package-web.sh
npm run desktop:stage
npm run desktop:build
```

This repository intentionally does not keep checked-in test classes/spec files. Verification is build/package/startup/runtime-smoke oriented.

## Runtime boundaries

- The local-session token is a loopback/local package guard, not a remote multi-user authentication model.
- The read-only SQL guard is a local UX/runtime safety check, not a complete SQL firewall.
- Browser-safe file workflows are constrained to managed workspaces or upload/download flows; arbitrary native file dialogs belong to the desktop shell.
- Desktop packages and Java Web now share the same on-demand JDBC model; use managed downloads or manual Jar upload when an external JDBC driver is needed.
