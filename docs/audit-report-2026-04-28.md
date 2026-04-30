# DealerWyze Enterprise Audit

Date: 2026-04-28

Auditor: Codex static code audit

Scope:
- Static review of the Next.js/Supabase codebase in `apollo-crm/`
- Automated checks run locally: `npm test`, `npm run build`, targeted `eslint`
- Review focus: security, tenant isolation, reliability, maintainability, QA posture, deployment process

Out of scope:
- No live penetration test against production or staging
- No direct review of Vercel, Supabase, Stripe, Twilio, Google Cloud, or DNS console settings
- No mobile/browser matrix testing

## Executive Summary

Audit readiness score: **9/20**

Rating: **Poor** for enterprise deployment readiness

The application has strong product breadth and some solid architectural intent, but it is **not yet ready for high-trust dealership deployment without a hardening phase**. The most serious problems are not cosmetic. They are concentrated in:

- secret fallback behavior on public unsubscribe links
- unauthenticated public ingestion endpoints that trust caller-supplied tenant identifiers
- non-idempotent payment confirmation logic
- incomplete webhook identity verification
- heavy service-role usage with a large blast radius if a single org filter is missed
- weak engineering controls: unusable lint gate, thin automated coverage, and manual migration/deploy process

Issue count:
- `P0`: 1
- `P1`: 6
- `P2`: 6
- `P3`: 3

If this were my program, I would **block enterprise rollout** until all `P0` and `P1` items below are resolved and re-audited.

## Audit Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Security | 1/4 | Public and tokenized endpoints still have high-risk trust flaws |
| 2 | Reliability | 2/4 | Core features work, but rate limiting, idempotency, and process controls are weak |
| 3 | Maintainability | 2/4 | Architecture is documented, but service-role sprawl and lint debt are high |
| 4 | QA / Testing | 1/4 | Only 4 test files / 38 tests for 217 API routes |
| 5 | Operability | 3/4 | Build passes, but deploys and migrations are still manual |
| **Total** |  | **9/20** | **Poor** |

## Detailed Findings

### P0

**[P0] Public unsubscribe tokens fall back to a known default secret**

- Location: `app/api/unsubscribe/route.ts:17`, `app/api/email/send/route.ts:187`
- Category: Security / Access control
- Impact: If `UNSUBSCRIBE_SECRET` is unset in any environment, unsubscribe tokens become forgeable with the literal secret `fallback-secret`. An attacker could unsubscribe arbitrary customers and cancel active sequences without auth.
- Evidence:
  - `const secret = process.env.UNSUBSCRIBE_SECRET ?? 'fallback-secret'`
  - `const unsubSecret = process.env.UNSUBSCRIBE_SECRET ?? 'fallback-secret'`
- Recommendation:
  - Fail closed at process startup if `UNSUBSCRIBE_SECRET` is missing.
  - Rotate any unsubscribe links after deploying the fix.
  - Add an automated startup/env validation layer for all required secrets.

### P1

**[P1] Public web lead capture trusts caller-supplied `org_id`**

- Location: `app/api/leads/web/route.ts:25-53`, `app/[slug]/inventory/[vdp]/ContactForm.tsx:22-34`
- Category: Security / Abuse prevention / Tenant isolation
- Impact: Any external caller can post directly to `/api/leads/web` with any visible dealership `org_id` and create fake leads, CRM activities, and dealer SMS notifications. The public VDP form sends the org UUID from the browser.
- Recommendation:
  - Stop trusting `org_id` from the client.
  - Derive tenant identity server-side from the `{slug, vdp}` route or a signed short-lived form token.
  - Add bot controls beyond a honeypot: Turnstile/hCaptcha, replay nonce, and per-org anomaly detection.

**[P1] BHPH payment confirmation is not idempotent and is race-prone**

- Location: `app/api/pay/[token]/route.ts:135-210`
- Category: Security / Financial integrity / Reliability
- Impact: Two concurrent `confirm` requests can both read the token as `pending`, both mark it paid, both write an activity, and both increment contract totals / advance due dates. This is unacceptable for financial workflows.
- Recommendation:
  - Move confirmation into a transaction or RPC that atomically:
    - verifies token status
    - verifies payment intent identity
    - marks token paid exactly once
    - updates contract totals exactly once
  - Add a unique idempotency constraint on `stripe_payment_intent_id`.
  - Add concurrency tests.

**[P1] Gmail webhook OIDC verification is incomplete**

- Location: `app/api/gmail/webhook/route.ts:8-31`
- Category: Security / Webhook verification
- Impact: The verifier checks signature, `aud`, and `exp`, but does not verify `iss` or the expected Google Pub/Sub service identity claims. That leaves room for accepting Google-signed tokens that are not actually from the intended publisher identity.
- Recommendation:
  - Verify `iss` against Google’s documented issuer values.
  - Verify the expected service account email / subject claims for Pub/Sub push.
  - Consider using Google’s official token verification library rather than a custom verifier.

**[P1] Any authenticated org member can export full customer and activity data**

