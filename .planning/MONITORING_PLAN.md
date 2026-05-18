# Monitoring, Logging & Analytics — Implementation Plan
_DealerWyze · Multi-tenant SaaS CRM · Architect: Claude_
_Status: Ready for Cursor AI execution_

---

## Overview

Three-layer observability stack:

| Layer | Tool | Purpose |
|---|---|---|
| Error tracking | **Sentry** | Crashes, API errors, slow transactions, release health |
| Product analytics | **PostHog** | Feature adoption, session replay, funnels, flags |
| Log aggregation | **Axiom** | Structured server logs, query/alert on any log field |

**Non-negotiable enterprise rules that apply to every task:**
- No PII (phone numbers, customer names, email addresses, SSNs, message body content) in any event property, log field, Sentry tag, or PostHog property
- Every event must carry `org_id` for tenant attribution — never raw user IDs alone
- Sentry user context: `id = org_id`, `segment = role` — no email, no display name
- PostHog identify: `distinctId = org_id` (org-level, not per-user) — see §PostHog §3
- Session replay must mask ALL input fields and text areas by default
- No secrets, stack traces, or internal IDs in dealer-facing error messages
- All new env vars must be added to `.env.example` with a comment
- All changes must pass `npx eslint app components hooks lib --max-warnings=0` and `npm run build`

---

## PHASE 1 — Sentry: Harden Existing Partial Integration

Sentry is already scaffolded (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `withSentryConfig` in `next.config.ts`). It is not fully hardened.

### Task S1 — Harden `sentry.client.config.ts`

Replace the current file at `sentry.client.config.ts` with:

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',

  // Performance: 10% in production, 100% in dev (dev has no traffic)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay: 5% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // REQUIRED: mask all inputs and text to prevent PII capture
      maskAllInputs: true,
      maskAllText: false,          // allow UI structure to be visible
      blockAllMedia: false,
      networkDetailAllowUrls: [],  // do not capture request/response bodies
    }),
    Sentry.browserTracingIntegration(),
  ],

  // Strip PII from events before sending
  beforeSend(event) {
    // Remove user email if accidentally set
    if (event.user?.email) delete event.user.email
    if (event.user?.username) delete event.user.username
    // Remove request cookies and auth headers
    if (event.request?.cookies) event.request.cookies = {}
    if (event.request?.headers) {
      const safe = ['content-type', 'x-forwarded-for', 'user-agent']
      const h = event.request.headers as Record<string, string>
      event.request.headers = Object.fromEntries(
        Object.entries(h).filter(([k]) => safe.includes(k.toLowerCase()))
      )
    }
    return event
  },

  debug: false,
})
```

### Task S2 — Harden `sentry.server.config.ts`

Replace with:

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  beforeSend(event) {
    // Never forward request body — may contain PII (SMS content, customer data)
    if (event.request?.data) event.request.data = '[redacted]'
    if (event.request?.cookies) event.request.cookies = {}
    if (event.request?.headers) {
      const safe = ['content-type', 'x-forwarded-for', 'user-agent', 'x-pathname']
      const h = event.request.headers as Record<string, string>
      event.request.headers = Object.fromEntries(
        Object.entries(h).filter(([k]) => safe.includes(k.toLowerCase()))
      )
    }
    return event
  },

  debug: false,
})
```

### Task S3 — Harden `sentry.edge.config.ts`

Replace with:

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  tracesSampleRate: 0.05,
  debug: false,
})
```

### Task S4 — Harden `next.config.ts` Sentry options

Update the `sentryConfig` object in `next.config.ts`:

```ts
const sentryConfig = {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Upload source maps so stack traces are readable in Sentry dashboard
  hideSourceMaps: true,        // hides maps from client bundle but uploads to Sentry
  dryRun: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Disable automatic instrumentation of pages we don't want traced
  disableServerWebpackPlugin: false,
  disableClientWebpackPlugin: false,
}
```

### Task S5 — Sentry user context injection

Create `lib/sentry/setUserContext.ts`:

```ts
import * as Sentry from '@sentry/nextjs'

