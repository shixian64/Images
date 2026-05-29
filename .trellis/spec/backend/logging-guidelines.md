# Backend Logging Guidelines

## Logger

Use `logger` from `utils/logger.js`. It writes one JSON object per line with `ts`, `level`, `message`, and structured metadata.

```js
logger.info('job.enqueued', { jobId, userId, model, n });
logger.warn('image.queue.quota_exceeded', { userId, code, model });
logger.error('server.request_unhandled', { method: req.method, url: req.url, error });
```

Do not use ad-hoc `console.log()` in backend code except for the startup banner already in `server.js`.

## Levels

- `debug`: Rare local diagnostics; avoid noisy production logs.
- `info`: Successful operational milestones such as register/login, job enqueue/start/success, interface tests, generation success.
- `warn`: Expected but important rejections or recoverable failures such as quota exceeded, rate limit, invalid upstream response, cleanup failure, scheduler recovery.
- `error`: Unexpected failures or failed upstream operations that represent an operation failure, such as `image.generate.failed`, `chat.completion.failed`, or `server.request_unhandled`.

## Message Naming

Use dotted event names in `area.action.result` style. Existing examples:

- `auth.register`, `auth.login`
- `job.enqueued`, `job.started`, `job.succeeded`, `job.failed`
- `image.generate.request`, `image.generate.success`, `image.generate.failed`
- `chat.completion.request`, `chat.completion.success`, `chat.completion.failed`
- `interface.default.test.success`, `interface.default.test.failed`

Prefer stable names because client/admin diagnostics may search logs by event.

## Metadata Rules

Log structured fields, not concatenated strings. Include identifiers and operational dimensions that help reproduce issues:

- `userId`, `jobId`, `model`, `status`, `durationMs`, `attempts`, `code`, `active`, `limit`.
- Upstream URLs are allowed after `assertAllowedUpstreamUrl()` validation, but still avoid query strings containing secrets.
- For auth/register/login, log user ID and IP when useful; do not log passwords, raw session IDs, or full cookies.

## Scenario: Request Trace IDs

### 1. Scope / Trigger

- Trigger: Any request-scoped logging, unhandled route failure, frontend client-log correlation, or new HTTP entrypoint.
- Trace IDs are a cross-layer diagnostic contract, not product data.

### 2. Signatures

- `attachTraceId(req, res)` from `utils/request-context.js` reads `x-request-id` / `x-trace-id`, normalizes it, assigns `req.traceId`, and sets response header `x-request-id`.
- `runWithRequestContext({ traceId }, fn)` wraps the request execution in `AsyncLocalStorage`.
- `logger.*(message, meta)` automatically injects the current `traceId` when one exists.
- `logger.error(message, { err })` serializes `Error` objects as `{ name, message, stack }` with secret redaction and stack truncation.

### 3. Contracts

- Response header: every HTTP request should receive `x-request-id`.
- Accepted incoming IDs: 1-128 chars, `[A-Za-z0-9._:-]`; invalid IDs are ignored and replaced with `crypto.randomUUID()`.
- Backend log field: `traceId`.
- Frontend/client-log payload field: `traceId` in the synced item and `context.traceId`.

### 4. Validation & Error Matrix

- Missing trace header -> generate UUID, set `req.traceId`, set response `x-request-id`.
- Unsafe trace header -> ignore unsafe value, generate UUID.
- Error object in logger metadata -> JSON log includes redacted `err.message` and truncated/redacted `err.stack`, not `{}`.
- Explicit `meta.traceId` -> use explicit value instead of the async context value.

### 5. Good/Base/Bad Cases

- Good: `logger.error('server.request_unhandled', { method, url, err })`.
- Base: `logger.warn('quota.rejected', { userId, code })` gets request `traceId` automatically inside the request context.
- Bad: `logger.error('failed ' + err.stack)` because it loses structure and may leak unredacted data.

### 6. Tests Required

- Request context unit tests for incoming/rejected trace IDs and response header setting.
- Logger unit tests for async-context trace injection and `Error` serialization.
- Logger tests must include a secret-like token in `Error.message` and verify it is redacted.
- Frontend/client-log tests proving the latest response trace ID is synced back.

### 7. Wrong vs Correct

#### Wrong

```js
logger.error('server.request_unhandled', { error: err.message });
```

#### Correct

```js
logger.error('server.request_unhandled', { err });
```

## Sensitive Data

Never log raw API keys, authorization headers, passwords, session IDs, cookies, or unredacted provider errors.

Use:

- `maskApiKey()` when logging that a key exists.
- `redactSecrets()` when logging or returning text that could contain a secret.
- `utils/mask.js` tests as the regression source: `test/mask.test.js`.

Client-side logs have their own sanitizer in `public/modules/logs.js` and are stored through `services/client-logs.js`. Keep backend and frontend redaction behavior consistent.

## Common Mistakes

- Logging a full request body because it is convenient; request bodies may contain prompts, keys, passwords, or uploaded metadata.
- Logging upstream errors before redaction.
- Using `error` for expected validation failures; prefer `warn` for rejected user input and quota/rate limit events.
