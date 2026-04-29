# Roadmap: DealerWyze v1.1 — Enterprise Hardening

**Milestone:** v1.1 Enterprise Hardening
**Goal:** Move from audit score 12/20 to 18+/20. Close all P1 security/reliability gaps, fix lint correctness, build integration test foundation, add CI gates and audit logging.
**Phases:** 6
**Requirements:** 38 v1 requirements
**Started:** 2026-04-29

---

## Phase 0 — Baseline & Infrastructure

**Goal:** Establish the measurement baseline before touching anything. Run the service-role triage that informs Phase 2 scope. Fix all auto-fixable lint to clear noise. Wire up the test runner so every subsequent phase can add tests as it goes.

**Why first:** You cannot safely refactor what you cannot measure. The service-role triage output directly determines Phase 2 scope. Auto-fix lint in isolation has zero correctness risk — do it before the hard phases add new code. The test runner must exist before Phase 1 so PAY tests can be written alongside the code.

**Requirements covered:**
- TENS-01: Service-role audit inventory (all 339 usages classified)
- LINT-01: Auto-fixable lint resolved
- TEST-01: Test runner configured, `npm test` passes
- TEST-02: Test helper with scoped auth client for test org

**Tasks:**
1. Run `grep -rn "createServiceClient\|createClientForRequest" app/ lib/ --include="*.ts"` and export full list
2. Classify each usage: `legitimate` (storage signing, cron, admin), `reducible` (org-scoped handler that could use auth client), `wrong` (reads org data without org filter)
3. Write triage output to `.planning/service-role-triage.md` with counts by category and top 20 reducible targets
4. Run `npx eslint app components hooks lib --fix` for auto-fixable issues only
5. Verify build still passes after lint auto-fix
6. Install Vitest + `@supabase/supabase-js` test utilities; configure `vitest.config.ts`
7. Create `lib/__tests__/helpers/testClient.ts` — returns Supabase client scoped to isolated test org
8. Write one passing smoke test to confirm the test runner works
9. Add CLAUDE.md entry: service-role policy (when it's permitted, requires documented exception)

**Success criteria:**
- `.planning/service-role-triage.md` exists with all 339 usages classified and top 20 reducible targets named
- `npm run build` passes after lint auto-fix
- `npm test` runs and at least 1 test passes
- Test helper creates an isolated org-scoped client without hitting production data

**Estimated effort:** 1–2 days

---

## Phase 1 — BHPH Payment Atomicity

**Goal:** Make BHPH payment confirmation a single atomic operation. Currently three sequential writes (token update → activity insert → contract mutation) can leave partial state on failure. Convert to a Supabase RPC that runs inside a Postgres transaction.

**Why second:** Highest financial risk, most self-contained change. Does not depend on Phase 2 (service-role work). Fixing it now means the test suite we're building (TEST-05) validates the new atomic behavior from the start.

**Requirements covered:**
- PAY-01: Atomic RPC for BHPH confirm
- PAY-02: Idempotency on stripe_payment_intent_id
- PAY-03: Failure leaves no partial state
- PAY-04: Migration file created
- PAY-05: Integration tests (happy path, double-confirm, failure rollback)

**Tasks:**
1. Read current BHPH confirm route (`app/api/bhph/[id]/confirm/route.ts` or equivalent) — map all writes
2. Write Supabase SQL function `confirm_bhph_payment(p_token_id, p_payment_intent_id, p_org_id)` that:
   - Checks token is not already paid (idempotency guard)
   - Marks token paid
   - Inserts activity record
   - Updates contract `balance_remaining` and `next_due_at`
   - All inside `BEGIN/COMMIT` — rolls back on any error
3. Add `UNIQUE` constraint on `bhph_tokens.stripe_payment_intent_id` (or equivalent idempotency column) if not present
4. Create migration file `supabase/migrations/[timestamp]_confirm_bhph_payment_rpc.sql`
5. Refactor confirm route to call the RPC via `supabase.rpc('confirm_bhph_payment', {...})`
6. Remove the three individual writes from the route
7. Write integration tests in `lib/__tests__/bhph/confirm.test.ts`:
   - Happy path: payment confirms, all three state changes applied
   - Double-confirm: second call with same payment_intent_id is a no-op, returns success
   - Simulated failure: if RPC throws, verify token is still unpaid and contract is unchanged
8. Verify all PAY tests pass

**Success criteria:**
- `confirm_bhph_payment` RPC exists in migration file
- Confirm route calls only `supabase.rpc(...)` — no individual token/activity/contract writes
- Double-confirm with the same payment_intent_id produces no duplicate state
- All PAY integration tests pass
- `npm run build` and `npm test` still pass

**Estimated effort:** 2–3 days

**Dependencies:** Phase 0 (test runner must exist for TEST-05)

---

## Phase 2 — Service-Role Narrowing & Impersonation Hardening

**Goal:** Reduce the cross-tenant blast radius. Using the triage from Phase 0, replace the top reducible service-role usages with org-scoped auth clients. Fix impersonation so it returns a session-scoped client instead of raw service role. Add integration tests proving tenant isolation.

**Why third:** Requires Phase 0 triage to know exactly what to fix. Largest architectural risk in the codebase — after Phase 0 maps it and Phase 1 proves the test setup works, this phase attacks the biggest blast radius.

**Requirements covered:**
- TENS-02: Scoped query helpers
- TENS-03: Top 20 reducible service-role usages replaced
- TENS-04: Impersonation returns scoped client
- TENS-05: Policy document updated
- TENS-06: Tenant isolation integration tests

**Tasks:**
1. Read `.planning/service-role-triage.md` — work top 20 reducible targets in priority order
2. For each reducible target:
   - Replace `createServiceClient()` with `createClient()` (auth-scoped)
   - Add `.eq('user_id', profile.org_id)` or `.eq('org_id', profile.org_id)` filter as appropriate
   - Verify no existing org filter is being relied upon elsewhere in the same handler
3. Create `lib/supabase/scopedHelpers.ts` — typed query wrappers that require org_id param:
   - `getVehicle(supabase, orgId, vehicleId)`
   - `getCustomerDocuments(supabase, orgId, customerId)`
   - Add others as needed during the triage refactor
4. Read `lib/supabase/forRequest.ts` — understand impersonation session flow
5. Refactor impersonation: instead of returning raw service client, return auth client initialized with the impersonated org's session context (or a proxy that enforces the impersonated org's RLS)
6. Write tenant isolation tests in `lib/__tests__/tenancy/isolation.test.ts`:
   - For 5+ endpoint types: create resource as org A, attempt to read/mutate as org B, expect 404
   - Test impersonation: staff impersonating org A cannot read org B data
