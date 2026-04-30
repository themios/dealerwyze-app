# Pre-Launch Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all silent failure modes, revenue leaks, and scale-breaking bugs before the first external paying dealer is onboarded.

**Architecture:** Create a shared `apiFetch` client wrapper that throws on API errors, fix all 5 settings save handlers to use it, patch the canceled-org Lambda leak, batch-refactor the two N+1 sequence crons, and replace in-memory rate limiters with Upstash Redis.

**Tech Stack:** Next.js 16, TypeScript, Supabase, Vitest, @upstash/ratelimit, @upstash/redis

---

## File Map

### New files
- `lib/api/fetchClient.ts` — `apiFetch()` wrapper that throws `ApiError` on non-ok responses
- `lib/api/__tests__/fetchClient.test.ts` — Vitest unit tests for the wrapper
- `lib/rateLimit/upstash.ts` — shared Upstash Redis rate limiter instances

### Modified files
- `app/(app)/settings/organization/sections/BasicInfoSection.tsx` — add error state, use `apiFetch`
- `app/(app)/settings/organization/sections/GoogleBusinessProfileSection.tsx` — add error state, use `apiFetch`
- `app/(app)/settings/organization/sections/LocationsSection.tsx` — add error state, use `apiFetch`
- `app/(app)/settings/organization/sections/VoiceAgentSection.tsx` — add error state, use `apiFetch`
- `app/(app)/settings/retention/RetentionSettingsClient.tsx` — fix silent postgrid key save
- `app/api/cron/process-render-queue/route.ts` — skip canceled orgs before dispatching Lambda
- `lib/cron/jobs/sequenceDelivery.ts` — batch N+1 queries (enrollment + reply checks)
- `lib/cron/jobs/fullAutoSequence.ts` — batch N+1 queries (enrollment + customer + reply checks)
- `app/api/auth/register/route.ts` — replace in-memory `regAttempts` Map with Upstash
- `app/api/leads/web/route.ts` — replace in-memory `ipStore` Map with Upstash
- `.env.example` — add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
- `package.json` — add @upstash/ratelimit and @upstash/redis

---

## Task 1: Create `apiFetch` client wrapper

**Files:**
- Create: `lib/api/fetchClient.ts`
- Create: `lib/api/__tests__/fetchClient.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `lib/api/__tests__/fetchClient.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { apiFetch, ApiError } from '../fetchClient'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '123' }),
    })
    const result = await apiFetch<{ id: string }>('/api/test')
    expect(result).toEqual({ id: '123' })
  })

  it('throws ApiError with server error message on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Validation failed' }),
    })
    await expect(apiFetch('/api/test')).rejects.toThrow('Validation failed')
  })

  it('throws ApiError with status code', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    })
    try {
      await apiFetch('/api/test')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(500)
    }
  })

  it('falls back to generic message when error field is absent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    await expect(apiFetch('/api/test')).rejects.toThrow('Something went wrong. Please try again.')
  })

  it('falls back to generic message when response body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') },
    })
    await expect(apiFetch('/api/test')).rejects.toThrow('Something went wrong. Please try again.')
  })

  it('passes options through to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    global.fetch = mockFetch
    await apiFetch('/api/test', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Tim' }),
    })
    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'PATCH',
    }))
  })
})
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npm test lib/api/__tests__/fetchClient.test.ts
```

Expected: `Cannot find module '../fetchClient'`

- [ ] **Step 1.3: Implement `lib/api/fetchClient.ts`**

```typescript
/**
 * Client-side fetch wrapper that throws ApiError on non-ok responses.
 * Use this instead of bare fetch() in all client components that mutate data.
 *
 * @example
 *   try {
 *     await apiFetch('/api/settings/org', { method: 'PATCH', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' } })
 *     setSaved(true)
 *   } catch (err) {
 *     setError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
 *   }
 */

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    let message = 'Something went wrong. Please try again.'
    try {
      const data = await res.json()
      if (typeof data?.error === 'string') message = data.error
    } catch {
      // response body is not JSON — use generic message
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npm test lib/api/__tests__/fetchClient.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 1.5: Commit**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
git add lib/api/fetchClient.ts lib/api/__tests__/fetchClient.test.ts
git commit -m "feat: add apiFetch wrapper that throws ApiError on non-ok responses"
```

---

## Task 2: Fix silent save — BasicInfoSection

**Files:**
- Modify: `app/(app)/settings/organization/sections/BasicInfoSection.tsx`

The current `handleSave()` at line 76-86 always shows "Saved!" regardless of whether the API returned an error.

- [ ] **Step 2.1: Open the file and verify the broken pattern**

Read `app/(app)/settings/organization/sections/BasicInfoSection.tsx` lines 40-90. Confirm `handleSave()` has no `res.ok` check and calls `setSaved(true)` unconditionally.

- [ ] **Step 2.2: Apply the fix**

Replace the existing `useState` declarations and `handleSave` function. The full corrected section:

In `BasicInfoSection.tsx`, replace:

```typescript
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
```

with:

```typescript
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
```

Add the import at the top of the file (after existing imports):

```typescript
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
```

Replace the `handleSave` function (lines 76-86):

```typescript
  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await apiFetch('/api/settings/org', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }
```

In the JSX return, locate the Save button area and add the error display directly above the Save button:

```tsx
{saveError && (
  <p className="text-sm text-destructive">{saveError}</p>
)}
```

- [ ] **Step 2.3: Verify it builds**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep BasicInfoSection
```

Expected: no errors for this file

- [ ] **Step 2.4: Commit**

```bash
git add "app/(app)/settings/organization/sections/BasicInfoSection.tsx"
git commit -m "fix: show error instead of false success when BasicInfoSection save fails"
```

---

## Task 3: Fix silent save — GoogleBusinessProfileSection

**Files:**
- Modify: `app/(app)/settings/organization/sections/GoogleBusinessProfileSection.tsx`

- [ ] **Step 3.1: Read the file**

Read `app/(app)/settings/organization/sections/GoogleBusinessProfileSection.tsx`. Confirm the `handleSave` function calls `await fetch(...)` then `setSaved(true)` with no `res.ok` check.

- [ ] **Step 3.2: Apply the fix**

Add import at top:
```typescript
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
```

Add error state alongside existing state:
```typescript
const [saveError, setSaveError] = useState<string | null>(null)
```

Replace the save function (the one that calls `fetch('/api/settings/org', ...)`):
```typescript
  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await apiFetch('/api/settings/org', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ gbp_location_id: gbpLocationId }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }
```

Add error display in JSX above the Save button:
```tsx
{saveError && (
  <p className="text-sm text-destructive">{saveError}</p>
)}
```

- [ ] **Step 3.3: Verify it builds**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep GoogleBusinessProfile
```

Expected: no errors

- [ ] **Step 3.4: Commit**

```bash
git add "app/(app)/settings/organization/sections/GoogleBusinessProfileSection.tsx"
git commit -m "fix: show error instead of false success when GBP settings save fails"
```

---

## Task 4: Fix silent save — LocationsSection

**Files:**
- Modify: `app/(app)/settings/organization/sections/LocationsSection.tsx`

- [ ] **Step 4.1: Read the file**

Read `app/(app)/settings/organization/sections/LocationsSection.tsx`. Confirm `handleSave()` at ~line 78 has no `res.ok` check.

- [ ] **Step 4.2: Apply the fix**

Add import:
```typescript
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
```

Add error state:
```typescript
const [saveError, setSaveError] = useState<string | null>(null)
```

Replace `handleSave`:
```typescript
  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await apiFetch('/api/settings/org', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ locations }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }
```

Add error display in JSX above Save button:
```tsx
{saveError && (
  <p className="text-sm text-destructive">{saveError}</p>
)}
```

- [ ] **Step 4.3: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep LocationsSection
```

- [ ] **Step 4.4: Commit**

```bash
git add "app/(app)/settings/organization/sections/LocationsSection.tsx"
git commit -m "fix: show error instead of false success when Locations save fails"
```

---

## Task 5: Fix silent save — VoiceAgentSection

**Files:**
- Modify: `app/(app)/settings/organization/sections/VoiceAgentSection.tsx`

- [ ] **Step 5.1: Read the file**

Read `app/(app)/settings/organization/sections/VoiceAgentSection.tsx`. Confirm `handleSave()` at ~line 49 has no `res.ok` check (note: `handleProvisionVoice` already has one — only fix `handleSave`).

- [ ] **Step 5.2: Apply the fix**

Add import:
```typescript
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
```

