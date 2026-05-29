# Current Project Review Findings

Date: 2026-05-29
Task: `.trellis/tasks/05-29-project-review-bugs`
Scope: review-only; no product code changes.

## Evidence collected

- Trellis task created and started for review scope.
- GitNexus index refreshed: `npx gitnexus analyze` completed successfully; index reported 3,505 nodes / 7,540 edges / 300 flows.
- GitNexus route/shape checks returned no native HTTP routes, so API review used source inspection plus tests.
- Test command: `npm test` passed: 111 tests, 111 pass, 0 fail, duration about 2.05s under Node v24.15.0 / npm 11.12.1.
- Product code stayed unchanged; only Trellis task/review artifacts were added.

## Findings

### F1 — Frontend localStorage logs can keep embedded API keys/secrets under non-sensitive field names

Severity: High for secret-hygiene, Medium exploitability.

Evidence:

- `public/modules/logs.js:51-68` only treats key names matching `apiKey|api_key|key|authorization|token|password|secret` as sensitive. Plain string values under names like `detail`, `error`, `message`, or `context.pageUrl` are not pattern-redacted.
- `public/modules/logs.js:156-169` writes the sanitized entry directly to scoped localStorage and sync queue.
- `public/modules/studio.js:812-819` logs backend/client error text under the `error` key; if any future path returns an upstream message that still contains a key, localStorage keeps it.
- Reproduction script result during review: adding a log with `{ detail: "Authorization: Bearer sk-local-secret-123456", apiKey: "sk-local-secret-123456" }` produced `LEAK_PRESENT`; `apiKey` was masked, but `detail` retained the raw secret in both `image-key-manager.logs.v1:*` and `image-key-manager.clientLogSyncQueue.v1:*`.

Impact:

- Violates frontend spec: raw API keys should not persist in localStorage/logs.
- Server-side `services/client-logs.js` redaction catches synced logs before DB persistence, but the browser-local copy and pending sync queue can still contain raw secrets.

Recommended fix:

- Add a frontend redaction helper that masks secret patterns in every string value, not only values whose key name is sensitive.
- Apply it to `message`, all `meta` strings, and sync `context` before any localStorage write.
- Add a deterministic frontend/module test for embedded bearer/OpenAI-style secrets in `detail`, `error`, `message`, and URL query strings.

### F2 — Custom multipart parser is fragile for binary reference uploads and buffers the full body

Severity: Medium.

Evidence:

- `utils/http.js:116-164` implements multipart parsing by loading the whole request body into memory, then finding the next part with `buffer.indexOf(nextDelimiter, contentStart)`.
- If an uploaded file contains bytes matching `\r\n--<boundary>`, the parser treats that content as a boundary candidate.
- Reproduction script result during review: a single file part whose bytes contained `prefix\r\n--abc suffix` with boundary `abc` returned `ERROR 400 invalid multipart part` instead of preserving the file bytes.
- GitNexus context shows `readMultipartFormData` feeds `routes/generate.js:readGenerateBody`, so this affects `/api/generate` and `/api/generate/stream` reference-image uploads.

Impact:

- Crafted or unlucky binary input can make otherwise valid reference-image uploads fail.
- Full-buffer parsing at the default 100 MB limit increases peak memory pressure and is not ideal for concurrent uploads.

Recommended fix:

- Prefer a well-tested streaming multipart parser, or replace this parser with a robust boundary scanner that only recognizes delimiter lines exactly matching multipart framing.
- Add tests for binary content that includes boundary-like byte sequences and for multiple file fields.

### F3 — Invalid admin bootstrap token attempts bypass registration rate limiting

Severity: Medium.

Evidence:

- `routes/auth.js:83-86` rejects a present but invalid `adminBootstrapToken` before `checkRegistrationRateLimit({ ip })` is called at `routes/auth.js:89-95`.
- Reproduction script result during review with `REGISTRATION_IP_MAX_PER_10MIN=2`: three invalid admin token attempts from the same IP all returned 400, and a normal registration from the same IP immediately afterwards still returned 200.

Impact:

- The bootstrap token is expected to be high entropy, so this is not an immediate auth bypass.
- Still, it leaves the highest-value registration path without the same brute-force/noise throttling as normal registration/login attempts.

Recommended fix:

- Add a dedicated bootstrap-token attempt limiter, or apply a lightweight IP limiter before invalid-token rejection while preserving the existing behavior that closed-registration rejections do not consume normal registration quota.
- Add a regression test covering invalid bootstrap token throttling.

### F4 — Image generation treats HTTP 200 with missing/malformed `data` as success and records successful quota usage

