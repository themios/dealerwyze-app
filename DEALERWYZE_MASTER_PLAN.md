# DealerWyze — Master Transition Plan
**Supersedes:** REBRAND_PLAN.md, SAAS_TRANSITION_PLAN.md
**Version:** 1.0 | **Date:** 2026-03-02 | **Status:** ✅ COMPLETE (verified 2026-03-03)

---

## Guiding Principles

1. **Apollo Auto is a tenant.** Tim's dealership gets no special treatment in code.
   All its configuration lives in the database like any other dealer.
2. **DealerWyze is the product.** Domain: `dealerwyze.com`. No hyphens. Capital D, capital W.
3. **Least risk path.** Each phase is an independent, deployable unit. One thing breaks
   → one rollback, nothing else affected.
4. **Onboarding automation is a separate project.** This plan ends when the platform
   is clean multi-tenant. New dealer sign-up flow is its own roadmap.

---

## Scope

| Area | Included |
|---|---|
| Rebrand Apollo CRM → DealerWyze | ✅ |
| apollo-crm.vercel.app → dealerwyze.com | ✅ |
| Apollo Auto treated as regular tenant | ✅ |
| Seed script for Tim's existing credentials | ✅ |
| All hardcoded dealer values parameterized | ✅ |
| All four systems: App, Google, Twilio, Retell | ✅ |
| New dealer onboarding auto-provisioning | ❌ Separate project |

---

## What Was Found — Audit Summary ✅ ALL RESOLVED

**4 systems audited. 3 issues found and fixed:**

| # | Finding | Severity | Status |
|---|---|---|---|
| N1 | VAPI callback hardcodes `APOLLO_USER_ID` with no org lookup | Critical | ✅ Fixed — `requireOrgId(await getOrgIdByPhone(toNumber))` |
| N2 | Inventory feed routes were public with no org identifier | Critical | ✅ Fixed — slug-based `/cargurus-feed/[slug]` + `/facebook-feed/[slug]` |
| N3 | `TWILIO_FROM_NUMBER` + `TWILIO_VOICE_NUMBER` were per-org env vars | High | ✅ Fixed — per-org in `org_settings.twilio_phone_number` |

---

## Phase Overview

```
Phase 0  Infrastructure        ✅ DONE — Two Vercel projects, dealerwyze.com live
Phase 1  Database              ✅ DONE — Migrations 035 + 035b applied, Apollo Auto seeded
Phase 2  Rebrand + SaaS Core   ✅ DONE — All 18 items complete, zero Apollo Auto leaks
Phase 3  SaaS Functional       ✅ DONE — All 7 items complete, multi-tenant crons + requireOrgId
Phase 4  Google Per-Org        ✅ DONE — Calendar + GBP tokens per-org in DB
Phase 5  External Systems      ✅ DONE — Twilio/Retell/Stripe/cron-job.org on dealerwyze.com
Phase 6  Env Var Cleanup       ✅ DONE — APOLLO_USER_ID + personal env vars removed
Phase 7  Verify                ✅ DONE — No hardcoded leaks found in codebase audit
```

---

## Phase 0 — Infrastructure
*No code changes. Fully reversible. Do this first.*

### 0A. Add dealerwyze.com to Vercel
1. Vercel dashboard → Project `apollo-crm` → Settings → Domains
2. Add `dealerwyze.com` (apex)
3. Add `www.dealerwyze.com` → redirect to apex
4. Vercel provides DNS records — copy them

### 0B. Configure DNS at Registrar
```
A     @     76.76.21.21
CNAME www   cname.vercel-dns.com 
```
DNS propagation: 15 min to 48 hours. Do not update webhooks until confirmed live.

### 0C. Update Vercel Environment Variables (production only)
```
NEXT_PUBLIC_APP_URL  →  https://dealerwyze.com
SAAS_MODE            →  true     (add this — does not exist yet)
```
Do NOT remove other env vars yet — that is Phase 6.

---

## Phase 1 — Database
*Apply in Supabase SQL editor. Verify Tim's org still works after each.*

### 1A. Migration: 035_dealerwyze_saas.sql