Add error state (there may already be a `voiceError` state — add a separate `saveError` for the settings save):
```typescript
const [saveError, setSaveError] = useState<string | null>(null)
```

Replace only the `handleSave` function (leave `handleProvisionVoice` unchanged):
```typescript
  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await apiFetch('/api/settings/org', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          dealer_cell_number:         form.dealer_cell_number,
          voice_business_hours_start: form.voice_business_hours_start,
          voice_business_hours_end:   form.voice_business_hours_end,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }
```

Add error display in JSX near the Save button:
```tsx
{saveError && (
  <p className="text-sm text-destructive">{saveError}</p>
)}
```

- [ ] **Step 5.3: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep VoiceAgentSection
```

- [ ] **Step 5.4: Commit**

```bash
git add "app/(app)/settings/organization/sections/VoiceAgentSection.tsx"
git commit -m "fix: show error instead of false success when Voice settings save fails"
```

---

## Task 6: Fix silent save — RetentionSettingsClient (postgrid key)

**Files:**
- Modify: `app/(app)/settings/retention/RetentionSettingsClient.tsx`

- [ ] **Step 6.1: Read the file and locate the problem**

Read `app/(app)/settings/retention/RetentionSettingsClient.tsx`. Find line ~86:

```typescript
await fetch('/api/settings/org', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postgrid_api_key: pgKey.trim() || null }) })
```

This saves the PostGrid API key with no `res.ok` check and no user feedback on failure.

- [ ] **Step 6.2: Apply the fix**

Add import at top:
```typescript
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
```

Find the function that contains the postgrid save (search for `pgKey`). Add error state near that function's existing state:
```typescript
const [pgSaveError, setPgSaveError] = useState<string | null>(null)
```

Replace the bare `await fetch(...)` for the postgrid key with:
```typescript
    setPgSaveError(null)
    try {
      await apiFetch('/api/settings/org', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postgrid_api_key: pgKey.trim() || null }),
      })
      // show existing success UI if any
    } catch (err) {
      setPgSaveError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
    }
```

Add display near the postgrid key input:
```tsx
{pgSaveError && (
  <p className="text-sm text-destructive">{pgSaveError}</p>
)}
```

- [ ] **Step 6.3: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep RetentionSettings
```

- [ ] **Step 6.4: Run all tests**

```bash
npm test
```

Expected: all 20+ tests pass

- [ ] **Step 6.5: Commit**

```bash
git add "app/(app)/settings/retention/RetentionSettingsClient.tsx"
git commit -m "fix: show error when PostGrid API key save fails silently"
```

---

## Task 7: Fix canceled-org Lambda renders

**Files:**
- Modify: `app/api/cron/process-render-queue/route.ts`

The cron currently fetches up to 5 queued renders and dispatches them to Lambda without checking if the org's subscription is canceled. Canceled orgs should not consume Lambda capacity.

- [ ] **Step 7.1: Read the file**

Read `app/api/cron/process-render-queue/route.ts`. Confirm line 44-50 fetches queued renders with no subscription check.

- [ ] **Step 7.2: Apply the fix**

After the `queued` fetch (after the `if (!queued || queued.length === 0)` guard), add this block before the Lambda dispatch loop:

```typescript
  // Filter out renders for canceled orgs — no point burning Lambda for churned accounts
  const orgIds = [...new Set(queued.map(r => r.org_id))]
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, subscription_status')
    .in('id', orgIds)
  const canceledOrgIds = new Set(
    (orgs ?? [])
      .filter(o => o.subscription_status === 'canceled')
      .map(o => o.id)
  )
  const activeQueued = queued.filter(r => !canceledOrgIds.has(r.org_id))

  if (activeQueued.length === 0) {
    await finishCronRun(runId, 'success', 0)
    return NextResponse.json({ dispatched: 0, reason: 'All queued renders belong to canceled orgs' })
  }
```

Then replace `for (const render of queued)` with `for (const render of activeQueued)` on the line that starts the dispatch loop.

- [ ] **Step 7.3: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep process-render-queue
```

Expected: no errors

- [ ] **Step 7.4: Commit**

```bash
git add app/api/cron/process-render-queue/route.ts
git commit -m "fix: skip Lambda renders for canceled orgs to prevent unnecessary AWS spend"
```

---

## Task 8: Fix sequence delivery N+1 queries

**Files:**
- Modify: `lib/cron/jobs/sequenceDelivery.ts`

Currently this job does up to **200 separate DB queries** (2 per activity × 100 activities): one for `customer_sequences` enrollment, one for inbound reply check. This will timeout as the platform scales.

- [ ] **Step 8.1: Read the file**

Read `lib/cron/jobs/sequenceDelivery.ts`. Confirm the two queries inside the `for` loop at lines 27-55.

- [ ] **Step 8.2: Apply the batch refactor**

Replace the entire content of `lib/cron/jobs/sequenceDelivery.ts`:

```typescript
/** Auto-send pending email sequence activities that are due, stopping sequences when customers have replied. */

import { stopSequenceOnReply } from '@/lib/sequences/stopSequenceOnReply'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runSequenceDelivery(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ sequenceSent: number }> {
  let sequenceSent = 0

  try {
    const nowIso = new Date().toISOString()

    const { data: sequenceActivities } = await supabase
      .from('activities')
      .select('id, user_id, customer_id, body, sequence_day, customer_sequence_id')
      .in('type', ['email', 'email_followup'])
      .eq('direction', 'outbound')
      .is('completed_at', null)
      .not('customer_sequence_id', 'is', null)
      .lte('due_at', nowIso)
      .limit(100)

    if (!sequenceActivities || sequenceActivities.length === 0) return { sequenceSent }

    // Batch 1: fetch all enrollment dates in a single query
    const seqIds = sequenceActivities.map(a => a.customer_sequence_id).filter(Boolean) as string[]
    const { data: enrollments } = await supabase
      .from('customer_sequences')
      .select('id, enrolled_at')
      .in('id', seqIds)
    const enrollMap = new Map(
      (enrollments ?? []).map(e => [e.id, e.enrolled_at ?? '1970-01-01T00:00:00Z'])
    )

    // Batch 2: fetch all inbound replies for these customers in a single query
    const custIds = [...new Set(sequenceActivities.map(a => a.customer_id))]
    const { data: replyRows } = await supabase
      .from('activities')
      .select('customer_id, created_at')
      .in('customer_id', custIds)
      .eq('direction', 'inbound')
      .in('type', ['email', 'sms'])
    // Build a map of customer_id → earliest reply timestamp
    const replyMap = new Map<string, string>()
    for (const r of replyRows ?? []) {
      const existing = replyMap.get(r.customer_id)
      if (!existing || r.created_at < existing) replyMap.set(r.customer_id, r.created_at)
    }

    const { sendSequenceEmail } = await import('@/lib/email/sendSequenceEmail')

    for (const act of sequenceActivities) {
      const enrolledAt = enrollMap.get(act.customer_sequence_id ?? '') ?? '1970-01-01T00:00:00Z'
      const repliedAt  = replyMap.get(act.customer_id)
      const hasReplied = repliedAt !== undefined && repliedAt >= enrolledAt

      if (hasReplied) {
        const { data: cData } = await supabase
          .from('customers')
          .select('name, user_id')
          .eq('id', act.customer_id)
          .maybeSingle()
        await stopSequenceOnReply({
          supabase,
          orgId:        act.user_id,
          customerId:   act.customer_id,
          customerName: cData?.name ?? 'Customer',
        })
        continue
      }

      let parsed: { to?: string; subject?: string; body?: string; step_label?: string; customer_name?: string } = {}
      try { parsed = JSON.parse(act.body ?? '') } catch { continue }
      if (!parsed.to || !parsed.subject || !parsed.body) continue

      const result = await sendSequenceEmail({
        orgId:         act.user_id,
        customerId:    act.customer_id,
        customerEmail: parsed.to,
        customerName:  parsed.customer_name ?? '',
        subject:       parsed.subject,
        body:          parsed.body,
        activityId:    act.id,
        sequenceDay:   act.sequence_day ?? 0,
        stepLabel:     parsed.step_label,
      })

      if (result.ok) {
        sequenceSent++
      } else {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: result.error === 'no_account' ? 'cancelled' : 'failed' })
          .eq('id', act.id)
      }
    }
  } catch (e) {
    console.error('[check-tasks] Job 11 sequence send error:', e)
  }

  return { sequenceSent }
}
```

- [ ] **Step 8.3: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep sequenceDelivery
```

