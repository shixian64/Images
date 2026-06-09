# 当前项目多维度问题分析（2026-06-09）

> 范围：`D:\project\AI\Images` 当前工作区。  
> 方法：静态审查源码、配置、文档、Docker/CI 与前端资源；遵守项目指令，**未执行编译/构建命令**，也未启动服务。  
> 口径：这里的“问题”包含已确认缺陷、文档漂移、生产化风险、性能瓶颈、安全边界弱点、可维护性隐患与体验一致性问题。

## 快速概览

- 代码规模：约 134 个非运行态文件；`*.js` 111 个，约 3.4 万行；测试文件 37 个。
- 最大文件集中在：`services/prompt-square-seeds.js`（约 4.8k 行）、`public/styles.css`（约 3.0k 行）、`public/modules/users.js`（约 2.4k 行）、`services/db.js`（约 2.1k 行）。
- 架构形态：单进程 Node.js 原生 HTTP + `node:sqlite` + 本地 `generated/` 文件存储 + 浏览器 ES Modules。
- 主要结论：项目已覆盖不少安全边界（鉴权、CSRF、路径保护、日志脱敏、上游 URL 检查、测试覆盖），但当前仍更像“小团队自托管单实例”形态。若面向公网、多团队、多实例或长期运营，需要优先处理安全头/会话、文档漂移、队列可靠性、资源上限、配置一致性和模块拆分。

## 问题清单

### A. 安全、认证、隐私与权限边界

1. **系统默认 API Key 加密是可选项，默认可明文落库。** 证据：`services/secrets.js` 在未配置主密钥时 `protectSecret()` 直接返回明文；`README.md`/`SECURITY.md` 也承认未设置 `IMAGE_STUDIO_SECRET_KEY` 时兼容明文。生产部署容易因漏配导致 SQLite/备份泄露系统 Key。
2. **缺少密钥轮换/重加密机制。** 证据：`services/secrets.js` 只有 `enc:v1` 加解密封装；未见主密钥版本、轮换、批量重写或失效流程。主密钥泄露后无法平滑轮换历史密文。
3. **会话 ID 以明文 bearer token 存储在 SQLite。** 证据：`services/auth.js` 生成 `randomBytes(32).toString('hex')` 后直接 `sessions.create()`；`services/db.js` 的 `sessions.id` 为主键。数据库泄露即可复用未过期 session。
4. **Session Cookie 的 `Secure` 完全依赖 `NODE_ENV=production`。** 证据：`utils/cookies.js` 的 `isSecure()` 只判断 `process.env.NODE_ENV === 'production'`；`.env.example` 和 `docker-compose.yml` 默认 `NODE_ENV=development`。HTTPS 反代部署若忘记改环境变量，Cookie 不带 `Secure`。
5. **CSRF 保护不是每会话 token 方案。** 证据：`middleware/guard.js` 仅要求 `X-Requested-With: fetch` 且 `Origin/Referer` host 相等。它能挡普通跨站表单，但不能提供同步 token/双提交 token 那种可审计的每请求随机性。
6. **CSRF 同源校验只比较 host，不比较 scheme。** 证据：`hostOf()` 返回 `new URL(url).host`，`requireCsrf()` 比较 `originHost === selfHost`。HTTP/HTTPS 混合代理或降级场景下边界不够明确。
7. **CSP 允许 `unsafe-inline` 脚本和样式，削弱 XSS 防护。** 证据：`utils/http.js` 中 `script-src 'self' 'unsafe-inline'`、`style-src 'self' 'unsafe-inline'`。当前大量内联脚本/样式让后续 CSP 收紧成本高。
8. **SSE 响应没有统一安全头。** 证据：`utils/sse.js` 的 `openSse()` 直接 `writeHead(200, {...})`，没有复用 `withSecurityHeaders()`；与 `SECURITY.md`“API 与静态文件响应默认带 CSP”等描述不完全一致。
9. **部分 204 响应没有统一安全头。** 证据：`routes/auth.js` 的 logout、`routes/profile.js` 的改密成功都直接 `res.writeHead(204)`。
10. **首次空库注册自动成为 admin，公网首启窗口存在抢占风险。** 证据：`services/auth.js` 的 `canCreateFirstAdminWithoutToken()` / `register()` 逻辑；`README.md` 说明空库首个账号自动成为管理员。若服务先暴露再初始化，攻击者可抢首个管理员。
11. **注册接口会区分“用户名已占用/邮箱已占用”，开放注册时存在枚举风险。** 证据：`services/auth.js` 对 username/email 分别抛 `username already taken`、`email already taken`，`routes/auth.js` 直接返回错误。
12. **登录/注册/Chat 限流均为内存态，重启或多实例会失效。** 证据：`services/rate-limit.js` 注释说明 process-local，存储为 `const store = new Map()`。
13. **启用 `TRUST_PROXY` 后信任所有转发头，没有可信代理 IP allowlist。** 证据：`utils/request.js` 只看环境开关，然后使用 `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for` / `forwarded`。若代理未清洗请求头，客户端可伪造 IP 绕过限流/审计。
14. **密码策略只有长度下限，缺少复杂度、禁用常见密码、历史密码或强制改密策略。** 证据：`services/auth.js`、`services/users.js` 多处仅检查 `length < 8`。
15. **密码哈希使用 `scryptSync`，登录/注册在事件循环中同步耗 CPU。** 证据：`services/auth.js` 使用 `scryptSync()`。在并发错误登录或注册尝试下，会阻塞 Node 事件循环。
16. **管理员重置随机密码后没有“首次登录必须修改密码”状态。** 证据：`services/users.js` 的 `resetPasswordByAdmin()` 更新密码并销毁 session，但用户表没有 password_reset_required 之类字段。
17. **邀请码以明文保存、列表返回，且缺少自然过期时间字段。** 证据：`services/db.js` 的 `registration_invites.code` 为主键；`services/registration-guard.js` 的 `adminRegistrationSnapshot()` 返回 invites。数据库/管理端泄露可直接使用未禁用邀请码。
18. **公开图库图片使用长缓存，取消公开后浏览器可能仍持有缓存副本。** 证据：`routes/static.js` 对图库文件设置 `private, max-age=31536000, immutable`。权限变化不会让已缓存文件自动失效。
19. **外部图片/头像/Prompt Square 预览 URL 可能形成浏览器侧追踪面。** 证据：`services/users.js` 接受 http/https avatar URL；`routes/prompt-square.js` 允许 `previewImages` 为 http(s)。浏览器加载外链会暴露访问者网络信息。
20. **客户端日志可能收集页面 URL、UA、窗口信息和错误上下文，缺少用户可见开关。** 证据：`public/modules/logs.js` 的 `clientContext()`；`services/client-logs.js` 会持久化 pageUrl/userAgent/ip。虽然有脱敏，但隐私边界应显式告知。

