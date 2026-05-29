# Backend Development Guidelines

This backend is a dependency-light Node.js 22.5+ ES module application built on native `node:http` and `node:sqlite`. The backend owns HTTP routing, authentication/session guards, SQLite persistence, quota enforcement, image-generation job execution, upstream calls, local gallery storage, and operational logging.

## Pre-Development Checklist

Before changing backend code:

1. Read [Directory Structure](./directory-structure.md) to place code in the correct layer.
2. If the change touches SQLite, generated files, queues, quotas, sessions, users, or settings, read [Database Guidelines](./database-guidelines.md).
3. If the change handles HTTP input or failures, read [Error Handling](./error-handling.md).
4. If the change adds operational events, read [Logging Guidelines](./logging-guidelines.md).
5. Always read [Quality Guidelines](./quality-guidelines.md) for security, tests, and dependency rules.
6. For cross-layer changes, also read `../guides/cross-layer-thinking-guide.md`.

## Guides

| Guide | Use for |
| --- | --- |
| [Directory Structure](./directory-structure.md) | Choosing `routes/`, `services/`, `utils/`, `middleware/`, or `shared/` |
| [Database Guidelines](./database-guidelines.md) | `node:sqlite`, schema migrations, CRUD wrappers, runtime state |
| [Error Handling](./error-handling.md) | API status mapping, body parsing errors, service exceptions |
| [Logging Guidelines](./logging-guidelines.md) | JSON logs, levels, sensitive-data redaction |
| [Quality Guidelines](./quality-guidelines.md) | Review checklist, tests, security boundaries, forbidden patterns |

## Key Backend Flows

- `server.js` attaches sessions, applies CSRF/auth guards, dispatches `/api/*`, serves static assets, starts migrations and the image job queue.
- `routes/generate.js` accepts image generation requests and enqueues jobs through `services/job-queue.js`.
- `services/job-queue.js` persists jobs in SQLite, emits SSE updates, manages cancellation/retry, and calls `services/image-generation.js`.
- `services/image-generation.js` validates image requests, resolves system-default vs custom interfaces, calls upstream APIs, and saves results through `services/gallery-store.js`.
- `services/upstream.js` is the only upstream HTTP adapter. It normalizes OpenAI-compatible URLs, applies SSRF checks, pins DNS results, and limits response size.
