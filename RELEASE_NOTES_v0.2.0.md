# JavaNavi v0.2.0

## 更新内容

- 修复导出全部数据最多只导出 500 条的问题，覆盖表导出、查询导出和 SQL 备份导出。

## 验证

- 后端测试：`mvn -q test`
- 前端测试：`npm --prefix frontend test`
- 前端构建：`npm --prefix frontend run build`
- 桌面壳检查：`cargo check`
- 导出烟测：验证 750 行数据可完整导出