/**
 * Call this after requireProfile() resolves on any server component or API route
 * where org_id and role are available.
 *
 * PRIVACY: we use org_id as the Sentry user ID — NOT the user's personal ID,
 * email, or name. This lets us correlate errors to a tenant without exposing PII.
 */
export function setSentryUserContext(orgId: string, role: string) {
  Sentry.setUser({
    id: orgId,           // org_id — not the personal user UUID
    segment: role,       // e.g. 'dealer_admin', 'sales_rep'
  })
}

export function clearSentryUser() {
  Sentry.setUser(null)
}
```

### Task S6 — Wire Sentry user context into the app layout

In `app/(app)/layout.tsx`, after the profile is loaded and before the return statement, add:

```ts
import { setSentryUserContext } from '@/lib/sentry/setUserContext'

// Inside AppLayout, after profile is confirmed non-null:
if (profile.org_id) {
  setSentryUserContext(profile.org_id, profile.role ?? 'unknown')
}
```

### Task S7 — Create `app/error.tsx` (global client error boundary)

Create `app/(app)/error.tsx`:

```tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <p className="text-2xl mb-2">Something went wrong</p>
      <p className="text-sm text-muted-foreground mb-6">
        We ran into an unexpected error. Our team has been notified.
      </p>
      <Button onClick={reset} variant="outline">Try again</Button>
    </div>
  )
}
```

Create `app/global-error.tsx`:

```tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Application error</h2>
          <p>Our team has been notified. Please refresh the page.</p>
          <button onClick={reset}>Refresh</button>
        </div>
      </body>
    </html>
  )
}
```

### Task S8 — Sentry env vars in `.env.example`

Ensure `.env.example` has (add any missing):

```
# ─── Sentry (error tracking) ──────────────────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://xxx@oXXXXXX.ingest.sentry.io/XXXXXXX
SENTRY_AUTH_TOKEN=sntrys_xxxxxxxxxxxxx          # Required for source map uploads at build time
SENTRY_ORG=your-sentry-org-slug
SENTRY_PROJECT=dealerwyze
```

### Task S9 — Add `sentry.properties` file for CLI source map upload

Create `sentry.properties` in the project root:

```
defaults.url=https://sentry.io/
defaults.org=${SENTRY_ORG}
defaults.project=${SENTRY_PROJECT}
auth.token=${SENTRY_AUTH_TOKEN}
```

### Task S10 — Sentry alert rules (document, not code)

After wiring: in the Sentry dashboard configure these alert rules:
- **Error spike**: any error rate > 20/min → Slack/email
- **New issue**: any new issue in production → notify immediately
- **Performance**: p95 response time > 3s on `/api/` routes → notify
- **Auth failures**: `webhook_auth_failure` events → critical alert

---

## PHASE 2 — PostHog: Product Analytics + Session Replay

### Task P1 — Install PostHog

```bash
npm install posthog-js posthog-node
```

### Task P2 — Add env vars to `.env.example`

```
# ─── PostHog (product analytics + session replay) ─────────────────────────────
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or eu.i.posthog.com
```

### Task P3 — Create PostHog provider

Create `lib/posthog/provider.tsx`:

```tsx
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',

      // Capture page views on route change automatically
      capture_pageview: true,
      capture_pageleave: true,

      // Session replay — mask ALL inputs (PII protection)
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: 'input, textarea, [data-ph-mask]',
      },

      // Respect Do Not Track browser setting
      respect_dnt: true,

      // Disable in development to keep event counts clean
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') {
          ph.opt_out_capturing()
        }
      },

      // Bootstrap with org group before first event fires
      bootstrap: {},
    })
  }, [])

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return <>{children}</>

  return <PHProvider client={posthog}>{children}</PHProvider>
}
```

### Task P4 — Create PostHog identity helper

Create `lib/posthog/identify.ts`:

```ts
import posthog from 'posthog-js'

/**
 * Called once after the authenticated profile is known (client side).
 *
 * PRIVACY RULES:
 * - distinctId = org_id (tenant-level, not personal)
 * - $set only role and plan — never name, email, phone
 * - Group the session to the org using PostHog Groups
 */