```sql
-- ============================================================
-- 035_dealerwyze_saas.sql
-- DealerWyze SaaS transition — schema additions
-- Apply in Supabase dashboard SQL editor
-- ============================================================

-- 1. Add slug to organizations (for public inventory feed URLs)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Set Tim's slug (replace UUID with actual APOLLO_USER_ID value)
UPDATE organizations
  SET slug = 'apollo-auto'
  WHERE id = 'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb';

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug
  ON organizations (slug);

-- 2. Extend org_settings with missing per-org fields
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS owner_name          TEXT,
  ADD COLUMN IF NOT EXISTS city                TEXT,
  ADD COLUMN IF NOT EXISTS state               TEXT DEFAULT 'CA',
  ADD COLUMN IF NOT EXISTS zip_code            TEXT,
  ADD COLUMN IF NOT EXISTS locations           JSONB,
  ADD COLUMN IF NOT EXISTS gbp_location_id     TEXT,
  ADD COLUMN IF NOT EXISTS gbp_account_id      TEXT,
  ADD COLUMN IF NOT EXISTS dealer_website_url  TEXT,
  ADD COLUMN IF NOT EXISTS dealer_website_inventory_path TEXT DEFAULT '/cars-for-sale',
  ADD COLUMN IF NOT EXISTS resend_from_domain  TEXT,
  ADD COLUMN IF NOT EXISTS sms_opt_out_message TEXT,
  ADD COLUMN IF NOT EXISTS sms_opt_in_message  TEXT;

-- 3. Per-org Google OAuth tokens (encrypted at rest via Supabase Vault in future)
CREATE TABLE IF NOT EXISTS org_google_tokens (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  calendar_refresh_token   TEXT,
  token_expires_at         TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);

ALTER TABLE org_google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_google_tokens_owner"
  ON org_google_tokens
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ));

-- Index for GBP polling cron
CREATE INDEX IF NOT EXISTS idx_org_settings_gbp
  ON org_settings (org_id)
  WHERE gbp_location_id IS NOT NULL;

-- Index for inventory sync cron
CREATE INDEX IF NOT EXISTS idx_org_settings_website
  ON org_settings (org_id)
  WHERE dealer_website_url IS NOT NULL;
```

---

### 1B. Seed Script — Tim's Data (apollo-auto tenant)

This moves Tim's personal configuration from Vercel env vars into his `org_settings`
DB row. Run once after migration 035 is applied.

**Non-sensitive data — run in Supabase SQL editor:**

```sql
-- ============================================================
-- 035b_seed_apollo_auto_tenant.sql
-- One-time seed: Tim's personal config → DB as regular tenant
-- ============================================================

-- Verify org exists before running
SELECT id, name FROM organizations
WHERE id = 'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb';

-- Seed org_settings for Apollo Auto
UPDATE org_settings SET
  owner_name          = 'Tim',
  city                = 'El Monte',
  state               = 'CA',
  zip_code            = '91731',
  locations           = '[
    {"name": "El Monte", "address": "10915 Garvey Ave, El Monte, CA 91733"},
    {"name": "Simi Valley", "address": "2222 Tapo Canyon Rd, Simi Valley, CA 93063"}
  ]'::jsonb,
  gbp_location_id     = 'locations/3595854674576679340',
  gbp_account_id      = 'accounts/-',
  dealer_website_url  = 'https://www.apolloauto-em.com',
  dealer_website_inventory_path = '/cars-for-sale'
WHERE org_id = 'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb';
```

**Sensitive data — Calendar OAuth token:**
Run this in Supabase dashboard SQL editor ONLY (never commit to git):

```sql
-- Replace <TOKEN> with the actual value of GMAIL_CALENDAR_REFRESH_TOKEN from .env.local
INSERT INTO org_google_tokens (org_id, calendar_refresh_token)
VALUES (
  'db5442d1-e92f-4eb0-8876-6adb1a9a0ccb',
  '<GMAIL_CALENDAR_REFRESH_TOKEN value>'
)
ON CONFLICT (org_id) DO UPDATE
  SET calendar_refresh_token = EXCLUDED.calendar_refresh_token,
      updated_at = NOW();
```

---

## Phase 2 — Rebrand + SaaS Core
*One deploy. Covers brand strings AND parameterization (double-duty changes).*
*Tim's org works throughout — reads his business_name from DB like anyone else.*

### 2A. Package + Manifest + App Metadata

**`package.json`**
```
"name": "apollo-crm"  →  "name": "dealer-wyze"
```

**`public/manifest.json`**
```json
"name": "Apollo Auto CRM"  →  "DealerWyze"
"short_name": "Apollo CRM"  →  "DealerWyze"
"description": "Mobile-first CRM for Apollo Auto dealership"
  →  "The Intelligent Operating System for Independent Dealers"
```

**`app/layout.tsx`**
```
title: 'Apollo Auto CRM'                 →  'DealerWyze'
description: 'Mobile CRM for Apollo Auto'  →  'The Intelligent Dealer Operating System'
title: 'Apollo CRM'  (themeColor/PWA)    →  'DealerWyze'
```

---

### 2B. Auth Pages (rebrand only)

**`app/(auth)/login/page.tsx`**
```
<CardTitle>Apollo Auto CRM</CardTitle>   →  <CardTitle>DealerWyze</CardTitle>
alt="Apollo Auto"                         →  alt="DealerWyze"
placeholder="you@apolloauto.com"          →  placeholder="you@example.com"
```

Same pattern for `signup/page.tsx` and `forgot-password/page.tsx`.

---

### 2C. Landing Page (rebrand only)

**`components/landing/LandingPage.tsx`**

