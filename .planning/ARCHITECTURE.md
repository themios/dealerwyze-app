# DealerWyze architecture (developer reference)

This document is derived from the `apollo-crm/` codebase. File paths are relative to `apollo-crm/` unless noted.

---

### 1. Stack

The app is a **Next.js** (App Router) **TypeScript** project with **Tailwind CSS** for styling. **Supabase** provides Postgres, Auth, Row Level Security, and Storage. Integrations include **Twilio** (SMS/voice webhooks), **Stripe** (payments; dealers use connected keys for customer pay links), **Retell** (referenced in org settings / voice), **Anthropic** and **Groq** (AI features), **Resend** (HTTP API used for coaching digest email when `RESEND_API_KEY` is set — see `lib/intelligence/coachingDigest.ts`), **@upstash/redis** + **@upstash/ratelimit** for distributed rate limits (`lib/rateLimit/upstash.ts`), and deployment on **Vercel** (`vercel.json` cron entries).

---

### 2. Auth & Session Model

**`requireProfile()`** (`lib/auth/profile.ts`): loads the authenticated user via `createClient()` (`lib/supabase/server.ts`), reads `profiles`, normalizes org-owner role with `normalizeOwnerRole()`, then:

- If no profile → `redirect('/login')`.
- If `org_id` is missing → `redirect('/login?reason=no_org')`.
- If `deactivated_at` is set → `signOut()` and `redirect('/login?reason=deactivated')`.
- If a valid **staff session** cookie exists → returns the profile with **`org_id` replaced** by the cookie’s org (still the staff user’s `id` / `role`).

Return type is `Promise<Profile>` (`Profile` in `lib/auth/profile.ts`: `id`, `display_name`, `role`, `org_id`, optional `platform_role`, `deactivated_at`, `created_at`, `pulse_score`).

**Staff impersonation** (`lib/auth/staffSession.ts`, `lib/supabase/impersonation.ts`, `lib/supabase/forRequest.ts`):

- Cookie: **`dealerwyze_staff_org_id`**, value `sign(<orgId>|<writeMode>)` with HMAC-SHA256 using `STAFF_SESSION_SECRET`. `getStaffSessionInfo()` returns `{ orgId, writeMode }` (legacy cookies without `|` are read-only).
- **`createScopedImpersonationClient(orgId)`** (`lib/supabase/impersonation.ts`): uses **`createServiceClient()` only inside the module** to load the first `profiles.id` for that `org_id`, mints a short-lived JWT with `SUPABASE_JWT_SECRET`, returns a **Supabase client with anon key + `Authorization: Bearer <token>`** — not the service role.

**`UserRole`** (`types/index.ts`): `dealer_admin`, `dealer_manager`, `dealer_finance`, `dealer_rep`, `dealer_staff`, `admin` (legacy alias → treated as dealer admin), `agent` (legacy alias → treated as dealer staff).

**Helpers** (`types/index.ts`, `lib/auth/dealerRoles.ts`):

- **`isDealerAdmin`**: admin-level privileges (`dealer_admin` or `admin`).
- **`hasFullOrgAccess`**: can see org-wide data (not rep-restricted): admin, manager, finance, staff, legacy `admin` / `agent`.
- **`canManageUsers`**: same as `isDealerAdmin` — use when gating invite/role/user admin APIs.

---

### 3. Tenant Isolation Model

**Typical server flow**: `requireProfile()` → **`profile.org_id`** (possibly staff-overridden) is the tenant key for application logic. **`createClient()`** uses the **real** Supabase session (staff user JWT); RLS therefore sees the staff user’s **true** `auth.uid()`, not the impersonated org. Routes that must enforce RLS **as the impersonated org** use **`createClientForRequest()`** (`lib/supabase/forRequest.ts`): if `getStaffSessionInfo()` has an org, it returns **`createScopedImpersonationClient(orgId)`**; otherwise **`createClient()`**.

**`get_org_id()`**: referenced in migrations (e.g. `supabase/migrations/139_audit_log.sql`, `138_authenticated_social_and_video_rls.sql`, `117_lead_intelligence_phases_b_f.sql`) as `org_id = get_org_id()` for RLS. Migration comments point to an earlier migration for the function definition; **no `CREATE FUNCTION get_org_id` appears in the committed `supabase/migrations/*.sql` files in this repo**.

**Customers / activities**: `customers.user_id` and `activities.user_id` store the **org UUID** (see `CLAUDE.md` / `types/index.ts` `Customer.user_id`, `Activity.user_id`). There is **no `org_id` column** on these tables in the types and docs; **`CLAUDE.md` states inserting `org_id` on `activities` breaks writes**.

**`createServiceClient()`** (`lib/supabase/service.ts`): bypasses RLS. Permitted-use list is maintained in **`CLAUDE.md`** (Service-Role Policy section), not in `service.ts` itself.

**`forRequest.ts` during impersonation**: returns JWT-scoped client for the impersonated org; without staff cookie, defers to normal cookie session client.

