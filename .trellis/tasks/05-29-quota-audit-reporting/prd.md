# P1: Quota model documentation, usage reporting, and audit query APIs

## Goal

Clarify system-vs-personal interface quota/accounting behavior and provide admin-visible usage and audit reporting.

## Requirements

- Document how system default, personal interface, admin, and failed generation calls count toward quota/cost.
- Add or derive `interface_mode` for usage reporting.
- Add `/api/admin/quota/report` with date range, user, interface mode, grouping, and CSV export.
- Add audit query service/API with pagination and admin protection.
- Add admin analytics UI for cost/report data.

## Acceptance Criteria

- [ ] Quota semantics are documented.
- [ ] Report SQL covers filters and grouping.
- [ ] CSV output is stable and documented.
- [ ] Audit query is paginated and permission protected.
- [ ] Tests cover permission, filters, and date boundaries.

## Out of Scope

- Stripe or real billing.
- PostgreSQL migration.
