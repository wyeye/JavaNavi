# JavaNavi v0.2.2

## 更新内容

- 修复在线更新完成后关于页仍显示旧版本的问题。
- 应用信息接口改为读取打包版本，避免后端版本硬编码。

## 验证

- 前端测试：`npm --prefix frontend test`
- 前端构建：`npm --prefix frontend run build`
- Java 测试：`npm run verify:java`
- 后端打包版本检查：`cd backend && mvn -q package -DskipTests`
- Tauri 检查：`cd src-tauri && cargo check`
