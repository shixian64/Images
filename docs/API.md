# HTTP API

本文档记录当前 `/api/*` 的主要接口、权限边界和通用约定。实现入口见 `server.js` 的 `API_ROUTES`。

## 通用约定

- 所有响应默认为 JSON，错误形态通常为 `{ "error": "message" }`；SSE、204 空响应和静态文件路由除外。
- 当前 canonical 路径仍是 `/api/*`；`/api/v1/*` 是兼容别名，会在服务端分发前规范化到对应 `/api/*` 路径，便于外部脚本固定主版本。
- 除 `GET` / `HEAD` / `OPTIONS` 外，所有 `/api/*` 请求都需要：
  - `X-Requested-With: fetch`
  - `Origin` 或 `Referer` 与当前 `Host` 同源
- 已登录 session 的非安全方法还需要携带 `/api/auth/me`、登录或注册响应返回的 `csrfToken`：`X-CSRF-Token: <csrfToken>`。
- 除 `/api/auth/*` 外，业务接口都要求已登录。
- `/api/admin/*` 以及 `/api/users*` 要求当前用户为 `admin`。
- 请求体大小由 `MAX_JSON_BODY_BYTES` 限制；上传类 multipart 由 `MAX_MULTIPART_BODY_BYTES` 限制。

## 健康检查

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET/HEAD | `/healthz` | 公开 | 返回 `{ ok, uptimeSec, db, disk, queue, eventLoop }`；DB、运行目录可写、队列或事件循环检查失败时返回 503。`db.runtime` 会暴露当前 SQLite 驱动边界，例如 `driver: "node:sqlite DatabaseSync"`、`blocking: true`、`workerOffloaded: false`、`busyTimeoutMs`、`walAutocheckpointPages`，用于部署侧识别同步数据库风险。 |

## Auth

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | 公开 + CSRF | 注册；本地 / 开发空库首个账号自动成为管理员，生产空库首个管理员需 bootstrap token，其他注册受注册策略限制。 |
| POST | `/api/auth/login` | 公开 + CSRF | 登录并设置 session cookie。 |
| POST | `/api/auth/logout` | 公开 + CSRF | 销毁当前 session。 |
| GET | `/api/auth/registration-policy` | 公开 | 返回当前注册策略摘要，供登录页决定是否展示邀请码入口。 |
| GET | `/api/auth/me` | 公开 | 返回当前登录用户；未登录时返回 401。 |

## 当前用户

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/profile` | 登录 | 读取当前用户资料。 |
| PATCH | `/api/profile` | 登录 | 修改用户名、邮箱、头像 URL；头像 URL 仅接受无凭据的 HTTPS 地址。 |
| POST | `/api/profile/password` | 登录 | 修改密码；成功后吊销旧 session 并重建当前 session。 |
| GET | `/api/quota/me` | 登录 | 读取当前用户有效额度、用量和存储统计。 |

## 接口配置

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/interfaces/default` | 登录 | 读取系统默认接口公开摘要，只返回 `hasApiKey`，不返回明文 Key。 |
| GET | `/api/admin/interfaces/default` | 管理员 | 读取管理端系统默认接口配置摘要。 |
| PUT | `/api/admin/interfaces/default` | 管理员 | 保存系统默认生图/对话接口配置。设置 `IMAGE_STUDIO_SECRET_KEY` 后 API Key 会加密落库。 |
| POST | `/api/admin/interfaces/default/test` | 管理员 | 对已保存的默认接口执行 `/v1/models` 探活；上游非 2xx 统一返回 502，避免透传上游状态和错误体。 |
| POST | `/api/test-profile` | 登录 | 测试用户提交的个人覆盖接口配置，不持久化个人 Key；上游非 2xx 统一返回 502。 |

