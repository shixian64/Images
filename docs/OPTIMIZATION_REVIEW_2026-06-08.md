# 优化必要性核对与落地记录（2026-06-08）

范围：基于前次提出的 10 个优化点，按用户要求排除第 7 项“图库缩略图 / 预览图管线”，其余逐项核对必要性并落地低风险修改。

## 1. API 文档

- 必要性：高。`server.js` 中 API 路由较多，权限边界、CSRF 规则、错误码需要集中说明，便于自托管部署和后续联调。
- 修改：新增 `docs/API.md`，覆盖通用约定、认证、用户、接口配置、生图/队列、图库、Prompt Square、漫画和管理后台接口。

## 2. 数据库迁移版本表

- 必要性：高。现有 schema 变更依赖 idempotent `CREATE TABLE IF NOT EXISTS` 与 `ALTER TABLE`，功能继续增长后需要明确哪些迁移已执行。
- 修改：新增 `schema_migrations` 表、`runSchemaMigration()` 和 `schemaMigrations.list()`；当前 1-6 号结构迁移会被记录，测试覆盖迁移表创建和顺序。

## 3. 系统默认 API Key 加密存储

- 必要性：高。系统默认 Key 是实例级敏感凭证，SQLite 与备份都应降低明文暴露风险。
- 修改：新增 `services/secrets.js`，支持 `IMAGE_STUDIO_SECRET_KEY` 下 AES-256-GCM 加密；`services/interface-defaults.js` 保存系统默认生图/对话 Key 时加密，读取时透明解密；未设置主密钥时保留旧版明文兼容。
- 文档：更新 `.env.example`、`docker-compose.yml`、`README.md`、`SECURITY.md` 和 `docs/API_KEY_STORAGE_DECISION.md`。

## 4. 拆分过大的管理前端模块

- 必要性：中高。`public/modules/users.js` 同时承载用户、注册、额度、队列、日志、接口、图库等管理功能，后续维护成本较高。
- 修改：将“系统默认接口管理”拆到 `public/modules/admin-interfaces.js`，`users.js` 改为只在切换到接口管理页时懒加载/绑定该模块。

## 5. 拆分大型 CSS / HTML

- 必要性：中。样式文件过大影响维护；但当前项目没有模板/构建链路，直接拆 HTML 会引入额外复杂度。
- 修改：优先拆出低风险的管理后台样式到 `public/admin.css`，`public/index.html` 新增独立 stylesheet 引用。HTML 暂保持单静态入口，避免引入未规划的构建或模板系统。

## 6. 安全响应头

- 必要性：高。当前已具备 CSRF、路径边界和上游 SSRF 防护，但 HTTP 响应缺少统一安全头。
- 修改：`utils/http.js` 新增统一安全头与 `withSecurityHeaders()`；JSON、静态文件、错误响应和 304 响应都带 CSP、`X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options`、`Permissions-Policy`。

## 8. 队列横向扩展与重启边界

- 必要性：中。当前队列仍是单进程 SQLite 调度，短期适合自托管；在真正分布式改造前，至少应把运行边界显式暴露给管理端和文档。
- 修改：新增 `queueRuntimeInfo()`，`queueStats()` 返回 `runtime`，明确当前 backend、是否分布式、个人 Key 临时性和重启策略；`docs/API.md` 记录该边界。

## 9. 路由分发改为显式路由表

- 必要性：中高。`server.js` 的长 `if startsWith` 链随 API 增长会越来越难审计权限和匹配顺序。
- 修改：引入 `API_ROUTES` 和 `dispatchApiRoute()`，把匹配规则、是否公开、handler 统一登记；保留现有权限语义和匹配顺序。

## 10. CI / 自动化测试入口

- 必要性：高。项目已有较完整的 `node:test` 套件，但缺少仓库级自动化入口。
- 修改：新增 `.github/workflows/test.yml`，在 push / PR 上使用 Node 22 执行 `npm test`。

## 验证

- 已运行：`npm test`
- 结果：206 项通过，0 失败。
