# Image Studio 部署指南

> 面向个人 / 小团队自托管部署。当前版本是单进程 Node.js + SQLite + 本地 `generated/` 持久化目录，不适合作为未改造的多实例 SaaS 直接横向扩展。

## 1. 推荐生产基线

- 设置 `NODE_ENV=production`。
- 设置长随机 `ADMIN_BOOTSTRAP_TOKEN`，空库首次创建管理员时使用。
- 设置长随机 `IMAGE_STUDIO_SECRET_KEY`，用于系统默认接口 API Key 加密；不要在生产启用 `ALLOW_PLAINTEXT_SYSTEM_KEYS=1`。
- 将 `REGISTRATION_MODE` 保持为 `closed` 或 `invite`，避免公网开放注册。
- 保持 `ALLOW_INSECURE_UPSTREAMS=0`、`ALLOW_PRIVATE_UPSTREAMS=0`，除非部署在隔离开发环境。
- 保护 `generated/`、备份目录和 `.env`，它们可能包含 SQLite、WAL、图片、审计日志、密文 Key 与恢复密钥材料。

## 2. 反向代理与 HTTPS

生产环境建议只通过 HTTPS 反向代理暴露服务：

```nginx
server {
  listen 443 ssl http2;
  server_name studio.example.com;

  client_max_body_size 64m;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
  }
}
```

注意：

- 如果启用 `TRUST_PROXY=1`，必须确认代理会清洗客户端传入的转发头，并用 `TRUST_PROXY_ALLOWED_IPS` 限定可信直连代理来源。
- SSE 队列进度依赖长连接，代理层不要对 `/api/jobs/*/stream`、`/api/jobs/stream`、`/api/admin/jobs/stream` 开启响应缓冲。
- 若没有使用 `NODE_ENV=production`，但部署在 HTTPS 后面，也应设置 `SESSION_COOKIE_SECURE=1`。

## 3. Docker 部署

```bash
cp .env.example .env
# 修改 .env：至少设置 NODE_ENV、ADMIN_BOOTSTRAP_TOKEN、IMAGE_STUDIO_SECRET_KEY
docker compose up -d --build
```

compose 默认：

- 容器内监听 `8787`，宿主端口由 `HOST_PORT` 控制。
- 将 `/app/generated` 挂到命名卷 `image-studio-generated`。
- 使用只读根文件系统，并显式挂载运行时可写目录。

升级镜像前建议先备份 `generated/`，再拉起新容器。SQLite schema 会在启动时自动迁移。

## 4. 备份与恢复

运行态数据集中在 `generated/`：SQLite 数据库、WAL/SHM、用户图片、Prompt 示例图、临时参考图等。备份/恢复前建议先停止应用，避免复制到写入中的 SQLite/WAL 状态。

```bash
# 备份 generated/ 到 backups/generated/image-studio-generated-<timestamp>/
npm run backup:generated

# 指定备份根目录
npm run backup:generated -- --output /path/to/backups

# 恢复指定快照；恢复前会为当前 generated/ 自动创建 pre-restore 备份
npm run restore:generated -- /path/to/backups/image-studio-generated-2026-06-09T09-00-00-000Z --yes
```

恢复加密后的系统默认 API Key 时，必须同时恢复原来的 `IMAGE_STUDIO_SECRET_KEY`。如果只恢复数据库而丢失主密钥，历史密文无法解密。

## 5. 配置导出 / 导入

系统设置位于 SQLite 的 `system_settings`，包括系统默认接口、额度默认值、队列设置和注册策略。

```bash
# 脱敏导出，适合审计和变更评审
npm run config:export

# 包含敏感配置，可用于迁移/恢复；必须按备份保护
npm run config:export -- --include-secrets --output backups/system-config/prod-config.json

# 导入完整配置；--replace 会先清空现有 system_settings
npm run config:import -- backups/system-config/prod-config.json --yes --replace
```

## 6. 容量规划与运行边界

- 当前队列是单进程调度；不要把同一个 SQLite/`generated/` 卷挂给多个写入实例。
- `GLOBAL_CONCURRENT_GENERATIONS`、`DEFAULT_CONCURRENT_LIMIT`、`IMAGE_GENERATION_BATCH_CONCURRENCY` 会共同影响上游压力、内存和本地 IO。
- multipart 上传、上游响应、URL 图片下载和参考图暂存都会占用 Buffer/native 内存；容器内存应明显大于这些上限之和。
- 管理员孤儿扫描有行数、文件数、目录数和超时上限；大图库建议低峰期执行。
- `/healthz` 会检查数据库、磁盘、队列和事件循环延迟，可作为容器或反代健康检查入口。

## 7. 升级与回滚

建议流程：

1. 停止应用或切走流量。
2. 执行 `npm run backup:generated`。
3. 记录当前 `.env` 与镜像/提交版本。
4. 启动新版本并访问 `/healthz`。
5. 验证登录、管理员、队列、图库和系统默认接口摘要。
6. 如需回滚，停止新版本后使用 `npm run restore:generated -- <snapshot> --yes` 恢复数据，并恢复对应 `.env` / 主密钥。
