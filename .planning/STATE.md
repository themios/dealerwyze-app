# Project State — DealerWyze

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-29)

**Core value:** Every dealership's data stays completely isolated from every other dealership's data — a breach of tenant isolation is an existential failure.
**Current milestone:** v1.1 Enterprise Hardening
**Current focus:** Phase 0 — Baseline & Infrastructure (not started)

---

## Milestone Status

**v1.1 Enterprise Hardening**
- Audit score at start: 12/20
- Target: 18+/20
- Phases: 6 total
- Requirements: 38 v1 requirements

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Baseline & Infrastructure | ○ Pending | First to execute |
| 1 — BHPH Payment Atomicity | ○ Pending | Depends on Phase 0 |
| 2 — Service-Role Narrowing | ○ Pending | Depends on Phase 0 triage |
| 3 — Lint Correctness Cleanup | ○ Pending | Depends on Phase 0, 2 |
| 4 — Distributed State & Schemas | ○ Pending | Depends on Phase 3 |
| 5 — CI Gates & Audit Logging | ○ Pending | Depends on Phases 1, 2, 3, 4 |

---

## Open Todos

- None yet — milestone just initialized.

---

## Key Context for Next Session

- Service-role triage has not been run yet. Phase 0 must do it before any refactor work starts.
- BHPH payment confirm route location needs to be confirmed at phase start.
- Gmail Pub/Sub subscription must be confirmed migrated to OIDC before Phase 4 removes the legacy path.
- Test database strategy: Vitest + Supabase local or a dedicated test project — to be decided in Phase 0.

---
*State updated: 2026-04-29 — milestone v1.1 initialized*
