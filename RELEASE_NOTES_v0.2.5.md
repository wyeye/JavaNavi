# JavaNavi v0.2.5

## 更新内容

- 新增任务中心与持久化任务记录，优化 SQL 文件执行进度展示。
- 优化表格编辑、刷新、连续 SQL 执行结果和左侧表树信息展示。
- 修复数据表编辑定位、MySQL SQL 导出兼容性及多处入口显示问题。

## 验证

- 前端测试：`npm --prefix frontend test`
- 前端构建：`npm --prefix frontend run build`
- 源码健康扫描：`npm run scan:source-health`
- 后端测试：`cd backend && mvn -q test`
