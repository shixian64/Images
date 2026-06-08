# Image Studio · 商业化设计方案

> 基于当前仓库（Node.js 原生 HTTP + SQLite + 本地文件存储 + 浏览器 ES Modules，适配 OpenAI-compatible 图片生成与 Chat Completions）的现状与演进版本。
> 当前项目已从早期“单用户 localStorage 工具”演进为支持登录、管理员、额度、队列、图库、Prompt Square 和漫画工作流的小团队自托管应用。
> 目标：继续从“可自托管的小团队工具”演进到“可托管、可付费、可协作”的在线生图产品。
> 版本：v1.1 路线图　|　负责人：hmt　|　最后更新：2026-06-01

---

## 0. TL;DR（一页结论）

- **产品定位**：面向开发者 / 设计师 / 内容创作者的 **"自带密钥（BYOK）在线生图工作站"**。用户带自己的 OpenAI / 兼容网关 Key，平台提供统一 UI、提示词工作流、历史资产管理和小团队运维能力。
- **当前形态**：Node.js 单进程 + SQLite + 本地 `generated/` 存储，支持用户/管理员、额度、异步队列、SSE、公开图库、Prompt Square、示例图上传和漫画分镜工作流。
- **商业化差异点**：不赚 token 中间差价，而是靠 **"工作流 + 资产管理 + 协作 + 管理后台"** 收订阅。
- **目标技术骨架**：当前自托管版本继续保持低依赖；SaaS / 商业版再迁移到 PostgreSQL、对象存储、队列后端、KMS/Vault、可观测性和订阅计费。
- **关键里程碑**：自托管稳定版 → 小团队协作版 → SaaS Beta → 商业版 v1（订阅、团队、合规和平台级密钥管理）。

## 0.1 当前实现快照（2026-06-01）

当前代码已经落地：

- **账号与权限**：注册、登录、session、普通用户 / 管理员、首个注册自动管理员、旧管理员初始化令牌兼容、关闭 / 邀请 / 公开注册模式。
- **管理后台**：用户管理、额度管理、生成队列、客户端日志、系统默认接口、图库管理。
- **生成链路**：同步提交、SSE/队列进度、任务取消 / 重试 / 优先级、全站并发槽位、单用户并发槽位、多图拆分。
- **图片输入**：参考图上传、图库图作为参考、参考图临时目录 TTL 和上传大小 / 类型校验。
- **图库**：用户图库、公开图库、点赞、管理员统计 / 批量删除 / 孤儿扫描。
- **提示词工作流**：Prompt Builder、Prompt 历史、Prompt Square、提示词示例图上传。
- **漫画工作流**：故事分析、分镜生成、风格模板、逐格图片生成。
- **运行时存储**：SQLite schema、WAL、用户图片、客户端日志、审计日志、用量日聚合、后台数据生命周期清理。
- **安全边界**：CSRF、登录/注册/chat 限流、上游 URL 安全校验、HTTPS/私网默认限制、请求体 / 上游响应 / 下载大小限制、日志脱敏。

当前仍未落地或不应视为生产 SaaS 完成项：

- 多租户 Workspace、团队成员角色和跨团队数据隔离。
- PostgreSQL / Redis / S3 / CDN / worker 横向扩展。
- 系统默认 API Key 加密存储、KMS/Vault、密钥轮换审计。
- 支付订阅、账单、成本报表和企业 SSO。
- 图片缩略图管线、内容审核、公开分享链接、Webhook / 外部 API。

---

## 1. 产品定位与目标用户

### 1.1 一句话定义
> **"一个支持 BYOK 的多模型在线生图工作站，替你管好 Key、流程和素材。"**

### 1.2 目标用户画像

| Persona | 场景 | 核心痛点 | 我们的价值 |
|---|---|---|---|
| **独立开发者 / Indie Hacker** | 快速给 App/网站生成配图 | 不想自己写前端、希望对比模型效果 | 一套 UI 切多模型、prompt 版本化 |
| **内容 / 运营人员** | 公众号、小红书、电商图 | 不懂 API、想要可视化 | 无代码 UI、模板库、批量生成 |
| **设计师 / Art Director** | Moodboard、概念图、二次创作 | 想保留完整 prompt/种子/参考图链路 | 作品集、版本树、Reference 管理 |
| **中小团队** | 多人共用一批 Key、复用 prompt | 凭证散落、素材找不回 | 团队空间、权限、审计日志 |

### 1.3 非目标用户（有意排除）
- 对生成内容要求极强可控（需要 LoRA 训练、ControlNet 精调）的专业工作室 → 建议使用 ComfyUI。
- 只需要一次性生成几张图的轻度用户 → 免费层即可，不是付费主力。

### 1.4 竞品格局与差异