export function identifyOrgSession(orgId: string, role: string, planTier?: string) {
  if (typeof window === 'undefined') return
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

  // Identify at the org level so all events from this org are grouped
  posthog.identify(orgId, {
    role,
    ...(planTier ? { plan_tier: planTier } : {}),
  })

  // PostHog Groups — enables org-level dashboards
  posthog.group('organization', orgId, {
    role,
    ...(planTier ? { plan_tier: planTier } : {}),
  })
}

export function resetPostHogSession() {
  if (typeof window === 'undefined') return
  posthog.reset()
}
```

### Task P5 — Wire provider and identity into app layout

**5a.** In `app/layout.tsx` (root layout), wrap children with `PostHogProvider`:

```tsx
import { PostHogProvider } from '@/lib/posthog/provider'

// Wrap the <body> content:
<PostHogProvider>
  {children}
</PostHogProvider>
```

**5b.** Create a client component `components/analytics/OrgIdentifier.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { identifyOrgSession } from '@/lib/posthog/identify'

interface Props {
  orgId: string
  role: string
  planTier?: string
}

export default function OrgIdentifier({ orgId, role, planTier }: Props) {
  useEffect(() => {
    identifyOrgSession(orgId, role, planTier)
  }, [orgId, role, planTier])

  return null
}
```

**5c.** In `app/(app)/layout.tsx`, after profile is loaded, render `<OrgIdentifier>` inside the return:

```tsx
import OrgIdentifier from '@/components/analytics/OrgIdentifier'

// Inside the JSX, before </> closing tag:
{profile.org_id && (
  <OrgIdentifier orgId={profile.org_id} role={profile.role ?? 'unknown'} />
)}
```

### Task P6 — Create typed event tracking hook

Create `hooks/useAnalytics.ts`:

```ts
import { usePostHog } from 'posthog-js/react'
import { useCallback } from 'react'

// ── Event catalogue ──────────────────────────────────────────────────────────
// Add events here as new features are instrumented.
// RULE: properties must NEVER contain PII (names, phones, emails, message bodies)

export type AnalyticsEvent =
  // Leads & Customers
  | { event: 'lead_created';           props: { source?: string } }
  | { event: 'customer_viewed';        props: { section?: 'activity' | 'details' | 'vehicle' } }
  | { event: 'customer_searched';      props: Record<string, never> }

  // Appointments
  | { event: 'appointment_scheduled';  props: { from_screen: string } }
  | { event: 'appointment_edited';     props: { from_screen: string } }
  | { event: 'appointment_deleted';    props: { from_screen: string } }

  // Messaging
  | { event: 'sms_sent';               props: { template_used: boolean } }
  | { event: 'email_sent';             props: { template_used: boolean } }
  | { event: 'call_initiated';         props: Record<string, never> }

  // Sequences
  | { event: 'sequence_started';       props: { step_count: number } }
  | { event: 'sequence_paused';        props: Record<string, never> }

  // Vehicles
  | { event: 'vehicle_added';          props: { has_photos: boolean } }
  | { event: 'vehicle_sold';           props: Record<string, never> }
  | { event: 'vehicle_photo_uploaded'; props: { count: number } }

  // Receipts & Ledger
  | { event: 'receipt_scanned';        props: { has_ai_parse: boolean } }
  | { event: 'ledger_transaction_created'; props: { has_vehicle: boolean } }
  | { event: 'ledger_transaction_edited';  props: Record<string, never> }

  // Calendar
  | { event: 'calendar_viewed';        props: { view: 'month' | 'week' | 'day' } }

  // AI Features
  | { event: 'ai_brief_generated';     props: { tokens_used: number; cached: boolean } }
  | { event: 'ai_brief_viewed';        props: Record<string, never> }

  // Settings
  | { event: 'settings_saved';         props: { section: string } }

  // Onboarding
  | { event: 'onboarding_step_completed'; props: { step: string } }
  | { event: 'onboarding_completed';   props: Record<string, never> }

/**
 * Hook for type-safe event tracking.
 *
 * Usage:
 *   const { track } = useAnalytics()
 *   track({ event: 'appointment_scheduled', props: { from_screen: 'lead_card' } })
 */