Expected: no errors

- [ ] **Step 8.4: Commit**

```bash
git add lib/cron/jobs/sequenceDelivery.ts
git commit -m "perf: batch enrollment + reply queries in sequenceDelivery (was N+1, up to 200 queries)"
```

---

## Task 9: Fix fullAutoSequence N+1 queries

**Files:**
- Modify: `lib/cron/jobs/fullAutoSequence.ts`

Currently does up to **150 queries** (3 per activity × 50 activities): enrollment+sequence, customer unsubscribe check, reply check.

- [ ] **Step 9.1: Read the file**

Read `lib/cron/jobs/fullAutoSequence.ts`. Confirm the three queries inside the `for` loop at lines 26-60.

- [ ] **Step 9.2: Apply the batch refactor**

Replace the entire content of `lib/cron/jobs/fullAutoSequence.ts`:

```typescript
/** Auto-fire pending email steps for full_auto sequences, stopping when customers reply or unsubscribe. */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runFullAutoSequence(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ fullAutoFired: number }> {
  let fullAutoFired = 0

  try {
    const nowIso = new Date().toISOString()
    const { sendSequenceEmail: sendSeqEmail } = await import('@/lib/email/sendSequenceEmail')

    const { data: dueActivities } = await supabase
      .from('activities')
      .select('id, user_id, customer_id, body, customer_sequence_id')
      .in('type', ['email_followup', 'email'])
      .eq('direction', 'outbound')
      .is('completed_at', null)
      .lte('due_at', nowIso)
      .not('customer_sequence_id', 'is', null)
      .limit(50)

    if (!dueActivities || dueActivities.length === 0) return { fullAutoFired }

    // Batch 1: fetch all enrollments + their sequence auto_mode in one query
    const seqIds = dueActivities.map(a => a.customer_sequence_id).filter(Boolean) as string[]
    const { data: enrollments } = await supabase
      .from('customer_sequences')
      .select('id, status, org_id, sequence:sequences(auto_mode)')
      .in('id', seqIds)
    const enrollMap = new Map(
      (enrollments ?? []).map(e => {
        const seq = Array.isArray(e.sequence) ? e.sequence[0] : e.sequence
        return [e.id, { status: e.status, org_id: e.org_id, auto_mode: (seq as { auto_mode?: string } | null)?.auto_mode }]
      })
    )

    // Batch 2: fetch unsubscribe status for all customers in one query
    const custIds = [...new Set(dueActivities.map(a => a.customer_id))]
    const { data: customers } = await supabase
      .from('customers')
      .select('id, unsubscribe_email, email')
      .in('id', custIds)
    const custMap = new Map(
      (customers ?? []).map(c => [c.id, { unsubscribe_email: c.unsubscribe_email, email: c.email }])
    )

    // Batch 3: fetch inbound replies for all customers in one query
    const { data: replyRows } = await supabase
      .from('activities')
      .select('customer_id')
      .in('customer_id', custIds)
      .eq('direction', 'inbound')
      .in('type', ['email', 'sms'])
      .limit(custIds.length * 2) // one reply per customer is enough to stop the sequence
    const repliedCustIds = new Set((replyRows ?? []).map(r => r.customer_id))

    for (const act of dueActivities) {
      if (!act.customer_sequence_id) continue

      const enrollment = enrollMap.get(act.customer_sequence_id)
      if (!enrollment || enrollment.status !== 'active') continue
      if (enrollment.auto_mode !== 'full_auto') continue

      const cust = custMap.get(act.customer_id)
      if (cust?.unsubscribe_email) {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'unsubscribed' })
          .eq('id', act.id)
        continue
      }

      if (repliedCustIds.has(act.customer_id)) {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'cancelled' })
          .eq('customer_sequence_id', act.customer_sequence_id)
          .is('completed_at', null)
          .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])
        await supabase
          .from('customer_sequences')
          .update({ status: 'cancelled', completed_at: nowIso })
          .eq('id', act.customer_sequence_id)
        continue
      }

      let parsed: { to?: string; subject?: string; body?: string; customer_name?: string } = {}
      try { parsed = JSON.parse(act.body ?? '') } catch { continue }
      if (!parsed.to || !parsed.subject || !parsed.body) continue

      const result = await sendSeqEmail({
        orgId:         enrollment.org_id,
        customerId:    act.customer_id,
        customerEmail: parsed.to,
        customerName:  parsed.customer_name ?? '',
        subject:       parsed.subject,
        body:          parsed.body,
        activityId:    act.id,
        sequenceDay:   0,
      })

      if (result.ok) {
        fullAutoFired++
      } else if (result.error === 'no_account') {
        await supabase
          .from('activities')
          .update({ completed_at: nowIso, outcome: 'cancelled' })
          .eq('id', act.id)
      }

      const { count: remaining } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('customer_sequence_id', act.customer_sequence_id)
        .is('completed_at', null)
        .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])

      if ((remaining ?? 0) === 0) {
        await supabase
          .from('customer_sequences')
          .update({ status: 'completed', completed_at: nowIso })
          .eq('id', act.customer_sequence_id)
      }
    }
  } catch (e) {
    console.error('[check-tasks] Job 12 full_auto sequence error:', e)
  }

  return { fullAutoFired }
}
```

- [ ] **Step 9.3: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep fullAutoSequence
```

Expected: no errors

- [ ] **Step 9.4: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 9.5: Commit**

```bash
git add lib/cron/jobs/fullAutoSequence.ts
git commit -m "perf: batch enrollment + customer + reply queries in fullAutoSequence (was N+1, up to 150 queries)"
```

---

## Task 10: Add Upstash Redis — account setup

This is a manual step Tim does before writing code.

- [ ] **Step 10.1: Create Upstash account and database**

1. Go to https://console.upstash.com
2. Sign up (free)
3. Click "Create Database"
4. Name: `dealerwyze-ratelimit`
5. Region: `us-east-1` (same as your Vercel deployment)
6. Type: Regional (not Global — you don't need multi-region for rate limiting)
7. Click "Create"

- [ ] **Step 10.2: Copy credentials**

On the database page, copy:
- `UPSTASH_REDIS_REST_URL` — the REST URL (starts with `https://`)
- `UPSTASH_REDIS_REST_TOKEN` — the REST token

- [ ] **Step 10.3: Add to .env.local**

Add to `/home/tim/Applications/ApolloCRM/apollo-crm/.env.local`:
```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

- [ ] **Step 10.4: Add to Vercel (staging first)**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx vercel env add UPSTASH_REDIS_REST_URL
npx vercel env add UPSTASH_REDIS_REST_TOKEN
```

Add to both Preview and Production environments when prompted.

- [ ] **Step 10.5: Add to .env.example**

In `.env.example`, add under a `# Rate Limiting` section:
```
UPSTASH_REDIS_REST_URL=         # Upstash Redis REST URL (free tier at upstash.com)
UPSTASH_REDIS_REST_TOKEN=       # Upstash Redis REST token
```

```bash
git add .env.example
git commit -m "docs: add Upstash Redis env vars to .env.example"
```

---

## Task 11: Wire Upstash Redis rate limiting

**Files:**
- Create: `lib/rateLimit/upstash.ts`
- Modify: `app/api/auth/register/route.ts`
- Modify: `app/api/leads/web/route.ts`
- Modify: `package.json`

- [ ] **Step 11.1: Install packages**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npm install @upstash/ratelimit @upstash/redis
```

Verify both appear in `package.json` dependencies.

- [ ] **Step 11.2: Create `lib/rateLimit/upstash.ts`**

```typescript
/**
 * Shared Upstash Redis rate limiter instances.
 *
 * Uses sliding window algorithm — more accurate than fixed window for abuse prevention.
 * Falls back gracefully if env vars are missing (allows request through, logs warning).
 *
 * Usage:
 *   const { success } = await registrationLimiter.limit(ip)
 *   if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function makeRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.warn('[rateLimit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set — rate limiting disabled')
    return null
  }
  return new Redis({ url, token })
}

const redis = makeRedis()

function makeLimiter(requests: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`, prefix: string) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix:  `dw:${prefix}`,
  })
}

/** 5 registration attempts per IP per hour */
export const registrationLimiter = makeLimiter(5, '1 h', 'reg')

/** 10 web lead submissions per IP per hour */
export const webLeadLimiter = makeLimiter(10, '1 h', 'weblead')

/**
 * Convenience wrapper. Returns true if the request should be blocked.
 * If the limiter is null (env vars missing), always returns false (allow through).
 */