| 竞品 | 模式 | 我们的差异 |
|---|---|---|
| OpenAI Playground | 官方、单模型 | 多模型、多 Key、有资产管理 |
| Midjourney / DALL·E 直接订阅 | 平台自收费 | BYOK，用户对成本完全可控 |
| 各种 "AI 画图站" | 转售 API、封装差 | 不赚差价、数据可导出、无 vendor lock-in |
| LibreChat / OpenWebUI | 聊天为主、图像为辅 | 图像一等公民、专业素材面板 |

**核心护城河**：*BYOK 透明 + 资产管理 + 工作流* 的组合，不是某一点的极致。

---

## 2. 功能清单（按版本分层）

按照 **MVP → Beta → v1 商业版** 三阶段切分，避免一次吃成胖子。本节描述商业化目标分层；其中部分能力已经在当前自托管版提前落地，但仍需在 SaaS 化时重做多租户、对象存储、密钥加密、可观测性和计费边界。

### 2.1 MVP（4 周）—— "单人版，但像产品"

M1. 账号系统：邮箱 + 第三方（Google / GitHub）登录
M2. 凭证管理（Profiles）
- 云端存储多个 Profile：名称 / Base URL / 模型列表 / API Key
- Key **端到端加密**（详见 §8）
- 连通性测试按钮（走一个最便宜的请求）

M3. 生成器
- Prompt / Negative Prompt / Size / Quality / Output Format / n
- 参考图上传（多图，用于 image-2 的多图输入场景）
- 一键重新生成、以此为基础变体

M4. 作品库（Gallery）
- 每次生成自动入库，S3 存原图 + 缩略图
- 筛选：按 Profile、模型、日期、收藏
- 单张详情：完整参数 / 复制 Prompt / 下载 / 删除

M5. 日志面板（从当前版本迁移增强）
- 按用户隔离、云端存储
- 导出 JSON / CSV

### 2.2 Beta（+4 周）—— "专业创作"

B1. **Prompt 模板库 & 变量**：`{subject}`, `{style}` 占位符，批量展开
B2. **批量生成**：一次提交一组变量组合，后台异步队列
B3. **版本树（Lineage）**：记录 "从哪张图演化" 关系，像 git 提交树
B4. **多模型对比视图**：同一 prompt 同时发到多个 Profile，并排对比
B5. **收藏夹 & 标签**
B6. **Prompt Assist**：调用 LLM 把自然语言扩成结构化 prompt（可选，用户自己的 Key）

### 2.3 v1 商业版（+4 周）—— "团队与商业化"

C1. **团队空间（Workspace）**：多成员、角色（Owner / Admin / Member / Viewer）
C2. **共享 Profile**：团队级 Key，成员调用但看不到明文
C3. **用量配额与报表**：按人 / 按 Profile / 按模型看调用次数、成功率、费用估算
C4. **审计日志**：谁在什么时候用了哪个 Key 生成了哪张图
C5. **订阅与计费**：Stripe 接入，Free / Pro / Team 三档
C6. **公开分享链接**：对外只读展示作品集
C7. **Webhook & API**：对接自动化流水线

---

## 3. 信息架构（IA）

```
App
├── (marketing) 首页 / 定价 / 文档 / 登录
└── (app) 登录后
    ├── Home · 最近生成、最近 Prompt、Tips
    ├── Studio · 生成器（核心高频页面）
    │   ├── Prompt 面板
    │   ├── 参数面板（模型/尺寸/质量/…）
    │   ├── 参考图面板
    │   └── 结果区（流式 + 缩略图）
    ├── Gallery · 作品库
    │   ├── 列表 / 网格切换
    │   ├── 筛选侧栏
    │   └── 详情抽屉
    ├── Prompts · 模板 & 历史
    ├── Profiles · 凭证管理
    │   ├── 个人 Profile
    │   └── 团队共享 Profile
    ├── Usage · 用量与费用
    ├── Logs · 审计与调试
    ├── Team · 成员与权限（团队版）
    └── Settings · 个人资料 / 安全 / 订阅 / 密钥加密口令
```

导航规则：
- 左侧主导航（sidebar）：Studio / Gallery / Prompts / Profiles / Usage / Logs
- 顶部：Workspace 切换器 + 全局搜索 + 通知 + 账号菜单
- 移动端：Sidebar 收纳为抽屉，底部 tab 仅显示 Studio / Gallery / Profile

---

## 4. 关键用户流程

### 4.1 首次上手（Time-to-First-Image ≤ 90 秒）
1. 登录 → 空状态引导："添加你的第一个 API Key"
2. 选择快速模板：OpenAI 官方 / Azure OpenAI / 自定义兼容网关
3. 输入 Base URL + Key → **自动调 `/v1/models` 做探测**，显示可用模型清单
4. 进入 Studio，预填一条示例 prompt（例如 *"a minimalist poster of a cat astronaut, flat design"*）
5. 点击生成，3–15 秒后返回第一张图 → 弹出 "Tip: 已自动加入作品库"

