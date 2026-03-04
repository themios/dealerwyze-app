# DealerWyze — SaaS Multi-Tenant Implementation Master Plan

**Version:** 1.0
**Date:** 2026-03-03
**Status:** ACTIVE — Gaps identified, phases ready for execution
**Author:** System Architect review of codebase state at migrations 001–038

---

## Executive Summary

DealerWyze began as Apollo Auto's single-dealer CRM and is now in active SaaS conversion. The rebrand and core multi-tenancy infrastructure (RLS, org isolation, Twilio/Retell provisioning, Stripe billing, onboarding wizard) are complete. The primary remaining work is a **user permission system** (both within a dealership and at the platform level), a **dealer approval workflow**, **platform staff impersonation**, and **settings UI completeness**. Env var fallbacks and external webhook domain cleanup are minor but necessary before hardening.

**What is built and solid:**
- Full org isolation via Supabase RLS (`get_org_id()` SECURITY DEFINER pattern)
- `platform_superusers` table + `platform_role='platform_staff'` column on profiles
- `isPlatformSuperAdmin()`, `isPlatformStaff()`, `canAccessAdminArea()` in `lib/auth/platform.ts`
- Sentinel org UUID for platform staff profiles
- Platform Team UI at `/admin/team` (create/delete platform staff accounts)
- Dealer User Management at `/settings/users` (invite/delete, 2-role: admin/agent)
- Lead `assigned_to` column exists on customers table

**What is missing (the work ahead):**
1. Granular dealer roles (5 roles beyond admin/agent binary)
2. Dealer signup approval gate (pending state, SuperAdmin approves before access)
3. Platform staff read-only impersonation of any org
4. Role-based access control enforcement within dealer UI
5. Lead assignment to named sales reps with visibility filter
6. Settings UI: GBP location, Calendar OAuth, dealer locations JSONB
7. Google env var fallbacks (GMAIL_CALENDAR_REFRESH_TOKEN, GBP_LOCATION_ID) removal
8. Cosmetic hardcoded strings (placeholder text) in UI forms

**Estimated scope:** 11 phases. Phases 1–3 are the critical path (all others depend on them).

---

## Architecture Overview

### User Hierarchy (text diagram)

```
Platform SuperAdmin (Tim)
├── Full DB access via createServiceClient()
├── /admin/* — all pages
└── platform_superusers table (checked via isPlatformSuperAdmin())

Platform Staff (support team)
├── profiles.platform_role = 'platform_staff'
├── /admin/tickets, read-only org view, impersonation session
└── sentinel org_id = 00000000-0000-0000-0000-000000000001

Dealer Admin (one per org)
├── profiles.role = 'dealer_admin'  [currently 'admin']
├── All dealer data, billing, user management, settings
└── org_id = their organization UUID

Dealer Manager
├── profiles.role = 'dealer_manager'  [NEW]
├── All leads/customers/vehicles/reports, no billing/user mgmt
└── same org_id as their dealer

Dealer Finance / BDR
├── profiles.role = 'dealer_finance'  [NEW]
├── Full operational access (customers, activities, BHPH, ledger)
└── No user management, no billing

Dealer Sales Rep
├── profiles.role = 'dealer_rep'  [NEW]
├── Sees ONLY customers with assigned_to = their profile.id
└── No user management, no billing, no BHPH

Dealer Staff
├── profiles.role = 'dealer_staff'  [NEW]
├── Unrestricted operational access (same as Manager minus reports)
└── No user management, no billing
```

### Permission Matrix

