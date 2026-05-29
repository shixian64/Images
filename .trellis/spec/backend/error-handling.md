# Backend Error Handling

## Standard API Responses

Use `sendJson(res, status, payload)` from `utils/http.js` for JSON API responses. It sets `content-type: application/json; charset=utf-8` and `cache-control: no-store`.

Common response shape:

```json
{ "error": "message", "code": "optional_code" }
```

Success payloads are route-specific (`{ user }`, `{ items }`, `{ job }`, `{ defaults }`, etc.).

## Body Parsing Errors

Use `readJsonBody()` and `readMultipartFormData()` from `utils/http.js`; both enforce configured byte limits and throw errors with `statusCode` for invalid or oversized bodies.

Route pattern:

```js
try {
  body = await readJsonBody(req);
} catch (err) {
  return sendJson(res, bodyErrorStatus(err), { error: err.message || 'invalid json' });
}
```

References: `routes/auth.js`, `routes/quota.js`, `routes/users.js`, `routes/generate.js`.

## Service Error Pattern

Services generally throw `Error` objects. When the status matters, attach `statusCode` and optional `code` using a small local helper. Examples:

- `utils/http.js:httpError()` for body parsing and generic route helpers.
- `services/job-queue.js:httpError()` for queue capacity, missing transient secrets, and job ownership errors.
- `routes/chat.js:makeHttpError()` for chat limit validation.
- `services/registration-guard.js:RegistrationRejectedError` when a typed error class is useful.

Route handlers should map expected service errors to stable HTTP statuses and avoid leaking internals.

## Scenario: Shared HTTP Error and Environment Config Boundary

### 1. Scope / Trigger

- Trigger: Any route/service helper that creates HTTP-shaped errors, maps body parsing failures, or reads numeric environment limits.
- This is infra code: changes affect most API routes because body parsing and limits sit on the HTTP boundary.

### 2. Signatures

- `createHttpError(statusCode, message, code?)` from `utils/http.js`.
- `httpError(statusCode, message, code?)` remains a compatibility alias.
- `errorStatus(error, fallback = 500)` accepts either `error.statusCode` or `error.status`.
- `bodyErrorStatus(error)` is `errorStatus(error, 400)`.
- `positiveIntFromEnv(name, fallback, { allowZero = false } = {})` from `utils/config.js`.
- `validateEnvConfig({ logger } = {})` returns warnings and logs `config.env.invalid_positive_int`.

### 3. Contracts

- HTTP errors must carry both `statusCode` and `status` so old route code and newer service code behave the same.
- Stable machine-readable error `code` values should be added when the caller or frontend can branch on the failure.
- Numeric environment values parse as finite positive integers and `Math.floor()` decimals; invalid, empty, or non-positive values fall back.
- Only keys that intentionally allow disabling with zero should pass `{ allowZero: true }`.

### 4. Validation & Error Matrix

- Invalid JSON body -> `400`, code `invalid_json`.
- Oversized JSON/multipart body -> `413`, code `request_body_too_large`.
- Missing multipart boundary -> `400`, code `multipart_boundary_required`.
- Malformed multipart structure -> `400`, code `invalid_multipart_body`.
- Invalid positive integer env value -> keep fallback, emit `config.env.invalid_positive_int` at startup validation.

### 5. Good/Base/Bad Cases

- Good: `throw createHttpError(429, 'quota exceeded', 'daily_limit_exceeded')`.
- Base: `throw httpError(400, 'invalid input')` is allowed for legacy compatibility, but new shared helpers should prefer `createHttpError`.
- Bad: `const n = Number(process.env.MAX_FOO) || fallback` because `NaN`, `0`, and decimal behavior drift from the centralized parser.

### 6. Tests Required

- HTTP helpers: assert `statusCode`, `status`, `code`, and `bodyErrorStatus()`.
- Body parsing: assert invalid JSON and multipart errors expose stable codes.
- Config helpers: assert invalid/non-positive env values fall back and `allowZero` is explicit.
- Startup validation: assert invalid configured env values produce warnings without changing runtime fallback behavior.

### 7. Wrong vs Correct

#### Wrong

```js
function positiveIntFromEnv(name, fallback) {
  return Number(process.env[name]) || fallback;
}
```

#### Correct

```js
import { positiveIntFromEnv } from '../utils/config.js';

const limit = positiveIntFromEnv('MAX_JSON_BODY_BYTES', 1024 * 1024);
```

## Top-Level Catch

`server.js` wraps `handleRequest()` and logs unhandled exceptions as `server.request_unhandled`. If headers were not sent, it returns `500 { error: 'internal server error' }`.

Do not rely on the top-level catch for expected validation, auth, quota, or upstream errors. Handle those at the route boundary.

## Upstream Error Handling

When upstream calls fail, sanitize messages before logging or returning them:

- `services/image-generation.js:errorMessageFromUpstream()` uses `redactSecrets()`.
- `routes/chat.js` redacts upstream error messages with the active API key.
- `routes/interfaces.js` redacts profile test errors.
- `services/upstream.js` limits response body size before parsing.

Do not return raw upstream response bodies if they can contain API keys, authorization headers, or provider-specific secrets.

## Auth, Ownership, and Not Found

Prefer returning `404` for cross-user resource access when revealing existence would be unsafe. `services/job-queue.js:getJobForUser()` uses `404` for missing and unauthorized jobs. Gallery file serving uses `403` when a user is authenticated but not allowed to access a file.

Admin-only routes should call `requireAdmin(req, res)` early and return immediately on failure.

## Common Mistakes

- Throwing a plain `Error` in a route after the response may already be partially written, especially SSE routes.
- Returning raw `err.stack` or provider `raw` payloads to clients.
- Mapping all service failures to `500`; validation and quota failures should be `400`, `403`, `409`, or `429` as appropriate.
- Forgetting `return` after `sendJson()`, causing a handler to continue and attempt a second response.
