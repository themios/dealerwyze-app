# DealerWyze — Lead Scanner: Cost Controls

**Version:** 1.0
**Date:** 2026-03-03
**Addendum to:** `LEAD_SCANNER_EXECUTION_PLAN.md`

---

## Cost Reality Check

| Scan type | Model used | Cost per scan |
|-----------|-----------|---------------|
| Image (screenshot, photo, card) | claude-haiku-4-5 | ~$0.003 |
| PDF (credit app, multi-page form) | claude-sonnet-4-6 | ~$0.020 |

**At the limits below, maximum AI exposure per org per month:**

| Plan | Limit | Max cost | % of plan revenue |
|------|-------|----------|-------------------|
| Basic CRM ($49.94) | 100 images + 25 PDFs | ~$0.80 | 1.6% |
| CRM + SMS ($64.95) | 200 images + 50 PDFs | ~$1.60 | 2.5% |
| Voice ($249.95) | 500 images + 150 PDFs | ~$4.50 | 1.8% |

**These are safe margins.** An active dealer scanning 3–5 leads/day uses ~90–150 image scans/month.

**The real abuse risk is automation (API spam), not normal use.**
The daily cap (20 images + 10 PDFs/day) neutralizes that regardless of plan tier.

---

## Implementation Plan

### Follows the exact pattern of SMS quota (already built)

SMS quota uses `organizations.monthly_message_count` + `reset-billing-cycle` cron.
Scan quota uses the same table, same cron, same pattern.

---

## Step 1 — Migration `041_scan_quotas.sql`

```sql
-- ============================================================
-- 041_scan_quotas.sql
-- Add lead scanner quota columns to organizations table.
-- Mirrors existing monthly_message_count pattern.
-- Apply in Supabase SQL editor.
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS monthly_scan_image_count  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_scan_pdf_count    INT NOT NULL DEFAULT 0;

-- No index needed — these are single-row reads/increments per org
```

Apply and verify:
```sql
SELECT id, monthly_scan_image_count, monthly_scan_pdf_count
FROM organizations LIMIT 3;
-- All should show 0
```

---

## Step 2 — Quota limits config (`lib/leads/scanQuota.ts`)

Single source of truth for all limit values.

```typescript
// lib/leads/scanQuota.ts

import type { PlanTier } from '@/lib/stripe'

export interface ScanQuota {
  monthly_images: number
  monthly_pdfs:   number
  daily_images:   number   // burst cap — same for all tiers
  daily_pdfs:     number   // burst cap — same for all tiers
}

/** Monthly limits per plan tier */
export const SCAN_QUOTA: Record<PlanTier, ScanQuota> = {
  tier1: { monthly_images: 100,  monthly_pdfs: 25,  daily_images: 20, daily_pdfs: 10 },
  tier2: { monthly_images: 200,  monthly_pdfs: 50,  daily_images: 20, daily_pdfs: 10 },
  tier3: { monthly_images: 500,  monthly_pdfs: 150, daily_images: 20, daily_pdfs: 10 },
}

/** Human-readable label for quota errors */
export function quotaErrorMessage(
  type: 'image' | 'pdf',
  quota: ScanQuota,
  isDailyLimit: boolean
): string {
  if (isDailyLimit) {
    const limit = type === 'pdf' ? quota.daily_pdfs : quota.daily_images
    return `Daily scan limit reached (${limit}/day). Resets at midnight.`
  }
  const limit = type === 'pdf' ? quota.monthly_pdfs : quota.monthly_images
  return `Monthly scan limit reached (${limit}/month). Resets on your next billing date. Upgrade your plan for a higher limit.`
}
```

---

## Step 3 — Quota check helper (`lib/leads/scanQuota.ts`, continued)

