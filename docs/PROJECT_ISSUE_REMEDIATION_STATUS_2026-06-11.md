# 项目问题修复状态跟踪（2026-06-11）

> 对应原始问题清单：[`docs/PROJECT_ANALYSIS_ISSUES_2026-06-09.md`](PROJECT_ANALYSIS_ISSUES_2026-06-09.md)。
> 口径：本文记录“已修复 / 已降低风险 / 仍未完成”的当前核对结果，不把原始清单改写成完成清单，也不声称所有问题已闭环。

## 当前结论

- **没有全部处理完。** 原始 95 项中，大量安全、文档漂移、配置、测试、队列统计、图库维护和前端模板问题已经通过后续提交修复或显著降低风险。
- **仍需继续处理的主线**：队列横向扩展 / 完整通知模型、同步 SQLite 的架构改造（本轮已补运行时可观测边界）、i18n 全量迁移、完整真实浏览器 E2E / 可视化回归，以及 Prompt Square 等剩余跨响应 payload 预算。
- **问题 67/71 仍是进行中**：前端大模块和 `innerHTML` 模板已经大量拆分到 `*-view.js` 并补了转义测试，但这属于持续治理项，不能按“全部完成”关闭。

## 已闭环或有明确验证证据的项目

| 原始编号 | 当前状态 | 关键证据 |
| --- | --- | --- |
| 2 | 已闭环 | `services/secrets.js` 支持 `reencryptSecret()`；`test/interface-secret-rotation.test.js` 覆盖主密钥轮换。 |
| 3 | 已闭环 | `services/db-sessions.js` 存储 `sid:v1:` 哈希；`test/auth.test.js`、`test/db.test.js` 覆盖旧 session 迁移与隐藏原始 session id。 |
| 4 | 已闭环 | `SESSION_COOKIE_SECURE=1` 可在非 production 强制 Secure；`test/cookies.test.js` 覆盖。 |
| 5、6 | 已闭环 | `middleware/guard.js` 要求 session CSRF token，并比较 scheme + host；`test/guard.test.js` 覆盖。 |
| 7、73 | 已闭环 | CSP 去掉 `unsafe-inline`，内联宽度改为非 inline style；`test/csp.test.js`、`test/frontend-inline-style.test.js` 覆盖。 |
| 8、9、31 | 已闭环 | `openSse()`、`sendNoContent()`、`sendMethodNotAllowed()` 统一安全头 / Allow；`test/sse.test.js`、`test/http.test.js` 覆盖。 |
| 10、11 | 已闭环 | 生产首个管理员需要 bootstrap token；注册冲突错误隐藏；`test/auth-first-admin-production.test.js`、`test/auth.test.js` 覆盖。 |
| 12、64 | 已闭环 | 限流窗口持久化到 SQLite，客户端日志同步有服务端限流；`services/rate-limit.js`、`test/rate-limit.test.js`、`test/client-logs.test.js`。 |
| 13 | 已闭环 | `TRUST_PROXY_ALLOWED_IPS` 限定可信直连代理；`test/request.test.js`、`test/guard.test.js`。 |
| 14、15、16 | 已闭环 | 密码策略、异步登录 / 注册路由、管理员重置后强制改密；`services/password-policy.js`、`test/password-policy.test.js`、`test/auth-async.test.js`、`test/auth.test.js`。 |
| 17 | 已闭环 | 邀请码哈希、过期与 legacy 迁移；`services/registration-guard.js`、`test/registration-guard.test.js`。 |
| 18、70 | 已闭环 | 图库 / 示例图使用可重新校验缓存，带 `?v=` 的静态资产可 immutable 缓存；`routes/static.js`、`test/static.test.js`。 |
| 20 | 已闭环 | 前端日志同步有用户可见开关，关闭后清空待同步队列；`public/modules/logs.js`、`test/frontend-logs.test.js`、`test/logs-view.test.js`。 |
| 21 | 已闭环 | API 前缀匹配改为边界匹配；`utils/route-match.js`、`test/route-match.test.js`。 |
| 22–29、32、95 | 已闭环 | `docs/API.md` 与 route 合同测试对齐；`test/api-docs-contract.test.js` 防止旧路由拼写回归。 |
| 30 | 已闭环 | README / 产品设计中的旧“同步生成”和旧 SSE `events` 路径已改为异步队列语义。 |
| 34 | 已闭环 | `/healthz` 检查 DB、磁盘、队列、事件循环；`services/health.js`、`test/health.test.js`。 |
| 36、37 | 已闭环 | 路由错误状态集中化，上游探活不透传上游状态 / 敏感体；`utils/http.js`、`test/http.test.js`、`test/interface-test-route.test.js`、`test/test-profile.test.js`。 |
| 44–48 | 已闭环 | 队列设置审计、shutdown 标记 running 失败、按 id 查任务、SQLite 聚合统计、running 计入 pending；`test/jobs-route.test.js`、`test/job-queue.test.js`。 |
| 49、50、53 | 已闭环 | `backup:generated` / `restore:generated`、破坏性迁移前 SQLite 备份、系统配置导出 / 导入；`test/generated-backup.test.js`、`test/db.test.js`、`test/system-config.test.js`。 |
| 51、61、66 | 已闭环 | Prompt Square seed 变更可重同步、搜索有 FTS、seed 数据懒加载；`services/db-prompt-square-seed.js`、`services/db-prompt-square.js`、`test/prompt-square.test.js`。 |
| 52 | 已闭环 | 系统默认接口按 image / chat capability 分别 ready；`test/interface-defaults.test.js`。 |
| 54、56、57、59、60、62、63、65 | 已闭环 | multipart 流式解析、URL 图片流式落盘、编辑参考文件复用、图库 / 用户 DB 分页、孤儿扫描上限、详情懒加载、缩略图派生；相关测试见 `test/http.test.js`、`test/gallery-store.test.js`、`test/generate.test.js`、`test/users-route.test.js`。 |
| 72、74、75、76、77、78、79 | 已闭环 | Drawer 字符串默认文本渲染，个人 Key 易失性提示 / 确认，Prompt Square 外部预览限 HTTPS，命名空间迁移，dialog / clipboard fallback；对应 `test/drawer.test.js`、`test/profile-secret-hint.test.js`、`test/volatile-secrets-ui.test.js`、`test/prompt-square.test.js`、`test/dialog.test.js`。 |
| 81–85 | 已闭环 | `.env.example`、compose、代码默认值对齐；本地 `npm start` 自动加载 `.env`；私网上游必须显式 opt-in；`test/docker-compose.test.js`、`test/env-file.test.js`、`test/upstream.test.js`。 |
| 88、90、91 | 已闭环 | coverage gate、Docker base image pin digest、Trivy 扫描；`.github/workflows/test.yml`、`Dockerfile`、`test/docker-compose.test.js`、`test/security-workflow.test.js`。 |
| 93 | 已闭环 | 安全头表述已补充 SSE / 204 等当前响应路径。 |
| 94 | 已闭环 | `docs/PRODUCT_DESIGN.md` 已改为入口页，当前自托管产品说明拆到 `docs/PRODUCT_CURRENT.md`，未来 SaaS / 商业化路线图拆到 `docs/PRODUCT_ROADMAP.md`。 |

