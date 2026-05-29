# Backend Database Guidelines

## Storage Model

The app uses Node's built-in `node:sqlite` (`DatabaseSync`) directly. There is no ORM, no migration framework, and no external database dependency.

Reference files:

- `services/db.js` — singleton connection, schema, migrations, and table wrappers.
- `test/db.test.js` — migration idempotency and legacy gallery migration expectations.
- `services/gallery-store.js`, `services/job-queue.js`, `services/quota.js` — examples of services using DB wrappers instead of raw SQL.

Runtime data is stored under `generated/`:

- `generated/app.db` plus SQLite WAL files.
- `generated/users/<uid>/images/...` for user image files.
- `generated/tmp/jobs/<jobId>/references/...` for temporary reference images.

## Connection and Pragmas

Use the singleton opened by `open()` inside `services/db.js`. It creates `generated/`, opens `generated/app.db`, enables WAL mode, and turns on foreign keys.

Do not create additional SQLite connections in feature code. Add new table wrappers to `services/db.js` and call those wrappers from services.

## Schema and Migrations

Schema is defined as SQL strings in `services/db.js` and applied by `migrate()` at startup. Migrations must be idempotent.

Local patterns:

- Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for new tables/indexes.
- Use `addColumnIfMissing()` for additive columns.
- Use explicit rebuild logic only when SQLite needs a table shape change, as in `migratePromptSquareNullableOwner()`.
- Keep legacy migrations safe to re-run; `migrateLegacyGallery()` must remain deferred/idempotent when no admin user exists.

If adding a migration, add or update a `test/db.test.js` case proving a fresh migrate and repeat migrate both work.

## Table Wrapper Pattern

`services/db.js` exports table-oriented objects such as `users`, `sessions`, `images`, `imageLikes`, `usageDaily`, `generationJobs`, `systemSettings`, and `promptSquare`.

Follow this pattern for new database behavior:

- Keep SQL and row-shape conversions inside `services/db.js`.
- Return rows or small plain objects; let domain services convert to API/public shapes.
- Use prepared statements with `?` parameter binding for dynamic values.
- Keep public route handlers from importing `node:sqlite` or writing SQL directly.

## Naming and Shape Conventions

- Database tables and columns use `snake_case` (`created_at`, `user_id`, `error_message`).
- API/frontend payloads usually use `camelCase` (`createdAt`, `userId`, `errorMessage`) after service mapping.
- Index names use descriptive `idx_<table>_<columns>` names, for example `idx_generation_jobs_status_priority`.
- Timestamps are stored as ISO strings for user/session/image records or millisecond numbers for job queue timing; follow the table's existing style.
- JSON columns are stored as text by wrappers for settings, job payloads, progress, results, and metadata. Normalize and redact before persisting.

## Runtime-State Warnings

- System-default interface configuration, including API keys, currently lives in `system_settings` via `services/interface-defaults.js`. UI/API responses hide raw keys, but the database file must be protected at deployment level.
- Custom user interface API keys are intentionally transient. `services/job-queue.js` keeps them in `transientJobSecrets`, not SQLite; after restart those custom jobs cannot resume.
- Never store inline image `b64_json` in `generation_jobs.result`; `compactGenerationResult()` strips it to avoid inflating SQLite and SSE payloads.

## Scenario: SQLite lifecycle cleanup and JSON-array filtering

### 1. Scope / Trigger

- Trigger: changing `services/db.js` schema/indexes, SQLite PRAGMAs, retention cleanup, or JSON-array query semantics such as `prompt_square.tags`.
- Goal: keep migrations idempotent, avoid unbounded operational tables, and ensure tag filters match array elements rather than serialized JSON substrings.

### 2. Signatures

- `migrate()` applies `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, additive column migrations, and seed/legacy migrations.
- `sessions.destroyExpired(cutoffIso = nowIso()) -> number` deletes sessions where `expires_at <= cutoffIso`.
- `auditLogs.deleteOlderThan(cutoffIso) -> number`, `clientLogs.deleteOlderThan(cutoffIso) -> number`, and `usageDaily.deleteOlderThan(cutoffDay) -> number` are the only table-level TTL delete helpers.
- `cleanupRuntimeData({ now, logger }) -> { sessions, auditLogs, clientLogs, usageDaily }` lives in `services/maintenance.js` and orchestrates runtime cleanup.
- `startDataMaintenance({ logger, runImmediately, intervalMs }) -> Timeout | null` runs cleanup at startup and on an interval.

### 3. Contracts

- SQLite connection PRAGMAs are applied in the `open()` singleton: WAL mode, `foreign_keys=ON`, `synchronous=NORMAL`, configurable `busy_timeout`, and configurable `wal_autocheckpoint`.
- Positive integer env keys:
  - `SQLITE_BUSY_TIMEOUT_MS` and `SQLITE_WAL_AUTOCHECKPOINT_PAGES` allow `0`.
  - `DATA_CLEANUP_INTERVAL_MS` allows `0` to disable the interval while still permitting explicit cleanup.
  - `AUDIT_LOG_RETENTION_DAYS`, `CLIENT_LOG_RETENTION_DAYS`, and `USAGE_DAILY_RETENTION_DAYS` allow `0` to disable deleting old rows for that table.
- ISO timestamp tables (`audit_logs`, `client_logs`, `sessions`) compare ISO strings; usage rows compare `YYYY-MM-DD` day strings.
- JSON-array membership for prompt tags must use `json_each(CASE WHEN json_valid(tags) THEN tags ELSE '[]' END)` plus `tag.type = 'text'`.

### 4. Validation & Error Matrix

- Invalid positive env values -> `validateEnvConfig()` emits `config.env.invalid_positive_int` and runtime falls back.
- Retention value `0` -> skip deleting old rows for that table.
- Malformed `prompt_square.tags` JSON -> treat as an empty array, not a request failure.
- Cleanup failure -> log `data.cleanup_failed` with structured `{ err }`; do not crash request handling.

### 5. Good/Base/Bad Cases

- Good: add indexes in an idempotent SQL block and prove the index names exist after repeated `migrate()`.
- Base: delete rows strictly older than the cutoff (`< cutoff`) so boundary/fresh rows survive.
- Bad: `instr(tags, JSON.stringify(tag)) > 0` because it couples behavior to serialized JSON text rather than array elements.

### 6. Tests Required

- Migration tests must call `migrate()` twice and assert new index names exist.
- Retention tests must seed old and fresh rows for each table, then assert only old rows are removed.
- Session cleanup tests must prove expired sessions are deleted while future sessions remain.
- Prompt-square tag tests must prove a short tag such as `a` does not match longer tags such as `alias` or `aesthetic`.

### 7. Wrong vs Correct

#### Wrong

```sql
WHERE instr(p.tags, json_quote(?)) > 0
```

#### Correct

```sql
WHERE EXISTS (
  SELECT 1
  FROM json_each(CASE WHEN json_valid(p.tags) THEN p.tags ELSE '[]' END) AS tag
  WHERE tag.type = 'text' AND tag.value = ?
)
```

## Common Mistakes

- Adding SQL in route handlers instead of extending `services/db.js`.
- Adding a migration that works once but fails on the second startup.
- Mixing DB snake_case rows directly into frontend contracts without a mapping step.
- Forgetting to update storage cleanup paths when adding new generated file locations.
