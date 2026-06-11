# 项目问题修复状态跟踪（2026-06-11）

> 对应原始问题清单：[`docs/PROJECT_ANALYSIS_ISSUES_2026-06-09.md`](PROJECT_ANALYSIS_ISSUES_2026-06-09.md)。
> 口径：本文记录“已修复 / 已降低风险 / 仍未完成”的当前核对结果，不把原始清单改写成完成清单，也不声称所有问题已闭环。

## 当前结论

- **没有全部处理完。** 原始 95 项中，大量安全、文档漂移、配置、测试、队列统计、图库维护和前端模板问题已经通过后续提交修复或显著降低风险。
- **仍需继续处理的主线**：队列横向扩展 / 订阅状态、同步 SQLite 的事件循环阻塞、i18n、真实浏览器 E2E / 可视化回归、产品设计文档中未来 SaaS 架构与当前自托管形态的拆分。
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

## 已降低风险但不应直接关闭的项目

| 原始编号 | 当前状态 | 说明 |
| --- | --- | --- |
| 1 | 部分闭环 | 生产环境无 `IMAGE_STUDIO_SECRET_KEY` 时拒绝保存系统 Key；开发环境仍保留明文兼容，这是显式接受的风险。 |
| 19 | 部分闭环 | 头像 / 外部预览限制为无凭据 HTTPS，并使用 `referrerpolicy="no-referrer"`；但外链图片天然仍会暴露访问方网络信息。 |
| 35 | 部分闭环 | 运行时鉴权由 `server.js` 统一兜底，部分 route 仍保留直接调用时的防御式 session 检查。 |
| 38、39 | 部分闭环 | 队列已暴露 runtime 边界并使用原子 claim 降低重复执行风险，但仍不是分布式 worker lease。 |
| 41、42 | 部分闭环 | 个人 Key 不落库，已有普通用户确认与管理 runtime 说明；根因仍是“进程内易失密钥”。 |
| 55、58 | 部分闭环 | 上游响应和内存默认值已收紧，URL / 上传路径也更流式；仍需要长期容量压测验证峰值。 |
| 67、71 | 进行中 | 已大量拆 `*-view.js` 并补转义测试，但大前端模块与 HTML 模板治理仍需持续推进。 |
| 86、87 | 部分闭环 | CI 已有 Windows、`check:js`、coverage；尚无完整 lint / typecheck / 容器矩阵。 |
| 92 | 部分闭环 | 已有 Node 运行时预检与测试，但依赖 `node:sqlite` experimental 的根风险仍存在。 |

## 仍未完成或属于架构 / 产品化决策的问题

| 原始编号 | 当前状态 | 下一步建议 |
| --- | --- | --- |
| 33 | 未完成 | 若要统一 REST 风格，需要兼容旧前端 / 脚本，建议另开 API versioning 任务。 |
| 40、43 | 未完成 | running job 重启恢复与 SSE 订阅持久化需要更完整的 worker / 通知模型。 |
| 68 | 未完成 | `DatabaseSync` 阻塞事件循环的问题需要 worker thread、异步 DB 层或外部数据库方案。 |
| 69 | 未完成 | 需要统一跨表 / 跨响应 payload budget 与审计策略。 |
| 80 | 未完成 | i18n / locale 层尚未建立。 |
| 89 | 未完成 | 仍缺真实浏览器 E2E / 视觉回归。 |
| 94 | 未完成 | `docs/PRODUCT_DESIGN.md` 仍混合当前自托管与未来 SaaS / 商业化设想，后续应拆成“当前产品说明”和“未来路线图”。 |

## 本次更新的验证方式

- 本次为文档和状态跟踪更新；没有启动服务、没有运行构建命令。
- 建议后续继续按“一个问题 / 一类问题一个提交”的方式推进，并在关闭目标前逐项复核原始 95 项与当前代码 / 测试证据。
