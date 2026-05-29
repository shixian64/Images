# Frontend Quality Guidelines

## Required Patterns

- Use `apiFetch()` from `public/modules/auth.js` for every API request. It centralizes credentials, CSRF headers, and JSON serialization.
- `apiFetch()` also records the latest `x-request-id` / `x-trace-id` response header; client log sync should include that trace ID for backend correlation.
- Escape user-controlled values with `escapeHtml()` before inserting into `innerHTML`.
- Keep raw API keys out of localStorage and logs. Personal profile persistence must strip keys as in `profiles.js`.
- Use `setStatus()` for short feedback and panel-local error regions for detailed failures.
- Keep feature logic in the owning module and reuse shared helpers instead of duplicating constants or storage access.

## Security-Sensitive UI Rules

- Non-GET API requests must go through `apiFetch()` so the backend CSRF guard sees `X-Requested-With: fetch`.
- Treat prompts, usernames, filenames, provider errors, and log metadata as untrusted text.
- Do not construct `/gallery-files/*` URLs from arbitrary filesystem paths; use API-returned `url` / `downloadUrl` values.
- Do not display full API keys; use masked/key-presence indicators.

## Accessibility and UX

- Keep keyboard paths working: `Ctrl/Cmd+Enter` generation, Escape closing previews, tab navigation for dialogs.
- Buttons need clear labels or `aria-label` when icon-only.
- Toggle tabs/buttons should update active classes and ARIA state together, following `gallery.js` and `profiles.js` patterns.
- Empty states should be explicit and actionable, using the existing `empty-state` pattern.

## Testing and Verification

For frontend-only visual changes, use browser/manual verification and screenshots when appropriate. For logic helpers that can run in Node, add `node:test` coverage.

Useful existing tests:

- `test/job-dismissal.test.js` for user-scoped frontend persistence logic.
- `test/mask.test.js` and `test/client-logs.test.js` for masking/redaction behavior shared with UI expectations.
- `test/static.test.js` for gallery file access contracts that frontend links depend on.

## Common Mistakes

- Updating localStorage directly instead of using `state.js` helpers.
- Using `fetch()` directly and missing CSRF headers.
- Re-rendering a list and losing event handlers because listeners were attached to individual children instead of the container.
- Introducing a dependency or syntax that requires bundling; the app is served directly as browser ES modules.