7. Run full test suite and confirm all pass

**Success criteria:**
- At least 20 service-role usages in org-scoped handlers replaced with auth client
- `forRequest.ts` impersonation no longer returns `createServiceClient()` to application code
- `lib/supabase/scopedHelpers.ts` exists with typed helpers for common patterns
- 5+ tenant isolation tests pass (org-to-org cross-read returns 404)
- Impersonation isolation test passes
- `npm test` and `npm run build` pass

**Estimated effort:** 3–5 days

**Dependencies:** Phase 0 (triage inventory)

---

## Phase 3 — Lint Correctness Cleanup

**Goal:** Fix all remaining lint correctness errors: hook-order violations, Date.now() in render, sync setState in effects, and `any` in sensitive code paths. Get to `--max-warnings=0` passing.

**Why fourth:** Phase 0 clears the auto-fixable noise. Correctness fixes need human judgment — they need to happen after Phase 2 (so new code from Phase 2 is already clean) and before Phase 4 (which adds more new code). Fixing these now means Phase 4 and 5 are building on clean foundations.

**Requirements covered:**
- LINT-02: Hook-order violations corrected
- LINT-03: Date.now() in render moved to refs/state/effects
- LINT-04: Sync setState in effects corrected
- LINT-05: `any` in payment/auth/webhook/ingestion replaced with typed alternatives
- LINT-06: `npx eslint app components hooks lib --max-warnings=0` passes

**Tasks:**
1. Run `npx eslint app components hooks lib --max-warnings=0 2>&1 | grep "error"` and triage remaining errors by rule
2. Fix hook-order violations (`react-hooks/rules-of-hooks`):
   - Identify conditional hook calls
   - Restructure with early returns or extract to separate components
3. Fix `Date.now()` / `new Date()` in render:
   - Move to `useMemo`, `useRef`, `useState` initializer, or `useEffect`
4. Fix synchronous `setState` inside `useEffect` without guards:
   - Add dependency arrays, cleanup functions, or move logic to event handlers
5. Fix `any` in sensitive files:
   - `app/api/` payment routes: type request/response bodies
   - `app/api/` auth/webhook routes: type incoming payloads
   - `lib/auth/` helpers: ensure all return types are explicit
6. Run `npx eslint app components hooks lib --max-warnings=0` — must pass with zero output
7. Run `npm run build` to confirm no regressions
8. Run `npm test` to confirm all tests still pass

**Success criteria:**
- `npx eslint app components hooks lib --max-warnings=0` exits 0 with no output
- No conditional hook calls remain
- No `Date.now()` or `new Date()` directly in component render bodies
- `any` eliminated from all payment, auth, webhook, and public ingestion files
- Build and tests still pass

**Estimated effort:** 2–3 days

