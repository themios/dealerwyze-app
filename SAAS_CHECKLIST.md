# DealerWyze — SaaS Conversion Checklist

**Reference plan:** `SAAS_MASTER_PLAN.md` (detailed specs, SQL, file paths)
**Last updated:** 2026-03-03
**Status legend:** ✅ Done | 🔲 Pending | 🚧 In Progress | ❌ Blocked

---

## Already Complete (pre-checklist)

- ✅ Full org isolation via Supabase RLS (`get_org_id()` SECURITY DEFINER)
- ✅ Per-org Twilio phone provisioning (`/api/admin/provision-phone`)
- ✅ Per-org Retell voice agent (`/api/admin/provision-voice`)
- ✅ Multi-account email lead sync (`email_accounts` table, Gmail OAuth + IMAP)
- ✅ Stripe billing + SMS tiers (1k/3k/10k)
- ✅ Support ticket system (`/support`, `/admin/tickets`)
- ✅ Admin Analytics Dashboard (`/admin/analytics`)
- ✅ Audit Log UI (`/admin/audit-log`)
- ✅ Admin org detail page (`/admin/orgs/[id]`)
- ✅ Platform Team UI (`/admin/team` — create/delete platform staff)
- ✅ Dealer onboarding wizard (5-step)
- ✅ `isPlatformSuperAdmin()`, `isPlatformStaff()`, `canAccessAdminArea()` in `lib/auth/platform.ts`
- ✅ `requireOrgId()` replaces APOLLO_USER_ID fallback pattern
- ✅ `getOrgIdByPhone()` routes inbound SMS/voice to correct org
- ✅ Sentinel org UUID for platform staff profiles
- ✅ Slug-based inventory feed URLs (`/api/inventory/cargurus-feed/[slug]`)
- ✅ TCPA opt-out/opt-in messages dynamic from `org_settings.business_name`
- ✅ BHPH messages parameterized from `org_settings`
- ✅ DealerWyze rebrand complete (branding, localStorage keys, legal pages)
- ✅ sync-inventory cron iterates all orgs
- ✅ poll-reviews cron iterates all orgs
- ✅ Calendar per-org token from `org_google_tokens` (with env var fallback)
- ✅ GBP per-org credentials from `org_settings` (with env var fallback)
- ✅ `location` type changed from union to `string | null`
- ✅ Migrations 001–038 applied
- ✅ Rate limiting + HMAC webhook validation (Phase 7A)
- ✅ Performance indexes (migration 032)

---

## Phase 1 — Database: Expanded Role Schema + Approval Workflow ✅ COMPLETE

> **Goal:** Expand dealer roles (admin/agent → 5-role hierarchy). Add org approval columns. Purely additive — no data changes.
> **File:** `supabase/migrations/039_dealer_roles_and_approval.sql`
> **Risk:** Low — existing roles kept as legacy aliases

### 1.1 Write migration `039_dealer_roles_and_approval.sql`
- ✅ Drop old `profiles_role_check` constraint
- ✅ Add new CHECK with 7 values: `dealer_admin`, `dealer_manager`, `dealer_finance`, `dealer_rep`, `dealer_staff`, `admin` (legacy), `agent` (legacy)
- ✅ Add `organizations.approved_at TIMESTAMPTZ NULL`
- ✅ Add `organizations.approved_by UUID NULL`
- ✅ Add `organizations.rejection_reason TEXT NULL`
- ✅ Auto-approve all existing orgs (`UPDATE organizations SET approved_at = created_at WHERE approved_at IS NULL AND id != sentinel-uuid`)
- ✅ Add index `idx_orgs_pending_approval` on `organizations WHERE approved_at IS NULL`

### 1.2 Apply migration
- ✅ Run in Supabase SQL editor
- ✅ Verify `INSERT profiles (role='dealer_rep')` succeeds
- ✅ Verify `INSERT profiles (role='bogus')` fails
- ✅ Verify all existing profiles load in app (no breakage)
- ✅ Verify `organizations.approved_at` is non-null for all existing orgs

### 1.3 Update TypeScript types
- ✅ `types/index.ts` — expand `UserRole` type to all 7 values
- ✅ `types/index.ts` — add `isDealerAdmin(role)` helper function
- ✅ `types/index.ts` — add `hasFullOrgAccess(role)` helper function
- ✅ `lib/auth/profile.ts` — update `role` field type to `UserRole`

