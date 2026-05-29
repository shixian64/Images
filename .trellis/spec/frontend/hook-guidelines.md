# Frontend Lifecycle and Shared Logic Guidelines

## No React Hooks

This project has no React runtime and no custom hooks. Do not introduce `use*` hooks or hook-like framework assumptions unless the frontend is intentionally migrated.

The local equivalent is a browser ES module with:

- Module-scoped state.
- A `mount*` function that binds DOM listeners and starts timers/SSE subscriptions.
- Explicit refresh/render functions.
- Listener sets or `CustomEvent` for cross-module notifications.

## Mount Pattern

Use `mount*` functions for lifecycle work. Good examples:

- `mountStudioPanel()` populates selects, restores prompt drafts, binds form events, listens for queue/gallery events, and sets shortcuts.
- `mountJobQueue()` guards against duplicate mounting, binds queue controls, loads jobs, and opens SSE.
- `mountLogsPanel()` loads scoped logs, attaches client error handlers, schedules log sync, and renders filters.

If a mount function can be called more than once, add a module-level `mounted` boolean like `jobs.js` and `gallery.js`.

## Cross-Module Notifications

Use existing patterns before adding new globals:

- Listener sets: `onProfilesChanged()` in `profiles.js`, `onLogsChanged()` in `logs.js`.
- Browser events: `generation-job-succeeded`, `generation-job-finished`, `studio-add-reference-image`, `app-tab-changed`.
- Shared current user: `auth.js` stores state on `Symbol.for('image-key-manager.currentUser')` so duplicate module instances share auth state.

## Data Fetching

Use `apiFetch()` for all API requests. It adds cookies and CSRF headers for non-GET/HEAD requests and serializes plain-object bodies.

Data-fetching functions should parse JSON defensively with `.catch(() => ({}))`, check `resp.ok`, and surface user-facing errors through `setStatus()` or panel error UI.

## Timers and Streams

When adding intervals or SSE:

- Prefer `EventSource` for server-sent events, as in `jobs.js`.
- Provide a polling fallback when the browser lacks EventSource.
- Clear intervals/listeners on stream close when the API exposes a close event.
- Do not assume browser timer IDs support Node-only methods such as `unref()`.

## Common Mistakes

- Running user-scoped localStorage reads at module load time before `setCurrentUser(me)` has run. Follow `logs.js` and `profiles.js`, which delay loading until mount/init.
- Creating cross-module imports that form cycles; prefer events or listener registration for loose coupling.
