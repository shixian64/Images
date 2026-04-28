# Contributing

感谢你愿意参与改进 Image Studio。

## 开始之前

- 请先阅读 `README.md`，确认本地运行方式和项目边界。
- 不要提交真实 API Key、Token、`.env`、数据库、生成图片或用户数据。
- 运行时数据应保留在 `generated/`，该目录默认不进入 Git。

## 本地开发

```bash
cp .env.example .env
npm start
npm test
```

要求：

- Node.js `>=22.5.0`
- 启动脚本已包含 `--experimental-sqlite`
- 当前项目无第三方运行依赖

## 提交变更前

请至少确认：

```bash
npm test
git status --short
```

如果改动涉及安全、认证、额度、上游请求或文件访问，请补充对应测试。

## Pull Request 建议

- 一个 PR 尽量只解决一个问题。
- 描述清楚改动目的、主要实现和验证方式。
- UI 或交互改动建议附截图或说明复现步骤。
- 避免把格式化、重命名和功能变更混在同一个 PR。

## Issue 建议

提交问题时请尽量包含：

- 运行方式：本地 Node / Docker / 反向代理
- Node.js 版本
- 复现步骤
- 期望行为和实际行为
- 相关日志，但请先删除 API Key、Token、Cookie、用户信息等敏感内容

