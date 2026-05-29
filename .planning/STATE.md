# Project State — Wyze Platform

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-28)

**Core value:** Every org's data stays completely isolated from every other org's data — and every vertical's admin view shows only its own orgs. A breach of tenant isolation or vertical scoping is an existential failure.
**Current milestone:** v2.0 — RealtyWyze Full Feature Build
**Current focus:** Roadmap defined. Pre-build actions in progress. Phase 7 (Listing Intelligence) is next.

---

## Milestone Status

### v2.0 — RealtyWyze Full Feature Build

- Phases: 7 total (Phases 7–13)
- Requirements: 47 v1 requirements
- Migration numbering: starts at 189

| Phase | Status | Notes |
|-------|--------|-------|
| 7 — Listing Intelligence | In progress | Plans 07-01 (foundation), 07-02 (URL/photo/text import), 07-03 (MLS/metrics/CMA) complete. |
| 8 — Showings | In progress | Plans 08-01 (foundation), 08-02 (CRUD API: POST/GET/PATCH/DELETE /api/showings), 08-03 (Cal.com webhook handler) complete. |
| 9 — Transactions & Commissions | Pending | Pre-build: broker interviews required before TXN-05/06 |
| 10 — Listing Video | Pending | Depends on Phase 7 listing records |
| 11 — AI Voice (Retell RE) | Pending | Pre-build: RETELL_RE_AGENT_ID env var required |
| 12 — Public Listing Site | Pending | Pre-build: iHomeFinder IDX application submitted (30–90 days) |
| 13 — Integrations | Pending | Pre-build: DocuSign sandbox credentials required |

---

### v1.1 — Enterprise Hardening (Complete)

- Audit score at start: 12/20
- Final score: ~19/20
- Phases: 6 total (Phases 0–5)
- Requirements: 38 v1 requirements

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Baseline & Infrastructure | Complete | Triage, lint baseline, test helper, smoke test, and policy exist |
| 1 — BHPH Payment Atomicity | Implemented | RPC migration and route done; DB-backed verification pending |
| 2 — Service-Role Narrowing | Complete | Top 20 service-role call sites replaced; tenant isolation tests pass |
| 3 — Lint Correctness Cleanup | Complete | Zero lint problems; build and 91 tests pass |
| 4 — Distributed State & Schemas | Complete | Upstash export limiter, Zod schemas, Gmail OIDC cleanup |
| 5 — CI Gates & Audit Logging | Complete | Release gates documented, CLAUDE.md updated, audit_log on 5 events |

---

## Open Todos (Ops — Tim)

### v2.0 Pre-Build (Start Immediately)
- [ ] Submit iHomeFinder IDX approval application — 30–90 day process, blocks Phase 12
- [ ] Obtain RentCast API key ($74/mo) — blocks Phase 7 LIST-03 and LIST-05
- [ ] Obtain Apify API key + test Zillow actor against a sample listing — blocks Phase 7 LIST-01
- [ ] Interview 2 brokers about commission split structures — blocks Phase 9 TXN-05/06
- [ ] Create Retell RE agent in dashboard; set RETELL_RE_AGENT_ID env var — blocks Phase 11
- [ ] Create DocuSign developer sandbox; get CLIENT_ID + CLIENT_SECRET — blocks Phase 13
- [ ] Verify Cal.com Platform API tier for multi-org programmatic booking — blocks Phase 8 SHOW-06/07

### v1.1 Carryover
- Set `GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL` in Vercel to exact service account email from Google Cloud Pub/Sub.
- Verify all required env vars in Vercel (see DEPLOY_CHECKLIST.md).
- Remove `PUBSUB_VERIFICATION_TOKEN` from Vercel after confirming Gmail OIDC push is working.
- DB-backed verification of `finalize_bhph_payment` RPC (PAY-01/02/03/05 still mocked-only).

---

## Key Context for Next Session

- v1.1 is complete. All release gates pass (lint 0 warnings, 116 tests, build clean).
- v2.0 roadmap is defined: 7 phases, 47 requirements, migrations 189–199.
- Phase 7 is first: Listing Intelligence (LIST-01–07). Requires RentCast + Apify keys before coding.
- `vehicles` table stores RE listings — any migration touching it needs dealer smoke-test gate.
- `showings`, `transactions`, `commission_plans` tables exist from migration 180 — extend additively.
- Public listing site (Phase 12) has NO auth — org detection via `agency_slugs` slug→org_id lookup only.
- Admin API routes always use `getAdminVerticalScope(req)` — `x-vertical` never reaches `/api/` routes.
- `RETELL_RE_AGENT_ID` is a separate env var from `RETELL_AGENT_ID` (dealer). Both must coexist.
- DocuSign sandbox throughout Phase 13; production OAuth requires DocuSign app approval separately.

---

## Decisions Made

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-28 | Apify for URL scraping (not DIY) | Zillow ToS + CFAA exposure makes DIY scraping legally prohibited |
| 2026-05-28 | RentCast for MLS# lookup and CMA | $74/mo, covers target markets, avoids full IDX compliance |
| 2026-05-28 | Cal.com iframe embed + webhook (not full API white-label) | Simpler integration; agents already use Cal.com |
| 2026-05-28 | Separate RETELL_RE_AGENT_ID (not extending dealer agent) | Clean RE persona, no coupling to dealer prompts |
| 2026-05-28 | agency_slugs table for subdomain→org_id (not host-header trust) | Secure: org derived from DB lookup, never from request |
| 2026-05-28 | Commission calculation stored as jsonb at close time | Avoid recalc on every read; plan changes don't retroactively affect closed deals |
| 2026-05-28 | DocuSign sandbox for Phase 13; production approval separate | DocuSign production OAuth requires their review process |
| 2026-05-28 | IDX feed deferred to v2 requirements | 30–90 day MLS board approval; manual import covers v2.0 launch |

---

| 2026-05-28 | RentCast lookup best-effort in import-mls (API errors don't block insert; key absence → 503) | Keeps import functional even when RentCast has transient issues |
| 2026-05-28 | import_source='mls_import' (not 'mls') | Distinguishes manual MLS# import from future direct MLS feed |

*State updated: 2026-05-28 — 07-02 complete: URL/photo/text extraction routes (LIST-01, LIST-02) built and committed*
*State updated: 2026-05-28 — 07-03 complete: RentCast wrapper + LIST-03/04/05 API routes built and committed*
*State updated: 2026-05-28 — 08-01 complete: migration 192 (3 showings + 2 org_settings columns), updateCalendarEvent(), calWebhookLimiter, CALCOM_WEBHOOK_SECRET documented*
*State updated: 2026-05-28 — 08-03 complete: POST /api/cal/webhook — HMAC, rate-limit, dedup, BOOKING_CREATED/CANCELLED/RESCHEDULED, cross-tenant spoofing block*
