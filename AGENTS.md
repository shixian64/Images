# Repository Guidelines

## Project Structure & Module Organization

This repository is a dependency-light Node.js web app for local / self-hosted image generation, prompt workflows, profile management, user management, quota control, and gallery storage.

- `server.js` wires the HTTP server, port, session middleware, CSRF/auth guards, route dispatch, static serving, startup migration, job queue, and graceful shutdown.
- `middleware/` contains request guards such as `session.js` and `guard.js`.
- `routes/` contains API and static route handlers: auth, profile, users, quota, interfaces, generate, jobs, chat, gallery, admin gallery, prompt square, prompt examples, client logs, and static files.
- `services/` holds business logic for upstream calls, SQLite access, auth, registration guards, quota, users, gallery storage, job queue, prompt example images, maintenance, and security boundaries.
- `utils/` and `shared/` contain reusable helpers and constants shared with the frontend, including masking/redaction, request context, SSE, and comic workflow primitives.
- `public/` contains browser assets (`index.html`, `login.html`, `app.js`, `styles.css`, `favicon.svg`, and `modules/`).
- `test/` contains Node native test files named `*.test.js`.
- `docs/` contains product/design/security decision documentation.
- `generated/` is runtime state (SQLite DB, WAL files, images, prompt example images, temporary reference files, user data) and is ignored by Git.

## Build, Test, and Development Commands

- `npm start` — starts the app with `node --experimental-sqlite server.js` at `http://localhost:8787`.
- `npm test` — runs the Node native test runner over `test/**/*.test.js`.
- `cp .env.example .env` — creates local configuration; an empty database promotes the first registered account to admin automatically.

There is no separate build step. Do not run compile/build commands unless explicitly requested or allowed.

## Coding Style & Naming Conventions

- Use ES modules (`import`/`export`) and Node 22.5+ APIs; avoid adding third-party dependencies without justification.
- Prefer 2-space indentation, semicolons, and small single-purpose functions.
- Name files by feature in kebab-case (`gallery-store.js`, `registration-guard.js`, `prompt-example-images.js`).
- Keep route handlers thin; put reusable behavior in `services/` or `utils/`.
- Never persist or log raw API keys; use existing masking and redaction helpers.
- Treat files under `generated/` as sensitive runtime artifacts, not source files.

## Testing Guidelines

- Add or update tests in `test/` with the `feature.test.js` naming pattern.
- Use `node:test` and built-in assertions; keep tests deterministic and avoid real upstream network calls.
- Cover security-sensitive helpers such as URL validation, masking/redaction, auth, CSRF, registration guards, quota, request limits, queue behavior, gallery paths, and upload boundaries.
- Run `npm test` before submitting changes unless the change is documentation-only; document when tests were not run.

## Commit & Pull Request Guidelines

Recent history uses concise imperative messages, often with Conventional Commit prefixes, for example `feat: add public gallery likes` or `fix: truncate gallery prompt preview`.

Pull requests should include:

- A short summary of user-visible changes.
- Linked issue/task when available.
- Test evidence (`npm test`) or a note explaining why tests were not run.
- Screenshots or screen recordings for UI changes.
- Any new environment variables, migrations, runtime directories, or security-boundary changes.

## Security & Configuration Tips

Keep `.env` untracked. Keep `generated/`, SQLite databases, WAL files, generated images, prompt example images, and user data out of Git. Production deployments should keep `ALLOW_INSECURE_UPSTREAMS=0`, `ALLOW_PRIVATE_UPSTREAMS=0`, and enable `TRUST_PROXY=1` only behind a trusted proxy that sanitizes forwarding headers. System default API keys are currently stored in SQLite, so protect the `generated/` volume and backups as sensitive material.
