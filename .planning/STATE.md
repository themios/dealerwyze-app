# Project State — DealerWyze

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-29)

**Core value:** Every dealership's data stays completely isolated from every other dealership's data — a breach of tenant isolation is an existential failure.
**Current milestone:** v1.1 Enterprise Hardening
**Current focus:** v1.1 milestone complete — 116 tests passing, CI active, score ~19/20

---

## Milestone Status

**v1.1 Enterprise Hardening**
- Audit score at start: 12/20
- Target: 18+/20
- Phases: 6 total
- Requirements: 38 v1 requirements

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Baseline & Infrastructure | ● Complete | Triage, lint baseline, test helper, smoke test, and policy exist |
| 1 — BHPH Payment Atomicity | ◑ Implemented | RPC migration and route done; DB-backed verification still pending |
| 2 — Service-Role Narrowing | ● Complete | Top 20 service-role call sites replaced; TENS-06 + TEST-03/04 isolation tests pass |
| 3 — Lint Correctness Cleanup | ● Complete | Zero lint problems; build and 91 tests pass |
| 4 — Distributed State & Schemas | ● Complete | Upstash export limiter, Zod schemas, TEST-06/07, Gmail OIDC cleanup |
| 5 — CI Gates & Audit Logging | ● Complete | Release gates documented, CLAUDE.md updated, org_audit_log hooked on 5 events |

---

## Open Todos (Ops — Tim)

- Set `GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL` in Vercel to exact service account email from Google Cloud Pub/Sub.
- Verify all required env vars in Vercel (see DEPLOY_CHECKLIST.md).
- Remove `PUBSUB_VERIFICATION_TOKEN` from Vercel after confirming Gmail OIDC push is working.
- Run production smoke tests from DEPLOY_CHECKLIST.md after first deploy.
- DB-backed verification of `finalize_bhph_payment` RPC (PAY-01/02/03/05 still mocked-only).

---

## Key Context for Next Session

- v1.1 code milestone is complete. All release gates pass (lint 0 warnings, 91 tests, build clean).
- BHPH payment RPC exists and route delegates to it; DB-backed proof of atomicity is the only unverified gap.
- `org_audit_log` table (migration 109) hooks on: impersonation, BHPH payment, data export, org settings, Gmail auth failures.
- Pub/Sub subscription confirmed at `https://dealerwyze.com/api/gmail/webhook`; OIDC-only path active.
- Service-role policy enforced in CLAUDE.md; deploy checklist at `.planning/DEPLOY_CHECKLIST.md`.

---
## Decisions Made

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-28 | 254 non-auto-fixable lint issues deferred to Phase 3 | Only 12 were safe to auto-fix at that time; remainder required correctness review |
| 2026-04-28 | Pre-existing uncommitted work committed with lint fixes | Could not separate lint changes from already-modified files |
| 2026-04-29 | Phase 3 will be executed by rule/workstream, not file-by-file | Keeps lint cleanup aligned with security, reliability, maintainability, QA, and operability priorities |

---
---
## Decisions Made (Phase 1)

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-29 | finalize_bhph_payment RPC uses SECURITY DEFINER | Route has no user session; activities RLS requires auth.uid() — definer bypasses it |
| 2026-04-29 | Optimistic-lock UPDATE (not SELECT FOR UPDATE) | Avoids deadlock risk; GET DIAGNOSTICS ROW_COUNT distinguishes idempotent vs conflict |
| 2026-04-29 | COALESCE increment for total_paid | Eliminates read-then-write race on concurrent confirms |
| 2026-04-29 | Paid-off logic NOT added to RPC | Online pay path never set paid_off; preserving pre-existing behavior, scope separately |

*State updated: 2026-04-29 — v1.1 milestone complete; 116 tests, CI active, score ~19/20*