| Feature | SuperAdmin | Platform Staff | Dealer Admin | Dealer Manager | Dealer Finance | Dealer Rep | Dealer Staff |
|---------|-----------|---------------|--------------|----------------|----------------|------------|--------------|
| /admin/* | Full | Tickets + read-only orgs | No | No | No | No | No |
| Org settings | Full | Read | Own org | No | No | No | No |
| Billing | Full | Read | Own org | No | No | No | No |
| User management | Full | No | Own org | No | No | No | No |
| All customers | Full | Via impersonation | Own org | Own org | Own org | Assigned only | Own org |
| BHPH / Ledger | Full | Via impersonation | Own org | Own org | Own org | No | No |
| Reports / Analytics | Full | Via impersonation | Own org | Own org | No | No | No |
| Inventory | Full | Via impersonation | Own org | Own org | Own org | Read | Own org |
| Templates | Full | Via impersonation | Own org | Own org | Own org | No | Own org |

### Data Model Changes Required

The current `profiles.role` column uses a 2-value enum: `'admin' | 'agent'`. This must expand to a 7-value set. The `requireOrgAccess()` function and all role-checking code in API routes must be updated to use the new values.

```
Current:   profiles.role CHECK IN ('admin', 'agent')
Required:  profiles.role CHECK IN (
             'dealer_admin', 'dealer_manager', 'dealer_finance',
             'dealer_rep', 'dealer_staff',
             'agent'  -- kept for backward compat during migration
           )
```

Additionally, a **dealer approval workflow** requires new columns on `organizations`:

```sql
approved_at        TIMESTAMPTZ NULL   -- NULL = pending, non-null = approved
approved_by        UUID NULL          -- platform_superusers.user_id who approved
rejection_reason   TEXT NULL          -- set if rejected
```

---

## Gap Analysis

### Severity: CRITICAL (blocks production multi-dealer use)

| # | Gap | Current State | Required State | Key Files |
|---|-----|---------------|----------------|-----------|
| G1 | Granular dealer roles | `role IN ('admin','agent')` binary | 5-role dealer hierarchy | `types/index.ts`, `lib/auth/profile.ts`, migration needed |
| G2 | Dealer signup approval | No approval gate — new dealers get immediate app access | `organizations.approved_at` NULL → pending → SuperAdmin approves | `app/api/auth/register/route.ts`, admin UI needed |
| G3 | Sales rep lead filter | `assigned_to` column exists but no RLS or query filter for rep role | `dealer_rep` users see only their assigned customers | `app/api/customers/route.ts`, RLS update needed |

### Severity: HIGH (SaaS integrity gaps)

| # | Gap | Current State | Required State | Key Files |
|---|-----|---------------|----------------|-----------|
| G4 | Platform staff impersonation | Staff can access /admin but cannot view any dealer's actual data | Read-only session scoped to target org | New: `app/api/admin/impersonate/route.ts`, middleware update |
| G5 | RBAC enforcement in UI | All dealer users see all UI (billing, user mgmt) regardless of role | Role-gated UI components and API route guards | `app/(app)/settings/*`, `app/api/admin/users/route.ts` |
| G6 | Dealer user roles in invite UI | Invite sheet shows 'admin'/'agent' only | 5-role selector in `/settings/users` | `app/(app)/settings/users/page.tsx` |

### Severity: MEDIUM (functional gaps)

| # | Gap | Current State | Required State | Key Files |
|---|-----|---------------|----------------|-----------|
| G7 | Settings UI: GBP/Calendar | No fields for GBP location, Calendar OAuth connect button | Fields for gbp_location_id + OAuth connect flow | `app/(app)/settings/organization/page.tsx` |
| G8 | Settings UI: dealer locations | `org_settings.locations JSONB` exists but no UI | Add/edit locations list in settings | Same as G7 |
| G9 | Pending approval UI | No "pending approval" page for new dealers | Dealer lands on `/pending` after signup; approve via /admin | New page + admin action |
| G10 | Approval queue in admin | No approval queue on admin dashboard | Pending orgs card + approve/reject actions | `app/(app)/admin/page.tsx`, new API route |

### Severity: LOW (cleanup / cosmetic)

| # | Gap | Current State | Required State | Key Files |
|---|-----|---------------|----------------|-----------|
| G11 | Env var fallbacks | `GMAIL_CALENDAR_REFRESH_TOKEN`, `GBP_LOCATION_ID` still used as fallbacks | Fail gracefully with null (no env fallback) | `lib/google/gbp.ts`, `lib/google/calendar.ts` |
| G12 | Placeholder text | `you@apolloauto.com`, `El Monte, CA` in form placeholders | Generic placeholders | `app/(auth)/signup/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(onboarding)/onboarding/page.tsx`, `app/(app)/settings/users/page.tsx` |
| G13 | Legacy redirect routes | `/api/inventory/cargurus-feed` (no slug) redirects to `apollo-auto` slug | Redirect to a generic error or remove | `app/api/inventory/cargurus-feed/route.ts`, `app/api/inventory/facebook-feed/route.ts` |

---

## Implementation Phases

---

### Phase 1 — Database: Expanded Role Schema + Approval Workflow

**Goal:** Extend `profiles.role` to support 5 dealer roles without breaking any existing data. Add approval columns to organizations. Purely additive — no existing rows change.

**Migration file:** `039_dealer_roles_and_approval.sql`

```sql
-- ============================================================
-- 039_dealer_roles_and_approval.sql
-- Expand dealer role enum + add org approval workflow columns.
-- Purely additive — no existing data changed.
-- Apply in Supabase SQL editor.
-- ============================================================

-- 1. Expand the role CHECK constraint on profiles
-- Drop old constraint, add new one that is a superset
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'dealer_admin',    -- org owner, full access
    'dealer_manager',  -- all data, no billing/user mgmt
    'dealer_finance',  -- operational + BHPH/ledger, no user mgmt
    'dealer_rep',      -- assigned customers only
    'dealer_staff',    -- operational, no user mgmt or billing
    'admin',           -- LEGACY: treated as dealer_admin in code
    'agent'            -- LEGACY: treated as dealer_staff in code
  ));

-- 2. Add approval workflow columns to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS approved_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS approved_by       UUID        NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT        NULL;

-- 3. Auto-approve existing orgs (they were created before the gate existed)
UPDATE organizations
SET approved_at = created_at, approved_by = NULL
WHERE approved_at IS NULL
  AND id != '00000000-0000-0000-0000-000000000001';

-- 4. Index for pending approval queue query
CREATE INDEX IF NOT EXISTS idx_orgs_pending_approval
  ON organizations (created_at DESC)
  WHERE approved_at IS NULL;

-- 5. Approval audit log entry type (no schema change needed — admin_audit_log.action is TEXT)
-- Supported values: 'approve_org', 'reject_org' (used in API routes)
```

**TypeScript changes required:**

File: `/home/tim/Applications/ApolloCRM/apollo-crm/types/index.ts`

Change:
```typescript
export type UserRole = 'admin' | 'agent'
```
To:
```typescript
export type UserRole =
  | 'dealer_admin'
  | 'dealer_manager'
  | 'dealer_finance'
  | 'dealer_rep'
  | 'dealer_staff'
  | 'admin'   // legacy alias
  | 'agent'   // legacy alias

/** Returns true if the role has dealer-admin level privileges */
export function isDealerAdmin(role: UserRole): boolean {
  return role === 'dealer_admin' || role === 'admin'
}