```typescript
import { createServiceClient } from '@/lib/supabase/service'
import { tierFromPriceId }     from '@/lib/stripe'

export type ScanType = 'image' | 'pdf'

export interface QuotaCheckResult {
  allowed:        boolean
  error?:         string
  monthly_used:   number
  monthly_limit:  number
  daily_used:     number
  daily_limit:    number
}

/**
 * Checks whether an org is within quota for a scan type.
 * Does NOT increment the counter — call incrementScanCount() after a
 * successful scan.
 */
export async function checkScanQuota(
  orgId: string,
  type: ScanType
): Promise<QuotaCheckResult> {
  const supabase = createServiceClient()

  // Fetch org plan + current monthly counts
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_price_id, monthly_scan_image_count, monthly_scan_pdf_count')
    .eq('id', orgId)
    .single()

  if (!org) return { allowed: false, error: 'Org not found', monthly_used: 0, monthly_limit: 0, daily_used: 0, daily_limit: 0 }

  const tier  = tierFromPriceId(org.stripe_price_id ?? '')
  const quota = SCAN_QUOTA[tier]

  const monthlyUsed  = type === 'pdf'
    ? (org.monthly_scan_pdf_count   ?? 0)
    : (org.monthly_scan_image_count ?? 0)
  const monthlyLimit = type === 'pdf' ? quota.monthly_pdfs   : quota.monthly_images
  const dailyLimit   = type === 'pdf' ? quota.daily_pdfs     : quota.daily_images

  // Monthly limit check
  if (monthlyUsed >= monthlyLimit) {
    return {
      allowed: false,
      error: quotaErrorMessage(type, quota, false),
      monthly_used: monthlyUsed, monthly_limit: monthlyLimit,
      daily_used: 0, daily_limit: dailyLimit,
    }
  }

  // Daily limit check — count today's scans from onboarding_email_log
  // Reuse the same pattern: count activities or a lightweight scan log
  // We'll count from a daily window using the org scan log table
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count: dailyUsed } = await supabase
    .from('ai_scan_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('scan_type', type === 'pdf' ? 'lead_pdf' : 'lead_image')
    .gte('scanned_at', todayStart.toISOString())

  const dailyCount = dailyUsed ?? 0

  if (dailyCount >= dailyLimit) {
    return {
      allowed: false,
      error: quotaErrorMessage(type, quota, true),
      monthly_used: monthlyUsed, monthly_limit: monthlyLimit,
      daily_used: dailyCount, daily_limit: dailyLimit,
    }
  }

  return {
    allowed: true,
    monthly_used: monthlyUsed, monthly_limit: monthlyLimit,
    daily_used: dailyCount, daily_limit: dailyLimit,
  }
}

/**
 * Atomically increments the org's monthly scan counter after a
 * successful scan. Uses Postgres increment to avoid race conditions.
 */
export async function incrementScanCount(orgId: string, type: ScanType): Promise<void> {
  const supabase  = createServiceClient()
  const column    = type === 'pdf' ? 'monthly_scan_pdf_count' : 'monthly_scan_image_count'

  // Atomic increment via RPC
  await supabase.rpc('increment_org_counter', { org_id: orgId, column_name: column })
}
```

---

## Step 4 — `increment_org_counter` RPC (add to migration 041)

```sql
-- Add to 041_scan_quotas.sql (or apply separately):

CREATE OR REPLACE FUNCTION increment_org_counter(
  org_id      UUID,
  column_name TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Whitelist allowed column names to prevent SQL injection
  IF column_name NOT IN (
    'monthly_message_count',
    'monthly_mms_count',
    'monthly_voice_seconds',
    'monthly_scan_image_count',
    'monthly_scan_pdf_count'
  ) THEN
    RAISE EXCEPTION 'Column not allowed: %', column_name;
  END IF;

  EXECUTE format(
    'UPDATE organizations SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
    column_name, column_name
  ) USING org_id;
END;
$$;
```

---

## Step 5 — Lightweight scan log table (for daily limit tracking)

The daily limit requires knowing how many scans happened today. Add a lightweight log.

```sql
-- Add to 041_scan_quotas.sql:

CREATE TABLE IF NOT EXISTS ai_scan_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_type   TEXT        NOT NULL CHECK (scan_type IN ('lead_image', 'lead_pdf', 'receipt', 'business_card')),
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success     BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Index for daily count query
CREATE INDEX IF NOT EXISTS idx_ai_scan_log_daily
  ON ai_scan_log (org_id, scan_type, scanned_at);

-- Auto-purge log entries older than 35 days (keep for one full billing cycle)
-- Run as part of existing data-retention cron
```

