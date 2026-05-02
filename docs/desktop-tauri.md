# JavaNavi Desktop (Tauri + Java Sidecar)


[中文](zh/desktop-tauri.md) | English
JavaNavi Desktop is an additive desktop shell around the existing Java Web package. The user-facing database-management workflows are informed by [GoNavi](https://github.com/Syngnat/GoNavi), while this desktop runtime uses Tauri to host JavaNavi's Java/Web implementation. Tauri owns the native window, menu, and process lifecycle. The existing Spring Boot jar still serves JavaNavi's React UI and `/api/v1/*` compatibility contract.

## Architecture

```text
Tauri v2 desktop app
  ├─ resolves bundled Java 17 runtime first, then developer/system overrides
  ├─ selects a dynamic 127.0.0.1 port
  ├─ launches <bundled java-runtime>/bin/java -jar <bundled resource jar>
  │    SERVER_ADDRESS=127.0.0.1
  │    SERVER_PORT=<dynamic_port>
  │    JAVANAVI_DATA_DIR=<desktop app data dir>
  │    JAVANAVI_ALLOW_PRIVATE_AI_ENDPOINTS=true
  ├─ polls /api/v1/health
  └─ opens the main window at http://127.0.0.1:<dynamic_port>/
```

The jar is staged as a Tauri bundle resource at `src-tauri/resources/javanavi-backend.jar`. A minimized Java runtime is staged at `src-tauri/resources/java-runtime` and bundled with the app. The jar is not a Tauri external sidecar executable; Rust launches it through the bundled Java runtime, with system Java retained only as a developer fallback.

## Prerequisites

End users do not need a separate Java installation because desktop packages include a minimized Java 17 runtime. Build machines still need:

- A JDK 17+ with `jlink` to generate the host-platform runtime, or `JAVANAVI_DESKTOP_RUNTIME_DIR=/path/to/prebuilt-runtime` / `JAVANAVI_DESKTOP_RUNTIME_ARCHIVE=/path/to/runtime.zip` when bundling a runtime for another OS.
- Node.js/npm for Tauri CLI scripts.
- Rust/Cargo plus platform-specific Tauri system packages for full native builds.
- Existing Java Web prerequisites: Maven and frontend npm dependencies.

Runtime override/fallback remains available for development through `JAVANAVI_DESKTOP_JAVA`, `JAVA_HOME`, `java` on `PATH`, or common Linux JDK paths.

## Performance and footprint defaults

Desktop launch applies conservative Java sidecar defaults to reduce cold-start work and avoid unbounded heap growth:

- `-Xms32m`
- `-Xmx768m`
- `-XX:TieredStopAtLevel=1`
- `-Djava.awt.headless=true`
- `-Dspring.jmx.enabled=false`
- `-Dspring.main.banner-mode=off`

You can append or override JVM options for local testing:

```bash
JAVANAVI_DESKTOP_JAVA_OPTS="-Xmx2g -XX:+UseStringDeduplication" npm run desktop:dev
```

To disable JavaNavi's default desktop JVM options entirely:

```bash
JAVANAVI_DESKTOP_DISABLE_DEFAULT_JAVA_OPTS=1 npm run desktop:dev
```

## Commands

Stage the backend jar as a desktop resource:

```bash
npm run desktop:stage
```

By default this uses `DESKTOP_PACKAGE_PROFILE=desktop-slim` to minimize native package size and `jlink` to generate a compact Java runtime. The slim jar keeps the H2 demo/runtime datasource and `.javanavi-conn` crypto support, while excluding external JDBC driver jars: MySQL, PostgreSQL, SQLite, DuckDB, Oracle, SQL Server, Dameng, TDengine, and ClickHouse. Driver manager status is computed from classes and the managed driver cache, so omitted JDBC runtimes appear as **待下载** and can be downloaded on demand from a configurable Maven repository, uploaded manually as JDBC Jar(s) with an explicit version label, or auto-downloaded on first connection. The regular Java Web build remains full-driver by default.

Use the full driver matrix for desktop only when the package-size tradeoff is acceptable or when offline-first MySQL/PostgreSQL/SQLite/file-database desktop connectivity is required:

```bash
DESKTOP_PACKAGE_PROFILE=full-jdbc-drivers npm run desktop:stage
DESKTOP_PACKAGE_PROFILE=full-jdbc-drivers npm run desktop:build
```

Run the desktop app in development:

```bash
npm run desktop:dev
```

Build native desktop bundles:

```bash
npm run desktop:build
```

For local package confidence, stage the desktop resources and run the native build path:

```bash
npm run desktop:stage
npm run desktop:build
```

## Runtime behavior

- The desktop backend binds to `127.0.0.1` only.
- The port is selected dynamically and is not assumed to be `8080`.
- The main window is created only after `/api/v1/health` succeeds.
- If startup fails, an error window displays the failure and log path.
- Closing or quitting the desktop app terminates only the Java child process owned by that desktop session.
- Desktop packages set `JAVANAVI_ALLOW_PRIVATE_AI_ENDPOINTS=true` for the Java sidecar so trusted local/LAN OpenAI-compatible providers can be used from the packaged app. Standalone Java Web runs still require explicitly setting this environment variable.

## Logs and data directory

The Rust side sets `JAVANAVI_DATA_DIR` to Tauri's app data directory for JavaNavi. The sidecar log is written under:

```text
<app-data-dir>/logs/java-sidecar.log
```

The native menu exposes:

- **About JavaNavi**
- **Reload**
- **Open Logs**
- **Open Data Directory**
- **Quit JavaNavi**

## First-phase non-goals

The first desktop phase intentionally does not configure:

- Windows code signing;
- macOS notarization;
- automatic updater;
- native UI rewrite;
- Spring Boot API redesign.

## Troubleshooting

### Bundled Java runtime missing or damaged

Re-stage the desktop resources:

```bash
npm run desktop:stage
```

For development fallback, set one of:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
# or
export JAVANAVI_DESKTOP_JAVA=/usr/lib/jvm/java-17-openjdk-amd64/bin/java
```

For cross-platform packaging, provide an OS-matching runtime:

```bash
JAVANAVI_DESKTOP_RUNTIME_PLATFORM=windows \
JAVANAVI_DESKTOP_RUNTIME_ARCHIVE=/path/to/windows-jre.zip \
npm run desktop:stage
```

### Backend jar missing

Run:

```bash
npm run desktop:stage
```

This reuses `scripts/package-web.sh`, embeds `frontend/dist` into the Spring Boot jar, copies the jar to the Tauri resource path, and stages the bundled Java runtime.

The default desktop staging profile is `desktop-slim`. If optional full-driver support is required for local testing, rerun with:

```bash
DESKTOP_PACKAGE_PROFILE=full-jdbc-drivers npm run desktop:stage
```

### JDBC driver is shown as 待下载

This is expected for `desktop-slim`. The first connection attempt can auto-download the pinned JDBC Jar(s) into the managed driver cache, or you can preinstall them from **Driver Manager**. The default download source is Maven Central (`https://repo.maven.apache.org/maven2`) with SHA-256 verification before the driver is loaded. Driver Manager also lets you configure another Maven repository root such as an internal Nexus/Artifactory or a public mirror. For offline environments, use Driver Manager's manual Jar upload flow:

- single-Jar drivers: upload/select the JDBC Jar directly and confirm the version label;
- multi-Jar drivers such as ClickHouse: multi-select the required Jars for upload and confirm the shared version label.

The managed driver cache lives under the JavaNavi data directory's `drivers/` subdirectory and is reused across app restarts.

### Cargo/Tauri build dependencies missing

`npm run desktop:stage` still stages the Java Web jar and bundled runtime. Install Rust/Cargo and the host Tauri system packages before running `npm run desktop:build` or direct `cargo` checks.