/** Returns true if the role can see all org data (not rep-restricted) */
export function hasFullOrgAccess(role: UserRole): boolean {
  return role === 'dealer_admin' || role === 'dealer_manager' ||
         role === 'dealer_finance' || role === 'dealer_staff' ||
         role === 'admin'
}
```

File: `/home/tim/Applications/ApolloCRM/apollo-crm/lib/auth/profile.ts`

Change `role: 'admin' | 'agent'` to `role: UserRole` (import from types/index.ts).

**Acceptance criteria:**
- Migration applies without error on existing Supabase instance
- Existing admin/agent profiles still work without any row updates
- New profiles can be inserted with `dealer_admin`, `dealer_rep`, etc.
- `organizations.approved_at` is non-null for all pre-existing orgs

---

### Phase 2 — Auth: Signup Gate + Pending Approval State

**Goal:** New dealer signups land in a "pending approval" state. SuperAdmin sees a queue and approves/rejects. Approved orgs get full access; pending orgs see a holding page.

**Files to create:**
- `app/(app)/pending/page.tsx` — holding page for unapproved dealers
- `app/api/admin/orgs/[id]/approve/route.ts` — POST approve, DELETE reject

**Files to modify:**
- `app/api/auth/register/route.ts` — new dealer orgs created with `approved_at = NULL`
- `app/(app)/layout.tsx` — redirect unapproved dealer admins to `/pending`
- `app/(app)/admin/page.tsx` — add pending approval queue section

**Register route change** (`app/api/auth/register/route.ts`):

When `role === 'admin'` (new dealer org creation), do NOT auto-approve:
```typescript
// Replace the organizations.insert call for new admin signups:
const { error: orgErr } = await service.from('organizations').insert({
  id: orgId,
  name: `${display_name}'s Dealership`,
  // approved_at intentionally omitted — stays NULL (pending)
})
```

For `role === 'agent'` (joining via invite code), no change — they join an already-approved org.

After successful registration for a new dealer admin, return:
```typescript
return NextResponse.json({ id: userId, role, success: true, redirect: '/pending' })
```

**Pending page** (`app/(app)/pending/page.tsx`) — server component:
```typescript
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/types/index'
import { redirect } from 'next/navigation'

export default async function PendingPage() {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) redirect('/today')

  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('name, approved_at, rejection_reason')
    .eq('id', profile.org_id)
    .single()

  if (org?.approved_at) redirect('/today')
  if (org?.rejection_reason) {
    // Show rejection message
  }
  // Show "Your application is under review" card
}
```

**Layout gate** (`app/(app)/layout.tsx`) — add after the existing onboarding redirect:
```typescript
// After existing onboarding check:
if (isDealerAdmin(profile.role)) {
  const { data: org } = await service
    .from('organizations')
    .select('approved_at')
    .eq('id', profile.org_id)
    .single()

  const isPending = !org?.approved_at
  const isNotPendingPage = !pathname.startsWith('/pending')
  if (isPending && isNotPendingPage) redirect('/pending')
}
```

**Approve API route** (`app/api/admin/orgs/[id]/approve/route.ts`):
```typescript
// POST — approve org
// DELETE — reject org (body: { reason: string })
// Both require requirePlatformSuperAdmin()
// POST sets approved_at = NOW(), approved_by = profile.id
// DELETE sets rejection_reason = body.reason
// Both log to admin_audit_log
```

**Admin page addition** (`app/(app)/admin/page.tsx`) — add pending orgs section before the "All Dealerships" list:
```typescript
const { data: pending } = await supabase
  .from('organizations')
  .select('id, name, created_at')
  .is('approved_at', null)
  .neq('id', '00000000-0000-0000-0000-000000000001')
  .order('created_at', { ascending: true })