---

### 4. Key Tables

| Table | Purpose (one line) | Org scoping column |
|--------|--------------------|--------------------|
| `customers` | Dealer’s contacts / leads | `user_id` = org id |
| `activities` | Calls, SMS, tasks, notes, etc. | `user_id` = org id |
| `vehicles` | Inventory units | `user_id` = org id |
| `bhph_payments` | BHPH contract | `user_id` = org id |
| `bhph_payment_ledger` | Append-only payment history lines | `user_id` = org id |
| `bhph_payment_tokens` | One-time Stripe pay links | `org_id` (see `app/api/pay/[token]/route.ts`) |
| `lost_lead_audit` | Snapshot when leads archived for coaching / root cause | `org_id` |
| `audit_log` | Phase 5 append-only security audit | `org_id` nullable for global events |
| `org_audit_log` | Legacy org-visible audit stream | `org_id` (see `app/api/audit/route.ts`, `app/api/admin/impersonate/route.ts`) |
| `sequences` | Message sequence definitions | `org_id` (`types/index.ts` `Sequence`) |
| `customer_sequences` | Customer enrollment in a sequence | `org_id` (e.g. `app/api/today/bulk-action/route.ts`) |
| `org_settings` | Per-dealer settings row | `org_id` |
| `profiles` | User accounts | `org_id` |
| `organizations` | Tenant / billing entity | primary key `id` |
| `push_subscriptions` | Web push endpoints | `org_id` NOT NULL (`supabase/migrations/140_push_subscriptions_org_id_not_null.sql`) |

---

### 5. Today Command Center

**Section waterfall order** (`lib/today/queueSort.ts` `SECTION_ORDER`): `replied` → `human_now` → `ai_handling` → `follow_up_later` → `low_roi`. Items sort first by section index, then `repAttentionScore`, then `decision.priorityScore`.

**`QueueItem`** (key fields, `lib/today/queueSort.ts`): `key`, `type`, `customerId`, `data` (`Activity | VoiceCall`), `decision` (`QueueDecision`), `section` (`TodaySection`), `repAttentionScore`, `hasResponded`, `hasActiveSequence`, optional `takeoverSignal`, optional `lastDitchState`.

**`sectionAssignment()`** inputs (`lib/today/queueSort.ts`): `itemType`, `data`, `hasResponded`, `hasActiveSequence`, `takeoverSignal`, `decision`. Returns a `TodaySection`: respects `today_park_until`, `today_section_override`, `snoozed_until`; then replied/takeover → `replied`; `appt_request` → `human_now`; hot/warm/new/voice/vehicle_match without sequence → `human_now`; active sequence → `ai_handling`; ghost lead / cold+low likelihood → `low_roi`; `waiting` → `follow_up_later`; default `human_now`.

**Action → re-home** (optimistic UI mapping `patchActivityState`, `app/(app)/today/TodayContent.tsx`): `park` → `follow_up_later` + `today_park_until`; `trust_sequence` → `ai_handling` + clear park/snooze; `low_roi` → `low_roi`; `take_over` → `human_now`; `work_now` / `restart` → clear overrides and park/snooze; `archive` → remove from local list (server completes activity).

**Last-ditch** (`computeLastDitchState` in `lib/today/queueSort.ts`): for `low_roi` non-voice items, if `customer.last_ditch_sent_at` is within **48 hours**, state is `waiting`; after that, `archive_recommended`.

**Lost lead audit & root cause**: **`lost_lead_audit`** rows are inserted when archiving from **bulk action** `archive` (`app/api/today/bulk-action/route.ts` + `buildLostLeadAuditRow` in `lib/intelligence/lostLeadAudit.ts`). **`runRootCauseBatchForOrg`** (`lib/intelligence/rootCause.ts`) selects recent audits with `root_cause_json` null, loads activities, calls **Groq**, updates `root_cause_json`, `root_cause_ran_at`, `root_cause_confidence`, `root_cause_needs_review`, and logs `ai_usage_log`. It is invoked from **`app/api/cron/weekly-performance/route.ts`**. The codebase does not use the labels “Phase 6A/6B”; behavior above is what is implemented.

---

### 6. API Route Conventions

**Pattern** (stated in `CLAUDE.md`): authenticated routes call **`requireProfile()`** first unless intentionally public; use **`lib/auth/dealerRoles.ts`** helpers instead of raw role strings; validate with **Zod** at the boundary (e.g. `lib/validation/parseRequest.ts`, route-local schemas).

**Errors**: `CLAUDE.md` requires not exposing cross-tenant data, raw DB errors, stack traces, or secrets in responses (e.g. pay route returns generic “Could not finalize payment” on RPC failure — `app/api/pay/[token]/route.ts`).

**Rate limiting** (`lib/rateLimit/upstash.ts`): examples include **`orgExportLimiter`**, **`orgTodayActionLimiter`**, **`orgTodayBulkLimiter`**, **`orgLostLeadExportLimiter`**, **`paymentLimiter`** (IP), **`webLeadLimiter`**, etc.

