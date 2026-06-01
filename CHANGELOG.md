# Changelog

本项目遵循简洁的变更记录方式。正式发布时建议按版本补充日期和主要改动。

## Unreleased

### Added

- 添加 MIT 开源协议和开源协作文档。
- 新增认证、注册、登录、session 与管理员初始化流程。
- 新增注册防刷：关闭 / 邀请 / 公开注册模式、IP 限频、邮箱域策略和蜜罐字段。
- 新增用户管理、额度管理、系统默认接口管理、客户端日志管理和管理员图库管理。
- 新增持久化生成队列、SSE 进度、任务取消、重试、优先级和队列设置。
- 新增参考图编辑输入、参考图临时目录清理和多图生成拆分。
- 新增公开图库、图片公开 / 取消公开、点赞和点赞频率限制。
- 新增 Prompt Builder、Prompt 历史、Prompt Square 和提示词示例图上传。
- 新增漫画工作流：故事分析、分镜生成、风格模板和逐格生成。
- 新增 Docker 部署资源限制、健康检查和只读根文件系统配置。

### Changed

- 前端拆分为 ES Modules，并覆盖生成、漫画、提示词、图库、任务、用户和日志模块。
- 运行时状态迁移到 SQLite 与 `generated/users/<uid>/images`，不再依赖旧 `gallery.json` 作为主索引。
- 系统默认生图与对话接口拆分，普通用户可继承管理员配置的默认接口。
- 个人 API Key 不再持久化到 localStorage，仅在当前任务 / 当前 Node 进程内临时使用。
- 文档更新为当前 Node + SQLite + 队列 + 本地文件存储架构。

### Security

- 加强上游 URL 安全校验、HTTPS / 私网默认限制、DNS rebinding / TOCTOU 防护。
- 增加 JSON、multipart、上游响应、URL 图片下载、参考图和示例图大小限制。
- 增加登录限流、注册限流、admin bootstrap 限流、chat 限流和全站并发槽位。
- 增加服务端日志、前端日志和 API 返回的敏感字段脱敏。
- 增加 SQLite busy timeout、WAL checkpoint、数据生命周期清理和资源保护配置。