export function useAnalytics() {
  const posthog = usePostHog()

  const track = useCallback(<E extends AnalyticsEvent>(e: E) => {
    if (!posthog) return
    posthog.capture(e.event, (e as { props: Record<string, unknown> }).props)
  }, [posthog])

  return { track }
}
```

### Task P7 — Instrument key screens

For each location below, import `useAnalytics` and call `track()` at the specified trigger. Do NOT track PII. Do NOT add tracking inside map() renders — only on user-initiated actions.

**7a. Lead Card (`components/leads/NewLeadCard.tsx`)**
- On successful lead creation POST: `track({ event: 'lead_created', props: { source: 'lead_card' } })`
- On successful appointment save: `track({ event: 'appointment_scheduled', props: { from_screen: 'lead_card' } })`
- On successful appointment edit: `track({ event: 'appointment_edited', props: { from_screen: 'lead_card' } })`
- On successful appointment delete: `track({ event: 'appointment_deleted', props: { from_screen: 'lead_card' } })`

**7b. Customer detail (`app/(app)/customers/[id]/CustomerDetailClient.tsx`)**
- On mount (useEffect []): `track({ event: 'customer_viewed', props: {} })`
- On successful SMS send: `track({ event: 'sms_sent', props: { template_used: false } })`
- On successful email send: `track({ event: 'email_sent', props: { template_used: false } })`
- On appointment scheduled: `track({ event: 'appointment_scheduled', props: { from_screen: 'customer_detail' } })`

**7c. Calendar (`app/(app)/calendar/page.tsx`)**
- When view changes (month/week/day button click): `track({ event: 'calendar_viewed', props: { view: v } })`

**7d. Vehicle add (`app/(app)/vehicles/new` or wherever the add form submits)**
- After successful vehicle create: `track({ event: 'vehicle_added', props: { has_photos: false } })`
- After vehicle marked sold: `track({ event: 'vehicle_sold', props: {} })`

**7e. Receipts (`app/(app)/receipts`)**
- After scan/upload success: `track({ event: 'receipt_scanned', props: { has_ai_parse: true } })`

**7f. Ledger (`components/receipts/LedgerClient.tsx`)**
- After save in edit sheet: `track({ event: 'ledger_transaction_edited', props: {} })`

**7g. AI Brief (`components/today/DealerBrief.tsx`)**
- After `regenerate()` succeeds: `track({ event: 'ai_brief_generated', props: { tokens_used: data.tokens_used, cached: false } })`
- When user expands the brief panel: `track({ event: 'ai_brief_viewed', props: {} })`

### Task P8 — PostHog page view for App Router (required extra step)

Create `components/analytics/PostHogPageView.tsx`:

```tsx
'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'

export default function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  useEffect(() => {
    if (!posthog || !pathname) return
    const url = `${window.location.origin}${pathname}${searchParams?.toString() ? '?' + searchParams.toString() : ''}`
    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams, posthog])

  return null
}
```

Wrap it in Suspense and render in `app/(app)/layout.tsx` inside the main content area:

```tsx
import { Suspense } from 'react'
import PostHogPageView from '@/components/analytics/PostHogPageView'

// Inside the JSX:
<Suspense fallback={null}>
  <PostHogPageView />
</Suspense>
```

### Task P9 — Reset PostHog on sign-out

Find the sign-out handler (likely in `app/(app)/settings` or a header component). After the Supabase `signOut()` call:

```ts
import { resetPostHogSession } from '@/lib/posthog/identify'
resetPostHogSession()
```

---

## PHASE 3 — Axiom: Structured Log Aggregation

### Task A1 — Axiom Vercel Log Drain (zero-code setup)

**This is a Vercel dashboard task, not a code task.**

Steps to document in the completion report:
1. Create a free Axiom account at axiom.co
2. Create a dataset named `dealerwyze-production`
3. In Axiom → Settings → Integrations → Vercel: connect your Vercel account
4. Enable the log drain for the DealerWyze production project
5. All Next.js server logs (including JSON from `lib/logger.ts`) will stream automatically

### Task A2 — Enhance `lib/logger.ts` for Axiom-queryable structured logs

The existing logger already writes JSON to stderr (captured by Vercel → Axiom). Enhance it to always include `org_id` when available, and add a `duration_ms` field for performance logging:

```ts
// Add to the LogEntry interface:
interface LogEntry {
  ts:           string
  level:        Severity
  context:      string
  message:      string
  org_id?:      string      // tenant attribution — never PII
  duration_ms?: number      // for performance log entries
  meta?:        Record<string, unknown>
}

