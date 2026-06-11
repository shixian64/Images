# Image Studio · 当前自托管产品说明

> 阅读口径：本文只描述当前仓库已经落地或运行时明确支持的自托管能力，不承诺未来 SaaS / 商业化功能。未来路线图见 [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md)。
> 更新时间：2026-06-11

## 1. 当前定位

Image Studio 当前是一个依赖较轻的 Node.js 自托管图片生成工作站，面向个人和小团队：

- 使用 OpenAI-compatible 图片生成接口和 Chat Completions 接口。
- 支持用户登录、管理员后台、额度控制、异步生成队列、图库、Prompt Square、提示词工作流和漫画工作流。
- 默认运行形态是单进程 Node.js + SQLite + 本地 `generated/` 文件存储。
- 适合局域网、个人 VPS、内网小团队或受控自托管环境；不是已完成的多租户 SaaS。

## 2. 已落地能力

### 2.1 账号、权限与管理

- 注册 / 登录 / session。
- 普通用户与管理员角色。
- 本地开发环境首个注册用户自动成为管理员。
- 生产环境首个管理员需要 bootstrap token，除非显式关闭。
- 关闭注册、公开注册、邀请码注册和邀请兑换记录。
- 管理员用户管理、密码重置、禁用 / 启用用户、额度配置。

### 2.2 生成链路

- 图片生成请求异步入队。
- 队列支持 queued / running / succeeded / failed / timeout / cancelled 等状态。
- 支持 SSE 进度、任务取消、重试、优先级和管理员队列设置。
- 支持单用户并发、全局并发和队列容量限制。
- 支持系统默认接口与用户一次性自带 Key 两种模式；用户个人 Key 仅保存在进程内存，不落库。

### 2.3 图片、图库与参考图

- 生成图片保存到 `generated/`。
- 用户图库、公开图库、点赞、管理员图库统计、批量删除和孤儿扫描。
- 支持参考图上传、剪贴板 / 文件输入、图库图片作为编辑参考。
- 参考图会被暂存到 job 目录，并由 TTL 清理。

### 2.4 提示词与漫画工作流

- Prompt Builder 与提示词历史。
- Prompt Square：公开提示词、标签、示例图、使用计数。
- 提示词示例图上传与安全预览 URL 过滤。
- 漫画故事分析、分镜生成、风格模板和逐格图片生成。

### 2.5 运维与安全边界

- SQLite schema migration。
- 审计日志、客户端日志、用量日聚合和运行态清理。
- CSRF 防护、登录 / 注册 / Chat 限流。
- 上游 URL 安全校验，默认拒绝不安全 HTTP、私网 / localhost 上游，除非显式允许。
- 请求体、上传文件、上游响应和外部下载大小限制。
- 日志、审计 metadata、客户端日志和 job result / progress 的敏感信息脱敏或体积预算。
- Docker 自托管基础配置：持久化卷、健康检查、资源限制和只读根文件系统。

## 3. 当前运行时边界

| 维度 | 当前事实 |
| --- | --- |
| 进程模型 | 单 Node.js 进程，内置调度器执行队列。 |
| 数据库 | Node `DatabaseSync` + SQLite，启用 WAL。 |
| 文件存储 | 本地 `generated/`，包含 SQLite、WAL、图片、示例图、临时参考图和用户数据。 |
| 队列 | SQLite 持久化 job，单进程 worker；不是分布式 lease / worker 集群。 |
| 实时通知 | SSE 连接只覆盖当前在线订阅；没有跨进程持久通知总线。 |
| 密钥 | 系统默认 Key 可用 `IMAGE_STUDIO_SECRET_KEY` 加密落库；用户个人 Key 只在当前进程内暂存。 |
| 多租户 | 没有 workspace / organization 模型。 |
| 计费 | 没有支付、订阅、账单或成本分摊。 |
| 对象存储 | 没有 S3/R2/CDN 生产链路。 |

## 4. 非当前能力

以下内容属于未来路线图或商业化设想，不能作为当前版本能力验收：

- 多租户 Workspace / Organization。
- PostgreSQL、Redis、BullMQ/SQS 或横向 worker 集群。
- S3/R2/CDN 对象存储、短时签名 URL 和独立缩略图管线。
- KMS/Vault 级平台密钥系统、团队共享密钥、密钥版本和销毁审计。
- Stripe / 支付订阅 / 发票 / 企业账单。
- 企业 SSO、SCIM、IP allowlist、合规数据保留策略。
- 内容审核流程、投诉处置、公开分享审核。
- 真实浏览器 E2E / 视觉回归测试矩阵。

## 5. 相关文档

- API 合约：[`API.md`](API.md)
- 部署、备份、恢复与容量规划：[`DEPLOYMENT.md`](DEPLOYMENT.md)
- 系统默认 API Key 存储决策：[`API_KEY_STORAGE_DECISION.md`](API_KEY_STORAGE_DECISION.md)
- 未来路线图与商业化设计：[`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md)
- 项目问题原始审计快照：[`PROJECT_ANALYSIS_ISSUES_2026-06-09.md`](PROJECT_ANALYSIS_ISSUES_2026-06-09.md)
- 问题修复状态：[`PROJECT_ISSUE_REMEDIATION_STATUS_2026-06-11.md`](PROJECT_ISSUE_REMEDIATION_STATUS_2026-06-11.md)