### B. API、路由实现与文档一致性

21. **路由总表使用大量 `startsWith()`，存在过度匹配。** 证据：`server.js` 中 `/api/users`、`/api/profile`、`/api/interfaces` 等都用 `pathname.startsWith(...)`。例如 `/api/usersXYZ` 会进入 users 路由再 404，边界不够精确。
22. **API 文档中的 Jobs SSE 路径与实现不一致。** 证据：`docs/API.md` 写 `/api/jobs/:id/events`、`/api/jobs/events`、`/api/admin/jobs/events`；实现是 `routes/jobs.js` 的 `/api/jobs/:id/stream`、`/api/jobs/stream`、`/api/admin/jobs/stream`。
23. **API 文档中的图库更新接口与实现不一致。** 证据：`docs/API.md` 写 `PATCH /api/gallery/:id`；实现是 `routes/gallery.js` 的 `POST /api/gallery/:id/visibility`。
24. **API 文档中的孤儿文件删除路径与实现不一致。** 证据：`docs/API.md` 写 `POST /api/admin/gallery/orphans/delete-dangling`；实现是 `routes/admin-gallery.js` 中 `DELETE /api/admin/gallery/orphans` 并从 body 读取 path。
25. **API 文档写了 Prompt Square 更新接口，但实现没有 PATCH。** 证据：`docs/API.md` 写 `GET/PATCH/DELETE /api/prompt-square/:id`；`routes/prompt-square.js` detail 只处理 GET/DELETE。
26. **API 文档写了 Prompt 示例图 GET/DELETE，但实现只有 POST 上传。** 证据：`docs/API.md` 写 `GET/POST /api/prompt-examples` 与 `DELETE /api/prompt-examples/:id`；`routes/prompt-examples.js` 只允许 `/api/prompt-examples` 的 POST。
27. **API 文档中的用户额度修改方法与实现不一致。** 证据：`docs/API.md` 写 `GET/PATCH /api/admin/quota/users/:id`；`routes/quota.js` 实现 GET/PUT/DELETE。
28. **API 文档中的注册邀请码路径与实现不一致。** 证据：`docs/API.md` 写 `/api/admin/registration/invites/generate` 和 `/:code/disable`；`routes/registration.js` 实现 `POST /api/admin/registration/invites` 与 `POST/DELETE /api/admin/registration/invites/:code`。
29. **API 文档对 `/api/auth/me` 的未登录行为描述不准。** 证据：`docs/API.md` 写“未登录时返回空状态”；`routes/auth.js` 的 `handleMe()` 实际返回 401。
30. **README/产品文档仍出现“同步提交”等旧语义，容易误导调用方。** 证据：`README.md` 功能描述提到同步提交；当前 `routes/generate.js` 注释说明 `POST /api/generate` 已改为入队并返回 202。
31. **方法不允许响应多数没有 `Allow` 头。** 证据：多处 route 直接 `sendJson(res, 405, { error: 'method not allowed' })`；只有 `server.js` 顶层 405 设置了 allow。
32. **API 文档不是从路由自动生成，已经发生多处漂移。** 证据：上面多个 `docs/API.md` 与 routes 的差异。后续新增接口仍可能继续漂移。
33. **部分管理接口 REST 风格混杂。** 证据：注册重置/停用同时接受 POST/DELETE，图库孤儿删除用 DELETE+body，用户重置密码用 action path。客户端和文档维护成本增加。
34. **`/healthz` 只返回 uptime，不能发现 DB/队列/磁盘只读等运行故障。** 证据：`server.js` 的 healthz 仅返回 `{ ok, uptimeSec }`。
35. **鉴权逻辑在 `server.js` 和部分 route 内重复。** 证据：`dispatchApiRoute()` 已统一 `requireAuth()`；`routes/generate.js`、`routes/profile.js`、`routes/comic-projects.js` 等仍有二次登录判断。重复逻辑增加未来不一致风险。
36. **错误码映射分散且不统一。** 证据：`routes/users.js`、`routes/gallery.js`、`routes/quota.js`、`routes/comic-projects.js` 各自维护 `statusFromError`/map。相同错误在不同接口可能返回不同状态。
37. **`routes/interfaces.js`、`routes/test-profile.js` 的探活错误会把上游 HTTP 状态透传给前端。** 证据：探活失败时 `sendJson(res, response.status, ...)`。某些上游状态/错误体可能对普通用户暴露过多诊断信息。