| Find | Replace |
|---|---|
| `Apollo CRM` (heading) | `DealerWyze` |
| `Apollo CRM gives you one place...` | `DealerWyze gives you one place...` |
| `Apollo CRM started as an internal tool...` | `DealerWyze started as an internal tool...` |
| `auto-import into Apollo.` | `auto-import into DealerWyze.` |
| `support@apollocrm.app` (×2) | `support@dealerwyze.com` |
| `Apollo CRM by KMA Auto Inc` | `DealerWyze by KMA Auto Inc` |
| `— Tim, Owner · Apollo Auto · Los Angeles, CA` | `— Independent dealer, Los Angeles, CA` |

---

### 2D. Billing + Support Labels (rebrand only)

**`app/(app)/settings/billing/page.tsx`**
```
`Apollo CRM — ${PLAN_LABEL[smsPlan]}`  →  `DealerWyze — ${PLAN_LABEL[smsPlan]}`
```

**`app/(app)/support/[id]/page.tsx`** and **`app/(app)/admin/tickets/[id]/page.tsx`**
```
'Apollo Support'  →  'DealerWyze Support'  (all occurrences)
```

---

### 2E. localStorage Keys (rebrand only)

**`components/settings/FontSizeSetting.tsx`** and **`components/providers/FontSizeProvider.tsx`**
```
'apollo-font-size'  →  'dealerwyze-font-size'
```

**`components/today/OnboardingChecklist.tsx`**
```
`apollo_onboarding_dismissed_${orgId}`  →  `dealerwyze_onboarding_dismissed_${orgId}`
```

**`components/call/usePendingCall.ts`**
```
'apollo_pending_call'  →  'dealerwyze_pending_call'
```

> Note: Existing users lose font-size preference and checklist dismiss on first load.
> One-time, cosmetic — no migration needed.

---

### 2F. URL Fallbacks in Code (rebrand + SaaS double-duty)

Replace hardcoded fallback URL in every file. This is now a no-op since
`NEXT_PUBLIC_APP_URL` will always be set, but the fallback must not reference
the old domain.

| File | Line | Change |
|---|---|---|
| `lib/stripe.ts` | 15 | `'https://apollo-crm.vercel.app'` → `'https://dealerwyze.com'` |
| `lib/twilio/provision.ts` | 9 | same |
| `app/api/twilio/inbound/route.ts` | 68 | same |
| `app/api/fax/send/route.ts` | 98 | same |

---

### 2G. TCPA Opt-Out / Opt-In Messages (SaaS — CRITICAL)

**`app/api/twilio/inbound/route.ts`** lines 339 and 365

These are legal compliance messages. Currently hardcoded "Apollo Auto."
Must use org name for every tenant.

```typescript
// Before (line 339):
twimlMsg('You have been unsubscribed from Apollo Auto messages. Text START to resubscribe.')

// After:
const orgSettings = await getOrgSettings(orgId)  // already fetched earlier in route
const bizName = orgSettings?.business_name ?? 'this service'
const optOutMsg = orgSettings?.sms_opt_out_message
  ?? `You have been unsubscribed from ${bizName} messages. Text START to resubscribe.`
twimlMsg(optOutMsg)

// Same pattern for opt-in (line 365):
const optInMsg = orgSettings?.sms_opt_in_message
  ?? `You have been re-subscribed to ${bizName} messages. Reply STOP at any time.`
twimlMsg(optInMsg)
```

---

### 2H. Appointment Reminder SMS (SaaS — CRITICAL)

**`app/api/cron/check-tasks/route.ts`** line 197

```typescript
// Before:
const msgBody = `${greeting}Reminder: You have an appointment at Apollo Auto
tomorrow — ${apptTime}. Call (818) 873-3123 to reschedule. Reply STOP to opt out.`

// After — fetch org settings at top of job (once per org in the loop):
const orgSettings = await getOrgSettings(orgId)
const bizName  = orgSettings?.business_name  ?? 'the dealership'
const bizPhone = orgSettings?.dealer_cell_number
               ?? orgSettings?.twilio_phone_number
               ?? ''
const msgBody = `${greeting}Reminder: You have an appointment at ${bizName}
tomorrow — ${apptTime}. Call ${bizPhone} to reschedule. Reply STOP to opt out.`
```

---

### 2I. BHPH TCPA Disclosure (SaaS — HIGH)

**`app/api/bhph/webhook/route.ts`** line 72

```typescript
// Before:
<Message>Apollo Auto payment reminders only. Approx 4-6 msg/month.
Msg&amp;data rates may apply. STOP to cancel.</Message>

// After:
const orgSettings = await getOrgSettings(orgId)
const bizName = orgSettings?.business_name ?? 'Dealer'
<Message>${bizName} payment reminders only. Approx 4-6 msg/month.
Msg&amp;data rates may apply. STOP to cancel.</Message>
```

---

### 2J. BHPH Payment Reminder Messages (SaaS — HIGH)

**`lib/bhph/messages.ts`** — 6 template functions

Add `dealerName: string` to the `MessageVars` interface and every
template function. Replace every `Apollo Auto` with `dealerName`.

