# Frontend Type Safety and Runtime Validation

## Project Reality

Frontend code is plain JavaScript. There is no TypeScript compiler, no generated types, and no runtime schema library. Type safety comes from explicit normalization, defensive parsing, and shared constants.

Do not add TypeScript-only syntax to browser files unless the project adds a build step.

## Runtime Validation Patterns

Use small local helpers to normalize inputs and server responses:

- `profiles.js` uses `normalizeEndpoint()`, `normalize()`, and `normalizeSystemDefault()` to absorb legacy/local profile shapes.
- `studio.js` clamps `n` to the configured max and normalizes prompt optimization output.
- `jobs.js` uses status sets (`FINAL`, `ACTIVE`) and guarded access to job fields.
- `gallery.js` normalizes display strings through `formatTime()`, `formatBytes()`, and `getImagePrompt()`.
- `state.js` catches JSON parse failures and returns fallbacks.

## Shared Constants

Use `shared/constants.js` for option sets and defaults that must match backend behavior:

- `DEFAULT_IMAGE_MODEL`, `DEFAULT_CHAT_MODEL`.
- `SIZES`, `QUALITIES`, `OUTPUT_FORMATS`.
- `OPTIONAL_PASSTHROUGH_KEYS`, `CHAT_OPTIONAL_PASSTHROUGH_KEYS`.
- `estimateDurationMs()`.

Do not duplicate these constants in frontend modules.

## API Shape Handling

When reading API responses:

- Parse JSON with a fallback: `await resp.json().catch(() => ({}))`.
- Check `resp.ok` before trusting payload content.
- Guard arrays with `Array.isArray()` before mapping.
- Use optional chaining for nested response fields.
- Prefer stable public fields from services, not DB column names.

Examples: `refreshGalleryPanel()` in `gallery.js`, `refreshJobs()` in `jobs.js`, `refreshSystemDefault()` in `profiles.js`.

## Forbidden Patterns

- Relying on backend fields without null/array checks.
- Using DB snake_case as the preferred frontend contract unless the API explicitly returns it for compatibility.
- Adding TypeScript annotations, interfaces, enums, or JSX to `.js` files.
- Duplicating backend validation rules when the backend already owns the security decision; frontend checks should improve UX, not be the security boundary.

## Testing

Pure frontend helper behavior can be tested with `node:test` when it does not require a browser DOM. Existing examples include `test/job-dismissal.test.js` and shared-constant/upstream payload tests. DOM-heavy behavior should be verified manually or with browser automation if a task changes it significantly.
