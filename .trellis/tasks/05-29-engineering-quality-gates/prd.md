# P1: Lint, format, typecheck, coverage, and minimal CI

## Goal

Add lightweight quality gates without introducing a build step.

## Requirements

- Evaluate dependency-light lint/format/typecheck options for plain ES modules.
- Add npm scripts for lint, format check, typecheck or equivalent JS checking, and coverage if selected.
- Add minimal GitHub Actions CI that runs allowed checks only.
- Document that the project has no build step and CI must not run build/compile commands.

## Acceptance Criteria

- [ ] Scripts are documented and pass locally.
- [ ] CI workflow runs tests and selected gates only.
- [ ] Any new dependency has a written justification.
- [ ] No build/compile step is introduced.

## Out of Scope

- TypeScript migration.
- Frontend bundler introduction.
- Full test-suite expansion in one task.
