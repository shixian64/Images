# Repository Guidelines

## Project Structure & Module Organization

This repository is a dependency-light Node.js web app for local image generation/profile management.

- `server.js` wires the HTTP server, port, middleware, and routes.
- `routes/` contains API and static route handlers such as `generate.js`, `chat.js`, `gallery.js`, and `auth.js`.
- `services/` holds business logic for upstream calls, SQLite access, quota, users, gallery storage, and security guards.
- `utils/` and `shared/` contain small reusable helpers and constants shared with the frontend.
- `public/` contains browser assets (`index.html`, `app.js`, `styles.css`, and modules).
- `test/` contains Node native test files named `*.test.js`.
- `docs/` contains product/design documentation.
- `generated/` is runtime state (SQLite DB, images, user data) and is ignored by Git.

## Build, Test, and Development Commands

- `npm start` — starts the app with `node --experimental-sqlite server.js` at `http://localhost:8787`.
- `npm test` — runs the Node native test runner over `test/**/*.test.js`.
- `cp .env.example .env` — creates local configuration; set `ADMIN_BOOTSTRAP_TOKEN` before first admin registration.

There is no separate build step. Do not run compile/build commands unless explicitly requested.

## Coding Style & Naming Conventions

- Use ES modules (`import`/`export`) and Node 22.5+ APIs; avoid adding third-party dependencies without justification.
- Prefer 2-space indentation, semicolons, and small single-purpose functions.
- Name files by feature in kebab-case (`gallery-store.js`, `registration-guard.js`).
- Keep route handlers thin; put reusable behavior in `services/` or `utils/`.
- Never persist or log raw API keys; use existing masking helpers.

## Testing Guidelines

- Add or update tests in `test/` with the `feature.test.js` naming pattern.
- Use `node:test` and built-in assertions; keep tests deterministic and avoid real upstream network calls.
- Cover security-sensitive helpers such as URL validation, masking, quota, auth, and request limits.
- Run `npm test` before submitting changes.

## Commit & Pull Request Guidelines

Recent history uses concise imperative messages, often with Conventional Commit prefixes, for example `feat: add public gallery likes` or `fix: truncate gallery prompt preview`.

Pull requests should include:

- A short summary of user-visible changes.
- Linked issue/task when available.
- Test evidence (`npm test`) or a note explaining why tests were not run.
- Screenshots or screen recordings for UI changes.
- Any new environment variables or migration notes.

## Security & Configuration Tips

Keep `.env` untracked. Production deployments should keep `ALLOW_INSECURE_UPSTREAMS=0`, `ALLOW_PRIVATE_UPSTREAMS=0`, and enable `TRUST_PROXY=1` only behind a trusted proxy that sanitizes forwarding headers.
