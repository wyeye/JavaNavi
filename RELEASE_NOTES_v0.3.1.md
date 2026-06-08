# JavaNavi v0.3.1

## 更新内容

- 修复 Redis Cluster `MOVED` / `ASK` 重定向处理，避免扫描、读取 TTL 和读取类型时因槽位迁移失败。
- Redis 重定向连接复用原 SSH、代理、SSL、认证和 DB 配置，支持通过 SSH 跳板访问集群内部节点。

## 验证

- 发布前检查：`npm run verify:quick`
- Redis MOVED 回归脚本：`python3 /tmp/redis_moved_scan_test.py`