**Webhooks**: Twilio validates signature (`app/api/twilio/inbound/route.ts`); cron uses **`validateCronAuth`** (`lib/cron/validateCronAuth.ts`) — Bearer `CRON_SECRET` or legacy `x-cron-secret` / `LEADS_POLL_SECRET`.

---

### 7. BHPH Payment Flow (summary)

**Token / Stripe**: Public **`GET/POST /api/pay/[token]`** (`app/api/pay/[token]/route.ts`) uses **`createServiceClient()`**, rate-limits by IP, creates/confirms PaymentIntents with the dealer’s **`stripe_dealer_secret_key`**, then calls RPC **`finalize_bhph_payment`** with `p_payment_date` (see **`supabase/migrations/141_bhph_interest_ledger.sql`**). See **`.planning/BHPH_MODULE.md`** for detail.

**`finalize_bhph_payment` (5-arg)**: atomically marks token paid (or idempotent same PI), inserts **ledger** row, inserts **activity** note, updates **contract** (totals, interest, principal, `last_payment_date`, conditional `next_due_date` advance, `paid_off` when balance ≤ 0).

**Manual payment**: **`record_bhph_manual_payment`** RPC (`141`), called from **`POST /api/bhph/[id]/payment`**.

**Interest**: computed inside **`bhph_payment_allocation`** in `141` (daily rate = annual/365, accrual window from `COALESCE(last_payment_date, created_at::date)` — see BHPH doc).

---

### 8. Background Jobs

All routes below live under **`app/api/cron/<name>/route.ts`**. **`validateCronAuth`** (`lib/cron/validateCronAuth.ts`) accepts **`Authorization: Bearer <CRON_SECRET>`** or **`x-cron-secret: <LEADS_POLL_SECRET>`** (legacy); on failure it may **`writeAuditLog`** with `webhook_auth_failure` / `invalid_cron_secret`.

**Exception**: **`/api/cron/reset-billing-cycle`** uses **only** `x-cron-secret` vs `LEADS_POLL_SECRET` with `timingSafeEqual` (see file header comment).

**`vercel.json` schedules** (UTC cron syntax):

| Path | Schedule |
|------|----------|
| `/api/cron/sync-leads` | `*/15 * * * *` |
| `/api/cron/send-sequences` | `*/15 * * * *` |
| `/api/cron/check-tasks` | `0 16 * * *` |
| `/api/cron/poll-reviews` | `0 */4 * * *` |
| `/api/cron/data-retention` | `0 10 * * *` |
| `/api/cron/retention-triggers` | `0 17 * * *` |
| `/api/cron/card-batch` | `0 14 * * 1` |
| `/api/cron/process-render-queue` | `* * * * *` |
| `/api/cron/account-lifecycle` | `0 11 * * *` |
| `/api/cron/daily-intelligence` | `30 11 * * *` |
| `/api/cron/daily-social` | `15 13 * * *` |

**Not listed in `vercel.json`** (handlers still exist): **`weekly-performance`**, **`inventory-pricing-check`**, **`sync-inventory`**, **`reset-billing-cycle`** — configure externally if used.

**High-level behavior** (from route files / comments):

- **sync-leads**: `runLeadPollForOrg`, triggers BHPH remind fetch with `CRON_SECRET` bearer.
- **send-sequences**: due sequence steps, Twilio/Gmail, quotas.
- **check-tasks**: aggregates many jobs (`lib/cron/jobs/*`).
- **poll-reviews**: GBP reviews, push notifications.
- **data-retention**: cancelled org hard-delete after 90 days.
- **retention-triggers**: birthday/anniversary/etc. enrollments.
- **card-batch**: print/mail or PostGrid card batches.
- **process-render-queue**: Remotion Lambda dispatch.
- **account-lifecycle**: trial/grace/suspension (`runAccountLifecycle`).
- **daily-intelligence**: `runDailyIntelligenceJob` (`lib/cron/runDailyIntelligence.ts`).
- **daily-social**: opt-in Meta feed posts (`runOrgSocialPublish`).
- **weekly-performance**: `buildMessagingPatternsForOrg`, **`runRootCauseBatchForOrg`**, **`sendCoachingDigestForOrg`**.
- **inventory-pricing-check**: pricing assessment + email (`lib/pricing/pricingAssessment`).
- **sync-inventory**: inventory CSV feeds.
- **reset-billing-cycle**: billing cycle counter reset.

---

### 9. Migrations

**Highest numbered migration file in this repo:** **`142_bhph_sale_interest_principal.sql`**.

**Naming:** `NNN_snake_description.sql` under `supabase/migrations/`.

**Note:** `customers` and `activities` are scoped by **`user_id`**, not `org_id`; do not add `org_id` to `activities` for writes (per `CLAUDE.md`).

---

*Last generated from repository snapshot; verify behavior in cited files after upgrades.*
