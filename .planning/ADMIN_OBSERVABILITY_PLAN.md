# Admin Observability + Data Recovery — Implementation Plan
_DealerWyze · Platform Admin Board · Architect: Claude_
_Status: Ready for Cursor AI execution_
_Next migration number: 150_

---

## Overview

Two major deliverables:

| # | Area | What it delivers |
|---|---|---|
| 1 | **Admin Observability Board** | New admin pages surfacing Sentry errors, PostHog adoption, Axiom log health, and per-org system health — all actionable from the platform admin dashboard |
| 2 | **7-Day Data Recovery** | Soft-delete pattern + recovery archive for customers, activities, vehicles, and ledger transactions — recoverable per org by the platform admin within 7 days |

**Non-negotiable rules (same as MONITORING_PLAN.md):**
- All admin routes must call `requirePlatformSuperAdmin()` or `canAccessAdminArea()` — never just `requireProfile()`
- All DB queries must use `createServiceClient()` with explicit `org_id` / `user_id` filters
- No cross-org data leakage — recovery actions scoped to one org per request
- Soft-delete tables use service-role only (RLS blocks user-level restores)
- Completion report required (template at bottom of this file)
- `npx eslint app components hooks lib --max-warnings=0` and `npm run build` must pass after each phase

---

## PHASE 1 — Admin Observability Board

### What We Are Building

Four new admin sub-pages + cards on the main admin dashboard:

| Page | Route | What it shows |
|---|---|---|
| **Platform Health** | `/admin/platform-health` | Sentry error rate, top errors, p95 API latency, Axiom log volume |
| **Feature Adoption** | `/admin/feature-adoption` | PostHog event counts per feature, per-plan adoption bars, session replay link |
| **Org Health** | `/admin/orgs/[id]` (extend existing) | Per-org error count, last active, feature heatmap, recovery history |
| **Data Recovery** | `/admin/data-recovery` | Search deleted records by org, preview, restore or purge |

---

### Task O1 — Platform Health page

**Route:** `app/(app)/admin/platform-health/page.tsx`
**API:** `app/api/admin/platform-health/route.ts`

The API route fetches from two external sources and one internal source:

**External — Sentry API** (server-side fetch, token never exposed to client):
```
GET https://sentry.io/api/0/projects/{SENTRY_ORG}/{SENTRY_PROJECT}/issues/
  ?query=is:unresolved&limit=10&sort=date
```
Returns: open issue count, top 10 unresolved issues (title, count, last_seen, level)

**External — Sentry stats:**
```
GET https://sentry.io/api/0/projects/{SENTRY_ORG}/{SENTRY_PROJECT}/stats/
  ?stat=received&resolution=1h&since={24h ago unix}
```
Returns: event volume per hour for the last 24h

**Internal — Supabase:**
- Count of `organizations` where `subscription_status = 'active'`
- Count of `organizations` where `last_active_at > now() - interval '24 hours'`
- Count of open platform alerts from `platform_alerts` table

New env vars needed:
```
SENTRY_AUTH_TOKEN=sntrys_xxx   # already in .env.example from MONITORING_PLAN
SENTRY_ORG=your-org-slug       # already in .env.example
SENTRY_PROJECT=dealerwyze      # already in .env.example
```

**API route structure (`app/api/admin/platform-health/route.ts`):**

