# JavaNavi 浏览器安全文件工作流契约

中文 | [English](../file-workflow-contract.md)

本文档把参考 [GoNavi](https://github.com/Syngnat/GoNavi) 的文件类工作流适配到 JavaNavi 的浏览器安全 Web 包和可选桌面壳中。JavaNavi 感谢 GoNavi 对 SQL 文件、导入导出、驱动与数据文件体验提供的开源参考。

## 参考的桌面原生行为

GoNavi 和类似原生桌面工作流通常可以直接打开文件或目录对话框。JavaNavi Web v1 不能暴露任意原生文件系统选择能力，因此只采纳有用的文件类工作流，并通过浏览器安全替代方案承载 SQL 文件、导入、导出、SSH key、数据库文件、driver package、data root、更新/driver 目录等动作。

## Web 行为

| 参考/原生动作 | JavaNavi Web 替代方案 |
|---|---|
| 读取 SQL 文件 | `POST /api/v1/app/sql-file/read` 读取受限于 JavaNavi managed SQL workspace 的文件 |
| 写入 SQL 文件 | `POST /api/v1/app/sql-file/write` 把 `WriteSQLFile(filePath, sql)` 快速保存内容写入 managed SQL workspace |
| 选择/列出 SQL 目录 | `POST /api/v1/app/sql-directory/select` 创建/返回 managed workspace 目录；`POST /api/v1/app/sql-directory/list` 列出 SQL children |
| 保存导出文件 | 浏览器 download response |
| 导入 CSV/JSON | 浏览器上传、预览，然后执行导入 |
| SSH key 路径 | 手动填写后端可访问路径 |
| 选择 SQLite/DuckDB 数据库文件 | 手动填写后端可访问的绝对路径 |
| Driver package 来源 | 配置 repository/runtime-directory，并使用浏览器上传接口 |
| 在 OS 中打开目录 | 显示路径文本；Web 不暴露原生 OS 打开动作 |

## 进度与取消

长时间文件工作流必须通过 runtime adapter 发送进度：

- `sqlfile:progress`
- `import:progress`
- `driver:download-progress`

每个 job 必须有 job ID，并在 JavaNavi 当前支持取消时提供 cancellation endpoint。

## JavaNavi Web 文件 endpoint

浏览器安全文件能力只保留当前产品流程使用的接口：

- `POST /api/v1/files/export/data`、`/export/query`、`/export/table`、`/export/tables-sql`、`/export/tables-data-sql`、`/export/database-sql` 会把 artifact 写入 `${JAVANAVI_DATA_DIR}/exports` 并返回 path/download metadata。
- `POST /api/v1/files/import/upload`、`/import/preview`、`/import/run` 使用 `${JAVANAVI_DATA_DIR}/imports` 下的已上传文件。
- `POST /api/v1/app/sql-file/read`、`/sql-file/write`、`/sql-file/upload`、`/sql-directory/select`、`/sql-directory/list` 提供 SQL workspace 读写流程。
