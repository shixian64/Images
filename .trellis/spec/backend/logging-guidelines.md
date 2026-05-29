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
