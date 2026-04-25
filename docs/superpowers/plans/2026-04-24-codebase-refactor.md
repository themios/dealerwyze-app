# Codebase Refactor — Readability & Maintainability Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eight code-quality issues identified in the 2026-04-24 graphify audit so any programmer can open this codebase and understand it without tribal knowledge.

**Architecture:** Each task is fully self-contained — one issue at a time, committed separately. Tasks are ordered safest-first (delete dead code → consolidate helpers → add new helpers → split large files). No task changes business logic; every change is a pure restructure.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Tailwind v4, shadcn/ui. No unit test framework — verification uses `npx tsc --noEmit` (type check) and `npm run build` (full build). Manual browser smoke tests listed per task.

---

## How to verify after EVERY task

Before moving on, always run both:

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit
```
Expected: zero errors.

```bash
npm run build
```
Expected: "✓ Compiled successfully" with zero errors (warnings are OK).

If either command fails, the task is NOT done. Fix before committing.

---

## Task 1: Delete dead `reports/ReportsClient.tsx`

**What:** `app/(app)/reports/ReportsClient.tsx` is byte-for-byte identical to `app/(app)/analytics/ReportsClient.tsx`. The `/reports` page already redirects to `/analytics`. The file in `reports/` is never imported by anything.

**Risk:** Zero. Confirmed with `diff` (empty output) and `grep` (no imports).

**Files:**
- Delete: `app/(app)/reports/ReportsClient.tsx`

---

- [ ] **Step 1: Confirm nothing imports the file**

```bash
grep -rn "reports/ReportsClient" --include="*.ts" --include="*.tsx" .
```
Expected: zero matches. If any matches appear, do NOT delete — investigate first.

- [ ] **Step 2: Delete the file**

```bash
rm "app/(app)/reports/ReportsClient.tsx"
```

- [ ] **Step 3: Type check + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: both pass with zero errors.

- [ ] **Step 4: Smoke test**

Navigate to `/reports` in the browser → should redirect to `/analytics`. The Analytics page should load normally with both tabs.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete dead reports/ReportsClient.tsx (identical copy of analytics version)"
```

---

## Task 2: Consolidate `normalizePhone` into `lib/utils/phone.ts`

**What:** The same phone-normalization logic is copy-pasted in 7 files. One canonical function replaces all of them.

**Important nuance — two return types exist:**
- 6 of 7 files return `string` (always returns digits, may be empty string)
- `lib/leads/parseLabeledPaste.ts` returns `string | null` (returns null if not 10 digits)

The new shared function returns `string`. The one caller that needs `string | null` will wrap it: `normalizePhone(val) || null`.

**Canonical behavior** (matches the majority + most correct):
```
strip all non-digits
if 11 digits starting with "1" → drop the leading 1 (US country code)
return up to 10 digits
```

Note: `app/api/auth/register/route.ts` currently uses `digits.slice(-10)` (takes last 10 digits). That is slightly different and arguably more lenient. The new canonical version (`digits.slice(0, 10)`) is more strict — this is intentional and correct for phone dedup.

**Files:**
- Create: `lib/utils/phone.ts`
- Modify: `app/api/leads/paste/route.ts` (lines 12-15 — remove local def, add import)
- Modify: `lib/leads/ingest.ts` (lines 25-28 — remove local def, add import)
- Modify: `lib/voice/ingest.ts` (lines 8-11 — remove local def, add import)
- Modify: `app/api/twilio/inbound/route.ts` (lines 55-58 — remove local def, add import)
- Modify: `app/api/auth/register/route.ts` (lines 15-18 — remove local def, add import)
- Modify: `lib/leads/parseLabeledPaste.ts` (lines 39-46 — remove local def, add import + null wrapper)
- Modify: `lib/leads/spreadsheetImport.ts` (lines 82-87 — remove local def, add import)

---

- [ ] **Step 1: Create `lib/utils/phone.ts`**

```typescript
/**
 * Strips a raw phone string to its 10 US digits.
 * Drops leading "1" country code if present (11-digit input).
 * Returns an empty string if the input has no recognizable digits.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits.slice(0, 10)
}
```

