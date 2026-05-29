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

## Common Mistakes

- Adding SQL in route handlers instead of extending `services/db.js`.
- Adding a migration that works once but fails on the second startup.
- Mixing DB snake_case rows directly into frontend contracts without a mapping step.
- Forgetting to update storage cleanup paths when adding new generated file locations.
