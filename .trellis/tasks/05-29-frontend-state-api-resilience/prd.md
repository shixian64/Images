# P1: Frontend state lifecycle, apiFetch interceptor, and SSE resilience

## Goal

Reduce frontend state/listener sprawl and improve API/SSE failure handling while staying framework-free.

## Requirements

- Define a lightweight mount/unmount lifecycle convention for modules.
- Clean up high-risk repeated listeners, timers, and observers.
- Upgrade `apiFetch` behavior for consistent 401/5xx/network handling without breaking callers.
- Add SSE backoff, visibility handling, and duplicate-connection prevention.
- Address selected accessibility issues in dynamic tables/forms.

## Acceptance Criteria

- [ ] At least one high-risk module is migrated to a lifecycle with cleanup.
- [ ] API error behavior is consistent and tested or manually verified.
- [ ] SSE reconnect does not create duplicate streams.
- [ ] Accessibility fixes have verification notes.

## Out of Scope

- React/Vue/Next.js migration.
- Full rewrite of all frontend modules.
- Build-chain introduction.
