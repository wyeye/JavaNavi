# JavaNavi v0.2.6

## 更新内容

- 修复桌面端内置 Java runtime 缺少 `java.sql.rowset` 时，达梦 JDBC 通过 SSH 连接报 `SyncProviderException` 类缺失的问题。

## 验证

- 打包脚本语法检查：`bash -n scripts/package-desktop-sidecar.sh`
- 桌面 jlink 模块验证：临时 Python 脚本确认 `javax.sql.rowset.spi.SyncProviderException` 可加载
- 达梦驱动依赖确认：`jdeps --multi-release 17 --ignore-missing-deps --print-module-deps DmJdbcDriver18-8.1.3.140.jar`
