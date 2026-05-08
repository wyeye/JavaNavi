# JavaNavi

中文 | [English](README.md)

JavaNavi 是一个 Java + React 的本地 Web / 桌面数据库客户端。项目以 [GoNavi](https://github.com/Syngnat/GoNavi) 作为重要的产品与交互参考，同时采用 Java/Spring Boot 后端、React 前端，以及可选的 Tauri 桌面壳来维护 JavaNavi 自身的运行时。

## 致谢

JavaNavi 感谢 [GoNavi](https://github.com/Syngnat/GoNavi) 项目及其贡献者。GoNavi 的数据库管理工作流、多数据库范围、SQL 编辑体验、AI 助手、数据同步、Redis/MongoDB 工作台、导入导出流程和驱动管理思路，是本实现的重要参考。GoNavi 是 Apache-2.0 许可的开源项目；JavaNavi 保持自己的 Java/Web/Desktop 实现，并在浏览器或桌面约束要求不同行为时明确记录差异。

## 当前状态

- React UI 位于 `frontend/`，通过 JavaNavi 自有的 `frontend/src/compat/*` 适配器调用后端，不直接依赖 Wails 运行时。
- Spring Boot 从同一个 jar 提供 `/api/*` 与 React 静态构建产物。
- 本地 Web 包在处理凭据请求前保留 loopback/session/origin 安全检查。
- 前端语言选择支持英文和中文，默认语言为英文。
- 当前通过浏览器适配器、安全脱敏、i18n、打包与桌面 sidecar 等 focused 脚本维护运行时兼容证据。

## 功能范围

JavaNavi 在适合 Java/Web/Desktop 运行时的前提下参考 GoNavi 的产品方向：

- 关系型数据库浏览、查询、编辑、元数据与 SQL 文件工作流；
- Redis、MongoDB、数据同步、文件导入导出与驱动管理工作台；
- 通过可配置 provider 提供 AI 辅助 SQL/聊天工作流；
- 本地 Web 打包，以及可选的 Tauri 桌面壳和受管 Java sidecar 生命周期。

当任意原生对话框或 OS 级动作不适合本地 Web 包时，JavaNavi 使用浏览器安全替代方案；桌面专属能力在独立文档中说明。

## 项目结构

```text
backend/   Spring Boot API、本地 session/安全控制、JDBC/服务与静态资源托管
frontend/  React UI 与 JavaNavi 兼容适配器
src-tauri/ 可选 Tauri v2 桌面壳与 Java sidecar 启动器
docs/      关键运行时契约与桌面文档
scripts/   打包、启动与当前有效验证脚本
```

## 前置要求

- Java 17+
- Maven 3.6.3+
- Node.js 20.19+
- npm 10+

本机当前使用：

```bash
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

## 开发

开发期启动后端 API：

```bash
cd backend
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 mvn -Dmaven.repo.local=../.m2/repository spring-boot:run
```

启动前端开发服务器：

```bash
cd frontend
npm ci
npm run dev
```

前端 dev proxy 会根据 Vite 配置把 `/api/*` 请求转发到 `http://127.0.0.1:8080` 或 `http://localhost:8080`。CORS 仅允许本地 Vite origin。

## 语言选择

JavaNavi 默认英文，并可在设置中切换中文。前端会持久化所选语言、更新文档语言，并把语言请求头发送到后端。后端提示、API 失败消息与异常响应应使用 Java i18n 消息注册表，避免硬编码用户可见文本。

## Java Web 包

构建包含 React 静态资源的单 jar：

```bash
./scripts/package-web.sh
```

启动单进程 Java Web 包：

```bash
./scripts/start-web-package.sh
```

默认绑定 `127.0.0.1:8080`，并提供：

- UI: `http://127.0.0.1:8080/`
- API 健康检查: `http://127.0.0.1:8080/api/v1/health`
- 本地 session 元数据: `http://127.0.0.1:8080/api/v1/session`

## 桌面包（Tauri + Java sidecar）

JavaNavi 还提供 Tauri v2 桌面壳，使用 Spring Boot Web jar 作为受管 Java sidecar。桌面路径保留 React UI 与 `/api/v1/*` 契约：Tauri 会在动态 `127.0.0.1` 端口启动 jar，等待 `/api/v1/health` 成功后，再把原生窗口打开到后端提供的 UI。

桌面额外要求：

- Rust/Cargo 与 Tauri 平台依赖，用于原生构建/开发。
- 终端用户不需要单独安装 Java：`desktop:stage` 会把裁剪后的 Java 17 runtime 放到 `src-tauri/resources/java-runtime`。开发者仍可用 `JAVANAVI_DESKTOP_JAVA` 或 `JAVA_HOME` 覆盖。

命令：

```bash
npm ci
npm run desktop:stage
npm run desktop:dev
npm run desktop:build
```

`desktop:stage` 复用 `scripts/package-web.sh`，把生成的 jar 复制到 `src-tauri/resources/javanavi-backend.jar`，并创建用于打包的最小 Java runtime。生成的 jar、runtime 和原生构建产物不会提交。

桌面 staging/build 现在与 Java Web 使用同一套后端 jar 语义。MySQL、PostgreSQL、SQLite、DuckDB、Oracle、SQL Server、Dameng、TDengine、ClickHouse 等外部 JDBC driver 默认不内置；Driver Manager 会先显示为 **待下载**，待按需下载或手动上传 JDBC Jar 后再启用。

当前桌面壳非目标：不处理签名/公证、自动更新、原生 UI 重写或后端 API 重设计。关键生命周期、日志、验证与排障见[桌面文档](docs/desktop-tauri.md)。

## GitHub Actions 发布构建

`.github/workflows/desktop-release.yml` 会在 GitHub-hosted AMD64 与 arm64 runner 上为 Linux、Windows、macOS 构建未签名的 Tauri 桌面包。PR 和分支 push 会上传 workflow artifact；`v*` tag 还会把这些 artifact 发布到同名 GitHub Release。该 workflow 复用现有 `npm run desktop:build` 路径，确保 CI 与本地打包使用同一套 Java/Web/Desktop staging 契约。

## 关键文档

README 本身就是文档索引。`docs/` 下只保留必要的中英双语运行时文档：

- 桌面壳：[中文](docs/zh/desktop-tauri.md) / [English](docs/desktop-tauri.md)
- 依赖决策：[中文](docs/contracts/zh/dependency-decisions.md) / [English](docs/contracts/dependency-decisions.md)
- Web 兼容契约：[中文](docs/contracts/zh/web-compatibility-contract.md) / [English](docs/contracts/web-compatibility-contract.md)
- 安全与信任边界：[中文](docs/contracts/zh/security-trust-boundary.md) / [English](docs/contracts/security-trust-boundary.md)
- 浏览器安全文件工作流：[中文](docs/contracts/zh/file-workflow-contract.md) / [English](docs/contracts/file-workflow-contract.md)

临时审计、计划记录、重复索引和非关键示例不进入当前维护文档树，可放在 `.omx/` 等外部记录中。

## 验证

仓库不再在 `scripts/` 下保留独立校验/调研脚本。当前维护的本地证据路径直接使用构建与打包命令：

```bash
git diff --check
npm --prefix frontend run build
cd backend && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 mvn package
./scripts/package-web.sh
npm run desktop:stage
npm run desktop:build
```

本仓库有意不保留已提交的测试类/spec 文件。验证以 build/package/startup/runtime-smoke 为主。

## 运行边界

- 本地 session token 是 loopback/local package guard，不是远程多用户认证模型。
- 只读 SQL guard 是本地 UX/runtime 安全检查，不是完整 SQL 防火墙。
- 浏览器安全文件工作流限制在受管 workspace 或上传/下载流程；任意原生文件对话框属于桌面壳能力。
- 桌面包与 Java Web 现在共用同一套按需 JDBC 模型；需要外部 JDBC 驱动时使用受管下载或手动上传。