---

## Phase 2 — Auth: Signup Gate + Pending Approval State ✅ COMPLETE

> **Goal:** New dealer signups land in pending state. SuperAdmin approves before access. Existing orgs unaffected.
> **Critical:** Must complete before any real second dealer signs up.

### 2.1 Register route — omit `approved_at` for new dealer orgs
- ✅ `app/api/auth/register/route.ts` — when creating a new org (role=admin), do NOT set `approved_at`
- ✅ Return `{ redirect: '/pending' }` in response for new admin signups
- ✅ Agent invites (joining existing org) — no change

### 2.2 Pending page
- ✅ Create `app/(app)/pending/page.tsx`
- ✅ Shows "Application Under Review" message with dealership name
- ✅ Shows rejection reason if `rejection_reason` is set
- ✅ Redirects to `/today` if `approved_at` is already set (already approved)

### 2.3 Layout gate — block pending dealers from app
- ✅ `app/(app)/layout.tsx` — after onboarding check, add approval check
- ✅ If `isDealerAdmin(role)` AND `approved_at IS NULL` AND not on `/pending` → redirect to `/pending`
- ✅ Platform staff + platform superadmin exempt from this check

### 2.4 Approve/Reject API route
- ✅ Create `app/api/admin/orgs/[id]/approve/route.ts`
- ✅ `POST` — sets `approved_at = NOW()`, `approved_by = profile.id`; logs to `admin_audit_log`
- ✅ `DELETE` — sets `rejection_reason = body.reason`; logs to `admin_audit_log`
- ✅ Both require `requirePlatformSuperAdmin()`

### 2.5 Admin dashboard — pending approval queue
- ✅ `app/(app)/admin/page.tsx` — add query for `organizations WHERE approved_at IS NULL`
- ✅ Render "Awaiting Approval" section above All Dealerships list
- ✅ Each card: dealer name, signup date, Approve button, Reject button (with reason textarea)

### 2.6 Test the approval flow end-to-end
- ✅ New dealer signup → lands on `/pending`, cannot navigate elsewhere
- ✅ `/admin` shows pending org
- ✅ Approve → dealer can access `/today`
- ✅ Reject → `/pending` shows reason
- ✅ Existing orgs (Apollo Auto etc.) unaffected

---

## Phase 3 — RBAC: Role Enforcement in API Routes + UI ✅ COMPLETE

> **Goal:** Granular roles enforced in API and UI. `dealer_rep` sees only assigned customers. Billing/user mgmt gated to `dealer_admin`.

### 3.1 Create role helper library
- ✅ Create `lib/auth/dealerRoles.ts`
- ✅ `canManageUsers(role)` — dealer_admin only
- ✅ `canAccessBilling(role)` — dealer_admin only
- ✅ `canAccessBhph(role)` — all except dealer_rep
- ✅ `canAccessLedger(role)` — all except dealer_rep
- ✅ `canAccessReports(role)` — dealer_admin + dealer_manager
- ✅ `isRepRestricted(role)` — dealer_rep only

### 3.2 API route guards
- ✅ `app/api/customers/route.ts` (GET) — filter by `assigned_to = profile.id` if `isRepRestricted(role)`
- ✅ `app/api/admin/users/route.ts` — use `canManageUsers(role)` instead of hardcoded `role === 'admin'`
- ✅ `app/api/stripe/*` routes — gate with `canAccessBilling(role)`
- ✅ `app/api/analytics/route.ts` — gate with `canAccessReports(role)`

### 3.3 UI gating (server components)
- ✅ `app/(app)/settings/billing/layout.tsx` — redirect if `!canAccessBilling(role)`
- ✅ `app/(app)/settings/users/layout.tsx` — redirect if `!canManageUsers(role)`
- ✅ `app/(app)/bhph/page.tsx` — redirect if `!canAccessBhph(role)`
- ✅ `app/(app)/analytics/page.tsx` — redirect if `!canAccessReports(role)`

### 3.4 BottomNav / More menu — hide links by role
- ✅ Hide BHPH link for `dealer_rep` (more/page.tsx filters by `isRep`)
- ✅ Hide Ledger link for `dealer_rep` (no separate Ledger link; BHPH hides covers this)
- ✅ Hide Analytics link for non-manager/admin roles (more/page.tsx filters by `canReports`)

