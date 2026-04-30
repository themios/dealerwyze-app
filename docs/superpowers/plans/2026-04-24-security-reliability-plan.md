# Security, Reliability & Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all CRITICAL, HIGH, and key MEDIUM issues identified in the 4-part code audit (security, reliability, performance/TypeScript, multi-tenancy/billing/observability).

**Architecture:** Each task is a self-contained fix with its own commit. Zero refactoring — only targeted corrections. No new abstractions unless strictly required.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Twilio, Stripe, Retell

---

## Priority Groups

- **P0 — CRITICAL:** Active cost leakage or exploitable now
- **P1 — HIGH Security:** Auth/data exposure vulnerabilities
- **P2 — HIGH Reliability:** Data loss or revenue path failures
- **P3 — HIGH Performance:** Cron timeout risk, missing indexes
- **P4 — MEDIUM:** Observability, TypeScript safety, minor hardening

---

## Task 1: Plan-gate Pulse and Retention features (P0 — CRITICAL)

**Problem:** `deliverPulseSurvey()` only checks `pulse_enabled`, not plan tier. Retention cron fires for ALL orgs regardless of subscription. This sends Twilio SMS and PostGrid postcards at platform cost for free/canceled orgs.

**Files:**
- Modify: `lib/pulse/deliver.ts`
- Modify: `app/api/cron/retention-triggers/route.ts`
- Modify: `app/api/cron/send-sequences/route.ts`

- [ ] **Step 1: Gate deliverPulseSurvey on plan**

In `lib/pulse/deliver.ts`, after the `pulse_enabled` check (around line 30), add a plan check:

```typescript
// Fetch org plan
const { data: org } = await supabase
  .from('organizations')
  .select('plan, subscription_status')
  .eq('id', opts.orgId)
  .single()

if (!org || !['active', 'trialing'].includes(org.subscription_status ?? '')) {
  return { sent: false, reason: 'org_not_active' }
}
```

- [ ] **Step 2: Gate retention-triggers cron on subscription_status**

In `app/api/cron/retention-triggers/route.ts`, update the query that fetches orgs with retention_settings to join organizations and filter:

```typescript
// Replace the current retention_settings fetch with one that joins organizations
const { data: activeRetentionOrgs } = await supabase
  .from('retention_settings')
  .select('*, organizations!inner(plan, subscription_status)')
  .in('organizations.subscription_status', ['active', 'trialing'])
```

If the join syntax is not supported, do a two-step: fetch orgs with active subs, then filter retention_settings to those org IDs.

- [ ] **Step 3: Gate sequence sending on subscription_status**

In `app/api/cron/send-sequences/route.ts` (around line 188), the query that fetches due activities should join through `customer_sequences` → `customers` → `organizations`. Add a filter:

```typescript
// Add to the existing query chain:
.eq('customer_sequences.organizations.subscription_status', 'active')
```

If a direct join isn't feasible, fetch active org IDs first:

```typescript
const { data: activeOrgs } = await supabase
  .from('organizations')
  .select('id')
  .in('subscription_status', ['active', 'trialing'])
const activeOrgIds = activeOrgs?.map(o => o.id) ?? []
// then filter sequence activities by user_id in activeOrgIds
```

- [ ] **Step 4: Commit**

```bash
git add lib/pulse/deliver.ts app/api/cron/retention-triggers/route.ts app/api/cron/send-sequences/route.ts
git commit -m "fix: gate pulse/retention/sequences on active subscription status"
```

---

## Task 2: Fix OAuth CSRF — verify state parameter (P1 — CRITICAL Security)

**Problem:** `app/api/integrations/gmail/callback/route.ts` and `app/api/google/calendar-callback/route.ts` do not verify the OAuth `state` parameter. An attacker can forge a callback and inject their Gmail/Calendar tokens into any org.

**Files:**
- Modify: `app/api/integrations/gmail/callback/route.ts`
- Modify: `app/api/google/calendar-callback/route.ts`

- [ ] **Step 1: Read both callback files**

Read `app/api/integrations/gmail/callback/route.ts` and `app/api/google/calendar-callback/route.ts` to understand how they currently handle `state`.

- [ ] **Step 2: Add state verification to Gmail callback**

The `state` param should be a signed value containing `orgId` (set when initiating the OAuth flow). Add verification:

```typescript
// At the top of the GET handler, after extracting state:
const stateParam = searchParams.get('state')
if (!stateParam) {
  return NextResponse.redirect(`${origin}/settings/email?error=invalid_state`)
}

// Decode state — it should contain org_id set during initiation
let stateData: { orgId: string; csrf: string }
try {
  stateData = JSON.parse(Buffer.from(stateParam, 'base64url').toString())
} catch {
  return NextResponse.redirect(`${origin}/settings/email?error=invalid_state`)
}

// Verify the org_id in state matches the authenticated user's org
const profile = await requireProfile()  // or use the existing auth check
if (stateData.orgId !== profile.org_id) {
  return NextResponse.redirect(`${origin}/settings/email?error=state_mismatch`)
}
```

If the OAuth initiation endpoint does not currently sign state, update it to set `state = base64url(JSON.stringify({ orgId: profile.org_id, csrf: randomBytes(16).toString('hex') }))`.

- [ ] **Step 3: Apply same fix to calendar callback**

Same pattern in `app/api/google/calendar-callback/route.ts`. Read the file, identify where state is extracted, add the same validation logic.

- [ ] **Step 4: Commit**

```bash
git add app/api/integrations/gmail/callback/route.ts app/api/google/calendar-callback/route.ts
git commit -m "fix: verify OAuth state parameter in Gmail and Calendar callbacks (CSRF)"
```

---

## Task 3: Move secrets from URL query params to headers (P1 — HIGH Security)

**Problem:** `app/api/gmail/watch/route.ts` and `app/api/leads/poll/route.ts` accept secrets via `?secret=` query param. These appear in all server logs and Vercel access logs.

**Files:**
- Modify: `app/api/gmail/watch/route.ts`
- Modify: `app/api/leads/poll/route.ts`
- Modify: Any callers (cron jobs, n8n webhooks — read files to identify)

- [ ] **Step 1: Read both route files**

Read `app/api/gmail/watch/route.ts` and `app/api/leads/poll/route.ts` to see exactly how the secret is extracted and where the routes are called from.

- [ ] **Step 2: Update gmail/watch to read from Authorization header**