```typescript
// Before (example):
return `Hi ${first}, this is a reminder from Apollo Auto that your payment of...`

// After:
return `Hi ${first}, this is a reminder from ${vars.dealerName} that your payment of...`
```

**`lib/bhph/send.ts`** line 129 — email from address:
```typescript
// Before:
from: `Apollo Auto <payments@${process.env.RESEND_FROM_DOMAIN ?? 'apolloauto-em.com'}>`,

// After:
const fromDomain = orgSettings?.resend_from_domain ?? 'mail.dealerwyze.com'
const bizName    = orgSettings?.business_name ?? 'DealerWyze'
from: `${bizName} <payments@${fromDomain}>`,
```

---

### 2K. Voice Confirmation SMS (SaaS — CRITICAL)

**`lib/voice/ingest.ts`** line 281

```typescript
// Before:
const msgBody = `${greeting}Tim from Apollo Auto will call you back shortly
${vehicleMsg}. - Apollo Auto (818) 873-3123`

// After — orgSettings already fetched in this function:
const ownerName = orgSettings?.owner_name ?? 'our team'
const bizName   = orgSettings?.business_name ?? 'the dealership'
const bizPhone  = orgSettings?.dealer_cell_number
               ?? orgSettings?.twilio_phone_number ?? ''
const msgBody = `${greeting}${ownerName} from ${bizName} will call you back shortly
${vehicleMsg}.${bizPhone ? ` - ${bizName} ${bizPhone}` : ''}`
```

---

### 2L. Voice Summarization AI Prompt (SaaS — HIGH)

**`lib/voice/summarize.ts`** lines 43 and 6/59

```typescript
// Before (line 43):
const userPrompt = `You are analyzing a call between a customer and
Apollo Auto's virtual receptionist.`

