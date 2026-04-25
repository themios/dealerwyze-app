# DealerWyze — Claude Code Instructions

## Project Context
Multi-tenant SaaS CRM for used-car dealerships. Apollo Auto (El Monte CA) is Tim's own tenant used for testing.
**Brand:** DealerWyze | **Domain:** dealerwyze.com | **Staging:** apollo-crm.vercel.app

---

## SECURITY-FIRST MINDSET — READ THIS BEFORE EVERY CHANGE

This is a **multi-tenant SaaS** handling real PII (customer names, phones, emails, financials) and live Twilio/Stripe credentials. A single security mistake affects ALL tenants. Think adversarially before writing any code.

### Before every new API route, ask:
1. **Who can call this?** — Unauthenticated? Authenticated user? Superadmin only? Webhook-only?
2. **Can a user reach another tenant's data?** — Never trust `org_id` from request body. Always derive from `requireProfile()`.
3. **What's the worst-case abuse?** — Spam, data exfiltration, billing fraud, DoS, credential theft?
4. **What data is returned?** — Does the response include PII fields the caller shouldn't see?
5. **Does input go to a DB query, shell, or external API?** — Validate and sanitize at every boundary.

### Cross-Tenant Isolation — Zero Tolerance
- **NEVER** use `org_id` from a request body, query param, or URL segment to scope data queries without also verifying it matches `profile.org_id` from `requireProfile()`
- **ALWAYS** filter DB queries by `org_id` derived from the authenticated profile — not from the request
- **NEVER** expose one org's data (customers, vehicles, receipts, activities, phone numbers, tokens) to another org
- Superadmin routes (`requirePlatformSuperAdmin`) may query any org — but must still validate the target org exists

### PII Handling Rules
- Customer phone numbers, emails, SSN fragments, DOB, financial data — **never log, never return in error messages**
- Receipts, ledger entries, BHPH payment data — dealer-admin/finance only (check role before returning)
- `activities` table contains customer contact history — org-scoped RLS + API role checks both required
- File uploads (receipt images, fax docs, vehicle docs) — size-cap before any processing; scan for content type; never execute uploaded files

### Secrets Management — Hard Rules
- **No secrets in URL query params** — ever. Use headers (`Authorization`, `x-twilio-signature`, `x-retell-secret`, etc.)
- **No secrets in response bodies or logs** — mask tokens before logging
- **No hardcoded secrets** — always `process.env.VAR_NAME`; throw on missing for critical vars
- **All secret comparisons must use `crypto.timingSafeEqual()`** — never `===` or `!==`
- Webhook secrets: rotate immediately if ever exposed in logs, URLs, or git history