```typescript
// Replace:
const secret = searchParams.get('secret')

// With:
const authHeader = req.headers.get('authorization')
const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
```

Keep backwards-compat for 1 deploy cycle if needed, but prioritize header.

- [ ] **Step 3: Update leads/poll same way**

Also fix the `org_id` cross-tenant issue — `org_id` should come from the authenticated session, not the query string:

```typescript
// Remove: const orgId = searchParams.get('org_id')
// Instead, require auth and use profile.org_id, or for cron context use a validated
// service-level param that is not org-user-controllable
```

Read the file to understand the full context before modifying.

- [ ] **Step 4: Commit**

```bash
git add app/api/gmail/watch/route.ts app/api/leads/poll/route.ts
git commit -m "fix: move poll/watch secrets from URL query params to Authorization header"
```

---

## Task 4: Fix Twilio legacy fallback (P1 — HIGH Security)

**Problem:** `app/api/twilio/inbound/route.ts:75-76` — legacy fallback uses `===` (timing-unsafe) and reads secret from URL query param. `TWILIO_LEGACY_FALLBACK_ENABLED=true` in production.

**Files:**
- Modify: `app/api/twilio/inbound/route.ts`

- [ ] **Step 1: Read the file**

Read `app/api/twilio/inbound/route.ts`, focus on lines 75-76 and surrounding context.

- [ ] **Step 2: Replace === with timingSafeEqual**

```typescript
import { timingSafeEqual } from 'crypto'

// Replace:
if (fallbackSecret === process.env.TWILIO_LEGACY_SECRET) {

// With:
const expected = Buffer.from(process.env.TWILIO_LEGACY_SECRET ?? '')
const provided = Buffer.from(fallbackSecret ?? '')
const match = expected.length === provided.length &&
  timingSafeEqual(expected, provided)
if (match) {
```

- [ ] **Step 3: Move secret from query param to header**

Same pattern as Task 3 — read secret from `Authorization: Bearer <secret>` header instead of `?secret=` query param.

- [ ] **Step 4: Commit**

```bash
git add app/api/twilio/inbound/route.ts
git commit -m "fix: use timingSafeEqual and header-based secret for Twilio legacy fallback"
```

---

## Task 5: Apply timingSafeEqual to remaining 4 routes (P1 — HIGH Security)

**Problem:** `leads/ingest`, `cron/reset-billing-cycle`, `telegram/webhook`, `voice/tools` all use `!==` for secret comparison.

**Files:**
- Modify: `app/api/leads/ingest/route.ts`
- Modify: `app/api/cron/reset-billing-cycle/route.ts`
- Modify: `app/api/telegram/webhook/route.ts`
- Modify: `app/api/voice/tools/route.ts`

- [ ] **Step 1: Read all 4 files**

Identify exact lines with `!==` secret comparisons.

- [ ] **Step 2: Apply timingSafeEqual to each**

For each file, replace the pattern:

```typescript
// Before:
if (req.headers.get('x-secret') !== process.env.SOME_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// After:
import { timingSafeEqual } from 'crypto'
const provided = Buffer.from(req.headers.get('x-secret') ?? '')
const expected = Buffer.from(process.env.SOME_SECRET ?? '')
if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

- [ ] **Step 3: Add missing requireProfile() to push/subscribe**

Read `app/api/push/subscribe/route.ts` — add `const profile = await requireProfile()` as the first call in the handler and return 401 if null.

- [ ] **Step 4: Commit**

```bash
git add app/api/leads/ingest/route.ts app/api/cron/reset-billing-cycle/route.ts \
  app/api/telegram/webhook/route.ts app/api/voice/tools/route.ts \
  app/api/push/subscribe/route.ts
git commit -m "fix: timingSafeEqual for webhook secrets; add requireProfile to push/subscribe"
```

---

## Task 6: Block writes during read-only staff impersonation (P1 — HIGH Security)

**Problem:** `lib/auth/profile.ts` — staff impersonation sessions with `writeMode=false` do not block mutations at the API layer. Staff in read-only mode can still POST/PUT/PATCH/DELETE against any org's data.

**Files:**
- Modify: `lib/auth/profile.ts`

- [ ] **Step 1: Read the file**

Read `lib/auth/profile.ts`, specifically `requireProfile()` and how `writeMode` is surfaced from the staff session cookie.

- [ ] **Step 2: Add write guard in requireProfile**

After the staff session is parsed and `writeMode` is determined, add:

```typescript
// After: profile.org_id = staffSession.impersonatedOrgId
// Add:
if (staffSession && !staffSession.writeMode) {
  // Caller can check profile.readOnly to block mutations
  profile.readOnly = true
}
```

Then in each mutating route that calls `requireProfile()`, or better: create a `requireWritableProfile()` helper:

```typescript
export async function requireWritableProfile(req: NextRequest) {
  const profile = await requireProfile()
  if (!profile) return null
  if (profile.readOnly) return 'readonly' as const
  return profile
}
```

Routes using this helper return 403 when result is `'readonly'`:

```typescript
const profile = await requireWritableProfile(req)
if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (profile === 'readonly') return NextResponse.json({ error: 'Read-only session' }, { status: 403 })
```

Apply `requireWritableProfile` to all POST/PUT/PATCH/DELETE routes that currently use `requireProfile`. Read `proxy.ts` first — it may already handle some of this, in which case just verify and patch the gap.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/profile.ts
git commit -m "fix: block write mutations during read-only staff impersonation sessions"
```

---

## Task 7: Per-job error isolation in check-tasks cron (P2 — HIGH Reliability)

**Problem:** `app/api/cron/check-tasks/route.ts` calls all 16 jobs sequentially with no per-job try/catch. One failure kills all downstream jobs. `finishCronRun` is never called on error path.

**Files:**
- Modify: `app/api/cron/check-tasks/route.ts`

- [ ] **Step 1: Read the file**

Read `app/api/cron/check-tasks/route.ts` to see the current job call structure.

- [ ] **Step 2: Wrap each job call in try/catch**

Replace the bare sequential calls with:

```typescript
const results: Record<string, string> = {}

async function runJob(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results[name] = 'ok'
  } catch (err) {
    console.error(`[check-tasks] job ${name} failed:`, err)
    results[name] = err instanceof Error ? err.message : 'error'
  }
}

await runJob('receiptTasks', runReceiptTasks)
await runJob('inventoryAging', runInventoryAging)
// ... all 16 jobs
```

