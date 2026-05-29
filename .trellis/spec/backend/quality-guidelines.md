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