## 已降低风险但不应直接关闭的项目

| 原始编号 | 当前状态 | 说明 |
| --- | --- | --- |
| 1 | 部分闭环 | 生产环境无 `IMAGE_STUDIO_SECRET_KEY` 时拒绝保存系统 Key；开发环境仍保留明文兼容，这是显式接受的风险。 |
| 19 | 部分闭环 | 头像 / 外部预览限制为无凭据 HTTPS，并使用 `referrerpolicy="no-referrer"`；但外链图片天然仍会暴露访问方网络信息。 |
| 33 | 部分闭环 | 已增加 `/api/v1/*` 到现有 `/api/*` 的兼容别名，并在 `docs/API.md` 和合同测试中固化；REST 语义 / 资源命名的全面统一仍需单独设计。 |
| 35 | 部分闭环 | 运行时鉴权由 `server.js` 统一兜底，部分 route 仍保留直接调用时的防御式 session 检查。 |
| 38、39 | 部分闭环 | 队列已暴露 runtime 边界并使用原子 claim 降低重复执行风险，但仍不是分布式 worker lease。 |
| 40 | 部分闭环 | 启动时已能将使用系统默认接口的 stale running job 恢复为 queued；个人覆盖 Key 因密钥仅在进程内仍会在重启后标记失败。 |
| 41、42 | 部分闭环 | 个人 Key 不落库，已有普通用户确认与管理 runtime 说明；根因仍是“进程内易失密钥”。 |
| 43 | 部分闭环 | 队列 SSE 已把近期 job / refresh 事件持久化到 SQLite，并支持 `Last-Event-ID` / `?after=` 重连回放；仍不是跨多 worker 的完整通知总线。 |
| 55、58 | 部分闭环 | 上游响应和内存默认值已收紧，URL / 上传路径也更流式；仍需要长期容量压测验证峰值。 |
| 67、71 | 进行中 | 已大量拆 `*-view.js` 并补转义测试，但大前端模块与 HTML 模板治理仍需持续推进。 |
| 69 | 部分闭环 | 审计日志 metadata 与 generation job result / progress 已复用统一 JSON budget helper；client logs 已有接入预算，且客户端日志列表会裁剪超大 meta 并返回长度 / 裁剪标记；Prompt Square 列表只返回裁剪后的 prompt 预览，漫画项目列表只返回故事 / 分镜预览且详情接口保留完整内容；管理员图库列表会裁剪 prompt / revisedPrompt 并返回长度与裁剪标记；系统配置脱敏导出会裁剪超大 value，含密钥的可恢复导出保持完整。剩余零散 JSON 响应仍需持续梳理。 |
| 80 | 部分闭环 | 已建立前端 `i18n` / locale 基础模块，支持消息 key、插值、日期 / 数字 / 时长格式化，并接入队列管理视图的状态 / 时长 / 摘要 / 设置 / 空状态 / 表头 / 操作文案、用户侧队列面板的状态 / 进度 / 元信息 / 空状态 / 摘要 / 操作文案、管理员用户列表视图的角色 / 状态 / 表格 / 分页 / 操作文案、个人接口配置视图的 Key 状态 / 系统默认卡片 / 摘要 / 探活状态文案、图库漫画项目状态 / 进度文案、管理员客户端日志视图的筛选 / 摘要 / 表头 / 空状态 / 客户端时间文案、管理员接口摘要 / Key 状态 / 探活状态文案、管理员注册 / 邀请码视图的模式 / 状态 / 摘要 / 空状态 / 表头 / 操作文案，以及管理员额度视图的默认值卡片、表格、菜单、状态、占位符和用量文案；大量既有页面文案仍需逐步迁移。 |
| 86、87 | 部分闭环 | CI 已有 Windows、`check:js`、coverage；尚无完整 lint / typecheck / 容器矩阵。 |
| 89 | 部分闭环 | 已新增无第三方依赖的真实浏览器 smoke：`npm run e2e:smoke` 会通过 Chrome / Edge / Chromium DevTools 打开 `/login.html` 并验证真实 DOM；设置 `E2E_USERNAME` / `E2E_PASSWORD` 后还会提交真实登录表单、校验主应用 shell，并逐个切换主要 tab；脚本已支持可选截图目录、截图 manifest 与 SHA-256 baseline 校验；`docs/E2E.md` 记录运行方式。仍缺感知型 / 阈值型视觉 diff。 |
| 92 | 部分闭环 | 已有 Node 运行时预检与测试，但依赖 `node:sqlite` experimental 的根风险仍存在。 |

