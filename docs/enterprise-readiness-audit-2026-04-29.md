# DealerWyze Enterprise Readiness Audit

Date: 2026-04-29

Auditor: Codex coordinated static audit with specialist sub-reviews for security, QA/testing, reliability/operability, and accessibility/usability

Scope:
- Static review of the `apollo-crm/` Next.js 16 + Supabase application
- Focus areas: security, tenant isolation, QA, reliability, operability, accessibility, maintainability, deployment safety
- Automated checks run locally:
  - `npm test` -> 16 files, 123 tests passed
  - targeted repo inspection of CI, lint/test/build scripts, auth and webhook flows

Out of scope:
- No live penetration test against staging or production
- No direct review of Vercel, Supabase, Stripe, Twilio, Google Cloud, or DNS console configuration
- No browser/device matrix execution
- No source modifications in this audit pass

## Executive Summary

Enterprise readiness score: **8/20**

Rating: **Poor**

The application has strong product ambition and several good foundational controls, but it is **not yet ready for large-corporation deployment**. The most serious issues are concentrated in:

- privileged staff impersonation and service-role blast radius
- replayable OAuth state and weak admin controls on org-wide integrations
- non-idempotent external side effects in billing and messaging paths
- misleading cron/job success reporting and weak failure isolation
- incomplete release gates and thin automated coverage relative to system surface
- accessibility and mobile usability issues that would block enterprise procurement review

This rollout should be blocked until all `P0` and `P1` items are remediated and re-audited.

Issue count:
- `P0`: 1
- `P1`: 14
- `P2`: 10
- `P3`: 3

## Audit Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Security | 1/4 | Privileged impersonation and integration flows still have high-impact control gaps |
| 2 | Reliability | 1/4 | Messaging, billing, and cron paths are not consistently idempotent or failure-safe |
| 3 | QA / Testing | 1/4 | Test suite is green but much too small for the shipped route and UI surface |
| 4 | Operability | 2/4 | Observability exists, but job status truthfulness and deploy safety are weak |
| 5 | UX / Accessibility / Maintainability | 3/4 | Product is usable, but accessibility blockers and code-quality gaps remain |
| **Total** |  | **8/20** | **Poor** |

## Positive Findings

- Multi-tenant risks are explicitly documented in the codebase and README.
- Webhook verification exists for Stripe, Twilio, Retell, and Gmail push.
- Sentry is configured and security headers are set globally in [next.config.ts](../next.config.ts).
- There is meaningful tenant-isolation test intent in `lib/__tests__/`.
- The current automated suite is passing: `123` tests across `16` files.

## Release Recommendation

**Do not approve enterprise rollout yet.**

Minimum bar before re-review:
- Close all `P0` and `P1` items below
- Add durable idempotency for billing and messaging side effects
- Enforce stronger admin-only controls on org-wide integrations and write-enabled impersonation
- Establish full lint + explicit typecheck + browser smoke tests as required release gates
- Resolve accessibility blockers around dialogs, keyboard semantics, and viewport zoom

## Detailed Findings

### P0

**[P0] Write-enabled staff impersonation grants raw cross-tenant service-role access to any platform user**

- Category: Security / Tenant isolation / Privileged access
- Location:
  - [app/api/admin/impersonate/route.ts](../app/api/admin/impersonate/route.ts)
  - [lib/auth/platform.ts](../lib/auth/platform.ts)
  - [lib/supabase/forRequest.ts](../lib/supabase/forRequest.ts)
- Evidence:
  - `POST /api/admin/impersonate` only checks `canAccessAdminArea(user.id)` before accepting `write_mode=true`.
  - `canAccessAdminArea()` returns true for any user with any `platform_role`, not just superadmins.
  - `createClientForRequest()` returns `createServiceClient()` for write-enabled impersonation sessions.
- Impact:
  - Non-superadmin platform staff can obtain full RLS-bypassing tenant write access.
  - Any missed org filter in a downstream handler becomes a cross-tenant corruption or data exposure event.
  - This is a large-corporation blocker by itself.
