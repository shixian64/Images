# Image Studio optimization roadmap

## Goal

Turn the project review into an ordered, executable Trellis roadmap. This parent task only tracks planning and sequencing; product code changes live in child tasks.

## Ordering Principles

1. Foundations first: shared HTTP errors, config parsing, data lifecycle, trace-id, and quality gates.
2. Real correctness risks before broad refactors.
3. Small serial PRs: every child task must have its own tests and GitNexus impact review before code edits.
4. No build/compile commands unless explicitly allowed; `npm test` is the standard verification command.

## Milestones

### M0 - P0 hardening

- `05-29-http-config-trace-foundation`
- `05-29-sqlite-data-lifecycle-hardening`
- `05-29-runtime-sse-resource-hardening`
- `05-29-engineering-quality-gates`

### M1 - P1 correctness and operations

- `05-29-frontend-state-api-resilience`
- `05-29-quota-audit-reporting`

### M2 - P2/P3 product directions

- `05-29-creative-workflow-mvp`
- `05-29-community-sharing-growth`
- `05-29-platform-expansion-research`

## Acceptance Criteria

- [x] Parent roadmap task exists.
- [x] Child tasks exist with PRDs and context jsonl files.
- [x] P0/P1/P2/P3 priority order is clear.
- [ ] Child tasks are completed in order.

## Out of Scope

- Direct product-code implementation in this parent task.
- Build/compile commands.
