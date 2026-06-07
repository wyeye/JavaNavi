# JavaNavi v0.2.8

## 更新内容

- 优化表批量操作接口，补充后端批量接口与前端调用。
- 修复连接配置对象在 Redis、MongoDB、数据同步、结构同步、文件工作流、任务执行兼容层中解析网络设置丢失的问题。
- Redis 集群连接测试支持对象形式的 SSH 隧道、代理与凭据配置，避免网络设置未生效导致直连超时。

## 验证

- 发布前检查：`npm run verify:quick`
- 后端测试：`cd backend && mvn test`
- Redis SSH 集群连接测试：`/api/v1/redis/test`