- [ ] **Step 2: Update `app/api/leads/paste/route.ts`**

Remove lines 12-15 (the local `normalizePhone` function definition):
```typescript
function normalizePhone(p: string): string {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}
```

Add to the imports at the top of the file (after existing imports):
```typescript
import { normalizePhone } from '@/lib/utils/phone'
```

- [ ] **Step 3: Update `lib/leads/ingest.ts`**

Remove lines 25-28 (the local `normalizePhone` nested function inside `ingestLead`):
```typescript
  function normalizePhone(p: string): string {
    const d = p.replace(/\D/g, '')
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  }
```

Add to the imports at the top of the file:
```typescript
import { normalizePhone } from '@/lib/utils/phone'
```

- [ ] **Step 4: Update `lib/voice/ingest.ts`**

Remove lines 8-11 (the local `normalizePhone`):
```typescript
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}
```

Add to imports:
```typescript
import { normalizePhone } from '@/lib/utils/phone'
```

- [ ] **Step 5: Update `app/api/twilio/inbound/route.ts`**

Remove lines 55-58 (the local `normalizePhone`):
```typescript
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}
```

Add to imports:
```typescript
import { normalizePhone } from '@/lib/utils/phone'
```

- [ ] **Step 6: Update `app/api/auth/register/route.ts`**

Remove lines 15-18 (the local `normalizePhone`):
```typescript
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}
```

Add to imports:
```typescript
import { normalizePhone } from '@/lib/utils/phone'
```

- [ ] **Step 7: Update `lib/leads/parseLabeledPaste.ts`**

Remove lines 39-46 (the local `normalizePhone` that returns `string | null`):
```typescript
function normalizePhone(value: string | null): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return null
}
```

Add to imports:
```typescript
import { normalizePhone } from '@/lib/utils/phone'
```

Find the call site (line ~61) that was `normalizePhone(rawPhone)` returning `string | null` and update it to preserve the null behavior:
```typescript
const phone = rawPhone ? (normalizePhone(rawPhone) || null) : null
```

- [ ] **Step 8: Update `lib/leads/spreadsheetImport.ts`**

Remove lines 82-87 (the local `normalizePhone`):
```typescript
function normalizePhone(val: string): string {
  const digits = val.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits.slice(0, 10)
}
```

Add to imports:
```typescript
import { normalizePhone } from '@/lib/utils/phone'
```

- [ ] **Step 9: Type check + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: zero errors. If TypeScript complains about the `parseLabeledPaste.ts` change, the `|| null` pattern handles the type mismatch.

- [ ] **Step 10: Verify no local definitions remain**

```bash
grep -rn "function normalizePhone" --include="*.ts" --include="*.tsx" .
```
Expected: zero matches (the only definition should now be in `lib/utils/phone.ts`).

- [ ] **Step 11: Smoke test**

Test the lead paste flow: go to Customers → New Lead, paste a sample AutoTrader or OfferUp lead. Confirm the phone number is parsed and saved correctly.

Test registration: if you have a staging env, attempt a new org registration with a phone number that has country code (+1) to confirm it strips correctly.

- [ ] **Step 12: Commit**

```bash
git add lib/utils/phone.ts app/api/leads/paste/route.ts lib/leads/ingest.ts lib/voice/ingest.ts app/api/twilio/inbound/route.ts app/api/auth/register/route.ts lib/leads/parseLabeledPaste.ts lib/leads/spreadsheetImport.ts
git commit -m "refactor: consolidate normalizePhone into lib/utils/phone.ts (was in 7 separate files)"
```

---

## Task 3: Consolidate Pulse `scoreColor` into `lib/pulse/scoreColor.ts`

**What:** `scoreColor()` is defined four times across Pulse-related files. Two of the four have meaningfully different scales so they must stay separate — but the three "pulse score" versions (1-5 scale) can share one export.

**Note on DealerScoreTile:** `components/dashboard/DealerScoreTile.tsx` uses a 0-100 scale (dealer performance score, not a pulse survey score). Its `scoreColor` is legitimately different and should NOT be moved — leave it in place.

