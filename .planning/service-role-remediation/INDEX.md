# Service-Role Remediation — Agent Execution Index

## Overview

These plans close the remaining service-role blast-radius gaps identified in the Phase 0 triage.
They are designed for **parallel execution** — each plan touches a distinct set of files with no overlaps.

**Source:** `.planning/service-role-triage.md`
**Prerequisite:** Phase 2 (Top 20 Reducible) is already complete. Verify before starting each plan.

---

## Plans

| Plan | File | What it does | Risk | Can run in parallel with |
|------|------|--------------|------|--------------------------|
| [PLAN-A](./PLAN-A-critical-bugs.md) | PLAN-A-critical-bugs.md | Fix HIGH/MEDIUM wrong-classification bugs | High | B, C, D, E |
| [PLAN-B](./PLAN-B-sequences-settings.md) | PLAN-B-sequences-settings.md | Convert sequences/*, settings/*, retention/*, pipeline, segments routes | Low | A, C, D, E |
| [PLAN-C](./PLAN-C-customers-receipts.md) | PLAN-C-customers-receipts.md | Convert customers/*, customer-sequences/*, receipts/*, activities, calendar, reports, dashboard | Low | A, B, D, E |
| [PLAN-D](./PLAN-D-support-pulse-misc.md) | PLAN-D-support-pulse-misc.md | Convert support/*, pulse/*, sales/*, onboarding/*, email, auth/me, vehicles, push/subscribe | Low | A, B, C, E |
| [PLAN-E](./PLAN-E-pages-lib.md) | PLAN-E-pages-lib.md | Convert RSC pages + lib/sms/quota consolidation | Low | A, B, C, D |

---

## Universal Rules — Apply to Every Plan

### When to use createClient() vs createServiceClient()

```
requireProfile() called in the same route → ALWAYS use createClient()
  RLS enforces org scoping automatically via the authenticated session.

No user session (cron, webhooks, public token routes, OAuth callbacks, storage signing)
  → createServiceClient() is legitimate, do NOT change.
```

### Mechanical conversion pattern

Every Reducible file follows this pattern:

**Before:**
```typescript
import { createServiceClient } from '@/lib/supabase/service'
// ...
const supabase = createServiceClient()
```

**After:**
```typescript
import { createClient } from '@/lib/supabase/server'
// ...
const supabase = await createClient()
```

- `createClient()` is async — always `await` it.
- Remove the `createServiceClient` import if it is no longer used in the file.
- Do NOT change storage operations (signed URL generation, bucket uploads) — those still need service client even in auth routes. Split the variable: `const supabase = await createClient()` for DB, `const storage = createServiceClient()` for storage.

### Do NOT convert these files (Legitimate)

Any file in `app/api/cron/`, `lib/cron/`, inbound webhooks (`stripe/webhook`, `twilio/inbound`, `telegram/webhook`, `bhph/webhook`, `fax/callback`, `voice/retell-callback`, `voice/vapi-callback`, `webhooks/render-complete`), OAuth callbacks (`google/calendar-callback`, `integrations/gmail/callback`, `social/callback/*`), public token routes (`pay/[token]`, `book/[slug]`, `pulse/[token]`, `unsubscribe`, `transfer/[token]`).

### Verification after each plan

```bash
# In /home/tim/Applications/Wyze/wyze-app/
npx eslint "app/**/*.ts" "lib/**/*.ts" "components/**/*.ts" --max-warnings=0
npm test
npm run build
```

All three must pass before the plan is considered complete.

---

## File Ownership Map (no overlaps)

```
PLAN-A: lib/push/send.ts, lib/leads/ingest.ts, lib/orgs/lookup.ts,
         lib/social/tokenRefresh.ts, lib/social/autoPost.ts,
         lib/leads/assignLead.ts,
         app/api/settings/transfer/route.ts,
         app/api/settings/data-export/route.ts,
         app/api/vehicles/[id]/video/route.ts,
         app/api/vehicles/[id]/render/route.ts,
         app/api/customers/[id]/documents/[docId]/route.ts,
         app/(app)/layout.tsx,
         supabase/migrations/111_push_subscriptions_org.sql (new)

PLAN-B: app/api/sequences/[id]/route.ts
         app/api/sequences/route.ts
         app/api/sequences/[id]/steps/route.ts
         app/api/sequences/[id]/steps/[stepId]/route.ts
         app/api/sequences/seed-starters/route.ts
         app/api/settings/org/route.ts
         app/api/settings/appearance/route.ts
         app/api/settings/pulse/route.ts
         app/api/settings/video/route.ts
         app/api/settings/webhooks/route.ts
         app/api/settings/automation/route.ts
         app/api/retention/settings/route.ts
         app/api/retention/referrals/route.ts
         app/api/pipeline-stages/route.ts
         app/api/segments/route.ts

PLAN-C: app/api/customers/[id]/route.ts
         app/api/customers/[id]/state/route.ts
         app/api/customers/[id]/deal-checklist/route.ts
         app/api/customers/[id]/documents/route.ts
         app/api/customers/[id]/merge/route.ts
         app/api/customers/segment/route.ts
         app/api/customers/segment/bulk-enroll/route.ts
         app/api/customers/review-request/route.ts
         app/api/customer-sequences/route.ts
         app/api/customer-sequences/[id]/route.ts
         app/api/receipts/[id]/route.ts
         app/api/receipts/ledger/export/route.ts
         app/api/activities/route.ts
         app/api/calendar/events/route.ts
         app/api/reports/route.ts
         app/api/dashboard/stats/route.ts

PLAN-D: app/api/support/tickets/route.ts
         app/api/support/tickets/[id]/route.ts
         app/api/support/tickets/[id]/messages/route.ts
         app/api/pulse/scores/route.ts
         app/api/pulse/actions/route.ts
         app/api/pulse/actions/[id]/route.ts
         app/api/pulse/surveys/route.ts
         app/api/pulse/rep-feedback/route.ts
         app/api/pulse/team-scores/route.ts
         app/api/sales/commissions/route.ts
         app/api/sales/dealers/route.ts
         app/api/sales/me/route.ts
         app/api/onboarding/route.ts
         app/api/onboarding/step/route.ts
         app/api/email/send/route.ts
         app/api/fax/send/route.ts
         app/api/auth/me/route.ts
         app/api/push/subscribe/route.ts
         app/api/vehicles/[id]/route.ts
         app/api/vehicles/[id]/photos/[photoId]/route.ts
         app/api/vehicles/[id]/documents/[docId]/route.ts
         app/api/vehicles/[id]/ai-description/route.ts
         app/api/vehicles/[id]/market-check/route.ts
         app/api/bhph/create/route.ts

PLAN-E: app/(app)/settings/appearance/page.tsx
         app/(app)/settings/retention/page.tsx
         app/(app)/customers/segments/page.tsx
         app/(app)/analytics/referrals/page.tsx
         app/(app)/pending/page.tsx
         app/(app)/settings/payments/page.tsx
         app/(app)/settings/social/page.tsx
         app/(app)/settings/video/page.tsx
         lib/sms/quota.ts
```
