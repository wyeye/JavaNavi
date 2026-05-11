# JavaNavi Browser-safe File Workflow Contract


[中文](zh/file-workflow-contract.md) | English
This contract adapts file-oriented workflows inspired by [GoNavi](https://github.com/Syngnat/GoNavi) to JavaNavi's browser-safe Web package and optional desktop shell.

## Reference desktop behavior

GoNavi and similar native desktop workflows can use OS file/directory dialogs for SQL files, imports, exports, SSH keys, database files, driver packages, data root selection, and update/driver directories. JavaNavi Web v1 cannot expose arbitrary native dialogs, so only useful workflows are adopted through browser-safe replacements.

## Web behavior

| Reference/native action | JavaNavi Web replacement |
|---|---|
| Read SQL file | `POST /api/v1/app/sql-file/read` reads files constrained to the JavaNavi managed SQL workspace |
| Write SQL file | `POST /api/v1/app/sql-file/write` writes JavaNavi `WriteSQLFile(filePath, sql)` quick-save content inside the managed SQL workspace |
| Select/List SQL directory | `POST /api/v1/app/sql-directory/select` creates/returns a managed workspace directory; `POST /api/v1/app/sql-directory/list` lists SQL children |
| Save export file | Browser download response |
| Import CSV/JSON | Browser upload, preview, then run import |
| SSH key path | Manual backend-accessible path input |
| SQLite/DuckDB database file | Manual backend-accessible absolute path input |
| Driver package source | Repository/runtime-directory configuration and browser upload endpoints |
| Open directory in OS | Show path text; native OS opening is not exposed in Web |

## Progress and cancellation

Long-running file workflows must emit progress through the runtime adapter:

- `sqlfile:progress`
- `import:progress`
- `driver:download-progress`

Each job must have a job ID and a cancellation endpoint where JavaNavi currently supports cancellation.

## JavaNavi Web file endpoints

The browser-safe file surface keeps only endpoints that support current product flows:

- `POST /api/v1/files/export/data`, `/export/query`, `/export/table`, `/export/tables-sql`, `/export/tables-data-sql`, `/export/database-sql` write artifacts under `${JAVANAVI_DATA_DIR}/exports` and return path/download metadata.
- `POST /api/v1/files/import/upload`, `/import/preview`, and `/import/run` use uploaded files under `${JAVANAVI_DATA_DIR}/imports`.
- `POST /api/v1/app/sql-file/read`, `/sql-file/write`, `/sql-file/upload`, `/sql-directory/select`, and `/sql-directory/list` provide the SQL workspace read/write flow.