### C. 队列、数据一致性、可靠性与扩展性

38. **队列明确是单进程 SQLite 调度，不支持横向扩展。** 证据：`services/job-queue.js` 注释“single-process scheduler”，`queueRuntimeInfo()` 中 `scaleOutReady: false`。
39. **多实例部署可能重复执行同一 queued job。** 证据：调度器使用内存 `activeJobs`，取队列后更新状态，没有跨进程租约/乐观锁语义；SQLite 任务表不是分布式 worker lease。
40. **服务重启会把 running 任务统一标记失败。** 证据：`startJobQueue()` 调用 `generationJobs.recoverRunningAsFailed('server_restart')`。长任务没有恢复/续跑能力。
41. **个人自定义 Key 任务的密钥只在当前进程内存中，重启后不可继续。** 证据：`services/job-queue.js` 的 `transientJobSecrets = new Map()`；`runtimeBodyForJob()` 缺失时抛 `transient_secret_missing`。
42. **queued 自定义 Key 任务在排队期间依赖内存密钥，队列越长风险越高。** 证据：任务 payload 持久化不含 Key，密钥只记在 `transientJobSecrets`。即使 DB 有 queued job，进程丢失后也无法执行。
43. **队列 SSE 订阅者全部在内存中，重启后订阅状态丢失。** 证据：`userSubscribers`、`jobSubscribers`、`adminSubscribers` 都是内存集合。
44. **队列设置变更缺少审计记录。** 证据：`routes/jobs.js` 的 `setQueueSettings()` 后直接返回，没有像 quota/interfaces/registration 那样 `auditRecord()`。
45. **优雅停止时 abort running job，但 DB 状态要等下次启动恢复为 failed。** 证据：`stopJobQueue()` 只 abort controller 和释放 slot；状态转换依赖下一次 `recoverRunningAsFailed()`。
46. **管理员任务详情通过拉取最多 10000 条再内存查找。** 证据：`routes/jobs.js` 的 `getAdminJobs({ limit: 10000 }).find(...)`。超过 10000 条时可能查不到，且性能差。
47. **队列统计最多只看 10000 条任务。** 证据：`queueStats()` 使用 `generationJobs.listAll({ limit: 10000 })`。历史任务多时成功率/时长统计失真。
48. **`max_pending_per_user` 只统计 queued，不含 running。** 证据：`checkQueueCapacity()` 调 `countQueued({ statuses: ['queued'] })`。如果语义是“待处理总数”，当前命名会误导管理员。
49. **缺少备份/恢复脚本。** 证据：`docs/PRODUCT_DESIGN.md` 仍将“完善备份 / 恢复脚本”列为待办；运行态包括 SQLite、WAL、图片、示例图、临时参考图。
50. **迁移中存在关闭外键并重建表的路径，缺少迁移前自动备份。** 证据：`services/db.js` 的 `migratePromptSquareNullableOwner()` 执行 `PRAGMA foreign_keys = OFF`、DROP/ALTER。失败恢复依赖 SQLite/外部备份。
51. **Prompt Square seed 一旦标记完成，后续 seed 内容变化不会再应用。** 证据：`seedPromptSquareDefaults()` 开头 `if (done) return`。升级版本新增/修正 seed 可能不会进入已有部署。
52. **系统默认接口 `ready` 要求 image 和 chat 两套 Key 都存在。** 证据：`services/interface-defaults.js` 的 `ready: Boolean(enabled && image.apiKey && chat.apiKey)`。只使用生图或只使用 Prompt Assist 的部署会显示未 ready。
53. **系统配置全部放在 SQLite，没有导出/导入或环境优先的生产配置模式。** 证据：`system_settings` 承载 interfaces、quota、queue、registration 等设置。迁移/回滚/审计依赖手工 DB 备份。

