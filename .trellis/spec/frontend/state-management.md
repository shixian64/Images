# Frontend State Management

## State Sources

The frontend uses plain JavaScript state. There is no Redux, Zustand, React state, or query cache.

State categories:

- Module state: arrays, maps, booleans, and selected IDs stored in each feature module.
- User-scoped localStorage: drafts, personal profiles, prompt history, logs, dismissed jobs.
- Global localStorage: theme and active tab preferences that intentionally outlive a user.
- Server state: users, quotas, jobs, gallery, system-default interface config, admin data.
- Realtime state: job queue snapshots and updates through SSE.

## localStorage Rules

Use `public/modules/state.js` for all localStorage access and keys.

- Add new keys to the `KEYS` object.
- Use `readJsonScoped()` / `writeJsonScoped()` / `readStringScoped()` / `writeStringScoped()` for user-specific data.
- Use unscoped `readString()` / `writeString()` only for global preferences such as theme or active tab.
- Never store raw API keys. `profiles.js` strips persisted secrets with `stripProfileSecrets()` and `withoutPersistedSecrets()`.

The scope suffix is `:<userId>` and comes from `auth.js:getCurrentUserId()`.

## Module State Rules

Keep module state private unless other modules need a narrow exported function. Examples:

- `profiles.js` exports `getEffectiveProfile()`, `getImageConfig()`, `getChatConfig()`, and `onProfilesChanged()` instead of exposing raw mutable arrays.
- `jobs.js` keeps `jobs` private and communicates final results through `CustomEvent`.
- `gallery.js` keeps `galleryItems` private and dispatches `studio-add-reference-image` when Studio should consume a gallery image.

## Server State Refresh

Use explicit refresh functions:

- `refreshSystemDefaultProfile()` / `refreshSystemDefault()` for system-default interfaces.
- `refreshGalleryPanel()` for gallery lists and counts.
- `refreshJobs()` plus `EventSource('/api/jobs/stream')` for queue state.

Do not assume local state is authoritative after a mutating API call. Update from the response or refetch the panel.

## Derived State

Derived values should be recalculated in render/update functions instead of separately persisted:

- Queue grouping and sorting happen in `jobs.js` through `sortJobs()` and render filters.
- Gallery counts and like quota come from `/api/gallery` responses.
- Prompt generation estimates use `estimateDurationMs()` from `shared/constants.js`.

## Common Mistakes

- Persisting user-specific UI state without the scoped helpers, allowing one browser user to see another user's drafts/history.
- Persisting derived state that can drift from server truth.
- Mutating module arrays without a render/emit step afterward.