**Dependencies:** Phase 0 (auto-fix baseline), Phase 2 (new code should already be clean)

---

## Phase 4 — Distributed State, Sanitization & Schema Validation

**Goal:** Replace the three remaining P2 point-fixes (export cooldown, email sanitizer, Gmail legacy path) and add Zod schema validation at all public and payment route boundaries.

**Why fifth:** These are independent of the structural work in Phases 1–3. Grouping them into one phase makes efficient use of effort without blocking the earlier high-risk work.

**Requirements covered:**
- OPS-01: Export cooldown → Upstash
- OPS-02: Legacy Gmail push path removed
- OPS-03: Email signature → isomorphic-dompurify
- SCHEMA-01: Zod schemas for public endpoints
- SCHEMA-02: Zod schemas for payment routes
- SCHEMA-03: Structured 400 responses with field-level detail
- SCHEMA-04: Shared Zod validation helper

**Tasks:**
1. **Export cooldown (OPS-01):**
   - Read `app/api/settings/data-export/route.ts`, find the in-memory Map
   - Replace with `orgExportLimiter` in `lib/rateLimit/upstash.ts` (add new limiter: 1 export per org per hour)
   - Remove the Map

2. **Gmail legacy path (OPS-02):**
   - Confirm Pub/Sub subscription is pointing to OIDC path (`/api/gmail/webhook`)
   - Remove `app/api/integrations/gmail/push/route.ts` and all references to `PUBSUB_VERIFICATION_TOKEN`
   - Add to CLAUDE.md: legacy path removed, do not re-add

3. **Email sanitization (OPS-03):**
   - Install `isomorphic-dompurify`
   - Read `lib/email/html.ts` (or wherever signature sanitization lives)
   - Replace custom regex with `DOMPurify.sanitize(input, { ALLOWED_TAGS: [...], ALLOWED_ATTR: [...] })`
   - Define a strict allowlist (p, br, strong, em, a[href], img[src,alt,width,height])

4. **Zod shared helper (SCHEMA-04):**
   - Create `lib/validation/parseRequest.ts`: `parseBody<T>(req, schema)` — returns parsed data or throws structured 400

5. **Zod public endpoints (SCHEMA-01):**
   - Web lead route: define schema, apply `parseBody`
   - Booking route: define schema, apply `parseBody`
   - Unsubscribe route: define schema, apply `parseBody`
   - Pay token route: define schema, apply `parseBody`

6. **Zod payment routes (SCHEMA-02):**
   - BHPH confirm: define schema for token_id, payment_intent_id
   - Stripe webhook handler: validate shape of known event types

7. **Structured 400s (SCHEMA-03):**
   - Verify `parseBody` returns `{ error: 'Validation failed', fields: { field: message } }` format
   - Verify no stack trace or raw DB error in any 400 response

8. **Integration tests (TEST-06, TEST-07):**
   - Twilio signature test: invalid sig → 403, valid sig → proceeds
   - Web lead test: valid payload → 201, missing required field → 400 with field detail, oversized payload → 400
   - Booking test: valid → 201, malformed phone → 400
   - Unsubscribe test: valid token → 200, replay → 409

**Success criteria:**
- `data-export` route uses Upstash limiter, no Map import
- Legacy Gmail push file is deleted
- `DOMPurify.sanitize` used in email signature path, custom regex removed
- `lib/validation/parseRequest.ts` exists and is used by all public + payment routes
- All Zod schemas return field-level errors on invalid input
- TEST-06 and TEST-07 integration tests pass
- `npm test` and `npm run build` pass

**Estimated effort:** 2–3 days

**Dependencies:** Phase 3 (clean lint baseline before adding new code)

---

## Phase 5 — CI Gates & Audit Logging

**Goal:** Lock in everything built so far with release gates that prevent regression. Add audit logging for the highest-risk actions (impersonation, payments, exports, settings changes, webhook auth failures).

**Why last:** CI gates are only valuable once the suite they enforce is actually meaningful. Audit logging requires the payment RPC (Phase 1) and impersonation refactor (Phase 2) to be in place so there's a clean place to log from.

**Requirements covered:**
- TEST-08: `npm test` is a release blocker
- CI-01 through CI-05: CI gate policy + deploy checklist
- AUDIT-01 through AUDIT-05: Audit log for impersonation, payments, exports, settings, webhook failures

**Tasks:**
1. **Audit log table (AUDIT-01–05):**
   - Create migration: `audit_log` table with columns: `id`, `org_id`, `actor_id`, `actor_type` (staff/user), `action`, `entity_type`, `entity_id`, `metadata` (jsonb), `ip_address`, `created_at`
   - Create `lib/audit/log.ts`: `writeAuditLog(supabase, entry)` helper using service client (audit log uses service role intentionally — it is a legitimate use)

