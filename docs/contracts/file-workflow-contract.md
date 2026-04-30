# JavaNavi Browser-safe File Workflow Contract


[中文](zh/file-workflow-contract.md) | English
This contract adapts file-oriented workflows inspired by [GoNavi](https://github.com/Syngnat/GoNavi) to JavaNavi's browser-safe Web package and optional desktop shell.

## Reference desktop behavior

GoNavi and similar native desktop workflows can use OS file/directory dialogs for SQL files, imports, exports, SSH keys, database files, driver packages, data root selection, and update/driver directories. JavaNavi Web v1 cannot expose arbitrary native dialogs, so only useful workflows are adopted through browser-safe replacements.

## Web replacements

| Reference/native action | JavaNavi Web replacement |
|---|---|
| Open SQL file | Browser upload or managed workspace read; direct OS picker remains unavailable in Web v1 |
| Read SQL file | `POST /api/v1/app/sql-file/read` reads files constrained to the JavaNavi managed SQL workspace |
| Write SQL file | `POST /api/v1/app/sql-file/write` writes JavaNavi `WriteSQLFile(filePath, sql)` quick-save content inside the managed SQL workspace |
| Select/List SQL directory | `POST /api/v1/app/sql-directory/select` creates/returns a managed workspace directory; `POST /api/v1/app/sql-directory/list` lists SQL children |
| Save export file | Browser download response |
| Import CSV/XLSX/JSON | Browser upload + preview endpoint |
| Select SSH key | Browser upload into encrypted/keyring-backed secret store |
| Select SQLite/DuckDB database file | Browser upload or managed workspace file registration |
| Driver package file/directory | Browser upload or configured JavaNavi driver repository/workspace |
| Open directory in OS | Stub-disabled in Web v1 or show workspace location text |

## Progress and cancellation

Long-running file workflows must emit progress through the runtime adapter:

- `sqlfile:progress`
- `import:progress`
- `driver:download-progress`

Each job must have a job ID and a cancellation endpoint where JavaNavi currently supports cancellation.

## JavaNavi Web compatibility endpoints

The Phase 5 compatibility layer exposes managed-workspace replacements for the remaining JavaNavi file methods:

- `POST /api/v1/files/export/data`, `/export/query`, `/export/table`, `/export/tables-sql`, `/export/tables-data-sql`, `/export/database-sql` write artifacts under `${JAVANAVI_DATA_DIR}/exports` and return path/download metadata.
- `POST /api/v1/files/import/select`, `/import/preview`, `/import/run`, and `/config/import` use managed placeholders under `${JAVANAVI_DATA_DIR}/imports`; import run currently parses and emits progress evidence without mutating target databases.
- `POST /api/v1/files/sql/open` opens a managed SQL workspace file instead of an OS picker.
- `POST /api/v1/files/database-file/select` and `/ssh-key/select` return upload placeholders only. SSH runtime behavior remains excluded by user scope; no private key material is read or stored by this compatibility endpoint.