- [ ] **Step 3: Ensure finishCronRun is always called**

Wrap the entire job execution in try/finally:

```typescript
try {
  await runJob(...)
  // ... all jobs
} finally {
  await finishCronRun(runId, { results })
}
```

- [ ] **Step 4: Add error handling stubs to 8 zero-handling job files**

Files: `adminAlerts.ts`, `dataRetention.ts`, `dormantCustomers.ts`, `inventoryAging.ts`, `onboardingNudges.ts`, `quotaReset.ts`, `receiptTasks.ts`, `responseTimeAlerts.ts`

Each job's top-level function should have a try/catch that logs and does not rethrow (the outer `runJob` wrapper will catch, but inner errors should also be logged with context):

```typescript
export async function runAdminAlerts() {
  try {
    // existing code
  } catch (err) {
    console.error('[adminAlerts] unhandled error:', err)
    throw err  // re-throw so runJob can record it
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/check-tasks/route.ts \
  lib/cron/jobs/adminAlerts.ts lib/cron/jobs/dataRetention.ts \
  lib/cron/jobs/dormantCustomers.ts lib/cron/jobs/inventoryAging.ts \
  lib/cron/jobs/onboardingNudges.ts lib/cron/jobs/quotaReset.ts \
  lib/cron/jobs/receiptTasks.ts lib/cron/jobs/responseTimeAlerts.ts
git commit -m "fix: per-job error isolation in check-tasks cron; always call finishCronRun"
```

---

## Task 8: Add .limit() to unbounded cron table scans (P2 — HIGH Reliability)

**Problem:** `lib/cron/jobs/dormantCustomers.ts` and `lib/cron/jobs/responseTimeAlerts.ts` do full cross-tenant table scans with no `.limit()`. At scale these time out.

**Files:**
- Modify: `lib/cron/jobs/dormantCustomers.ts`
- Modify: `lib/cron/jobs/responseTimeAlerts.ts`

- [ ] **Step 1: Read both files**

Identify the unbounded queries.

- [ ] **Step 2: Add .limit() to dormantCustomers**

```typescript
// Add to the customers query:
.limit(500)
// Add a console.log if count hits the limit (signal to paginate):
if (candidates?.length === 500) {
  console.warn('[dormantCustomers] hit 500 limit — consider cursor pagination')
}
```

- [ ] **Step 3: Add .limit() to responseTimeAlerts**

Same pattern — add `.limit(200)` to the activities/customers queries and warn on limit hit.

- [ ] **Step 4: Commit**

```bash
git add lib/cron/jobs/dormantCustomers.ts lib/cron/jobs/responseTimeAlerts.ts
git commit -m "fix: add .limit() to unbounded cron table scans to prevent timeout"
```

---

## Task 9: Fix billing page — add res.ok checks (P2 — HIGH Reliability)

**Problem:** `app/(app)/settings/billing/page.tsx` — `handleSubscribe`, `handlePortal`, `handleTopup`, `load()` fetch Stripe endpoints with no `res.ok` check. Primary revenue path fails silently on Stripe errors.

**Files:**
- Modify: `app/(app)/settings/billing/page.tsx` (or the client component — read to find exact file)

- [ ] **Step 1: Read the billing page**

Read `app/(app)/settings/billing/page.tsx` and look for the client component. The handlers are likely in a `BillingClient.tsx` — read that too.

- [ ] **Step 2: Add res.ok checks to all fetch calls**

For each handler:

```typescript
const res = await fetch('/api/stripe/checkout', { method: 'POST', ... })
if (!res.ok) {
  const err = await res.json().catch(() => ({}))
  setError(err.error ?? 'Something went wrong. Please try again.')
  return
}
const data = await res.json()
```

Apply to `handleSubscribe`, `handlePortal`, `handleTopup`, and the initial `load()` call.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/settings/billing/
git commit -m "fix: add res.ok error checks to all Stripe billing page fetch calls"
```

---

## Task 10: Add cron_runs logging to data-retention and process-render-queue (P4 — Observability)

**Problem:** These two crons perform destructive/expensive operations but are not tracked in `cron_runs`, unlike all other crons.

**Files:**
- Modify: `app/api/cron/data-retention/route.ts`
- Modify: `app/api/cron/process-render-queue/route.ts`

- [ ] **Step 1: Read both files**

Confirm they are missing `startCronRun`/`finishCronRun`.

- [ ] **Step 2: Add cron_runs to data-retention**

```typescript
import { startCronRun, finishCronRun } from '@/lib/cron/cronRuns'

// At start of handler:
const runId = await startCronRun('data-retention')
try {
  // existing code
  await finishCronRun(runId, { status: 'ok' })
} catch (err) {
  await finishCronRun(runId, { status: 'error', error: String(err) })
  throw err
}
```

- [ ] **Step 3: Same for process-render-queue**

Same pattern with name `'process-render-queue'`.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/data-retention/route.ts app/api/cron/process-render-queue/route.ts
git commit -m "fix: add cron_runs tracking to data-retention and process-render-queue"
```

---

## Task 11: Add Stripe webhook success logging (P4 — Observability)

**Problem:** `app/api/stripe/webhook/route.ts` logs signature failures to `security_events` but emits nothing on successful event processing. Plan changes and payment failures are invisible in logs.

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Read the file**

Identify the `switch (event.type)` block and each case handler.

- [ ] **Step 2: Add console.info on each case branch**

```typescript
case 'checkout.session.completed':
  console.info('[stripe-webhook] checkout.session.completed', { orgId, sessionId: event.data.object.id })
  // existing handling
  break

case 'customer.subscription.updated':
  console.info('[stripe-webhook] subscription.updated', { orgId, status: event.data.object.status })
  break

// etc for all cases
```

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "fix: add structured logging to Stripe webhook event handlers"
```

---

## Task 12: Fix SMS quota fallback — block on DB error (P4 — Medium)

**Problem:** `lib/sms/quota.ts:36-37` — when the org row can't be fetched, it grants an implicit 1,500-message quota instead of blocking. A transient DB error = unlimited SMS.

**Files:**
- Modify: `lib/sms/quota.ts`

- [ ] **Step 1: Read the file**

Find the error fallback around line 36-37.

- [ ] **Step 2: Change fallback to block**

```typescript
// Replace:
return { allowed: true, remaining: 1500, ... }