### D. 性能、资源与容量风险

54. **multipart 请求被完整读入内存。** 证据：`utils/http.js` 的 `readMultipartFormData()` 先 `readBodyBuffer()`，默认 `MAX_MULTIPART_BODY_BYTES=100MiB`。上传参考图/示例图时内存峰值高。
55. **上游 JSON 响应被完整读入内存。** 证据：`services/upstream.js` 的 `readResponseTextLimited()` 默认上限 64MiB；base64 图片随后还会解码成 Buffer，产生额外峰值。
56. **URL 图片下载也完整缓冲。** 证据：`services/gallery-store.js` 的 `readResponseBufferLimited()` 返回完整 Buffer 后再写文件。大图/并发下载时容易顶内存。
57. **图片编辑多图并发会重复读取参考图并构造 multipart。** 证据：`services/image-generation.js` 的 `callImageEditUpstream()` 每个并发 worker 都 `editFilesFromReferences()`。参考图较大时内存和 IO 放大。
58. **Docker 默认内存与请求体上限组合存在 OOM 风险。** 证据：`.env.example`/compose 建议 768m 容器、512m V8 heap；multipart 100MiB、上游响应 64MiB、参考图总 80MiB 都是 Buffer/native 内存，不受 V8 heap 完全约束。
59. **管理图库分页需要边查 DB 边 stat 文件，深页近似 O(N)。** 证据：`services/gallery-store.js` 的 `collectExistingAdminGalleryPage()` 循环 DB page 并 `itemsFromRows()` stat 文件。
60. **孤儿扫描递归遍历所有用户图片，没有硬上限/超时/后台任务化。** 证据：`services/gallery-store.js` 的 `scanOrphans()` 和 `walkAndCheck()`。管理员误点也可能造成长时间 IO 压力。
61. **Prompt Square 搜索使用 `lower(...) LIKE` 扫描长文本，没有 FTS。** 证据：`services/db.js` 的 `promptSquareFilterSql()` 对 title/prompt/tags/username/source 做 LIKE；prompt 最大 12000 字符。
62. **用户管理列表在内存中过滤，缺少分页。** 证据：`routes/users.js` 的 `handleCollection()` 先 `listUsers()` 再 `applyFilters()`；`services/db.js` 的 `users.list()` 返回全量。
63. **用户详情一次性聚合审计、活动、任务、客户端日志，打开详情成本高。** 证据：`routes/users.js` 的 `handleDetail()` 同时取 audits、activityLogs、jobs、clientLogs。
64. **客户端日志接口缺少独立服务端限流。** 证据：`routes/client-logs.js` 登录后即可 POST；`services/client-logs.js` 单次 batch 限 100、字段限长，但没有频率限制。
65. **图库缩略图直接使用原图 URL，缺少缩略图/预览图派生。** 证据：`public/modules/gallery.js`、`public/modules/users.js` 渲染 `<img src=item.url>`；后端保存只有原图。大图列表会消耗大量带宽/内存。
66. **大 seed 数据作为 JS 模块导入，增加启动解析和仓库噪声。** 证据：`services/prompt-square-seeds.js` 约 4.8k 行，并被 `services/db.js` 在启动迁移路径导入。
67. **关键前端模块过大，影响维护和首屏加载。** 证据：`public/modules/users.js` 约 2.4k 行，`public/styles.css` 约 3.0k 行，`public/index.html` 约 1.0k 行。
68. **同步 SQLite API 会阻塞事件循环。** 证据：`services/db.js` 使用 `DatabaseSync`；大量请求路径直接调用同步查询/写入。高并发下 HTTP、SSE 心跳和登录都会被阻塞。
69. **Prompt/日志/错误文本多处作为 JSON 字符串反复序列化，缺少统一大小预算。** 证据：job result、client logs、audit meta、prompt square meta 各自有上限，缺少跨表/跨响应统一 payload budget。
70. **静态文件服务对普通静态资源默认 `no-cache`，无法有效利用版本化 query。** 证据：`routes/static.js` 的 `DEFAULT_CACHE_CONTROL='no-cache'`；前端资源 URL 已带 `?v=...`，但仍不会长期缓存。

