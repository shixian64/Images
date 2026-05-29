# Frontend Directory Structure

## Layout

```text
public/index.html          # main authenticated app shell
public/login.html          # login/register shell
public/app.js              # bootstraps the authenticated app
public/styles.css          # global styles and component classes
public/modules/            # browser ES modules, one feature per file
shared/constants.js        # browser-safe constants shared with backend
```

There is no frontend package manager, bundler, JSX, React component tree, or `src/` directory.

## Module Roles

- `public/app.js` is the entrypoint. It verifies auth, exposes admin-only UI, and calls `mount*` functions.
- `public/modules/auth.js` owns `apiFetch()`, `/api/auth/me`, logout, and current-user sharing.
- `public/modules/state.js` owns all localStorage keys and user-scoped key helpers.
- `public/modules/dom.js` owns small DOM helpers (`$`, `$$`, `escapeHtml`, `setStatus`, `maskKey`).
- Feature modules own their panels: `studio.js`, `profiles.js`, `gallery.js`, `jobs.js`, `logs.js`, `users.js`, `prompts.js`.
- Small UI utilities live in focused modules such as `dialog.js`, `drawer.js`, `selects.js`, `nav.js`, and `theme.js`.

## Adding New UI Behavior

Prefer extending the existing feature module that owns the panel. Create a new module only when the behavior is reusable or has an independent panel/lifecycle.

Examples:

- Add generation form behavior in `public/modules/studio.js`.
- Add job queue behavior in `public/modules/jobs.js`.
- Add localStorage keys through `public/modules/state.js`, not scattered string literals.
- Add constants used by both browser and backend to `shared/constants.js` only if they remain browser-safe.

## Imports

Browser modules use relative ES module imports. Shared constants are imported as `../../shared/constants.js` from `public/modules/*`.

Do not import Node-only modules into browser code. Do not add package-based imports unless the project intentionally introduces a bundler.

## Naming

- Module files use kebab-case or short feature names matching existing files.
- Public mount functions use `mount<Name>Panel()` or `mount<Name>()`.
- DOM IDs referenced from modules must exist in `public/index.html` or `public/login.html`.