### 4.2 日常创作循环
```
选 Profile → 写/选 Prompt → 选参数 → 生成
   ↑                                    ↓
   └──← 基于结果再生成 / 变体 ←────────┘
                   ↓
              入库 · 打标 · 分享
```

### 4.3 团队协作流程
- Owner 创建 Workspace → 邀请成员（邮件 / 链接）
- 在 Profiles 页添加 "Team Profile"，勾选 "共享给团队"（明文 Key 只有 Owner 能看到）
- 成员在 Studio 下拉选中 Team Profile，正常调用；审计日志记录调用人

---

## 5. UI / UX 设计

### 5.1 设计原则
1. **Creation-first**：生成器是主场，其他都是配角。任何时候两次点击内回到 Studio。
2. **Key 安全可感知**：所有 Key 默认脱敏展示（`sk-p••••abcd`），任何明文操作都需要二次确认或口令解锁。
3. **预览先于配置**：尺寸、质量等参数旁边实时显示预估耗时 / 费用。
4. **渐进式展开**：默认面板只 6 个最常用控件，"高级参数" 折叠，记住用户展开状态。
5. **键盘友好**：
   - `⌘/Ctrl + Enter` 生成
   - `⌘/Ctrl + K` 全局搜索
   - `G` `G` 进 Gallery，`G` `S` 进 Studio
6. **永不丢失**：未提交的 prompt 自动草稿（IndexedDB + 云同步）。
7. **深色模式一等公民**（创作场景常在夜间）。

### 5.2 视觉系统

**色板（示例 tokens）**
| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--bg` | `#FAFAF9` | `#0B0B0D` | 主背景 |
| `--surface` | `#FFFFFF` | `#151519` | 卡片 |
| `--surface-2` | `#F4F4F2` | `#1C1C22` | 次级面板 |
| `--border` | `#E6E6E3` | `#26262C` | 分割线 |
| `--text` | `#1A1A1A` | `#F2F2F0` | 主文 |
| `--text-muted` | `#6B6B6B` | `#9A9AA0` | 副文 |
| `--brand` | `#6E56CF` | `#9E8CFC` | 主色（紫，偏"创造" 感）|
| `--success` | `#22A06B` | `#4ADE80` | 成功 |
| `--warning` | `#C08A00` | `#F5C451` | 警告 |
| `--danger` | `#D0453A` | `#F87171` | 错误 |

**字体**：
- UI：`Inter`（英文）+ `PingFang SC / Noto Sans SC`（中文）
- 代码 / Prompt 展示区：`JetBrains Mono` / `SF Mono`

**圆角 / 间距**：
- 圆角：卡片 `12px`、按钮 `8px`、缩略图 `6px`
- 栅格：`4px` 基线，常用 `4 / 8 / 12 / 16 / 24 / 32`
- 卡片阴影（light）：`0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)`

**组件库建议**：Radix UI + Tailwind（或 shadcn/ui）作为基础，图标用 Lucide。

### 5.3 Studio 页面详细设计