// Add org_id and duration to the log() function signature:
function log(
  level: Severity,
  context: string,
  message: string,
  meta?: Record<string, unknown>,
  orgId?: string,
  durationMs?: number,
) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    context,
    message,
    ...(orgId ? { org_id: orgId } : {}),
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
    ...(meta ? { meta } : {}),
  }
  console.error(JSON.stringify(entry))
}

// Update exported logger to expose timed helper:
export const logger = {
  info:  (ctx: string, msg: string, meta?: Record<string, unknown>, orgId?: string) =>
    log('info', ctx, msg, meta, orgId),
  warn:  (ctx: string, msg: string, meta?: Record<string, unknown>, orgId?: string) =>
    log('warn', ctx, msg, meta, orgId),
  error: (ctx: string, error: unknown, meta?: Record<string, unknown>, orgId?: string) =>
    log('error', ctx, error instanceof Error ? error.message : String(error), {
      ...formatError(error), ...meta,
    }, orgId),
  fatal: (ctx: string, error: unknown, meta?: Record<string, unknown>, orgId?: string) =>
    log('fatal', ctx, error instanceof Error ? error.message : String(error), {
      ...formatError(error), ...meta,
    }, orgId),

  // Convenience helper: log an operation with its duration
  timed: (ctx: string, msg: string, durationMs: number, orgId?: string, meta?: Record<string, unknown>) =>
    log('info', ctx, msg, meta, orgId, durationMs),
}
```

### Task A3 — Add `org_id` to logger calls on high-traffic routes

Identify the 5 highest-traffic API routes and update their `logger.error()` calls to pass `profile.org_id`:

Priority routes:
- `app/api/twilio/inbound/route.ts` — inbound SMS
- `app/api/activities/route.ts` — activity creation
- `app/api/customers/route.ts` — customer queries
- `app/api/vehicles/route.ts` — vehicle queries
- `app/api/intelligence/briefing/route.ts` — AI briefing

For each, find existing `logger.error(...)` calls and add `profile.org_id` as the 4th argument where the profile is in scope.

### Task A4 — Add env vars to `.env.example`

```
# ─── Axiom (log aggregation — configured via Vercel Log Drain, no SDK needed) ─
# Set up via: Vercel Dashboard → Integrations → Axiom
# Dataset name: dealerwyze-production
# AXIOM_DATASET=dealerwyze-production   # Not an env var — just for documentation
```

### Task A5 — Axiom dashboard setup (document in completion report)

Create these saved queries in Axiom after the log drain is active:

| Query name | Purpose |
|---|---|
| `errors-by-org` | `level:error | summarize count() by org_id` |
| `fatal-alerts` | `level:fatal` |
| `slow-api-routes` | `duration_ms > 2000 | summarize avg(duration_ms) by context` |
| `sentry-webhook-failures` | `context:"twilio" AND level:error` |
| `onboarding-failures` | `context:"auth"` |

---

## PHASE 4 — Enhanced Error Monitoring on Critical Paths

### Task E1 — Wrap Twilio webhook in Sentry transaction

In `app/api/twilio/inbound/route.ts`, wrap the POST handler body in a Sentry span:

```ts
import * as Sentry from '@sentry/nextjs'

// At the start of the handler, after signature validation:
return Sentry.startSpan(
  { name: 'twilio.inbound', op: 'http.server' },
  async () => {
    // ... existing handler logic
  }
)
```

### Task E2 — Wrap Stripe webhook in Sentry transaction

Same pattern in `app/api/stripe/webhook/route.ts`.

### Task E3 — Add Sentry breadcrumb on auth failures

In `lib/auth/profile.ts`, when `requireProfile()` throws or redirects due to missing session, add:

```ts
Sentry.addBreadcrumb({
  category: 'auth',
  message: 'requireProfile: no session',
  level: 'warning',
})
```

---

## PHASE 5 — Uptime Monitoring

### Task U1 — Vercel Speed Insights

Add to `app/layout.tsx` (root layout):

```tsx
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/react'