- Location: `app/api/settings/data-export/route.ts:35-102`
- Category: Security / Least privilege / Data governance
- Impact: `requireProfile()` is the only guard. A sales rep or low-privilege staff user can export large volumes of PII and CRM history for the whole org.
- Recommendation:
  - Restrict data export to `dealer_admin` or another explicit high-trust role.
  - Add audit logging for export requests.
  - Add async job generation with signed download URLs rather than inline export.

**[P1] Rate limiting and export cooldown protections are process-local, not distributed**

- Location: `proxy.ts:4-52`, `app/api/settings/data-export/route.ts:18-21`
- Category: Reliability / Security / Abuse prevention
- Impact: These controls disappear across instances and cold starts. On Vercel or any scaled deployment, attackers can bypass them by spreading requests across instances, and legitimate throttling becomes inconsistent.
- Recommendation:
  - Replace all in-memory limiters/cooldowns with Redis/Upstash-backed primitives.
  - Centralize rate limiting policy and key design.
  - Add monitoring for rate-limit decisions and bypass attempts.

**[P1] Service-role and impersonation model create a large blast radius for missed org filters**

- Location: `lib/supabase/forRequest.ts:1-14`, `app/(app)/customers/page.tsx:25-109`, `app/(app)/vehicles/[id]/page.tsx:61-69`, `app/api/activities/route.ts:26-57`
- Category: Security / Tenant isolation / Maintainability
- Impact: When staff impersonation is active, `createClientForRequest()` returns the service-role client. That means any query missing an explicit org filter bypasses RLS completely. This is already coupled with write paths that do not validate every foreign key, for example `activities` validates `customer_id` but not `vehicle_id`.
- Recommendation:
  - Reduce service-role use aggressively on authenticated request paths.
  - Introduce a wrapped service client that requires explicit tenant scoping helpers.
  - Add tenant-isolation tests for every route that uses `createServiceClient()` or `createClientForRequest()`.
  - Validate `vehicle_id` ownership on `POST /api/activities`.

### P2

**[P2] Stored HTML is rendered without sanitization in automation email signature flows**

- Location: `app/(app)/settings/automation/AutomationClient.tsx:386-392`, `app/api/settings/automation/route.ts:51-102`, `app/api/email/send/route.ts:14-36`
- Category: Security / XSS / Content safety
- Impact: Org admins can store arbitrary HTML in `email_signature`, which is then rendered directly in the preview and injected into outgoing email HTML. At minimum this is stored self-XSS; in shared-admin orgs it becomes shared stored XSS.
- Recommendation:
  - Sanitize allowed signature HTML server-side with a strict allowlist.
  - Store sanitized HTML separately from raw editor content if needed.
  - Consider switching to plain-text or markdown signatures.

**[P2] Lint is not a usable quality gate**

- Location: repo-wide; verified by `npm run lint` and targeted `npx eslint app components hooks lib remotion next.config.ts proxy.ts --max-warnings=0`
- Category: Maintainability / QA process
- Impact:
  - Full lint run reported 4,104 problems because generated artifacts like `.vercel/output` and service worker bundles are included.
  - Source-only lint still reported 303 problems, including 170 errors.
  - This means lint cannot be trusted as a release gate today.
- Recommendation:
  - Exclude generated/build output from lint immediately.
  - Create a short remediation sprint for source lint errors, starting with hook-order, purity, and effect-state violations.
  - Enforce lint in CI once the baseline is under control.

**[P2] Automated test coverage is far too thin for the application surface**

- Location: codebase-wide; verified by `npm test`
- Category: QA / Reliability
- Impact: 4 test files and 38 tests are not enough for a product with 217 API routes, payments, messaging, voice AI, cron jobs, and admin impersonation. Regressions and authorization bugs are likely to slip into production.
- Recommendation:
  - Add route-level integration tests for:
    - auth and role enforcement
    - tenant isolation
    - webhook verification
    - payment confirmation idempotency
    - public token endpoints
  - Add smoke tests for top revenue-critical flows.

**[P2] Deployment and migration process is still manual**

- Location: `README.md:52-53`, `README.md:142-151`
- Category: Operability / Change management
- Impact: Manual SQL migrations in the Supabase dashboard and manual production deploys increase the chance of drift, skipped migrations, and unrepeatable releases.
- Recommendation:
  - Move to versioned migration execution in CI/CD.
  - Add release checklists with automated preflight validation.
  - Record migration/app version pairing for every production deploy.

**[P2] Request validation is inconsistent and mostly ad hoc**

- Location: examples in `app/api/settings/automation/route.ts:51-102`, `app/api/activities/route.ts:13-57`, `app/api/support/tickets/route.ts:19-50`, `app/api/auth/register/route.ts:34-117`
- Category: Maintainability / Reliability / Security
- Impact: Many routes parse `req.json()` into loose objects and do manual checks. This makes validation inconsistent, complicates safe refactors, and increases the odds of edge-case bugs.
- Recommendation:
  - Standardize on a schema layer such as `zod`.
  - Validate request bodies at the route boundary and use inferred typed payloads downstream.