// Render as an "Awaiting Approval" section with Approve / Reject buttons
```

**Acceptance criteria:**
- New signup (no invite code) → profile created, org `approved_at = NULL`, redirect to `/pending`
- `/pending` shows "Under Review" message; user cannot navigate to `/today`
- SuperAdmin visits `/admin`, sees pending orgs section
- SuperAdmin clicks Approve → `approved_at` stamped, dealer can now access `/today`
- SuperAdmin rejects → `rejection_reason` set, pending page shows reason
- Agents joining via invite code are unaffected

---

### Phase 3 — RBAC: Role Enforcement in API Routes and UI

**Goal:** All dealer-facing API routes and UI components enforce granular roles. `dealer_rep` users see only assigned customers. Billing and user management are gated to `dealer_admin`.

**New helper file:** `lib/auth/dealerRoles.ts`

```typescript
import { UserRole, isDealerAdmin, hasFullOrgAccess } from '@/types/index'

export function canManageUsers(role: UserRole): boolean {
  return isDealerAdmin(role)
}

export function canAccessBilling(role: UserRole): boolean {
  return isDealerAdmin(role)
}

export function canAccessBhph(role: UserRole): boolean {
  return role !== 'dealer_rep'
}

export function canAccessLedger(role: UserRole): boolean {
  return role !== 'dealer_rep'
}

export function canAccessReports(role: UserRole): boolean {
  return role === 'dealer_admin' || role === 'dealer_manager' || role === 'admin'
}

