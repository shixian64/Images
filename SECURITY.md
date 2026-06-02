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

本项目会处理上游 API Key、用户会话、生成图片、提示词、客户端日志和本地 SQLite 数据库。开源、部署或提交 Issue 前请确认：

- `.env` 不进入 Git
- `generated/` 不进入 Git
- SQLite 数据库、WAL、备份、生成图片和示例图按敏感资产处理
- 日志和截图中没有 API Key、Token、Cookie、邮箱、用户 ID、提示词、用户图片等敏感信息
- 如果密钥曾经公开暴露，应立即撤销并更换

## 当前安全边界

项目默认包含以下保护措施：

- 上游默认要求 HTTPS。
- 生产严格模式下拒绝 localhost、私网、link-local、metadata 类上游地址。
- 上游请求使用已校验 DNS 结果发起连接，降低 DNS rebinding / TOCTOU 风险。
- API Key、Authorization、Cookie 等敏感字段在 UI、前端日志和服务端日志中脱敏。
- 运行时数据默认写入 `generated/`。
- Docker compose 默认使用只读根文件系统，并仅持久化 `/app/generated`。
- 静态文件、图库文件、提示词示例图和参考图临时文件都有路径边界检查。
- JSON、multipart、上游响应、URL 图片下载、参考图上传和提示词示例图上传都有大小限制。

## 认证、会话与 CSRF

- session cookie 使用 `HttpOnly`、`SameSite=Lax`、`Path=/`。
- 当 `NODE_ENV=production` 时，session cookie 会额外带 `Secure`；因此生产环境应放在 HTTPS 后面。
- 所有 `/api/*` 非 GET 请求都需要 `X-Requested-With: fetch`。
- 非 GET 请求还要求 `Origin` 或 `Referer` 与当前 Host 同源，用于拦截普通表单、图片等跨站请求。
- 除 `/api/auth/*` 外，业务 API 都要求登录；`/api/admin/*` 和管理功能要求管理员角色。

## 注册和登录防护

- `REGISTRATION_MODE=closed` 是默认模式，公开环境建议保持 `closed` 或 `invite`。
- 空库首个注册账号会自动成为管理员；`ADMIN_BOOTSTRAP_TOKEN` 仅作为旧部署兼容路径，在已有普通用户但没有活跃管理员时使用。
- 注册支持邀请码、IP 限频、邮箱域名 allowlist / blocklist 和蜜罐字段。
- 登录同时按 IP、账号、IP+账号限流，降低暴力破解和枚举风险。
- `TRUST_PROXY=1` 只应在可信反向代理会清洗 `X-Forwarded-For` / `X-Real-IP` 时启用。

## API Key 存储说明

当前有两类接口凭证：

- **系统默认接口 Key**：管理员在接口管理中配置；当前以明文形式保存在 SQLite 的系统设置中，但不会通过普通用户接口、前端摘要或日志明文回显。
- **个人覆盖接口 Key**：用户在浏览器端填写；前端持久化会清除 API Key，队列任务只在当前 Node 进程内临时持有。

系统默认 Key 的风险接受条件和升级路径见 [`docs/API_KEY_STORAGE_DECISION.md`](docs/API_KEY_STORAGE_DECISION.md)。如果作为公网 SaaS、多租户服务或运行在不完全可信主机上，应先升级到加密密钥存储或 KMS/Vault。

## 部署建议

- 生产保持 `ALLOW_INSECURE_UPSTREAMS=0`、`ALLOW_PRIVATE_UPSTREAMS=0`。
- 公开部署保持 `REGISTRATION_MODE=closed` 或 `invite`；如果需要旧令牌兼容路径，请设置长随机 `ADMIN_BOOTSTRAP_TOKEN`。
- 把 `NODE_ENV=production` 与 HTTPS 反向代理配套使用。
- 限制宿主机上 `generated/` 卷的读写权限；备份同样按密钥材料处理。
- 定期轮换系统默认上游 API Key，并清理不再使用的个人和系统配置。
