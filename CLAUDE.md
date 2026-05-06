# DealerWyze Working Rules

## Project
- Multi-tenant SaaS CRM for used-car dealerships.
- Brand: DealerWyze.
- Apollo Auto is Tim's tenant for testing, not the product.
- Stack: Next.js App Router, TypeScript, Tailwind, Supabase, Twilio, Stripe, Retell, Anthropic, Groq, Upstash Redis (rate limits), Vercel (hosting / `vercel.json` crons). Email: **Resend** HTTP API for coaching digest when `RESEND_API_KEY` is set (`lib/intelligence/coachingDigest.ts`); other paths may use SMTP/nodemailer.

## Non-Negotiables
- Treat every change as multi-tenant and security-sensitive.
- Never trust `org_id` from request input. Derive tenant scope from `requireProfile()`.
- Never expose cross-tenant data, secrets, internal IDs, stack traces, or raw DB errors.
- Never put secrets in query params, logs, or response bodies.
- Use `crypto.timingSafeEqual()` for secret comparisons.

## Auth And Authorization
- API routes must call `requireProfile()` first unless the route is intentionally public.
- Platform admin routes must call `requirePlatformSuperAdmin(profile.id)` or the narrower platform-area helper.
- Do not use raw role strings. Use helpers from `lib/auth/dealerRoles.ts` and `lib/auth/platform.ts`.
- **Platform admin routes** (`app/api/admin/`) use `createServiceClient()` where cross-org access is required. **Org-scoped authenticated routes** use `createClient()` from `lib/supabase/server.ts`, or **`createClientForRequest()`** (`lib/supabase/forRequest.ts`) when staff impersonation must run queries under RLS as the impersonated org.

## Service-Role Policy (Enforced — v1.1 Hardening)
`createServiceClient()` bypasses all Supabase RLS. It is ONLY permitted in:
- **Platform admin routes** (`app/api/admin/`) — cross-org by design
- **Cron jobs** (`app/api/cron/`, `lib/cron/`) — no user session
- **Inbound webhooks** (Stripe, Twilio, Retell, Telegram, fax, render) — no user session
- **Public/token routes** (pay, book, pulse survey, unsubscribe, transfer) — no user session
- **OAuth callbacks** (Gmail, Google Calendar, social platforms) — session not reliable mid-redirect
- **Storage signing** — Supabase Storage ignores session-level RLS; service key required for signed URLs
- **Auth and onboarding flows** — no session yet at registration/onboarding
- **`lib/auth/platform.ts`** — platform superadmin checks against platform tables
- **`lib/audit/log.ts`** — `writeAuditLog()` uses service role for append-only `audit_log` inserts (RLS blocks authenticated INSERT)

Any new use of `createServiceClient()` in an org-scoped authenticated route handler REQUIRES:
1. A code comment explaining why service role is needed (not just "belt and suspenders")
2. Explicit `.eq('org_id', ...)` or `.eq('user_id', ...)` filter on EVERY query that touches org data
3. Review in the next PR that touches that file

If `requireProfile()` is called in the same handler → use `createClient()` instead. RLS enforces org scoping automatically.

See `.planning/service-role-triage.md` for the current service-role classification inventory.

## Data Safety
- Scope all DB access to the authenticated org.
- Prefer `404` over `403` when ownership should not be disclosed.
- Cap analytics date ranges at 365 days.
- Never fetch unbounded rows. Batch with cursor pagination and `.limit(500)`.
- Validate phone numbers, emails, dates, and any external URL or file input before use.
- File and image uploads must be size-capped before decoding or forwarding.

## Webhooks And Public Routes
- Twilio routes must validate `x-twilio-signature`.
- Cron routes must use `validateCronAuth(req)`.
- Gmail push must use `POST /api/gmail/webhook` with Google OIDC verification only. Do not reintroduce `/api/integrations/gmail/push` or `PUBSUB_VERIFICATION_TOKEN`.
- Legacy `/api/integrations/gmail/push` is deleted — do not re-add.
- Public token routes must be one-time or replay-safe and must verify external payment or delivery state before mutating records.

## User-Facing Messaging
- Use plain English.
- Say what happened, what the impact is, and what the dealer should do next.
- Avoid internal jargon in dealer-facing copy.

## Project-Specific Gotchas
- `customers` has no `org_id`; org scoping often uses the authenticated profile and `user_id`.
- `activities` has no `org_id`; inserting `org_id` will break writes.
- **BHPH:** `bhph_payments` is scoped by **`user_id`** (org UUID), not an `org_id` column. **`bhph_payment_ledger`** is append-only (no UPDATE/DELETE RLS policies in migration 141). Interest accrual uses **`last_payment_date`** / contract `created_at`; pass **`p_payment_date`** into `finalize_bhph_payment` / `record_bhph_manual_payment` consistently.
- `org_settings` writes should use `.update().eq('org_id', ...)`, not blind upserts.
- Staff impersonation uses the signed `dealerwyze_staff_org_id` cookie and `STAFF_SESSION_SECRET`.

