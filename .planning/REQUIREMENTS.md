# Requirements: DealerWyze v1.1 Enterprise Hardening

**Defined:** 2026-04-29
**Core Value:** Every dealership's data stays completely isolated from every other dealership's data — a breach of tenant isolation is an existential failure.

---

## v1 Requirements

### Tenant Isolation & Service-Role Hardening (TENS)

- [ ] **TENS-01**: A service-role audit inventory classifies all 339 usages into: legitimate, reducible, or wrong
- [ ] **TENS-02**: Scoped query helpers exist that enforce org filter at the API shape level (cannot be called without org context)
- [ ] **TENS-03**: At least the top 20 reducible service-role usages in org-scoped request handlers are replaced with auth-client + scoped helpers
- [ ] **TENS-04**: `createClientForRequest()` for impersonation returns a session-scoped client, not raw service role
- [ ] **TENS-05**: A policy document (CLAUDE.md addition) defines when service-role is permitted and requires documented exception
- [ ] **TENS-06**: Integration tests verify that org A cannot read or mutate org B's data through any tested endpoint

### Payment Atomicity & Reliability (PAY)

- [ ] **PAY-01**: BHPH payment confirmation (token mark-paid + activity log + contract balance/due-date update) executes in a single atomic Supabase RPC
- [ ] **PAY-02**: RPC is idempotent: calling it twice with the same `stripe_payment_intent_id` is safe (no double-payment)
- [ ] **PAY-03**: If the RPC fails, no partial payment state is written — token remains unpaid, contract unchanged
- [ ] **PAY-04**: Migration file exists that creates the RPC in Supabase (no dashboard-only SQL)
- [ ] **PAY-05**: Integration test covers: happy path, double-confirm (idempotency), and simulated mid-flight failure

### Lint & Code Correctness (LINT)

- [ ] **LINT-01**: All auto-fixable lint issues in `app/`, `components/`, `hooks/`, `lib/` are resolved in a single pass
- [ ] **LINT-02**: Hook-order violations are corrected (conditional hook calls removed or restructured)
- [ ] **LINT-03**: `Date.now()` / `new Date()` calls inside render functions are moved to refs, state initializers, or effects
- [ ] **LINT-04**: Synchronous `setState` calls inside `useEffect` without dependency safeguards are corrected
- [ ] **LINT-05**: `any` type usage in payment, auth, webhook, and public ingestion code is replaced with typed alternatives
- [ ] **LINT-06**: `npx eslint app components hooks lib --max-warnings=0` passes with zero problems

### Test Foundation (TEST)

- [ ] **TEST-01**: Vitest (or Jest) is configured with a working test runner and `npm test` passes
- [ ] **TEST-02**: Test helper provides an authenticated Supabase client scoped to a test org (no real prod data)
- [ ] **TEST-03**: Auth/role enforcement tests: unauthenticated request returns 401; wrong-org request returns 404
- [ ] **TEST-04**: Tenant isolation tests: org A token cannot be used to access org B resources across at least 5 distinct endpoint types
- [ ] **TEST-05**: BHPH payment tests cover all PAY requirements (happy path, idempotency, failure rollback)
- [ ] **TEST-06**: Webhook verification tests: invalid Twilio signature returns 403; valid signature proceeds
- [ ] **TEST-07**: Public ingestion tests: web lead capture, booking, and unsubscribe routes tested for correct behavior and abuse resistance
- [ ] **TEST-08**: `npm test` is a release blocker — all tests must pass before deploy

### Distributed State & Legacy Cleanup (OPS)

- [ ] **OPS-01**: Data export cooldown replaced: in-memory Map removed, Upstash rate limiter used instead
- [ ] **OPS-02**: Legacy Gmail push path (`/api/integrations/gmail/push` with `PUBSUB_VERIFICATION_TOKEN`) is removed after confirming Pub/Sub subscription is migrated to OIDC path
- [ ] **OPS-03**: Email signature HTML sanitization replaced with `isomorphic-dompurify` using a strict allowlist

### Schema Validation at Boundaries (SCHEMA)

- [ ] **SCHEMA-01**: Zod schemas defined for all public endpoint request bodies (web lead, booking, unsubscribe, pay token)
- [ ] **SCHEMA-02**: Zod schemas defined for payment and BHPH route request bodies
- [ ] **SCHEMA-03**: Invalid input returns a structured 400 with field-level error detail (no stack trace, no raw DB error)
- [ ] **SCHEMA-04**: Zod validation helper is shared (not duplicated per route)

### CI & Release Gates (CI)