### 3.5 Verify RBAC
- ✅ `dealer_rep`: `/api/customers` returns only assigned leads
- ✅ `dealer_rep`: accessing `/settings/billing` returns 403
- ✅ `dealer_manager`: accessing `/settings/users` returns 403
- ✅ `dealer_admin`: full access unchanged
- ✅ `isDealerAdmin('admin')` returns `true` (legacy compat)

---

## Phase 4 — Dealer User Management: Full Role Support ✅ COMPLETE

> **Goal:** `/settings/users` supports all 5 roles. Soft-deactivate replaces hard-delete.

### 4.1 Database — add deactivated_at column
- ✅ Added to migration `039`: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ NULL`
- ✅ Add index `idx_profiles_active ON profiles (org_id, deactivated_at) WHERE deactivated_at IS NULL`
- ✅ Migration applied

### 4.2 API changes — `app/api/admin/users/route.ts`
- ✅ `POST` (invite) — accept all 5 dealer roles in body; validate against allowed set
- ✅ `DELETE` — change to soft-disable: `UPDATE profiles SET deactivated_at = NOW()` + call `auth.admin.signOut(userId)`
- ✅ Create `PATCH /api/admin/users/[id]/route.ts` — role change endpoint
- ✅ `GET` — filter `WHERE deactivated_at IS NULL` by default; accept `?include_deactivated=true`

### 4.3 UI changes — `app/(app)/settings/users/page.tsx`
- ✅ Replace `admin/agent` role selector with 5-role list with descriptions
- ✅ Show role badge (color-coded) next to each user in the list
- ✅ Replace "Delete" button with "Deactivate" button
- ✅ Add role-change dropdown for existing users (dealer_admin only)
- ✅ "Show Deactivated" toggle to reveal inactive users

### 4.4 Verify
- ✅ Dealer admin invites user with `dealer_rep` role
- ✅ Dealer admin changes user role to `dealer_manager`
- ✅ Deactivated user cannot log in
- ✅ Deactivated user's assigned leads preserved in DB

---

## Phase 5 — Lead Assignment to Sales Reps ✅ COMPLETE

> **Goal:** Wire up `customers.assigned_to` column to real profile lookup. Reps see filtered list. Managers/admins can assign/reassign.

### 5.1 `components/customer/AssignDropdown.tsx`
- ✅ Only show users with assignable roles (all except `dealer_admin`)
- ✅ Display role badge next to each name in dropdown
- ✅ Restrict who can change assignment: only `dealer_admin` and `dealer_manager`

### 5.2 `app/api/customers/[id]/route.ts` (PATCH)
- ✅ Validate `assigned_to` update is only permitted for `dealer_admin` or `dealer_manager` (uses `canAssignLeads()`)
- ✅ AssignDropdown updated to call API route instead of Supabase client directly

### 5.3 `app/(app)/customers/page.tsx`
- ✅ Rep-filtered view when `isRepRestricted(role)` is true

### 5.4 Verify
- ✅ Dealer admin assigns customer to rep → rep sees it in their list
- ✅ `dealer_rep` cannot change their own assignment (server-enforced via 5.2)
- ✅ Unassigned filter shows correct results

---

## Phase 6 — Platform Staff: Read-Only Org Impersonation ✅ COMPLETE

> **Goal:** Platform staff can view any org's data as read-only. No writes. Bannered session. All actions logged.

### 6.1 Create `lib/auth/staffSession.ts`
- ✅ `getStaffOrgOverride(cookies)` — reads signed `dealerwyze_staff_org_id` cookie
- ✅ `buildStaffOrgCookie(orgId)` — creates signed cookie (2hr TTL)
- ✅ `clearStaffOrgCookie()` — clears cookie

### 6.2 Create `app/api/admin/impersonate/route.ts`
- ✅ `POST { org_id }` — validates admin area access, sets override cookie, logs to audit_log
- ✅ `DELETE` — clears cookie, logs `staff_impersonate_end` to audit_log

### 6.3 Middleware update (`proxy.ts`)
- ✅ Inject `x-pathname` header for layout gate
- ✅ Block all mutating methods (POST/PUT/PATCH/DELETE) on dealer data routes when impersonating → return 403 (allows `/api/admin/impersonate` + `/api/auth/`)

### 6.4 Banner component
- ✅ Create `components/admin/ImpersonationBanner.tsx`
- ✅ Displayed at top of all app pages when impersonation cookie is active
- ✅ Shows: "Viewing [Dealer Name] as read-only staff — [End Session] button"
- ✅ "End Session" calls `DELETE /api/admin/impersonate`, redirects to `/admin`

### 6.5 Admin org detail page trigger
- ✅ `app/(app)/admin/orgs/[id]/page.tsx` — add "View as this Org" Eye button for platform staff
- ✅ Button calls `POST /api/admin/impersonate { org_id }`, redirects to `/today`

### 6.6 Verify
- ✅ Platform staff clicks "View as Org" → sees dealer's data
- ✅ Platform staff cannot POST/PATCH/DELETE dealer data (blocked in proxy.ts)
- ✅ Banner visible on all pages during impersonation
- ✅ "End Session" clears cookie, returns to `/admin`
- ✅ Impersonation start + end logged to `admin_audit_log`

---

## Phase 7 — Settings UI Completion ✅ COMPLETE

> **Goal:** Expose all missing `org_settings` fields to dealers: locations, GBP location ID, Calendar OAuth.

### 7.1 Dealer Locations editor — `app/(app)/settings/organization/page.tsx`
- ✅ Add "Locations" section
- ✅ List existing locations from `org_settings.locations JSONB`
- ✅ "Add Location" form: name, address, is_primary toggle
- ✅ Remove existing locations
- ✅ Saves via existing `/api/settings/org` PATCH endpoint

### 7.2 GBP Location ID field
- ✅ Add text input for `gbp_location_id`
- ✅ Helper text: "Find this in your Google Business Profile URL"
- ✅ Saves via existing `/api/settings/org` PATCH endpoint

### 7.3 Calendar OAuth connect/disconnect
- ✅ `app/api/google/calendar-connect/route.ts` — initiates OAuth correctly
- ✅ `app/api/google/calendar-callback/route.ts` — writes to `org_google_tokens.calendar_refresh_token`
- ✅ Add "Connect Google Calendar" button in Settings → Integrations section
- ✅ Show "Connected" status if token exists in `org_google_tokens`
- ✅ Add "Disconnect" button that deletes token row

### 7.4 Resend from domain (admin-provisioned, read-only display)
- ✅ Show current `resend_from_domain` value (not editable by dealer)
- ✅ "Contact support to configure your email domain" note

### 7.5 Verify
- ✅ GBP location ID saves to `org_settings.gbp_location_id`
- ✅ Calendar OAuth connect flow completes and token appears in `org_google_tokens`
- ✅ Location add/remove works
- ✅ Apollo Auto's existing locations visible (seeded in migration 035b)

---

## Phase 8 — Google Env Var Fallback Removal ✅ COMPLETE

> **Goal:** Remove `GMAIL_CALENDAR_REFRESH_TOKEN`, `GBP_LOCATION_ID`, `GBP_ACCOUNT_ID` as code fallbacks.
> **Prereq:** Phase 7 complete (Tim's token seeded in DB via Settings UI or Phase 1B SQL seed).

### 8.1 `lib/google/gbp.ts`
- ✅ Remove `GMAIL_CALENDAR_REFRESH_TOKEN` env var fallback
- ✅ Remove `GBP_LOCATION_ID` env var fallback
- ✅ Remove `GBP_ACCOUNT_ID` env var fallback
- ✅ Add early return with `logger.warn` if creds are null (skip org, no crash)

### 8.2 `lib/google/calendar.ts`
- ✅ Remove `process.env.GMAIL_CALENDAR_REFRESH_TOKEN ?? null` fallback
- ✅ Function uses only `org_google_tokens` DB row
- ✅ Returns `null` gracefully if no token (log warn, no crash)

### 8.3 Remove env vars from Vercel (production) — MANUAL ✅ COMPLETE
- ✅ Verify Apollo Auto's token exists in `org_google_tokens` table FIRST
- ✅ Remove `GMAIL_CALENDAR_REFRESH_TOKEN` from Vercel production env vars
- ✅ Remove `GBP_LOCATION_ID` from Vercel production env vars
- ✅ Remove `GBP_ACCOUNT_ID` from Vercel production env vars
- ✅ Remove `TWILIO_FROM_NUMBER` from Vercel (per-org in DB)
- ✅ Remove `TWILIO_VOICE_NUMBER` from Vercel (per-org in DB)
- ✅ Remove `APOLLO_USER_ID` from Vercel production
- ✅ Add `SAAS_MODE=true` to Vercel production env vars

### 8.4 Verify
- ✅ GBP poll cron: skips unconfigured orgs, no crash
- ✅ Calendar event creation: skips if no token for org, no crash
- ✅ Apollo Auto GBP reviews still polled (token in DB)
- ✅ Apollo Auto calendar events still created (token in DB)

---

## Phase 9 — SuperAdmin Dashboard Upgrades ✅ COMPLETE

> **Goal:** `/admin` shows pending approval queue, MRR, dealer health signals.

### 9.1 Pending approval queue (depends on Phase 2)
- ✅ Already built in Phase 2.5 — wired up in admin page

### 9.2 MRR calculation card
- ✅ `app/(app)/admin/page.tsx` — MRR sum calculation from active subscriptions
- ✅ Map plan names to monthly values (starter $49, growth $99, pro $199)
- ✅ Render as summary card alongside existing "Total Orgs" card

### 9.3 Dealer health signals on org cards
- ✅ "Last active" — shown via `last_active_at` field on org cards
- ✅ "SMS this month" — shown as `sms_used_pct` bar on org cards

### 9.4 Pending count badge
- ✅ Pending count shown in admin summary card

### 9.5 Verify
- ✅ MRR card shows correct sum
- ✅ Pending queue visible when orgs are pending
- ✅ Approve/Reject buttons work and queue updates

---

## Phase 10 — Cosmetic Cleanup (Placeholder Text) ✅ COMPLETE

> **Goal:** Remove all Apollo Auto / Tim's personal data from form placeholders and legacy routes.

### 10.1 Auth pages
- ✅ `app/(auth)/signup/page.tsx` — `you@apolloauto.com` → `you@yourdealership.com`
- ✅ `app/(auth)/forgot-password/page.tsx` — same

### 10.2 Settings pages
- ✅ `app/(app)/settings/users/page.tsx` — `john@apolloauto.com` → `john@yourdealership.com`
- ✅ `app/(app)/settings/organization/page.tsx` — `+18054043873` → `+15555550100`

### 10.3 Onboarding
- ✅ `app/(onboarding)/onboarding/page.tsx` — `123 Main St, El Monte, CA 91731` → `123 Main St, City, CA 90001`
- ✅ `app/(onboarding)/onboarding/page.tsx` — `Apollo Auto` placeholder → `My Auto Group`

### 10.4 Legacy inventory redirect cleanup
- ✅ `app/api/inventory/cargurus-feed/route.ts` — changed 301 redirect to 410 Gone with message
- ✅ `app/api/inventory/facebook-feed/route.ts` — same

### 10.5 Briefing route fallback
- ✅ `app/api/intelligence/briefing/route.ts:62` — `'Apollo Auto'` fallback → `'Your Dealership'`

### 10.6 CSS comments
- ✅ `app/globals.css` — "Apollo Auto Brand Palette/Dark Mode/utility classes" → "DealerWyze"

### 10.7 Verify
- ✅ No `apolloauto.com` placeholder text visible in any tenant-facing UI
- ✅ Legacy inventory routes return 410 Gone

---

## Phase 11 — Two-Tenant Verification Suite

> **Goal:** Manual smoke test proving full isolation between two orgs before declaring SaaS-ready.
> **Prereq:** Migration 039 applied. All phases 1–10 complete.

### 11.1 Setup
- 🔲 Create Tenant A: `testdealer-a@dealerwyze.com` (signup → approve)
- 🔲 Create Tenant B: `testdealer-b@dealerwyze.com` (signup → approve)
- 🔲 Provision Twilio numbers for both via `/api/admin/provision-phone`
- 🔲 Seed Tenant A: 3 customers, 1 vehicle, 1 BHPH record, 1 template
- 🔲 Seed Tenant B: 2 customers, 0 vehicles
- 🔲 Create a `dealer_rep` user under Tenant A; assign 1 customer to them

### 11.2 Data isolation tests (run as Tenant B)
- 🔲 `GET /api/customers` — returns 0 of Tenant A's customers
- 🔲 `GET /api/vehicles` — returns 0 of Tenant A's vehicles
- 🔲 `PATCH /api/customers/[tenant-A-customer-id]` — returns 403 or 404
- 🔲 `GET /api/analytics` — shows only Tenant B's metrics

### 11.3 Twilio routing tests
- 🔲 SMS to Tenant A's number → activity created on Tenant A only
- 🔲 SMS to Tenant B's number → activity created on Tenant B only

### 11.4 Approval gate tests
- 🔲 Tenant C signs up → lands on `/pending`, cannot access any app page
- 🔲 SuperAdmin approves Tenant C → `/today` becomes accessible
- 🔲 SuperAdmin rejects Tenant C → rejection reason shown on `/pending`

### 11.5 RBAC tests (Tenant A)
- 🔲 `dealer_rep` user of Tenant A: only sees their 1 assigned customer
- 🔲 `dealer_rep` user: accessing `/bhph` redirects away
- 🔲 `dealer_manager` user: accessing `/settings/billing` returns 403

### 11.6 Platform staff impersonation tests
- 🔲 Platform staff "View as Tenant A" → sees A's data
- 🔲 Platform staff tries `POST /api/customers` while impersonating → 403
- 🔲 Impersonation banner visible on all pages
- 🔲 "End Session" returns to `/admin`, cookie cleared

### 11.7 Final sign-off
- 🔲 All 11.2–11.6 tests pass
- ✅ Update `MEMORY.md` with completion status
- 🔲 Update `SAAS_MASTER_PLAN.md` status to `COMPLETE`
- 🔲 Tag release in git: `git tag v2.0.0-saas`

---

## External Systems Migration (Phase 5 of DEALERWYZE_MASTER_PLAN)

> **Do AFTER `dealerwyze.com` DNS confirmed live.** All manual steps.

- 🔲 **Twilio** — update SMS webhook URL to `https://dealerwyze.com/api/twilio/inbound`
- 🔲 **Twilio** — update Fax callback URL to `https://dealerwyze.com/api/fax/callback`
- 🔲 **Retell** — update Post-call Webhook to `https://dealerwyze.com/api/voice/retell-callback`
- 🔲 **Retell** — update Tool Call Webhook to `https://dealerwyze.com/api/voice/tools?secret=<LEADS_POLL_SECRET>`
- 🔲 **Stripe** — add new webhook endpoint `https://dealerwyze.com/api/stripe/webhook`
- 🔲 **Stripe** — copy new `STRIPE_WEBHOOK_SECRET` to Vercel env vars
- 🔲 **Stripe** — run both endpoints in parallel for 7 days
- 🔲 **Stripe** — delete old `apollo-crm.vercel.app` endpoint after 7 days
- 🔲 **cron-job.org** — update `check-tasks` URL to `https://dealerwyze.com/api/cron/check-tasks`
- 🔲 **cron-job.org** — update `sync-leads` URL to `https://dealerwyze.com/api/cron/sync-leads`
- 🔲 **cron-job.org** — update `poll-reviews` URL to `https://dealerwyze.com/api/cron/poll-reviews`
- 🔲 **cron-job.org** — update `sync-inventory` URL to `https://dealerwyze.com/api/cron/sync-inventory`
- 🔲 **cron-job.org** — update `reset-billing-cycle` URL to `https://dealerwyze.com/api/cron/reset-billing-cycle`
- ✅ **CarGurus** — update feed URL to `https://dealerwyze.com/api/inventory/cargurus-feed/apollo-auto`
- 🔲 **Facebook** — update feed URL to `https://dealerwyze.com/api/inventory/facebook-feed/apollo-auto`
- ✅ **Support email** — set up `support@dealerwyze.com` (Cloudflare Email Routing → kmaautosinc@gmail.com)

---

## Status Summary

**Phases 1–10: ALL CODE COMPLETE ✅**

### Remaining (manual only)
1. **Phase 11** — Two-tenant smoke tests (11.1–11.6): create test accounts, verify isolation, RBAC, impersonation
2. **Phase 11.7** — After tests pass: update SAAS_MASTER_PLAN.md + `git tag v2.0.0-saas`
3. **External Systems** (after dealerwyze.com DNS confirmed live):
   - Twilio SMS + Fax webhook URLs → dealerwyze.com
   - Retell post-call + tool-call webhook URLs → dealerwyze.com
   - Stripe: add dealerwyze.com endpoint, run parallel 7 days, remove old
   - cron-job.org: update all 5 cron URLs → dealerwyze.com
   - Facebook feed URL in Business Manager portal
