# JavaNavi 浏览器安全文件工作流契约

中文 | [English](../file-workflow-contract.md)

本文档把参考 [GoNavi](https://github.com/Syngnat/GoNavi) 的文件类工作流适配到 JavaNavi 的浏览器安全 Web 包和可选桌面壳中。JavaNavi 感谢 GoNavi 对 SQL 文件、导入导出、驱动与数据文件体验提供的开源参考。

## 参考的桌面原生行为

GoNavi 和类似原生桌面工作流通常可以直接打开文件或目录对话框。JavaNavi Web v1 不能暴露任意原生文件系统选择能力，因此只采纳有用的文件类工作流，并通过浏览器安全替代方案承载 SQL 文件、导入、导出、SSH key、数据库文件、driver package、data root、更新/driver 目录等动作。

## Web 替代方案

| 参考/原生动作 | JavaNavi Web 替代方案 |
|---|---|
| 打开 SQL 文件 | 浏览器上传或受管 workspace 读取；Web v1 不提供直接 OS picker |
| 读取 SQL 文件 | `POST /api/v1/app/sql-file/read` 读取受限于 JavaNavi managed SQL workspace 的文件 |
| 写入 SQL 文件 | `POST /api/v1/app/sql-file/write` 把 `WriteSQLFile(filePath, sql)` 快速保存内容写入 managed SQL workspace |
| 选择/列出 SQL 目录 | `POST /api/v1/app/sql-directory/select` 创建/返回 managed workspace 目录；`POST /api/v1/app/sql-directory/list` 列出 SQL children |
| 保存导出文件 | 浏览器 download response |
| 导入 CSV/XLSX/JSON | 浏览器上传 + preview endpoint |
| 选择 SSH key | 浏览器上传到加密/keyring-backed secret store，或在 Web 中显示受限占位 |
| 选择 SQLite/DuckDB 数据库文件 | 浏览器上传或 managed workspace file registration |
| Driver package 文件/目录 | 浏览器上传或配置 JavaNavi driver repository/workspace |
| 在 OS 中打开目录 | Web v1 中 stub-disabled，或显示 workspace 位置文本 |

## 进度与取消

长时间文件工作流必须通过 runtime adapter 发送进度：

- `sqlfile:progress`
- `import:progress`
- `driver:download-progress`

每个 job 必须有 job ID，并在 JavaNavi 当前支持取消时提供 cancellation endpoint。

## JavaNavi Web 兼容 endpoint

文件兼容层暴露以下 managed-workspace 替代接口：

- `POST /api/v1/files/export/data`、`/export/query`、`/export/table`、`/export/tables-sql`、`/export/tables-data-sql`、`/export/database-sql` 会把 artifact 写入 `${JAVANAVI_DATA_DIR}/exports` 并返回 path/download metadata。
- `POST /api/v1/files/import/select`、`/import/preview`、`/import/run`、`/config/import` 使用 `${JAVANAVI_DATA_DIR}/imports` 下的 managed placeholder；import run 当前解析并发送 progress evidence，不直接修改目标数据库。
- `POST /api/v1/files/sql/open` 打开 managed SQL workspace 文件，而不是 OS picker。
- `POST /api/v1/files/ssh-key/select` 只返回 upload placeholder。SSH runtime 行为不属于当前 Web 替代范围；该兼容 endpoint 不读取或存储 private key material。