### E. 前端体验、可访问性与 XSS 可维护性

71. **前端大量使用 `innerHTML`，安全依赖开发者逐点 `escapeHtml()`。** 证据：`public/modules/users.js`、`gallery.js`、`prompts.js`、`comic.js` 等大量模板字符串。当前多数做了转义，但后续回归风险高。
72. **通用 Drawer API 默认把字符串当 HTML 注入。** 证据：`public/modules/drawer.js` 的 `open()` / `update()` 对非 Node body 直接 `innerHTML = String(body)`。调用者一旦忘记转义就会引入 XSS。
73. **内联进度条样式使 CSP 很难去掉 `unsafe-inline`。** 证据：`public/modules/profile.js`、`public/modules/users.js` 用 `style="width:${p}%"`；这直接推动 CSP 继续允许 inline style。
74. **个人自定义 API Key 只存在页面内存，刷新后配置看似存在但 Key 丢失。** 证据：`public/modules/profiles.js` 保存时 `stripProfileSecrets()` 清空 Key。设计是安全的，但需要更明显的 UI 提示，避免用户误以为已保存。
75. **队列中的个人 Key 易失性主要在文档/管理 runtime 中说明，普通用户提交时缺少强提示。** 证据：`services/job-queue.js` 暴露 `volatileSecrets: true`；前端提交自定义 Key 任务时未见显式确认。
76. **外部预览 URL 服务端允许 http(s)，但 CSP `img-src` 只允许 https。** 证据：`routes/prompt-square.js` 的 `isAllowedPreviewImageUrl()` 允许 `http://`；`utils/http.js` CSP 是 `img-src 'self' data: blob: https:`。会出现保存成功但前端加载失败。
77. **命名仍混用旧项目名。** 证据：`package.json` name 为 `image-key-manager`，localStorage key 也是 `image-key-manager.*`，但 README/界面是 Image Studio。长期会影响迁移和用户认知。
78. **原生 `<dialog>` 的 fallback 仅设置 `open`，缺少完整 focus trap/aria 兜底。** 证据：`public/modules/dialog.js` 的 `showAndAwait()` 在无 `showModal` 时只 `setAttribute('open','')`。
79. **Clipboard API 复制失败时缺少手动选择文本 fallback。** 证据：`public/modules/dialog.js`、`gallery.js`、`prompts.js` 多处只调用 `navigator.clipboard?.writeText`。
80. **UI 文案全部硬编码中文，缺少 i18n/locale 层。** 证据：HTML/JS/CSS 文案直接写在 `public/` 模块。若后续面向非中文用户或多团队部署，改造成本高。

### F. 配置、部署、CI 与测试治理

