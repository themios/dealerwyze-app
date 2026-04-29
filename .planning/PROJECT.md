# DealerWyze

## What This Is

DealerWyze is a multi-tenant SaaS CRM for independent used-car dealerships. It covers the full dealership workflow: lead capture and follow-up, inventory management, customer communications (SMS, email, voice AI), BHPH payment collections, marketing, and platform administration. Each dealership operates as an isolated tenant. Apollo Auto is the internal test tenant.

## Core Value

Every dealership's data stays completely isolated from every other dealership's data — a breach of tenant isolation is an existential failure.

## Requirements

### Validated

- ✓ Multi-tenant org isolation via Supabase RLS + authenticated profile scoping
- ✓ Lead capture and CRM workflow (leads, customers, vehicles, activities, tasks)
- ✓ SMS/MMS via Twilio with opt-out compliance
- ✓ Email via Gmail integration with IMAP/SMTP and push webhooks
- ✓ BHPH payment ledger with token-based reminders
- ✓ Inventory management with documents, photos, and AI summarization
- ✓ Platform admin with staff impersonation and org lifecycle
- ✓ Stripe billing and subscription gating
- ✓ Upstash Redis-backed rate limiting for SMS, AI, and public endpoints
- ✓ Vercel deployment with staging and production scripts

### Active (Milestone v1.1 — Enterprise Hardening)

- [ ] Service-role blast radius reduced: scoped helpers enforce org filter at API shape level
- [ ] Impersonation returns scoped client, not raw service role
- [ ] BHPH payment finalization is atomic (single DB transaction or RPC)
- [ ] Payment idempotency enforced on stripe_payment_intent_id
- [ ] Lint passes with zero errors in source (correctness issues fixed)
- [ ] Integration test suite covers auth, tenancy, payments, webhooks, and public ingestion
- [ ] Export cooldown moved from process-local Map to Upstash
- [ ] Legacy Gmail PUBSUB_VERIFICATION_TOKEN path removed
- [ ] Email signature sanitized via vetted HTML sanitizer (DOMPurify)
- [ ] CI gates: build + test + lint on every deploy
- [ ] Audit logging for impersonation, payment mutations, exports, settings changes
- [ ] Zod schema validation at public and payment route boundaries

### Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile native app | Web-first; not in current roadmap |
| Real-time collaborative editing | No current use case |
| Full test coverage (100%) | Target is integration coverage of high-risk paths, not line coverage |
| Auth system replacement | Supabase Auth is working and validated |

## Context

**Audit baseline (2026-04-29):** Score 12/20.
- Security: 2/4 — service-role blast radius and BHPH atomicity are open P1s
- Reliability: 3/4 — BHPH payments lack DB-level transaction guarantees
- Maintainability: 2/4 — 297 lint problems; no schema validation at boundaries
- QA/Testing: 1/4 — 4 test files, 38 tests against 218 API route files
- Operability: 4/4 — build passes, deploy scripts exist, Upstash rate limiting in place

**Target:** 18/20 (enterprise-acceptable for high-trust dealership rollout).

**Key architectural facts:**
- 339 usages of `createServiceClient()` or `createClientForRequest()` across app/ and lib/
- `customers` table has no `org_id` — org scoping relies on `user_id` and profile context
- `activities` table has no `org_id` — inserting org_id breaks writes
- Staff impersonation uses signed `dealerwyze_staff_org_id` cookie + `STAFF_SESSION_SECRET`
- `forRequest.ts` currently upgrades impersonated requests to full service-role client
- BHPH confirm flow: token update → activity insert → contract mutation (three separate writes)

## Constraints

- **Security**: Never trust org_id from request input — always derive from `requireProfile()`
- **Multi-tenancy**: Every DB read/write in a request handler must be scoped to authenticated org
- **Compatibility**: No breaking changes to existing API contracts or DB schema columns in use
- **Deploy**: Supabase RPC additions require migration files — no dashboard-only SQL
- **Stack**: Next.js App Router, TypeScript, Supabase, Vercel — no stack changes this milestone

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase RPC for BHPH atomicity | Postgres transactions not available from Next.js edge; RPC gives atomicity within a single DB call | — Pending |
| DOMPurify (isomorphic-dompurify) for HTML sanitization | Vetted allowlist parser vs. fragile custom regex | — Pending |
| Upstash for all distributed state (rate limits, cooldowns) | Consistent across Vercel instances and cold starts | ✓ Good |
| Integration tests over unit tests for high-risk paths | Tests the actual security boundary, not mocked internals | — Pending |

---
*Last updated: 2026-04-29 — milestone v1.1 Enterprise Hardening initialized*