## Code Audit Checklist (Required Before Marking Any Task Done)

This is a commercial multi-tenant SaaS. Before finishing any non-trivial change, audit across all dimensions below. Raise concerns explicitly — do not silently skip.

### Security
- Tenant isolation: every query scoped to the authenticated org, never request-supplied IDs
- Auth gates: `requireProfile()` present, correct role helper used, no raw string comparisons
- Service-role usage: justified, all queries filtered, not used where `createClient()` suffices
- Public/webhook routes: signature verified, replay-safe, rate-limited
- Input validation: Zod schema at boundary, no unsanitized user content in SQL, HTML, or shell
- Info leaks: error responses reveal nothing about other orgs, internal IDs, or stack traces
- Secret handling: no secrets in logs, query params, or response bodies

### Reliability
- Mutations that must be atomic are wrapped in an RPC or use optimistic-lock claim patterns
- Cron jobs and webhooks are idempotent — safe to retry or run concurrently
- Failures are logged and surfaced; silent swallowing of errors is flagged
- External API calls have timeout/error handling; failures don't corrupt local state

### Usability (dealer-facing)
- Error messages are plain English: what happened, impact, what to do next
- Loading and empty states are handled — no blank panels or unhandled null renders
- New UI elements are accessible: keyboard navigable, labels on inputs, sufficient contrast
- Mobile breakpoints not broken by layout changes

### Maintainability
- No premature abstractions; no code added beyond what the task requires
- No leftover debug logs, commented-out code, TODO markers without a ticket
- Naming is clear; non-obvious behavior has a one-line comment explaining WHY
- Migrations are additive and reversible where possible; destructive changes flagged

### Testing
- Security-critical paths (auth gates, payment flows, webhook dedup, tenant isolation) have tests
- New happy paths and primary failure modes are covered
- No test file on payment/tenancy/webhook/impersonation files is skipped or marked `.todo`
- Tests assert behavior, not implementation details

### Operability
- New env vars are documented in `.env.example` and validated in `lib/env/validate.ts`
- Logging is structured and actionable — enough to diagnose production incidents
- Expensive or high-cardinality queries have indexes; no unbounded scans added
- Cron schedules, rate limits, and quotas are appropriate for production load

### Before Finishing
- Check tenant isolation.
- Check authorization helper usage.
- Check rate-limit, quota, and billing implications for any expensive path.
- Check error responses for info leaks.
- Run the smallest meaningful verification for touched code.

## Release Gate Policy (v1.1 — Enforced)

All three gates must pass before any deploy to staging or production:

1. `npx eslint app components hooks lib --max-warnings=0` — zero problems (see `.planning/DEPLOY_CHECKLIST.md` for equivalent globs)
2. `npm test` — all tests pass, none skipped on payment/tenancy/webhook files
3. `npm run build` — compiles with no type errors

See `.planning/DEPLOY_CHECKLIST.md` for full pre-deploy steps, env var requirements, and rollback procedure.

## Audit Logging (v1.1 — `audit_log`)

High-risk actions must call **`writeAuditLog()`** from `lib/audit/log.ts` (service-role insert; **never throws**; callers must not depend on return data). The table is **append-only** (no UPDATE/DELETE).

**Five audited areas (required `action` values):**

1. **Impersonation** — `impersonation_start`, `impersonation_end` (`actor_type: 'staff'`).
2. **Payments** — `payment_confirmed` (BHPH confirm after successful RPC; `entity_type: 'bhph_token'`; `actor_id` null on public token route).
3. **Data export** — `data_export` (successful ZIP export; `actor_type: 'user'`).
4. **Settings & roles** — `settings_updated` (`metadata.changed_keys`); **`role_changed`** (`entity_type: 'profile'`, `metadata.from_role` / `to_role`).
5. **Webhook auth failures** — `webhook_auth_failure` (`org_id` / `actor_id` null; `metadata.path` + `metadata.reason`). Examples in code: **`invalid_cron_secret`** (`lib/cron/validateCronAuth.ts`), **`gmail_oidc_invalid`** (`lib/gmail/pushWebhook.ts`), **`invalid_signature`** (`app/api/twilio/inbound/route.ts`).

Do not log stack traces or raw secrets in `metadata`. Keep `org_audit_log` / `admin_audit_log` writes if existing code still uses them; add **`audit_log`** for new Phase 5 parity.

---

Last updated: 2026-05-05