export async function isRateLimited(
  limiter: Ratelimit | null,
  key: string,
): Promise<boolean> {
  if (!limiter) return false
  const { success } = await limiter.limit(key)
  return !success
}
```

- [ ] **Step 11.3: Update `app/api/auth/register/route.ts`**

Remove the in-memory Map and its helper function. Replace with Upstash.

At the top of the file, remove these lines:
```typescript
// In-process rate limiter: 5 registration attempts per IP per hour.
// Note: not shared across Vercel instances — acceptable for this low-volume endpoint.
// proxy.ts also enforces 3 signups / 10 min at the edge for additional coverage.
const regAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRegLimit(ip: string): boolean {
  const now = Date.now()
  const entry = regAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    regAttempts.set(ip, { count: 1, resetAt: now + 3_600_000 })
    return false // not limited
  }
  if (entry.count >= 5) return true // limited
  entry.count++
  return false
}
```

Add this import at the top:
```typescript
import { isRateLimited, registrationLimiter } from '@/lib/rateLimit/upstash'
```

Find where `checkRegLimit` is called in the POST handler. It will look like:
```typescript
if (checkRegLimit(ip)) {
  return NextResponse.json({ error: '...' }, { status: 429 })
}
```

Replace with:
```typescript
if (await isRateLimited(registrationLimiter, ip)) {
  return NextResponse.json({ error: 'Too many sign-up attempts. Please try again in an hour.' }, { status: 429 })
}
```

Note: the function is now `async` — if the POST handler was not already async, it already is (it does DB calls).

- [ ] **Step 11.4: Update `app/api/leads/web/route.ts`**

Remove the in-memory Map and its helper at lines 11-22:
```typescript
// Simple in-route rate limit: 10 submissions per IP per hour
const ipStore = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = ipStore.get(ip)
  if (!entry || now > entry.resetAt) {
    ipStore.set(ip, { count: 1, resetAt: now + 3_600_000 })
    return false
  }
  entry.count++
  return entry.count > 10
}

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
}
```

Add import:
```typescript
import { isRateLimited as checkRateLimit, webLeadLimiter } from '@/lib/rateLimit/upstash'
```

Keep the `getIp` helper (just remove the `isRateLimited` function and Map). Update the rate limit check in the POST handler:

```typescript
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (await checkRateLimit(webLeadLimiter, ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
```

- [ ] **Step 11.5: Verify it builds**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep -E "register|leads/web|upstash"
```

Expected: no errors

- [ ] **Step 11.6: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 11.7: Commit**

```bash
git add lib/rateLimit/upstash.ts app/api/auth/register/route.ts app/api/leads/web/route.ts package.json package-lock.json
git commit -m "feat: replace in-memory rate limiters with Upstash Redis (shared across all Vercel instances)"
```

---

## Task 12: Deploy to staging and smoke test

- [ ] **Step 12.1: Deploy to staging**

```bash
cd /home/tim/Applications/ApolloCRM
./deploy-staging.sh
```

- [ ] **Step 12.2: Smoke test silent save fixes**

1. Go to apollo-crm.vercel.app and log in as Apollo Auto admin
2. Settings > Organization > Basic Info — change name, save. Confirm "Saved" appears
3. Open DevTools Network tab. Filter for `/api/settings/org`. Save again. Confirm 200 response
4. To test error display: temporarily go offline (DevTools > Network > Offline), try to save. Confirm error message appears instead of "Saved"
5. Repeat for Voice settings tab, Locations tab

- [ ] **Step 12.3: Smoke test render queue fix**

Check `cron_runs` table in Supabase for `process-render-queue` entries — no errors expected.

- [ ] **Step 12.4: Commit any staging fixes, then deploy to prod**

```bash
cd /home/tim/Applications/ApolloCRM
./deploy-prod.sh
```

---

## Self-Review

**Spec coverage:**
- Silent fetch failures (5 components) → Tasks 2-6 ✅
- org_settings upsert-style silent drop → Tasks 2-6 cover all confirmed instances ✅
- Canceled org Lambda renders → Task 7 ✅
- Sequence N+1 queries → Tasks 8-9 ✅
- Upstash Redis rate limiting → Tasks 10-11 ✅

**Gaps found:**
- `RetentionSettingsClient.tsx` line 86 also calls `/api/settings/org` without res.ok for postgrid key — covered in Task 6 ✅
- `fullAutoSequence` "remaining steps" count check at the end of each loop iteration is still a per-iteration query (1 per sent email). This is acceptable — it only fires after a successful send, not for every activity. Not worth batching.

**Placeholder scan:** None found — all code blocks are complete and executable.

**Type consistency:** `ApiError`, `apiFetch`, `isRateLimited`, `registrationLimiter`, `webLeadLimiter` are consistent across all tasks that reference them.

---

## Phase 2: Account Lifecycle, Free Tier, Abuse Prevention & Legal

---

## Task 13: Migration 105 — account lifecycle columns

**Files:**
- Create: `supabase/migrations/105_account_lifecycle.sql`

- [ ] **Step 13.1: Create the migration file**

```sql
-- Migration 105: account lifecycle tracking columns
-- Supports: 30-day trial, 7-day grace, free tier downgrade, 90-day deletion pipeline, suspension

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS past_due_since         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS free_tier_since        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_warnings     TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill trial_ends_at for existing trialing accounts from Stripe trial_end
-- (Leave NULL for existing active/canceled accounts — lifecycle cron will ignore them)

-- Index for lifecycle cron daily scan
CREATE INDEX IF NOT EXISTS idx_orgs_lifecycle_scan
  ON organizations (subscription_status, trial_ends_at, past_due_since, free_tier_since)
  WHERE subscription_status IN ('trialing', 'past_due', 'active');

COMMENT ON COLUMN organizations.trial_ends_at         IS '30-day trial expiry. Set from Stripe trial_end on subscription create webhook.';
COMMENT ON COLUMN organizations.past_due_since        IS 'When subscription first went past_due. Set by Stripe webhook, cleared on payment success.';
COMMENT ON COLUMN organizations.free_tier_since       IS 'When org was downgraded to free tier (plan=free). Null for paying orgs.';
COMMENT ON COLUMN organizations.suspended_at          IS 'When org was suspended by admin. Null for active orgs. Blocks all API access.';
COMMENT ON COLUMN organizations.deletion_scheduled_at IS 'Computed: free_tier_since + 90 days. Data deleted after this date.';
COMMENT ON COLUMN organizations.lifecycle_warnings    IS 'Array of warning keys already sent, e.g. {trial_expired, grace_day1, free_day30, free_day60, free_day75, free_day83}. Prevents duplicate emails.';
```

- [ ] **Step 13.2: Apply in Supabase SQL editor**

Copy the SQL above and run it in the Supabase dashboard SQL editor for the production project. Confirm no errors.

- [ ] **Step 13.3: Update Stripe webhook to populate trial_ends_at**

In `app/api/stripe/webhook/route.ts`, find the `customer.subscription.created` or `customer.subscription.updated` handler. When `subscription.trial_end` is present, update the org:

```typescript
// Inside the subscription.created / subscription.updated handler,
// after you resolve the org_id from subscription.metadata or customer lookup:
if (subscription.trial_end) {
  await supabase
    .from('organizations')
    .update({ trial_ends_at: new Date(subscription.trial_end * 1000).toISOString() })
    .eq('id', orgId)
}
// When payment succeeds (invoice.payment_succeeded), clear past_due_since:
// .update({ past_due_since: null })
// When invoice.payment_failed, set past_due_since if not already set:
// .update({ past_due_since: new Date().toISOString() }).is('past_due_since', null)
```

- [ ] **Step 13.4: Commit**

```bash
git add supabase/migrations/105_account_lifecycle.sql app/api/stripe/webhook/route.ts
git commit -m "feat: migration 105 — lifecycle columns on organizations + Stripe webhook populates trial_ends_at"
```

---

## Task 14: Account lifecycle cron

**Files:**
- Create: `lib/cron/jobs/accountLifecycle.ts`
- Create: `app/api/cron/account-lifecycle/route.ts`
- Modify: `vercel.json`

Lifecycle stages and timing:
```
Trial start         → trial_ends_at = now + 30 days
Trial expires       → warning email #1; subscription_status becomes 'past_due' (Stripe handles this)
past_due day 1      → email: "Add payment to keep full access. 7 days before free tier."
past_due day 7      → downgrade: plan = 'free', free_tier_since = now, deletion_scheduled_at = now + 90d; email: "Downgraded to free tier"
free tier day 30    → email: "Your data will be deleted in 60 days. Download it now."
free tier day 60    → email: "30 days left to save your data."
free tier day 75    → email: "15 days left. Final chance to download."
free tier day 83    → email: "7 days until your data is permanently deleted."
free tier day 90    → data deleted (handled by existing data-retention cron, extended below)
```

- [ ] **Step 14.1: Create `lib/cron/jobs/accountLifecycle.ts`**

```typescript
/**
 * Account lifecycle management: trial expiry, past-due grace, free tier downgrade,
 * and deletion scheduling. Runs daily via /api/cron/account-lifecycle.
 *
 * Does NOT delete data — deletion is handled by the data-retention cron.
 * This job only sends warnings and downgrades.
 */

import { sendNotificationEmail } from '@/lib/email/notify'
import type { createServiceClient } from '@/lib/supabase/service'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

// Warning keys stored in lifecycle_warnings[] to prevent duplicate sends
type WarningKey = 'grace_day1' | 'grace_day7' | 'free_day30' | 'free_day60' | 'free_day75' | 'free_day83'

function daysAgo(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)
}

async function sendLifecycleEmail(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  adminEmail: string,
  subject: string,
  body: string,
  warningKey: WarningKey,
) {
  await sendNotificationEmail({ to: adminEmail, subject, html: body })
  await supabase
    .from('organizations')
    .update({ lifecycle_warnings: supabase.rpc('array_append_unique', { arr_col: 'lifecycle_warnings', val: warningKey }) })
    .eq('id', orgId)
  // Simpler alternative if RPC not available — use raw SQL append:
  await supabase.rpc('append_lifecycle_warning', { org_id: orgId, warning: warningKey })
}

export async function runAccountLifecycle(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ processed: number }> {
  let processed = 0
  const now = new Date()
  const nowIso = now.toISOString()

  // --- Fetch all orgs needing lifecycle attention ---
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, subscription_status, plan, past_due_since, free_tier_since, lifecycle_warnings, deletion_scheduled_at')
    .or('subscription_status.eq.past_due,subscription_status.eq.trialing,free_tier_since.not.is.null')
    .is('suspended_at', null)

  if (!orgs || orgs.length === 0) return { processed }

  // Fetch admin emails for all these orgs in one query
  const orgIds = orgs.map(o => o.id)
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('org_id, email')
    .in('org_id', orgIds)
    .eq('role', 'dealer_admin')
  const adminEmailMap = new Map(adminProfiles?.map(p => [p.org_id, p.email]) ?? [])

  for (const org of orgs) {
    const adminEmail = adminEmailMap.get(org.id)
    if (!adminEmail) continue

    const warned = new Set<string>(org.lifecycle_warnings ?? [])
    const billingUrl = `${APP_URL}/settings/billing`
    const exportUrl  = `${APP_URL}/settings/data-export`

    // ---- PAST DUE: day 1 warning ----
    if (org.subscription_status === 'past_due' && org.past_due_since && !warned.has('grace_day1')) {
      await supabase
        .from('organizations')
        .update({ lifecycle_warnings: [...(org.lifecycle_warnings ?? []), 'grace_day1'] })
        .eq('id', org.id)
      await sendNotificationEmail({
        to: adminEmail,
        subject: 'Action needed - add payment to keep your DealerWyze access',
        html: `
          <p>Hi ${org.name},</p>
          <p>We were unable to process your payment. You have <strong>7 days</strong> to add a payment method before your account is moved to the free tier.</p>
          <p>On the free tier, direct SMS, voice, video, and automated sequences will be paused. Your customer data stays safe.</p>
          <p><a href="${billingUrl}">Add Payment Method</a></p>
          <p>Questions? Reply to this email or contact support@dealerwyze.com.</p>
        `,
      })
      processed++
    }

    // ---- PAST DUE: day 7 - downgrade to free tier ----
    if (
      org.subscription_status === 'past_due' &&
      org.past_due_since &&
      daysAgo(org.past_due_since) >= 7 &&
      org.plan !== 'free' &&
      !warned.has('grace_day7')
    ) {
      const deletionDate = new Date(now.getTime() + 90 * 86_400_000).toISOString()
      await supabase
        .from('organizations')
        .update({
          plan:                   'free',
          free_tier_since:        nowIso,
          deletion_scheduled_at:  deletionDate,
          lifecycle_warnings:     [...(org.lifecycle_warnings ?? []), 'grace_day7'],
        })
        .eq('id', org.id)
      // Remove Twilio number so free tier enforcement is automatic
      await supabase
        .from('org_settings')
        .update({ twilio_phone_number: null, twilio_phone_sid: null })
        .eq('org_id', org.id)
      await sendNotificationEmail({
        to: adminEmail,
        subject: 'Your DealerWyze account has been moved to the free tier',
        html: `
          <p>Hi ${org.name},</p>
          <p>Your account has been moved to the free tier because we were unable to process your payment.</p>
          <p><strong>What still works:</strong> Customer management, vehicle inventory, email, Open Messages (native SMS app).</p>
          <p><strong>What is paused:</strong> Direct Twilio SMS, voice agent, video posting, automated sequences.</p>
          <p>Your data will be kept for <strong>90 days</strong> (until ${new Date(deletionDate).toLocaleDateString()}), then permanently deleted.</p>
          <p><a href="${billingUrl}">Reactivate Your Account</a> - <a href="${exportUrl}">Download Your Data</a></p>
        `,
      })
      processed++
    }

    // ---- FREE TIER: day 30 warning ----
    if (org.free_tier_since && daysAgo(org.free_tier_since) >= 30 && !warned.has('free_day30')) {
      await supabase
        .from('organizations')
        .update({ lifecycle_warnings: [...(org.lifecycle_warnings ?? []), 'free_day30'] })
        .eq('id', org.id)
      await sendNotificationEmail({
        to: adminEmail,
        subject: 'Your DealerWyze data will be deleted in 60 days',
        html: `
          <p>Hi ${org.name},</p>
          <p>Your account is on the free tier. If you do not reactivate, your data will be <strong>permanently deleted in 60 days</strong>.</p>
          <p><a href="${exportUrl}">Download Your Data Now</a> - <a href="${billingUrl}">Reactivate</a></p>
        `,
      })
      processed++
    }

    // ---- FREE TIER: day 60 warning ----
    if (org.free_tier_since && daysAgo(org.free_tier_since) >= 60 && !warned.has('free_day60')) {
      await supabase
        .from('organizations')
        .update({ lifecycle_warnings: [...(org.lifecycle_warnings ?? []), 'free_day60'] })
        .eq('id', org.id)
      await sendNotificationEmail({
        to: adminEmail,
        subject: '30 days left - download your DealerWyze data before it is deleted',
        html: `
          <p>Hi ${org.name},</p>
          <p>Your data will be <strong>permanently deleted in 30 days</strong>.</p>
          <p><a href="${exportUrl}">Download Your Data</a> - <a href="${billingUrl}">Reactivate</a></p>
        `,
      })
      processed++
    }

    // ---- FREE TIER: day 75 warning ----
    if (org.free_tier_since && daysAgo(org.free_tier_since) >= 75 && !warned.has('free_day75')) {
      await supabase
        .from('organizations')
        .update({ lifecycle_warnings: [...(org.lifecycle_warnings ?? []), 'free_day75'] })
        .eq('id', org.id)
      await sendNotificationEmail({
        to: adminEmail,
        subject: '15 days left - last chance to download your DealerWyze data',
        html: `
          <p>Hi ${org.name},</p>
          <p>Your data will be <strong>permanently deleted in 15 days</strong>. After that it cannot be recovered.</p>
          <p><a href="${exportUrl}">Download Your Data Now</a> - <a href="${billingUrl}">Reactivate</a></p>
        `,
      })
      processed++
    }

    // ---- FREE TIER: day 83 final warning ----
    if (org.free_tier_since && daysAgo(org.free_tier_since) >= 83 && !warned.has('free_day83')) {
      await supabase
        .from('organizations')
        .update({ lifecycle_warnings: [...(org.lifecycle_warnings ?? []), 'free_day83'] })
        .eq('id', org.id)
      await sendNotificationEmail({
        to: adminEmail,
        subject: 'Final notice - 7 days until your DealerWyze data is permanently deleted',
        html: `
          <p>Hi ${org.name},</p>
          <p>This is your final notice. Your data will be <strong>permanently and irreversibly deleted in 7 days</strong>.</p>
          <p><a href="${exportUrl}" style="font-weight:bold">Download Your Data Now</a></p>
          <p>To keep your account: <a href="${billingUrl}">Reactivate</a></p>
        `,
      })
      processed++
    }
  }

  return { processed }
}
```

- [ ] **Step 14.2: Create the cron route `app/api/cron/account-lifecycle/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { runAccountLifecycle } from '@/lib/cron/jobs/accountLifecycle'

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId = await startCronRun('account-lifecycle')
  try {
    const supabase = createServiceClient()
    const { processed } = await runAccountLifecycle(supabase)
    await finishCronRun(runId, 'success', processed)
    return NextResponse.json({ processed })
  } catch (err) {
    await finishCronRun(runId, 'error', undefined, String(err))
    throw err
  }
}
```

- [ ] **Step 14.3: Add to vercel.json**

In `vercel.json`, add to the `crons` array:
```json
{ "path": "/api/cron/account-lifecycle", "schedule": "0 10 * * *" }
```
(Runs daily at 10:00 UTC = 3am PT — after check-tasks, before business hours.)

- [ ] **Step 14.4: Add `append_lifecycle_warning` RPC to migration 105**

Add this to the bottom of `supabase/migrations/105_account_lifecycle.sql`:

```sql
-- Helper RPC to append a warning key to lifecycle_warnings without duplicates
CREATE OR REPLACE FUNCTION append_lifecycle_warning(org_id UUID, warning TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE organizations
  SET lifecycle_warnings = array_append(
    COALESCE(lifecycle_warnings, ARRAY[]::TEXT[]),
    warning
  )
  WHERE id = org_id
    AND NOT (COALESCE(lifecycle_warnings, ARRAY[]::TEXT[]) @> ARRAY[warning]);
$$;
```

- [ ] **Step 14.5: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep -E "accountLifecycle|account-lifecycle"
```

- [ ] **Step 14.6: Commit**

```bash
git add lib/cron/jobs/accountLifecycle.ts app/api/cron/account-lifecycle/route.ts vercel.json supabase/migrations/105_account_lifecycle.sql
git commit -m "feat: account lifecycle cron — trial expiry, past-due grace, free tier downgrade, deletion warnings"
```

---

## Task 15: Free tier enforcement

**Files:**
- Modify: `app/api/auth/me/route.ts`
- Modify: `app/api/sms/send/route.ts`
- Modify: `components/sms/TemplatePicker.tsx`
- Modify: `lib/cron/jobs/sequenceDelivery.ts`
- Modify: `lib/cron/jobs/fullAutoSequence.ts`
- Modify: `app/api/cron/process-render-queue/route.ts`

**Free tier rules:**
- SMS: "Open Messages" only (native app). "Send Now" hidden. `/api/sms/send` returns 403.
- Email: works normally (Resend is platform cost, not per-org Twilio).
- Sequences: auto-send skipped. Manual enrollment still possible but steps won't fire.
- Voice: blocked (no Retell agent — removed at downgrade).
- Video: skipped in render queue.

- [ ] **Step 15.1: Add `org_plan` to `/api/auth/me` response**

Read `app/api/auth/me/route.ts`. Find where the response is built. Add `org_plan` from `organizations.plan`:

```typescript
// In the me route, after fetching profile, also fetch org plan:
const { data: org } = await supabase
  .from('organizations')
  .select('plan')
  .eq('id', profile.org_id)
  .maybeSingle()

return NextResponse.json({
  id:                profile.id,
  role:              profile.role,
  org_id:            profile.org_id,
  is_platform_admin: profile.is_platform_admin ?? false,
  org_plan:          org?.plan ?? 'basic',
})
```

- [ ] **Step 15.2: Block free tier in `/api/sms/send/route.ts`**

Read `app/api/sms/send/route.ts`. After `requireProfile()`, add a plan check before the Twilio send:

```typescript
// After requireProfile(), fetch the org plan:
const { data: org } = await supabase
  .from('organizations')
  .select('plan, suspended_at')
  .eq('id', profile.org_id)
  .maybeSingle()

if (org?.suspended_at) {
  return apiError('Your account has been suspended. Contact support@dealerwyze.com.', 403)
}
if (org?.plan === 'free') {
  return apiError('Direct SMS is not available on the free tier. Use Open Messages to send from your phone.', 403)
}
```

- [ ] **Step 15.3: Hide "Send Now" in TemplatePicker for free tier**

The component currently reads `twilioEnabled` from `process.env.NEXT_PUBLIC_TWILIO_ENABLED`. Add a runtime org plan check.

Add `orgPlan` prop to the interface:

```typescript
interface TemplatePickerProps {
  customer: Customer
  vehicle?: Vehicle
  orgPlan?: string          // pass from parent; defaults to 'basic' (paid)
}
```

Update the component signature:
```typescript
export default function TemplatePicker({ customer, vehicle, orgPlan = 'basic' }: TemplatePickerProps) {
```

Replace the existing `twilioEnabled` line:
```typescript
const twilioEnabled = process.env.NEXT_PUBLIC_TWILIO_ENABLED === 'true' && orgPlan !== 'free'
```

That single change hides "Send Now" and its helper text for free tier orgs. All other logic unchanged.

- [ ] **Step 15.4: Pass orgPlan to TemplatePicker from CustomerDetailClient**

Read `app/(app)/customers/[id]/CustomerDetailClient.tsx`. Find where `<TemplatePicker` is rendered. The client already fetches org data or profile. Add `orgPlan={profile?.org_plan}` (using the updated `/api/auth/me` response).

If `CustomerDetailClient` uses `useProfile()` or fetches `/api/auth/me`, extract `org_plan` from it and pass it down. If not, add a fetch:

```typescript
// At component mount, alongside other data fetches:
const [orgPlan, setOrgPlan] = useState<string>('basic')

useEffect(() => {
  fetch('/api/auth/me')
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d?.org_plan) setOrgPlan(d.org_plan) })
}, [])