```
┌──────────────────────────────────────────────────────────────┐
│ Workspace ▾   ⌕ search                       🔔   👤 HMT ▾   │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  Studio ◉  │  ┌───────────────────────┐  ┌────────────────┐  │
│  Gallery   │  │ Prompt                │  │ Profile  ▾      │  │
│  Prompts   │  │ [textarea, 多行, @ 触│  │ gpt-image-2 ▾   │  │
│  Profiles  │  │  发变量, / 触发模板]  │  │                │  │
│  Usage     │  └───────────────────────┘  │ Size   1024² ▾ │  │
│  Logs      │  ┌───────────────────────┐  │ Quality High ▾ │  │
│  Settings  │  │ Negative (折叠)       │  │ BG     auto  ▾ │  │
│            │  └───────────────────────┘  │ Format png   ▾ │  │
│            │  ┌───────────────────────┐  │ n       [1]    │  │
│            │  │ 🖼 Reference Images   │  │ Seed    随机   │  │
│            │  │ [+ 拖入或上传]        │  │ Advanced ▾     │  │
│            │  └───────────────────────┘  └────────────────┘  │
│            │                                                 │
│            │  [ 生成 ⌘⏎ ]  预估: ~6s · ≈ $0.04    [ 重置 ]  │
│            │                                                 │
│            │  ┌──────── 结果区（网格） ────────────────────┐ │
│            │  │ [图1]  [图2]  [图3]  [图4]                 │ │
│            │  │  详情  变体  收藏  下载                    │ │
│            │  └───────────────────────────────────────────┘ │
│            │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

**关键交互细节**：

1. **Prompt 编辑器**
   - 支持 `@variable` 插入变量、`/template` 插入模板
   - Token 估算实时显示在右下角
   - 历史按钮：弹出最近 20 条 prompt 浮层，方向键选择

2. **Profile 下拉**
   - 显示 `名称 · 模型 · 脱敏 Key`，末尾绿点表示连通性 OK
   - 下拉底部固定一个 "+ 新建 Profile"

3. **Reference Images**
   - 拖拽 / 粘贴 / 点击上传；上传即进 S3（避免 base64 撑大请求）
   - 缩略图上显示 "used as: init / mask / ref" 三种角色切换

4. **生成按钮状态机**
   - `idle` → `queued`（灰色 + 小队列号） → `running`（进度环，心跳文案每 3s 换一条） → `success` / `failed`
   - 失败时下方红条显示可复制的错误详情，并提供 "重试 / 反馈" 按钮

5. **结果区**
   - 网格自适应：桌面 4 列、平板 2 列、手机 1 列
   - 悬停显示快速操作（变体 / 收藏 / 下载 / 复制 prompt）
   - 点击打开 **详情抽屉**（右侧滑出 480px），包含完整参数、原图、Lineage

### 5.4 Gallery 页面

- **双视图**：网格（默认）/ 列表（带参数列）
- **筛选侧栏**：日期、Profile、模型、尺寸、标签、收藏
- **批量操作**：多选 → 下载 zip、加标签、删除
- **空状态**：插画 + "去 Studio 生成第一张图" CTA

### 5.5 Profiles 页面

表格列：名称 / Base URL / 模型数 / 最近使用 / 状态 / 操作

- 新建/编辑表单采用 **向导式**：三步（基础 → 连通性测试 → 命名保存）
- 明文 Key 只在创建瞬间可见一次（类似 AWS IAM Access Key 风格）
- 支持导入/导出加密配置包（`.imagestudio.json`，AES-GCM 加密）

### 5.6 状态与反馈

| 场景 | 处理方式 |
|---|---|
| 网络慢 | 超过 300ms 显示 skeleton；超过 10s 显示 "仍在生成…" |
| 429 限流 | Toast 建议稍后重试，附带"切换 Profile"按钮 |
| 401 / 403 | 引导跳转到 Profile 编辑页重新填 Key |
| 余额不足 | 直接告知并链接到对应服务商控制台 |
| 空状态 | 每个空页面都有插画 + 主要 CTA，避免 "一片空白" |

### 5.7 可访问性（a11y）
- 颜色对比度 WCAG AA
- 所有交互组件都有键盘路径、`aria-label`
- 生成状态通过 `aria-live` 播报
- 图片必须有 alt（自动用 prompt 前 100 字）

---

## 6. 系统架构

### 6.1 总览（单体 → 可拆分）

```
┌──────────┐    HTTPS     ┌────────────────┐
│  Client  │ ───────────▶ │  Edge / CDN    │
│ (Web/Mob)│              │ (静态资源/图片) │
└──────────┘              └────────┬───────┘
      │                            │
      │ HTTPS (API)                │
      ▼                            │
┌────────────────────────────┐     │
│  API Gateway (Next.js API  │     │
│     Routes / Fastify)      │     │
└──┬──────────┬──────────┬───┘     │
   │          │          │         │
   │          │          ▼         │
   │          │   ┌──────────────┐ │
   │          │   │   Redis      │ │
   │          │   │ (缓存/限流)  │ │
   │          │   └──────────────┘ │
   │          │                    │
   │          ▼                    │
   │   ┌──────────────┐            │
   │   │  PostgreSQL  │            │
   │   │(用户/凭证/作品│            │
   │   │ /日志/计费)  │            │
   │   └──────────────┘            │
   │                               │
   ▼                               │
┌──────────────────┐               │
│  Job Queue       │               │
│ (BullMQ / SQS)   │               │
└────────┬─────────┘               │
         │                         │
         ▼                         │
┌──────────────────┐               │
│  Image Worker     │              │
│ (调用上游模型)    │──────────────┘
└────────┬─────────┘    │
         │              ▼
         ▼        ┌──────────────┐