// Inside the <body>:
<SpeedInsights />
<Analytics />
```

Install packages:
```bash
npm install @vercel/speed-insights @vercel/analytics
```

### Task U2 — Public health check endpoint

Create `app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server'

// Public endpoint — no auth required.
// Used by uptime monitors (Better Uptime, UptimeRobot, etc.)
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
```

This route must NOT call `requireProfile()` and must NOT touch the database — it only confirms the server is running.

### Task U3 — Document uptime monitor setup

Configure an external uptime monitor (Better Uptime, UptimeRobot free tier, or Vercel's built-in):
- URL: `https://app.dealerwyze.com/api/health`
- Check interval: 1 minute
- Alert on: 2 consecutive failures
- Notify: same channel as Sentry fatal alerts

---

## COMPLETION REPORT TEMPLATE

When all tasks are done, Cursor must produce a file `MONITORING_REPORT.md` in the project root with this structure:

```markdown
# Monitoring Implementation Report
Date: [date]
Implemented by: Cursor AI
Architect: Claude

## ✅ Implemented as Specified
- [ Task ID ] — [what was done]
- ...

## ⚠️ Implemented with Deviations
- [ Task ID ] — [what was done] — DEVIATION: [what changed and why]
- ...

## ❌ Skipped / Not Implemented
- [ Task ID ] — [reason: missing env var / dependency conflict / out of scope]
- ...

## 🔒 Enterprise Compliance Check
- [ ] PII scrubbing in Sentry `beforeSend` — client and server configs
- [ ] PostHog replay: `maskAllInputs: true` confirmed
- [ ] PostHog identify uses org_id, not user email or name
- [ ] No customer names/phones/emails in any event property
- [ ] Sentry user context: id = org_id, no email field
- [ ] `app/error.tsx` and `app/global-error.tsx` present
- [ ] `/api/health` endpoint responds 200 with no auth
- [ ] All new env vars added to `.env.example`
- [ ] `npx eslint app components hooks lib --max-warnings=0` — PASS / FAIL
- [ ] `npm run build` — PASS / FAIL

## 🔧 Manual Steps Required After Deployment
1. Add env vars to Vercel dashboard: NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
2. Connect Axiom log drain in Vercel dashboard
3. Configure Sentry alert rules (see Task S10)
4. Configure uptime monitor on /api/health (see Task U3)
5. Verify PostHog events arriving in PostHog dashboard after first production deploy
```

---

## Execution Order

Execute phases in this order to minimize risk and enable verification at each step:

1. **Phase 5 → U1, U2** first (Vercel analytics + health check — zero risk, immediate value)
2. **Phase 1 → S1–S9** (harden Sentry — already partially wired, low risk)
3. **Phase 2 → P1–P9** (PostHog — new dependency, test in dev before shipping)
4. **Phase 3 → A1–A5** (Axiom logger enhancement — additive only)
5. **Phase 4 → E1–E3** (Sentry spans on critical paths — do last, verify traces in Sentry)

Run `npx eslint app components hooks lib --max-warnings=0 && npm run build` after each phase before moving to the next.

---

## Security Audit Checklist (Required Before Marking Done)

- [ ] `beforeSend` on client AND server Sentry configs scrubs request body, cookies, and auth headers
- [ ] PostHog session replay `maskAllInputs: true` — verified in PostHog dashboard (inputs show as `***`)
- [ ] PostHog `identify()` is called with `org_id`, not `user.id` or `user.email`
- [ ] No `console.log` of event properties that could contain PII
- [ ] `/api/health` returns 200 without touching Supabase (no DB call)
- [ ] `OrgIdentifier` component only receives `orgId` and `role` — no email, no name
- [ ] `useAnalytics` event types catalogue: verify no event prop accepts a string that could be a name/phone/email
- [ ] PostHog `opt_out_capturing()` is called in development (no dev noise in production dataset)
- [ ] Sentry `dryRun: true` in dev (no DSN = no upload)
