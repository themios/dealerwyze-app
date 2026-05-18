# Cursor AI Execution Prompt — Monitoring, Admin Observability & Backup
_Hand this file directly to Cursor. Do not summarize it — paste the full content._

---

## Your Role

You are implementing a production monitoring, observability, and backup system for DealerWyze — a multi-tenant SaaS CRM for used-car dealerships built on Next.js App Router, TypeScript, Tailwind, Supabase, and Vercel.

You are not the architect. The architecture decisions are already made and documented in the plan files below. Your job is to implement them exactly as specified, flag any deviations clearly, and produce a completion report.

---

## Mandatory Standards (Read First)

Before writing a single line of code, read and internalize:

1. `docs/ENTERPRISE_HARDENING_STANDARD.md` — mandatory engineering standard for all code on this project
2. `CLAUDE.md` — project-specific rules, schema gotchas, auth patterns, and service-role policy
3. `.planning/MONITORING_PLAN.md` — Sentry, PostHog, Axiom implementation plan
4. `.planning/ADMIN_OBSERVABILITY_PLAN.md` — admin board + 7-day data recovery plan
5. `.planning/BACKUP_PLAN.md` — Cloudflare R2 backup via GitHub Actions plan

These documents are your specification. The ENTERPRISE_HARDENING_STANDARD.md is your quality bar. Do not deviate from either without flagging it explicitly.

---

## Critical Rules (Non-Negotiable)

These come directly from the hardening standard and CLAUDE.md. Violations will cause the implementation to be rejected:

### Auth & Tenant Isolation
- Every API route must call `requireProfile()` first — no exceptions for org-scoped routes
- Admin routes must call `canAccessAdminArea(profile.id)` from `lib/auth/platform.ts`
- Never derive org scope from request input — always from `requireProfile()`
- Never use raw role string comparisons — use helpers from `lib/auth/dealerRoles.ts` and `lib/auth/platform.ts`

### Service Role
- `createServiceClient()` is ONLY permitted in admin routes, cron jobs, webhooks, and `writeAuditLog()` calls
- If `requireProfile()` is called in the same handler, use `createClient()` instead
- Every `createServiceClient()` call must have a comment explaining WHY it needs service role
- Every query using service role must have explicit `.eq('org_id', ...)` or `.eq('user_id', ...)` filter

### Schema Gotchas (Will Break Writes If Violated)
- `customers` table has NO `org_id` column — org scoping uses `user_id`
- `activities` table has NO `org_id` column — never insert `org_id` into it
- `bhph_payment_ledger` is append-only — no UPDATE or DELETE ever
- `org_settings` writes use `.update().eq('org_id', ...)` — never blind upsert

### PII & Security
- No PII (customer names, phones, emails, message bodies) in Sentry events, PostHog properties, or logs
- Sentry user context: `id = org_id`, `segment = role` — never email or display name
- PostHog identify: `distinctId = org_id` — never personal user ID or email
- PostHog session replay: `maskAllInputs: true` is mandatory
- External API keys (SENTRY_AUTH_TOKEN, POSTHOG_PERSONAL_API_KEY, R2 credentials) must never be returned to the client
- Backup encryption key must only exist as a GitHub Actions secret — never in Vercel env vars, never in code

### Secrets
- Never hardcode secrets
- All new env vars must be added to `.env.example` with a comment
- All new env vars must be validated in `lib/env/validate.ts` if they are required at runtime

### Error Handling
- Never expose stack traces in API responses
- Return plain English error messages to the client
- Log detailed errors server-side via `logger.error()`
- All external API calls (Sentry API, PostHog API, R2) must have try/catch with graceful fallback — a failed external call must never break a page render

### Audit Logging
- Restore actions must call `writeAuditLog()` with action `data_restored`
- Purge actions must call `writeAuditLog()` with action `data_purged`
- `writeAuditLog()` never throws — do not depend on its return value

### Code Quality
- No premature abstractions
- No features beyond what the plan specifies
- No leftover debug logs or commented-out code
- All three release gates must pass before you declare done:
  1. `npx eslint app components hooks lib --max-warnings=0` — zero problems
  2. `npm test` — all tests pass
  3. `npm run build` — no type errors

---

## Execution Order

Execute in this exact order. Run the lint + build check after each phase before moving to the next.

