# DealerWyze — Personal App to SaaS Transition Plan
**Version:** 1.0
**Date:** 2026-03-02
**Status:** REVIEW BEFORE IMPLEMENTING

---

## Executive Summary

The app was originally built for one dealer (Tim, Apollo Auto, El Monte CA). The
multi-tenant infrastructure is partially in place (Twilio provisioning, Retell
provisioning, Gmail OAuth per-org), but **62 hardcoded values** remain scattered
across functional code — phone numbers, dealer name, physical addresses, and
personal OAuth tokens stored as Vercel env vars.

This document defines every change needed before DealerWyze can onboard a second
dealer without exposing Tim's personal data or sending that dealer's customers
wrong information.

**Overall difficulty: Medium. Estimated effort: 2–3 focused coding sessions.**

---

## What's Already Multi-Tenant ✅

Before listing what's broken, here's what's already done:

| Feature | How it's multi-tenant |
|---|---|
| Twilio phone number | `org_settings.twilio_phone_number` — each org has its own |
| Retell voice agent | `org_settings.retell_agent_id` — each org has its own agent |
| Gmail lead ingestion | `email_accounts` table — each org connects its own Gmail/IMAP |
| Inbound SMS routing | `getOrgIdByPhone()` resolves org from Twilio "To" number |
| Voice call routing | Same — `getOrgIdByPhone()` on inbound Retell call |
| Billing cycles | Per-org in `organizations` table |
| Lead pipeline | Scoped by `user_id` (org_id) throughout |
| RLS policies | Applied (migration 021) |

This is a solid foundation. What follows is what remains.

---

## 1. Critical Issues — Must Fix Before ANY Second Dealer

These will either break functionality or leak Tim's personal data to other orgs.

---

### 1A. Inventory Sync Hard-Wired to Tim's Website

**Files:**
- `app/api/inventory/sync/route.ts` lines 122, 156–157

**Problem:**
```ts
const BASE = 'https://www.apolloauto-em.com'
const res = await fetch('https://www.apolloauto-em.com/cars-for-sale', {
  headers: { 'User-Agent': 'ApolloAuto-CRM/1.0' },
})
```
If any other org calls this endpoint, it scrapes **Tim's personal website** and
imports his inventory into their account.

**Fix:** Add `dealer_website_url` to `org_settings`. Read it per-org. If null,
return 204 (no sync configured). Remove hardcoded URL entirely.

**New org_settings field:** `dealer_website_url TEXT`

---

### 1B. Appointment Reminder SMS — Wrong Phone Number

**File:** `app/api/cron/check-tasks/route.ts` line 197

**Problem:**
```ts
const msgBody = `${greeting}Reminder: You have an appointment at Apollo Auto
tomorrow — ${apptTime}. Call (818) 873-3123 to reschedule. Reply STOP to opt out.`
```
Every dealer's customers get told to call Tim's personal phone number.

**Fix:** Look up `org_settings` for the org, substitute `business_name` and
`business_phone`. These fields already exist in the schema.

---

### 1C. Voice Call Confirmation SMS — Tim's Identity

**File:** `lib/voice/ingest.ts` line 281

**Problem:**
```ts
const msgBody = `${greeting}Tim from Apollo Auto will call you back shortly
${vehicleMsg}. - Apollo Auto (818) 873-3123`
```
Every dealer's missed-call SMS says "Tim from Apollo Auto."

**Fix:** Use `org_settings.business_name` and `org_settings.business_phone`.
Replace "Tim" with a generic "our team" or make configurable via a new
`org_settings.dealer_display_name` field.

---

### 1D. GBP Reviews — Only Works for Tim

**Files:**
- `lib/google/gbp.ts` lines 24, 34, 91
- `app/api/cron/poll-reviews/route.ts` line 19

