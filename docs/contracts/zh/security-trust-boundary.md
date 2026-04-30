# JavaNavi 安全与信任边界契约

中文 | [English](../security-trust-boundary.md)

本文档保护 JavaNavi 的本地 Java/Web 运行时，同时支持参考 [GoNavi](https://github.com/Syngnat/GoNavi) 的数据库管理工作流。JavaNavi 感谢 GoNavi 的开源参考，并在 Web/Desktop 边界下记录自己的安全约束。

## 为什么需要这个门禁

JavaNavi 当前本地 Web 包会通过 loopback HTTP 边界暴露带凭据的数据库、driver、AI、proxy 与文件工作流操作。数据库密码、SSH 相关 metadata、proxy credential、API key 与连接 URI 在跨越该边界或写入日志/事件前必须受到保护。

## 接受真实数据库凭据前的必要控制

1. 默认绑定 loopback。
2. CORS 限制为配置的本地前端 origin。
3. 对携带凭据的操作要求 local-session token 或等价 CSRF 保护。
4. 拒绝跨 origin 或缺失 token 的凭据请求。
5. 在日志、异常、validation message、event payload 与浏览器可见错误中脱敏 secret。
6. 通过加密或 keyring-backed 抽象存储 saved secret。
7. 文档明确：除非未来加入 auth model，否则不支持把本地服务暴露到非可信本地环境。

## 需要脱敏的字段

- `password`
- `apiKey`
- `secretRef`
- `ssh.password`
- `ssh.keyPath` when logged
- `proxy.password`
- `httpTunnel.password`
- `uri` 与 `dsn` 中携带凭据时
- `mysqlReplicaPassword`
- `mongoReplicaPassword`
- provider-specific headers 与 bearer tokens

## 接受检查

```text
SECURITY_LOOPBACK_BIND=passed
SECURITY_CORS_ORIGIN=passed
SECURITY_CSRF_LOCAL_SESSION=passed
SECURITY_CROSS_ORIGIN_REJECTED=passed
SECURITY_SECRET_REDACTION=passed
SECURITY_SECRET_STORAGE=passed
```

在这些检查通过前，任何外部 MySQL/PostgreSQL/Oracle/Redis/Mongo/可选 driver 凭据路径都不能标记为完成。

## 当前实现状态

已实现的控制包括：

- `server.address` 默认 `127.0.0.1`。
- `WebConfig` 将 CORS 限制到配置的本地 dev origin。
- `LocalApiSecurityFilter` 拒绝不允许的 `Origin` header，并要求 unsafe credential-bearing API method 带 local-session token。
- `GET /api/v1/session` 颁发 process-local token，并报告配置的 header/cookie 名称。
- `SecretRedactor` 脱敏常见 password/token/API-key 与 credential URI 形式。
- `EncryptedFileSecretStore` 提供 AES-GCM local-file encrypted secret-store 抽象。
- 浏览器适配器调用通过 JavaNavi compatibility adapter 获取并发送 process-local session token。
- Secret redaction 已在后端 runtime 代码中实现；credential 路径变更时应通过 package/startup smoke 或 focused manual check 覆盖。

该门禁允许后续实现真实凭据流，但它本身不代表任何外部数据库 driver 已完成。