81. **配置默认值在 `.env.example`、`docker-compose.yml`、代码之间不一致。** 证据：`CHAT_MAX_COMPLETION_TOKENS` 在 `.env.example`/README 为 6000，`docker-compose.yml` 默认 2000，`utils/config.js` fallback 2000，而 `routes/chat.js` 常量默认 6000。
82. **`MAX_IMAGES_PER_REQUEST` 的代码 fallback 与部署示例不一致。** 证据：`utils/config.js` fallback 是 4，`.env.example`/`docker-compose.yml`/README 都是 1。未加载 `.env` 的本地启动行为会不同。
83. **docker-compose 没有透传所有 `.env.example` 中的资源/生命周期参数。** 证据：compose 环境变量缺少如 `MAX_MULTIPART_BODY_BYTES`、`IMAGE_GENERATION_BATCH_CONCURRENCY`、`MAX_REFERENCE_IMAGES`、`REFERENCE_JOB_FILE_TTL_HOURS`、SQLite/cleanup/rate-limit 扫描参数等。
84. **本地 `npm start` 未读取 `.env`，用户复制 `.env.example` 后仍需 shell 注入或 Docker。** 证据：项目无 dotenv 依赖，`package.json` 直接 `node --experimental-sqlite server.js`。README 需要说明本地环境变量加载方式。
85. **非 production 且未显式配置时，上游私网限制会默认放开。** 证据：`services/upstream.js` 中 `NODE_ENV !== 'production' && ALLOW_PRIVATE_UPSTREAMS !== '0'` 时允许 private upstream。直接 `npm start` 且没加载 `.env` 时与 README“默认限制”认知不同。
86. **CI 只跑 Ubuntu + Node 22 的 `npm test`，没有 Windows/容器矩阵。** 证据：`.github/workflows/test.yml` 只有 `ubuntu-latest` 和单版本 Node 22。当前用户环境是 Windows，路径/编码/文件锁问题可能漏测。
87. **缺少 lint/format/typecheck。** 证据：`package.json` 只有 `start` 和 `test`。大量手写模板字符串、路由、SQL 和配置映射没有静态规则兜底。
88. **缺少覆盖率报告或阈值。** 证据：测试很多，但 `package.json`/CI 未生成 coverage。无法发现关键路径覆盖下降。
89. **缺少浏览器端 E2E/可视化回归测试。** 证据：测试主要为 Node `test/*.test.js`；对真实 DOM、CSP、SSE、文件上传、移动端布局的覆盖有限。
90. **生产镜像基于浮动 tag，未 pin digest。** 证据：`Dockerfile` 使用 `node:22-bookworm-slim`。构建可重复性和供应链审计较弱。
91. **缺少容器/依赖安全扫描。** 证据：GitHub workflow 未见 Trivy/Grype/npm audit 等步骤。虽然当前无第三方 npm 依赖，基础镜像仍需要扫描。
92. **依赖 Node experimental SQLite API，运行时兼容风险较高。** 证据：`package.json` 和 `Dockerfile` 都要求 `--experimental-sqlite`；README 也强调 Node 22.5+。Node 升级可能带来 API/行为变化。
93. **`SECURITY.md` 对“API 与静态文件响应默认带安全头”的表述过于绝对。** 证据：SSE 与 204 响应例外；见问题 8、9。
94. **产品设计文档混合“当前状态”和“未来 SaaS 架构”，容易误导实施优先级。** 证据：`docs/PRODUCT_DESIGN.md` 同时描述当前 Node/SQLite，又列出 Next.js/PostgreSQL/S3/Stripe 等未来方案。
95. **没有自动校验 API 文档与路由实现的一致性。** 证据：已出现多处 API 文档漂移；CI 未包含文档契约测试或 route snapshot。

## 建议优先级

1. **先修文档漂移与配置默认值不一致**：这类问题成本低、影响大，能立刻减少部署和联调误解。
2. **统一安全头覆盖面**：让 SSE、204、所有 405/错误响应都走统一 header helper；同时规划去掉 `unsafe-inline` 的路径。
3. **明确生产启动安全闸**：生产缺少 `IMAGE_STUDIO_SECRET_KEY`、`NODE_ENV=production`、私网上游限制等关键项时至少警告，必要时 fail-fast。
4. **给队列写清边界并防误部署多实例**：在 UI/README/Docker 注明单实例；如要多实例，先做 DB lease 或外部队列。
5. **处理内存峰值路径**：multipart、上游 base64、URL 下载、参考图编辑改成流式或更小默认上限。
6. **拆分大模块与引入 lint/E2E**：优先拆 `public/modules/users.js`、`public/styles.css`、`services/db.js`，并用静态规则约束模板转义、路由、配置。

## 本次未做

- 未执行 `npm test`，因为本任务目标是静态分析并记录问题，且项目指令禁止未经许可执行编译/构建命令。
- 未启动服务、未访问真实上游 API、未修改运行态 `generated/` 数据。