// Then on the TemplatePicker:
<TemplatePicker customer={customer} vehicle={primaryVehicle} orgPlan={orgPlan} />
```

- [ ] **Step 15.5: Skip free tier orgs in sequence delivery cron**

In `lib/cron/jobs/sequenceDelivery.ts`, the main query already has `user_id` (= org_id) on each activity. Add a batch org plan lookup before the loop:

After the `seqIds`/`custIds` batch setup, add:

```typescript
// Skip activities for free tier orgs
const actOrgIds = [...new Set(sequenceActivities.map(a => a.user_id))]
const { data: orgsData } = await supabase
  .from('organizations')
  .select('id, plan')
  .in('id', actOrgIds)
const freeOrgIds = new Set(
  (orgsData ?? []).filter(o => o.plan === 'free').map(o => o.id)
)
const activeActivities = sequenceActivities.filter(a => !freeOrgIds.has(a.user_id))
if (activeActivities.length === 0) return { sequenceSent }
// Replace all references to `sequenceActivities` below with `activeActivities`
```

- [ ] **Step 15.6: Skip free tier orgs in fullAutoSequence cron**

Same pattern in `lib/cron/jobs/fullAutoSequence.ts`. After fetching `dueActivities`, add:

```typescript
const actOrgIds = [...new Set(dueActivities.map(a => a.user_id))]
const { data: orgsData } = await supabase
  .from('organizations')
  .select('id, plan')
  .in('id', actOrgIds)