export function isRepRestricted(role: UserRole): boolean {
  return role === 'dealer_rep'
}
```

**API routes requiring role guards:**

| Route | Current Guard | Add Guard |
|-------|--------------|-----------|
| `GET /api/customers` | org access | filter `assigned_to = profile.id` if `isRepRestricted(role)` |
| `GET /api/customers/[id]` | org access | 403 if rep + not their customer |
| `POST/DELETE /api/admin/users` | `role === 'admin'` check | use `canManageUsers(role)` |
| `GET/POST /api/stripe/*` | org access | `canAccessBilling(role)` |
| `GET/POST /api/bhph/*` | org access | `canAccessBhph(role)` |
| `GET/POST /api/ledger*` | org access | `canAccessLedger(role)` |
| `GET /api/analytics` | org access | `canAccessReports(role)` |

**UI gating pattern** (server components — check profile.role before rendering):
```typescript
// In settings/billing/page.tsx, settings/users/page.tsx:
import { canManageUsers, canAccessBilling } from '@/lib/auth/dealerRoles'
if (!canManageUsers(profile.role)) redirect('/today')
```

**Customer list filter** (`app/api/customers/route.ts`):
```typescript
let query = supabase.from('customers').select('*').eq('user_id', orgId)
if (isRepRestricted(profile.role)) {
  query = query.eq('assigned_to', profile.id)
}
```

**RLS note:** The RLS `get_org_id()` function enforces org isolation at DB level. Role enforcement is application-layer (in route handlers and server components). This is intentional — changing RLS for role enforcement would require per-user session variables, which is complex. Application-layer enforcement is sufficient for the security model here since all DB access goes through authenticated server-side routes.

**Acceptance criteria:**
- `dealer_rep` user: `/customers` shows only their assigned customers, 0 others
- `dealer_rep` user: `/settings/billing` returns 403
- `dealer_manager` user: `/settings/users` returns 403
- `dealer_admin`: full access unchanged

---

### Phase 4 — Dealer User Management: Full Role Support

**Goal:** The `/settings/users` UI and `/api/admin/users` support all 5 dealer roles. Invite form shows role descriptions. Role can be changed post-invite. "Deactivate" (soft-disable) replaces hard-delete.

**Database change** (add to migration `039` or new `040`):

```sql
-- Add deactivated_at column to profiles for soft-disable
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ NULL;

-- Index for active users query
CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON profiles (org_id, deactivated_at)
  WHERE deactivated_at IS NULL;
```

**API changes** (`app/api/admin/users/route.ts`):
- `requireAdmin()` helper: update to use `canManageUsers(profile.role)` instead of `profile.role !== 'admin'`
- `POST`: accept all 5 dealer roles in body, validate against allowed set
- `DELETE`: change from `auth.admin.deleteUser()` to `UPDATE profiles SET deactivated_at = NOW()` — preserves history and assigned leads
- Add `PATCH /api/admin/users/[id]` for role change: `UPDATE profiles SET role = $role WHERE id = $id AND org_id = $orgId`

**UI changes** (`app/(app)/settings/users/page.tsx`):
- Role selector: replace `admin/agent` with full 5-role list with descriptions
- Show role badges in user list (color-coded)
- Replace "Delete" button with "Deactivate" (grayed-out state)
- Add role-change dropdown for existing users (dealer_admin only)
- Filter out `deactivated_at IS NOT NULL` users by default, with toggle to show deactivated

**Acceptance criteria:**
- Dealer admin can invite user with any of the 5 roles
- Dealer admin can change an existing user's role
- Deactivated user cannot log in (session invalidated via Supabase `auth.admin.signOut(userId)`)
- Deactivated user's assigned leads are preserved (not orphaned)
- Deactivated users still appear in assigned_to history

---

### Phase 5 — Lead Assignment to Sales Reps

**Goal:** `assigned_to` column on customers is wired to a real profile lookup. Dealer admins and managers can assign/reassign leads. Reps see their assignment count in the team list.

**Current state:** `customers.assigned_to` column exists (UUID, nullable). `AssignDropdown.tsx` component exists. The data shape is present; the UI wiring and rep filter are the gaps.

**Files to modify:**

`components/customer/AssignDropdown.tsx` — currently loads all org users via `/api/admin/users`. Update to:
- Only show users with roles that can be assigned (`dealer_rep`, `dealer_staff`, `dealer_finance`, `dealer_manager`, `agent`)
- Display role badge next to name
- Restrict who can reassign: only `dealer_admin` and `dealer_manager` can change assignment

`app/api/customers/[id]/route.ts` (PATCH handler) — ensure `assigned_to` update is permitted only if caller is `dealer_admin` or `dealer_manager`.

`app/(app)/customers/page.tsx` — add "Assigned To" filter pill in the filter bar (select from org users).

**Acceptance criteria:**
- Dealer admin assigns customer to rep → rep sees that customer in their filtered list
- Rep cannot change their own assignment
- AssignDropdown shows display names with role badges
- Unassigned filter shows customers with `assigned_to IS NULL`

---

### Phase 6 — Platform Staff: Read-Only Org Impersonation

**Goal:** Platform staff (support team) can view any org's data as if they were in that org, in read-only mode. No writes. SuperAdmin can trigger this; staff can only use it on orgs they're assigned to support.

**Implementation approach:** Cookie-based org context override, not real Supabase impersonation. Service client is already used for writes; reads go through the user's Supabase session. For staff, we use a session cookie `dealerwyze_staff_org_id` that overrides `get_org_id()` resolution in the API layer.

**New file:** `lib/auth/staffSession.ts`
```typescript
// Reads/writes a signed cookie: dealerwyze_staff_org_id
// Only effective when profile.platform_role === 'platform_staff'
export function getStaffOrgOverride(cookies: ReadonlyRequestCookies): string | null
export function setStaffOrgOverride(orgId: string): ResponseCookie
export function clearStaffOrgOverride(): ResponseCookie
```

**New API route:** `app/api/admin/impersonate/route.ts`
```typescript
// POST { org_id } — sets the staff org override cookie (platform staff only)
// DELETE — clears the override cookie
// Returns { org_name, org_id } on success
```

**Middleware update** (`proxy.ts` / `middleware.ts`):
- If request has `dealerwyze_staff_org_id` cookie AND caller is `platform_staff`, inject `X-Staff-Org-Id` header
- All API routes that call `requireOrgAccess()` check this header first before profile.org_id

**Admin org detail page** (`app/(app)/admin/orgs/[id]/page.tsx`) — add "View as this Org" button for platform staff.

**Safety constraints:**
- Staff org override is read-only enforced at API layer: all mutating methods (POST/PUT/PATCH/DELETE) on dealer data routes return 403 when `X-Staff-Org-Id` is active
- Override cookie has 2-hour expiry
- All staff impersonation sessions logged to `admin_audit_log` (action: `staff_impersonate_start`, `staff_impersonate_end`)

**Acceptance criteria:**
- Platform staff clicks "View as this Org" on `/admin/orgs/[uuid]`
- They see dealer's customer list, pipeline, inventory
- They cannot send SMS, edit customers, or delete anything
- Banner visible at top of every page during impersonation: "Viewing [Dealer Name] as read-only staff"
- Clicking "End Session" clears cookie and returns to `/admin`

---

### Phase 7 — Settings UI Completion

**Goal:** Settings organization page exposes all missing `org_settings` fields: dealer locations (JSONB), GBP location ID, Calendar OAuth connect/disconnect.

**Missing fields in current `/settings/organization/page.tsx`:**

The page fetches from `/api/settings/org` but does not render fields for:
- `gbp_location_id` — text input, shows current value, link to GBP portal
- `locations` (JSONB array) — add/remove dealer locations (name, address, phone, is_primary)
- `resend_from_domain` — email-from domain (shown, not editable by dealer — admin-provisioned)
- Calendar OAuth — connect button that initiates Google OAuth flow via `/api/google/calendar-connect`

**Calendar OAuth connect flow** (files to create/verify):
- `app/api/google/calendar-connect/route.ts` — redirects to Google OAuth with calendar + business.manage scopes
- `app/api/google/calendar-callback/route.ts` — already exists; verify it writes to `org_google_tokens` correctly

**GBP location ID UI:**
```
[ GBP Location ID ]
[ locations/1234567890   ]  [Save]
Note: Find this in your Google Business Profile URL.
```

**Locations JSONB editor** — simple list with Add/Remove:
```typescript
interface DealerLocation {
  id: string   // client-side uuid
  name: string
  address: string
  phone: string
  is_primary: boolean
}
```

**Acceptance criteria:**
- Dealer admin can enter GBP location ID and save it
- Dealer admin can add multiple locations (main lot + satellite)
- Calendar OAuth connect button → Google consent → token stored in `org_google_tokens`
- Calendar disconnect button clears the token
- Fields save via existing `/api/settings/org` PATCH endpoint

---

### Phase 8 — Google Env Var Fallback Removal

**Goal:** Remove `GMAIL_CALENDAR_REFRESH_TOKEN`, `GBP_LOCATION_ID`, and `GBP_ACCOUNT_ID` env var fallbacks from code. These are single-tenant vestiges. After Phase 7, all orgs have their tokens in `org_google_tokens` and `org_settings`.

**Files to modify:**

`lib/google/gbp.ts` — lines 44–46 and 101–103:
```typescript
// REMOVE these lines:
const refreshToken = creds?.refreshToken ?? process.env.GMAIL_CALENDAR_REFRESH_TOKEN
const locationId   = creds?.locationId   ?? process.env.GBP_LOCATION_ID
const accountId    = creds?.accountId    ?? process.env.GBP_ACCOUNT_ID ?? 'accounts/-'

// REPLACE WITH:
const refreshToken = creds?.refreshToken ?? null
const locationId   = creds?.locationId   ?? null
const accountId    = creds?.accountId    ?? 'accounts/-'
// Early return if no creds: skip org, log warning
if (!refreshToken || !locationId) {
  logger.warn({ org_id: creds?.orgId }, 'GBP creds not configured for org — skipping')
  return []
}
```

`lib/google/calendar.ts` — line 32:
```typescript
// REMOVE:
let refreshToken: string | null = process.env.GMAIL_CALENDAR_REFRESH_TOKEN ?? null
// REPLACE: function must require creds parameter — no env fallback
```

**Acceptance criteria:**
- GBP poll cron skips orgs with no `gbp_location_id` (logs warn, no crash)
- Calendar event creation silently skips if no token for org
- `GMAIL_CALENDAR_REFRESH_TOKEN` and `GBP_LOCATION_ID` env vars can be removed from Vercel without breaking anything

---

### Phase 9 — SuperAdmin Dashboard Upgrades

**Goal:** `/admin` shows pending approval queue, MRR calculation, and dealer health signals.

**Admin page additions** (`app/(app)/admin/page.tsx`):

```typescript
// MRR calculation (add to existing org query):
const PLAN_MRR: Record<string, number> = {
  starter: 49,
  growth: 99,
  pro: 199,
}
const mrr = rows
  .filter(o => o.subscription_status === 'active')
  .reduce((sum, o) => sum + (PLAN_MRR[o.plan] ?? 0), 0)

// Add to summary cards:
{ label: 'Est. MRR', value: `$${mrr.toLocaleString()}` }
{ label: 'Pending Approval', value: pending.length }
```

**Pending approval queue section** — above the "All Dealerships" list:
- Show orgs where `approved_at IS NULL`
- Each card has Approve (green) and Reject (red) buttons
- Reject opens a textarea for rejection reason

**Dealer health signals** — add to each org card in the list:
- Last active (most recent customer created_at for that org)
- SMS usage this month vs quota
- These require additional queries — run `Promise.allSettled` to not block page

**Acceptance criteria:**
- Pending orgs section visible on `/admin` when orgs are pending
- Approve button calls `POST /api/admin/orgs/[id]/approve` → refreshes page
- Reject button calls `DELETE /api/admin/orgs/[id]/approve` with reason
- MRR card shows correct sum for active subscriptions

---

### Phase 10 — Cosmetic Cleanup (Placeholder Text)

**Goal:** Remove all traces of Apollo Auto / Tim's personal info from form placeholder text.

**Files and changes:**

`app/(auth)/signup/page.tsx` line 81:
```
placeholder="you@apolloauto.com"  →  placeholder="you@yourdealership.com"
```

`app/(auth)/forgot-password/page.tsx` line 68:
```
placeholder="you@apolloauto.com"  →  placeholder="you@yourdealership.com"
```

`app/(app)/settings/users/page.tsx` line 201:
```
placeholder="john@apolloauto.com"  →  placeholder="john@yourdealership.com"
```

`app/(onboarding)/onboarding/page.tsx` line 105:
```
placeholder="123 Main St, El Monte, CA 91731"  →  placeholder="123 Main St, City, CA 90001"
```

`app/(app)/settings/organization/page.tsx` line 642:
```
placeholder="+18054043873"  →  placeholder="+15555550100"
```

**Legacy redirect cleanup:**

`app/api/inventory/cargurus-feed/route.ts` and `app/api/inventory/facebook-feed/route.ts` — these redirect to `apollo-auto` slug. Change to:
```typescript
return NextResponse.json(
  { error: 'Use the slug-based URL: /api/inventory/cargurus-feed/{your-slug}' },
  { status: 410 }
)
```

**Acceptance criteria:**
- No `apolloauto.com`, `El Monte`, or Tim's phone number appear in any UI visible to tenants
- Inventory legacy redirect returns 410 Gone instead of redirecting to apollo-auto

---

### Phase 11 — Two-Tenant Verification Suite

**Goal:** Manual test checklist verifying full isolation between two dealer accounts before declaring SaaS-ready.

This is not a code change — it is a verification script to run using two browser sessions (Tenant A and Tenant B).

**Pre-conditions:**
- Create Tenant A: `testdealer-a@dealerwyze.com`, approved by SuperAdmin
- Create Tenant B: `testdealer-b@dealerwyze.com`, approved by SuperAdmin
- Each has Twilio number, org_settings populated
- Tenant A has: 3 customers, 1 vehicle, 1 BHPH record, 1 template
- Tenant B has: 2 customers, 0 vehicles

**Test matrix:**

| Test | Expected | Pass/Fail |
|------|----------|-----------|
| Tenant B `/customers` — can't see Tenant A's customers | 0 results | |
| Tenant B `/vehicles` — can't see Tenant A's vehicles | 0 results | |
| Tenant B `/api/customers` direct fetch — returns only own data | B's 2 customers | |
| Tenant B tries `PATCH /api/customers/[A-customer-id]` | 403 or 404 | |
| Platform staff impersonates Tenant A | Sees A's customers only | |
| Platform staff (in A impersonation) tries to edit | 403 | |
| Inbound SMS to A's Twilio number routes to A only | Activity on A | |
| Inbound SMS to B's Twilio number routes to B only | Activity on B | |
| New signup (Tenant C) — approval gate fires | `/pending` page shown | |
| SuperAdmin approves Tenant C — they get access | `/today` accessible | |
| `dealer_rep` user of A — sees only assigned customers | Filtered list | |
| `dealer_manager` of A — can't access `/settings/billing` | 403 redirect | |

---

## Migration Order (Critical Path)

```
Phase 1 (DB: 039_dealer_roles_and_approval.sql)
    │
    ├── Phase 2 (Auth: signup gate + pending state)
    │       depends on: approved_at column from Phase 1
    │
    ├── Phase 3 (RBAC: role enforcement)
    │       depends on: new role values from Phase 1
    │
    │   Phase 4 (Dealer user management)
    │       depends on: Phase 1 (role values) + Phase 3 (role helpers)
    │
    │   Phase 5 (Lead assignment)
    │       depends on: Phase 3 (role helpers for assignment guards)
    │
    Phase 6 (Platform staff impersonation)
        depends on: Phase 1 complete, Phase 3 guards in place

Phase 7 (Settings UI)  ─── can run in parallel with Phases 2–6
Phase 8 (Env cleanup)  ─── must run AFTER Phase 7 (needs org tokens in DB first)

Phase 9 (Admin dashboard) ─── depends on Phase 2 (approval queue data)
Phase 10 (Cosmetic)    ─── any time, independent
Phase 11 (Testing)     ─── LAST, after all phases complete
```

**Minimum viable sequence for first external dealer onboarding:**
1. Phase 1 (DB migration)
2. Phase 2 (approval gate — critical for controlled rollout)
3. Phase 3 (RBAC basics)
4. Phase 9 (admin approval UI)
5. Phase 11 partial (smoke test isolation)

---

## Files NOT Changing

These files are working correctly and should not be touched:

- `lib/auth/platform.ts` — `isPlatformSuperAdmin`, `isPlatformStaff`, `canAccessAdminArea`, `requirePlatformSuperAdmin` — correct as-is
- `lib/orgs/lookup.ts` — `getOrgIdByPhone`, `getOrgIdByGmail`, `requireOrgId` — correct as-is
- `lib/auth/requireOrgAccess.ts` — `requireOrgAccess()` — correct as-is
- All RLS migrations 001–038 — do not re-run or modify applied migrations
- `app/api/admin/platform-staff/route.ts` — platform staff CRUD is complete
- `app/(app)/admin/team/page.tsx` — platform staff UI is complete
- `app/api/auth/register/route.ts` — only the `approved_at` omission needs adding (Phase 2); the rest is correct
- All Twilio/Retell/Stripe webhook routes — working correctly
- `proxy.ts` / middleware rate limiting — working correctly
- `lib/logger.ts` — working correctly
- All cron job routes — working correctly

---

## Risk Register

| Phase | Risk | Probability | Impact | Mitigation |
|-------|------|-------------|--------|------------|
| Phase 1 | `profiles_role_check` constraint blocks existing data | Low | High | Migration adds new values, keeps `admin`/`agent` — no existing rows invalidated |
| Phase 2 | Existing dealers (Apollo Auto) blocked by approval gate | Medium | Critical | Migration auto-approves all pre-existing orgs (`approved_at = created_at`) |
| Phase 3 | Rep role filter breaks existing single-admin orgs | Low | Medium | Only applies when `role = 'dealer_rep'`; existing admins/agents unaffected |
| Phase 6 | Staff impersonation cookie leaks org data | Medium | High | Cookie is signed (HMAC); only honored for `platform_staff` profiles; 2hr TTL; all actions logged |
| Phase 8 | Env var removal breaks GBP/Calendar for orgs with no token | Medium | Medium | Phase 7 must be complete first; cron skips gracefully with warning log |
| All | Breaking change to `UserRole` type in TypeScript | Medium | Medium | Keep `'admin'` and `'agent'` in union type; `isDealerAdmin('admin')` returns true |

---

## Testing Checklist

### Phase 1 — DB Migration
- [ ] Migration applies without error (`psql` or Supabase SQL editor)
- [ ] `INSERT INTO profiles (role = 'dealer_rep')` succeeds
- [ ] `INSERT INTO profiles (role = 'invalid')` fails with constraint violation
- [ ] All existing profiles still load correctly in app
- [ ] `organizations.approved_at` is non-null for all pre-existing orgs

### Phase 2 — Signup Gate
- [ ] New dealer signup → org created with `approved_at = NULL`
- [ ] New dealer directed to `/pending` after signup
- [ ] New dealer cannot navigate to `/today`, `/customers`, etc.
- [ ] `/admin` shows new org in pending queue
- [ ] SuperAdmin approves → dealer can now reach `/today`
- [ ] SuperAdmin rejects → `/pending` shows rejection reason
- [ ] Agent joining existing org via invite code: unaffected by approval gate

### Phase 3 — RBAC
- [ ] `dealer_rep` user: `GET /api/customers` returns only assigned customers
- [ ] `dealer_rep` user: `GET /api/customers/[unassigned-id]` returns 403
- [ ] `dealer_manager` user: `GET /settings/billing` redirects with 403
- [ ] `dealer_admin` user: full access to all routes
- [ ] `isDealerAdmin('admin')` returns `true` (legacy compat)

### Phase 4 — User Management
- [ ] Dealer admin can invite user with `dealer_rep` role
- [ ] Dealer admin can change user role from `dealer_staff` to `dealer_manager`
- [ ] Deactivated user cannot log in
- [ ] Deactivated user's assigned leads are preserved in DB

### Phase 5 — Lead Assignment
- [ ] Assign customer to `dealer_rep` → rep sees it in their list
- [ ] `dealer_rep` cannot reassign their own leads
- [ ] Unassigned filter shows only `assigned_to IS NULL` customers

### Phase 6 — Impersonation
- [ ] Platform staff: "View as Org" sets cookie, shows dealer data
- [ ] Platform staff: cannot PATCH/POST/DELETE dealer data while impersonating
- [ ] Impersonation banner visible on all pages
- [ ] End session clears cookie, returns to `/admin`
- [ ] Action logged to `admin_audit_log`

### Phase 7 — Settings UI
- [ ] GBP location ID field saves to `org_settings.gbp_location_id`
- [ ] Calendar connect initiates OAuth, token stored in `org_google_tokens`
- [ ] Locations JSONB: add, edit, remove locations
- [ ] All saves go through existing `/api/settings/org` PATCH

### Phase 8 — Env Cleanup
- [ ] Remove `GMAIL_CALENDAR_REFRESH_TOKEN` from Vercel → GBP cron skips unconfgured orgs, no crash
- [ ] Remove `GBP_LOCATION_ID` from Vercel → same behavior
- [ ] Calendar event creation: skips if `org_google_tokens` row missing, logs warn

### Phase 9 — Admin Dashboard
- [ ] MRR card shows correct sum
- [ ] Pending approval queue visible when orgs are pending
- [ ] Approve/Reject buttons work

### Phase 10 — Cosmetic
- [ ] No `apolloauto.com` placeholder text visible in any UI
- [ ] Legacy inventory redirect returns 410

### Phase 11 — Two-Tenant Verification
- [ ] All 12 rows in the test matrix pass