---

## Step 6 — Wire checks into `/api/leads/scan/route.ts`

Add quota check at the top of the route, before calling the AI model.
Increment counter + log after a successful scan.

```typescript
// In app/api/leads/scan/route.ts — add after auth check, before scan call:

import {
  checkScanQuota,
  incrementScanCount,
} from '@/lib/leads/scanQuota'
import { createServiceClient } from '@/lib/supabase/service'

// Determine scan type
const scanType: 'image' | 'pdf' = isPdf ? 'pdf' : 'image'

// Check quota BEFORE calling the AI model
const quota = await checkScanQuota(profile.org_id, scanType)
if (!quota.allowed) {
  return NextResponse.json(
    {
      error: quota.error,
      quota: {
        monthly_used:  quota.monthly_used,
        monthly_limit: quota.monthly_limit,
        daily_used:    quota.daily_used,
        daily_limit:   quota.daily_limit,
      }
    },
    { status: 429 }
  )
}

// ... existing scan logic (scanLeadImage / scanLeadPdf) ...

// After successful scan — increment counter + log
// (fire-and-forget via after(), don't block the response)
after(async () => {
  await incrementScanCount(profile.org_id, scanType)
  const supabase = createServiceClient()
  await supabase.from('ai_scan_log').insert({
    org_id:    profile.org_id,
    scan_type: isPdf ? 'lead_pdf' : 'lead_image',
    success:   true,
  })
})
```

---

## Step 7 — Reset counts in existing billing cycle cron

**File:** `app/api/cron/reset-billing-cycle/route.ts`

Add scan counts to the existing `update` call (one line change):

```typescript
// In the existing update block — add two fields:
const { error: updateErr } = await supabase
  .from('organizations')
  .update({
    monthly_message_count:     0,
    monthly_mms_count:         0,
    monthly_voice_seconds:     0,
    monthly_scan_image_count:  0,   // ← add
    monthly_scan_pdf_count:    0,   // ← add
    billing_cycle_start: newStart.toISOString().slice(0, 10),
    billing_cycle_end:   newEnd.toISOString().slice(0, 10),
  })
  .eq('id', org.id)
```

---

## Step 8 — Show usage on Settings → Billing page

Dealers should be able to see how many scans they've used this month and what their limit is.

**File:** `app/(app)/settings/billing/page.tsx`

Fetch and display alongside the existing SMS usage card:

```typescript
// Fetch from organizations table (already fetched for SMS quota):
const {
  monthly_scan_image_count: imageUsed,
  monthly_scan_pdf_count:   pdfUsed,
  stripe_price_id,
} = org

const tier  = tierFromPriceId(stripe_price_id ?? '')
const quota = SCAN_QUOTA[tier]
```

```tsx
{/* Lead Scanner Usage — add after SMS usage card */}
<div className="rounded-lg border p-4 space-y-3">
  <h3 className="text-sm font-semibold">Lead Scanner</h3>

  {/* Image scans */}
  <div className="space-y-1">
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>Image scans this month</span>
      <span>{imageUsed} / {quota.monthly_images}</span>
    </div>
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full transition-all',
          imageUsed / quota.monthly_images > 0.9 ? 'bg-red-500' :
          imageUsed / quota.monthly_images > 0.7 ? 'bg-yellow-500' :
          'bg-primary'
        )}
        style={{ width: `${Math.min(100, (imageUsed / quota.monthly_images) * 100)}%` }}
      />
    </div>
  </div>

  {/* PDF scans */}
  <div className="space-y-1">
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>PDF scans this month</span>
      <span>{pdfUsed} / {quota.monthly_pdfs}</span>
    </div>
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full transition-all',
          pdfUsed / quota.monthly_pdfs > 0.9 ? 'bg-red-500' :
          pdfUsed / quota.monthly_pdfs > 0.7 ? 'bg-yellow-500' :
          'bg-primary'
        )}
        style={{ width: `${Math.min(100, (pdfUsed / quota.monthly_pdfs) * 100)}%` }}
      />
    </div>
  </div>

  {/* Resets on billing date */}
  <p className="text-xs text-muted-foreground">
    Resets on {new Date(org.billing_cycle_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
    {' · '}
    <a href="/settings/billing#upgrade" className="underline">
      Upgrade for more
    </a>
  </p>
</div>
```

