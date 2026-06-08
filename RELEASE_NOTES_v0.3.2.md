# JavaNavi v0.3.2

## 更新内容

- 优化 Redis Cluster 扫描流程，按目标节点复用分组扫描上下文，减少重复连接与重定向处理开销。
- 改进集群扫描游标处理，提升大 keyspace 扫描时的稳定性。

## 验证

- 发布前检查：`npm run verify:quick`