## 生图、对话与队列

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/generate/config` | 登录 | 获取生图默认配置和限制。 |
| POST | `/api/generate` | 登录 | 创建异步生图任务并返回 job 摘要。 |
| POST | `/api/generate/stream` | 登录 | 兼容旧语义：创建任务后用 SSE 流式返回状态。 |
| POST | `/api/chat` | 登录 | 调用对话接口，主要用于提示词优化。 |
| GET | `/api/jobs` | 登录 | 当前用户任务列表。 |
| GET | `/api/jobs/:id` | 登录 | 当前用户读取单个任务。 |
| POST | `/api/jobs/:id/cancel` | 登录 | 取消当前用户任务。 |
| POST | `/api/jobs/:id/retry` | 登录 | 重试当前用户可重试任务。 |
| GET | `/api/jobs/stream` | 登录 | 订阅当前用户任务 SSE；支持 `Last-Event-ID` 或 `?after=<eventId>` 回放近期队列事件。 |
| GET | `/api/jobs/:id/stream` | 登录 | 订阅单任务 SSE；支持 `Last-Event-ID` 或 `?after=<eventId>` 回放近期任务事件。 |
| GET | `/api/admin/jobs` | 管理员 | 管理员任务列表。 |
| GET/PUT | `/api/admin/jobs/settings` | 管理员 | 读取/保存队列设置。 |
| GET | `/api/admin/jobs/:id` | 管理员 | 管理员读取单个任务。 |
| POST | `/api/admin/jobs/:id/cancel` | 管理员 | 管理员取消任务。 |
| PATCH/POST | `/api/admin/jobs/:id/priority` | 管理员 | 调整任务优先级。 |
| GET | `/api/admin/jobs/stream` | 管理员 | 订阅管理员任务 SSE；支持 `Last-Event-ID` 或 `?after=<eventId>` 回放近期管理队列事件。 |

队列当前运行边界：SQLite 持久化 + 单 Node 进程调度。系统默认接口的 queued / stale running 任务可在重启后继续排队执行；个人覆盖 Key 只在当前进程内存中存在，queued / running 任务在重启后需要用户重新提交。任务 SSE 会把近期 job / refresh 事件写入 SQLite 事件日志，用于浏览器断线后的 `Last-Event-ID` 重连回放；它不是跨多 worker 的完整消息总线。

## 图库

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/gallery` | 登录 | 当前用户图库或公开图库列表；`scope=public` 时读取公开图库。 |
| POST | `/api/gallery/:id/visibility` | 登录 | 设置图片公开/取消公开；普通用户只能操作自己的图片。 |
| POST | `/api/gallery/:id/like` | 登录 | 点赞公开图片；受每日点赞次数限制。 |
| DELETE | `/api/gallery/:id` | 登录 | 删除当前用户图片。 |
| GET | `/api/admin/gallery` | 管理员 | 管理员图库列表，支持筛选、分页、排序。 |
| GET | `/api/admin/gallery/stats` | 管理员 | 图库统计。 |
| DELETE | `/api/admin/gallery/:id` | 管理员 | 管理员删除单张图片。 |
| POST | `/api/admin/gallery/bulk-delete` | 管理员 | 管理员批量删除图片。 |
| GET | `/api/admin/gallery/orphans` | 管理员 | 扫描 DB 缺失文件与磁盘孤儿文件。 |
| DELETE | `/api/admin/gallery/orphans` | 管理员 | 删除孤儿文件；请求体为 `{ "path": "users/<uid>/images/..." }`。 |

图片文件不直接走 `/api`，由 `/gallery-files/*` 和 `/prompt-example-files/*` 静态路由按 session 与 DB 归属校验。

## Prompt Square 与提示词示例

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET/POST | `/api/prompt-square` | 登录 | 浏览或发布 Prompt Square 条目。 |
| GET/DELETE | `/api/prompt-square/:id` | 登录 | 读取或删除条目；删除仅限作者或管理员。 |
| POST | `/api/prompt-square/:id/use` | 登录 | 记录使用次数。 |
| POST | `/api/prompt-examples` | 登录 | 上传提示词示例图。 |

Prompt Square `meta.previewImages` 仅保留本地提示词示例图路径或无凭据的 HTTPS 外部图片 URL。

## 漫画工作流

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET/POST | `/api/comic-projects` | 登录 | 列表 / 创建漫画项目。 |
| GET/PUT/PATCH/DELETE | `/api/comic-projects/:id` | 登录 | 读取、更新、删除漫画项目。 |
| POST | `/api/comic-storyboards` | 登录 | 创建分镜生成任务。 |

## 管理后台

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET/POST | `/api/users` | 管理员 | 用户列表 / 创建用户。列表支持 `page`、`size`、`search`、`role`、`status` 服务端筛选分页，返回 `{ items, total, filtered, page, pageSize }`。 |
| GET/PATCH/DELETE | `/api/users/:id` | 管理员 | 用户详情、角色/状态修改、删除用户。详情默认只返回基础资料、统计和 session；可用 `include=audits,activityLogs,jobs,clientLogs` 或 `include=all` 按需加载重数据区块。 |
| POST | `/api/users/:id/reset-password` | 管理员 | 重置用户密码。 |
| POST | `/api/users/:id/logout` | 管理员 | 强制用户所有 session 下线。 |
| GET/PUT | `/api/admin/quota/defaults` | 管理员 | 读取/保存默认额度。 |
| GET/PUT/DELETE | `/api/admin/quota/users/:id` | 管理员 | 读取、修改或清除单用户额度覆盖。 |
| POST | `/api/admin/quota/users/:id/reset` | 管理员 | 重置用户今日或本月用量。 |
| GET/PUT | `/api/admin/registration` 或 `/api/admin/registration/settings` | 管理员 | 读取/保存注册策略。 |
| POST | `/api/admin/registration/invites` | 管理员 | 生成邀请码。 |
| POST/DELETE | `/api/admin/registration/invites/reset` | 管理员 | 重置邀请码。 |
| POST/DELETE | `/api/admin/registration/invites/:code` | 管理员 | 停用邀请码。 |
| POST/DELETE | `/api/admin/registration/redemptions/cleanup` | 管理员 | 清理邀请码兑换记录，可选同步停用未使用旧邀请码。 |
| POST | `/api/client-logs` | 登录 | 同步前端客户端日志批次；服务端按用户和 IP 限流。 |
| GET | `/api/admin/client-logs` | 管理员 | 查询前端同步的客户端日志。 |

## 常见错误码

| HTTP | 典型含义 |
| --- | --- |
| 400 | 请求体无效、参数无效或上游配置无效。 |
| 401 | 未登录或 session 失效。 |
| 403 | CSRF 校验失败、权限不足或文件归属不匹配。 |
| 404 | 资源不存在；部分场景为避免枚举也返回 404。 |
| 409 | 状态冲突，例如队列维护、最后管理员保护、任务不可取消。 |
| 413 | 请求体或上传文件超过限制。 |
| 429 | 登录、注册、对话、额度或队列限流。 |
| 502 | 上游响应过大、格式异常或探活上游返回非 2xx。 |
| 500 | 未预期的服务端错误。 |