### Phase A — Database Migrations (do first — protects data immediately)
1. Create `supabase/migrations/150_data_recovery_archive.sql` per ADMIN_OBSERVABILITY_PLAN.md Task R1
2. Create `supabase/migrations/151_recovery_log.sql` per Task R2
3. Verify: triggers must be `SECURITY DEFINER`, RLS enabled on all 4 deleted_ tables with NO authenticated-role policies

### Phase B — Cron: Recovery Archive Purge
4. Create `app/api/cron/purge-recovery-archive/route.ts` per Task R3
5. Add to `vercel.json` crons: `{ "path": "/api/cron/purge-recovery-archive", "schedule": "0 3 * * *" }`

### Phase C — Data Recovery Admin APIs
6. Create `app/api/admin/data-recovery/route.ts` (GET) per Task R4
7. Create `app/api/admin/data-recovery/[id]/restore/route.ts` (POST) per Task R4
8. Create `app/api/admin/data-recovery/[id]/purge/route.ts` (POST) per Task R4
9. Create `app/api/admin/data-recovery/summary/route.ts` (GET) per Task R7

### Phase D — Data Recovery Admin UI
10. Create `app/(app)/admin/data-recovery/page.tsx` per Task R5
11. Extend `app/(app)/admin/orgs/[id]/page.tsx` with System Health section per Task R3 + O3
12. Update delete success toasts to include 7-day recovery notice per Task D1

### Phase D2 — Customer Record Search & Restore (Task N1)
13. `npm install @aws-sdk/s3-request-presigner` (needed here and in Phase J2)
14. Create `app/api/admin/data-recovery/search/route.ts` per Task N1
    - GET with query param `q` (min 2 chars)
    - Uses `createServiceClient()` — admin route, cross-org by design
    - Searches `deleted_customers.row_data` JSONB: `.or('row_data->>full_name.ilike.%q%,row_data->>phone.ilike.%q%')`
    - Joins `profiles` to attach `org_name` (display name of the dealer) to each result
    - Returns: `id`, `org_id`, `org_name`, `row_data.full_name`, `row_data.phone`, `deleted_at`, `expires_at`
    - No PII beyond what's needed to identify the record — do not return full JSONB blob to client
15. Add "Find Deleted Customer" search section to top of `app/(app)/admin/data-recovery/page.tsx`
    - Text input + Search button, fires on button click (minimum 2 chars enforced client-side)
    - Shows results in a table: Dealer Name | Customer Name | Phone | Deleted | Expires | [Restore]
    - Expiry countdown color: green (>48h), amber (12–48h), red (<12h), gray (expired)
    - Restore button calls existing POST `/api/admin/data-recovery/[id]/restore` — same flow as the main table

### Phase D3 — Backup Download Signed URL (Task N2)
16. Create `app/api/admin/backup-download/route.ts` per Task N2
    - GET with query param `key` (the R2 object path, e.g. `daily/backup-2026-05-08.sql.gz.enc`)
    - Uses `createServiceClient()` for auth check, then `@aws-sdk/s3-request-presigner` `getSignedUrl`
    - Path traversal protection: reject keys containing `..` or `//`; only allow keys starting with `daily/`, `weekly/`, or `monthly/`
    - Signed URL expiry: 15 minutes (`expiresIn: 900`)
    - Response: `{ url: string, expires_in_seconds: 900 }`
    - Credentials read from: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
    - Do NOT return credentials in the response

### Phase E — Sentry Hardening
17. Replace `sentry.client.config.ts` per Task S1
18. Replace `sentry.server.config.ts` per Task S2
19. Replace `sentry.edge.config.ts` per Task S3
20. Update `next.config.ts` Sentry options per Task S4
21. Create `lib/sentry/setUserContext.ts` per Task S5
22. Wire Sentry user context into `app/(app)/layout.tsx` per Task S6
23. Create `app/(app)/error.tsx` per Task S7
24. Create `app/global-error.tsx` per Task S7

### Phase F — PostHog
25. `npm install posthog-js posthog-node`
26. Create `lib/posthog/provider.tsx` per Task P3
27. Create `lib/posthog/identify.ts` per Task P4
28. Wire PostHogProvider into root `app/layout.tsx` per Task P5a
29. Create `components/analytics/OrgIdentifier.tsx` per Task P5b
30. Wire OrgIdentifier into `app/(app)/layout.tsx` per Task P5c
31. Create `hooks/useAnalytics.ts` per Task P6
32. Instrument key screens per Task P7 (lead card, customer detail, calendar, vehicles, receipts, ledger, AI brief)
33. Create `components/analytics/PostHogPageView.tsx` per Task P8
34. Wire PostHogPageView into `app/(app)/layout.tsx` per Task P8
35. Wire PostHog reset into sign-out handler per Task P9

