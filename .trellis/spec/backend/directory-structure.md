# Backend Directory Structure

## Runtime Shape

This repository does not use `src/` or a framework router. Backend code lives at the repository root in small ES module files:

```text
server.js                 # HTTP assembly, middleware order, route dispatch, shutdown
middleware/               # request guards and session attachment
routes/                   # API route handlers and static file handler
services/                 # business logic, persistence, queues, upstream calls, guards
utils/                    # generic HTTP, cookie, logging, masking, request helpers
shared/                   # constants shared with browser modules
test/                     # node:test coverage for backend and shared helpers
generated/                # runtime SQLite DB, WAL files, images, temp references; ignored by git
```

## Layer Rules

### `server.js` is assembly only

Use `server.js` for process-level wiring: startup migration, `startJobQueue()`, `attachSession()`, route dispatch, static file fallback, and graceful shutdown. Keep product logic out of this file.

Reference: `server.js` imports every route and service entrypoint, but delegates request bodies and domain behavior to `routes/*` and `services/*`.

### `routes/` owns HTTP boundaries

Route files should:

- Check method/path and auth/admin requirements.
- Parse request bodies with `readJsonBody()` or `readMultipartFormData()`.
- Convert route-level errors to `sendJson()` responses.
- Delegate reusable business behavior to `services/`.

Good examples:

- `routes/auth.js` keeps registration/login HTTP handling thin and calls `services/auth.js` plus `services/registration-guard.js`.
- `routes/jobs.js` parses user/admin job URLs and delegates queue operations to `services/job-queue.js`.
- `routes/interfaces.js` handles admin/public interface endpoints and delegates stored config to `services/interface-defaults.js`.

Avoid placing SQLite statements, filesystem traversal, upstream fetch logic, or quota arithmetic directly in routes.

### `services/` owns domain behavior

Services are the correct place for rules that are reused by multiple routes or tests:

- `services/db.js` defines the SQLite schema, migrations, and table wrappers.
- `services/job-queue.js` owns persistent job scheduling, SSE subscription sets, retries, cancellation, and transient custom API secrets.
- `services/image-generation.js` prepares jobs and executes upstream image generation.
- `services/gallery-store.js` saves and lists user-scoped image files.
- `services/quota.js` owns usage snapshots, quota checks, storage reservations, and concurrent slots.
- `services/upstream.js` owns OpenAI-compatible URL/payload construction and guarded network calls.

### `utils/` must stay generic

Use `utils/` only for helpers that do not know product concepts such as users, jobs, galleries, or profiles. Current examples are `utils/http.js`, `utils/logger.js`, `utils/mask.js`, `utils/cookies.js`, and `utils/request.js`.

### `shared/` is browser-safe

Only put constants or pure helpers in `shared/` when both backend and frontend need them. `shared/constants.js` is imported by backend upstream payload builders and browser modules. Do not import Node-only modules from `shared/`.

## Naming and Module Conventions

- Use ES modules (`import` / `export`) everywhere.
- Use kebab-case filenames for feature services and routes, for example `gallery-store.js`, `registration-guard.js`, `client-logs.js`.
- Export named functions for testable behavior; default exports are optional route conveniences only.
- Keep comments close to non-obvious decisions, especially security or compatibility decisions.