- Recommendation:
  - Restrict `write_mode=true` to `requirePlatformSuperAdmin()` only.
  - Prefer a scoped privileged client over raw service-role access even for remote admin.
  - Add just-in-time elevation, stronger audit logging, and short TTLs.
  - Add route tests proving non-superadmins cannot enter write-enabled impersonation.

### P1

**[P1] Social OAuth state is deterministic and replayable**

- Category: Security / OAuth / Integration integrity
- Location:
  - [lib/social/oauth.ts](../lib/social/oauth.ts)
  - [app/api/social/callback/[platform]/route.ts](../app/api/social/callback/[platform]/route.ts)
- Evidence:
  - State is only a signature over `{ orgId, platform }`.
  - There is no nonce, expiry, one-time use marker, or user/session binding.
  - Callback handlers trust the state and write long-lived tokens via service-role upserts.
- Impact:
  - A leaked or reused state can bind attacker-controlled social accounts to a tenant.
- Recommendation:
  - Replace deterministic state with a one-time random nonce stored server-side with TTL.
  - Bind the nonce to initiating user, org, and platform.
  - Invalidate state before token exchange completes.

**[P1] Org-wide third-party integrations can be changed by non-admin users**

- Category: Security / Authorization / Change control
- Location:
  - [app/api/social/connect/[platform]/route.ts](../app/api/social/connect/[platform]/route.ts)
  - [app/api/social/accounts/route.ts](../app/api/social/accounts/route.ts)
  - [app/api/integrations/gmail/connect/route.ts](../app/api/integrations/gmail/connect/route.ts)
  - [app/api/integrations/gmail/route.ts](../app/api/integrations/gmail/route.ts)
  - [app/api/google/calendar-connect/route.ts](../app/api/google/calendar-connect/route.ts)
  - [app/api/google/calendar-disconnect/route.ts](../app/api/google/calendar-disconnect/route.ts)
- Evidence:
  - These routes gate on `requireProfile()` only.
- Impact:
  - Low-privilege dealership users can connect or disconnect shared inboxes, calendars, and social accounts for the whole organization.
- Recommendation:
  - Require dealer-admin-capable roles for all org-wide integration connect/disconnect actions.
  - Add audit logging per action and target external account.

**[P1] Scheduled sequence delivery is not idempotent and can double-send customer messages**

- Category: Reliability / Messaging integrity / Abuse prevention
- Location:
  - [app/api/cron/send-sequences/route.ts](../app/api/cron/send-sequences/route.ts)
- Evidence:
  - Due activities are fetched with `completed_at IS NULL`.
  - External SMS/email send happens before the activity is marked completed.
  - There is no lease token, `processing` state, compare-and-set update, or provider idempotency key.
- Impact:
  - Overlapping cron runs or retries can duplicate outbound customer communications.
- Recommendation:
  - Atomically claim pending work before external send.
  - Add provider idempotency keys or a durable sent-event ledger.
  - Test replay and concurrency behavior explicitly.

**[P1] Stripe webhook deduplication is only in process memory**

- Category: Reliability / Financial integrity / Billing
- Location:
  - [app/api/stripe/webhook/route.ts](../app/api/stripe/webhook/route.ts)
- Evidence:
  - Duplicate event suppression is handled by a process-local `Map`.
  - Business side effects include purchased credits, overage top-ups, commission writes, and subscription state changes.
- Impact:
  - Retries across instances can duplicate billing side effects.
- Recommendation:
  - Persist webhook event IDs durably in the database.
  - Make each financial side effect idempotent at the data layer.

**[P1] Destructive retention cleanup is non-transactional**

- Category: Reliability / Data lifecycle / Recovery
- Location:
  - [app/api/cron/data-retention/route.ts](../app/api/cron/data-retention/route.ts)
- Impact:
  - Mid-run failures can leave an org partially purged across multiple tables with unclear recovery state.
- Recommendation:
  - Move per-org purge into a single transaction or RPC.
  - Add resumable checkpoints and durable before/after audit entries.