**The three pulse versions to consolidate** (all use the same 1-5 scale thresholds):
- `app/(app)/pulse/PulseDashboard.tsx` — returns `'green' | 'yellow' | 'red'` union
- `app/(app)/pulse/team/TeamPulse.tsx` — returns Tailwind class strings
- `components/today/PulseScoreWidget.tsx` — returns combined Tailwind class strings (bg + text + border)

**Decision:** Each file uses the return value differently (union type vs class strings vs combined classes). Rather than force one return type, export two helpers: one returning the union for PulseDashboard, one returning classes for the widget.

```typescript
// lib/pulse/scoreColor.ts

/** Returns a color token for a 1-5 pulse score. Use with cn() for Tailwind classes. */
export function pulseScoreColor(s: number | null): 'green' | 'yellow' | 'red' {
  if (s === null || s < 3.5) return 'red'
  if (s < 4.5) return 'yellow'
  return 'green'
}

/** Returns full Tailwind class string for the PulseScoreWidget button. */
export function pulseScoreWidgetClasses(s: number | null): string {
  if (s === null) return 'text-muted-foreground bg-muted border-border'
  if (s >= 4.5)  return 'text-green-600 bg-green-50 border-green-200'
  if (s >= 3.5)  return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}
```

**Files:**
- Create: `lib/pulse/scoreColor.ts`
- Modify: `app/(app)/pulse/PulseDashboard.tsx` — remove local `scoreColor`, import `pulseScoreColor`
- Modify: `app/(app)/pulse/team/TeamPulse.tsx` — remove local `scoreColor`, derive class from `pulseScoreColor`
- Modify: `components/today/PulseScoreWidget.tsx` — remove local `scoreColor`, import `pulseScoreWidgetClasses`
- Leave alone: `components/dashboard/DealerScoreTile.tsx` (different scale, intentionally different)

---

- [ ] **Step 1: Create `lib/pulse/scoreColor.ts`**

```typescript
/**
 * Shared color helpers for pulse survey scores (1-5 scale).
 * Not for use with the dealer performance score (0-100) in DealerScoreTile.
 */

/** Returns a semantic color token for a 1-5 pulse score. */
export function pulseScoreColor(s: number | null): 'green' | 'yellow' | 'red' {
  if (s === null || s < 3.5) return 'red'
  if (s < 4.5) return 'yellow'
  return 'green'
}

/** Returns the Tailwind class string for the PulseScoreWidget button. */
export function pulseScoreWidgetClasses(s: number | null): string {
  if (s === null) return 'text-muted-foreground bg-muted border-border'
  if (s >= 4.5)  return 'text-green-600 bg-green-50 border-green-200'
  if (s >= 3.5)  return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}
```

- [ ] **Step 2: Update `app/(app)/pulse/PulseDashboard.tsx`**

Remove the local `scoreColor` function (lines 8-13):
```typescript
function scoreColor(s: number | null): 'green' | 'yellow' | 'red' {
  if (s === null) return 'yellow'
  if (s >= 4.5) return 'green'
  if (s >= 3.5) return 'yellow'
  return 'red'
}
```

Add import at the top:
```typescript
import { pulseScoreColor } from '@/lib/pulse/scoreColor'
```

Replace all 5 call sites of `scoreColor(` with `pulseScoreColor(` in this file.

- [ ] **Step 3: Update `app/(app)/pulse/team/TeamPulse.tsx`**

Remove the local `scoreColor` function (lines 16-20):
```typescript
function scoreColor(s: number | null) {
  if (s === null) return 'text-muted-foreground'
  if (s >= 4.5) return 'text-green-600'
  if (s >= 3.5) return 'text-yellow-600'
  return 'text-red-600'
}
```

Add import:
```typescript
import { pulseScoreColor } from '@/lib/pulse/scoreColor'
```

Replace the two call sites. The `scoreColor()` here returned class strings, but `pulseScoreColor` returns a token. Derive the class inline:

Where `scoreColor(rep.overall_score)` was used in `ScoreBadge` (inside a `cn()` call):
```typescript
// before
scoreColor(rep.overall_score)
// after — map token to class
pulseScoreColor(rep.overall_score) === 'green' ? 'text-green-600'
  : pulseScoreColor(rep.overall_score) === 'yellow' ? 'text-yellow-600'
  : 'text-red-600'
```

