# Contributing

感谢你愿意参与改进 Image Studio。

## 开始之前

- 请先阅读 `README.md`，确认本地运行方式、当前功能和安全边界。
- 不要提交真实 API Key、Token、Cookie、`.env`、数据库、WAL、生成图片、用户数据或 `generated/` 下的任何运行时文件。
- 当前项目是依赖极少的 Node.js 应用，优先使用内置 API，新增第三方依赖需要说明理由。

## 本地开发

```bash
cp .env.example .env
# 修改 ADMIN_BOOTSTRAP_TOKEN
npm start
npm test
```

要求：

- Node.js `>=22.5.0`
- 启动脚本已包含 `--experimental-sqlite`
- 当前项目无第三方运行依赖
- 没有独立构建步骤；不要运行构建/编译命令，除非任务明确要求或允许

## 提交变更前

请至少确认：

```bash
npm test
git status --short
```

如果改动只涉及文档，可以在 PR 中说明未运行测试的原因。涉及以下区域时，请补充或更新对应测试：

- 认证、session、CSRF、注册防刷、登录限流
- 上游 URL 校验、请求体大小限制、下载边界、脱敏
- 额度、存储、并发槽位、队列、SSE
- 图库、公开图库、点赞、提示词广场、示例图上传
- SQLite schema、迁移、数据清理

## Pull Request 建议

- 一个 PR 尽量只解决一个问题。
- 描述清楚改动目的、主要实现和验证方式。
- UI 或交互改动建议附截图、录屏或明确的手动验证路径。
- 避免把格式化、重命名和功能变更混在同一个 PR。
- 如果新增环境变量、迁移、运行时目录或安全边界变化，请同步更新 README / SECURITY / docs。

## Issue 建议

提交问题时请尽量包含：

- 运行方式：本地 Node / Docker / 反向代理
- Node.js 版本
- `.env` 中相关非敏感配置
- 复现步骤
- 期望行为和实际行为
- 相关日志，但请先删除 API Key、Token、Cookie、邮箱、用户 ID、提示词、图片等敏感内容
