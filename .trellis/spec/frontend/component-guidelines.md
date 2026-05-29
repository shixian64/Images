# Frontend Component Guidelines

## Local Component Model

This app does not use a component framework. A "component" is usually a render function plus event listeners inside a feature module.

Local examples:

- `public/modules/gallery.js:renderGallery()` renders gallery cards and binds delegated card actions.
- `public/modules/jobs.js:renderQueue()` renders running, queued, and recent job sections.
- `public/modules/profiles.js:renderAll()` coordinates several smaller render functions for the Profiles panel.
- `public/modules/studio.js:renderImages()` and `renderReferences()` update Studio preview/reference regions.

## Rendering Rules

- Use `escapeHtml()` from `public/modules/dom.js` for every user-controlled value inserted into `innerHTML`.
- Prefer one render function per visual area, and call it after state changes.
- Keep generated HTML strings small enough to review; split complex UI into helper render functions.
- For repeated card/list UI, use event delegation on the container rather than attaching many per-item listeners after every render.

Examples of event delegation: `savedGallery` click handling in `gallery.js`, queue card actions in `jobs.js`, Studio preview/reference actions in `studio.js`.

## DOM Access

Use `$()` / `$$()` from `public/modules/dom.js` instead of repeating `document.getElementById()` and `querySelectorAll()` boilerplate.

Do not query DOM elements at module top level when auth/user context or panel HTML may not be ready. Bind inside `mount*` functions.

## Accessibility and Feedback

- Buttons that toggle state should update `aria-pressed` or `aria-selected` where existing patterns do.
- Dialog-like overlays should set `role="dialog"`, `aria-modal="true"`, focus a close button, and restore focus on close. See image preview modals in `gallery.js` and `studio.js`.
- Use `setStatus()` for short operational feedback and visible error containers for task-specific failures.
- Preserve keyboard shortcuts and Escape-to-close behavior where panels already implement them.

## Styling

Styling is global in `public/styles.css`. Add semantic class names that match existing patterns (`*-card`, `*-meta`, `chip`, `ghost`, `empty-state`) and avoid inline styles except unavoidable generated attributes.

## Common Mistakes

- Inserting prompts, usernames, filenames, or error text into `innerHTML` without `escapeHtml()`.
- Binding the same listener multiple times because a `mount*` function can be called again; use module-level `mounted` guards where needed.
- Putting data-fetch logic in a render function instead of separating refresh/fetch from render.
