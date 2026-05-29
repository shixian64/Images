# P0: SQLite indexes, retention, sessions, and prompt tag matching

## Goal

Fix data-layer correctness and lifecycle risks: prompt-square tag substring matching, hot-query indexes, WAL tuning, table retention, and expired session cleanup.

## Requirements

- Change prompt-square tag filtering from JSON-string substring matching to element-level matching.
- Add or adjust indexes for hot gallery/search/admin stats queries.
- Tune WAL-related PRAGMAs with safe defaults.
- Add configurable retention/cleanup for audit logs, client logs, and usage rows.
- Ensure expired sessions are cleaned on startup or schedule and covered by tests.

## Acceptance Criteria

- [ ] Tag filtering test proves short tags do not match substrings inside other tags.
- [ ] Schema/index changes are idempotent.
- [ ] Cleanup is configurable and does not delete fresh rows.
- [ ] Session cleanup is invoked and tested.
- [ ] `npm test` passes.

## Out of Scope

- PostgreSQL migration.
- External migration framework.
- Admin UI for audit querying.