**[P1] Cron/job telemetry can report success while work actually failed**

- Category: Operability / Reliability / Monitoring
- Location:
  - [app/api/cron/sync-leads/route.ts](../app/api/cron/sync-leads/route.ts)
  - [lib/cron/jobs/accountLifecycle.ts](../lib/cron/jobs/accountLifecycle.ts)
  - [app/api/cron/poll-reviews/route.ts](../app/api/cron/poll-reviews/route.ts)
  - [app/api/cron/retention-triggers/route.ts](../app/api/cron/retention-triggers/route.ts)
- Impact:
  - Timeouts, per-org failures, and swallowed exceptions can still result in green or misleading job status.
  - This degrades operator trust and makes incident detection slower.
- Recommendation:
  - Mark `partial_failure` when any org or phase fails.
  - Use `finally` blocks to always finalize `cron_runs`.
  - Add per-org isolation and durable work queues where runtime caps apply.

**[P1] Config and security controls fail open when key environment variables are missing**

- Category: Security / Configuration management / Operability
- Location:
  - [lib/social/oauth.ts](../lib/social/oauth.ts)
  - [lib/rateLimit/upstash.ts](../lib/rateLimit/upstash.ts)
  - [proxy.ts](../proxy.ts)
- Evidence:
  - OAuth state uses `SOCIAL_OAUTH_STATE_SECRET ?? ''`.
  - Rate limiting silently allows requests when Upstash config is absent.
- Impact:
  - Production misconfiguration can weaken security without obvious startup failure.
- Recommendation:
  - Add centralized env-schema validation at startup.
  - Fail closed for secrets, auth signing, and distributed abuse controls.

**[P1] A single shared secret unlocks multiple privileged internal paths**

- Category: Security / Secret isolation / Tenant isolation
- Location:
  - [app/api/leads/ingest/route.ts](../app/api/leads/ingest/route.ts)
  - [lib/leads/ingest.ts](../lib/leads/ingest.ts)
  - [app/api/gmail/watch/route.ts](../app/api/gmail/watch/route.ts)
  - [lib/cron/validateCronAuth.ts](../lib/cron/validateCronAuth.ts)
  - [app/api/twilio/inbound/route.ts](../app/api/twilio/inbound/route.ts)
- Impact:
  - Leakage of `LEADS_POLL_SECRET` can open unrelated privileged surfaces, including arbitrary-tenant lead injection.
- Recommendation:
  - Split secrets per route or provider.
  - Remove legacy fallback paths.
  - Derive tenant identity server-side instead of trusting caller-submitted `org_id`.

**[P1] Gmail disconnect appears incomplete and can leave active OAuth access behind**

- Category: Security / Privacy / Integration lifecycle
- Location:
  - [app/api/integrations/gmail/route.ts](../app/api/integrations/gmail/route.ts)
  - [app/api/integrations/gmail/callback/route.ts](../app/api/integrations/gmail/callback/route.ts)
  - [app/api/gmail/watch/route.ts](../app/api/gmail/watch/route.ts)
- Impact:
  - Users may believe Gmail is disconnected while refresh tokens and watch state still allow background access.
- Recommendation:
  - Revoke the Google token, disable/delete the linked `email_accounts` row, and clear active watch state.

**[P1] Booking timestamps are timezone-naive**

- Category: Reliability / Data integrity / Customer experience
- Location:
  - [app/api/book/[slug]/route.ts](../app/api/book/[slug]/route.ts)
- Evidence:
  - GET returns org timezone.
  - POST ignores it and uses `new Date(`${date}T${time}:00`)`.
- Impact:
  - Appointment times can be stored incorrectly depending on runtime timezone behavior.
- Recommendation:
  - Parse in the dealership timezone explicitly and persist normalized UTC plus source timezone.

**[P1] Accessibility blockers: overlays are not real dialogs**