// With:
console.error('[sms-quota] failed to fetch org quota, blocking send:', error)
return { allowed: false, reason: 'quota_check_failed', remaining: 0 }
```

- [ ] **Step 3: Commit**

```bash
git add lib/sms/quota.ts
git commit -m "fix: SMS quota check blocks instead of allowing on DB fetch error"
```

---

## Task 13: Add missing activities index + fix N+1 in top cron jobs (P3 — HIGH Performance)

**Problem:**
1. No index on `activities(user_id, created_at)` — reports page does seq-scan
2. N+1 queries in `sequenceDelivery.ts`, `fullAutoSequence.ts`, `reviewRequests.ts`, `inventoryAging.ts`

**Files:**
- Create: `supabase/migrations/101_activities_created_at_index.sql`
- Modify: `lib/cron/jobs/reviewRequests.ts`
- Modify: `lib/cron/jobs/inventoryAging.ts`

Note: `sequenceDelivery.ts` and `fullAutoSequence.ts` N+1 fixes are more complex — address in a follow-up task to avoid breaking the sequence engine.

- [ ] **Step 1: Create migration for missing index**

```sql
-- supabase/migrations/101_activities_created_at_index.sql
CREATE INDEX IF NOT EXISTS idx_activities_user_created
  ON activities(user_id, created_at DESC);
```

- [ ] **Step 2: Fix inventoryAging N+1**

Read `lib/cron/jobs/inventoryAging.ts`. Before the loop, batch-load existing open `inventory_review` tasks:

```typescript
// Before the threshold loop:
const vehicleIds = agedVehicles.map(v => v.id)
const { data: existingTasks } = await supabase
  .from('tasks')
  .select('linked_vehicle_id')
  .eq('type', 'inventory_review')
  .eq('status', 'open')
  .in('linked_vehicle_id', vehicleIds)

const hasTaskSet = new Set(existingTasks?.map(t => t.linked_vehicle_id) ?? [])

// In the loop, replace the DB lookup with:
if (hasTaskSet.has(vehicle.id)) continue
```

- [ ] **Step 3: Fix reviewRequests N+1**

Read `lib/cron/jobs/reviewRequests.ts`. Group tasks by `user_id`. Per org, load `profiles` + `org_settings` once. Batch-load customers and activities using `.in()`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/101_activities_created_at_index.sql \
  lib/cron/jobs/reviewRequests.ts lib/cron/jobs/inventoryAging.ts
git commit -m "perf: add activities(user_id, created_at) index; fix N+1 in reviewRequests and inventoryAging"
```

- [ ] **Step 5: Apply migration**

Tell user: Apply `101_activities_created_at_index.sql` in Supabase SQL editor.

---

## Task 14: Fix Stripe routes user! non-null assertion (P3 — TypeScript Safety)

**Problem:** `stripe/checkout/route.ts`, `stripe/video-pack/route.ts`, `stripe/overage-topup/route.ts` — `user!.email` crashes with TypeError if session expires between requireProfile and getUser.

**Files:**
- Modify: `app/api/stripe/checkout/route.ts`
- Modify: `app/api/stripe/video-pack/route.ts`
- Modify: `app/api/stripe/overage-topup/route.ts`

- [ ] **Step 1: Read all 3 files**

Find the `user!.email` patterns.

- [ ] **Step 2: Add null guard after getUser()**

```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// now use user.email safely (no !)
```

- [ ] **Step 3: Commit**

```bash
git add app/api/stripe/checkout/route.ts app/api/stripe/video-pack/route.ts \
  app/api/stripe/overage-topup/route.ts
git commit -m "fix: guard against null user after getUser() in Stripe checkout routes"
```

---

## Task 15: Fix retell-callback any type + appointmentRemindersV2 any casts (P4 — TypeScript)

**Problem:** `voice/retell-callback/route.ts:80` — `let payload: any` for webhook JSON. `appointmentRemindersV2.ts:45-47` — `(cust as any).name` etc.

**Files:**
- Modify: `app/api/voice/retell-callback/route.ts`
- Modify: `lib/cron/jobs/appointmentRemindersV2.ts`

- [ ] **Step 1: Type the Retell callback payload**

In `retell-callback/route.ts`, define:

```typescript
interface RetellCallbackPayload {
  event: string
  call: {
    call_id: string
    from_number: string
    to_number: string
    start_timestamp?: number
    end_timestamp?: number
    transcript?: string
    call_analysis?: {
      call_summary?: string
      user_sentiment?: string
      call_successful?: boolean
      custom_analysis_data?: Record<string, unknown>
    }
  }
}

// Replace: let payload: any = await req.json()
// With:
const payload = await req.json() as RetellCallbackPayload
```

- [ ] **Step 2: Fix appointmentRemindersV2 cust cast**

```typescript
// Define type for the joined customer:
type CustRow = { name: string; primary_phone: string | null; email: string | null }

// After the Array.isArray check:
const cust = (Array.isArray(appt.customer) ? appt.customer[0] : appt.customer) as CustRow | null
if (!cust) continue

// Now use cust.name, cust.primary_phone, cust.email directly (no as any)
```

- [ ] **Step 3: Commit**

```bash
git add app/api/voice/retell-callback/route.ts lib/cron/jobs/appointmentRemindersV2.ts
git commit -m "fix: replace any types with proper interfaces in retell-callback and appointmentRemindersV2"
```

---

## Task 16: Add user deactivation audit log entry (P4 — Observability)

**Problem:** `app/api/admin/users/route.ts` DELETE handler deactivates users with no entry in `admin_audit_log`.

**Files:**
- Modify: `app/api/admin/users/route.ts`

- [ ] **Step 1: Read the file**

Find the DELETE handler and the deactivation logic.

- [ ] **Step 2: Add audit log entry after successful deactivation**

```typescript
// After: await supabase.from('profiles').update({ deactivated_at: new Date().toISOString() }).eq('id', id)
await supabase.from('admin_audit_log').insert({
  action: 'user_deactivated',
  admin_user_id: adminProfile.id,
  target_org_id: targetProfile.org_id,
  details: { deactivated_user_id: id, deactivated_user_email: targetProfile.email }
})
```

- [ ] **Step 3: Fix impersonation end event missing org_id**

In `app/api/admin/impersonate/route.ts` DELETE handler, read the staff session cookie before clearing it and populate `target_org_id`:

```typescript
// Before clearing cookie, read the current impersonated org:
const staffSession = getStaffSessionInfo(req)  // or however it's read
// Then in the audit insert:
target_org_id: staffSession?.impersonatedOrgId ?? null
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/users/route.ts app/api/admin/impersonate/route.ts
git commit -m "fix: audit log user deactivation; fix impersonation end event missing org_id"
```

---

## Task 17: Add rate limiting to registration endpoint (P1 — HIGH Security)

**Problem:** `app/api/auth/register/route.ts` has no rate limiting. Attackers can spam account creation, exhausting Supabase auth seats and sending welcome emails.

**Files:**
- Modify: `app/api/auth/register/route.ts`

- [ ] **Step 1: Read the file**

Read `app/api/auth/register/route.ts` and `app/api/leads/web/route.ts` to understand the existing in-process rate limiting pattern.

- [ ] **Step 2: Add IP-based rate limit at top of handler**

```typescript
import { ipRateLimit } from '@/lib/rateLimit'  // or copy the pattern from leads/web

// At the top of the POST handler:
const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
const limited = ipRateLimit(ip, { windowMs: 3600_000, max: 5 })
if (limited) {
  return NextResponse.json(
    { error: 'Too many registration attempts. Please try again later.' },
    { status: 429 }
  )
}
```

If `lib/rateLimit.ts` does not exist, implement the same in-process Map pattern used in `leads/web/route.ts` directly in the register route file.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/register/route.ts
git commit -m "fix: add IP rate limiting to registration endpoint (5/hour per IP)"
```

---

## Task 18: Remove V1 appointment reminders (dead code causing duplicate SMS)

**Problem:** `lib/cron/jobs/appointmentReminders.ts` (V1) is deprecated and imported alongside V2 in `check-tasks/route.ts`. Customers receive duplicate reminder SMS messages.

**Files:**
- Modify: `app/api/cron/check-tasks/route.ts`
- Delete: `lib/cron/jobs/appointmentReminders.ts`

- [ ] **Step 1: Verify V2 is stable**

Check git log for `appointmentRemindersV2.ts` — confirm it has been running 30+ days (first commit was before 2026-03-25).

- [ ] **Step 2: Remove V1 import from check-tasks**

In `app/api/cron/check-tasks/route.ts`:
- Remove: `import { runAppointmentReminders } from './jobs/appointmentReminders'`
- Remove: the `await runJob('appointmentReminders', runAppointmentReminders)` call (or equivalent)

- [ ] **Step 3: Delete V1 file**

```bash
rm lib/cron/jobs/appointmentReminders.ts
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/check-tasks/route.ts
git rm lib/cron/jobs/appointmentReminders.ts
git commit -m "fix: remove deprecated V1 appointment reminders to stop duplicate SMS"
```

---

## Execution Order

Run tasks in this order to minimize risk:

| Order | Task | Priority | Risk |
|-------|------|----------|------|
| 1 | Task 1: Plan-gate Pulse/Retention | P0 | Low — adds checks only |
| 2 | Task 12: SMS quota block on error | P4 | Very low |
| 3 | Task 9: Billing res.ok checks | P2 | Low |
| 4 | Task 10: cron_runs for 2 crons | P4 | Low |
| 5 | Task 11: Stripe webhook logging | P4 | Very low |
| 6 | Task 7: check-tasks error isolation | P2 | Low |
| 7 | Task 8: unbounded scan limits | P2 | Low |
| 8 | Task 13: activities index + N+1 fixes | P3 | Low (index is additive) |
| 9 | Task 14: Stripe user! null guard | P3 | Low |
| 10 | Task 15: TypeScript any fixes | P4 | Very low |
| 11 | Task 16: Audit log deactivation | P4 | Very low |
| 12 | Task 18: Remove V1 reminders | P2 | Low (V2 confirmed stable) |
| 13 | Task 2: OAuth CSRF state verify | P1 | Medium — test OAuth flow |
| 14 | Task 3: Secrets from URL to header | P1 | Medium — verify callers |
| 15 | Task 4: Twilio legacy fallback | P1 | Medium — test SMS inbound |
| 16 | Task 5: timingSafeEqual remaining | P1 | Low |
| 17 | Task 6: Read-only impersonation | P1 | Medium — test staff login |
| 18 | Task 17: Registration rate limit | P1 | Low |

---

## ── NEW TASKS FROM EXTENDED AUDITS (6 additional audit passes) ──

---

## Task 19: Fix critical CVEs — dependency upgrades (P0 — CRITICAL)

**Problem:**
- `protobufjs <7.5.5` via `googleapis` — arbitrary code execution (GHSA-xq3m-2v4x-88gg)
- `loader-utils 2.0.0–2.0.3` via `@remotion/bundler` — prototype pollution (GHSA-76p3-8jx3-jpfq)
- `next 16.1.6` hard-pinned — CSRF bypass on Server Actions, HTTP request smuggling, DoS (must be manually bumped, won't auto-update)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update googleapis (fixes protobufjs critical)**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npm update googleapis
```

Verify: `npm audit | grep protobufjs` — should be clean.

- [ ] **Step 2: Update all Remotion packages (fixes loader-utils critical)**

In `package.json`, change all `@remotion/*` versions from `^4.0.441` to `^4.0.452`:

```json
"@remotion/bundler": "^4.0.452",
"@remotion/cli": "^4.0.452",
"@remotion/lambda": "^4.0.452",
"@remotion/lambda-client": "^4.0.452",
"@remotion/player": "^4.0.452",
"@remotion/renderer": "^4.0.452"
```

Then run: `npm install`

- [ ] **Step 3: Upgrade Next.js to 16.2.4**

In `package.json`, change `"next": "16.1.6"` to `"next": "16.2.4"`.

```bash
npm install
npm run build
```

Verify build passes. Next.js is hard-pinned so this is a manual step.

- [ ] **Step 4: Run npm update for remaining auto-fixable issues**

```bash
npm update nodemailer imapflow mailparser express-rate-limit path-to-regexp flatted brace-expansion
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix: upgrade dependencies — critical CVEs in protobufjs, loader-utils; Next.js 16.2.4"
```

---

## Task 20: Remove unused packages (P3 — Bundle/Maintenance)

