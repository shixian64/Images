# Security Policy

## 支持范围

当前主要维护最新 `main` 分支。历史版本如未单独发布安全维护说明，默认不承诺安全补丁回传。

## 报告安全问题

如果你发现安全问题，请不要在公开 Issue 中直接披露可利用细节。

建议通过以下方式私下联系维护者：

- GitHub Security Advisory（如果仓库已启用）
- 或在仓库说明中列出的维护者联系方式

报告时请尽量提供：

- 影响范围
- 复现步骤
- 相关请求、日志或截图
- 可能的修复建议

请不要附带真实 API Key、Cookie、数据库、用户图片或其他私密数据。

## 敏感信息处理

本项目会处理上游 API Key、用户会话、生成图片和本地 SQLite 数据库。开源、部署或提交 Issue 前请确认：

- `.env` 不进入 Git
- `generated/` 不进入 Git
- 日志和截图中没有 API Key、Token、Cookie、邮箱、用户 ID 等敏感信息
- 如果密钥曾经公开暴露，应立即撤销并更换

## 默认安全边界

项目默认包含一些保护措施：

- 上游默认要求 HTTPS
- 生产严格模式下拒绝 localhost、私网、link-local、metadata 类地址
- API Key 在 UI 和日志中脱敏
- 运行时数据默认写入 `generated/`
- Docker compose 默认使用只读根文件系统，并仅持久化 `/app/generated`

