# 系统默认 API Key 存储决策

日期：2026-05-28  
更新：2026-06-01（同步当前 README / SECURITY 描述）
状态：当前阶段接受，生产化前需要复审

## 背景

当前项目支持两类接口凭证：

- **系统默认接口**：管理员在管理后台“接口管理”中配置，普通用户默认继承；实现位于 `services/interface-defaults.js`，配置通过 `services/db.js:systemSettings` 存入 `generated/app.db`。
- **个人覆盖接口**：用户在浏览器端本地填写；前端持久化时会清除 API Key，队列任务只把 Key 暂存在当前 Node 进程内存中，服务重启后自定义接口任务需要重新提交。

系统默认接口的 API Key 不会在普通用户接口、前端摘要、日志中明文回显，但会以明文形式存在 SQLite 数据库文件里。

## 决策

短期维持当前实现：**系统默认 API Key 继续存入 SQLite，但把 `generated/app.db` 视为敏感资产保护**。

理由：

- 当前仓库定位仍是本地/自托管轻量应用，零第三方依赖和低部署复杂度优先。
- Docker 部署已把 `generated/` 作为唯一持久化卷，便于集中保护和备份。
- 个人用户自带 Key 的路径已经避免落库，主要剩余风险集中在管理员维护的系统默认 Key。

## 当前必须遵守的保护措施

- `generated/`、`.env`、数据库、WAL、生成图片、提示词示例图和备份不得提交到 Git。
- 部署时限制 `generated/` 卷的宿主机访问权限；备份也按密钥材料处理。
- 生产部署保持 `ALLOW_INSECURE_UPSTREAMS=0`、`ALLOW_PRIVATE_UPSTREAMS=0`。
- 公开环境建议保持 `REGISTRATION_MODE=closed` 或 `invite`。
- 日志、截图、Issue、PR 描述不得包含 API Key、Cookie、数据库片段、用户图片、提示词或客户端日志细节。

## 接受的风险

- 能读取宿主机持久化卷或 SQLite 文件的人，可以读取系统默认 API Key。
- 当前方案不满足“平台方也无法解密”的零知识要求。
- 当前方案不提供 API Key 轮换历史、密文版本管理或 KMS 审计。

## 何时必须升级

满足任一条件时，应先升级密钥存储再继续扩大使用：

- 作为公网 SaaS 或多租户服务运营。
- 运行在不完全可信的主机、共享主机或第三方代运维环境。
- 需要团队共享 Profile、审计合规、密钥轮换、客户托管密钥。
- 数据库备份会离开受控机器或进入集中备份系统。

## 推荐升级路径

新增 `services/secrets.js`，集中封装密钥加解密：

1. 引入环境变量主密钥，例如 `KEY_ENCRYPTION_SECRET`，要求 32 字节随机值。
2. 用 Node 内置 `crypto` 实现 AES-256-GCM。
3. SQLite 中只存 `ciphertext`、`iv`、`tag`、`version`、`key_hint`。
4. `services/interface-defaults.js` 只通过 `services/secrets.js` 读写系统默认 Key。
5. 管理端 API 继续只返回 `hasApiKey` / masked hint，不返回明文。
6. 增加迁移：首次启动时把旧明文配置加密后保存，并清除旧明文字段。
7. 增加测试覆盖：加密往返、错误主密钥、旧明文迁移、日志不泄漏。

这个升级仍可保持零第三方依赖；如果进入更高安全等级，再把主密钥来源替换为 KMS/Vault。
