# JavaNavi v0.2.7

## 更新内容

- 新建/编辑连接的“网络与安全”只保留连接级 SSL/TLS、SSH 隧道、SOCKS5 代理、HTTP CONNECT 代理。
- Redis 与 MongoDB 连接支持 SSH 隧道、SOCKS5 代理、HTTP CONNECT 代理。
- 移除全局代理入口与运行时逻辑，避免连接网络配置混淆。
- 修复 SSH 测试提示被连接弹窗遮挡，以及编辑连接时已保存 SSH 密码不能复用的问题。

## 验证

- 前端构建：`npm --prefix frontend run build`
- 后端测试：`cd backend && mvn test`
- 源码残留检查：确认全局代理相关标识已清理