## 仍未完成或属于架构 / 产品化决策的问题

| 原始编号 | 当前状态 | 下一步建议 |
| --- | --- | --- |
| 68 | 部分治理，仍需架构改造 | 已在 `/healthz` 的 `db.runtime` 暴露 `node:sqlite DatabaseSync`、`blocking`、`workerOffloaded`、`busyTimeoutMs`、`walAutocheckpointPages`，并在部署文档中要求同时监控 `eventLoop.lagMs`；真正消除同步 SQL 对事件循环的阻塞仍需要 worker thread、异步 DB 层或外部数据库方案。 |

## 本次更新的验证方式

- `npm run check:js`
- `node --experimental-sqlite --test test\health.test.js`
- `node --experimental-sqlite --test test\comic-projects.test.js`
- `node --experimental-sqlite --test test\gallery-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\admin-client-logs-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\admin-interfaces-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\admin-registration-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\admin-quota-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\admin-jobs-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\jobs-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\users-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\profiles-view.test.js test\i18n.test.js`
- `node --experimental-sqlite --test test\e2e-smoke-script.test.js`
- `node --experimental-sqlite --test test\gallery-store.test.js test\admin-gallery-view.test.js`
- `node --experimental-sqlite --test test\client-logs.test.js`
- `git diff --check`
- `npm test`
- 建议后续继续按“一个问题 / 一类问题一个提交”的方式推进，并在关闭目标前逐项复核原始 95 项与当前代码 / 测试证据。
