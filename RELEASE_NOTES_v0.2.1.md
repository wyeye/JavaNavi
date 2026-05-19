# JavaNavi v0.2.1

## 更新内容

- 修复数据表格视图刷新和翻页后总数不更新的问题，避免新增数据无法通过分页看到。
- 导入重复数据时跳过重复项并提示用户。

## 验证

- 前端回归脚本：`python3 /tmp/javanavi_data_viewer_total_regression.py`
- 前端测试：`npm --prefix frontend test`
- 前端构建：`npm --prefix frontend run build`
