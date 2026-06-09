# Image Studio [![LINUX DO](https://img.shields.io/badge/LINUX%20DO-%E7%A4%BE%E5%8C%BA%E8%AE%A4%E5%8F%AF-FFB003?style=for-the-badge&logo=discourse&logoColor=white)](https://linux.do/)

Image Studio 是一个依赖极少的本地 / 自托管 Web 工作站，用于管理 OpenAI-compatible 图片生成与对话接口、提交图片生成任务、管理用户额度和本地图库。当前实现基于 Node.js 原生 HTTP、SQLite、浏览器端 ES Modules 与本地文件存储，默认运行在 `http://localhost:8787`。

完整商业化演进方案见 [`docs/PRODUCT_DESIGN.md`](docs/PRODUCT_DESIGN.md)；系统默认 API Key 的当前存储决策见 [`docs/API_KEY_STORAGE_DECISION.md`](docs/API_KEY_STORAGE_DECISION.md)。

本项目采用 MIT License 完整开源，感谢 [LINUX DO](https://linux.do/) 社区对开源项目推广与交流的支持。

## 当前状态

- **运行形态**：单进程 Node.js 服务 + SQLite + `generated/` 本地持久化目录。
- **用户模型**：支持注册、登录、session、普通用户与管理员角色。
- **管理能力**：管理员可管理用户、额度、生成队列、客户端日志、系统默认接口和图库。
- **生成能力**：支持异步入队提交、SSE/队列进度、参考图编辑、多图拆分、任务重试/取消。
- **提示词能力**：支持 Prompt Builder、历史、提示词广场、示例图上传与漫画分镜工作流。
- **部署定位**：适合个人、本地或小团队自托管；如作为公网 SaaS，需要先升级密钥存储、对象存储、审计和多租户边界。

## 运行

```bash
cp .env.example .env
# 按需修改 .env；生产空库首次初始化请设置 ADMIN_BOOTSTRAP_TOKEN
npm start       # node --experimental-sqlite server.js，默认 http://localhost:8787
npm test        # Node 原生 test runner，零外部依赖
```

> 注意：`docker compose` 会自动读取项目根目录的 `.env`，但本地 `npm start` 不会自动加载 `.env`（项目未引入 `dotenv`）。本地直跑前请先把需要的变量导入当前 shell，例如：
>
> PowerShell:
>
> ```powershell
> Get-Content .env | Where-Object { $_ -match '^\s*[A-Z0-9_]+=' } | ForEach-Object {
>   $name, $value = $_.Split('=', 2)
>   Set-Item "Env:$name" $value
> }
> npm start
> ```
>
> Bash / zsh:
>
> ```bash
> set -a
> . ./.env
> set +a
> npm start
> ```

要求：

- Node.js `>=22.5.0`
- 启动需带 `--experimental-sqlite`（`npm start` 已配置）
- 项目无第三方运行依赖，主要使用内置 `fetch` / `http` / `node:test` / `node:sqlite`

> 本仓库没有独立构建步骤。除非任务明确要求，不需要运行构建/编译命令。

## 首次管理员与注册策略

首次管理员初始化按运行环境区分：

- 本地 / 开发环境（`NODE_ENV` 不是 `production`）仍保留低门槛体验：空库首次注册会自动创建管理员账号。
- 生产环境（`NODE_ENV=production`）默认要求设置 `ADMIN_BOOTSTRAP_TOKEN`，并在注册页填写该令牌才能创建首个管理员，避免公网首启窗口被抢占。
- 如果确认部署只暴露在可信内网，且需要保留旧行为，可显式设置 `ALLOW_FIRST_ADMIN_WITHOUT_TOKEN=1`；公网部署不建议启用。

为兼容旧部署，如果数据库里已有普通用户但没有活跃管理员，仍可设置 `ADMIN_BOOTSTRAP_TOKEN` 并在注册页填写该令牌来初始化管理员。

注册默认关闭：

```env
REGISTRATION_MODE=closed
ADMIN_BOOTSTRAP_TOKEN=
ALLOW_FIRST_ADMIN_WITHOUT_TOKEN=0
```

可选注册模式：

- `REGISTRATION_MODE=closed`：关闭公开注册；本地 / 开发空库首个注册账号仍可自动成为 admin，生产空库首个管理员需 `ADMIN_BOOTSTRAP_TOKEN`（除非显式设置 `ALLOW_FIRST_ADMIN_WITHOUT_TOKEN=1`）。
- `REGISTRATION_MODE=invite`：自助注册必须填写 `REGISTRATION_INVITE_CODE` 或 `REGISTRATION_INVITE_CODES`。
- `REGISTRATION_MODE=open`：允许公开注册，但仍启用 IP 限频、邮箱域策略和蜜罐字段。

防刷相关：

- `REGISTRATION_IP_MAX_PER_10MIN` / `REGISTRATION_IP_MAX_PER_DAY`：注册 IP 限频。
- `SIGNUP_IP_DAILY_LIMIT` / `SIGNUP_IP_MONTHLY_LIMIT`：同一注册 IP 下普通账号共享系统默认接口额度池。
- `REGISTRATION_EMAIL_DOMAIN_ALLOWLIST` / `REGISTRATION_EMAIL_DOMAIN_BLOCKLIST`：邮箱域名放行 / 拒绝。
- `LOGIN_IP_RATE_LIMIT_MAX_PER_MINUTE` / `LOGIN_ACCOUNT_RATE_LIMIT_MAX_PER_MINUTE` / `LOGIN_PAIR_RATE_LIMIT_MAX_PER_MINUTE`：登录防爆破。
- 密码策略：最小 8 位、拒绝常见弱密码、拒绝包含用户名 / 邮箱本地部分，改密时不能复用原密码。
- `TRUST_PROXY=1` 仅应在可信反向代理会清洗转发头时启用，并用 `TRUST_PROXY_ALLOWED_IPS` 限定直连代理来源。

## 功能概览

### 生成页（Studio）

- 模型、prompt、size、quality、output format、`n` 参数。
- Prompt 草稿和生成参数持久化，刷新后可恢复。
- Prompt Assist：调用对话接口优化提示词。
- 手动提示词 / 优化后提示词切换。
- 参考图上传或从图库选择，支持图片编辑场景。
- 生成任务进入队列，支持进度展示、取消、重试和结果保留。
- 生成成功后自动保存到当前用户图库 `generated/users/<uid>/images`，元数据写入 SQLite。

### 漫画工作流

- 输入故事梗概，按页数上限自动决定实际分镜页数，并规划每页分镜格数与页面内容。
- 内置彩色条漫、韩漫、黑白日漫、水墨国风、美漫动作等风格模板。
- 分镜结果可人工调整每页格数、每页内容和生图提示词，再逐页/逐格提交图片生成任务。
- 生成结果可进入图库，并可把分镜提示词保存到提示词历史。

### 提示词管理（Prompt OS）

- Prompt Builder：按主体、风格、构图、光线、配色、文字、负面提示词结构化拼装。
- Prompt 历史：保存、固定、搜索、导出、复用。
- Prompt Square：浏览公开提示词，按时间范围 / 标签筛选，复制或一键使用。
- 用户可从历史提示词发布到广场，也可删除自己发布的条目。
- 示例图上传：支持 PNG / JPEG / WebP，复用用户存储配额和路径防护；外部预览图仅保留无凭据的 HTTPS URL。

### 图库（Gallery）

- “我的图库 / 公开图库”切换。
- 用户可公开或取消公开自己的图片。
- 公开图库支持点赞；默认每个用户每日最多点赞 10 次，可通过 `PUBLIC_GALLERY_DAILY_LIKE_LIMIT` 调整。
- 支持刷新、打开原图、下载和删除自己的图片。
- 管理员可查看图库统计、筛选、批量删除和扫描孤儿文件。

### 配置（Profiles / 接口）

- 用户侧支持本地接口配置：生图接口与对话接口分别填写 Base URL、API Key、默认模型。
- API Key 不持久化到浏览器 localStorage；队列任务只在当前 Node 进程内临时持有个人 Key。
- 管理员可配置系统默认接口，普通用户可继承默认接口使用。
- 连通性测试调用各自上游 `/v1/models`，返回模型数量、模型 ID 摘要、耗时或错误详情。

### 日志

- 浏览器本地保留最近 300 条日志。
- 前端日志可上报到服务端，管理员可在“客户端详细日志”中查看；日志面板提供“服务端同步”开关，关闭后新日志只保留在当前浏览器，并清空待同步队列。
- 上报内容包含脱敏后的消息、meta、trace id，以及页面 URL、User-Agent、语言、窗口尺寸等诊断上下文。
- 支持等级筛选、关键词搜索、导出 JSON、清空和复制单条 JSON。
- API Key、Authorization、Cookie 等敏感字段会脱敏。

### 管理后台

仅管理员可见，包含：

- 用户管理：创建、编辑、禁用、删除用户，查看用户详情、审计、任务和客户端日志。
- 额度管理：全局默认额度、单用户额度覆盖、批量编辑、重置今日 / 本月用量；系统默认接口调用会计入日/月次数，并单独展示提示词优化次数。
- 队列调度：查看所有生成任务，调整队列设置、取消任务、修改优先级。
- 客户端日志：查看前端上报的详细日志。
- 接口管理：配置系统默认生图 / 对话接口并测试连通性。
- 图库管理：统计、筛选、批量删除和孤儿文件扫描。

## Base URL 规则

- OpenAI 官方：`https://api.openai.com`
- 兼容网关：填根地址或带 `/v1` 均可；服务端会按用途规范化为 `/v1/images/generations`、`/v1/chat/completions` 或 `/v1/models`。
- 生产安全默认值：上游必须是 HTTPS，并阻止 localhost、私网、link-local、metadata 类地址。
- 仅隔离开发环境可显式设置 `ALLOW_INSECURE_UPSTREAMS=1`、`ALLOW_PRIVATE_UPSTREAMS=1` 放开限制。

## 目录结构

```text
server.js                 # HTTP server、session、CSRF、路由分发、静态文件
middleware/
  guard.js                # 鉴权、管理员权限、CSRF
  session.js              # session cookie 挂载
routes/
  auth.js                 # /api/auth/* 注册、登录、退出、当前用户
  users.js                # /api/users* 管理员用户管理
  profile.js              # /api/profile 当前用户资料与密码
  quota.js                # /api/quota/me 与 /api/admin/quota/*
  interfaces.js           # /api/interfaces/default 与 /api/admin/interfaces/default
  generate.js             # /api/generate、/api/generate/stream、生成配置
  jobs.js                 # /api/jobs* 与 /api/admin/jobs* 队列、SSE、取消、重试
  chat.js                 # /api/chat Prompt Assist / 对话代理
  gallery.js              # /api/gallery 当前用户与公开图库
  admin-gallery.js        # /api/admin/gallery* 管理员图库管理
  prompt-square.js        # /api/prompt-square 提示词广场
  prompt-examples.js      # /api/prompt-examples 示例图上传
  client-logs.js          # /api/client-logs 与 /api/admin/client-logs
  test-profile.js         # /api/test-profile 个人接口探活
  static.js               # public、/shared、/gallery-files、/prompt-example-files
services/
  db.js                   # SQLite schema、迁移、表访问封装
  auth.js                 # 密码哈希、登录、注册、session
  registration-guard.js   # 注册模式、邀请码、IP 限频、邮箱域策略
  quota.js                # 默认额度、用户额度、用量、并发槽位
  job-queue.js            # 持久化生成队列、SSE 订阅、重试/取消
  image-generation.js     # 生成任务准备、同步/流式响应
  upstream.js             # URL 规范化、安全校验、上游请求
  reference-images.js     # 参考图上传、校验、临时文件
  gallery-store.js        # 图片保存、公开图库、点赞、统计、清理
  prompt-example-images.js# 提示词示例图存储
  interface-defaults.js   # 系统默认接口配置
  client-logs.js          # 前端日志入库、查询、脱敏
  maintenance.js          # session / 日志 / 用量生命周期清理
utils/
  config.js, http.js, logger.js, mask.js, request.js, request-context.js, sse.js
shared/
  constants.js            # 前后端共享尺寸、质量、模型等常量
  comic-workflow.js       # 漫画分镜与风格模板
  redaction.js            # 前后端共享脱敏规则
public/
  index.html, login.html, styles.css, app.js, favicon.svg
  modules/                # auth、nav、studio、comic、prompts、gallery、jobs、users 等前端模块
generated/                # 运行时数据：SQLite、WAL、用户图片、临时参考图；已 gitignore
test/                     # node:test 用例
docs/                     # 产品、安全与决策文档
```

## API 快览

所有 `/api/*` 非 GET 请求都需要 CSRF 保护：`X-Requested-With: fetch`，且 `Origin` / `Referer` 必须同源。已登录 session 的非安全方法还需要携带 `/api/auth/me`、登录或注册响应返回的 `csrfToken`（`X-CSRF-Token`）。除 `/api/auth/*` 外，业务接口都要求已登录。

| 路径 | 说明 |
| --- | --- |
| `POST /api/auth/register` | 注册；本地 / 开发空库首个账号自动成为管理员，生产空库首个管理员需 bootstrap token |
| `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/me` | 登录、退出、当前用户 |
| `GET/PATCH /api/profile`、`POST /api/profile/password` | 当前用户资料与密码 |
| `GET /api/quota/me` | 当前用户额度与用量 |
| `POST /api/chat` | 对话 / Prompt Assist |
| `GET /api/generate/config`、`POST /api/generate`、`POST /api/generate/stream` | 生成配置、入队生成、流式生成 |
| `GET /api/jobs`、`GET /api/jobs/stream`、`GET /api/jobs/:id`、`POST /api/jobs/:id/cancel`、`POST /api/jobs/:id/retry` | 用户任务队列 |
| `GET /api/gallery`、`POST /api/gallery/:id/visibility`、`POST /api/gallery/:id/like`、`DELETE /api/gallery/:id` | 用户 / 公开图库 |
| `GET /api/interfaces/default` | 系统默认接口摘要 |
| `POST /api/test-profile` | 个人接口连通性测试 |
| `POST /api/prompt-examples` | 上传提示词示例图 |
| `GET/POST /api/prompt-square`、`GET/DELETE /api/prompt-square/:id`、`POST /api/prompt-square/:id/use` | 提示词广场 |
| `/api/admin/*` | 管理员接口：用户、额度、队列、日志、接口、图库 |

## Docker 部署

项目提供 `Dockerfile`、`.dockerignore`、`docker-compose.yml` 与 `.env.example`。运行时数据写入容器内 `/app/generated`，compose 默认使用命名卷 `image-studio-generated` 持久化 SQLite 数据库、WAL 文件和生成图片。

```bash
cp .env.example .env
# 按需修改 .env；生产空库首次初始化请设置 ADMIN_BOOTSTRAP_TOKEN
# 由部署者按需构建/启动镜像：docker compose up -d --build
```

访问：

```text
http://localhost:8787
```

`.env.example` 默认 `NODE_ENV=development` 以支持 HTTP 直连；如果放到 HTTPS 反向代理后面，请设置 `NODE_ENV=production`，或显式设置 `SESSION_COOKIE_SECURE=1`，以便 session cookie 带 `Secure`。

健康检查：

```text
GET /healthz
```

## 环境变量

常用变量见 `.env.example`，下表按用途归类。留空或非法值通常会回退到代码默认值；部分限额变量支持 `0` / `disabled` 表示关闭。

### 基础与 Docker

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | Node 服务监听端口；Docker 内固定为 `8787`。 |
| `HOST_PORT` | `8787` | Docker 宿主机暴露端口。 |
| `NODE_ENV` | `development` | `production` 时 session cookie 会带 `Secure`，且空库首个管理员默认要求 `ADMIN_BOOTSTRAP_TOKEN`。 |
| `SESSION_COOKIE_SECURE` | `0` | 设为 `1` 可在非 production 环境强制 session cookie 带 `Secure`，适合 HTTPS 反代但不想改变 `NODE_ENV` 的部署。 |
| `IMAGE_STUDIO_SECRET_KEY` | 空 | 系统默认接口 API Key 的本地加密主密钥；生产环境必须设置长随机值才能保存系统 Key。 |
| `ALLOW_PLAINTEXT_SYSTEM_KEYS` | `0` | 仅在生产环境显式设为 `1` 时允许系统默认 API Key 明文落库；公网部署不建议启用。 |
| `NODE_OPTIONS` | `--max-old-space-size=512` | V8 heap 上限。 |
| `CONTAINER_MEMORY_LIMIT` | `768m` | Docker 容器内存上限。 |
| `CONTAINER_CPUS` | `1.25` | Docker 容器 CPU 上限。 |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | 优雅关闭等待时间。 |

### 请求与上游边界

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAX_JSON_BODY_BYTES` | `1048576` | JSON body 最大字节数。 |
| `MAX_MULTIPART_BODY_BYTES` | `104857600` | multipart body 最大字节数。 |
| `MAX_UPSTREAM_RESPONSE_BYTES` | `67108864` | 单次上游响应读取上限。 |
| `ALLOW_INSECURE_UPSTREAMS` | `0` | 是否允许 HTTP 上游。 |
| `ALLOW_PRIVATE_UPSTREAMS` | `0` | 是否允许 localhost / 私网 / metadata 等上游。 |
| `TRUST_PROXY` | `0` | 是否信任转发头。仅在可信反代后启用。 |
| `TRUST_PROXY_ALLOWED_IPS` | `127.0.0.1,::1` | 启用 `TRUST_PROXY` 后允许信任的直连代理 IP，支持 IPv4 CIDR。 |
| `TRUST_FORWARDED_HEADERS` | `0` | `TRUST_PROXY` 的兼容别名。 |
| `TEST_PROFILE_TIMEOUT_MS` | `30000` | `/v1/models` 探活超时。 |

### 生成、参考图与队列

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAX_IMAGES_PER_REQUEST` | `1` | 单次生成最大 `n`。 |
| `IMAGE_GENERATION_BATCH_CONCURRENCY` | `2` | `n>1` 时拆分请求的单任务内并发。 |
| `GLOBAL_CONCURRENT_GENERATIONS` | `4` | 全站同时生图任务上限。 |
| `IMAGE_GENERATION_TIMEOUT_MS` | `600000` | 上游生图超时。 |
| `GENERATE_STREAM_HEARTBEAT_MS` | `15000` | SSE 心跳间隔。 |
| `IMAGE_DOWNLOAD_TIMEOUT_MS` | `60000` | 上游 URL 图片下载超时。 |
| `MAX_IMAGE_DOWNLOAD_BYTES` | `26214400` | URL 图片最大下载大小。 |
| `MAX_REFERENCE_IMAGES` | `4` | 单次参考图数量上限。 |
| `MAX_REFERENCE_IMAGE_BYTES` | `20971520` | 单张参考图大小上限。 |
| `MAX_REFERENCE_IMAGE_TOTAL_BYTES` | `83886080` | 单次参考图总大小上限。 |
| `REFERENCE_JOB_FILE_TTL_HOURS` | `24` | 参考图临时目录保留时间。 |

### 额度与图库

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEFAULT_DAILY_LIMIT` | `10` | 普通用户每日系统默认接口调用额度（含生图 / 提示词优化）。 |
| `DEFAULT_MONTHLY_LIMIT` | `200` | 普通用户每月系统默认接口调用额度（含生图 / 提示词优化）。 |
| `DEFAULT_STORAGE_LIMIT_MB` | `500` | 普通用户本地图库存储上限。 |
| `DEFAULT_CONCURRENT_LIMIT` | `1` | 普通用户单用户并发生图上限。 |
| `SIGNUP_IP_DAILY_LIMIT` | `20` | 同注册 IP 每日共享额度池。 |
| `SIGNUP_IP_MONTHLY_LIMIT` | `400` | 同注册 IP 每月共享额度池。 |
| `PUBLIC_GALLERY_DAILY_LIKE_LIMIT` | `10` | 每用户每日公开图库点赞次数。 |
| `GALLERY_STAT_CONCURRENCY` | `16` | 图库文件统计并发。 |
| `GALLERY_MAINTENANCE_SCAN_PAGE_SIZE` | `500` | 图库维护扫描分页大小。 |

### 注册、登录与限流

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ADMIN_BOOTSTRAP_TOKEN` | 空 | 生产空库初始化首个管理员所需令牌；也可作为旧部署兼容令牌，在已有普通用户但没有活跃管理员时初始化管理员。 |
| `ALLOW_FIRST_ADMIN_WITHOUT_TOKEN` | `0` | 仅在生产环境显式设为 `1` 时允许空库首个注册账号无令牌成为管理员；公网部署不建议启用。 |
| `ADMIN_BOOTSTRAP_IP_MAX_PER_10MIN` | 继承注册 10 分钟限额 | 管理员初始化令牌尝试限频（仅使用令牌时生效）。 |
| `ADMIN_BOOTSTRAP_IP_WINDOW_MS` | `600000` | 管理员初始化限频窗口。 |
| `REGISTRATION_MODE` | `closed` | 注册模式：`closed` / `invite` / `open`。 |
| `REGISTRATION_INVITE_CODE` / `REGISTRATION_INVITE_CODES` | 空 | 自助注册邀请码，支持单个或多个。 |
| `REGISTRATION_IP_MAX_PER_10MIN` | `3` | 注册 IP 10 分钟限额。 |
| `REGISTRATION_IP_MAX_PER_DAY` | `5` | 注册 IP 每日限额。 |
| `REGISTRATION_IP_WINDOW_MS` | `600000` | 注册短窗口时长。 |
| `REGISTRATION_IP_DAY_WINDOW_MS` | `86400000` | 注册日窗口时长。 |
| `REGISTRATION_EMAIL_DOMAIN_ALLOWLIST` | 空 | 邮箱域名白名单。 |
| `REGISTRATION_EMAIL_DOMAIN_BLOCKLIST` | 空 | 邮箱域名黑名单。 |
| `LOGIN_IP_RATE_LIMIT_MAX_PER_MINUTE` | `20` | 登录 IP 每分钟限额。 |
| `LOGIN_ACCOUNT_RATE_LIMIT_MAX_PER_MINUTE` | `8` | 登录账号每分钟限额。 |
| `LOGIN_PAIR_RATE_LIMIT_MAX_PER_MINUTE` | `5` | 登录 IP+账号每分钟限额。 |
| `RATE_LIMIT_MAX_KEYS` | `10000` | 内存限流 key 上限。 |
| `RATE_LIMIT_CLEANUP_INTERVAL_MS` | `60000` | 限流清理间隔。 |

### 对话 / Prompt Assist

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CHAT_RATE_LIMIT_MAX_PER_MINUTE` | `20` | `/api/chat` 每用户与每 IP 每分钟上限。 |
| `CHAT_RATE_LIMIT_WINDOW_MS` | `60000` | `/api/chat` 限频窗口。 |
| `CHAT_GLOBAL_CONCURRENT_REQUESTS` | `4` | 全站同时对话请求上限。 |
| `CHAT_MAX_MESSAGES` | `12` | 单次最大 messages 条数。 |
| `CHAT_MAX_INPUT_CHARS` | `12000` | 单次输入字符上限。 |
| `CHAT_DEFAULT_MAX_COMPLETION_TOKENS` | `1200` | 默认输出 token 上限。 |
| `CHAT_MAX_COMPLETION_TOKENS` | `6000` | 输出 token 封顶；需覆盖漫画页分镜 JSON（前端默认请求 5200）。 |
| `CHAT_COMPLETION_TIMEOUT_MS` | `180000` | 上游对话超时。 |

### SQLite 与数据生命周期

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SQLITE_BUSY_TIMEOUT_MS` | `5000` | SQLite busy timeout。 |
| `SQLITE_WAL_AUTOCHECKPOINT_PAGES` | `1000` | WAL 自动 checkpoint 页数。 |
| `DATA_CLEANUP_INTERVAL_MS` | `3600000` | 后台清理间隔；`0` 可关闭周期清理。 |
| `AUDIT_LOG_RETENTION_DAYS` | `180` | 审计日志保留天数。 |
| `CLIENT_LOG_RETENTION_DAYS` | `30` | 客户端日志保留天数。 |
| `USAGE_DAILY_RETENTION_DAYS` | `400` | 日用量聚合保留天数。 |

### Prompt 示例图

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAX_PROMPT_EXAMPLE_IMAGE_BYTES` | `10485760` | 单张提示词示例图大小上限。 |

## 数据与安全边界

- `generated/` 是敏感运行时目录，包含 SQLite 数据库、WAL、用户图片、示例图和临时参考图；不要提交到 Git。
- 系统默认 API Key 设置 `IMAGE_STUDIO_SECRET_KEY` 后会加密存入 SQLite；生产环境未配置主密钥时默认拒绝保存系统 Key（除非显式 `ALLOW_PLAINTEXT_SYSTEM_KEYS=1`）；详见 [`docs/API_KEY_STORAGE_DECISION.md`](docs/API_KEY_STORAGE_DECISION.md)。
- 个人接口 API Key 不写入 localStorage；队列任务只在当前 Node 进程内临时持有。
- 上游请求默认只允许 HTTPS + 公网地址，并对 DNS rebinding / TOCTOU 做防护。
- 头像 URL 仅接受无凭据的 HTTPS 地址；外部图片渲染默认不发送 Referer。
- 静态文件、图库文件和示例图文件走路径防护，避免越权读取。
- Docker compose 默认只读根文件系统，并仅持久化 `/app/generated`。

更多安全说明见 [`SECURITY.md`](SECURITY.md)。

## 测试

```bash
npm test
```

测试使用 `node:test`，覆盖 auth、注册防刷、quota、job queue、gallery、prompt square、prompt 示例图、HTTP 边界、上游 URL 安全、日志脱敏、SQLite 生命周期等核心路径。

## 贡献

欢迎提交 Issue 和 Pull Request。参与前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)，并注意不要提交 `.env`、`generated/`、真实 API Key、数据库、WAL、生成图片或用户数据。

## 社区与致谢

感谢 [LINUX DO](https://linux.do/) 社区对开源项目推广、交流与反馈的支持。

## License

MIT. See [`LICENSE`](LICENSE)。
