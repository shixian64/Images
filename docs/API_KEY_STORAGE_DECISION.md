# 系统默认 API Key 存储决策

日期：2026-05-28  
更新：2026-06-09（生产环境默认强制本地加密）
状态：自托管阶段接受；公网 SaaS / 多租户前仍需复审 KMS/Vault

## 背景

当前项目支持两类接口凭证：

- **系统默认接口**：管理员在管理后台“接口管理”中配置，普通用户默认继承；实现位于 `services/interface-defaults.js`，配置通过 `services/db.js:systemSettings` 存入 `generated/app.db`。
- **个人覆盖接口**：用户在浏览器端本地填写；前端持久化时会清除 API Key，队列任务只把 Key 暂存在当前 Node 进程内存中，服务重启后自定义接口任务需要重新提交。

系统默认接口的 API Key 不会在普通用户接口、前端摘要、日志中明文回显。若设置 `IMAGE_STUDIO_SECRET_KEY`，Key 会以 AES-256-GCM 密文形式存在 SQLite 数据库文件里；生产环境未设置主密钥时默认拒绝保存新的系统 Key。开发环境仍保留旧版明文兼容。

## 决策

短期维持当前自托管形态：**系统默认 API Key 继续存入 SQLite，但生产环境必须设置 `IMAGE_STUDIO_SECRET_KEY` 启用本地加密才能保存系统 Key，并把 `generated/app.db` 与主密钥都视为敏感资产保护**。

理由：

- 当前仓库定位仍是本地/自托管轻量应用，零第三方依赖和低部署复杂度优先。
- Docker 部署已把 `generated/` 作为唯一持久化卷，便于集中保护和备份。
- 个人用户自带 Key 的路径已经避免落库，主要剩余风险集中在管理员维护的系统默认 Key。
- 加密实现保持零第三方依赖，适合当前轻量自托管部署；更高等级再迁移到 KMS/Vault。

## 当前必须遵守的保护措施

- `generated/`、`.env`、数据库、WAL、生成图片、提示词示例图和备份不得提交到 Git。
- 部署时限制 `generated/` 卷的宿主机访问权限；备份也按密钥材料处理。
- 生产部署设置长随机 `IMAGE_STUDIO_SECRET_KEY`；恢复已加密数据库时必须同时恢复同一个主密钥。
- 生产部署不要启用 `ALLOW_PLAINTEXT_SYSTEM_KEYS`；仅在受控迁移窗口且接受明文落库风险时短时使用。
- 生产部署保持 `ALLOW_INSECURE_UPSTREAMS=0`、`ALLOW_PRIVATE_UPSTREAMS=0`。
- 公开环境建议保持 `REGISTRATION_MODE=closed` 或 `invite`。
- 日志、截图、Issue、PR 描述不得包含 API Key、Cookie、数据库片段、用户图片、提示词或客户端日志细节。

## 接受的风险

- 开发环境未设置 `IMAGE_STUDIO_SECRET_KEY`，或生产环境显式 `ALLOW_PLAINTEXT_SYSTEM_KEYS=1` 时，能读取宿主机持久化卷或 SQLite 文件的人，可以读取系统默认 API Key。
- 已设置 `IMAGE_STUDIO_SECRET_KEY` 时，能同时读取 SQLite 文件和主密钥的人，可以解密系统默认 API Key。
- 当前方案不满足“平台方也无法解密”的零知识要求。
- 当前方案不提供 API Key 轮换历史、密文版本管理或 KMS 审计。

## 何时必须升级

满足任一条件时，应先升级密钥存储再继续扩大使用：

- 作为公网 SaaS 或多租户服务运营。
- 运行在不完全可信的主机、共享主机或第三方代运维环境。
- 需要团队共享 Profile、审计合规、密钥轮换、客户托管密钥。
- 数据库备份会离开受控机器或进入集中备份系统。

## 已完成的本地加密路径

- `services/secrets.js` 集中封装 AES-256-GCM 加解密。
- `services/interface-defaults.js` 保存系统默认接口配置时会保护 `image.apiKey` / `chat.apiKey`。
- 管理端 API 继续只返回 `hasApiKey` 和测试状态，不返回明文。
- 开发环境未设置 `IMAGE_STUDIO_SECRET_KEY` 时保留旧版明文兼容；生产环境默认拒绝无主密钥写入系统 Key。
- 读取旧明文后再次保存且主密钥存在时会写回密文。
- 测试覆盖加密往返和 SQLite at-rest 不含原始 Key。

## 后续更高等级升级路径

1. 把主密钥来源从环境变量替换为 KMS/Vault。
2. 增加 key id / key hint、密钥版本、在线轮换和销毁流程。
3. 增加“错误主密钥 / 丢失主密钥”的管理员恢复向导。
4. 对团队共享 Profile、客户托管密钥和审计合规做单独设计。

当前升级仍保持零第三方依赖；如果进入更高安全等级，再把主密钥来源替换为 KMS/Vault。