Severity: Medium.

Evidence:

- `services/image-generation.js:449` maps non-array `data.data` to `[]`.
- `services/image-generation.js:479-486` records success for system-default usage even when `saved.length === 0` and `imageItems.length === 0`.
- `services/image-generation.js:489-500` logs success and returns HTTP 200 with `{ ...data, saved }` without validating that any image payload exists.

Impact:

- A broken or incompatible upstream can yield a user-visible “success” with no saved images.
- System-default quota can be consumed for an empty/malformed upstream success response, making debugging harder and annoying users.

Recommended fix:

- Validate upstream image responses: require `data` to be a non-empty array containing at least one supported `b64_json` or `url` item for successful generation.
- If validation fails, return 502-style upstream error and record failure rather than success.
- Add tests for `200 {}` and `200 { data: [] }` responses.

### F5 — Several admin/public list endpoints filter after a fixed pre-limit and/or in memory

Severity: Low to Medium, mostly scalability/correctness for larger data.

Evidence:

- `routes/prompt-square.js:149-158` calls `promptSquare.list(limit)` first, then applies `search`, `tag`, and `mine` filters in memory. Matching older rows beyond `limit` are invisible to filtered searches.
- `services/db.js:1318-1328` confirms `promptSquare.list(limit)` is a simple `ORDER BY published_at DESC LIMIT ?` query with no search/tag filtering.
- `routes/admin-gallery.js:82-86` loads `listGallery({ isAdmin: true, limit: 100000 })` before applying admin filters/pagination in memory.
- `services/gallery-store.js:588-631` uses `imagesTable.listAll(100000)` for stats/orphan scans.

Impact:

- Search/filter totals can be misleading once data exceeds the pre-limit.
- Admin gallery operations may become slow or memory-heavy on large installations.

Recommended fix:

- Move filtering, pagination, and counts into SQLite queries.
- Keep in-memory post-processing only for UI formatting and file-existence checks where unavoidable.

### F6 — Tooling gap: GitNexus route/shape analysis currently cannot see native `node:http` route dispatch

Severity: Low, process/tooling.

Evidence:

- GitNexus `route_map` and `shape_check` returned `No routes found in this project`, while `server.js:52-95` clearly dispatches many `/api/*` routes manually.

Impact:

- API route/consumer shape drift cannot be automatically detected by current GitNexus route tools for this repository.

Recommended fix:

- Add explicit route documentation/tests, or improve GitNexus indexing support for manual `node:http` route dispatch if this workflow will rely on route/shape automation.

## Positive observations

- `npm test` is healthy: 111/111 passing.
- Backend tests already cover many security-sensitive areas: auth/session, private upstream restrictions, redirects/timeouts/body limits, generated file ownership, quota, job queue, and server-side secret redaction.
- API CSRF is centralized in `server.js`/`middleware/guard.js`, and frontend feature modules generally use `apiFetch()`.
- Gallery file serving and orphan deletion have explicit ownership/path-guard tests.
- API keys are not persisted in personal profile localStorage by `public/modules/profiles.js`.

## Suggested fix order

1. F1 frontend local log redaction — highest secret-hygiene payoff and likely small change.
2. F4 malformed upstream success validation — prevents false-positive generation success/quota consumption.
3. F3 bootstrap-token throttling — security hardening with a focused test.
4. F2 multipart parser robustness — larger change; consider parser replacement or focused robust scanner.
5. F5 SQL pagination/filtering — schedule as scalability cleanup.
6. F6 route tooling gap — process improvement, not product runtime.

## Fix status

Updated after user follow-up “逐个修复”:

- F1 fixed: frontend local logs now redact embedded secrets in messages, metadata, loaded stored entries, sync queue entries, and sync context; backend/frontend redaction regex is shared through `shared/redaction.js`.
- F2 fixed: multipart parsing now recognizes only legal delimiter lines and preserves boundary-like bytes inside file content.
- F3 fixed: admin bootstrap token attempts have a dedicated IP limiter that does not consume normal registration quota.
- F4 fixed: HTTP 200 image responses with no usable `b64_json` or `url` payload now return a 502-style error and record managed quota as failure.
- F5 fixed: prompt-square filtering/counts and admin-gallery filtering/pagination/counts were moved to DB/service wrappers; admin stats now use SQL aggregation and orphan scans no longer truncate at 100000 DB rows.
- F6 left as tooling/process follow-up; no product runtime change needed.

Verification after fixes: `npm test` passed with 119 tests, 119 pass, 0 fail.