---

## Step 9 — Quota error handling in `LeadScanner.tsx`

When the API returns 429, show a clear message (not a generic "scan failed"):

```typescript
// In LeadScanner.tsx handleFile() — update the error handling:

if (resp.status === 429) {
  const data = await resp.json()
  // Show quota-specific message with upgrade link
  setError(data.error ?? 'Scan limit reached')
  setLimitHit(true)   // triggers upgrade CTA in the UI
  setStage('pick')
  return
}
```

```tsx
{/* In the 'pick' stage — show upgrade CTA if limit was hit */}
{limitHit && (
  <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm space-y-2">
    <p className="font-medium text-yellow-800">Scan limit reached</p>
    <p className="text-yellow-700 text-xs">{error}</p>
    <a
      href="/settings/billing"
      className="text-xs text-primary underline"
    >
      View usage and upgrade →
    </a>
  </div>
)}
```

---

## Step 10 — SuperAdmin override (optional, low priority)

Admins can manually bump a dealer's limit for the month without waiting for billing reset.

**File:** `app/api/admin/orgs/[id]/quota/route.ts`

```typescript
// PATCH { scan_image_count: 0, scan_pdf_count: 0 }
// requirePlatformSuperAdmin()
// Resets scan counts for the org (allows more scans this month)
// Logs to admin_audit_log: action 'reset_scan_quota'
```

This is a manual escape hatch for your support team when a dealer runs out early.

---

## Checklist

### Migration
- 🔲 Write `041_scan_quotas.sql` (ALTER TABLE + RPC + ai_scan_log)
- 🔲 Apply in Supabase SQL editor
- 🔲 Verify `monthly_scan_image_count` and `monthly_scan_pdf_count` columns exist on `organizations`
- 🔲 Verify `increment_org_counter` RPC exists and rejects unknown columns
- 🔲 Verify `ai_scan_log` table created with correct index

### Quota library
- 🔲 Create `lib/leads/scanQuota.ts`
- 🔲 Verify `SCAN_QUOTA` values match the table above
- 🔲 Test `checkScanQuota()` — returns `allowed: false` when monthly count ≥ limit
- 🔲 Test `checkScanQuota()` — returns `allowed: false` when daily count ≥ 20
- 🔲 Test `incrementScanCount()` — increments correct column

### Scan route
- 🔲 Add quota check before AI model call in `/api/leads/scan`
- 🔲 Verify 429 returned with `{ error, quota }` payload when limit hit
- 🔲 Verify count incremented only on successful scan (not on error)
- 🔲 Verify `ai_scan_log` row inserted after successful scan

### Billing cycle reset
- 🔲 Add `monthly_scan_image_count: 0` and `monthly_scan_pdf_count: 0` to `reset-billing-cycle` cron update

### Billing UI
- 🔲 Scanner usage card added to Settings → Billing
- 🔲 Progress bar turns yellow at 70%, red at 90%
- 🔲 "Resets on [date]" shown
- 🔲 Upgrade link present

### LeadScanner component
- 🔲 429 response shows quota-specific error (not generic "scan failed")
- 🔲 Upgrade CTA shown when limit hit
- 🔲 Link to `/settings/billing` in error state

### Admin override (low priority)
- 🔲 Create `/api/admin/orgs/[id]/quota` PATCH route
- 🔲 Add "Reset scan quota" button on `/admin/orgs/[id]` detail page

---

## Summary: What This Costs You

| Scenario | Orgs | Monthly AI cost |
|----------|------|-----------------|
| 10 dealers on Tier 1, all hit cap | 10 | ~$8 |
| 25 dealers mixed tiers, avg 50% usage | 25 | ~$15 |
| 100 dealers mixed tiers, avg 50% usage | 100 | ~$60 |

At 100 dealers, **$60/month in AI costs against ~$6,000/month in subscription revenue = 1% COGS.** Well within margin.

The limits protect against the edge case of someone automation-testing your API or accidentally looping — not against normal use.