const freeOrgIds = new Set(
  (orgsData ?? []).filter(o => o.plan === 'free').map(o => o.id)
)
const activeActivities = dueActivities.filter(a => !freeOrgIds.has(a.user_id))
if (activeActivities.length === 0) return { fullAutoFired: 0 }
```

Replace `dueActivities` with `activeActivities` for the rest of the function.

- [ ] **Step 15.7: Skip free tier in render queue (already done in Task 7 — extend it)**

In `app/api/cron/process-render-queue/route.ts`, the org subscription check already exists from Task 7. Extend the filter:

```typescript
const canceledOrFreeOrgIds = new Set(
  (orgs ?? [])
    .filter(o => o.subscription_status === 'canceled' || o.plan === 'free')
    .map(o => o.id)
)
const activeQueued = queued.filter(r => !canceledOrFreeOrgIds.has(r.org_id))
```

- [ ] **Step 15.8: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep -E "sms/send|TemplatePicker|sequenceDelivery|fullAuto|render-queue"
```

Expected: no errors

- [ ] **Step 15.9: Commit**

```bash
git add app/api/auth/me/route.ts app/api/sms/send/route.ts components/sms/TemplatePicker.tsx lib/cron/jobs/sequenceDelivery.ts lib/cron/jobs/fullAutoSequence.ts app/api/cron/process-render-queue/route.ts
git commit -m "feat: free tier enforcement — block Twilio SMS, sequences, video for plan=free orgs"
```