Or more cleanly, add a local one-liner helper inside the file (this is fine — it's a derived display helper, not the logic):
```typescript
function scoreClass(s: number | null) {
  const c = pulseScoreColor(s)
  return c === 'green' ? 'text-green-600' : c === 'yellow' ? 'text-yellow-600' : 'text-red-600'
}
```

Then replace `scoreColor(` with `scoreClass(` in TeamPulse.

- [ ] **Step 4: Update `components/today/PulseScoreWidget.tsx`**

Remove the local `scoreColor` function (lines 18-23):
```typescript
function scoreColor(s: number | null) {
  if (s === null) return 'text-muted-foreground bg-muted border-border'
  if (s >= 4.5) return 'text-green-600 bg-green-50 border-green-200'
  if (s >= 3.5) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}
```

Add import:
```typescript
import { pulseScoreWidgetClasses } from '@/lib/pulse/scoreColor'
```

Replace the one call site `scoreColor(pulseScore)` with `pulseScoreWidgetClasses(pulseScore)`.

- [ ] **Step 5: Type check + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: zero errors.

- [ ] **Step 6: Verify no orphaned local scoreColor in Pulse files**

```bash
grep -n "function scoreColor" "app/(app)/pulse/PulseDashboard.tsx" "app/(app)/pulse/team/TeamPulse.tsx" "components/today/PulseScoreWidget.tsx"
```
Expected: zero matches.

- [ ] **Step 7: Smoke test**

Open `/pulse` — overall score card and category rows should show correct green/yellow/red colors. Open `/pulse/team` — rep scores should show correct colors and expand/collapse. Open Today page — PulseScoreWidget should show correct color.

- [ ] **Step 8: Commit**

```bash
git add lib/pulse/scoreColor.ts "app/(app)/pulse/PulseDashboard.tsx" "app/(app)/pulse/team/TeamPulse.tsx" components/today/PulseScoreWidget.tsx
git commit -m "refactor: extract pulse scoreColor to lib/pulse/scoreColor.ts (was in 3 separate files)"
```

---

## Task 4: Relocate SMS lead parsers to `lib/leads/`

**What:** `lib/sms/parseOfferUpLead.ts` and `lib/sms/parseAutoTraderLead.ts` live in `lib/sms/` but are SMS/clipboard text parsers for lead intake — they belong with the other lead parsers in `lib/leads/`. This is a file move only. Zero logic changes.

**Important:** These files are NOT the same as `lib/leads/parser.ts`'s `parseOfferUpLead` / `parseAutoTraderLead`. Those parse email messages (3-arg signature: subject, textBody, fromEmail). These parse raw text from SMS or clipboard paste (1-arg signature: text). Different purposes, different return types. They coexist.

**Files:**
- Move (copy + delete): `lib/sms/parseOfferUpLead.ts` → `lib/leads/parseOfferUpSms.ts`
- Move (copy + delete): `lib/sms/parseAutoTraderLead.ts` → `lib/leads/parseAutoTraderSms.ts`
- Modify: `app/api/leads/paste/route.ts` (lines 5-6 — update import paths)
- Modify: `app/api/twilio/inbound/route.ts` (line 10 — update import path)

---

- [ ] **Step 1: Copy the files to new locations**

```bash
cp lib/sms/parseOfferUpLead.ts lib/leads/parseOfferUpSms.ts
cp lib/sms/parseAutoTraderLead.ts lib/leads/parseAutoTraderSms.ts
```

- [ ] **Step 2: Update imports in `app/api/leads/paste/route.ts`**

Change lines 5-6 from:
```typescript
import { isOfferUpLead, parseOfferUpLead } from '@/lib/sms/parseOfferUpLead'
import { isAutoTraderLead, parseAutoTraderLead } from '@/lib/sms/parseAutoTraderLead'
```
To:
```typescript
import { isOfferUpLead, parseOfferUpLead } from '@/lib/leads/parseOfferUpSms'
import { isAutoTraderLead, parseAutoTraderLead } from '@/lib/leads/parseAutoTraderSms'
```

- [ ] **Step 3: Update import in `app/api/twilio/inbound/route.ts`**

Change line 10 from:
```typescript
import { isOfferUpLead, parseOfferUpLead } from '@/lib/sms/parseOfferUpLead'
```
To:
```typescript
import { isOfferUpLead, parseOfferUpLead } from '@/lib/leads/parseOfferUpSms'
```

- [ ] **Step 4: Type check + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: zero errors.

- [ ] **Step 5: Delete the original files**

```bash
rm lib/sms/parseOfferUpLead.ts lib/sms/parseAutoTraderLead.ts
```

- [ ] **Step 6: Confirm nothing still imports from old paths**

```bash
grep -rn "sms/parseOfferUpLead\|sms/parseAutoTraderLead" --include="*.ts" --include="*.tsx" .
```
Expected: zero matches.

- [ ] **Step 7: Type check + build again** (confirms build still passes after delete)

```bash
npx tsc --noEmit && npm run build
```
Expected: zero errors.

- [ ] **Step 8: Smoke test**

Paste an OfferUp lead text into the New Lead paste dialog. Confirm name/phone/email parse correctly. (You don't need a real OfferUp message — a message with `• Name | • 5551234567 | • test@email.com` and "offerup" anywhere in the text works.)

- [ ] **Step 9: Commit**

```bash
git add lib/leads/parseOfferUpSms.ts lib/leads/parseAutoTraderSms.ts app/api/leads/paste/route.ts app/api/twilio/inbound/route.ts
git rm lib/sms/parseOfferUpLead.ts lib/sms/parseAutoTraderLead.ts
git commit -m "refactor: move SMS lead parsers from lib/sms/ to lib/leads/ (parseOfferUpSms, parseAutoTraderSms)"
```

---

## Task 5: Add `lib/api/respond.ts` — shared API response helpers

**What:** 677 inline `NextResponse.json({ error: ... }, { status: N })` patterns exist across all API routes. Some use `{ error: '...' }`, some use `{ message: '...' }`, making client-side error parsing unreliable. Add canonical helpers. This task only ADDS the helpers — it does not refactor the existing routes (that would be a separate session).

**Why add now without refactoring callers:** The helpers are available for all future route work, and any developer can adopt them incrementally when they touch a route.

**Files:**
- Create: `lib/api/respond.ts`

---

- [ ] **Step 1: Create `lib/api/respond.ts`**

```typescript
import { NextResponse } from 'next/server'

/**
 * Standard error response. Always uses { error: string } shape.
 * @param message  Plain English message (no jargon, no internal IDs)
 * @param status   HTTP status code (default 400)
 */
export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Standard success response.
 * @param data    Any JSON-serializable payload
 * @param status  HTTP status code (default 200)
 */
export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/api/respond.ts
git commit -m "feat: add lib/api/respond.ts with apiError() and apiOk() helpers for consistent API responses"
```

No smoke test needed — this is a new file that no existing code uses yet.

---

## Task 6: Split `check-tasks/route.ts` (1,108 lines, 15 jobs)

**What:** Extract each of the 15 cron jobs into its own file under `lib/cron/jobs/`. The route becomes a thin sequential runner. This makes it possible to understand, test, and modify any single job without reading 1,100 lines.

**Risk level:** Medium-high. This touches the core cron system. Test carefully.

**Files:**
- Create directory: `lib/cron/jobs/`
- Create 15 files: one per job (names listed in steps below)
- Modify: `app/api/cron/check-tasks/route.ts` — becomes ~60 lines

**Read the file first before starting:**

```bash
wc -l app/api/cron/check-tasks/route.ts
# Should be 1108
```

---

- [ ] **Step 1: Read the existing file and identify each job boundary**

```bash
grep -n "// ──\|// ---\|Job \|Step \|phase\|PHASE\|async function\|^  try {" app/api/cron/check-tasks/route.ts | head -60
```

Use the output to map out the exact line ranges for each job before extracting.

- [ ] **Step 2: Create `lib/cron/jobs/` directory and shared types file**

```bash
mkdir -p lib/cron/jobs
```

Create `lib/cron/jobs/types.ts`:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CronJobContext {
  supabase: SupabaseClient
  now: Date
}

export interface CronJobResult {
  job: string
  ok: boolean
  processed?: number
  error?: string
}
```

- [ ] **Step 3: Extract each job**

For each job, the pattern is:
1. Identify the block in `check-tasks/route.ts` (the `try { ... } catch { ... }` block for that job)
2. Create `lib/cron/jobs/[jobName].ts` with that logic as an exported async function
3. Function signature: `export async function run[JobName](ctx: CronJobContext): Promise<CronJobResult>`
4. Move all imports that job needs to the top of the new file

Jobs to extract (create one file per job):
- `lib/cron/jobs/receiptTasks.ts` — creates tasks from un-reviewed receipts
- `lib/cron/jobs/inventoryAging.ts` — flags vehicles sitting too long
- `lib/cron/jobs/dormantCustomers.ts` — marks customers as dormant
- `lib/cron/jobs/quotaReset.ts` — resets monthly SMS/MMS quotas
- `lib/cron/jobs/appointmentReminders.ts` — sends SMS reminders for upcoming appointments
- `lib/cron/jobs/responseTimeAlerts.ts` — alerts for slow response times
- `lib/cron/jobs/adminAlerts.ts` — platform-level health checks
- `lib/cron/jobs/dataRetention.ts` — purges data for canceled orgs
- `lib/cron/jobs/onboardingNudges.ts` — sends nudges to incomplete onboarding orgs
- `lib/cron/jobs/sequenceDelivery.ts` — sends due sequence steps
- `lib/cron/jobs/reviewRequests.ts` — sends Google review request messages
- `lib/cron/jobs/gmailWatchRenewal.ts` — renews expiring Gmail push watch subscriptions
- `lib/cron/jobs/gmailTokenHealth.ts` — checks for unhealthy Gmail tokens
- `lib/cron/jobs/pulseSurveys.ts` — sends scheduled pulse survey follow-ups
- `lib/cron/jobs/socialTokenRefresh.ts` — refreshes expiring social OAuth tokens

- [ ] **Step 4: Rewrite `app/api/cron/check-tasks/route.ts`**

After all jobs are extracted, the route file becomes:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { startCronRun, finishCronRun } from '@/lib/cron/cronRun'
import { runReceiptTasks }         from '@/lib/cron/jobs/receiptTasks'
import { runInventoryAging }       from '@/lib/cron/jobs/inventoryAging'
import { runDormantCustomers }     from '@/lib/cron/jobs/dormantCustomers'
import { runQuotaReset }           from '@/lib/cron/jobs/quotaReset'
import { runAppointmentReminders } from '@/lib/cron/jobs/appointmentReminders'
import { runResponseTimeAlerts }   from '@/lib/cron/jobs/responseTimeAlerts'
import { runAdminAlerts }          from '@/lib/cron/jobs/adminAlerts'
import { runDataRetention }        from '@/lib/cron/jobs/dataRetention'
import { runOnboardingNudges }     from '@/lib/cron/jobs/onboardingNudges'
import { runSequenceDelivery }     from '@/lib/cron/jobs/sequenceDelivery'
import { runReviewRequests }       from '@/lib/cron/jobs/reviewRequests'
import { runGmailWatchRenewal }    from '@/lib/cron/jobs/gmailWatchRenewal'
import { runGmailTokenHealth }     from '@/lib/cron/jobs/gmailTokenHealth'
import { runPulseSurveys }         from '@/lib/cron/jobs/pulseSurveys'
import { runSocialTokenRefresh }   from '@/lib/cron/jobs/socialTokenRefresh'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const ctx = { supabase, now }
  const runId = await startCronRun('check-tasks')

  const results = await Promise.allSettled([
    runReceiptTasks(ctx),
    runInventoryAging(ctx),
    runDormantCustomers(ctx),
    runQuotaReset(ctx),
    runAppointmentReminders(ctx),
    runResponseTimeAlerts(ctx),
    runAdminAlerts(ctx),
    runDataRetention(ctx),
    runOnboardingNudges(ctx),
    runSequenceDelivery(ctx),
    runReviewRequests(ctx),
    runGmailWatchRenewal(ctx),
    runGmailTokenHealth(ctx),
    runPulseSurveys(ctx),
    runSocialTokenRefresh(ctx),
  ])

  await finishCronRun(runId, { results: results.map(r => r.status) })
  return NextResponse.json({ ok: true, jobs: results.length })
}
```

- [ ] **Step 5: Type check + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: zero errors.

- [ ] **Step 6: Verify route file is now small**

```bash
wc -l app/api/cron/check-tasks/route.ts
```
Expected: under 60 lines.

- [ ] **Step 7: Smoke test (CRITICAL)**

After deploying to staging, manually trigger the cron:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://apollo-crm.vercel.app/api/cron/check-tasks
```
Expected: `{"ok":true,"jobs":15}`

Also check the `cron_runs` table in Supabase to confirm the run was recorded.

- [ ] **Step 8: Commit**

```bash
git add lib/cron/jobs/ app/api/cron/check-tasks/route.ts
git commit -m "refactor: extract 15 check-tasks cron jobs into lib/cron/jobs/ — route is now a thin runner"
```

---

## Task 7: Split `settings/organization/page.tsx` (1,309 lines, 9 sections)

**What:** The organization settings page has 28 `useState` hooks and 9 unrelated settings sections in one file. Split each section into its own client component under `app/(app)/settings/organization/sections/`.

**Risk level:** Medium. UI-only change. No API routes change.

**Files:**
- Create directory: `app/(app)/settings/organization/sections/`
- Create one file per section (9 total — identify exact names by reading the file)
- Modify: `app/(app)/settings/organization/page.tsx` — imports sections, no longer contains inline state

---

- [ ] **Step 1: Read the file and identify section boundaries**

```bash
grep -n "section\|Section\|<div.*id=\|// ──\|tab\|Tab\|accordion\|Accordion" "app/(app)/settings/organization/page.tsx" | head -40
```

Map out the 9 sections and their line ranges before starting.

- [ ] **Step 2: Create the sections directory**

```bash
mkdir -p "app/(app)/settings/organization/sections"
```

- [ ] **Step 3: Extract each section**

For each section, create `[SectionName]Section.tsx` in the sections directory. Each file:
- Is a `'use client'` component
- Owns all `useState` hooks that belong to it
- Makes its own API calls
- Has no props (reads from API directly, like the current page does)

Example structure for one section:
```typescript
'use client'

import { useState, useEffect } from 'react'
// ... imports specific to this section

export default function PhoneSection() {
  // all useState for phone provisioning here
  // all useEffect/fetch for phone here
  // all handlers for phone here
  return (
    // JSX for phone section only
  )
}
```

- [ ] **Step 4: Rewrite `page.tsx` to import sections**

```typescript
import TopBar from '@/components/layout/TopBar'
import PhoneSection              from './sections/PhoneSection'
import EmailAccountsSection      from './sections/EmailAccountsSection'
import VoiceAgentSection         from './sections/VoiceAgentSection'
// ... etc

export default async function OrganizationSettingsPage() {
  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Organization Settings" />
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8 max-w-2xl">
        <PhoneSection />
        <EmailAccountsSection />
        <VoiceAgentSection />
        {/* ... etc */}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Type check + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: zero errors.

- [ ] **Step 6: Smoke test (CRITICAL)**

Open Settings → Organization. Verify all 9 sections render. Make a change in each section and confirm it saves (check Supabase directly or reload the page to confirm persistence). Pay special attention to the Twilio phone provisioning section — it has the most complex state.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/settings/organization/"
git commit -m "refactor: split organization settings page into 9 section components (was 1309 lines / 28 state vars)"
```

---

## Task 8: Document Supabase client choice in `app/api/vehicles/`

**What:** Some vehicle API routes use `createServiceClient()` (bypasses RLS), others use `createClient()` (respects RLS). This is confusing for anyone reading the code. Add a one-line comment to each route explaining the choice. No logic changes.

**Files to add comments to:**
- `app/api/vehicles/[id]/route.ts`
- `app/api/vehicles/[id]/merge/route.ts`
- `app/api/vehicles/[id]/recon/route.ts`
- Any other vehicles routes — check with: `grep -rn "createServiceClient\|createClient" app/api/vehicles/ --include="*.ts"`

---

- [ ] **Step 1: Find all vehicle API routes and their client choice**

```bash
grep -rn "createServiceClient\|createClient" app/api/vehicles/ --include="*.ts"
```

- [ ] **Step 2: Add a comment above each client instantiation**

For `createServiceClient()`:
```typescript
// Service client: needed here because [reason — e.g. "RLS on vehicles uses org_id
// from profile, but this route reads across orgs for the platform admin view"].
const supabase = createServiceClient()
```

For `createClient()`:
```typescript
// Auth client: RLS enforces org isolation automatically here.
const supabase = await createClient()
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```
Expected: zero errors. (This is comment-only, so it should pass trivially.)

- [ ] **Step 4: Commit**

```bash
git add app/api/vehicles/
git commit -m "docs: add comments explaining createServiceClient vs createClient choice in vehicle API routes"
```

---

## Task 9: Split `LandingPage.tsx` (1,516 lines)

**What:** The marketing landing page is one giant file. It already uses named section components internally — extract each one to `components/landing/sections/[Name].tsx`. The main `LandingPage.tsx` becomes an assembly file only.

**Risk level:** Low — UI only, no data fetching, no API calls.

**Files:**
- Create directory: `components/landing/sections/`
- Create ~12 section files (identify by reading the file)
- Modify: `components/landing/LandingPage.tsx` — imports sections, assembly only

---

- [ ] **Step 1: Read the file and identify section component definitions**

```bash
grep -n "^function \|^const.*= () =>\|^export default" components/landing/LandingPage.tsx | head -30
```

List all section component names and their line ranges.

- [ ] **Step 2: Create the sections directory**

```bash
mkdir -p components/landing/sections
```

- [ ] **Step 3: Extract each section component**

For each named component (e.g. `HeroSection`, `PainSection`, `CustomerPulseSection`, etc.):
1. Create `components/landing/sections/[Name].tsx`
2. Move the component function and any imports/helpers it uses exclusively
3. Shared helpers (animation wrappers like `FadeUp`, `StaggerGrid`) should go in `components/landing/sections/_shared.tsx`

- [ ] **Step 4: Update `LandingPage.tsx`**

Import all extracted sections and assemble them. The file should end up ~50 lines:

```typescript
import HeroSection         from './sections/HeroSection'
import PainSection         from './sections/PainSection'
// ... etc

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <PainSection />
      {/* ... etc */}
    </main>
  )
}
```

- [ ] **Step 5: Type check + build**

```bash
npx tsc --noEmit && npm run build
```
Expected: zero errors.

- [ ] **Step 6: Smoke test**

Open `dealerwyze.com` (or localhost:3000). Scroll through the entire landing page. Confirm all sections render, animations work, and all CTA buttons link correctly.

- [ ] **Step 7: Commit**

```bash
git add components/landing/
git commit -m "refactor: split LandingPage.tsx (1516 lines) into section components in components/landing/sections/"
```

---

## Final verification after all tasks

After all 9 tasks are complete:

```bash
# No local normalizePhone definitions remain
grep -rn "function normalizePhone" --include="*.ts" --include="*.tsx" . | grep -v "lib/utils/phone.ts"
# Expected: no output

# No local pulse scoreColor definitions in the three pulse files
grep -n "function scoreColor" "app/(app)/pulse/PulseDashboard.tsx" "app/(app)/pulse/team/TeamPulse.tsx" "components/today/PulseScoreWidget.tsx"
# Expected: no output

# Old SMS parser paths are gone
grep -rn "sms/parseOfferUpLead\|sms/parseAutoTraderLead" --include="*.ts" --include="*.tsx" .
# Expected: no output

# Dead ReportsClient is gone
ls "app/(app)/reports/ReportsClient.tsx"
# Expected: "No such file"

# check-tasks route is small
wc -l app/api/cron/check-tasks/route.ts
# Expected: under 60

# Full build passes
npm run build
# Expected: "✓ Compiled successfully"
```