**Problem:**
- `kokoro-js` — zero imports in codebase, 100MB+ install weight, browser TTS library never wired up
- `@remotion/player` — not imported anywhere; Lambda-only render pipeline doesn't need browser player

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts` (remove from serverExternalPackages if listed)

- [ ] **Step 1: Confirm no imports**

```bash
grep -r "kokoro-js\|@remotion/player" /home/tim/Applications/ApolloCRM/apollo-crm/app /home/tim/Applications/ApolloCRM/apollo-crm/lib /home/tim/Applications/ApolloCRM/apollo-crm/components --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Expected: zero results.

- [ ] **Step 2: Remove packages**

```bash
npm uninstall kokoro-js @remotion/player
```

- [ ] **Step 3: Remove from serverExternalPackages if present**

Read `next.config.ts` — if `@remotion/player` is in `serverExternalPackages`, remove it.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "chore: remove unused kokoro-js and @remotion/player packages"
```

---

## Task 21: Database schema — missing indexes + CASCADE fixes + CHECK constraints (P3)

**Problem:**
- 6 missing composite indexes causing slow cron queries and dashboard loads
- 3 FK relationships missing `ON DELETE CASCADE/SET NULL` — customer deletes will error with RESTRICT violations
- 2 missing/stale CHECK constraints on `organizations.plan` and `activities.type`

**Files:**
- Create: `supabase/migrations/102_schema_constraints.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/102_schema_constraints.sql