### Phase G — Axiom / Logger Enhancement
36. Enhance `lib/logger.ts` per Task A2 (add org_id, duration_ms fields)
37. Update logger calls on 5 high-traffic routes per Task A3

### Phase H — Sentry on Critical Paths
38. Wrap Twilio webhook in Sentry span per Task E1
39. Wrap Stripe webhook in Sentry span per Task E2
40. Add Sentry breadcrumb on auth failures per Task E3

### Phase I — Uptime & Health
41. `npm install @vercel/speed-insights @vercel/analytics`
42. Add SpeedInsights + Analytics to root `app/layout.tsx` per Task U1
43. Create `app/api/health/route.ts` per Task U2 — public route, NO auth, NO database calls, returns `{ ok: true, ts: Date.now() }`

### Phase J — Backup (R2 + GitHub Actions)
44. `npm install @aws-sdk/client-s3` (note: `@aws-sdk/s3-request-presigner` was already installed in Phase D2 — skip if already present)
45. Create `.github/workflows/db-backup.yml` per BACKUP_PLAN.md Task B1
46. Create `lib/backup/r2Client.ts` per Task B3
47. Create `app/api/admin/backup-status/route.ts` per Task B3
48. Create `app/(app)/admin/backup-status/page.tsx` per Task B4
    - Each file row must include a Download button that calls GET `/api/admin/backup-download?key=<object_key>`
    - On success: open the signed URL in a new tab and show a toast with CLI restore instructions
    - On error: show a plain-English toast (do not expose R2 errors to the UI)
49. Create `docs/BACKUP_RESTORE.md` per Task B6 (restore procedure documentation)

### Phase K — Admin Observability Pages
50. Create `app/api/admin/platform-health/route.ts` per ADMIN_OBSERVABILITY_PLAN.md Task O1
51. Create `app/(app)/admin/platform-health/page.tsx` per Task O1
52. Create `app/api/admin/feature-adoption/route.ts` per Task O2
53. Create `app/(app)/admin/feature-adoption/page.tsx` per Task O2
54. Add System Health section to `app/(app)/admin/orgs/[id]/page.tsx` per Task O3
55. Create `app/api/admin/orgs/[id]/health/route.ts` per Task O3

### Phase L — Admin Dashboard + Nav
56. Add Platform Health, Feature Adoption, Data Recovery, and Backup Status cards to `app/(app)/admin/page.tsx` per Tasks O4, R7, B5
57. Add nav links to `components/layout/DesktopSidebar.tsx` and `BottomNav.tsx` per Tasks Q1, B6

### Phase M — Env Vars + Validation
58. Update `.env.example` with all new vars from all three plan files
59. Update `lib/env/validate.ts` to validate any required new env vars

### Final
60. Run `npx eslint app components hooks lib --max-warnings=0`
61. Run `npm test`
62. Run `npm run build`
63. Produce `ADMIN_OBSERVABILITY_REPORT.md` using the completion report template from ADMIN_OBSERVABILITY_PLAN.md and BACKUP_PLAN.md

---

## Completion Report Requirements

The report MUST cover every task ID from all three plan files. For each task state whether it was:
- ✅ Implemented as specified
- ⚠️ Implemented with deviation (explain what changed and why)
- ❌ Skipped (explain why — missing dependency, conflict, out of scope)

The report MUST include the full enterprise compliance checklist from each plan file with every checkbox explicitly marked PASS or FAIL.

The report MUST list every manual step that Tim (the operator) still needs to complete after deployment (Supabase migration push, Vercel env vars, Axiom log drain, Sentry alert rules, uptime monitor setup, first manual backup trigger).

If any release gate fails (eslint, test, build), the report must say so explicitly and list what failed. Do not mark the implementation as complete if a release gate is failing.

---

## What NOT to Do

- Do not add features beyond what the plan specifies
- Do not refactor unrelated code while implementing these features
- Do not use `createServiceClient()` in any org-scoped authenticated route without a justification comment
- Do not skip the completion report
- Do not mark tasks complete if the build or lint is failing
- Do not add PostHog event properties that could contain PII (names, phones, emails, message content)
- Do not return R2 credentials, Sentry tokens, or PostHog server keys in any API response
- Do not add the `BACKUP_ENCRYPTION_KEY` to Vercel env vars — it is a GitHub Actions secret only
- Do not add `org_id` to any insert on the `customers` or `activities` tables
