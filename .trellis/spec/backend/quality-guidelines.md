# Backend Quality Guidelines

## Runtime and Dependencies

- Use ES modules and Node 22.5+ built-ins.
- Do not add third-party dependencies without a clear justification and a repository-level discussion.
- There is no build step. Do not introduce compile-required source formats unless the project explicitly migrates.
- Keep the app runnable with `node --experimental-sqlite server.js`.

## Required Patterns

- Keep route handlers thin; put reusable rules in `services/` or `utils/`.
- Use `apiFetch` on the frontend and `requireCsrf()` on the backend for non-GET API requests.
- Enforce input size limits through `utils/http.js` helpers.
- Use `services/upstream.js` for every upstream HTTP call so SSRF, redirects, DNS pinning, timeouts, and response-size limits remain centralized.
- Use `services/path-guard.js`, `assertUserPath()`, and service-level ownership checks for generated files.
- Use `maskApiKey()` / `redactSecrets()` for any key or upstream error that reaches logs or responses.

## Forbidden Patterns

- Raw `fetch()` to user-controlled upstream URLs outside `services/upstream.js`.
- Raw SQL outside `services/db.js` table wrappers.
- Persisting raw custom user API keys in localStorage, job rows, logs, or client logs.
- Serving files from `generated/` without checking ownership/public visibility.
- Trusting `X-Forwarded-*` headers unless `TRUST_PROXY=1` and the deployment proxy sanitizes them.
- Adding build, transpile, or framework assumptions to runtime code without changing project docs and scripts.

## Testing Expectations

Use Node's native test runner (`node:test`) and built-in assertions. Tests live in `test/*.test.js`.

Add or update tests when changing:

- Auth/session/registration/rate limits: `test/auth.test.js`, `test/registration-guard.test.js`, `test/request.test.js`.
- Upstream URL/payload/SSRF behavior: `test/upstream.test.js`, `test/test-profile.test.js`.
- Generation, queue, references, quota, storage: `test/generate.test.js`, `test/job-queue.test.js`, `test/quota.test.js`, `test/gallery-store.test.js`.
- Static file access: `test/static.test.js`.
- Secret masking: `test/mask.test.js`, `test/client-logs.test.js`.

The normal verification command is `npm test`. For documentation-only changes, record that tests were not run and why.

## Review Checklist

- Does the change preserve the route -> service -> DB/upstream boundary?
- Are all user-controlled strings validated, normalized, and size-limited?
- Are status codes stable and meaningful?
- Are secrets redacted in every log and error path?
- Is generated file access scoped to the owning user, admin, or public-image rule?
- Do tests cover the security-sensitive edge case, not only the happy path?

## Scenario: Runtime Resource Limits, SSE Streams, and Immutable Gallery Files

### 1. Scope / Trigger

- Trigger: changing in-memory limiters, long-lived SSE endpoints, generated image scans, or static serving under `/gallery-files/*`.
- Goal: prevent unbounded memory/DB/file-system work while keeping stream cleanup and generated image caching deterministic.

### 2. Signatures

- `hit(key, max, windowMs, options?) -> { allowed, remaining, retryAfterMs }` in `services/rate-limit.js`; `options.now/maxKeys/cleanupIntervalMs` are test hooks and must remain optional.
- `openSse(res)`, `writeSse(res, event, data)`, `writeSseComment(res, message)`, and `createSseSession(res, { heartbeatMs, onHeartbeat, onClose })` live in `utils/sse.js`.
- `images.listAllForMaintenance({ limit, offset })` must page rows; callers must not use an unbounded maintenance `SELECT *`.
- `scanOrphans()` pages DB rows and caps filesystem `stat()` concurrency.
- `createStaticHandler()` may return `304` for authorized `/gallery-files/*` requests when `If-None-Match` matches the generated ETag.

### 3. Contracts

- Env keys:
  - `RATE_LIMIT_MAX_KEYS` caps the in-memory limiter key count.
  - `RATE_LIMIT_CLEANUP_INTERVAL_MS=0` means sweep expired limiter keys on every hit.
  - `GALLERY_STAT_CONCURRENCY` caps concurrent `stat()` calls.
  - `GALLERY_MAINTENANCE_SCAN_PAGE_SIZE` caps image rows read per maintenance page.
- SSE responses use `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform`, `connection: keep-alive`, and `x-accel-buffering: no`.
- Gallery file cache responses are sent only after ownership/public/admin checks pass, use long-lived private immutable caching, and include a stable ETag derived from file metadata.
- Non-gallery static assets keep `cache-control: no-cache`; JSON API responses keep `no-store` via `sendJson()`.

### 4. Validation & Error Matrix

- Limiter key expired -> remove it during cleanup; if max keys is reached, evict least-recent keys instead of rejecting all new keys.
- SSE close/end -> clear heartbeat timer and run subscriber cleanup exactly once.
- SSE write after destroyed/ended response -> helper returns `false`; stream callers must not throw from cleanup paths.
- Maintenance scan row with missing file -> include in `missingFiles`; non-`ENOENT` stat errors are ignored like transient races.
- Authorized gallery request with matching `If-None-Match` -> `304` with cache headers; unauthorized request -> existing `403/404` before cache evaluation.
- `ttlMs <= 0` in reference job file cleanup -> remove eligible terminal job directories regardless of filesystem mtime skew.

### 5. Good/Base/Bad Cases

- Good: `createSseSession(res, { onClose: unsubscribe })` for job streams so heartbeats and subscribers share one lifecycle.
- Base: route-specific SSE heartbeat work can pass `onHeartbeat` while still using shared cleanup.
- Bad: each route creating its own `setInterval()` and `res.on('close')` cleanup because one missed branch leaks subscribers.
- Good: `images.listAllForMaintenance({ limit: pageSize, offset })` inside a loop.
- Bad: `images.listAllForMaintenance()` returning every image row for maintenance scans.

### 6. Tests Required

- Rate-limit tests must assert expired key deletion and max-key eviction without changing the public `hit()` response shape.
- SSE tests must assert standard headers, event serialization, exactly-once close cleanup, and no heartbeat writes after close.
- Gallery maintenance tests must prove `scanOrphans()` calls the DB wrapper with bounded `limit/offset`.
- Static tests must assert gallery image `Cache-Control`/`ETag` and `304` behavior, plus non-gallery no-cache behavior.
- Reference cleanup or queue recovery tests must cover `ttlMs <= 0` so restart cleanup is not defeated by filesystem mtime skew.

### 7. Wrong vs Correct

#### Wrong

```js
const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
res.on('close', () => {
  clearInterval(heartbeat);
  cleanup();
});
```

#### Correct

```js
createSseSession(res, {
  heartbeatMs: 25_000,
  onClose: cleanup
});
```

#### Wrong

```js
const rows = imagesTable.listAllForMaintenance();
```

#### Correct

```js
const rows = imagesTable.listAllForMaintenance({ limit: pageSize, offset });
```
