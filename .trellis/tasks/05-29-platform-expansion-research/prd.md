# P3: Platform expansion research for PostgreSQL, i18n, offline, local models, and plugins

## Goal

Research strategic platform directions before implementation.

## Requirements

- PostgreSQL migration design: pooling, migrations, SQLite compatibility, import/export.
- i18n design: string inventory, resource files, fallback strategy.
- Offline-first design: Service Worker, IndexedDB drafts, sync conflicts.
- Local model inference design: Ollama/LM Studio capability discovery and security boundaries.
- Figma/Adobe interop research: auth, asset transfer, plugin security constraints.

## Acceptance Criteria

- [ ] Each direction has a research/ADR artifact.
- [ ] Dependencies on P0/P1 foundations are explicit.
- [ ] No product code is changed without a follow-up implementation task.

## Out of Scope

- Direct implementation.
- New third-party services/dependencies.