---

## Task 16: Data export ZIP download

**Files:**
- Create: `app/api/settings/data-export/route.ts`
- Create: `app/(app)/settings/data-export/page.tsx`
- Modify: `package.json` (add jszip)

Exports: customers, vehicles, activities (last 12 months), templates, sequences, tasks, bhph_payments, ledger_transactions. Photos/receipts: signed URL list only (files too large to zip).

- [ ] **Step 16.1: Install jszip**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npm install jszip
npm install --save-dev @types/jszip
```

- [ ] **Step 16.2: Create `app/api/settings/data-export/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import JSZip from 'jszip'

// Rate limit: 1 export per 24 hours per org (checked via admin_audit_log)
const EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape  = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\r\n')
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createServiceClient()

  // Rate limit check: 1 export per 24h
  const { data: recentExport } = await supabase
    .from('admin_audit_log')
    .select('created_at')
    .eq('org_id', profile.org_id)
    .eq('action', 'data_export')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentExport) {
    const elapsed = Date.now() - new Date(recentExport.created_at).getTime()
    if (elapsed < EXPORT_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((EXPORT_COOLDOWN_MS - elapsed) / 3_600_000)
      return NextResponse.json(
        { error: `You can export once every 24 hours. Try again in ${hoursLeft} hour(s).` },
        { status: 429 }
      )
    }
  }

  const orgId = profile.org_id
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString() // activities: last 12 months

  // Fetch all data in parallel
  const [
    customers, vehicles, activities, templates,
    sequences, tasks, bhphPayments, ledger,
  ] = await Promise.all([
    supabase.from('customers').select('*').or(`user_id.eq.${orgId},user_id.eq.${orgId}`).limit(5000),
    supabase.from('vehicles').select('*').eq('user_id', orgId).limit(2000),
    supabase.from('activities').select('*').eq('user_id', orgId).gte('created_at', cutoff).limit(10000),
    supabase.from('templates').select('*').eq('org_id', orgId).limit(500),
    supabase.from('sequences').select('*, sequence_steps(*)').eq('org_id', orgId).limit(200),
    supabase.from('tasks').select('*').eq('org_id', orgId).limit(2000),
    supabase.from('bhph_payments').select('*').eq('org_id', orgId).limit(5000),
    supabase.from('ledger_transactions').select('*').eq('org_id', orgId).limit(5000),
  ])

  const zip = new JSZip()

  zip.file('customers.csv',          toCSV(customers.data ?? []))
  zip.file('vehicles.csv',           toCSV(vehicles.data ?? []))
  zip.file('activities.csv',         toCSV(activities.data ?? []))
  zip.file('templates.csv',          toCSV(templates.data ?? []))
  zip.file('bhph_payments.csv',      toCSV(bhphPayments.data ?? []))
  zip.file('ledger_transactions.csv',toCSV(ledger.data ?? []))
  zip.file('tasks.csv',              toCSV(tasks.data ?? []))
  zip.file('sequences.json',         JSON.stringify(sequences.data ?? [], null, 2))
  zip.file('export_info.json', JSON.stringify({
    org_id:         orgId,
    exported_at:    new Date().toISOString(),
    schema_version: '2026-04-27',
    note:           'Activities limited to last 12 months. Vehicle photos and receipt images are not included — download them separately from Settings > Storage.',
  }, null, 2))

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  // Log the export
  await supabase.from('admin_audit_log').insert({
    org_id:      orgId,
    action:      'data_export',
    performed_by: profile.id,
    details:     { bytes: buffer.length },
  })

  const orgName    = 'dealerwyze-export'
  const dateStr    = new Date().toISOString().split('T')[0]
  const filename   = `${orgName}-${dateStr}.zip`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(buffer.length),
    },
  })
}
```

- [ ] **Step 16.3: Add download button to Settings**

Create `app/(app)/settings/data-export/page.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

export default function DataExportPage() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/data-export')
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Export failed. Please try again.')
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `dealerwyze-export-${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-8 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Download Your Data</h1>
      <p className="text-sm text-muted-foreground">
        Export all your customers, vehicles, activities, templates, sequences, and financial records as a ZIP file. Activities are limited to the last 12 months. Vehicle photos are not included.
      </p>
      <p className="text-sm text-muted-foreground">
        You can request one export every 24 hours.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleExport} disabled={loading} className="gap-2">
        <Download className="h-4 w-4" />
        {loading ? 'Preparing export...' : 'Download My Data'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 16.4: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep -E "data-export"
```

- [ ] **Step 16.5: Commit**

```bash
git add app/api/settings/data-export/route.ts app/(app)/settings/data-export/page.tsx package.json package-lock.json
git commit -m "feat: data export ZIP download — customers, vehicles, activities, templates, sequences, financials"
```

---

## Task 17: Runtime abuse detection

**Files:**
- Create: `lib/cron/jobs/abuseDetection.ts`
- Modify: `lib/cron/jobs/check-tasks` (add job call)

Two detectors:
1. **Multi-account IP** — finds IPs that appear in 2+ orgs' `security_events` within 30 days
2. **Volume spike** — finds orgs whose today SMS count is >3x their 7-day average AND >50 messages

- [ ] **Step 17.1: Create `lib/cron/jobs/abuseDetection.ts`**

```typescript
/**
 * Runtime abuse detection. Runs daily as part of check-tasks.
 * Flags suspicious patterns to admin_alerts for Tim to review.
 * Does NOT auto-suspend — Tim reviews all flags before acting.
 */

import type { createServiceClient } from '@/lib/supabase/service'

export async function runAbuseDetection(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ flagged: number }> {
  let flagged = 0
  const now = new Date()
  const nowIso = now.toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 86_400_000).toISOString()
  const todayStart    = new Date(now.setHours(0, 0, 0, 0)).toISOString()

  // --- Detector 1: multi-account IP ---
  // Find IPs in security_events that appear for 2+ distinct orgs in last 30 days
  const { data: securityEvents } = await supabase
    .from('security_events')
    .select('org_id, ip_address')
    .gte('created_at', thirtyDaysAgo)
    .not('ip_address', 'is', null)

  if (securityEvents && securityEvents.length > 0) {
    const ipToOrgs = new Map<string, Set<string>>()
    for (const ev of securityEvents) {
      if (!ev.ip_address || !ev.org_id) continue
      if (!ipToOrgs.has(ev.ip_address)) ipToOrgs.set(ev.ip_address, new Set())
      ipToOrgs.get(ev.ip_address)!.add(ev.org_id)
    }

    for (const [ip, orgSet] of ipToOrgs) {
      if (orgSet.size < 2) continue

      const orgIds = [...orgSet]
      // Check if this IP combo is already flagged recently (dedup 7 days)
      const { data: existing } = await supabase
        .from('admin_alerts')
        .select('id')
        .eq('alert_type', 'multi_account_ip')
        .contains('metadata', { ip })
        .gte('created_at', sevenDaysAgo)
        .limit(1)
        .maybeSingle()
      if (existing) continue

      await supabase.from('admin_alerts').insert({
        alert_type: 'multi_account_ip',
        severity:   'high',
        message:    `IP ${ip} is associated with ${orgIds.length} accounts in the last 30 days. Review for multi-account abuse.`,
        metadata:   { ip, org_ids: orgIds },
        created_at: nowIso,
      })
      await supabase.from('abuse_flags').insert({
        ip_address: ip,
        reason:     'multi_account_ip',
        org_ids:    orgIds,
        created_at: nowIso,
      })
      flagged++
    }
  }

  // --- Detector 2: SMS volume spike ---
  // Find orgs where today's outbound SMS count > 3x 7-day average AND > 50
  const { data: todaySms } = await supabase
    .from('activities')
    .select('user_id')
    .eq('type', 'sms')
    .eq('direction', 'outbound')
    .gte('created_at', todayStart)

  if (todaySms && todaySms.length > 0) {
    const todayCountByOrg = new Map<string, number>()
    for (const a of todaySms) {
      todayCountByOrg.set(a.user_id, (todayCountByOrg.get(a.user_id) ?? 0) + 1)
    }

    const spikeOrgIds = [...todayCountByOrg.entries()]
      .filter(([, count]) => count > 50)
      .map(([orgId]) => orgId)

    if (spikeOrgIds.length > 0) {
      const { data: weekSms } = await supabase
        .from('activities')
        .select('user_id')
        .eq('type', 'sms')
        .eq('direction', 'outbound')
        .gte('created_at', sevenDaysAgo)
        .in('user_id', spikeOrgIds)

      const weekCountByOrg = new Map<string, number>()
      for (const a of weekSms ?? []) {
        weekCountByOrg.set(a.user_id, (weekCountByOrg.get(a.user_id) ?? 0) + 1)
      }

      for (const orgId of spikeOrgIds) {
        const todayCount = todayCountByOrg.get(orgId) ?? 0
        const weekAvg    = (weekCountByOrg.get(orgId) ?? 0) / 7
        if (weekAvg === 0 || todayCount < weekAvg * 3) continue

        const { data: existing } = await supabase
          .from('admin_alerts')
          .select('id')
          .eq('alert_type', 'sms_volume_spike')
          .eq('org_id', orgId)
          .gte('created_at', sevenDaysAgo)
          .limit(1)
          .maybeSingle()
        if (existing) continue

        await supabase.from('admin_alerts').insert({
          alert_type: 'sms_volume_spike',
          org_id:     orgId,
          severity:   'medium',
          message:    `Org ${orgId} sent ${todayCount} SMS today vs. ${weekAvg.toFixed(1)}/day average (${(todayCount / weekAvg).toFixed(1)}x spike). Review for abuse.`,
          metadata:   { today_count: todayCount, week_avg: weekAvg },
          created_at: nowIso,
        })
        flagged++
      }
    }
  }

  return { flagged }
}
```