- Category: Accessibility / Usability
- Location:
  - [components/today/TodoItem.tsx](../components/today/TodoItem.tsx)
  - [components/receipts/LedgerClient.tsx](../components/receipts/LedgerClient.tsx)
  - [components/vehicles/VideoOptionsSheet.tsx](../components/vehicles/VideoOptionsSheet.tsx)
  - [components/layout/FeedbackButton.tsx](../components/layout/FeedbackButton.tsx)
- Impact:
  - Missing focus trap, focus return, Escape behavior, and accessible dialog semantics.
- Recommendation:
  - Replace ad hoc overlays with Radix `Dialog` or `Sheet` primitives.

**[P1] Accessibility blockers: faux buttons and missing keyboard semantics**

- Category: Accessibility / Usability
- Location:
  - [components/today/TaskItem.tsx](../components/today/TaskItem.tsx)
  - [components/today/WaitingItem.tsx](../components/today/WaitingItem.tsx)
  - [components/today/AppointmentRequestCard.tsx](../components/today/AppointmentRequestCard.tsx)
  - [app/(app)/contacts/page.tsx](../app/(app)/contacts/page.tsx)
- Impact:
  - Clickable containers behave inconsistently for keyboard users and assistive technology.
- Recommendation:
  - Use real buttons/links or fully implement keyboard semantics including `Space`.

**[P1] Accessibility blockers: forms are not reliably programmatically labelled**

- Category: Accessibility / Usability
- Location:
  - [app/(onboarding)/onboarding/page.tsx](../app/(onboarding)/onboarding/page.tsx)
  - [app/book/[slug]/BookingForm.tsx](../app/book/[slug]/BookingForm.tsx)
  - [app/[slug]/inventory/[vdp]/ContactForm.tsx](../app/[slug]/inventory/[vdp]/ContactForm.tsx)
  - [app/[slug]/inventory/[vdp]/TradeInForm.tsx](../app/[slug]/inventory/[vdp]/TradeInForm.tsx)
- Impact:
  - Labels, placeholders, and error text are not consistently exposed to assistive tech.
- Recommendation:
  - Add `id`/`htmlFor`, fieldset/legend where appropriate, and `aria-describedby`/`aria-invalid`.

**[P1] The app disables pinch zoom globally**

- Category: Accessibility / Mobile usability
- Location:
  - [app/layout.tsx](../app/layout.tsx)
- Evidence:
  - `maximumScale: 1` and `userScalable: false` are set in viewport metadata.
- Impact:
  - This is a direct accessibility failure for low-vision users and a likely procurement blocker.
- Recommendation:
  - Remove zoom suppression from viewport configuration.

**[P1] CI coverage is materially weaker than the codebase surface**

- Category: QA / Release engineering
- Location:
  - [.github/workflows/ci.yml](../.github/workflows/ci.yml)
  - [package.json](../package.json)
- Evidence:
  - CI lint does not cover `app/**/*.tsx`.
  - There is no explicit `typecheck` script.
  - `playwright` is installed, but there is no evident Playwright config or committed e2e suite.
- Impact:
  - Large portions of shipped UI and route behavior are not gated before release.
- Recommendation:
  - Add `typecheck`.
  - Lint the full repo with `eslint . --max-warnings=0`.
  - Add Playwright smoke coverage for critical user and admin journeys.

### P2

**[P2] The automated test surface is too small for the shipped server surface**

- Category: QA / Risk management
- Location:
  - [lib/__tests__](../lib/__tests__)
  - Examples of high-risk unverified families:
    - [app/api/stripe/webhook/route.ts](../app/api/stripe/webhook/route.ts)
    - [app/api/admin/impersonate/route.ts](../app/api/admin/impersonate/route.ts)
    - [app/api/cron/send-sequences/route.ts](../app/api/cron/send-sequences/route.ts)
    - [app/api/media/upload/route.ts](../app/api/media/upload/route.ts)
    - [app/api/vehicles/[id]/publish/route.ts](../app/api/vehicles/[id]/publish/route.ts)
- Impact:
  - The route surface is broad, but automated coverage is narrow.
- Recommendation:
  - Add route-level integration tests for billing, impersonation, cron, uploads, and publish/render flows first.