2. **Wire audit log to impersonation (AUDIT-01):**
   - Read `lib/auth/staffSession.ts` and `lib/supabase/forRequest.ts`
   - On impersonation start: log `action: 'impersonation_start'`, `org_id`, `staff_id`, IP
   - On impersonation end: log `action: 'impersonation_end'`

3. **Wire audit log to BHPH payments (AUDIT-02):**
   - In the BHPH confirm route (post-RPC call): log `action: 'payment_confirmed'`, `entity_type: 'bhph_token'`, `entity_id`, `metadata: { amount, payment_intent_id }`

4. **Wire audit log to data export (AUDIT-03):**
   - In data-export route: log `action: 'data_export'`, `org_id`, `actor_id`

5. **Wire audit log to settings mutations (AUDIT-04):**
   - In org_settings write routes and user role change routes: log `action: 'settings_updated'`, `metadata: { changed_keys }`

6. **Wire audit log to webhook auth failures (AUDIT-05):**
   - Twilio signature validation failure: log `action: 'webhook_auth_failure'`, `metadata: { path, reason }`
   - Cron auth failure: log same
   - Gmail OIDC failure: log same

7. **Deploy checklist (CI-04):**
   - Create `.planning/DEPLOY_CHECKLIST.md`:
     - Pre-deploy: `npm run build` ✓, `npm test` ✓, `npx eslint app components hooks lib --max-warnings=0` ✓
     - Env validation: list required env vars with check commands
     - Migration: `supabase db push` or manual confirmation
     - Rollback procedure: revert deploy, rollback migration if needed
     - Post-deploy smoke tests

8. **Update CLAUDE.md (CI-05):**
   - Add release gate policy: build + test + lint must pass before shipping
   - Add audit log policy: all high-risk actions must write to audit_log

9. **Finalize TEST-08:**
   - Confirm `npm test` in the deploy checklist
   - Run full test suite one final time: all tests pass

**Success criteria:**
- `audit_log` migration file exists and creates the table correctly
- `lib/audit/log.ts` helper used in impersonation, payments, export, settings, and webhook failure paths
- `.planning/DEPLOY_CHECKLIST.md` exists with all pre-deploy checks
- CLAUDE.md updated with release gate policy and audit log policy
- All 38 v1 requirements checked off
- `npm test` passes (all test suites)
- `npm run build` passes
- `npx eslint app components hooks lib --max-warnings=0` passes

**Estimated effort:** 2–3 days

**Dependencies:** Phase 1 (payment RPC), Phase 2 (impersonation refactor), Phase 3 (lint clean), Phase 4 (schemas + helpers)

---

## Summary

| Phase | Name | Key Goal | Requirements | Est. Days | Depends On |
|-------|------|----------|-------------|-----------|------------|
| 0 | Baseline & Infrastructure | Triage + auto-fix lint + test runner | TENS-01, LINT-01, TEST-01, TEST-02 | 1–2 | — |
| 1 | BHPH Payment Atomicity | Atomic RPC + idempotency + tests | PAY-01–05 | 2–3 | Phase 0 |
| 2 | Service-Role Narrowing | Reduce blast radius + impersonation fix + isolation tests | TENS-02–06, TEST-03–04 | 3–5 | Phase 0 |
| 3 | Lint Correctness Cleanup | Zero lint errors in source | LINT-02–06 | 2–3 | Phase 0, 2 |
| 4 | Distributed State & Schemas | Export cooldown, sanitizer, Gmail cleanup, Zod validation | OPS-01–03, SCHEMA-01–04, TEST-06–07 | 2–3 | Phase 3 |
| 5 | CI Gates & Audit Logging | Release gates + audit trail | TEST-08, CI-01–05, AUDIT-01–05 | 2–3 | Phase 1, 2, 3, 4 |

**Total estimated effort:** 12–19 working days
**Target audit score improvement:** 12/20 → 18+/20

---

## Audit Score Projection

| Dimension | Current | Target | Phases That Move It |
|-----------|---------|--------|---------------------|
| Security | 2/4 | 4/4 | Phase 1 (PAY), Phase 2 (TENS), Phase 4 (OPS) |
| Reliability | 3/4 | 4/4 | Phase 1 (atomic payments), Phase 4 (distributed cooldowns) |
| Maintainability | 2/4 | 3–4/4 | Phase 3 (lint), Phase 4 (Zod schemas), Phase 5 (CI gates) |
| QA/Testing | 1/4 | 3/4 | Phase 0, 1, 2, 4 (test suite), Phase 5 (release gates) |
| Operability | 4/4 | 4/4 | Phase 5 (audit logs + deploy checklist — maintain and strengthen) |

---
*Roadmap created: 2026-04-29*
*Last updated: 2026-04-29 — initial creation*