┌─────────────┐   │  S3 兼容存储 │
│ 上游 API    │   │ (原图/缩略图) │
│ OpenAI /    │   └──────────────┘
│ 网关 / ...   │
└─────────────┘
```

### 6.2 技术栈选择

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + TanStack Query | SSR 友好、生态稳定、易招人 |
| 状态 | Zustand（UI 本地）+ TanStack Query（远端） | 轻量、无样板 |
| 后端 | Node.js 20 + Fastify（或 Next Route Handler）| 与现有 server.js 平滑过渡 |
| DB | PostgreSQL 16 + Prisma | 关系强、审计日志方便 |
| 缓存 | Redis 7 | 会话、限流、队列 backing |
| 队列 | BullMQ（自建）/ 或 SQS（云）| 异步生成、批量任务 |
| 对象存储 | S3 / R2 / MinIO | 原图 + 缩略图，CDN 回源 |
| 鉴权 | Auth.js（NextAuth） + 邮箱魔法链接 + OAuth | 快速落地、支持企业 SSO 扩展 |
| 部署 | Vercel（前端） + Fly.io / Railway / 自建 K8s（worker）| 先低运维，后期独立 |
| 日志 | pino + Loki / Grafana | 结构化 JSON 日志 |
| 指标 | OpenTelemetry + Prometheus | 生成耗时、成功率 |
| 错误追踪 | Sentry | 前后端统一 |
| 支付 | Stripe | 订阅 & 计量 |

### 6.3 调用链路（一次"生成"详细时序）

```
User         Web          API             Queue      Worker      Upstream     S3
 │ click      │            │                │          │            │          │
 │──生成─────▶│            │                │          │            │          │
 │            │── POST ────▶│                │          │            │          │
 │            │           (验身/限流/配额)   │          │            │          │
 │            │            │─ enqueue ─────▶│          │            │          │
 │            │◀── 202 job_id(SSE 订阅)─────│          │            │          │
 │            │            │                │── take ─▶│            │          │
 │            │            │                │          │── call ───▶│          │
 │            │            │                │          │◀── image ──│          │
 │            │            │                │          │── put ───────────────▶│
 │            │            │                │          │◀── urls ──────────────│
 │            │            │                │◀─ done ─│                        │
 │            │            │◀─ event (SSE)──│                                   │
 │            │◀─ push ────│                                                    │
 │◀─ 展示 ───│            │                                                    │
```

- **同步 vs 异步**：单张小图走同步（<8s），批量或 3 张以上走队列 + SSE 推进度。
- **幂等**：`job_id` 由客户端生成（UUIDv7），服务端去重。
- **取消**：SSE 通道支持客户端主动 cancel，worker 收到信号 abort upstream。

### 6.4 扩展性切分（未来拆微服务的缝）

当前单体内部已用 **模块边界** 约束，未来可平滑拆出：

- `auth-service`（账号/团队/鉴权）
- `profile-service`（凭证/加密）
- `image-service`（生成/作品/资产）
- `billing-service`（订阅/计量）

---

## 7. 数据模型（核心表）

> 使用 PostgreSQL。所有表包含 `id` (uuid v7)、`created_at`、`updated_at`、`deleted_at`（软删）。

```sql
-- 用户
users(
  id, email UNIQUE, name, avatar_url,
  password_hash NULL,               -- 允许纯 OAuth
  locale, timezone,
  status ENUM('active','suspended'),
  created_at, updated_at
)

-- 团队（Workspace）
workspaces(id, name, slug UNIQUE, owner_id FK users, plan, created_at, ...)
workspace_members(workspace_id, user_id, role ENUM('owner','admin','member','viewer'))

-- 凭证
profiles(
  id, workspace_id FK, owner_user_id FK,
  name, base_url, default_model,
  scope ENUM('personal','shared'),
  enc_key_ciphertext BYTEA,         -- AES-GCM 密文
  enc_key_iv BYTEA,
  enc_key_tag BYTEA,
  wrapping_key_id TEXT,             -- KMS key 标识
  key_hint TEXT,                    -- "sk-p••••abcd" 脱敏展示用
  last_used_at, test_status, test_latency_ms,
  created_at, updated_at
)

-- 生成任务
jobs(
  id, workspace_id, user_id, profile_id FK,
  status ENUM('queued','running','succeeded','failed','canceled'),
  prompt TEXT, negative_prompt TEXT,
  params JSONB,                     -- size/quality/bg/n/seed/...
  input_refs JSONB,                 -- 参考图 S3 keys
  parent_job_id FK jobs NULL,       -- Lineage
  estimated_cost_cents INT,
  actual_cost_cents INT,
  duration_ms INT,
  error TEXT,
  upstream_request_id TEXT,
  created_at, finished_at
)

-- 作品（一张图）
images(
  id, job_id FK, workspace_id,
  s3_key_original, s3_key_thumb, s3_key_webp,
  width, height, format, size_bytes,
  favorite BOOLEAN DEFAULT false,
  tags TEXT[],
  alt TEXT,
  created_at
)

-- 模板
prompt_templates(
  id, workspace_id, author_id,
  name, body, variables JSONB,  -- [{name,type,default}]
  visibility ENUM('private','workspace','public'),
  created_at, updated_at
)

-- 审计日志
audit_logs(
  id, workspace_id, user_id, action, target_type, target_id,
  ip, user_agent, meta JSONB, created_at
)

-- 用量聚合（按日）
usage_daily(
  workspace_id, day DATE,
  profile_id, model,
  success_count INT, failed_count INT,
  total_cost_cents INT,
  PRIMARY KEY(workspace_id, day, profile_id, model)
)