**Problem:**
```ts
// lib/google/gbp.ts
const refreshToken = process.env.GMAIL_CALENDAR_REFRESH_TOKEN!
const locationName = process.env.GBP_LOCATION_ID!

// poll-reviews cron
const orgId = process.env.APOLLO_USER_ID
```
- One shared OAuth token (Tim's personal Google account)
- One hardcoded GBP location
- Cron only ever runs for Tim's org

**Fix:**
1. Add `gbp_location_id TEXT` and `gbp_account_id TEXT` to `org_settings`
2. Add `google_calendar_refresh_token TEXT` to `org_settings` (separate from
   the shared platform token)
3. Update GBP functions to accept `orgId` and fetch credentials from `org_settings`
4. Update cron to iterate all orgs that have `gbp_location_id` set

**New org_settings fields:** `gbp_location_id`, `gbp_account_id`,
`google_calendar_refresh_token`

---

### 1E. Cron Jobs Default to Tim's Org

**Files:**
- `app/api/cron/sync-leads/route.ts` line 20
- `app/api/cron/sync-inventory/route.ts` line 16
- `app/api/cron/poll-reviews/route.ts` line 19
- `app/api/inventory/cargurus-feed/route.ts` line 11
- `app/api/inventory/facebook-feed/route.ts` line 11

**Problem:**
```ts
const orgId = process.env.APOLLO_USER_ID   // hardcoded to Tim
```
These crons run once, for Tim's org only. Other orgs never get their inventory
synced, leads polled, or reviews fetched.

**Fix:** Each cron must query all relevant orgs and process each in a loop.
Details per cron:

| Cron | "All relevant orgs" means |
|---|---|
| `sync-leads` | All orgs with rows in `email_accounts` |
| `sync-inventory` | All orgs with `org_settings.dealer_website_url` set |
| `poll-reviews` | All orgs with `org_settings.gbp_location_id` set |
| Inventory feed routes | Accept `?orgId=` param OR use path-based routing |

---

## 2. High Priority — Fix Before Public Launch

---

### 2A. TCPA Opt-Out/Opt-In Messages

**File:** `app/api/twilio/inbound/route.ts` lines 339, 365

**Problem:**
```ts
twimlMsg('You have been unsubscribed from Apollo Auto messages. Text START to resubscribe.')
twimlMsg('You have been re-subscribed to Apollo Auto messages. Reply STOP at any time.')
```
Legal TCPA messages identify the wrong company for every other org.

**Fix:** Load org from `getOrgIdByPhone(params.To)` — already happening earlier
in the same route. Pass `org_settings.business_name` into the message strings.

---

### 2B. BHPH TCPA Disclosure

**File:** `app/api/bhph/webhook/route.ts` line 72

**Problem:**
```ts
<Message>Apollo Auto payment reminders only. Approx 4-6 msg/month.
Msg&amp;data rates may apply. STOP to cancel.</Message>
```
Wrong company name in legally required opt-in disclosure.

**Fix:** Load org settings and substitute `business_name`.

---

### 2C. BHPH Payment Reminder Messages

**File:** `lib/bhph/messages.ts` — 6 instances across SMS and email

**Problem:** Every payment reminder says "from Apollo Auto", references Apollo
Auto's phone number in the footer, and the email sender is
`payments@apolloauto-em.com`.

**Fix:**
1. `lib/bhph/messages.ts` — accept `orgSettings` parameter; substitute
   `business_name`, `business_phone` dynamically
2. `lib/bhph/send.ts` line 129 — change fallback from `apolloauto-em.com` to
   a platform Resend domain (e.g., `mail.dealerwyze.com`). Per-org email domain
   can be a future feature.
3. New `org_settings` field: `resend_from_domain TEXT` (optional per-org override)

---

### 2D. Inventory Feed Descriptions

**File:** `lib/inventory/feeds.ts` line 58

**Problem:**
```ts
return `${v.year} ${v.make} ${v.model}${trim} available at Apollo Auto,
El Monte CA. Call (818) 873-3123.`
```
CarGurus and Facebook catalog listings show Tim's dealership name and phone for
every org.

**Fix:** Accept `orgSettings` in the feed builder functions; substitute
`business_name`, `business_address`, `business_phone`.

---

### 2E. Voice AI Summarization Prompt

**File:** `lib/voice/summarize.ts` line 43

**Problem:**
```ts
const userPrompt = `You are analyzing a call between a customer and
Apollo Auto's virtual receptionist.`
```
AI prompt hardcodes Tim's business name.

**Fix:** Accept `businessName` as parameter; inject into prompt dynamically.

---

### 2F. Location Address Mapping

**Files:**
- `lib/google/calendar.ts` lines 40–41
- `components/customer/AddTaskModal.tsx` line ~24
- `lib/sms/parseDealerCommand.ts` lines 8, 15, 43
- `lib/voice/summarize.ts` lines 6, 59
- `types/index.ts` line ~165

**Problem:**
```ts
// lib/google/calendar.ts
const ADDRESS_MAP: Record<string, string> = {
  'El Monte': '4108 Tyler Ave, El Monte, CA 91731',
  'Simi Valley': '2222 Tapo Canyon Rd, Simi Valley, CA 93063',
}

// AddTaskModal
const DEALERSHIP_ADDRESS = '10915 Garvey Ave, El Monte, CA 91733'

// types/index.ts
location?: 'Simi Valley' | 'El Monte' | null
```
- Calendar events can only ever be at Tim's two locations
- Dealer SMS commands and AI voice extraction are type-constrained to Tim's locations
- TypeScript type definition locks the entire codebase to those two strings

**Fix:**
1. Add `locations JSONB` to `org_settings`:
   ```json
   [
     { "name": "Main Lot", "address": "123 Main St, City, CA 90000" },
     { "name": "Overflow Lot", "address": "456 Oak Ave, City, CA 90001" }
   ]
   ```
2. Change `location` type in `types/index.ts` from union to `string | null`
3. Update calendar address lookup to read from org's location array
4. Update `parseDealerCommand.ts` to include org locations in AI prompt context
5. Update voice summarize prompt to include org locations
6. Add location management UI in Settings → Organization

---

### 2G. SMS/Email Templates — All Hardcoded

**Files:**
- `components/sms/TemplatePicker.tsx` — 7 templates
- `components/leads/NewLeadCard.tsx` — 4 templates
- `components/leads/EmailFollowUpItem.tsx` — 3 templates
- `components/customer/EmailButton.tsx` — 10 templates

**Problem:** Every template contains "Apollo Auto", "Tim", "(805) 404-3873".
These are hardcoded React constants, not database-driven. New dealers cannot
customize them without a code deploy.

**Fix options (choose one):**

**Option A — Quick fix (2 hours):** Keep templates as code constants but replace
"Apollo Auto" with `{dealerName}` and "(805) 404-3873" with `{dealerPhone}`
token substitution at render time. Read from `org_settings` at component
initialization. Still not user-editable but at least correct per-org.

**Option B — Proper fix (1 day):** Seed default templates into the `templates`
table on org creation. Template picker reads from DB filtered by `org_id`.
Users can edit/add/delete templates. This is the correct SaaS architecture.

**Recommendation:** Option A now (before launch), Option B in a follow-up sprint.

---

### 2H. Today Screen Header Hardcoded

**File:** `app/(app)/today/TodayContent.tsx` line ~140

**Problem:**
```tsx
Apollo Auto · {new Date().toLocaleDateString(...)}
```
Every dealer's Today screen says "Apollo Auto."

**Fix:** Read `org_settings.business_name` at page load; substitute.
`business_name` already exists in `org_settings` schema.

---

### 2I. Calendar Appointment Location Default

**File:** `components/calendar/AddAppointmentSheet.tsx` line 35

**Problem:**
```ts
location: 'Apollo Auto'
```
Google Calendar events created for any org default to "Apollo Auto."

**Fix:** Use `org_settings.business_name` or first entry in `org_settings.locations`.

---

## 3. Medium Priority — Within 30 Days of Launch

---

### 3A. Settings Page — Apollo Auto Website Link

**File:** `app/(app)/settings/page.tsx` line ~279

**Problem:**
```ts
{ label: 'Apollo Auto Website', href: 'https://www.apolloauto-em.com' }
```
Tim's personal website is hardcoded in all dealers' settings pages.

**Fix:** Add `dealer_website_url` to `org_settings` (already needed for
inventory sync — item 1A). Render it dynamically in the settings page.
Show a "Configure your website" prompt if not set.

---

### 3B. APOLLO_USER_ID — Remove Fallback Pattern

**Files:** 8+ locations (`lib/leads/ingest.ts`, `lib/leads/poll.ts`,
`lib/orgs/lookup.ts`, voice callbacks, inventory routes)

**Current pattern:**
```ts
const orgId = process.env.APOLLO_USER_ID   // ← single-tenant crutch
```

**Problem:** This env var is a safety net that lets single-tenant code "work"
without multi-tenant routing. Once `SAAS_MODE=true`, any route that falls back
to this silently sends data to Tim's account.

**Fix:**
1. Set `SAAS_MODE=true` in Vercel production env
2. Audit every `APOLLO_USER_ID` usage — replace with hard errors (throw if
   org can't be resolved) rather than silent fallback
3. Keep `APOLLO_USER_ID` only in `.env.local` for local dev

**Migration approach:** Add a `requireOrgId()` helper that throws a logged 500
if org resolution fails when `SAAS_MODE=true`. Replace silent fallbacks.

---

### 3C. BHPH Email From Domain

**File:** `lib/bhph/send.ts` line 129

**Problem:**
```ts
from: `Apollo Auto <payments@${process.env.RESEND_FROM_DOMAIN ?? 'apolloauto-em.com'}>`,
```
If `RESEND_FROM_DOMAIN` is not set, emails come from Tim's personal domain.

**Fix:**
1. Move `RESEND_FROM_DOMAIN` to `org_settings.resend_from_domain`
2. Platform-level fallback should be `payments@mail.dealerwyze.com`
   (requires verifying this domain with Resend)
3. Never fall back to `apolloauto-em.com`

---

### 3D. Appointment Task Default Text

**File:** `components/customer/AddTaskModal.tsx` lines 68–71

**Problem:**
```ts
`Appointment — ${customerName} @ Apollo Auto`
`Appointment @ Apollo Auto`
`Apollo Auto | (805) 404-3873`
```

**Fix:** Same pattern — read from `org_settings`.

---

### 3E. Admin Phone Provisioning Label

**File:** `app/api/admin/provision-phone/route.ts` line 104

**Problem:**
```ts
;({ sid, phoneNumber } = await buyNumber(available[0].phoneNumber, `Apollo - ${dealershipName}`))
```
The Twilio "friendly name" for provisioned numbers starts with "Apollo -".

**Fix:** Change `'Apollo - ${dealershipName}'` to `'DealerWyze - ${dealershipName}'`.
Simple string change.

---

## 4. Low Priority — Polish Before Marketing Push

These are UI strings that don't affect functionality but affect perception.

| File | Issue | Fix |
|---|---|---|
| `app/(auth)/login/page.tsx` | Title: "Apollo Auto CRM", placeholder `you@apolloauto.com` | "DealerWyze", generic placeholder (covered in REBRAND_PLAN) |
| `app/(auth)/signup/page.tsx` | Same | Same |
| `app/(auth)/forgot-password/page.tsx` | Same | Same |
| `components/landing/LandingPage.tsx` | Testimonial: "Tim, Owner · Apollo Auto · Los Angeles, CA" | Anonymize or replace with generic story |
| `app/(app)/settings/organization/page.tsx` | Placeholder: `"Apollo Auto"` | Generic placeholder |
| `app/(onboarding)/onboarding/page.tsx` | Placeholder: `"Apollo Auto"`, address `"El Monte, CA 91731"` | Generic |
| `lib/intelligence/rss.ts` | User-Agent: `ApolloCRM/1.0` | `DealerWyze/1.0` (in REBRAND_PLAN) |

---

## 5. Database Migration Required

One new migration needed to support the items above:

**File:** `supabase/migrations/035_org_settings_saas.sql`

```sql
-- 035_org_settings_saas.sql
-- Adds per-org fields needed for full SaaS multi-tenancy

ALTER TABLE org_settings
  -- Dealer identity (these already exist as business_name, business_phone,
  -- business_address — verify schema and add only what's missing)
  ADD COLUMN IF NOT EXISTS dealer_display_name TEXT,       -- Optional "Tim" or custom short name for voice SMS
  ADD COLUMN IF NOT EXISTS dealer_website_url TEXT,        -- For inventory sync scraping
  ADD COLUMN IF NOT EXISTS dealer_website_inventory_path TEXT DEFAULT '/cars-for-sale',

  -- Google Business Profile (per-org)
  ADD COLUMN IF NOT EXISTS gbp_location_id TEXT,           -- e.g. 'locations/3595854674576679340'
  ADD COLUMN IF NOT EXISTS gbp_account_id TEXT,            -- e.g. 'accounts/-'
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT,  -- Per-org Google Calendar OAuth

  -- Email
  ADD COLUMN IF NOT EXISTS resend_from_domain TEXT,        -- Custom email domain (e.g. 'mydealer.com')

  -- TCPA (optional custom text)
  ADD COLUMN IF NOT EXISTS sms_opt_out_message TEXT,       -- Custom opt-out reply
  ADD COLUMN IF NOT EXISTS sms_opt_in_message TEXT,        -- Custom opt-in reply

  -- Locations (multi-location support)
  -- Format: [{ "name": "Main Lot", "address": "123 Main St, City, CA 90000" }]
  ADD COLUMN IF NOT EXISTS locations JSONB;

-- Index for GBP polling
CREATE INDEX IF NOT EXISTS idx_org_settings_gbp_location
  ON org_settings (org_id)
  WHERE gbp_location_id IS NOT NULL;

-- Index for inventory sync
CREATE INDEX IF NOT EXISTS idx_org_settings_dealer_website
  ON org_settings (org_id)
  WHERE dealer_website_url IS NOT NULL;
```

---

## 6. Environment Variables — What Changes

### Currently in Vercel (Tim's personal) — Move to org_settings

| Env Var | Current State | New Home |
|---|---|---|
| `GMAIL_CALENDAR_REFRESH_TOKEN` | Shared Vercel env (Tim's Google account) | `org_settings.google_calendar_refresh_token` per org |
| `GBP_LOCATION_ID` | Shared Vercel env | `org_settings.gbp_location_id` per org |
| `GBP_ACCOUNT_ID` | Shared Vercel env | `org_settings.gbp_account_id` per org |
| `RESEND_FROM_DOMAIN` | Shared Vercel env (defaults `apolloauto-em.com`) | `org_settings.resend_from_domain` per org + platform default |

### Stay in Vercel (Platform-Level — Correct)

| Env Var | Why it stays |
|---|---|
| `ANTHROPIC_API_KEY` | Platform COGS — all orgs share |
| `GROQ_API_KEY` | Platform COGS |
| `TWILIO_ACCOUNT_SID` | Master Twilio account |
| `TWILIO_AUTH_TOKEN` | Master Twilio account |
| `RETELL_API_KEY` | Platform Retell account |
| `STRIPE_SECRET_KEY` | Platform billing |
| `STRIPE_WEBHOOK_SECRET` | Platform billing |
| `SUPABASE_URL` | Platform DB |
| `SUPABASE_ANON_KEY` | Platform DB |
| `SUPABASE_SERVICE_ROLE_KEY` | Platform DB |
| `NEXT_PUBLIC_APP_URL` | Platform domain (change to dealerwyze.com) |
| `LEADS_POLL_SECRET` | Platform cron auth |

### Keep in Vercel for Now (Single-Tenant Compat)

| Env Var | Notes |
|---|---|
| `APOLLO_USER_ID` | Keep for local dev + Tim's org fallback. Remove from prod once `SAAS_MODE=true` is enforced. |
| `GMAIL_REFRESH_TOKEN` | Tim's lead poll — already superseded by `email_accounts` table but keep as fallback until Tim migrates to Gmail OAuth via the UI |

---

## 7. Settings UI — What Dealers Need to Configure

The following fields need to be exposed in Settings → Organization so dealers
can self-configure without admin intervention:

### Already Configurable
- Business name, phone, address, timezone
- Gmail lead sync (email_accounts flow)
- Twilio phone (admin only — correct)
- Voice agent (admin only — correct)

### Need to Add to Settings UI

| Field | Section | Notes |
|---|---|---|
| Dealer website URL | Integrations | For inventory auto-sync |
| Business locations | Organization | Multi-location support; replaces hardcoded El Monte/Simi Valley |
| GBP Location ID | Integrations → Google Business Profile | With instructions on where to find it |
| Google Calendar OAuth | Integrations → Calendar | OAuth flow (separate from Gmail lead sync) |
| Email from name | Notifications | "Apollo Auto" → custom display name in BHPH emails |

---

## 8. Implementation Order

**Do in this order to avoid breaking things:**

```
Sprint 1 — Database + Critical Fixes (Session 1, ~3 hours)
  1. Write + apply migration 035_org_settings_saas.sql
  2. Fix appointment reminder SMS (1B) — use org_settings.business_phone
  3. Fix voice confirmation SMS (1C) — use org_settings.business_name
  4. Fix TCPA opt-out/opt-in messages (2A) — use org_settings.business_name
  5. Fix BHPH TCPA disclosure (2B) — use org_settings.business_name
  6. Fix BHPH payment messages (2C) — parameterize with org_settings
  7. Fix inventory feed descriptions (2D) — use org_settings fields
  8. Fix voice summarize AI prompt (2E) — accept businessName param
  9. Fix Today screen header (2H) — use org_settings.business_name
  10. Fix calendar appointment location (2I) — use org_settings.business_name

Sprint 2 — Cron Jobs + Inventory (Session 2, ~3 hours)
  11. Fix inventory sync to use org_settings.dealer_website_url (1A)
  12. Fix sync-inventory cron to iterate orgs (1E)
  13. Fix sync-leads cron to not hard-require APOLLO_USER_ID
  14. Fix cargurus-feed + facebook-feed routes to support per-org
  15. Set SAAS_MODE=true + add requireOrgId() helper (3B)

Sprint 3 — GBP + Calendar + Settings UI (Session 3, ~3 hours)
  16. Move GMAIL_CALENDAR_REFRESH_TOKEN to org_settings (1D)
  17. Move GBP_LOCATION_ID, GBP_ACCOUNT_ID to org_settings (1D)
  18. Update poll-reviews cron to iterate orgs (1D)
  19. Fix location address mapping (2F) — JSONB locations
  20. Add location management to Settings UI
  21. Add GBP location + Calendar OAuth to Settings UI

Sprint 4 — Templates + Polish (Session 4, ~2 hours)
  22. Fix SMS/email templates — Option A (token substitution) (2G)
  23. Fix remaining placeholder strings (Section 4)
  24. Fix admin provision phone label (3E)
  25. Fix BHPH email from domain (3C)

Commit + deploy after each sprint.
```

---

## 9. Testing Checklist (After Implementation)

### Critical Path
- [ ] Create a second test org in Supabase
- [ ] Provision Twilio number for test org
- [ ] Trigger appointment reminder cron — verify SMS shows test org's name/phone
- [ ] Miss a voice call to test org's number — verify SMS says test org's name
- [ ] Send SMS "STOP" to test org's number — verify opt-out message shows test org's name
- [ ] Generate inventory feed for test org — verify no Apollo Auto references
- [ ] Run sync-leads cron — verify both orgs get polled (if both have email_accounts)
- [ ] Run poll-reviews cron — verify Tim's org still works with new db-stored credentials

### Data Leak Check
- [ ] Grep functional code for `'818'`, `'805'`, `'El Monte'`, `'Simi Valley'`, `'Apollo Auto'`
  in files not on the "keep" list — everything should be zero
- [ ] Verify inventory sync for test org doesn't load apolloauto-em.com inventory
- [ ] Verify BHPH emails for test org don't reference apolloauto-em.com

---

## 10. Files NOT Changing

These contain "Apollo Auto" but are **Tim's personal dealer data**, not the
product config. They don't affect other orgs:

| File | Why it stays |
|---|---|
| `lib/leads/poll.ts` (Tim's Gmail client) | Tim's org uses env var; other orgs use email_accounts table |
| `app/(app)/settings/page.tsx` website link | Tim's settings — will be dynamic once 3A is done |
| `.env.local` values | Local dev only |

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaking Tim's existing account | Medium | High | Test all changes against Tim's org before adding second org |
| SAAS_MODE=true breaks cron fallbacks | High | Medium | Add `requireOrgId()` helper with clear error logs |
| GBP OAuth migration breaks reviews | Low | Low | Keep env var as fallback during transition |
| Location type change breaks TypeScript | High | Low | Change union type to `string \| null` — minor refactor |
| Template substitution misses a placeholder | Medium | Medium | Grep sweep after implementation |

---

## Appendix: Full Reference — Hardcoded Values

### Tim's Phone Numbers in Functional Code
```
app/api/cron/check-tasks/route.ts:197       → (818) 873-3123  [appt reminder SMS]
lib/voice/ingest.ts:281                     → (818) 873-3123  [voice confirm SMS]
lib/inventory/feeds.ts:58                   → (818) 873-3123  [inventory feed desc]
components/sms/TemplatePicker.tsx           → (805) 404-3873  [7 templates]
components/leads/NewLeadCard.tsx            → (805) 404-3873  [4 templates]
components/leads/EmailFollowUpItem.tsx      → (805) 404-3873  [3 templates]
components/customer/EmailButton.tsx         → (805) 404-3873  [10 templates]
components/customer/AddTaskModal.tsx        → (805) 404-3873  [1 task template]
```

### Tim's Domain in Functional Code
```
lib/bhph/send.ts:129                        → apolloauto-em.com  [BHPH email sender]
app/api/inventory/sync/route.ts:122,156     → apolloauto-em.com  [website scraper]
```

### Tim's Locations in Type Definitions
```
types/index.ts:~165                         → 'Simi Valley' | 'El Monte' | null
lib/sms/parseDealerCommand.ts:8,15,43       → 'El Monte' | 'Simi Valley'
lib/voice/summarize.ts:6,59                 → 'Simi Valley' | 'El Monte'
lib/google/calendar.ts:40-41               → address map for both locations
components/customer/AddTaskModal.tsx:~24    → DEALERSHIP_ADDRESS constant
```

### Env Vars That Must Move to org_settings
```
GMAIL_CALENDAR_REFRESH_TOKEN → org_settings.google_calendar_refresh_token
GBP_LOCATION_ID              → org_settings.gbp_location_id
GBP_ACCOUNT_ID               → org_settings.gbp_account_id
RESEND_FROM_DOMAIN           → org_settings.resend_from_domain
```
