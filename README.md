# Image Studio

本地 Web 工作站，用于管理多个 AI API 配置（生图 / 对话两套 Base URL、API Key、默认模型），并适配 OpenAI-compatible 的 `gpt-image-2` 与 Chat Completions。完整商业化设计见 [`docs/PRODUCT_DESIGN.md`](docs/PRODUCT_DESIGN.md)。

## 运行

```bash
npm start       # node server.js，默认 http://localhost:8787
npm test        # Node 原生 test runner，零外部依赖
```

Node 18+，无第三方依赖（使用内置 `fetch` / `http` / `node:test`）。

首次初始化管理员需先设置 `ADMIN_BOOTSTRAP_TOKEN`，注册页填入相同令牌后该用户才会成为 admin；未带令牌的首个注册用户也只是普通用户。

## 当前功能

**Studio（生成图片）**
- 模型 / prompt / size / quality / output_format / n 参数
- Prompt 草稿自动保存到 localStorage，刷新恢复
- `⌘/Ctrl + Enter` 触发生成
- 根据 size / quality / n 显示预估耗时
- 当前配置 chip（名称 · Base URL · 连通性点），一键切到 Profiles
- 生成成功后自动保存图片到本地 `generated/images`

**Gallery（本地图库）**
- 程序启动时自动读取 `generated/gallery.json`
- 展示本地已保存图片、生成时间、模型参数、文件大小与 Prompt
- 支持刷新、打开原图、下载本地文件

**Profiles（接口配置）**
- 多配置 CRUD
- 每个配置拆成 **生图模型** 与 **对话模型** 两部分，可分别填写 Base URL / API Key / 默认模型
- 连通性测试：生图 / 对话均调用各自上游 `/v1/models`，成功时记录模型数 / 前 50 个模型 ID / 耗时，失败时记录错误详情
- 商业化字段（租户 / 负责人 / 可见范围 / plan / 月预算 / 月额度 / 单用户每日额度 / RPM / 计费标签 / 备注）放在"高级"折叠区
- 右侧概览：接口总数、启用数、当前接口、生图/对话默认模型与脱敏密钥（Key 不再持久化到 localStorage）

**Logs（日志面板）**
- 本地 localStorage 保留最近 300 条
- 按等级（Debug / Info / Warn / Error）筛选 + 关键词搜索
- 导出 JSON、清空、复制单条 JSON
- 从历史日志一键复用 Prompt（回填 Studio）
- 出现 Error 时顶部菜单显示红色徽章
- API Key 以 `sk-p••••abcd` 形式脱敏（前后端一致）

**全局**
- Light / Dark / System 三态主题，持久化
- 当前 tab 持久化，刷新不丢
- 快捷键：`G S` / `G P` / `G L` 切 Studio / Profiles / Logs（在非输入区）

## Base URL 示例

- OpenAI 官方：`https://api.openai.com`
- 兼容网关：填根地址或带 `/v1` 均可，服务端按用途自动规范化为 `/v1/images/generations` 或 `/v1/chat/completions`。
- 安全默认值：上游默认必须是 HTTPS，并阻止 localhost / 私网 / link-local / metadata 类地址；仅隔离开发环境可用 `ALLOW_INSECURE_UPSTREAMS=1`、`ALLOW_PRIVATE_UPSTREAMS=1` 放开。

## 目录结构

```
server.js                 # 装配层（端口 + 路由）
routes/
  chat.js                 # POST /api/chat
  generate.js             # POST /api/generate
  gallery.js              # GET /api/gallery（本地图库索引）
  test-profile.js         # POST /api/test-profile（探活）
  static.js               # 静态文件 + /shared/ + /gallery-files/ 额外根
services/
  upstream.js             # URL 规范化 + payload 构造 + 上游调用
  gallery-store.js        # 本地图库保存 + 索引读取
utils/
  logger.js, mask.js, http.js
shared/
  constants.js            # 前后端共享的尺寸/质量/默认模型/预估耗时表
public/
  index.html, styles.css, app.js
  modules/
    dom.js, state.js, nav.js, theme.js,
    profiles.js, studio.js, gallery.js, logs.js
generated/                # 运行时生成；本地图片与 gallery.json（已 gitignore）
test/
  mask.test.js, upstream.test.js
docs/
  PRODUCT_DESIGN.md       # 商业化设计方案（产品 + UI + 架构 + 路线图）
```

## 测试

```bash
npm test
```