**[P2] Source contains React purity and effect-state anti-patterns**

- Location: examples from source lint:
  - `hooks/useOrgSettings.ts:24-46`
  - `components/today/AppointmentRequestCard.tsx:24-38`
  - `components/today/ResponseTimeWidget.tsx:7-12`
  - multiple admin pages flagged by React hook/purity rules
- Category: Reliability / Maintainability
- Impact: These patterns create unstable rendering, hydration risk, cascading renders, and harder debugging as the codebase grows.
- Recommendation:
  - Treat the new React lint rules as real defects, not style issues.
  - Clean up hook order, move impure time calculations out of render, and replace synchronous effect-setState patterns.

### P3

**[P3] Public booking uses internal org UUIDs as the public booking identifier**

- Location: `app/book/[slug]/page.tsx:10-17`, `app/api/book/[slug]/route.ts:16-57`
- Category: Maintainability / Product design
- Impact: Public URLs appear to use `[slug]`, but the implementation resolves booking pages by `org_id`. That is awkward for public-facing URLs and unnecessarily exposes internal tenant identifiers.
- Recommendation:
  - Switch booking pages to resolve by organization slug or a dedicated booking slug.

**[P3] Public booking writes appointment timing into `completed_at` rather than a scheduled field**

- Location: `app/api/book/[slug]/route.ts:120-142`
- Category: Data integrity
- Impact: This makes downstream reporting and appointment workflows harder to reason about and increases special-case logic.
- Recommendation:
  - Store scheduled appointments in `due_at` or a dedicated scheduled timestamp field.

**[P3] Generated/public assets are checked into places that blur source vs output**

- Location: `.vercel/output`, `public/sw.js`, `public/workbox-*.js`, `.next/`
- Category: Maintainability
- Impact: Generated artifacts increase repo noise, confuse tooling, and distort lint/audit results.
- Recommendation:
  - Clarify what is source-controlled vs generated.
  - Exclude generated directories from lint, review, and most static checks.

## Systemic Risks

1. **Service-role sprawl**
   - `createServiceClient()` appears 305 times across `app/` and `lib/`.
   - This is manageable only with excellent guardrails and tests, which do not exist yet.

2. **Route surface vs coverage mismatch**
   - `app/api/` contains 217 route files.
   - Test suite covers only 4 files / 38 tests.

3. **Quality gates are not release-grade**
   - Build passes.
   - Lint does not.
   - Migrations and production deploys remain manual.

4. **Public ingestion endpoints are still trust-heavy**
   - Public forms and webhook-style endpoints rely heavily on shared secrets, caller-provided IDs, or single-step checks.

## Positive Findings

- Auth and tenancy intent are clearly documented in `README.md` and `docs/ARCHITECTURE.md`.
- `requireProfile()` is used broadly and the team has a recognizable org-scoping convention.
- Sensitive webhook routes frequently use `timingSafeEqual()` and explicit signature checks.
- `npm test` passes and `npm run build` passes, so the codebase is not in a broken baseline state.
- There is evidence of previous abuse-hardening work already in progress, not a total absence of security thinking.

## Recommended Remediation Program

### Phase 1: Blockers before enterprise rollout

1. Remove all secret fallbacks and add startup-time env validation.
2. Redesign `/api/leads/web` so tenant identity is server-derived or signed.
3. Make BHPH payment confirmation atomic and idempotent.
4. Tighten Gmail webhook identity verification.
5. Restrict data export to privileged roles and add audit logging.
6. Replace in-memory abuse controls with shared infrastructure.

### Phase 2: Tenant-isolation hardening

1. Inventory all `createServiceClient()` call sites.
2. Classify them into:
   - unavoidable
   - replaceable with RLS client
   - dangerous and should be rewritten
3. Add tenant-isolation tests for every authenticated write route using the service client.
4. Add foreign-key ownership validation for all cross-entity writes.

### Phase 3: Engineering quality gates

1. Exclude generated artifacts from lint.
2. Reduce source lint errors to zero.
3. Add CI for lint, test, build, and migration consistency.
4. Adopt schema validation for route inputs.

### Phase 4: Operability and enterprise readiness

1. Replace manual migration execution with automated migration promotion.
2. Add release notes, rollback playbooks, and environment parity checks.
3. Add observability around:
   - auth failures
   - webhook failures
   - payment confirmation attempts
   - export events
   - impersonation sessions

## Suggested Next Steps

Recommended command sequence:

1. **`/harden`** — Fix `P0` and `P1` security issues first.
2. **`/shape`** — Redesign public lead capture, export authorization, and payment confirmation flow before coding fixes blindly.
3. **`/audit`** — Re-run after the hardening pass.
4. **`/polish`** — Final cleanup after security and QA fixes land.

## Bottom Line

DealerWyze has real product substance, but it is **not yet at a “largest dealerships can trust this with low operational risk” standard**.

The fastest path to that standard is not feature work. It is:

- hardening public trust boundaries
- reducing service-role blast radius
- making payments and exports safer
- and turning engineering checks into real release gates