### Info Leak Prevention
- Error messages must not reveal internal structure: DB table names, column names, stack traces, org UUIDs, user IDs
- Return generic errors to clients: `{ error: 'Unauthorized' }`, `{ error: 'Not found' }` — never `{ error: error.message }` from DB errors
- 404 vs 403: prefer 404 when the resource doesn't belong to the caller's org (don't confirm existence)
- Timing attacks: use `timingSafeEqual` for any fixed-length secret comparison

### User-Facing Messages — Plain English, Always Actionable
Every message shown to a dealer (error, warning, email, in-app notification) must meet these standards:

- **No jargon or technical terms** — say "texting" not "SMS", "picture messages" not "MMS", "credit" not "buffer", "your account" not "org"
- **State what happened** — "You've used all 1,000 messages included in your plan this month."
- **State the impact** — "Outbound texting has paused."
- **Give a clear next step** — "Go to Settings → Billing to add credit and keep texting." or a direct button link
- **Email subjects must be scannable** — lead with the consequence: "Action needed: …" or "Your texting has paused — …"
- **Never leave the user stuck** — every blocked-action message must tell them exactly what to do to unblock

Bad: `"Overage buffer exhausted. Top up in billing settings to continue sending."`
Good: `"Your prepaid credit has run out. Go to Settings → Billing to add more — messages will send immediately after."`

Bad: `"MMS cap reached (200/mo). Add an overage buffer in billing settings."`
Good: `"You've reached your monthly picture message limit (200 included). Go to Settings → Billing to add prepaid credit and keep sending."`

### Input Validation — System Boundaries
- Validate and sanitize ALL user-supplied input before DB queries, external API calls, or file operations
- Date ranges: cap at 365 days max for analytics queries
- File uploads: cap base64 at 4MB before `Buffer.from()`; validate MIME type
- Phone numbers: E.164 format only for Twilio operations
- Pagination: never fetch unbounded rows — always `.limit(500)` with cursor

### Security Review Checklist — Run Before Every Commit
- [ ] New route calls `requireProfile()` as first operation
- [ ] Platform-admin route calls `requirePlatformSuperAdmin()` immediately after
- [ ] No `org_id` trusted from request body/params without profile cross-check
- [ ] No raw `role !== 'admin'` — use `isDealerAdmin()`, `canManageUsers()`, etc.
- [ ] Twilio webhooks: `validateTwilioSignature()` before reading any body params
- [ ] Webhook secrets: header-based, timing-safe comparison
- [ ] No secrets in URL query params or response bodies
- [ ] Error messages generic — no DB error text, no stack traces, no internal IDs
- [ ] Date range capped ≤365 days for any analytics/data query
- [ ] File/image uploads: size cap before processing
- [ ] DB queries scoped to `profile.org_id` (not request-supplied org_id)
- [ ] No unbounded DB queries — cursor pagination for bulk ops

---

## Stack
- Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/ui
- Supabase (Postgres + Auth + RLS + Storage)
- Twilio (SMS/MMS/fax/voice SIP), Retell AI (voice agent), Stripe (billing)
- Anthropic (receipt OCR + voice summarizer), Groq (Dealer Brief)
- Deploy: `./deploy-staging.sh` or `./deploy-prod.sh` (NO GitHub auto-deploy on prod)

---

## Architecture Rules

### Auth & Authorization
- **Always** use `requireProfile()` from `lib/auth/profile.ts` in API routes — it checks auth, `deactivated_at`, and null `org_id`
- **Never** use raw role strings like `'admin'` — use canonical helpers:
  - `isDealerAdmin(role)` — dealer_admin only
  - `canAccessBhph(role)` — everyone except dealer_rep
  - `canAccessLedger(role)` — everyone except dealer_rep
  - `canManageUsers(role)` — dealer_admin only
  - `canAccessReports(role)` — dealer_admin, dealer_manager, admin
- Platform/superadmin routes must call `requirePlatformSuperAdmin(profile.id)` — never role string checks
- Admin routes: always use `createServiceClient()` (bypasses RLS). Regular routes: `createClient()`

### API Route Patterns
```typescript
// Standard pattern for org-scoped API routes
const profile = await requireProfile()
// profile.org_id is guaranteed non-null here
// profile.deactivated_at is guaranteed null here

// Platform-admin-only routes
const profile = await requireProfile()
const denied = await requirePlatformSuperAdmin(profile.id)
if (denied) return denied
```

### Webhook Security
- **Twilio webhooks**: Must use `validateTwilioSignature()` (HMAC-SHA1, timing-safe). Build URL from `NEXT_PUBLIC_APP_URL` + path. Never use `?secret=` query params.
- **Retell webhook** (`retell-callback`): HMAC-SHA256 with timestamp replay protection — already implemented, do not change.
- **Google Pub/Sub** (`gmail/webhook`): OIDC bearer token verification via `verifyGoogleOidc()`.
- **VAPI webhook**: Use `crypto.timingSafeEqual()` — never `!==` string comparison for secrets.
- **Cron routes**: Use `validateCronAuth(req)` from `lib/cron/validateCronAuth.ts` — timing-safe, supports both Bearer and legacy x-cron-secret header.
- All secret comparisons must use `timingSafeEqual` from `crypto`.

### Staff Impersonation
- Cookie: `dealerwyze_staff_org_id` — HMAC-signed payload `orgId|writeMode` (0=read, 1=write)
- Secret: `STAFF_SESSION_SECRET` env var — **required**, app crashes on startup without it
- TTL: read-only = 2h, write-mode (Remote Admin) = 30min
- `lib/auth/staffSession.ts` — `getStaffSessionInfo()`, `buildStaffOrgCookie()`, `clearStaffOrgCookie()`
- `proxy.ts` — blocks mutations for read-only sessions; write-mode sessions pass through

### Database
- Migrations in `supabase/migrations/` — applied manually by Tim in Supabase SQL editor
- Applied through 048; PENDING: 049 (affiliate_coupons_overage), 050 (overage_rpcs_fax_cap)
- `public.get_org_id()` — SECURITY DEFINER function used in all RLS policies
- Sentinel org UUID `00000000-0000-0000-0000-000000000001` — platform staff profiles

### Rate Limiting
- Current: in-process `Map` in `proxy.ts` — **not shared across Vercel instances**
- Planned: Replace with Upstash Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
- Do not add new per-route rate limiting using the in-process map — it's ineffective on Vercel

---

## Security Checklist (run before any PR)

- [ ] No raw `role !== 'admin'` checks — use role helper functions
- [ ] Twilio webhook routes have `validateTwilioSignature()` before reading body params
- [ ] No secrets in URL query params (`?secret=`)
- [ ] All secret comparisons use `timingSafeEqual`
- [ ] New API routes call `requireProfile()` as first line
- [ ] Admin/platform routes call `requirePlatformSuperAdmin()` after `requireProfile()`
- [ ] Analytics/data queries have date range cap (≤365 days)
- [ ] File/image upload endpoints have size cap before processing

---

## Known Env Vars Required (crash on missing)
- `STAFF_SESSION_SECRET` — HMAC key for impersonation cookie (32+ random bytes)
- `SUPABASE_SERVICE_ROLE_KEY` — service client
- `TWILIO_AUTH_TOKEN` — for webhook HMAC validation
- `NEXT_PUBLIC_APP_URL` — used to build webhook URLs for Twilio HMAC (must match Twilio console exactly)
- See `.env.example` for the full list of all ~60 env vars with descriptions

---

## Abuse Mitigation (implemented)
- Per-caller voice limit: 5 calls/24h (3-min hard cap = max 15 min/caller/day)
- Voice spike detector: >10 calls/hr → `admin_alerts` (deduped 2h)
- IP /24 subnet clustering at registration: >2 orgs from same subnet in 7 days → `abuse_flags`
- Device fingerprint: SHA-256(IP + User-Agent) at registration → `abuse_flags` on match
- Progressive trust: orgs <14 days old get 50% of voice cap and SMS quota
- Shadow billing: `GET /api/admin/orgs/[id]/shadow-billing` — superadmin only

---

## Common Patterns

### Paginate large DB queries (cron jobs)
```typescript
// Never fetch unbounded rows — batch in 500s
let cursor: string | null = null
do {
  let q = supabase.from('customers').select('id').limit(500)
  if (cursor) q = q.gt('id', cursor)
  const { data } = await q
  // process data
  cursor = data?.length === 500 ? data[data.length - 1].id : null
} while (cursor)
```

### Analytics date range validation
```typescript
const toDate   = rawTo   ? new Date(rawTo)   : new Date()
const fromDate = rawFrom ? new Date(rawFrom) : new Date(Date.now() - 30 * 86400000)
if (isNaN(toDate.getTime()) || isNaN(fromDate.getTime()) ||
    (toDate.getTime() - fromDate.getTime()) / 86400000 > 365) {
  return NextResponse.json({ error: 'Date range invalid or exceeds 365 days' }, { status: 400 })
}
```

### Twilio HMAC validation (copy this pattern)
```typescript
import crypto from 'crypto'
function validateTwilioSignature(authToken: string, signature: string, url: string, params: Record<string, string>): boolean {
  const sortedParams = Object.keys(params).sort().reduce((s, k) => s + k + params[k], '')
  const expected = crypto.createHmac('sha1', authToken).update(url + sortedParams).digest('base64')
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) }
  catch { return false }
}
// Usage at top of POST handler:
const authToken  = process.env.TWILIO_AUTH_TOKEN ?? ''
const signature  = req.headers.get('x-twilio-signature') ?? ''
const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/your-webhook-path`
const paramObj   = Object.fromEntries(new URLSearchParams(await req.text()).entries())
if (!validateTwilioSignature(authToken, signature, webhookUrl, paramObj)) {
  return new NextResponse('Forbidden', { status: 403 })
}
```

---

## Cron Jobs
- `/api/cron/check-tasks` — daily: 16 jobs extracted to `lib/cron/jobs/` — receipt tasks, inventory aging, dormant, quota reset, appt reminders (V1+V2), response alerts, admin alerts, data retention, onboarding nudges, sequence delivery, full-auto sequences, review requests, Gmail watch renewal, Gmail token health, pulse surveys
- `/api/cron/sync-leads` — every 15min: Gmail + IMAP lead poll
- `/api/cron/poll-reviews` — every 4h: GBP review sync
- `/api/cron/retention-triggers` — daily 9am PT: auto-enroll customers in retention sequences
- `/api/cron/card-batch` — Mondays 6am PT: print card batches + PostGrid
- `/api/cron/process-render-queue` — every minute: Remotion Lambda video renders
- `/api/cron/data-retention` — daily: purge canceled orgs >90 days (uses `canceled_at`, not `updated_at`)
- Auth: all routes use `validateCronAuth(req)` from `lib/cron/validateCronAuth.ts` (timing-safe; supports Bearer + legacy x-cron-secret)
- Appointment reminders: V1 (`appointmentReminders.ts`) and V2 (`appointmentRemindersV2.ts`) both run — V2 is preferred; V1 deprecated, remove when V2 stable 30+ days

---

## Deployment Notes
- Set `STAFF_SESSION_SECRET` in Vercel **before** deploying — app crashes on startup without it
- Twilio webhook URLs in console must match `NEXT_PUBLIC_APP_URL` exactly (no trailing slash)
- Toll-free verification deadline: 2026-03-13 — resubmit or messaging will be restricted
- Pending migrations 049+050 must be applied in Supabase before features that depend on them

## Best Practices — Lessons Learned

These rules exist because a specific mistake was found and fixed. Follow them to avoid repeating.

### Never create a new utility function without checking lib/ first
Before writing any helper (phone formatting, date formatting, API response, etc.) check:
- `lib/utils/phone.ts` — normalizePhone, formatPhone, formatPhoneForTel
- `lib/utils/relativeTime.ts` — formatRelativeTime, formatRelative, formatRelativeWithTime
- `lib/api/respond.ts` — apiError, apiOk
- `lib/pulse/scoreColor.ts` — pulseScoreColor, pulseScoreWidgetClasses
- `lib/cron/validateCronAuth.ts` — validateCronAuth
Duplicating any of these across files caused a full audit+refactor session to clean up.

### org_settings: always .update(), never .upsert()
RLS blocks INSERT on org_settings — `.upsert()` silently fails on new rows. Always:
```typescript
await supabase.from('org_settings').update(payload).eq('org_id', profile.org_id)
```
This was found as a live bug in `app/api/settings/org/route.ts` (fixed 2026-04-24).

### Cron route auth: use validateCronAuth(), never inline ===
All cron routes must use `validateCronAuth(req)` from `lib/cron/validateCronAuth.ts`.
Inline `=== \`Bearer ${process.env.CRON_SECRET}\`` is a timing attack vector. Found in all 10 cron routes (fixed 2026-04-24).

### Check res.ok after every fetch() in client components
102 places in the app call `await fetch(...)` without checking `res.ok`. Silent failures show as blank/stale UI. Pattern:
```typescript
const res = await fetch('/api/...')
if (!res.ok) { setError('Something went wrong'); return }
const data = await res.json()
```

### catch (err: any) loses type safety
Use `unknown` for caught errors:
```typescript
catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error'
}
```

### File size limits — split when a file exceeds 400 lines
Files over 400 lines make diffs hard to review and context hard to hold. When you find yourself adding to a large file, split it first:
- Settings pages: extract each section to `sections/[Name]Section.tsx` (own state, own fetch)
- Cron routes: extract job logic to `lib/cron/jobs/[name].ts`
- Landing pages: extract each section component to `[component]/sections/[Name].tsx`
- Never add a new cron job inline to `check-tasks/route.ts` — always create a job file

### Role checks: use helpers, never raw strings
```typescript
// WRONG
if (profile.role === 'admin' || profile.role === 'dealer_admin') { ... }

// RIGHT
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
if (isDealerAdmin(profile.role)) { ... }
```
Raw role strings were found in 3 section components during the 2026-04-24 audit.

### Document V1/V2 or "experimental" files immediately
Any time a parallel/replacement version of a file exists, add a JSDoc comment at the top of both files explaining:
- What each version does
- Which is preferred
- When/why to remove the old one
Found undocumented on `appointmentReminders.ts` + `appointmentRemindersV2.ts`.

### README and .env.example must stay current
When you add a new env var, add it to `.env.example` with a description.
When you add a new cron job or major feature, update `README.md`.
Found: README was still the create-next-app boilerplate; .env.example didn't exist.

---

## Shared Utility Locations (consolidated 2026-04-24)
- Phone normalization: `lib/utils/phone.ts` → `normalizePhone()`, `formatPhone()`, `formatPhoneForTel()`
- Relative time: `lib/utils/relativeTime.ts` → `formatRelativeTime()`, `formatRelative()`, `formatRelativeWithTime()`
- Pulse score color: `lib/pulse/scoreColor.ts` → `pulseScoreColor()`, `pulseScoreWidgetClasses()`
- API response helpers: `lib/api/respond.ts` → `apiError(message, status)`, `apiOk(data)`
- Cron auth: `lib/cron/validateCronAuth.ts` → `validateCronAuth(req)` (timing-safe)
- Cron jobs: `lib/cron/jobs/[name].ts` — one file per job, imported by `check-tasks/route.ts`
- Lead parsers: `lib/leads/parseOfferUpSms.ts`, `lib/leads/parseAutoTraderSms.ts`
- `lib/utils.ts` re-exports `formatPhone`, `formatPhoneForTel`, `formatRelativeTime` for backwards compat