覆盖 `maskApiKey`（防止 Key 回显回归）、`resolveApiUrl` / `resolveModelsUrl` / `resolveChatCompletionsUrl`（Base URL 规范化）、`buildImagePayload` / `buildChatPayload`（必填校验、白名单透传、不泄漏配置字段）。

## 下一步

见 `docs/PRODUCT_DESIGN.md` §13.2（迁 Next.js + Prisma + Auth.js + S3）。当前仓库仍是单用户本地工具；云端多用户、订阅、团队空间、服务端 KMS 都是后续阶段。

## Docker 部署

项目已提供 `Dockerfile`、`.dockerignore`、`docker-compose.yml` 与 `.env.example`。运行时数据都写入容器内 `/app/generated`，compose 默认使用命名卷 `image-studio-generated` 持久化 SQLite 数据库、WAL 文件和生成图片。

```bash
cp .env.example .env
# 修改 .env 里的 ADMIN_BOOTSTRAP_TOKEN
docker compose up -d --build
```

访问：

```text
http://localhost:8787
```

健康检查：

```text
GET /healthz
```

### Docker / 资源参数说明

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST_PORT` | `8787` | 宿主机暴露端口，容器内固定监听 `8787`。 |
| `ADMIN_BOOTSTRAP_TOKEN` | 空 | 首个管理员注册令牌；生产环境请设置成长随机值。 |
| `CONTAINER_MEMORY_LIMIT` | `768m` | Docker 容器内存上限。默认按 2C/4G 机器承载 10-20 人小团队保守配置。 |
| `CONTAINER_CPUS` | `1.25` | Docker 容器 CPU 上限。当前服务是 Node 单进程，通常 1 核左右够用。 |
| `NODE_OPTIONS` | `--max-old-space-size=512` | V8 heap 上限；应低于容器内存，给 `Buffer`、SQLite、native 内存留余量。 |
| `MAX_JSON_BODY_BYTES` | `1048576` | 单个 JSON 请求体最大字节数，超过返回 `413`，避免大 body 占满内存。 |
| `MAX_IMAGES_PER_REQUEST` | `1` | 单次生图最大 `n`，避免一次请求返回过多图片导致内存/磁盘瞬时升高。 |
| `GLOBAL_CONCURRENT_GENERATIONS` | `4` | 全站同时生图任务上限；小机器建议 3-5。 |
| `DEFAULT_DAILY_LIMIT` | `10` | 普通用户默认每日生成上限；管理员可在额度管理覆盖。 |
| `DEFAULT_MONTHLY_LIMIT` | `200` | 普通用户默认每月生成上限；留空/`null` 表示不限。 |
| `DEFAULT_STORAGE_LIMIT_MB` | `500` | 普通用户默认本地图库存储上限；留空/`null` 表示不限。 |
| `DEFAULT_CONCURRENT_LIMIT` | `1` | 普通用户默认单用户并发生图上限。 |
| `IMAGE_GENERATION_TIMEOUT_MS` | `600000` | 上游图片生成超时，单位毫秒。 |
| `GENERATE_STREAM_HEARTBEAT_MS` | `15000` | SSE 生图接口心跳间隔，单位毫秒。 |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Docker 停止时的优雅关闭等待时间，单位毫秒。 |
| `ALLOW_INSECURE_UPSTREAMS` | `0` | 是否允许 HTTP 上游。生产环境保持 `0`。 |
| `ALLOW_PRIVATE_UPSTREAMS` | `0` | 是否允许 localhost/私网/metadata 等上游。生产环境保持 `0`。 |
| `NODE_ENV` | `development` | 直接 HTTP 访问容器时保持 `development`；放在 HTTPS 反向代理后面时可改 `production`。 |

### 当前基础资源保护

- JSON body 读取增加 `MAX_JSON_BODY_BYTES` 上限。
- 静态文件和图库文件改为流式发送，避免大图下载时整文件进入内存。
- `/api/generate` 和 `/api/generate/stream` 增加 `MAX_IMAGES_PER_REQUEST` 校验。
- 普通用户生成请求会占用并发槽位，配合用户 quota 的 `concurrent_limit` 防止同一用户堆积长任务。
- `/api/generate` 和 `/api/generate/stream` 增加 `GLOBAL_CONCURRENT_GENERATIONS` 全站并发槽位，保护 2C/4G 小机器。
- Docker compose 默认限制内存、CPU、PID，启用只读根文件系统，并仅把 `/app/generated` 作为持久化写入点。
- 服务支持 `SIGTERM` / `SIGINT` 优雅关闭，便于 Docker 更新或停止容器。
