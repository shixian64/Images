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
