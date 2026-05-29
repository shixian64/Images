# Frontend Development Guidelines

The frontend is a framework-free browser ES module app under `public/`. It uses static HTML, feature modules, shared constants, localStorage, `fetch`, `EventSource`, and DOM rendering. There is no React, no hooks runtime, no bundler, and no TypeScript build step.

## Pre-Development Checklist

Before changing frontend code:

1. Read [Directory Structure](./directory-structure.md) to place code in the correct module.
2. Read [Component Guidelines](./component-guidelines.md) for DOM rendering and event binding patterns.
3. Read [State Management](./state-management.md) for localStorage scoping, module state, events, and server state refresh.
4. Read [Type Safety](./type-safety.md) for runtime validation expectations in plain JavaScript.
5. Read [Quality Guidelines](./quality-guidelines.md) for escaping, `apiFetch`, accessibility, and testing expectations.
6. [Hook Guidelines](./hook-guidelines.md) documents the local non-React equivalent patterns; read it when adding lifecycle or shared stateful behavior.

## Guides

| Guide | Use for |
| --- | --- |
| [Directory Structure](./directory-structure.md) | Static HTML, app entrypoint, feature module placement |
| [Component Guidelines](./component-guidelines.md) | Render functions, DOM updates, event delegation, accessibility |
| [Hook Guidelines](./hook-guidelines.md) | `mount*` lifecycle and listener patterns in a no-framework app |
| [State Management](./state-management.md) | Scoped localStorage, module globals, custom events, SSE |
| [Quality Guidelines](./quality-guidelines.md) | XSS prevention, API access, UI feedback, tests |
| [Type Safety](./type-safety.md) | Runtime shape checks and normalization in JavaScript |

## Key Frontend Flows

- `public/app.js` checks `/api/auth/me`, stores current user, then mounts panels.
- `public/modules/auth.js` centralizes authenticated fetch behavior and current-user sharing.
- `public/modules/profiles.js` manages local personal interface profiles and system-default interface summaries.
- `public/modules/studio.js` builds generation requests, handles prompt optimization, reference images, and result preview.
- `public/modules/jobs.js` submits persistent generation jobs and keeps the job queue live through SSE.
- `public/modules/gallery.js` lists private/public gallery images and dispatches reference-image events back to Studio.