-- 订阅
subscriptions(workspace_id, plan, stripe_sub_id, status, current_period_end)
```

索引要点：
- `jobs(workspace_id, created_at DESC)` 作为默认查询
- `images(workspace_id, favorite, created_at DESC)`
- `audit_logs(workspace_id, created_at DESC)` + 分区按月

---

## 8. 安全与合规（重点）

**凭证安全是这个产品的命根子。**

### 8.1 密钥加密（两种模式，用户可选）

**模式 A：服务端托管（默认，方便）**
- 每个 workspace 一把 **DEK（data encryption key）**，由 KMS 主密钥（KEK）包裹
- Key 明文只在：① 用户提交创建时　② worker 调用上游前解密　两处短暂存在，均在内存，不落盘
- Prisma 中字段类型为 `bytea`，读取需要走专门的 `decryptProfileKey(profileId)` 函数
- KMS：初期用 `libsodium` + 环境变量主密钥 + 定期轮换；规模上来后接 AWS KMS / GCP KMS / Vault

**模式 B：用户口令解锁（零知识，偏执模式）**
- 用户设置一个独立的 "加密口令"（不是登录密码）
- 客户端用 PBKDF2 / Argon2id 派生 DEK，加密 Key 后再上传
- 服务端只存密文，**无法单独解密**
- 每次使用 Key 之前浏览器解锁一次（会话内缓存 DEK，退出即清）
- 代价：不能用后台 worker（因为服务端没 key），批量/定时任务需要浏览器保持在线或本地 runner

> 建议：MVP 先上模式 A，Beta 加模式 B 作为 "Pro" 卖点。

### 8.2 传输与存储
- 全站 HSTS + TLS1.3
- 图片 S3 默认 **private**，前端用短时签名 URL（15 min）访问
- DB 落盘加密（云厂商托管启用即可）

### 8.3 权限与多租户
- 所有查询强制带 `workspace_id`（Prisma middleware 校验，否则抛错）
- RLS（Row Level Security）再兜一层
- API Key / Profile 的操作均入 `audit_logs`

### 8.4 反滥用
- 注册 → 邮箱验证 + 人机校验（hCaptcha）
- 生成接口限流：IP + 用户 + workspace 三维度
- 每张图在入库前跑一次 NSFW 分类（可选本地小模型），违规进隔离区并通知用户
- Prompt 黑名单：明显违法词汇拦截（可配置）

### 8.5 合规
- GDPR：提供 **"导出全部数据"** 和 **"销毁账号"** 两个一键操作
- 图片版权：UI 明示 "生成内容版权归你，平台不主张任何权利"；同时告知上游服务商 ToS
- Cookie 使用列表 + 同意横幅

### 8.6 SRE 细节
- 不把 API Key 写进日志（server 已做脱敏，需自动化单测保障）
- 错误上报到 Sentry 时必须过滤 `authorization`、`apiKey`、`prompt`（prompt 可选，但默认不上报，避免泄漏用户创意）

---

## 9. 性能、可观测性与可用性

### 9.1 性能目标（SLO）
- P50 页面首屏 TTFB < 400ms，LCP < 2s
- 同步生成 P95 < 15s（不含上游等待，仅我们的开销）
- 队列入队延迟 P99 < 200ms
- 作品库列表（50 条）P95 < 300ms

### 9.2 观测
- 三大信号：**Logs（结构化）/ Metrics / Traces**
- 业务仪表板：
  - 生成成功率（按模型、按 Profile）
  - 平均耗时分布
  - 失败 Top 原因
  - 各 plan 的日活、付费转化

### 9.3 可用性策略
- 上游失败自动降级：按用户 Profile 的 "降级链"（用户可配置多个 Profile 作为 fallback）
- 幂等重试：对 5xx 重试 2 次，429 回退
- 蓝绿部署 + DB 迁移 gated

---

## 10. API 设计（对外公开部分）

RESTful，所有请求需 `Authorization: Bearer <token>` 或 Session Cookie。

```
POST   /api/v1/jobs                   # 创建生成任务 → 202 + job_id
GET    /api/v1/jobs/:id               # 查询状态
GET    /api/v1/jobs/:id/events        # SSE 实时进度
DELETE /api/v1/jobs/:id               # 取消

GET    /api/v1/images                 # 列表 (query: page, filter)
GET    /api/v1/images/:id             # 详情（签名 URL）
PATCH  /api/v1/images/:id             # 改 tag/favorite
DELETE /api/v1/images/:id

GET    /api/v1/profiles               # 列表（仅返回脱敏）
POST   /api/v1/profiles               # 新建
PATCH  /api/v1/profiles/:id
DELETE /api/v1/profiles/:id
POST   /api/v1/profiles/:id/test      # 连通性测试

