# P1: Runtime limits, SSE utilities, and cache headers

## Goal

Improve long-running single-node stability by addressing rate-limit map growth, duplicated SSE handling, maintenance scan costs, and immutable image caching.

## Requirements

- Add key cleanup and a max-key policy to rate limiting.
- Extract a shared SSE helper for write, heartbeat, and close cleanup.
- Page maintenance/orphan scans and parallelize file stat calls with a cap.
- Add long-lived cache headers and ETag for immutable saved images while preserving no-cache for sensitive/dynamic responses.

## Acceptance Criteria

- [ ] Rate-limit tests cover expired key deletion and max-key behavior.
- [ ] SSE close removes subscribers and clears timers.
- [ ] Maintenance scan avoids unbounded `SELECT *` loading.
- [ ] Static image cache headers are tested.
- [ ] `npm test` passes.

## Out of Scope

- WebSocket migration.
- CDN/object-storage integration.
- Full job queue rewrite.
