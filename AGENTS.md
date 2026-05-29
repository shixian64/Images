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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Images** (3815 symbols, 8136 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Images/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Images/clusters` | All functional areas |
| `gitnexus://repo/Images/processes` | All execution flows |
| `gitnexus://repo/Images/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
