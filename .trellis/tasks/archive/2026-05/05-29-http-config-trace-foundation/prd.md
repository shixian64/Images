# P0: HTTP errors, config center, and trace-id foundation

## Goal

Unify backend HTTP error semantics, numeric environment parsing/validation, and request-level trace-id propagation so later observability and frontend error handling have a stable base.

## Requirements

- Add a shared `createHttpError(status, message, code)` while preserving legacy `httpError()` compatibility.
- Ensure HTTP errors expose both `statusCode` and `status`, plus optional machine-readable `code`.
- Centralize repeated positive integer env parsing in `utils/config.js` and validate known env keys at startup.
- Attach a request trace id at the HTTP entrypoint, return it as `x-request-id`, and inject it into backend logs.
- Serialize `Error` objects in structured logs with message and stack instead of losing them as `{}`.
- Preserve latest response trace id in frontend `apiFetch()` and include it in synced client logs.

## Acceptance Criteria

- [x] Repeated env positive-integer parsing is centralized.
- [x] Shared HTTP error factory exists and keeps old status conventions compatible.
- [x] Request responses receive a trace-id header through the HTTP entrypoint helper.
- [x] Unhandled route logs include trace id and serialized error details.
- [x] Frontend client log sync includes the latest trace id.
- [x] Regression tests cover error factory, config fallback/validation, trace header/context, logger error serialization, and client-log trace propagation.
- [x] `npm test` passes.

## Definition of Done

- [x] GitNexus impact was run before editing high-risk symbols.
- [x] GitNexus `detect_changes()` was run after edits.
- [x] Trellis check was run.
- [x] Relevant specs were updated.
- [x] Commit created.

## Out of Scope

- Route table rewrite.
- Third-party logging/config libraries.
- Full frontend interceptor refactor beyond trace-id propagation.

## Technical Notes

- High-risk impact was expected for `utils/http.js:httpError`, `apiFetch`, and duplicated env helpers; implementation kept old behavior compatible and added tests.