**[P2] There is effectively no browser or end-to-end coverage**

- Category: QA / Regression prevention
- Location:
  - [vitest.config.ts](../vitest.config.ts)
  - [package.json](../package.json)
- Impact:
  - Interactive flows can regress without detection.
- Recommendation:
  - Add Playwright smoke tests for sign-in, customer edit, vehicle intake/upload/publish, billing, and impersonation.

**[P2] No explicit coverage thresholds or higher-fidelity integration coverage**

- Category: QA / Test effectiveness
- Location:
  - [vitest.config.ts](../vitest.config.ts)
- Impact:
  - A green suite may overstate confidence because many tests are heavily mocked and there are no thresholds.
- Recommendation:
  - Enable coverage reporting and thresholds.
  - Add higher-fidelity request/auth/query integration tests.

**[P2] Retry, duplicate-delivery, and partial-failure paths are under-tested**

- Category: QA / Reliability
- Location:
  - [app/api/stripe/webhook/route.ts](../app/api/stripe/webhook/route.ts)
  - [app/api/cron/send-sequences/route.ts](../app/api/cron/send-sequences/route.ts)
- Impact:
  - The flakiest operational paths do not have sufficient replay and idempotency tests.
- Recommendation:
  - Add duplicate-delivery and partial-success tests for Stripe, Twilio, Gmail, and cron handlers.

**[P2] Proxy abuse controls and matcher configuration are drifting apart**

- Category: Security / Abuse prevention / Maintainability
- Location:
  - [proxy.ts](../proxy.ts)
- Evidence:
  - Some routes listed in `RATE_ROUTES` are not covered by the matcher design.
- Impact:
  - Intended protections can silently stop executing.
- Recommendation:
  - Either align `matcher` with `RATE_ROUTES` completely or move the controls into route handlers.

**[P2] Production payment UI can show success even if server finalization fails**

- Category: Reliability / UX / Financial workflow
- Location:
  - [app/pay/[token]/PaymentForm.tsx](../app/pay/[token]/PaymentForm.tsx)
- Evidence:
  - Client sets local success state immediately after the confirm request without checking the response payload.
- Impact:
  - Users can be shown a successful payment state even if server-side finalization failed.
- Recommendation:
  - Require an explicit success response before moving the UI into the success state.

**[P2] Authenticated app shell is artificially constrained on medium-width devices**

- Category: Responsive design / Usability
- Location:
  - [app/(app)/layout.tsx](../app/(app)/layout.tsx)
- Evidence:
  - The shell uses `max-w-md` below `lg`.
- Impact:
  - Tablets and landscape phones waste significant usable width.
- Recommendation:
  - Remove the global narrow cap and apply width constraints per-screen instead.

**[P2] Several mobile controls have undersized touch targets**

- Category: Mobile usability / Accessibility
- Location:
  - [components/layout/TopBar.tsx](../components/layout/TopBar.tsx)
  - [app/(app)/today/page.tsx](../app/(app)/today/page.tsx)
  - [components/call/VoiceRecorder.tsx](../components/call/VoiceRecorder.tsx)
  - [app/[slug]/inventory/[vdp]/PhotoCarousel.tsx](../app/[slug]/inventory/[vdp]/PhotoCarousel.tsx)
  - [components/layout/FeedbackButton.tsx](../components/layout/FeedbackButton.tsx)
- Impact:
  - High-friction mobile interaction and accessibility risk.
- Recommendation:
  - Increase hit areas to at least common mobile minimums and provide visible mobile-first controls.

**[P2] Production deployment script is not failure-safe**

- Category: Operability / Deployment safety
- Location:
  - [deploy-prod.sh](../deploy-prod.sh)
- Impact:
  - Interrupted deploys can leave the workspace pointed at production config.
- Recommendation:
  - Use `trap` for restoration or eliminate file-swapping entirely.

**[P2] There is no explicit typecheck release gate**

