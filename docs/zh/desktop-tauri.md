# JavaNavi 桌面版（Tauri + Java Sidecar）

中文 | [English](../desktop-tauri.md)

JavaNavi Desktop 是现有 Java Web 包之上的增量桌面壳。面向用户的数据库管理工作流参考并感谢 [GoNavi](https://github.com/Syngnat/GoNavi)，而当前桌面运行时使用 Tauri 承载 JavaNavi 自身的 Java/Web 实现。Tauri 负责原生窗口、菜单与进程生命周期；Spring Boot jar 继续提供 JavaNavi 的 React UI 与 `/api/v1/*` 兼容契约。

## 架构

```text
Tauri v2 desktop app
  ├─ 优先解析内置 Java 17 runtime，再回退到开发者/系统配置
  ├─ 选择动态 127.0.0.1 端口
  ├─ 启动 <bundled java-runtime>/bin/java -jar <bundled resource jar>
  │    SERVER_ADDRESS=127.0.0.1
  │    SERVER_PORT=<dynamic_port>
  │    JAVANAVI_DATA_DIR=<desktop app data dir>
  ├─ 轮询 /api/v1/health
  └─ 打开主窗口到 http://127.0.0.1:<dynamic_port>/
```

jar 会作为 Tauri bundle resource 放在 `src-tauri/resources/javanavi-backend.jar`。裁剪后的 Java runtime 放在 `src-tauri/resources/java-runtime` 并随应用打包。该 jar 不是 Tauri external sidecar 可执行文件；Rust 通过内置 Java runtime 启动它，系统 Java 只作为开发回退。

## 前置要求

终端用户不需要单独安装 Java，因为桌面包包含裁剪后的 Java 17 runtime。构建机器仍需要：

- 带 `jlink` 的 JDK 17+，用于生成宿主平台 runtime；跨 OS 打包时可使用 `JAVANAVI_DESKTOP_RUNTIME_DIR=/path/to/prebuilt-runtime` 或 `JAVANAVI_DESKTOP_RUNTIME_ARCHIVE=/path/to/runtime.zip`。
- Node.js/npm，用于 Tauri CLI 脚本。
- Rust/Cargo 以及平台相关 Tauri 系统依赖，用于完整原生构建。
- 现有 Java Web 前置要求：Maven 与前端 npm 依赖。

开发期仍可通过 `JAVANAVI_DESKTOP_JAVA`、`JAVA_HOME`、`PATH` 中的 `java` 或常见 Linux JDK 路径覆盖/回退 runtime。

## 性能与体积默认值

桌面启动会应用保守 Java sidecar 参数，减少冷启动工作并避免无界堆增长：

- `-Xms32m`
- `-Xmx768m`
- `-XX:TieredStopAtLevel=1`
- `-Djava.awt.headless=true`
- `-Dspring.jmx.enabled=false`
- `-Dspring.main.banner-mode=off`

本地测试可追加或覆盖 JVM options：

```bash
JAVANAVI_DESKTOP_JAVA_OPTS="-Xmx2g -XX:+UseStringDeduplication" npm run desktop:dev
```

完全禁用 JavaNavi 默认桌面 JVM options：

```bash
JAVANAVI_DESKTOP_DISABLE_DEFAULT_JAVA_OPTS=1 npm run desktop:dev
```

## 命令

把后端 jar stage 为桌面资源：

```bash
npm run desktop:stage
```

默认使用 `DESKTOP_PACKAGE_PROFILE=desktop-slim` 来缩小原生包体积，并通过 `jlink` 生成紧凑 Java runtime。slim jar 保留 H2 demo/runtime 数据源和 `.javanavi-conn` 加密能力，同时排除外部 JDBC driver jar：MySQL、PostgreSQL、SQLite、DuckDB、Oracle、SQL Server、Dameng、TDengine 和 ClickHouse。Driver Manager 状态由 class 与受管 driver cache 计算，因此省略的 JDBC runtime 会显示为 **待下载**，可按需从可配置 Maven 仓库下载、手动上传 JDBC Jar 并确认版本，或在首次连接时自动下载。常规 Java Web build 默认仍是 full-driver。

仅在接受包体积取舍或需要离线优先 MySQL/PostgreSQL/SQLite/文件数据库桌面连接时使用完整 driver 矩阵：

```bash
DESKTOP_PACKAGE_PROFILE=full-jdbc-drivers npm run desktop:stage
DESKTOP_PACKAGE_PROFILE=full-jdbc-drivers npm run desktop:build
```

开发期运行桌面应用：

```bash
npm run desktop:dev
```

构建原生桌面包：

```bash
npm run desktop:build
```

为了获得本地打包信心，先 stage 桌面资源，再运行原生构建路径：

```bash
npm run desktop:stage
npm run desktop:build
```

## 运行行为

- 桌面后端只绑定 `127.0.0.1`。
- 端口动态选择，不假设是 `8080`。
- 主窗口仅在 `/api/v1/health` 成功后创建。
- 启动失败时，错误窗口会显示失败信息和日志路径。
- 关闭或退出桌面应用只会终止该桌面会话拥有的 Java 子进程。

## 日志与数据目录

Rust 侧会把 `JAVANAVI_DATA_DIR` 设置为 Tauri app data directory。sidecar 日志写入：

```text
<app-data-dir>/logs/java-sidecar.log
```

原生菜单提供：

- **About JavaNavi**
- **Reload**
- **Open Logs**
- **Open Data Directory**
- **Quit JavaNavi**

## 当前非目标

当前桌面阶段有意不配置：

- Windows 代码签名；
- macOS 公证；
- 自动更新；
- 原生 UI 重写；
- Spring Boot API 重设计。

## 排障

### 内置 Java runtime 缺失或损坏

重新 stage 桌面资源：

```bash
npm run desktop:stage
```

开发回退可设置：

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
# 或
export JAVANAVI_DESKTOP_JAVA=/usr/lib/jvm/java-17-openjdk-amd64/bin/java
```

跨平台打包时提供目标 OS 匹配的 runtime：

```bash
JAVANAVI_DESKTOP_RUNTIME_PLATFORM=windows \
JAVANAVI_DESKTOP_RUNTIME_ARCHIVE=/path/to/windows-jre.zip \
npm run desktop:stage
```

### 后端 jar 缺失

运行：

```bash
npm run desktop:stage
```

该命令复用 `scripts/package-web.sh`，把 `frontend/dist` 嵌入 Spring Boot jar，将 jar 复制到 Tauri resource 路径，并 stage 内置 Java runtime。

默认桌面 staging profile 是 `desktop-slim`。如果本地测试需要可选 full-driver 支持，可重新运行：

```bash
DESKTOP_PACKAGE_PROFILE=full-jdbc-drivers npm run desktop:stage
```

### JDBC driver 显示为待下载

这对 `desktop-slim` 是预期行为。首次连接可把 pinned JDBC Jar 下载到受管 driver cache，或从 **Driver Manager** 预安装。默认下载源是 Maven Central (`https://repo.maven.apache.org/maven2`)，加载前会校验 SHA-256。Driver Manager 也可配置内部 Nexus/Artifactory 或公共镜像等其他 Maven repository root。离线环境可使用 Driver Manager 的手动 Jar 上传流程：

- 单 Jar driver：直接上传/选择 JDBC Jar 并确认版本标签；
- ClickHouse 等多 Jar driver：多选所需 Jar 并确认共享版本标签。

受管 driver cache 位于 JavaNavi 数据目录的 `drivers/` 子目录，并会跨应用重启复用。

### Cargo/Tauri 构建依赖缺失

`npm run desktop:stage` 仍会 stage Java Web jar 与内置 runtime。安装 Rust/Cargo 和宿主 Tauri 系统包后，再运行 `npm run desktop:build` 或直接执行 `cargo` 检查。