- [ ] **CI-01**: `npm run build` is verified passing before every deploy (already true — maintain it)
- [ ] **CI-02**: `npm test` runs and must pass as a deploy pre-check
- [ ] **CI-03**: `npx eslint app components hooks lib --max-warnings=0` runs and must pass as a deploy pre-check
- [ ] **CI-04**: A deploy checklist document exists listing required checks, env validation steps, and rollback procedure
- [ ] **CI-05**: CLAUDE.md is updated with the release gate policy so it's enforced in every future session

### Audit Logging (AUDIT)

- [ ] **AUDIT-01**: Staff impersonation events (start/end) are written to an `audit_log` table with `org_id`, `staff_id`, `action`, `ip`, `timestamp`
- [ ] **AUDIT-02**: BHPH payment state changes (confirm, void, refund) are written to the audit log
- [ ] **AUDIT-03**: Data export events are written to the audit log
- [ ] **AUDIT-04**: Settings mutations (org_settings, billing, user role changes) are written to the audit log
- [ ] **AUDIT-05**: Webhook auth failures (invalid Twilio sig, bad cron token, failed Gmail OIDC) are written to the audit log

---

## v2 Requirements

### Extended Test Coverage

- **TEST-V2-01**: Every API route has at least a smoke test (auth check + happy path)
- **TEST-V2-02**: E2E browser tests for critical flows (lead → text → sale)
- **TEST-V2-03**: Load tests for SMS send and payment confirm paths

### Monitoring & Alerting

- **MON-01**: Webhook failure rate alerting (PagerDuty or similar)
- **MON-02**: Payment confirm anomaly alerting (double-pays, unexpected failures)
- **MON-03**: Rate-limit spike alerting per org

### Extended Service-Role Hardening

- **TENS-V2-01**: All 339 service-role usages triaged and all "wrong" category usages replaced
- **TENS-V2-02**: RLS policies cover the full data surface (currently relied on application-layer scoping for some tables)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| 100% unit test line coverage | High cost, low signal for security-critical paths; integration tests are the right tool |
| Full RLS migration for `customers` and `activities` tables | Schema has no `org_id`; migration is high-risk and deferred to a dedicated schema milestone |
| Auth system replacement | Supabase Auth is working; not a hardening gap |
| New product features | This milestone is hardening-only; no new dealer-facing functionality |
| Real-time monitoring infrastructure | Deferred to v2; Sentry + Vercel logs cover immediate needs |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TENS-01 | Phase 0 | Pending |
| TENS-02 | Phase 2 | Pending |
| TENS-03 | Phase 2 | Pending |
| TENS-04 | Phase 2 | Pending |
| TENS-05 | Phase 2 | Pending |
| TENS-06 | Phase 2 | Pending |
| PAY-01 | Phase 1 | Pending |
| PAY-02 | Phase 1 | Pending |
| PAY-03 | Phase 1 | Pending |
| PAY-04 | Phase 1 | Pending |
| PAY-05 | Phase 1 | Pending |
| LINT-01 | Phase 0 | Pending |
| LINT-02 | Phase 3 | Pending |
| LINT-03 | Phase 3 | Pending |
| LINT-04 | Phase 3 | Pending |
| LINT-05 | Phase 3 | Pending |
| LINT-06 | Phase 3 | Pending |
| TEST-01 | Phase 0 | Pending |
| TEST-02 | Phase 0 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 2 | Pending |
| TEST-05 | Phase 1 | Pending |
| TEST-06 | Phase 4 | Pending |
| TEST-07 | Phase 4 | Pending |
| TEST-08 | Phase 5 | Pending |
| OPS-01 | Phase 4 | Pending |
| OPS-02 | Phase 4 | Pending |
| OPS-03 | Phase 4 | Pending |
| SCHEMA-01 | Phase 4 | Pending |
| SCHEMA-02 | Phase 4 | Pending |
| SCHEMA-03 | Phase 4 | Pending |
| SCHEMA-04 | Phase 4 | Pending |
| CI-01 | Phase 5 | Pending |
| CI-02 | Phase 5 | Pending |
| CI-03 | Phase 5 | Pending |
| CI-04 | Phase 5 | Pending |
| CI-05 | Phase 5 | Pending |
| AUDIT-01 | Phase 5 | Pending |
| AUDIT-02 | Phase 5 | Pending |
| AUDIT-03 | Phase 5 | Pending |
| AUDIT-04 | Phase 5 | Pending |
| AUDIT-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-29*
*Last updated: 2026-04-29 — initial definition*