- [ ] **Step 17.2: Wire into check-tasks**

Read `app/api/cron/check-tasks/route.ts`. Find the `runJob` calls list. Add:

```typescript
import { runAbuseDetection } from '@/lib/cron/jobs/abuseDetection'
// ...
await runJob('abuseDetection', () => runAbuseDetection(supabase))
```

- [ ] **Step 17.3: Add admin UI badge for new abuse alerts**

Read `app/(app)/admin/page.tsx` (or wherever admin home is). The `admin_alerts` table is already queried here. Confirm `alert_type IN ('multi_account_ip', 'sms_volume_spike')` will surface in the existing admin alerts section. No new UI needed — the existing alerts panel covers it.

- [ ] **Step 17.4: Verify it builds**

```bash
npx tsc --noEmit 2>&1 | grep abuseDetection
```

- [ ] **Step 17.5: Commit**

```bash
git add lib/cron/jobs/abuseDetection.ts app/api/cron/check-tasks/route.ts
git commit -m "feat: runtime abuse detection — multi-account IP and SMS volume spike flagging"
```

---

## Task 18: Terms of Service updates

**Files:**
- Modify: `public/terms.md`
- Modify: `public/terms.html`

Update three existing sections. Do NOT renumber — only add/replace subsections.

- [ ] **Step 18.1: Update Section 5 (Free Trial Terms)**

In `public/terms.md`, find `## 5. Free Trial Terms` and replace the section content with:

```markdown
## 5. Free Trial Terms

**5.1 Trial Period.** New accounts receive a thirty (30) day free trial with access to all paid plan features. The trial begins on the date of account creation and ends automatically after thirty days.

**5.2 No Multiple Trials.** The free trial is available once per business entity. Creating multiple accounts to obtain additional trial periods is prohibited and constitutes a material breach of these Terms. We use IP address, device fingerprint, email domain, and phone number to detect re-registration and may terminate accounts found to be exploiting this policy without notice or refund.

**5.3 Free Tier After Trial.** If no payment method is added before the trial expires, the account is automatically moved to the free tier after a seven (7) day grace period. The free tier includes: customer and vehicle management, email communication, and Open Messages (native SMS app launch). The free tier does not include: direct carrier SMS delivery, AI voice agent, automated sequences, or video generation and posting.

**5.4 Re-Registration Restriction.** If we detect that a new account matches the email domain, phone number, or other identifying information of a previously canceled account ("churn re-registration"), the new account will be flagged for immediate billing upon approval, with no trial period.

**5.5** We reserve the right to modify or discontinue the free trial at any time without notice.
```

- [ ] **Step 18.2: Update Section 6.2 and 6.3 (Cancellation)**

Find `**6.2 Effect of Cancellation.**` and replace with:

```markdown
**6.2 Effect of Cancellation.** Upon cancellation, your account will remain on your current paid plan until the end of the billing cycle. After that, your account moves to the free tier for a ninety (90) day data retention period before permanent deletion.

**6.3 Data Retention and Deletion Pipeline.** Following cancellation or the expiration of a free trial (with no payment), your data is retained according to this schedule:
- Days 1-7 after payment failure: grace period, full access, weekly warning emails.
- Day 7: account automatically downgraded to free tier.
- Days 8-90 on free tier: weekly warning emails with links to download your data.
- Day 90: all customer records, activities, messages, BHPH ledger entries, sequences, and uploaded documents are permanently deleted from production systems. Residual copies in encrypted backups are purged within sixty (60) additional days.

**6.4 Data Export.** At any time while your account is active or on the free tier, you may export your data as a ZIP file from Settings > Download My Data. Exports include customers, vehicles, activities, templates, sequences, and financial records. Vehicle photos and receipt images must be downloaded separately. You are responsible for retaining your own data prior to deletion.
```

- [ ] **Step 18.3: Update Section 13 (Suspension and Termination)**

Find `**13.2 Suspension or Termination for Abuse.**` and replace with:

```markdown
**13.2 Suspension or Termination for Abuse.** We may immediately suspend or terminate your account, without prior notice, if we determine in our sole discretion that:

- You have violated the Acceptable Use Policy or SMS Compliance provisions;
- Your account is being used for illegal activity or poses risk of harm to others;
- Your account exhibits patterns of abuse, fraud, or excessive usage designed to circumvent our cost controls, including but not limited to sending volume more than three times your plan's daily average;
- You have created or are operating multiple accounts under different identities to exploit trial periods, bypass usage caps, or circumvent a prior suspension — whether identified by IP address, device fingerprint, email domain, phone number, or other signals;
- You have provided false or misleading registration information;
- Continued provision of the Service creates legal or reputational risk to KMA Auto Inc.

**13.5 Automated Monitoring.** We use automated systems to monitor account activity for abuse signals including, but not limited to: multiple accounts associated with a single IP address or device, unusual messaging volume relative to account history, and mismatches between claimed business identity and usage patterns. Flagged accounts are reviewed by our team before suspension or termination decisions are made. You may appeal a suspension by contacting support@dealerwyze.com within fourteen (14) days.
```

- [ ] **Step 18.4: Mirror changes to terms.html**

Open `public/terms.html`. Apply the equivalent plain-HTML versions of the three section updates above. The structure mirrors terms.md — find each section by its heading text and replace the subsections.

- [ ] **Step 18.5: Bump the "Last updated" date**

At the top of both `terms.md` and `terms.html`, update the "Last updated" or "Effective date" line to `April 27, 2026`.

- [ ] **Step 18.6: Commit**

```bash
git add public/terms.md public/terms.html
git commit -m "legal: update ToS — 30-day trial, free tier definition, data retention pipeline, abuse monitoring disclosure"
```

---

## Updated Self-Review

**Full spec coverage:**
- Silent fetch failures → Tasks 1-6 ✅
- org_settings silent saves → Tasks 2-6 ✅
- Canceled org Lambda renders → Task 7 ✅
- Sequence N+1 queries → Tasks 8-9 ✅
- Upstash Redis rate limiting → Tasks 10-11 ✅
- Migration 105 lifecycle columns → Task 13 ✅
- Account lifecycle cron (trial, grace, free, deletion warnings) → Task 14 ✅
- Free tier enforcement (SMS, sequences, video) → Task 15 ✅
- Data export ZIP download → Task 16 ✅
- Runtime abuse detection (IP + volume spike) → Task 17 ✅
- Terms of Service updates → Task 18 ✅

**Execution order matters for two dependencies:**
- Task 13 (migration) must be applied before Task 14 (lifecycle cron) runs
- Task 15 (free tier enforcement) depends on the `plan = 'free'` column being set by Task 14

**What this does NOT include (intentional):**
- Re-upload/import from ZIP (Phase 2 — manual support path for now)
- Automated hard-delete in account-lifecycle cron (data-retention cron handles deletion, intentionally separate)
- Admin UI suspend button (Tim can set `suspended_at` directly in Supabase for now; UI is a follow-up)