GET    /api/v1/usage?from=&to=        # 用量报表
GET    /api/v1/prompts                # 模板
POST   /api/v1/prompts
...
```

提交任务请求体示例：

```json
{
  "job_id": "01HXYZ...",
  "profile_id": "prf_...",
  "model": "gpt-image-2",
  "prompt": "a minimalist poster ...",
  "params": { "size": "1024x1024", "quality": "high", "n": 1 },
  "input_refs": ["s3://.../ref1.png"]
}
```

---

## 11. 商业化设计

### 11.1 定价策略（BYOK 下怎么收钱）
关键问题：用户自己掏 OpenAI 的钱了，我们凭什么再收？答案是**平台价值**，按 "使用深度" 分层：

| 套餐 | 月费（个人）| 核心权益 |
|---|---|---|
| **Free** | $0 | 1 个 Profile，50 张图/月入库，Gallery 保留 7 天 |
| **Pro** | $9 | 无限 Profile，无限入库，Prompt 模板，批量生成，多模型对比，版本树 |
| **Team** | $19 / 人 / 月 | 团队空间、共享 Profile、角色权限、审计日志、SSO、Webhook |
| **Enterprise** | 谈 | 私有化部署、客户托管 KMS、SLA、定制集成 |

- 免费额度不限 Key 调用次数（用户自己掏钱），限的是"资产保留 & 功能"
- 按月 / 按年（年付 8 折）

### 11.2 获客
- 技术博客 + 与模型发布节点对齐（例如新的 gpt-image-X 发布当天出对比文章）
- GitHub 开源 Lite 版（核心生成器），付费版提供托管
- Product Hunt / Hacker News 发布
- 面向国内：小红书 / 公众号 "多模型对比 + prompt 模板" 内容

### 11.3 指标（North Star & Guardrails）
- **North Star**：每周活跃创作者数（WAC，每周至少生成 3 张且入库）
- Guardrails：付费转化率、平均生成成功率、月留存

---

## 12. 路线图与里程碑

```
W1–W2   搭架子：Next.js + Auth + DB + S3 + 基础 Studio
W3–W4   MVP：Profile CRUD + 同步生成 + Gallery + 日志迁移
──── MVP 上线（内测）────
W5–W6   Beta-A：异步队列 + SSE + 批量 + 模板库
W7–W8   Beta-B：版本树 + 多模型对比 + 收藏/标签
──── 公开 Beta ────
W9–W10  商业-A：Stripe + Free/Pro 订阅 + 空间隔离
W11–W12 商业-B：Team 空间 + 审计 + 用量报表 + Webhook
──── v1 商业版上线 ────
W13+    巡航：Enterprise 私有化、LoRA 对接、移动端原生
```

---

## 13. 从当前代码到商业版的迁移清单

> 当前仓库现状：`server.js` + `routes/` + `services/` + `public/modules/` + SQLite + `generated/` 本地文件存储。它已经不再是早期的单用户 localStorage demo，而是一个小团队自托管版本。后续迁移重点不是“补基础功能”，而是把已有能力生产化、平台化和可横向扩展。

### 13.1 已完成或基本完成

- [x] `server.js` 拆出 `routes/*` 与 `services/*`，路由层保持较薄。
- [x] 前端从单体脚本拆成 ES Modules：studio、profiles、gallery、logs、jobs、users、prompts、comic 等。
- [x] 尺寸、质量、默认模型、漫画工作流等抽到 `shared/*` 供前后端共享。
- [x] API Key、Authorization、Cookie 等敏感字段脱敏，并有测试覆盖。
- [x] 登录、注册、session、首个注册自动管理员、旧管理员初始化令牌兼容和注册防刷。
- [x] SQLite 持久化：用户、session、图片、点赞、审计、客户端日志、额度、用量、任务、系统设置、Prompt Square。
- [x] 异步生成队列、SSE、任务取消 / 重试 / 优先级和管理员队列设置。
- [x] 参考图编辑输入、Prompt Square、提示词示例图上传、公开图库点赞和漫画工作流。
- [x] Docker 自托管基础：只读根文件系统、资源限制、健康检查、`/app/generated` 持久化卷。

### 13.2 自托管稳定版优先级

- [x] 把当前 `/api/*` 路由整理成 `docs/API.md`，明确请求体、响应体、权限和错误码。
- [ ] 把部署说明从 README 拆到 `docs/DEPLOYMENT.md`，覆盖反向代理、HTTPS、备份、恢复、升级和容量规划。
- [x] 为系统默认 API Key 引入 `services/secrets.js`，用 Node 内置 `crypto` 做 AES-256-GCM 加密存储。
- [x] 增加数据库迁移版本表，避免后续 schema 变更只依赖 ad-hoc `ALTER TABLE`。
- [ ] 增加图库缩略图 / 预览图生成管线，避免前端直接加载过大的原图。
- [ ] 增加管理员导出：用户用量、任务、审计、图库存储统计。
- [ ] 完善备份 / 恢复脚本，覆盖 SQLite、WAL、用户图片和示例图。

### 13.3 SaaS / 多租户迁移

- [ ] 引入 Workspace / Organization 数据模型：workspace、member、role、invite、billing owner。
- [ ] 所有核心表补 `workspace_id`，并提供从当前单实例数据到默认 workspace 的迁移。
- [ ] 把 SQLite 迁移到 PostgreSQL，保留一个只读迁移工具用于导入旧 `generated/app.db`。
- [ ] 把本地图片目录迁移到 S3/R2/MinIO，并为图片和示例图生成短时签名 URL。
- [ ] 把内存限流和单进程队列迁移到 Redis/BullMQ、SQS 或等价后端。
- [ ] 把 session 存储、限流、队列事件和后台维护任务拆出可横向扩展边界。
- [ ] 引入 KMS/Vault 或托管密钥系统，支持密钥版本、轮换、销毁和审计。
- [ ] 增加内容安全策略：图片内容审核、公开分享审核、滥用处置和投诉流程。

### 13.4 商业化能力

- [ ] 订阅计划：Free / Pro / Team / Enterprise。
- [ ] 计费：订阅、用量报表、超额策略、发票和取消流程。
- [ ] 团队协作：共享 Profile、成员权限、只读作品集、团队图库、审计查询。
- [ ] 企业能力：SSO、SCIM、IP allowlist、数据保留策略、导出/删除请求。
- [ ] 外部集成：公开分享链接、Webhook、API token、自动化工作流。

### 13.5 破坏性注意

- 当前个人接口 Key 不持久化；迁移到 SaaS 时需要设计“个人密钥托管 / 浏览器解锁 / 团队共享密钥”三种路径。
- 当前系统默认 API Key 明文存 SQLite；公网或多租户前必须先完成加密迁移。
- 当前 `generated/` 同时存数据库、WAL、图片、示例图和临时参考图；迁移对象存储前必须明确文件归属和清理策略。
- Base URL 当前接受 `https://host` 或 `https://host/v1`，迁移后仍需保持兼容，并在数据库中存规范化形式。
- 当前队列是单进程可控模型；迁移到分布式 worker 后要重新设计取消、重试、幂等、进度事件和临时文件生命周期。
- 当前公开图库和 Prompt Square 是实例内共享；多租户后需要明确 workspace 内公开、全站公开、审核公开三种可见性。
---

## 14. 风险与开放问题

| 风险 | 影响 | 对策 |
|---|---|---|
| 上游 API 变更 | 生成失败 | 抽 `upstream-adapter` 层，每家网关一个适配器 |
| 用户 Key 泄漏 | 品牌毁灭 | 模式 B 零知识加密 + 严格审计 + 外部渗透测试 |
| NSFW / 版权争议 | 法律风险 | NSFW 过滤 + ToS + 审计可追溯 |
| BYOK 用户不愿付费 | 营收难 | 功能分层+模板市场+团队协作拉高价值感 |
| 上游成本剧变 | 用户抱怨 | 我们不经手 Key 费用，透明归上游 |

**待决策**：
1. 是否提供"平台托管 Key"作为高级套餐补充（风险是成本波动）？建议 v1 先不做。
2. 模板库是否开放 UGC 市场、是否分成？建议 Beta 后评估。
3. 自托管版本 vs SaaS 的功能边界在哪？建议"核心生成器"开源、"协作 & 计费"闭源。

---

## 附录 A：关键 UI 组件清单（给前端工程师）

- `<PromptEditor />`：多行、变量高亮、token 估算、历史浮层
- `<ProfileSelect />`：带连通性点、可直接跳到新建
- `<ParamPanel />`：受控表单、折叠高级、联动预估耗时
- `<ReferenceUploader />`：拖拽 + 粘贴 + 进度 + 角色切换
- `<JobStatus />`：状态机可视化（queued/running/done/failed），心跳文案
- `<ImageCard />` / `<ImageDetailDrawer />`：悬停操作、lineage 链路
- `<EmptyState />`：统一空页面组件
- `<ShortcutHint />`：键盘提示组件
- `<WorkspaceSwitcher />`：顶部、带搜索
- `<UsageChart />`：用量可视化

## 附录 B：上游适配器接口（示意）

```ts
interface ImageAdapter {
  name: string;                    // "openai" | "azure" | "custom"
  supportsModel(model: string): boolean;
  buildRequest(input: GenerateInput, profile: Profile): UpstreamRequest;
  parseResponse(raw: unknown): GenerateOutput;   // 统一结构
  mapError(raw: unknown): AppError;
}
```

新接入一个兼容网关 = 实现一个 Adapter + 注册。

---

**结束。**
如需把本方案拆成 Jira / Linear 单或画线框图（Figma），告诉我你想先从哪个模块落地，我可以给出对应的详细工单或组件稿。
