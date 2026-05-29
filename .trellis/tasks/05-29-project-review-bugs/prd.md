# Review current project shortcomings and bugs

## Goal

Use Trellis to review the current `Images` Node.js web app for evidence-backed shortcomings, likely bugs, security risks, and maintainability issues. The review should prioritize current worktree behavior and repository specs over assumptions.

Follow-up implementation request: after the review report was produced, the user asked to “逐个修复”. The task now includes fixing the actionable product-code findings from the review in priority order, with regression tests for each fixed behavior.

## What I already know

- User requested: "使用trellis review 当前项目的不足之处以及bug".
- Project is a dependency-light Node.js 22.5+ ES module app with native `node:http` and `node:sqlite`.
- There is no build step; compile/build commands are forbidden unless explicitly requested.
- Normal test command is `npm test`, which uses Node's native test runner and is allowed for review evidence.
- GitNexus index was refreshed with `npx gitnexus analyze` before structural review.
- GitNexus route/shape tools currently do not detect native HTTP routes in this project, so API review must combine source inspection and tests.

## Assumptions

- Initial review was review-only; the follow-up implementation phase should fix F1-F5 from the review report with minimal, test-backed changes.
- Findings should include evidence: file paths, relevant behavior, and suggested verification/fix direction.
- Security-sensitive areas get priority: auth/session/CSRF, upstream URL handling, generated file access, quota, job queue, API keys, logging, and frontend XSS/API request patterns.

## Requirements

- Inspect current repository state and Trellis specs before judging issues.
- Run safe automated checks where useful, especially `npm test`.
- Review backend and frontend high-risk flows using source, tests, and GitNexus where available.
- Produce a findings list with severity/risk, evidence, impact, and recommended next action.
- During the implementation phase, keep product changes scoped to the reviewed findings and avoid unrelated refactors.

## Acceptance Criteria

- [x] Current worktree state has been inspected.
- [x] Applicable Trellis backend/frontend quality guidelines have been consulted.
- [x] GitNexus has been used or its limitation recorded.
- [x] `npm test` result has been captured, or a concrete reason for not running it is recorded.
- [x] At least the following areas have been sampled: auth/session, API route dispatch, upstream calls, generated file access, job/gallery/quota flows, frontend API/XSS patterns.
- [x] Findings are evidence-backed and separated from assumptions.
- [x] F1 frontend local log redaction is fixed and covered by regression tests.
- [x] F2 multipart boundary parsing is fixed and covered by regression tests.
- [x] F3 invalid admin bootstrap token attempts are rate limited and covered by regression tests.
- [x] F4 malformed upstream image success responses fail safely and are covered by regression tests.
- [x] F5 prompt-square/admin-gallery list filtering and counting are pushed into DB/service wrappers and covered by regression tests.

## Out of Scope

- Dependency upgrades, UI redesigns, data migrations, and external service changes.
- Build/compile commands.
- External penetration testing outside the local project and configured sandbox.

## Technical Notes

- Trellis task directory: `.trellis/tasks/05-29-project-review-bugs`.
- Backend specs: `.trellis/spec/backend/index.md`, `.trellis/spec/backend/quality-guidelines.md`.
- Frontend specs: `.trellis/spec/frontend/index.md`, `.trellis/spec/frontend/quality-guidelines.md`.
- Review artifacts should be written under this task directory if the finding set becomes large.

## Review Output

- Findings report: .trellis/tasks/05-29-project-review-bugs/research/current-project-review.md.