-- Missing composite indexes
CREATE INDEX IF NOT EXISTS idx_cseq_customer_status
  ON customer_sequences(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_activities_customer_type
  ON activities(customer_id, type);

CREATE INDEX IF NOT EXISTS idx_tasks_vehicle_type_status
  ON tasks(linked_vehicle_id, task_type, status)
  WHERE linked_vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bhph_payments_customer_date
  ON bhph_payments(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_renders_org_status
  ON video_renders(org_id, status);

CREATE INDEX IF NOT EXISTS idx_pulse_surveys_customer_date
  ON pulse_surveys(customer_id, created_at DESC);

-- Fix CASCADE gaps (customer deletes currently blocked by RESTRICT)
ALTER TABLE bhph_payments
  DROP CONSTRAINT IF EXISTS bhph_payments_customer_id_fkey,
  ADD CONSTRAINT bhph_payments_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_sold_to_customer_id_fkey,
  ADD CONSTRAINT vehicles_sold_to_customer_id_fkey
    FOREIGN KEY (sold_to_customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE payment_reminder_log
  DROP CONSTRAINT IF EXISTS payment_reminder_log_customer_id_fkey,
  ADD CONSTRAINT payment_reminder_log_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- Fix stale activities.type CHECK (add fax, sequence types)
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check
  CHECK (type IN ('call','sms','email','note','task','appointment','fax','sequence','voicemail'));

-- Add missing CHECK on organizations.plan
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS chk_organizations_plan;
ALTER TABLE organizations ADD CONSTRAINT chk_organizations_plan
  CHECK (plan IN ('trial','starter','growth','pro','active','canceled','paused'));
```

- [ ] **Step 2: Commit the migration file**

```bash
git add supabase/migrations/102_schema_constraints.sql
git commit -m "db: add 6 missing indexes, fix 3 CASCADE gaps, add CHECK constraints (migration 102)"
```

- [ ] **Step 3: Tell user to apply migration**

Apply `102_schema_constraints.sql` in Supabase SQL editor.

---

## Task 22: API surface hardening — requireProfile gaps + 200-on-error + error leaks (P1)

**Problem:**
- `leads/sync/route.ts` and `push/subscribe/route.ts` use raw `getUser()` instead of `requireProfile()` — no deactivation check, no org_id guarantee
- `tasks/count/route.ts` and `admin/alerts/route.ts` return HTTP 200 with zeroed data on DB error — callers can't detect failures
- 22 routes leak raw Supabase error messages (constraint names, column names) — top 5: receipts/categories, receipts/ledger, tasks, integrations/email, contacts

**Files:**
- Modify: `app/api/leads/sync/route.ts`
- Modify: `app/api/push/subscribe/route.ts`
- Modify: `app/api/tasks/count/route.ts`
- Modify: `app/api/admin/alerts/route.ts`
- Modify (top 5 error leak files): `app/api/receipts/categories/[id]/route.ts`, `app/api/receipts/ledger/[id]/route.ts`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/integrations/email/[id]/route.ts`

- [ ] **Step 1: Fix leads/sync — replace getUser() with requireProfile()**

Read `app/api/leads/sync/route.ts`. Replace the manual `getUser()` + profile fetch pattern with:

```typescript
import { requireProfile } from '@/lib/auth/profile'
const profile = await requireProfile()
if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

Remove the manual `.from('profiles').select(...).single()` call that follows.

- [ ] **Step 2: Fix push/subscribe — add requireProfile()**

Read `app/api/push/subscribe/route.ts`. Add `requireProfile()` as first call. Replace `user.id` references with `profile.id` and add `profile.org_id` to any insert that needs org scoping.

- [ ] **Step 3: Fix tasks/count — return 500 on error**

```typescript
// Replace:
if (error) return NextResponse.json({ count: 0 })
// With:
if (error) return NextResponse.json({ error: 'Failed to fetch count' }, { status: 500 })
```

- [ ] **Step 4: Fix admin/alerts — return 500 on error**

Same pattern in `app/api/admin/alerts/route.ts`:

```typescript
if (error) return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
```

- [ ] **Step 5: Fix top 5 raw error message leaks**

For each of the 5 files listed above, replace all occurrences of:

```typescript
return NextResponse.json({ error: error.message }, { status: 500 })
```

With:

```typescript
console.error('[route-name] db error:', error)
return NextResponse.json({ error: 'Database error' }, { status: 500 })
```

Read each file to find exact lines before editing.

- [ ] **Step 6: Commit**

```bash
git add app/api/leads/sync/route.ts app/api/push/subscribe/route.ts \
  app/api/tasks/count/route.ts app/api/admin/alerts/route.ts \
  app/api/receipts/categories/\[id\]/route.ts app/api/receipts/ledger/\[id\]/route.ts \
  app/api/tasks/route.ts app/api/tasks/\[id\]/route.ts \
  app/api/integrations/email/\[id\]/route.ts
git commit -m "fix: requireProfile in leads/sync + push/subscribe; 500 on DB error; sanitize error leaks"
```

---

## Task 23: Replace xlsx with exceljs (P1 — no upstream fix exists)

**Problem:** `xlsx` (SheetJS community edition) has permanent unfixed CVEs — prototype pollution + ReDoS. No upstream fix will ever be published. Used in 5 files.

**Files:**
- Modify: `lib/leads/spreadsheetImport.ts`
- Modify: `app/api/export/route.ts`
- Modify: `app/api/leads/import/route.ts`
- Modify: `components/leads/ImportLeadsDialog.tsx`
- Modify: `components/settings/ExportDataButton.tsx`

- [ ] **Step 1: Install exceljs**

```bash
npm install exceljs
npm uninstall xlsx
```

- [ ] **Step 2: Read all 5 files using xlsx**

Understand what operations are used: likely `XLSX.read()`, `XLSX.utils.sheet_to_json()`, `XLSX.write()`, `XLSX.utils.aoa_to_sheet()`.

- [ ] **Step 3: Rewrite spreadsheetImport.ts with exceljs**

`exceljs` API equivalent:

```typescript
import ExcelJS from 'exceljs'

// Reading:
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(buffer)
const sheet = workbook.worksheets[0]
const rows: string[][] = []
sheet.eachRow(row => rows.push(row.values as string[]))

// Writing:
const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('Export')
sheet.addRow(['Column1', 'Column2'])
data.forEach(row => sheet.addRow([row.col1, row.col2]))
const buffer = await workbook.xlsx.writeBuffer()
```

- [ ] **Step 4: Update remaining 4 files**

Apply the same exceljs API substitutions in the export route and UI components.

- [ ] **Step 5: Test import/export flows**

Verify a CSV/XLSX import round-trips correctly: upload a test spreadsheet, confirm rows parse, confirm export generates valid .xlsx.

- [ ] **Step 6: Commit**

```bash
git add lib/leads/spreadsheetImport.ts app/api/export/route.ts app/api/leads/import/route.ts \
  components/leads/ImportLeadsDialog.tsx components/settings/ExportDataButton.tsx \
  package.json package-lock.json
git commit -m "fix: replace xlsx (unfixable CVEs) with exceljs for spreadsheet import/export"
```

---

## Task 24: Frontend performance — font loading + compress public images (P3)

**Problem:**
- 5 fonts loaded globally in `app/layout.tsx` — Lora and Oswald only apply to 2 of 6 theme presets (classic/bold). All users download fonts they may never need.
- `public/DealerWyseLogoWithName.png` and `public/og.png` are 456KB each — favicon/OG image should be <50KB.

**Files:**
- Modify: `app/layout.tsx`
- Modify: `lib/theme/getOrgTheme.ts` (inject font link tags per org instead of globally)
- Replace: `public/DealerWyseLogoWithName.png` and `public/og.png` with compressed versions

- [ ] **Step 1: Remove Lora and Oswald from root layout**

Read `app/layout.tsx`. Remove the Lora and Oswald `next/font` imports. These are currently applied via CSS classes `.font-style-classic` and `.font-style-bold` in `globals.css`.

- [ ] **Step 2: Load Lora/Oswald via dynamic CSS injection in theme system**

In `lib/theme/getOrgTheme.ts`, when `fontStyle === 'classic'` or `fontStyle === 'bold'`, append a `<link>` tag to the style tag output pointing to the Google Fonts URL:

```typescript
// In buildThemeStyleTag or getOrgTheme:
const fontLink = fontStyle === 'classic'
  ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600&display=swap" rel="stylesheet">'
  : fontStyle === 'bold'
  ? '<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap" rel="stylesheet">'
  : ''
```

Return this as part of the theme injection so it's only loaded for orgs that selected those fonts.

- [ ] **Step 3: Compress public images**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm/public
# Check if pngquant or squoosh-cli is available
which pngquant || npm install -g @squoosh/cli
# Compress the two large PNGs (target <100KB)
pngquant --quality=65-85 --output DealerWyseLogoWithName-compressed.png DealerWyseLogoWithName.png
pngquant --quality=65-85 --output og-compressed.png og.png
# Review file sizes, then rename if acceptable
```

If CLI tools not available, note the files for manual compression and move on.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx lib/theme/getOrgTheme.ts public/
git commit -m "perf: lazy-load Lora/Oswald fonts per org theme; compress large public PNGs"
```

---

## Task 25: Critical accessibility fixes — ARIA labels, unlabeled inputs, custom dropdowns (P3)

**Problem:**
- VoiceRecorder icon-only buttons have no `aria-label` — screen readers announce "button" with no purpose
- CustomerDetailClient has multiple raw `<input>` elements with no label association
- Filter pills in CustomersListClient missing `aria-pressed`
- Analytics tables missing `scope="col"` on `<th>` elements

Deferred (larger refactor): Custom dropdown ARIA in NewLeadCard, LeadStateSelector — these require converting to shadcn Select/Popover; track in enhancements.md.

**Files:**
- Modify: `components/call/VoiceRecorder.tsx`
- Modify: `app/(app)/customers/[id]/CustomerDetailClient.tsx`
- Modify: `components/customer/CustomersListClient.tsx`
- Modify: `app/(app)/analytics/ReportsClient.tsx` (or wherever the analytics tables live)

- [ ] **Step 1: Fix VoiceRecorder icon button labels**

Read `components/call/VoiceRecorder.tsx` lines ~154-158. Add `aria-label` to Play/Pause and Discard buttons:

```tsx
<Button size="icon" aria-label={playing ? "Pause voice note" : "Play voice note"}>
  <PlayIcon />
</Button>
<Button size="icon" aria-label="Discard voice note">
  <Trash2 />
</Button>
```

- [ ] **Step 2: Fix unlabeled inputs in CustomerDetailClient**

Read `app/(app)/customers/[id]/CustomerDetailClient.tsx` lines ~532, 539, 609, 785. Add `aria-label` to each raw `<input>`:

```tsx
<input aria-label="Appointment date" type="date" ... />
<input aria-label="Appointment time" type="time" ... />
<input aria-label="Snooze until date" type="date" ... />
<input aria-label="Type DELETE to confirm" ... />
```

- [ ] **Step 3: Add aria-pressed to filter pills in CustomersListClient**

Read `components/customer/CustomersListClient.tsx` lines ~340-358. For each status filter button add:

```tsx
<Button aria-pressed={statusFilter === opt} ...>
```

- [ ] **Step 4: Add scope="col" to analytics table headers**

Read `app/(app)/analytics/ReportsClient.tsx`. For each `<th>` in table heads add `scope="col"`:

```tsx
<th scope="col">Rep Name</th>
<th scope="col">Leads</th>
```

- [ ] **Step 5: Add aria-hidden to decorative billing icons**

Read `app/(app)/settings/billing/page.tsx` lines ~142-143. Add `aria-hidden="true"` to the CheckCircle/AlertCircle icons.

- [ ] **Step 6: Commit**

```bash
git add components/call/VoiceRecorder.tsx \
  app/\(app\)/customers/\[id\]/CustomerDetailClient.tsx \
  components/customer/CustomersListClient.tsx \
  app/\(app\)/analytics/ReportsClient.tsx \
  app/\(app\)/settings/billing/
git commit -m "a11y: add aria-labels to icon buttons, label inputs, aria-pressed to filters, scope to th"
```

---

## Task 26: Set up testing infrastructure + critical unit tests (P2)

**Problem:** Zero tests exist. No CI. No test runner configured. Critical paths — Stripe webhook, requireProfile, validateCronAuth, data retention, SMS quota — are completely untested.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add test script)
- Create: `lib/utils/__tests__/utils.test.ts`
- Create: `lib/cron/__tests__/validateCronAuth.test.ts`
- Create: `lib/sms/__tests__/quota.test.ts`
- Create: `lib/auth/__tests__/profile.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 3: Add test script to package.json**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Write utils unit tests (pure functions, no mocks needed)**

```typescript
// lib/utils/__tests__/utils.test.ts
import { describe, it, expect } from 'vitest'
import { shouldShowAddressedActivity, leadIsStale, leadAgeBadge } from '../utils'

describe('shouldShowAddressedActivity', () => {
  it('returns true if no addressed_at', () => {
    expect(shouldShowAddressedActivity({ addressed_at: null, due_at: null })).toBe(true)
  })
  it('returns false if addressed today', () => {
    const today = new Date().toISOString()
    expect(shouldShowAddressedActivity({ addressed_at: today, due_at: null })).toBe(false)
  })
  it('returns true if addressed yesterday and no due_at', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    expect(shouldShowAddressedActivity({ addressed_at: yesterday, due_at: null })).toBe(true)
  })
})

describe('leadIsStale', () => {
  it('returns false for a lead created today', () => {
    expect(leadIsStale(new Date().toISOString())).toBe(false)
  })
  it('returns true for a lead created 15+ days ago', () => {
    const old = new Date(Date.now() - 16 * 86400000).toISOString()
    expect(leadIsStale(old)).toBe(true)
  })
})
```

- [ ] **Step 5: Write validateCronAuth unit tests**

```typescript
// lib/cron/__tests__/validateCronAuth.test.ts
import { describe, it, expect } from 'vitest'
import { validateCronAuth } from '../validateCronAuth'

const secret = 'test-secret-32-chars-long-enough'
process.env.CRON_SECRET = secret

function makeReq(header: Record<string, string>) {
  return { headers: { get: (k: string) => header[k] ?? null } } as any
}

describe('validateCronAuth', () => {
  it('accepts valid Bearer token', () => {
    expect(validateCronAuth(makeReq({ authorization: `Bearer ${secret}` }))).toBe(true)
  })
  it('rejects wrong token', () => {
    expect(validateCronAuth(makeReq({ authorization: 'Bearer wrong' }))).toBe(false)
  })
  it('rejects missing header', () => {
    expect(validateCronAuth(makeReq({}))).toBe(false)
  })
})
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

All tests should pass.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json lib/utils/__tests__/ lib/cron/__tests__/
git commit -m "test: add Vitest infrastructure + unit tests for utils and validateCronAuth"
```

---

## Updated Execution Order

Run all tasks in this order (new tasks inserted by priority):

| Order | Task | Priority | Risk |
|-------|------|----------|------|
| 1 | Task 19: Critical CVE upgrades | P0 | Low — npm updates |
| 2 | Task 20: Remove unused packages | P3 | Very low |
| 3 | Task 1: Plan-gate Pulse/Retention | P0 | Low — adds checks only |
| 4 | Task 12: SMS quota block on error | P4 | Very low |
| 5 | Task 21: DB schema migration 102 | P3 | Low — additive |
| 6 | Task 22: API surface hardening | P1 | Low |
| 7 | Task 9: Billing res.ok checks | P2 | Low |
| 8 | Task 10: cron_runs for 2 crons | P4 | Low |
| 9 | Task 11: Stripe webhook logging | P4 | Very low |
| 10 | Task 7: check-tasks error isolation | P2 | Low |
| 11 | Task 8: unbounded scan limits | P2 | Low |
| 12 | Task 13: activities index + N+1 fixes | P3 | Low |
| 13 | Task 14: Stripe user! null guard | P3 | Low |
| 14 | Task 15: TypeScript any fixes | P4 | Very low |
| 15 | Task 16: Audit log deactivation | P4 | Very low |
| 16 | Task 18: Remove V1 reminders | P2 | Low |
| 17 | Task 23: Replace xlsx with exceljs | P1 | Medium — test import/export |
| 18 | Task 24: Font loading + image compression | P3 | Low |
| 19 | Task 25: Accessibility fixes | P3 | Very low |
| 20 | Task 26: Testing infrastructure | P2 | Low |
| 21 | Task 2: OAuth CSRF state verify | P1 | Medium — test OAuth flow |
| 22 | Task 3: Secrets from URL to header | P1 | Medium — verify callers |
| 23 | Task 4: Twilio legacy fallback | P1 | Medium — test SMS inbound |
| 24 | Task 5: timingSafeEqual remaining | P1 | Low |
| 25 | Task 6: Read-only impersonation | P1 | Medium — test staff login |
| 26 | Task 17: Registration rate limit | P1 | Low |

---

## Post-Implementation

After all tasks complete:
1. Apply migrations `101_activities_created_at_index.sql` and `102_schema_constraints.sql` in Supabase SQL editor
2. Smoke test: OAuth flow (Gmail + Calendar), Twilio inbound SMS, Stripe checkout, staff impersonation, sequence sending, pulse survey delivery, spreadsheet import/export
3. Update `docs/enhancements.md` with completed items
4. Update `MEMORY.md`