// After — accept orgSettings parameter:
export async function generateVoiceSummary(
  transcript: string,
  orgSettings: OrgSettings | null
) {
  const bizName = orgSettings?.business_name ?? 'the dealership'
  const userPrompt = `You are analyzing a call between a customer and
  ${bizName}'s virtual receptionist.`
```

**Location enum** (lines 6, 59) — change from hardcoded union to string:
```typescript
// Before:
location?: 'Simi Valley' | 'El Monte' | null

// After:
location?: string | null
```

Also update **`types/index.ts`** line ~165 to match: `location?: string | null`
Also update **`lib/sms/parseDealerCommand.ts`** — same type change.

---

### 2M. Inventory Feed Descriptions (SaaS — HIGH)

**`lib/inventory/feeds.ts`** line 58

```typescript
// Before:
return `${v.year} ${v.make} ${v.model}${trim} available at Apollo Auto,
El Monte CA. Call (818) 873-3123.`

// After — accept orgSettings parameter in buildCarGurusCSV() and buildFacebookCSV():
const bizName  = orgSettings?.business_name ?? ''
const bizCity  = orgSettings?.city ?? ''
const bizState = orgSettings?.state ?? ''
const bizPhone = orgSettings?.dealer_cell_number ?? ''
const location = [bizCity, bizState].filter(Boolean).join(', ')
return `${v.year} ${v.make} ${v.model}${trim} available${location ? ` at ${bizName}, ${location}` : ''}.${bizPhone ? ` Call ${bizPhone}.` : ''}`
```

---

### 2N. Inventory Feed Public URLs — Slug Routing (SaaS — CRITICAL)

Current `/api/inventory/cargurus-feed` and `/api/inventory/facebook-feed` are
public endpoints with no org identifier — they hardcode `APOLLO_USER_ID`.

**Solution: Slug-based routing**
Add org slug to the URL so CarGurus and Facebook can each have their own feed URL.

```
Before: GET /api/inventory/cargurus-feed
After:  GET /api/inventory/cargurus-feed/[slug]
        e.g. https://dealerwyze.com/api/inventory/cargurus-feed/apollo-auto
```

**Files to create/rename:**
- `app/api/inventory/cargurus-feed/[slug]/route.ts` (new)
- `app/api/inventory/facebook-feed/[slug]/route.ts` (new)

**Old routes** (`app/api/inventory/cargurus-feed/route.ts`) — add 301 redirect
to `/api/inventory/cargurus-feed/apollo-auto` for backward compatibility during transition.

**Slug lookup:**
```typescript
const { slug } = params
const { data: org } = await supabase
  .from('organizations')
  .select('id')
  .eq('slug', slug)
  .single()
if (!org) return new Response('Not found', { status: 404 })
```

> Manual step after deploy: Update CarGurus portal and Facebook Business Manager
> feed URLs from old endpoint to new slug-based URL.

---

### 2O. Today Screen Header (SaaS — MEDIUM)

**`app/(app)/today/TodayContent.tsx`** line ~140

```tsx
// Before:
Apollo Auto · {new Date().toLocaleDateString(...)}

// After:
{orgSettings?.business_name ?? 'DealerWyze'} · {new Date().toLocaleDateString(...)}
```

---

### 2P. Calendar Appointment Location (SaaS — MEDIUM)

**`components/calendar/AddAppointmentSheet.tsx`** line 35
```typescript
// Before:
location: 'Apollo Auto'

// After:
location: orgSettings?.business_name ?? ''
```

**`components/customer/AddTaskModal.tsx`** lines 68–71
```typescript
// Before:
`Appointment — ${customerName} @ Apollo Auto`
`Apollo Auto | (805) 404-3873`

// After:
`Appointment — ${customerName} @ ${bizName}`
`${bizName}${bizPhone ? ' | ' + bizPhone : ''}`
```

---

### 2Q. Code Comments + User-Agent + Legal Pages (rebrand only)

**Comments** — update URL in doc comments only:

| File | Change |
|---|---|
| `app/api/cron/reset-billing-cycle/route.ts:12` | URL in comment |
| `app/api/voice/tools/route.ts:11` | URL in comment |
| `app/api/voice/retell-callback/route.ts:49` | URL in comment |
| `app/api/voice/vapi-callback/route.ts:11` | URL in comment |
| `app/api/twilio/inbound/route.ts:15` | URL in comment |
| `app/api/bhph/webhook/route.ts:4` | URL in comment |

**`lib/intelligence/rss.ts`** line 19:
```
'Mozilla/5.0 (compatible; ApolloCRM/1.0)'  →  'Mozilla/5.0 (compatible; DealerWyze/1.0)'
```

**`public/terms.md`** and **`public/privacy.md`** — full pass:
- `Apollo CRM` → `DealerWyze`
- `apollocrm.app` → `dealerwyze.com`
- Remove all `[PLACEHOLDER]` markers — finalize domain references

**`SAAS_ROADMAP.md`**:
```
# Apollo CRM — SaaS Roadmap  →  # DealerWyze — SaaS Roadmap
apollo-crm.vercel.app  →  dealerwyze.com
```

---

### 2R. Admin Phone Provisioning Label (rebrand only)

**`app/api/admin/provision-phone/route.ts`** line 104:
```typescript
`Apollo - ${dealershipName}`  →  `DealerWyze - ${dealershipName}`
```

---

### 2S. Settings Page — Website Link (SaaS — LOW)

**`app/(app)/settings/page.tsx`** line ~279:
```typescript
// Before:
{ label: 'Apollo Auto Website', href: 'https://www.apolloauto-em.com' }

// After — read from org_settings:
...(orgSettings?.dealer_website_url
  ? [{ label: 'Dealer Website', href: orgSettings.dealer_website_url }]
  : [])
```

---

### 2T. SMS/Email Templates — Token Substitution (SaaS — HIGH)

**Files:**
- `components/sms/TemplatePicker.tsx` (7 templates)
- `components/leads/NewLeadCard.tsx` (4 templates)
- `components/leads/EmailFollowUpItem.tsx` (3 templates)
- `components/customer/EmailButton.tsx` (10 templates)

**Approach:** Replace every hardcoded `Apollo Auto` with `{dealerName}` token
and every `(805) 404-3873` with `{dealerPhone}` token. These already go through
a `{firstName}`, `{vehicle}` substitution pipeline — extend it to include
`dealerName` and `dealerPhone` from `org_settings`.

```typescript
// In template rendering function, add to replacements:
.replace(/{dealerName}/g, orgSettings?.business_name ?? 'us')
.replace(/{dealerPhone}/g, orgSettings?.dealer_cell_number ?? '')
```

---

## Phase 3 — SaaS Functional
*More complex changes. Separate deploy from Phase 2.*

### 3A. VAPI Callback — Org Lookup (CRITICAL — new finding)

**`app/api/voice/vapi-callback/route.ts`** line 63

```typescript
// Before:
const orgId = process.env.APOLLO_USER_ID!

// After:
const toNumber = call.phoneNumber?.number ?? call.to_number ?? ''
const orgId = (await getOrgIdByPhone(toNumber)) ?? process.env.APOLLO_USER_ID!
```

Note: VAPI is inactive (replaced by Retell) but leaving the route live — this
fix prevents it from silently routing to Tim's account if it ever receives traffic.

---

### 3B. Retell Callback — Remove APOLLO_USER_ID Fallback (SaaS)

**`app/api/voice/retell-callback/route.ts`** line 106

```typescript
// Before:
const orgId = (await getOrgIdByPhone(toNumber)) ?? process.env.APOLLO_USER_ID!

// After — if SAAS_MODE=true, unknown phone = error:
const orgId = await getOrgIdByPhone(toNumber)
if (!orgId) {
  logger.warn('retell-callback: unknown phone, no org resolved', { toNumber })
  return new Response('OK', { status: 200 }) // return 200 to Retell, log and drop
}
```

---

### 3C. requireOrgId Helper (SaaS)

Add to **`lib/orgs/lookup.ts`**:

```typescript
/**
 * Resolves orgId or throws in SAAS_MODE.
 * Replaces the silent APOLLO_USER_ID fallback pattern.
 */
export function requireOrgId(resolved: string | null | undefined): string {
  if (resolved) return resolved
  const saas = process.env.SAAS_MODE === 'true'
  const fallback = process.env.APOLLO_USER_ID
  if (!saas && fallback) return fallback
  throw new Error('SAAS_MODE: could not resolve org — check phone/email routing')
}
```

Use `requireOrgId()` everywhere `?? process.env.APOLLO_USER_ID!` appears.

---

### 3D. Sync-Inventory Cron — Iterate All Orgs (SaaS — CRITICAL)

**`app/api/cron/sync-inventory/route.ts`**

```typescript
// Before:
const orgId = process.env.APOLLO_USER_ID
// ... sync only Tim's org

// After:
const { data: orgs } = await supabase
  .from('org_settings')
  .select('org_id, dealer_website_url, dealer_website_inventory_path')
  .not('dealer_website_url', 'is', null)

for (const org of orgs ?? []) {
  // existing sync logic, parameterized with org.org_id and org.dealer_website_url
}
```

---

### 3E. Poll-Reviews Cron — Iterate All Orgs (SaaS — CRITICAL)

**`app/api/cron/poll-reviews/route.ts`**

```typescript
// Before:
const orgId = process.env.APOLLO_USER_ID

// After:
const { data: orgs } = await supabase
  .from('org_settings')
  .select('org_id, gbp_location_id, gbp_account_id')
  .not('gbp_location_id', 'is', null)

for (const org of orgs ?? []) {
  // existing review poll logic, using org.gbp_location_id
}
```

---

### 3F. Location Type Refactor (SaaS)

**`types/index.ts`** — change union to string:
```typescript
// Before:
location?: 'Simi Valley' | 'El Monte' | null

// After:
location?: string | null
```

**`lib/sms/parseDealerCommand.ts`** — update AI prompt to include org locations:
```typescript
// Load org locations at the top of the command parser, pass to AI prompt:
const locations = orgSettings?.locations as Array<{name: string}> ?? []
const locationNames = locations.map(l => l.name).join(', ') || 'main lot'
// Include locationNames in the AI system prompt
```

**`lib/voice/summarize.ts`** — same pattern — inject org locations into AI prompt:
```typescript
const locations = orgSettings?.locations as Array<{name: string}> ?? []
const locationList = locations.map(l => l.name).join(', ') || 'dealership'
// Include in prompt: "Possible appointment locations: ${locationList}"
```

---

### 3G. Google Calendar Location Address Lookup (SaaS)

**`lib/google/calendar.ts`** lines 40–41

```typescript
// Before:
const ADDRESS_MAP: Record<string, string> = {
  'El Monte': '4108 Tyler Ave, El Monte, CA 91731',
  'Simi Valley': '2222 Tapo Canyon Rd, Simi Valley, CA 93063',
}

// After — accept orgSettings, build map dynamically:
function buildAddressMap(orgSettings: OrgSettings | null): Record<string, string> {
  const locations = (orgSettings?.locations ?? []) as Array<{name: string, address: string}>
  return Object.fromEntries(locations.map(l => [l.name, l.address]))
}
```

---

## Phase 4 — Google Per-Org
*Moves Tim's Calendar/GBP OAuth from shared Vercel env var to per-org DB row.*

### 4A. Update GBP Functions

**`lib/google/gbp.ts`**

```typescript
// Before:
const refreshToken = process.env.GMAIL_CALENDAR_REFRESH_TOKEN!
const locationName = process.env.GBP_LOCATION_ID!

// After:
export async function fetchGbpReviews(orgId: string) {
  const { data: tokens } = await supabase
    .from('org_google_tokens')
    .select('calendar_refresh_token')
    .eq('org_id', orgId)
    .single()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('gbp_location_id, gbp_account_id')
    .eq('org_id', orgId)
    .single()

  const refreshToken = tokens?.calendar_refresh_token
  const locationName = settings?.gbp_location_id
  if (!refreshToken || !locationName) return []

  // ... existing logic unchanged
}
```

---

### 4B. Update Calendar Functions

**`lib/google/calendar.ts`** — accept `orgId`, fetch token from `org_google_tokens`:

```typescript
export async function createCalendarEvent(
  orgId: string,
  event: CalendarEventInput
) {
  const { data: tokens } = await supabase
    .from('org_google_tokens')
    .select('calendar_refresh_token')
    .eq('org_id', orgId)
    .single()

  if (!tokens?.calendar_refresh_token) {
    logger.warn('createCalendarEvent: no calendar token for org', { orgId })
    return null  // graceful no-op — calendar not configured
  }
  // ... existing OAuth + event creation logic
}
```

---

## Phase 5 — External Systems
*Do AFTER dealerwyze.com DNS is confirmed live. All steps are manual.*

### 5A. Twilio Console
Go to: Twilio Console → Phone Numbers → Manage → [each dealer number]

| Webhook | Old URL | New URL |
|---|---|---|
| SMS Incoming | `.../api/twilio/inbound` | `https://dealerwyze.com/api/twilio/inbound` |
| Fax callback | `.../api/fax/callback` | `https://dealerwyze.com/api/fax/callback` |

### 5B. Retell Dashboard
Go to: Retell dashboard → Agent settings

| Setting | New Value |
|---|---|
| Post-call Webhook URL | `https://dealerwyze.com/api/voice/retell-callback` |
| Tool Call Webhook URL | `https://dealerwyze.com/api/voice/tools?secret=<LEADS_POLL_SECRET>` |

### 5C. Stripe Dashboard
1. Developers → Webhooks → Add endpoint: `https://dealerwyze.com/api/stripe/webhook`
2. Copy new `STRIPE_WEBHOOK_SECRET` → update in Vercel env vars
3. Run both endpoints in parallel for 7 days
4. Delete old endpoint after confirmed working

### 5D. Cron-job.org
Update ALL job URLs from `apollo-crm.vercel.app` to `dealerwyze.com`:

| Job | New URL |
|---|---|
| check-tasks | `https://dealerwyze.com/api/cron/check-tasks` |
| sync-leads | `https://dealerwyze.com/api/cron/sync-leads` |
| poll-reviews | `https://dealerwyze.com/api/cron/poll-reviews` |
| sync-inventory | `https://dealerwyze.com/api/cron/sync-inventory` |
| reset-billing-cycle | `https://dealerwyze.com/api/cron/reset-billing-cycle` |

### 5E. Inventory Feed URLs
Update feed URLs in CarGurus dealer portal and Facebook Business Manager Catalog:

| Feed | New URL |
|---|---|
| CarGurus | `https://dealerwyze.com/api/inventory/cargurus-feed/apollo-auto` |
| Facebook | `https://dealerwyze.com/api/inventory/facebook-feed/apollo-auto` |

> Old routes (`/cargurus-feed` without slug) will 301 redirect to the slug URL
> for 30 days, then be removed.

### 5F. Support Email
Set up `support@dealerwyze.com`:
- **Option:** Cloudflare Email Routing (free) → forward to `kmaautosinc@gmail.com`

---

## Phase 6 — Env Var Cleanup
*Remove Tim's personal credentials from Vercel after all phases confirmed working.*

### Remove from Vercel Production:

| Env Var | Why Remove |
|---|---|
| `APOLLO_USER_ID` | Apollo Auto is now a regular tenant. `SAAS_MODE=true` enforces DB lookup. |
| `GMAIL_CALENDAR_REFRESH_TOKEN` | Moved to `org_google_tokens` for Tim's org (Phase 1B) |
| `GBP_LOCATION_ID` | Moved to `org_settings.gbp_location_id` for Tim's org (Phase 1B) |
| `GBP_ACCOUNT_ID` | Moved to `org_settings.gbp_account_id` for Tim's org (Phase 1B) |
| `TWILIO_FROM_NUMBER` | Per-org in `org_settings.twilio_phone_number` |
| `TWILIO_VOICE_NUMBER` | Per-org in `org_settings.twilio_phone_number` |

### Keep in Vercel (Platform-Level — Correct):

| Env Var | Reason |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Platform domain = `https://dealerwyze.com` |
| `SAAS_MODE` | `true` — enforces multi-tenant behavior |
| `ANTHROPIC_API_KEY` | Platform AI — COGS for all orgs |
| `GROQ_API_KEY` | Platform AI — COGS for all orgs |
| `TWILIO_ACCOUNT_SID` | Master Twilio account (buys numbers for all orgs) |
| `TWILIO_AUTH_TOKEN` | Master Twilio account |
| `RETELL_API_KEY` | Platform Retell (provisions agents for all orgs) |
| `RETELL_WEBHOOK_SECRET` | Platform webhook validation |
| `STRIPE_SECRET_KEY` | Platform billing |
| `STRIPE_WEBHOOK_SECRET` | Platform billing (new value from Phase 5C) |
| `STRIPE_PRICE_ID_*` | Platform products |
| `SUPABASE_URL` | Platform DB |
| `NEXT_PUBLIC_SUPABASE_URL` | Platform DB |
| `SUPABASE_SERVICE_ROLE_KEY` | Platform DB |
| `CRON_SECRET` | Platform cron auth |
| `LEADS_POLL_SECRET` | Platform poll auth |
| `GMAIL_CLIENT_ID` | Platform OAuth app (shared, correct) |
| `GMAIL_CLIENT_SECRET` | Platform OAuth app (shared, correct) |
| `RESEND_API_KEY` | Platform email sender |

### Keep in .env.local only (dev):
```
APOLLO_USER_ID         # dev fallback only
GMAIL_CALENDAR_REFRESH_TOKEN  # remove once Tim confirms calendar works from DB
DEV_LOGIN_SECRET
```

---

## Phase 7 — Verify
*Create a second test org to prove true multi-tenancy before any marketing.*

### Critical Path Tests

| Test | Pass Condition |
|---|---|
| `dealerwyze.com` loads app | ✅ No errors, DealerWyze branding |
| PWA install prompt | Shows "DealerWyze" |
| Tim's org: send SMS | Sends, no errors |
| Tim's org: receive SMS | Routes to Tim's account |
| Tim's org: appointment reminder | Says "Apollo Auto" + Tim's phone (from DB) |
| Tim's org: TCPA opt-out | Says "Apollo Auto messages" (from DB) |
| Tim's org: BHPH payment reminder | Says "Apollo Auto" (from DB) |
| Tim's org: voice call | "Apollo Auto" greeting, routes to Tim's account |
| Tim's org: CarGurus feed | `dealerwyze.com/api/inventory/cargurus-feed/apollo-auto` returns CSV |
| Test org: appointment reminder | Shows TEST ORG name + phone, NOT Apollo Auto |
| Test org: voice call | Routes to test org, NOT Tim |
| Test org: inventory feed | `dealerwyze.com/api/inventory/cargurus-feed/[test-slug]` |
| Stripe webhook | Fires on `dealerwyze.com` endpoint |
| All cron jobs | Return 200 at new URLs |

### Data Leak Verification
After Phase 3 is deployed, run these greps against the codebase — all should return
zero results in functional code:

```bash
# In apollo-crm/ directory:
grep -rn "818" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
grep -rn "805" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
grep -rn "El Monte" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
grep -rn "Simi Valley" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
grep -rn "Apollo Auto" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
grep -rn "apolloauto-em" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
grep -rn "apollo-crm.vercel.app" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
```

> Remaining "Apollo Auto" hits in templates (TemplatePicker, EmailButton, etc.) should now
> all be `{dealerName}` tokens — none should be the literal string.

---

## Files NOT Changing

These reference "Apollo Auto" but are Tim's tenant data in the DB — not product code:

- `lib/leads/poll.ts` — Tim's Gmail client; other orgs use `email_accounts` table ✅
- `app/api/inventory/sync/route.ts` — After Phase 3D, reads `dealer_website_url` from DB ✅
- Seed SQL files — contain Tim's values, never deployed to production code ✅

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Tim's SMS/voice breaks during transition | Phase 1B seed script runs BEFORE Phase 2 deploy — Tim's DB row populated before hardcodes are removed |
| DNS propagation delays | apollo-crm.vercel.app stays live throughout — no hard cutover |
| Stripe webhook gap | Run both endpoints in parallel for 7 days |
| Calendar events fail after token move | `createCalendarEvent` returns null gracefully if no token — no crash |
| GBP reviews stop during move | poll-reviews cron skips orgs with no gbp_location_id — no crash |
| New SAAS_MODE=true breaks fallbacks | `requireOrgId()` logs clearly — easy to diagnose |

---

## Rollback Plan

Each phase is independently reversible:
- **Phase 2 code** → `git revert HEAD && npx vercel --prod`
- **Phase 1 DB** → columns are additive (ALTER TABLE ADD COLUMN) — rollback by dropping columns
- **Phase 5 webhooks** → revert URLs in Twilio/Retell/Stripe consoles
- **Phase 6 env vars** → restore from `.env.local` backup

---

## Summary: What Changes by System

### Application
- Product name: `Apollo CRM` → `DealerWyze` everywhere
- All hardcoded phone/name/location references parameterized via `org_settings`
- Inventory feeds: slug-based public URLs
- Cron jobs: iterate all tenants
- `SAAS_MODE=true` + `requireOrgId()` removes APOLLO_USER_ID fallback pattern
- localStorage keys renamed

### Google
- `GMAIL_CALENDAR_REFRESH_TOKEN` → `org_google_tokens.calendar_refresh_token` (per-org)
- `GBP_LOCATION_ID` → `org_settings.gbp_location_id` (per-org)
- `GBP_ACCOUNT_ID` → `org_settings.gbp_account_id` (per-org)
- Calendar + GBP functions accept `orgId`, fetch credentials from DB
- poll-reviews cron iterates all orgs with GBP configured

### Twilio
- Webhook URLs: `apollo-crm.vercel.app` → `dealerwyze.com` (Twilio console)
- `TWILIO_FROM_NUMBER` / `TWILIO_VOICE_NUMBER` env vars removed (per-org in DB)
- TCPA messages parameterized with `org_settings.business_name`
- Appointment reminder SMS parameterized
- BHPH messages parameterized

### Retell
- Webhook URLs: `apollo-crm.vercel.app` → `dealerwyze.com` (Retell dashboard)
- Voice confirmation SMS: "Tim from Apollo Auto" → org name from DB
- Voice AI prompt: "Apollo Auto's receptionist" → org name from DB
- Location enum → dynamic from org_settings
- VAPI callback: add org lookup (was missing entirely)
- retell-callback: remove APOLLO_USER_ID fallback