- Category: QA / Release engineering
- Location:
  - [package.json](../package.json)
  - [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- Impact:
  - Type correctness is deferred to `next build`, which is slower and less targeted than a dedicated gate.
- Recommendation:
  - Add `npm run typecheck` and make it required in CI.

### P3

**[P3] Public booking uses implementation patterns that expose internal concepts awkwardly**

- Category: Product design / Maintainability
- Location:
  - [app/book/[slug]/page.tsx](../app/book/[slug]/page.tsx)
  - [app/api/book/[slug]/route.ts](../app/api/book/[slug]/route.ts)
- Impact:
  - Public route semantics and internal org resolution are not as cleanly separated as they should be.
- Recommendation:
  - Consider dedicated booking slugs and tighter public-route abstraction.

**[P3] Accessibility error feedback is mostly visual**

- Category: Accessibility / UX polish
- Location:
  - [app/book/[slug]/BookingForm.tsx](../app/book/[slug]/BookingForm.tsx)
  - [app/[slug]/inventory/[vdp]/ContactForm.tsx](../app/[slug]/inventory/[vdp]/ContactForm.tsx)
  - [app/[slug]/inventory/[vdp]/TradeInForm.tsx](../app/[slug]/inventory/[vdp]/TradeInForm.tsx)
- Impact:
  - Async submission errors are not consistently announced via `aria-live`.
- Recommendation:
  - Add `role="alert"` or `aria-live` and tie field errors back to controls.

**[P3] Current observability is better for logs than for actionable runbooks**

- Category: Operability / Process maturity
- Location:
  - repo-wide
- Impact:
  - Troubleshooting still depends too much on source familiarity.
- Recommendation:
  - Add operational runbooks for billing incidents, cron backlog, provider outage response, and impersonation misuse.

## Systemic Gaps

- **Privileged-path overreach**: service-role usage and staff tooling create large blast radius when authorization is even slightly wrong.
- **Idempotency debt**: several core workflows assume single delivery/single execution in environments where retries and overlap are normal.
- **Config trust debt**: missing env vars can quietly weaken security or reliability.
- **Release-gate debt**: current CI signals do not match application complexity.
- **Accessibility debt**: the app has a number of real assistive-tech blockers, not just polish issues.

## Phased Remediation Plan

### Phase 0: Blockers

Complete before any enterprise rollout:

1. Restrict write-enabled impersonation to superadmins and remove raw service-role access from ordinary platform sessions.
2. Replace replayable OAuth state with one-time server-tracked nonces.
3. Require admin roles for all org-wide integration connect/disconnect actions.
4. Make sequence sending and Stripe webhook processing durably idempotent.
5. Add startup env validation that fails closed for security-critical configuration.
6. Remove viewport zoom suppression and fix non-semantic dialog/button patterns.

### Phase 1: Reliability Hardening

1. Make destructive retention flows transactional and resumable.
2. Make cron run status truthful, per-org isolated, and failure-aware.
3. Fix booking timezone handling and payment finalization UX consistency.
4. Split shared secrets by route/provider and remove legacy auth fallbacks.

### Phase 2: Release Engineering

1. Add `typecheck` script and required CI job.
2. Lint the full repo, including `app/**/*.tsx`.
3. Add Playwright smoke coverage for critical user, billing, and admin flows.
4. Add coverage reporting and thresholds for high-risk domains.

### Phase 3: UX and Accessibility

1. Replace ad hoc overlays with accessible primitives.
2. Fix form semantics, error announcements, and stateful control semantics.
3. Improve tablet/mobile layout width and touch target sizing.

## Suggested Ownership

- Security / auth / integrations: backend platform owner
- Billing / Stripe / cron idempotency: backend reliability owner
- CI / tests / release gates: engineering productivity owner
- Accessibility / responsive UX: frontend owner
- Deploy safety / runbooks: devops or release owner

## Exit Criteria For Re-Audit

Re-run this audit after:

- all `P0` and `P1` findings are closed
- CI requires `lint`, `typecheck`, `test`, and browser smoke tests
- billing and messaging replay/idempotency tests are merged
- accessibility blockers are fixed and verified manually