```ts
import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const sentryToken = process.env.SENTRY_AUTH_TOKEN
  const sentryOrg   = process.env.SENTRY_ORG
  const sentryProj  = process.env.SENTRY_PROJECT

  // --- Internal stats ---
  const [{ count: activeOrgs }, { count: activeToday }, { count: openAlerts }] =
    await Promise.all([
      supabase.from('organizations').select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'active'),
      supabase.from('organizations').select('*', { count: 'exact', head: true })
        .gte('last_active_at', new Date(Date.now() - 86400000).toISOString()),
      supabase.from('platform_alerts').select('*', { count: 'exact', head: true })
        .eq('resolved', false),
    ])

  // --- Sentry stats (graceful fallback if token missing) ---
  let sentryIssues: unknown[] = []
  let sentryVolume: unknown[] = []
  let sentryConfigured = false

  if (sentryToken && sentryOrg && sentryProj) {
    sentryConfigured = true
    const headers = { Authorization: `Bearer ${sentryToken}` }
    const base = `https://sentry.io/api/0/projects/${sentryOrg}/${sentryProj}`
    const since = Math.floor((Date.now() - 86400000) / 1000)

    const [issuesRes, statsRes] = await Promise.all([
      fetch(`${base}/issues/?query=is:unresolved&limit=10&sort=date`, { headers })
        .then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${base}/stats/?stat=received&resolution=1h&since=${since}`, { headers })
        .then(r => r.ok ? r.json() : []).catch(() => []),
    ])
    sentryIssues = issuesRes
    sentryVolume = statsRes
  }

  return NextResponse.json({
    internal: { activeOrgs, activeToday, openAlerts },
    sentry: { configured: sentryConfigured, issues: sentryIssues, volume: sentryVolume },
  })
}
```

**UI page (`app/(app)/admin/platform-health/page.tsx`):**

This is a client component. Layout:

```
┌─────────────────────────────────────────────────┐
│ Platform Health                          [Refresh]│
├──────────┬──────────┬──────────┬─────────────────┤
│ Active   │ Active   │ Open     │ Sentry           │
│ Orgs     │ Today    │ Alerts   │ Errors (24h)     │
│ [count]  │ [count]  │ [count]  │ [spark chart]    │
└──────────┴──────────┴──────────┴─────────────────┘

Sentry — Top Open Issues
┌─────────────────────────────────┬───────┬────────┐
│ Title                           │ Count │ Last   │
│ [title truncated to 60 chars]   │  42   │ 2h ago │  ← links to sentry.io
│ ...                             │  ...  │ ...    │
└─────────────────────────────────┴───────┴────────┘

[Link: Open Sentry dashboard →]  [Link: Open Axiom →]
```

Requirements for the UI:
- Stat cards: 2×2 grid on mobile, 4-up row on desktop — same style as existing admin stat cards
- Sentry issues table: issue title (truncate at 60 chars), event count, severity badge (error=red, warning=amber, info=blue), last seen humanized. Each row links to `https://sentry.io/organizations/{SENTRY_ORG}/issues/{issue_id}/` — open in new tab
- Sentry 24h volume: render as a small sparkline bar chart (use inline SVG bars, no chart library required — 24 bars, one per hour, height proportional to max). Color bars red if any are > 2× the average
- If `sentry.configured === false`: show a yellow banner "Sentry not configured — add SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT to environment variables"
- External links to Sentry and Axiom dashboards (hardcode Axiom to `https://app.axiom.co`) — both open in `_blank`
- "Refresh" button top-right re-fetches data
- Loading state: show skeleton cards

---

### Task O2 — Feature Adoption page

**Route:** `app/(app)/admin/feature-adoption/page.tsx`
**API:** `app/api/admin/feature-adoption/route.ts`

This page pulls **PostHog event aggregates** via the PostHog Query API, plus internal Supabase feature-flag proxies.

**External — PostHog Query API** (server-side only):
```
POST https://{POSTHOG_HOST}/api/projects/{POSTHOG_PROJECT_ID}/query/
Authorization: Bearer {POSTHOG_PERSONAL_API_KEY}
Content-Type: application/json

{
  "query": {
    "kind": "EventsQuery",
    "select": ["event", "count()"],
    "where": ["timestamp >= now() - interval 30 day"],
    "groupBy": ["event"],
    "orderBy": ["count() DESC"],
    "limit": 50
  }
}
```

New env vars needed (add to `.env.example`):
```
# PostHog server-side query API (never exposed to client)
POSTHOG_PERSONAL_API_KEY=phx_xxxxxxxxxxxxxxxxxxxx
POSTHOG_PROJECT_ID=12345
```

**API route returns:**
```json
{
  "posthog_configured": true,
  "event_counts": [
    { "event": "appointment_scheduled", "count": 142 },
    { "event": "sms_sent", "count": 891 },
    ...
  ],
  "period_days": 30
}
```

Graceful fallback: if PostHog not configured, return `{ posthog_configured: false, event_counts: [] }`.

**UI layout:**

```
┌─────────────────────────────────────────────────────┐
│ Feature Adoption  Last 30 days          [Refresh]   │
├─────────────────────────────────────────────────────┤
│ Feature          Events    Adoption Bar             │
│ ─────────────────────────────────────────────────── │
│ SMS Sent          891      ████████░░  89%          │
│ Customer Viewed   734      ███████░░░  73%          │
│ Appointment       142      ██░░░░░░░░  14%          │
│ Calendar Viewed    98      █░░░░░░░░░   9%          │
│ AI Brief Gen       23      ░░░░░░░░░░   2%          │
│ Receipt Scanned    11      ░░░░░░░░░░   1%          │
│ ...                                                 │
└─────────────────────────────────────────────────────┘
[Open PostHog dashboard →]
```

Requirements:
- Sort descending by count
- Adoption % = event count / max event count × 100 (relative, not absolute)
- Color code bars: top 3 = green, middle = blue, bottom 25% = amber
- Show event name with human-readable label (map from the event catalogue in MONITORING_PLAN.md §P6)
- "Open PostHog dashboard" links to `https://us.posthog.com` (or EU host) — new tab
- If PostHog not configured: yellow banner with instructions
- Group events into sections: **Messaging**, **Customers**, **Calendar**, **Vehicles**, **Receipts**, **AI** — matching the event catalogue categories

---

### Task O3 — Extend existing Org Detail page with observability data

**File to extend:** `app/(app)/admin/orgs/[id]/page.tsx`

Add a new section **"System Health"** below the existing billing/team sections.

**New API endpoint:** `app/api/admin/orgs/[id]/health/route.ts`

Returns:
```json
{
  "last_active_at": "2026-05-07T18:23:00Z",
  "last_active_humanized": "12 hours ago",
  "error_count_24h": 3,
  "sentry_issues": [...],           // top 3 Sentry issues tagged to this org_id
  "feature_heatmap": {              // existing field, already returned by /activity
    "gmail": true,
    "voice": false,
    "sequences": true
  },
  "recovery_records": {             // new — from org_data_recovery_log
    "pending_count": 2,
    "oldest_expires_at": "2026-05-14T12:00:00Z"
  }
}
```

For Sentry per-org issues: query Sentry issues API filtered by tag `org_id:{id}`:
```
GET /api/0/projects/{org}/{proj}/issues/?query=is:unresolved+org_id:{org_id}&limit=3
```
(This requires that Sentry user context is set to org_id per Task S5/S6 of MONITORING_PLAN.md)

**UI additions to org detail page:**

Add a "System Health" card:
```
┌─────────────────────────────────────────────┐
│ System Health                               │
│ Last active: 12 hours ago                   │
│ Errors (24h): 3  [view in Sentry →]         │
│                                             │
│ Features in use:                            │
│  ● Gmail  ● Sequences  ○ Voice  ○ BHPH      │
│                                             │
│ Pending recovery items: 2                   │
│ Oldest expires: May 14                      │
│ [Go to Data Recovery →]                     │
└─────────────────────────────────────────────┘
```

---

### Task O4 — Add new cards to main admin dashboard (`app/(app)/admin/page.tsx`)

Add two new navigation cards to the existing admin dashboard grid alongside the current cards (retention, tickets, analytics, staff):

**Card 1: Platform Health**
```
Icon: Activity (lucide)  Color: red-100 / red-600
Title: Platform Health
Subtitle: [N] open Sentry errors · [N] alerts
Link: /admin/platform-health
```

**Card 2: Feature Adoption**
```
Icon: BarChart3 (lucide)  Color: violet-100 / violet-600
Title: Feature Adoption
Subtitle: [top event] most used · 30d
Link: /admin/feature-adoption
```

Fetch the counts for card subtitles from `/api/admin/platform-health` (already being called for the main page stats). Cache the response for the 60-second revalidation that the admin page already uses, if applicable.

---

## PHASE 2 — 7-Day Data Recovery System

### Architecture

When a user (dealer admin) deletes a customer, activity, vehicle, or ledger transaction, the record is:
1. **Not hard-deleted immediately** — moved to a recovery archive table
2. **Retained for 7 days** in the archive
3. **Purged automatically** after 7 days by a Vercel cron job
4. **Restorable** by the platform admin within the 7-day window

The pattern avoids modifying every existing `DELETE` query — instead we use **Postgres triggers** that fire `BEFORE DELETE` and move the row to the archive table.

### Tables to protect

| Source table | Recovery archive table |
|---|---|
| `customers` | `deleted_customers` |
| `activities` | `deleted_activities` |
| `vehicles` | `deleted_vehicles` |
| `ledger_transactions` | `deleted_ledger_transactions` |

### Task R1 — Migration 150: Recovery archive tables + triggers

Create `supabase/migrations/150_data_recovery_archive.sql`:

```sql
-- ── Recovery archive tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deleted_customers (
  recovery_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid NOT NULL,
  org_id            uuid NOT NULL,              -- derived from user_id/profile at delete time
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  deleted_by        uuid,                       -- profile id of who deleted (null if system)
  row_data          jsonb NOT NULL,             -- full row snapshot
  restored_at       timestamptz,
  purged_at         timestamptz
);

CREATE TABLE IF NOT EXISTS deleted_activities (
  recovery_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid NOT NULL,
  org_id            uuid NOT NULL,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  deleted_by        uuid,
  row_data          jsonb NOT NULL,
  restored_at       timestamptz,
  purged_at         timestamptz
);

CREATE TABLE IF NOT EXISTS deleted_vehicles (
  recovery_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid NOT NULL,
  org_id            uuid NOT NULL,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  deleted_by        uuid,
  row_data          jsonb NOT NULL,
  restored_at       timestamptz,
  purged_at         timestamptz
);

CREATE TABLE IF NOT EXISTS deleted_ledger_transactions (
  recovery_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id       uuid NOT NULL,
  org_id            uuid NOT NULL,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  deleted_by        uuid,
  row_data          jsonb NOT NULL,
  restored_at       timestamptz,
  purged_at         timestamptz
);

-- Indexes for admin lookup
CREATE INDEX IF NOT EXISTS idx_deleted_customers_org ON deleted_customers(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_customers_expires ON deleted_customers(expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_activities_org ON deleted_activities(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_activities_expires ON deleted_activities(expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_vehicles_org ON deleted_vehicles(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_vehicles_expires ON deleted_vehicles(expires_at) WHERE purged_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_ledger_org ON deleted_ledger_transactions(org_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_ledger_expires ON deleted_ledger_transactions(expires_at) WHERE purged_at IS NULL;

-- ── RLS: only service role reads/writes recovery tables ──────────────────────
-- Dealers cannot see or modify their own recovery archives (prevent circumvention).
-- Only the platform admin (via service role) can read and restore.

ALTER TABLE deleted_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_ledger_transactions ENABLE ROW LEVEL SECURITY;

-- No authenticated-role policies = deny all authenticated access.
-- Service role bypasses RLS entirely (as intended).

-- ── Triggers: archive before delete ─────────────────────────────────────────

-- customers
CREATE OR REPLACE FUNCTION archive_deleted_customer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Derive org_id: customers use user_id as org scope
  INSERT INTO deleted_customers (original_id, org_id, row_data)
  VALUES (OLD.id, COALESCE(OLD.user_id, '00000000-0000-0000-0000-000000000000'), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_customer ON customers;
CREATE TRIGGER trg_archive_customer
  BEFORE DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION archive_deleted_customer();

-- activities
CREATE OR REPLACE FUNCTION archive_deleted_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO deleted_activities (original_id, org_id, row_data)
  VALUES (OLD.id, COALESCE(OLD.user_id, '00000000-0000-0000-0000-000000000000'), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_activity ON activities;
CREATE TRIGGER trg_archive_activity
  BEFORE DELETE ON activities
  FOR EACH ROW EXECUTE FUNCTION archive_deleted_activity();

-- vehicles
CREATE OR REPLACE FUNCTION archive_deleted_vehicle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO deleted_vehicles (original_id, org_id, row_data)
  VALUES (OLD.id, COALESCE(OLD.user_id, '00000000-0000-0000-0000-000000000000'), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_vehicle ON vehicles;
CREATE TRIGGER trg_archive_vehicle
  BEFORE DELETE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION archive_deleted_vehicle();

-- ledger_transactions
CREATE OR REPLACE FUNCTION archive_deleted_ledger_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO deleted_ledger_transactions (original_id, org_id, row_data)
  VALUES (OLD.id, COALESCE(OLD.user_id, '00000000-0000-0000-0000-000000000000'), to_jsonb(OLD));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_ledger ON ledger_transactions;
CREATE TRIGGER trg_archive_ledger
  BEFORE DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION archive_deleted_ledger_transaction();
```

**Important notes for Cursor:**
- The `user_id` column in `customers`, `activities`, `vehicles`, `ledger_transactions` maps to `org_id` in these tables (it is the org UUID, not a personal user UUID — this is a DealerWyze data model convention documented in CLAUDE.md)
- Do NOT add an `org_id` column to the source tables — insert it will break writes
- The trigger function must be `SECURITY DEFINER` so it can write to the archive table even when the delete is initiated by an authenticated user whose RLS blocks the archive insert
- `deleted_by` cannot be set by the trigger (no session context available in BEFORE DELETE trigger) — it will be set by the API route that performs the delete, using an UPDATE after the archive row is created. Leave it null from the trigger for now.

### Task R2 — Migration 151: Recovery audit log table

Create `supabase/migrations/151_recovery_log.sql`:

```sql
-- Append-only log of all recovery actions (restore + purge) for audit compliance
CREATE TABLE IF NOT EXISTS org_data_recovery_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_at  timestamptz NOT NULL DEFAULT now(),
  performed_by  uuid NOT NULL,   -- platform admin profile id
  action        text NOT NULL CHECK (action IN ('restore', 'purge', 'expire')),
  table_name    text NOT NULL,   -- 'customers' | 'activities' | 'vehicles' | 'ledger_transactions'
  recovery_id   uuid NOT NULL,   -- the deleted_* table row
  original_id   uuid NOT NULL,
  org_id        uuid NOT NULL,
  metadata      jsonb
);

CREATE INDEX IF NOT EXISTS idx_recovery_log_org ON org_data_recovery_log(org_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_log_by ON org_data_recovery_log(performed_by, performed_at DESC);

ALTER TABLE org_data_recovery_log ENABLE ROW LEVEL SECURITY;
-- No authenticated-role policies = deny all. Service role only.
```

### Task R3 — Cron job: purge expired records

Create `app/api/cron/purge-recovery-archive/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const authError = validateCronAuth(req)
  if (authError) return authError

  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const tables = ['deleted_customers', 'deleted_activities', 'deleted_vehicles', 'deleted_ledger_transactions'] as const
  const summary: Record<string, number> = {}

  for (const table of tables) {
    // Find rows about to be purged (for audit log)
    const { data: expiredRows } = await supabase
      .from(table)
      .select('recovery_id, original_id, org_id')
      .lte('expires_at', now)
      .is('purged_at', null)
      .is('restored_at', null)

    if (!expiredRows?.length) {
      summary[table] = 0
      continue
    }

    // Mark as purged (soft-purge: keep row, set purged_at)
    const { error } = await supabase
      .from(table)
      .update({ purged_at: now })
      .lte('expires_at', now)
      .is('purged_at', null)
      .is('restored_at', null)

    if (error) {
      logger.error('cron:purge-recovery', error, { table })
      continue
    }

    // Log each purge in recovery audit log
    const logRows = expiredRows.map(r => ({
      performed_by: '00000000-0000-0000-0000-000000000000', // system
      action: 'expire' as const,
      table_name: table.replace('deleted_', ''),
      recovery_id: r.recovery_id,
      original_id: r.original_id,
      org_id: r.org_id,
      metadata: { reason: 'auto_expire_7d' },
    }))

    await supabase.from('org_data_recovery_log').insert(logRows)
    summary[table] = expiredRows.length
  }

  logger.info('cron:purge-recovery', 'Purge complete', { summary })
  return NextResponse.json({ ok: true, summary })
}
```

Add to `vercel.json` crons array:
```json
{ "path": "/api/cron/purge-recovery-archive", "schedule": "0 3 * * *" }
```
(Runs at 3am UTC daily — off-peak)

### Task R4 — Admin API: list + restore + purge recovery records

Create `app/api/admin/data-recovery/route.ts`:

```ts
// GET  /api/admin/data-recovery?org_id=xxx&table=customers&limit=50
// Returns recovery records for the given org, ordered by deleted_at desc

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

const VALID_TABLES = ['deleted_customers', 'deleted_activities', 'deleted_vehicles', 'deleted_ledger_transactions'] as const
type RecoveryTable = typeof VALID_TABLES[number]

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('org_id')
  const tableParam = searchParams.get('table') ?? 'deleted_customers'

  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })
  if (!VALID_TABLES.includes(tableParam as RecoveryTable)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from(tableParam as RecoveryTable)
    .select('recovery_id, original_id, org_id, deleted_at, expires_at, row_data, restored_at, purged_at')
    .eq('org_id', orgId)
    .is('purged_at', null)
    .order('deleted_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data ?? [] })
}
```

Create `app/api/admin/data-recovery/[id]/restore/route.ts`:

```ts
// POST /api/admin/data-recovery/:id/restore?table=deleted_customers
// Restores the archived row back to the source table

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

const TABLE_MAP: Record<string, string> = {
  deleted_customers: 'customers',
  deleted_activities: 'activities',
  deleted_vehicles: 'vehicles',
  deleted_ledger_transactions: 'ledger_transactions',
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: recoveryId } = await params
  const { searchParams } = new URL(req.url)
  const archiveTable = searchParams.get('table') ?? ''

  if (!TABLE_MAP[archiveTable]) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }
  const sourceTable = TABLE_MAP[archiveTable]

  const supabase = createServiceClient()

  // Fetch the archive row
  const { data: archived, error: fetchErr } = await supabase
    .from(archiveTable)
    .select('*')
    .eq('recovery_id', recoveryId)
    .is('purged_at', null)
    .is('restored_at', null)
    .single()

  if (fetchErr || !archived) {
    return NextResponse.json({ error: 'Recovery record not found or already processed' }, { status: 404 })
  }

  // Check not expired
  if (new Date(archived.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Recovery window has expired' }, { status: 410 })
  }

  // Restore: insert row_data back into source table
  // Remove any fields that the source table does not have
  const rowData = { ...archived.row_data }
  const { error: insertErr } = await supabase
    .from(sourceTable)
    .insert(rowData)

  if (insertErr) {
    return NextResponse.json({ error: `Restore failed: ${insertErr.message}` }, { status: 500 })
  }

  // Mark archive row as restored
  await supabase
    .from(archiveTable)
    .update({ restored_at: new Date().toISOString() })
    .eq('recovery_id', recoveryId)

  // Write audit log
  await writeAuditLog({
    action: 'data_restored',
    actor_type: 'staff',
    actor_id: profile.id,
    org_id: archived.org_id,
    entity_type: sourceTable,
    entity_id: archived.original_id,
    metadata: { archive_table: archiveTable, recovery_id: recoveryId },
  })

  // Write recovery log
  await supabase.from('org_data_recovery_log').insert({
    performed_by: profile.id,
    action: 'restore',
    table_name: sourceTable,
    recovery_id: recoveryId,
    original_id: archived.original_id,
    org_id: archived.org_id,
  })

  return NextResponse.json({ ok: true, restored_id: archived.original_id })
}
```

Create `app/api/admin/data-recovery/[id]/purge/route.ts`:

```ts
// POST /api/admin/data-recovery/:id/purge?table=deleted_customers
// Immediately purges (marks purged_at) — used for GDPR/dealer request before 7d

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

const VALID = ['deleted_customers', 'deleted_activities', 'deleted_vehicles', 'deleted_ledger_transactions']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: recoveryId } = await params
  const { searchParams } = new URL(req.url)
  const archiveTable = searchParams.get('table') ?? ''

  if (!VALID.includes(archiveTable)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: archived } = await supabase
    .from(archiveTable)
    .select('recovery_id, original_id, org_id')
    .eq('recovery_id', recoveryId)
    .is('purged_at', null)
    .is('restored_at', null)
    .single()

  if (!archived) {
    return NextResponse.json({ error: 'Not found or already processed' }, { status: 404 })
  }

  await supabase
    .from(archiveTable)
    .update({ purged_at: new Date().toISOString() })
    .eq('recovery_id', recoveryId)

  await writeAuditLog({
    action: 'data_purged',
    actor_type: 'staff',
    actor_id: profile.id,
    org_id: archived.org_id,
    entity_type: archiveTable,
    entity_id: archived.original_id,
    metadata: { reason: 'admin_manual_purge' },
  })

  await supabase.from('org_data_recovery_log').insert({
    performed_by: profile.id,
    action: 'purge',
    table_name: archiveTable.replace('deleted_', ''),
    recovery_id: recoveryId,
    original_id: archived.original_id,
    org_id: archived.org_id,
    metadata: { reason: 'admin_manual_purge' },
  })

  return NextResponse.json({ ok: true })
}
```

### Task R5 — Data Recovery admin page

**Route:** `app/(app)/admin/data-recovery/page.tsx`

This is a client component. Layout:

```
┌───────────────────────────────────────────────────────────┐
│ Data Recovery                                             │
├───────────────────────────────────────────────────────────┤
│ Org ID: [___________________________]  [Search]           │
│ Table:  [Customers ▼]                                     │
├───────────────────────────────────────────────────────────┤
│ Record           │ Deleted     │ Expires    │ Actions     │
│ ─────────────────┼─────────────┼────────────┼───────────  │
│ John Smith       │ 2h ago      │ 6d 22h     │ [Restore]  │
│  customer        │             │            │ [Purge]    │
│ Jane Doe         │ 3d ago      │ 4d 1h      │ [Restore]  │
│  customer        │             │            │ [Purge]    │
│ ─ (restored) ─── │ 5d ago      │ —          │ Restored ✓ │
└───────────────────────────────────────────────────────────┘
```

Requirements:
- Search field accepts an org_id UUID (paste from orgs table)
- Table selector: Customers / Activities / Vehicles / Ledger Transactions (maps to table param)
- Each row shows: a human-readable summary from `row_data` (for customers: `row_data.name`; activities: `row_data.type + row_data.due_at`; vehicles: `row_data.year + row_data.make + row_data.model`; ledger: `row_data.vendor_norm + row_data.amount_total`)
- Deleted: humanized time ago
- Expires: countdown ("6d 22h remaining") — red if < 24h, amber if < 72h, green otherwise
- Already restored rows: show "Restored ✓" badge, no actions
- Already purged rows: hidden (filtered out by API)
- **Restore button:** confirm dialog "Restore this [type] to the dealer's account?" → POST → optimistic update row to "Restored ✓"
- **Purge button:** confirm dialog with red destructive styling "Permanently purge this record? This cannot be undone." → POST → remove row from list
- Loading and empty states required
- Error state: show error message inline

### Task R6 — Recovery status indicator on org detail page

In `app/(app)/admin/orgs/[id]/page.tsx`, add a "Recovery Items" row to the System Health card (Task O3):

- Show count of non-expired, non-restored records for this org across all 4 tables
- Link to `/admin/data-recovery?org_id={id}`
- If 0: show "No deleted items in recovery window"

### Task R7 — Add Data Recovery to admin dashboard main page

Add a third new card to the admin dashboard (`app/(app)/admin/page.tsx`):

```
Icon: RotateCcw (lucide)   Color: amber-100 / amber-600
Title: Data Recovery
Subtitle: [N] items pending recovery
Link: /admin/data-recovery
```

Fetch the pending count by querying the sum across all 4 deleted_ tables for `purged_at IS NULL AND restored_at IS NULL AND expires_at > now()`.

Add API to return this count: `app/api/admin/data-recovery/summary/route.ts`

```ts
// GET /api/admin/data-recovery/summary
// Returns total pending recovery count across all orgs
export async function GET() {
  // requireProfile + canAccessAdminArea guard
  // Query all 4 tables with count: exact, head: true, filter is('purged_at', null), is('restored_at', null), gte('expires_at', now)
  // Return { total: N, by_table: { customers: N, activities: N, vehicles: N, ledger_transactions: N } }
}
```

---

## PHASE 3 — Dealer Self-Service: Recovery Notice

### Task D1 — Show recovery notice after deletion (dealer-facing)

When a dealer admin deletes a customer (or other protected record), the success toast should include a recovery notice. This is a UI-only change — no new API needed.

Find the delete confirmation flows for customers, vehicles, and ledger transactions. After the successful DELETE response:

Change the success toast from:
> "Deleted"

To:
> "Deleted. You can recover this within 7 days from your account admin or by contacting support."

This is the only dealer-facing change. Dealers cannot self-restore — only the platform admin can restore via the Data Recovery page. This is intentional: it prevents abuse (a dealer could delete → restore → delete repeatedly to test the archive).

---

## PHASE 4 — Operational Polish

### Task Q1 — Admin nav links

Ensure the platform admin's navigation (wherever the nav list is defined — check `components/layout/DesktopSidebar.tsx` and `BottomNav.tsx` for the admin-only links) includes:
- `/admin/platform-health` — "Platform Health"
- `/admin/feature-adoption` — "Feature Adoption"
- `/admin/data-recovery` — "Data Recovery"

These links must only appear when the user has `platform_role = 'platform_superadmin'` or `platform_role = 'platform_staff'`. Check how existing admin links are conditionally shown and follow the same pattern.

### Task Q2 — writeAuditLog: new action values

The existing `writeAuditLog()` in `lib/audit/log.ts` accepts an `action` field. The restore and purge routes above use `data_restored` and `data_purged`. Verify these values are accepted (the function likely accepts `string` or a union type). If a strict union type exists, add `'data_restored' | 'data_purged'` to it.

### Task Q3 — Graceful degradation in admin pages

All three new admin pages (platform-health, feature-adoption, data-recovery) must handle:
- Sentry / PostHog not configured: yellow informational banner, page still renders with internal data only
- External API timeout (> 5 seconds): show "External data unavailable" in the affected section, don't block the page
- Database error: show error state in the affected section, log via `logger.error()`

---

## COMPLETION REPORT TEMPLATE

When all tasks are done, append to `MONITORING_REPORT.md` (from MONITORING_PLAN.md) or create `ADMIN_OBSERVABILITY_REPORT.md`:

```markdown
# Admin Observability + Data Recovery — Implementation Report
Date: [date]
Implemented by: Cursor AI
Architect: Claude

## ✅ Implemented as Specified
- [ Task ID ] — [description]

## ⚠️ Implemented with Deviations
- [ Task ID ] — DEVIATION: [what changed and why]

## ❌ Skipped / Not Implemented
- [ Task ID ] — [reason]

## 🔒 Enterprise Compliance Check
- [ ] All admin routes call canAccessAdminArea() before any data access
- [ ] All recovery routes use createServiceClient() with explicit org_id filters
- [ ] RLS enabled on all 4 deleted_* tables and org_data_recovery_log — no authenticated-role policies
- [ ] Restore action writes to audit_log via writeAuditLog()
- [ ] Purge action writes to audit_log via writeAuditLog()
- [ ] Cron job validated with validateCronAuth()
- [ ] External API keys (SENTRY_AUTH_TOKEN, POSTHOG_PERSONAL_API_KEY) never returned to client
- [ ] Sentry issues link uses new tab (_blank) — no internal navigation to external sites
- [ ] Deletion toast updated with 7-day recovery notice on all delete flows
- [ ] npx eslint app components hooks lib --max-warnings=0 — PASS / FAIL
- [ ] npm run build — PASS / FAIL

## 🔧 Manual Steps Required After Deployment
1. Run migration 150 and 151 in Supabase: supabase db push
2. Add to vercel.json crons: /api/cron/purge-recovery-archive at 0 3 * * *
3. Add env vars to Vercel: POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID
4. Connect Axiom log drain in Vercel dashboard (if not done from MONITORING_PLAN)
5. Verify triggers are active: in Supabase SQL editor run:
   SELECT trigger_name, event_object_table FROM information_schema.triggers
   WHERE trigger_name LIKE 'trg_archive_%';
6. Test recovery flow: delete a test customer in staging → verify row appears in deleted_customers → restore via admin UI → verify customer reappears
```

---

## PHASE 5 — Customer Record Restore (Admin Panel) + Backup Download

### Task N1 — Customer Record Search & Restore

**Route:** `app/(app)/admin/data-recovery/page.tsx` — extend existing Data Recovery page.

Add a second tab or top section: **"Find Deleted Customer"** — lets the platform admin search
by customer name or phone number across ALL orgs, without needing to know the org_id first.

**New API endpoint:** `app/api/admin/data-recovery/search/route.ts`

```ts
// GET /api/admin/data-recovery/search?q=john+smith&limit=20
// Searches deleted_customers.row_data for name/phone match across all orgs.
// Returns matching recovery records with org name attached.
```

Implementation:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Search term must be at least 2 characters' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Search deleted_customers.row_data JSONB for name or phone match
  // row_data contains the full customer row — name is row_data->>'name', phone is row_data->>'phone'
  const { data, error } = await supabase
    .from('deleted_customers')
    .select('recovery_id, original_id, org_id, deleted_at, expires_at, row_data, restored_at, purged_at')
    .is('purged_at', null)
    .or(`row_data->>'name'.ilike.%${q}%,row_data->>'phone'.ilike.%${q}%`)
    .order('deleted_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach org name to each result
  const orgIds = [...new Set((data ?? []).map(r => r.org_id))]
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', orgIds)

  const orgMap = new Map((orgs ?? []).map(o => [o.id, o.name]))

  const results = (data ?? []).map(r => ({
    ...r,
    org_name: orgMap.get(r.org_id) ?? 'Unknown org',
    customer_name: (r.row_data as Record<string, string>)?.name ?? '—',
    customer_phone: (r.row_data as Record<string, string>)?.phone ?? '—',
  }))

  return NextResponse.json({ results })
}
```

**UI — "Find Deleted Customer" section at top of Data Recovery page:**

```
┌─────────────────────────────────────────────────────────────┐
│ Find Deleted Customer                                       │
│                                                             │
│ [Search by name or phone...     ]  [Search]                 │
├─────────────────────────────────────────────────────────────┤
│ Name            │ Phone        │ Dealer          │ Deleted  │ Expires   │ Action   │
│ ────────────────┼──────────────┼─────────────────┼──────────┼───────────┼────────  │
│ John Smith      │ 555-123-4567 │ Apollo Auto     │ 2h ago   │ 6d 22h    │[Restore] │
│ Johnny Smithson │ 555-987-6543 │ Valley Motors   │ 3d ago   │ 4d 1h     │[Restore] │
└─────────────────────────────────────────────────────────────┘
```

Requirements:
- Search fires on button click or Enter key — NOT on every keystroke (avoid hammering the DB)
- Minimum 2 characters before search is allowed
- Results show: customer name, phone (from `row_data`), dealer/org name, deleted time ago, expiry countdown
- Expiry countdown color: green > 72h, amber 24–72h, red < 24h, gray = already expired
- Expired records (past `expires_at`) show "Expired" badge — no Restore button, only Purge
- Already restored: show "Restored ✓" — no actions
- Restore button → confirm dialog → POST to existing `/api/admin/data-recovery/{id}/restore?table=deleted_customers`
- After successful restore: replace row with "Restored ✓" optimistically
- Empty state: "No deleted customers match that search"
- Error state: show inline error message

The existing "Browse by Org" section (search by org_id + table filter from Task R5) remains below this search section as a second way to browse.

### Task N2 — Backup Download (Signed R2 URL)

**New API endpoint:** `app/api/admin/backup-download/route.ts`

```ts
// GET /api/admin/backup-download?key=daily/2026-05-08/dealerwyze_...enc
// Returns a short-lived signed R2 URL for the specified backup file.
// URL is valid for 15 minutes — enough to start a download.

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createR2Client } from '@/lib/backup/r2Client'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')

  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  // Only allow downloading from known backup paths — prevent path traversal
  const ALLOWED_PREFIXES = ['daily/', 'weekly/', 'monthly/']
  if (!ALLOWED_PREFIXES.some(p => key.startsWith(p))) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }
  // Prevent path traversal
  if (key.includes('..') || key.includes('//')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  const r2 = createR2Client()
  const bucket = process.env.R2_BUCKET_NAME
  if (!r2 || !bucket) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 503 })
  }

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 900 } // 15 minutes
  )

  return NextResponse.json({ url, expires_in_seconds: 900 })
}
```

Install required package: `npm install @aws-sdk/s3-request-presigner`

**UI — add Download button to each row in the backup-status page:**

In `app/(app)/admin/backup-status/page.tsx`, each file row in the "Recent Daily Backups" list
gets a **[↓ Download]** button.

On click:
1. Button shows loading spinner
2. Calls `GET /api/admin/backup-download?key={file.key}`
3. On success: opens the signed URL in a new tab (`window.open(url, '_blank')`)
   — browser triggers the download automatically
4. Show a toast: "Download started. Decrypt with: `./scripts/restore.sh`"
5. On error: show inline error

Add to the backup status page below the file list:
```
┌──────────────────────────────────────────────────────────────┐
│ ℹ️  Downloaded files are encrypted.                          │
│    To restore: run ./scripts/restore.sh from the project root│
│    You will need the backup encryption key from 1Password.   │
└──────────────────────────────────────────────────────────────┘
```

---

## Execution Order

1. **Phase 2 → R1, R2** (migrations first — triggers protect data immediately)
2. **Phase 2 → R3** (cron purge job)
3. **Phase 2 → R4** (admin recovery APIs)
4. **Phase 2 → R5, R6, R7** (admin recovery UI)
5. **Phase 3 → D1** (dealer toast notice)
6. **Phase 5 → N1** (customer search + restore)
7. **Phase 5 → N2** (backup download)
8. **Phase 1 → O1** (platform health page + API)
9. **Phase 1 → O2** (feature adoption page + API)
10. **Phase 1 → O3** (org detail health section)
11. **Phase 1 → O4** (admin dashboard cards)
12. **Phase 4 → Q1, Q2, Q3** (nav, audit types, graceful degradation)

Run `npx eslint app components hooks lib --max-warnings=0 && npm run build` after steps 5, 7, and 10.
