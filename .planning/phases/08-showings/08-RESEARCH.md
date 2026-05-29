# Phase 8: Showings - Research

**Researched:** 2026-05-28
**Domain:** Cal.com webhook integration, Google Calendar API, Supabase showings table extension
**Confidence:** HIGH (codebase verified directly; Cal.com payload from official docs)

---

## Summary

Phase 8 builds on a solid foundation. The `showings` table exists (migration 180) with the core columns. The `showing_count` trigger is already implemented (migration 191) — no route-level increment needed. The Google Calendar OAuth token store (`org_google_tokens.calendar_refresh_token`) and the `createCalendarEvent` / `getCalendarEvents` functions in `lib/google/calendar.ts` are fully implemented and can be reused directly.

Migration 192 needs to add three columns to `showings`: `cal_booking_uid TEXT`, `gcal_event_id TEXT`, and `cal_link TEXT` (per-listing booking URL stored on showings or org_settings; see architecture note). Migration 193 is not needed — `org_google_tokens` already exists with `calendar_refresh_token`.

Cal.com HMAC validation uses `x-cal-signature-256` header with HMAC-SHA256 over the raw body. Deduplication follows the same pattern as Stripe webhooks: insert `cal_booking_uid` to a unique column and catch `23505` conflicts. Rate limiting uses the existing Upstash limiter — add a new IP-based limiter for the Cal.com webhook endpoint.

**Primary recommendation:** Reuse `lib/google/calendar.ts` `createCalendarEvent()` with `gcal_event_id` return stored on the showing row. Add `updateCalendarEvent()` to that lib for status changes.

---

## Standard Stack

### Core (all already in project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `googleapis` | installed | Google Calendar API client | Used in `lib/google/calendar.ts` |
| `@supabase/supabase-js` | installed | DB queries | Already used everywhere |
| `crypto` (Node built-in) | — | HMAC-SHA256 for Cal.com webhook | Used in Gmail/Stripe webhooks |
| `@upstash/ratelimit` | installed | Rate limiting for Cal.com webhook | Used in `lib/rateLimit/upstash.ts` |

### No new packages required.

**Installation:** none needed.

---

## Architecture Patterns

### Existing `showings` Table (migration 180)
```sql
CREATE TABLE showings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  listing_id   UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  contact_id   UUID REFERENCES customers(id),
  agent_id     UUID REFERENCES profiles(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status       TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  feedback_json JSONB,  -- {interest_level, price_feedback, objections, notes}
  created_at   TIMESTAMPTZ DEFAULT now()
);
-- RLS: showings_org policy using get_org_id()
-- Indexes: org_id, listing_id, contact_id
```

### Migration 192 — Add columns to `showings`
```sql
-- 192_showings_cal_gcal_columns.sql
ALTER TABLE showings
  ADD COLUMN IF NOT EXISTS cal_booking_uid TEXT UNIQUE,  -- Cal.com booking UID for dedup
  ADD COLUMN IF NOT EXISTS gcal_event_id   TEXT,         -- Google Calendar event ID
  ADD COLUMN IF NOT EXISTS cal_link        TEXT;         -- stored Cal.com booking URL (optional, for reference)

CREATE INDEX IF NOT EXISTS showings_cal_booking_uid_idx ON showings(cal_booking_uid) WHERE cal_booking_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS showings_gcal_event_id_idx   ON showings(gcal_event_id)   WHERE gcal_event_id   IS NOT NULL;
```

**Migration 193 is NOT needed.** `org_google_tokens` already exists (migration 035) with `calendar_refresh_token` column. `org_google_tokens` already has `calendar_oauth_csrf` and `calendar_oauth_csrf_expires_at` (migration 103). The Google Calendar OAuth connect flow (`/api/google/calendar-callback`) is already implemented.

### `showing_count` trigger (migration 191 — already implemented)
```sql
-- ALREADY EXISTS — do not re-implement at route level
CREATE TRIGGER trg_listing_showing_count
  AFTER INSERT OR DELETE ON showings
  FOR EACH ROW EXECUTE FUNCTION sync_listing_showing_count();
```
The trigger increments `vehicles.showing_count` on INSERT and decrements on DELETE. **Route code must never manually update `showing_count`.**

### Google Calendar — reuse `lib/google/calendar.ts`

Token lookup: `org_google_tokens.calendar_refresh_token` keyed by `org_id`.
OAuth client: uses `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` env vars (same creds for GCal).

`createCalendarEvent()` is already implemented — returns `{ htmlLink, eventId }`. Store `eventId` as `gcal_event_id` on the showing row.

**Gap:** `updateCalendarEvent()` is not implemented. Must be added to `lib/google/calendar.ts` for SHOW-08 (update on status change or reschedule). Pattern:
```typescript
// Add to lib/google/calendar.ts
export async function updateCalendarEvent(
  orgId: string,
  gcalEventId: string,
  patch: Partial<CalendarEventInput> & { cancelled?: boolean }
): Promise<{ ok: boolean }> {
  // lookup calendar_refresh_token from org_google_tokens
  // calendar.events.patch({ calendarId: 'primary', eventId: gcalEventId, requestBody: {...} })
  // if patch.cancelled: calendar.events.delete or set status: 'cancelled'
}
```

### Cal.com Booking Link Format
```
https://cal.com/{username}/{event-slug}
```
For per-listing links, agents create one Cal.com event type (e.g. "Property Showing — 30 min") and share the URL with a `?notes=listingId` query param OR use a pre-fill URL. **There is no Cal.com API call needed to generate the link** — it is a static URL composed from the agent's Cal.com username + event type slug.

Per-listing parameterization can be done via Cal.com's prefill params:
```
https://cal.com/agentusername/showing?notes=listing:VEHICLE_UUID
```
The `notes` field is passed through to the webhook payload as `payload.responses.notes` or `payload.metadata`.

Agents store their Cal.com username in `org_settings` (new column, or existing `org_settings` JSONB). **Recommendation:** Add `calcom_username TEXT` and `calcom_event_slug TEXT` to `org_settings` in migration 192, so the link is composable server-side.

### Cal.com Webhook Handler Route
```
POST /api/cal/webhook
```
**Not** under `/api/listings/` — use `/api/cal/webhook` to keep it generic across listings.

### Cal.com HMAC Validation Pattern
```typescript
// Source: Cal.com official docs — x-cal-signature-256 header
import crypto from 'crypto'

function verifyCalWebhook(rawBody: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(rawBody)
  const expected = hmac.digest('hex')
  // timing-safe compare
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
```
Header: `x-cal-signature-256`
Secret: `process.env.CALCOM_WEBHOOK_SECRET`

**Important:** Read raw body with `req.text()` before any JSON parsing (same as Stripe webhook pattern).

### Cal.com Webhook Payload (BOOKING_CREATED)
```typescript
// triggerEvent + createdAt are top-level; booking data is in payload
interface CalWebhookBody {
  triggerEvent: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED'
  createdAt: string
  payload: {
    uid: string           // booking UID — use as cal_booking_uid for dedup
    title: string
    startTime: string     // ISO 8601
    endTime: string
    attendees: Array<{
      name: string
      email: string
      timeZone: string
    }>
    organizer: {
      name: string
      email: string
    }
    responses?: {         // prefill fields submitted by booker
      notes?: { value: string }
      name?: { value: string }
      email?: { value: string }
    }
    metadata?: Record<string, string>  // custom fields
    status: 'ACCEPTED' | 'PENDING' | 'CANCELLED'
  }
}
```

### Deduplication for Cal.com Webhook
Follow exact Stripe pattern — `cal_booking_uid UNIQUE` column on `showings`, catch `23505`:
```typescript
const { error: dedupError } = await supabase
  .from('showings')
  .insert({ ...showingData, cal_booking_uid: payload.uid })
if (dedupError?.code === '23505') {
  return NextResponse.json({ received: true, duplicate: true })
}
```

### Rate Limiting for Cal.com Webhook
Add to `lib/rateLimit/upstash.ts`:
```typescript
const _calWebhookLimiter = makeLimiter(redis, { requests: 100, windowSeconds: 60 })
export const calWebhookLimiter = (ip: string) => check(_calWebhookLimiter, `calwh:${ip}`)
```
100/min per IP — Cal.com retries are infrequent; this blocks floods without dropping legitimate retries.

### Recommended Project Structure (new files)
```
app/api/cal/
└── webhook/
    └── route.ts          # POST — HMAC verify, dedup, create showing

app/api/showings/
├── route.ts              # GET (list for listing) + POST (manual create)
└── [id]/
    └── route.ts          # PATCH (status, feedback) + DELETE

app/(app)/listings/[id]/
└── ShowingTimeline.tsx   # Timeline UI component (tab or section)

lib/google/calendar.ts    # ADD: updateCalendarEvent(), deleteCalendarEvent()
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `showing_count` increment | Route-level UPDATE vehicles SET showing_count = showing_count + 1 | Trigger `trg_listing_showing_count` (migration 191) | Already implemented; race-condition-safe |
| GCal OAuth token management | Custom token refresh | `googleapis` OAuth2 client with `refresh_token` — auto-refreshes access token | Already implemented in `lib/google/calendar.ts` |
| GCal event creation | Raw REST calls | `createCalendarEvent()` in `lib/google/calendar.ts` | Already implemented; handles timezone, reminders |
| Webhook dedup across Vercel instances | In-process Map | `cal_booking_uid UNIQUE` column on `showings` + catch 23505 | Proven pattern from Stripe webhook |
| Rate limiting | In-process counters | Upstash `makeLimiter` in `lib/rateLimit/upstash.ts` | Already configured; cross-instance safe |
| Cal.com booking link generation | Cal.com API call | Static URL composition: `https://cal.com/{username}/{slug}` | No API needed; agent stores username in org_settings |

---

## Common Pitfalls

### Pitfall 1: Re-reading body after HMAC validation
**What goes wrong:** Cal.com HMAC must be computed over the raw body string. If you call `req.json()` first, `req.text()` returns empty (body already consumed).
**How to avoid:** Always `const rawBody = await req.text()` first, then `JSON.parse(rawBody)` after signature check.
**Pattern:** This is exactly how Stripe webhook route does it (`const body = await req.text()`).

### Pitfall 2: `showing_count` double-increment
**What goes wrong:** If a route also does `UPDATE vehicles SET showing_count = showing_count + 1` alongside inserting a showing, `showing_count` increments twice.
**How to avoid:** Never touch `showing_count` in route code. The trigger handles it.

### Pitfall 3: GCal token not present — silent failure
**What goes wrong:** `createCalendarEvent` returns `{ htmlLink: null, eventId: null }` if no `calendar_refresh_token` exists for the org. If the route treats null eventId as an error, showing creation fails.
**How to avoid:** GCal sync is best-effort. Create the showing record first, then attempt GCal sync. Store `gcal_event_id` only if non-null. Never block showing save on GCal failure.

### Pitfall 4: Cal.com BOOKING_CANCELLED webhook — delete or status-update?
**What goes wrong:** On cancellation, if you delete the showing, the trigger decrements `showing_count`. If you soft-delete by setting `status = 'cancelled'`, `showing_count` stays inflated.
**How to avoid:** Use `DELETE` from `showings` for Cal.com cancellations (so the trigger corrects the count), or use status update and manually decrement — pick one and be consistent. **Recommendation:** soft-delete to `status = 'cancelled'` and do NOT rely on `showing_count` being perfect for cancelled bookings (showing_count is documented as "scheduled showings count" only, so inflating on cancellation is a product decision).
**Cleaner:** Keep `showing_count` as total ever scheduled (trigger on INSERT only — but trigger currently also decrements on DELETE). Review migration 191 trigger behavior before deciding.

### Pitfall 5: Cal.com webhook receiving events for other org's listings
**What goes wrong:** Cal.com webhook is a single global endpoint. If multiple agents use Cal.com, the webhook receives bookings for all of them. You must extract `org_id` from the booking payload (via `responses.notes` or `metadata`) to route correctly.
**How to avoid:** When generating the Cal.com link, include `?metadata[orgId]=UUID&metadata[listingId]=UUID` in the prefill URL. Read from `payload.metadata.orgId` and `payload.metadata.listingId` in the webhook handler. Validate that `listingId` belongs to `orgId`.

### Pitfall 6: GCal event update without stored `gcal_event_id`
**What goes wrong:** If GCal sync failed on creation, `gcal_event_id` is null. PATCH showing route tries to update GCal with null ID and crashes or silently no-ops.
**How to avoid:** Guard with `if (showing.gcal_event_id) { await updateCalendarEvent(...) }`. Never attempt GCal update when `gcal_event_id` is null.

### Pitfall 7: `feedback_json` vs `feedback_notes` naming
**What goes wrong:** Requirements say "feedback_notes" but the DB column is `feedback_json` (JSONB, storing structured `{interest_level, price_feedback, objections, notes}`). TypeScript type is `ShowingFeedback` in `types/index.ts`.
**How to avoid:** Use `feedback_json` (existing column). SHOW-04 "add post-showing feedback notes" maps to updating `feedback_json.notes`. No migration needed for this — column already exists. Do NOT add a separate `feedback_notes TEXT` column.

---

## Code Examples

### Creating a showing (manual — SHOW-01)
```typescript
// Source: codebase pattern from activities route
const { data: showing, error } = await supabase
  .from('showings')
  .insert({
    org_id:       profile.org_id,
    listing_id:   body.listing_id,
    contact_id:   body.contact_id ?? null,
    agent_id:     profile.id,
    scheduled_at: body.scheduled_at,
    status:       'scheduled',
    feedback_json: null,
  })
  .select()
  .single()

// GCal sync — best-effort, non-blocking
if (showing) {
  const gcal = await createCalendarEvent({
    summary: `Showing: ${listingAddress}`,
    description: body.notes ?? '',
    startDateTimeIso: body.scheduled_at,
    durationMin: 60,
  }, profile.org_id)
  if (gcal.eventId) {
    await supabase.from('showings').update({ gcal_event_id: gcal.eventId }).eq('id', showing.id)
  }
}
```

### Cal.com webhook handler skeleton
```typescript
// app/api/cal/webhook/route.ts
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()  // MUST be first
  const sig = req.headers.get('x-cal-signature-256') ?? ''
  const secret = process.env.CALCOM_WEBHOOK_SECRET!

  // HMAC verify
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(rawBody)
  const expected = hmac.digest('hex')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length === 0 || sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const body = JSON.parse(rawBody) as CalWebhookBody

  if (body.triggerEvent !== 'BOOKING_CREATED') {
    return NextResponse.json({ received: true, skipped: true })
  }

  const { uid, startTime, attendees, metadata } = body.payload
  const orgId     = metadata?.orgId
  const listingId = metadata?.listingId

  if (!orgId || !listingId) {
    return NextResponse.json({ error: 'Missing orgId or listingId in metadata' }, { status: 400 })
  }

  // Dedup via unique constraint on cal_booking_uid
  const supabase = createServiceClient()
  const { error: insertError } = await supabase.from('showings').insert({
    org_id:          orgId,
    listing_id:      listingId,
    scheduled_at:    startTime,
    status:          'scheduled',
    cal_booking_uid: uid,
    // contact_id: upsert customer by email if attendees[0].email exists
  })

  if (insertError?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (insertError) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
```

### GCal OAuth connect — existing pattern (DO NOT re-implement)
Already fully implemented:
- Connect URL: `GET /api/settings/org` triggers redirect to Google OAuth with `calendar` scope
- Callback: `GET /api/google/calendar-callback` — stores `calendar_refresh_token` in `org_google_tokens`
- Token read: `lib/google/calendar.ts` reads from `org_google_tokens` by `org_id`
- Env vars: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` (same creds, GCal scope added at consent time)

### Listing showings timeline query (SHOW-02)
```typescript
const { data } = await supabase
  .from('showings')
  .select(`
    id, scheduled_at, status, feedback_json, gcal_event_id,
    contact:customers(id, name, primary_phone, email),
    agent:profiles(id, full_name)
  `)
  .eq('listing_id', listingId)
  .eq('org_id', profile.org_id)
  .order('scheduled_at', { ascending: false })
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Manual `showing_count++` in route | DB trigger `trg_listing_showing_count` (migration 191) | Race-condition-free; no route code needed |
| Separate `gcal_tokens` table | `org_google_tokens` (migration 035) with `calendar_refresh_token` | Already exists; migration 193 not needed |
| `feedback_notes TEXT` column | `feedback_json JSONB` with structured fields | Already in schema; no new column needed |

**Key finding:** Migration 193 was listed as "gcal_tokens if not present" — it is already present. Migration 192 only needs to add `cal_booking_uid`, `gcal_event_id`, and `cal_link` to `showings`.

---

## Open Questions

1. **Cal.com link storage location**
   - What we know: Link is `https://cal.com/{username}/{slug}?metadata[orgId]=X&metadata[listingId]=Y`
   - What's unclear: Where agent stores their Cal.com username/slug — `org_settings` vs. `profiles`
   - Recommendation: Add `calcom_username TEXT` and `calcom_event_slug TEXT` to `org_settings` in migration 192. Per-listing link is generated client-side or via API from these two values + listing ID.

2. **BOOKING_CANCELLED / BOOKING_RESCHEDULED handling**
   - What we know: Cal.com sends separate webhook events for these
   - What's unclear: Scope of SHOW-07 — does "auto-created" imply auto-cancelled/rescheduled too?
   - Recommendation: Handle `BOOKING_CANCELLED` in the webhook (set status to `cancelled` by `cal_booking_uid`). Handle `BOOKING_RESCHEDULED` by updating `scheduled_at`. Both are low-effort additions to the same webhook handler.

3. **GCal scope on existing connected accounts**
   - What we know: Gmail OAuth connect uses only Gmail scopes (readonly, modify, send). Calendar scope is separate OAuth flow via `/api/google/calendar-callback`.
   - What's unclear: Whether RE agents have already connected Google Calendar or only Gmail.
   - Recommendation: SHOW-08 requires `org_google_tokens.calendar_refresh_token` to be non-null. UI should show "Connect Google Calendar" CTA if it's null, identical to existing calendar connect flow.

---

## Sources

### Primary (HIGH confidence — verified from codebase)
- `supabase/migrations/180_re_tables.sql` — showings table columns confirmed
- `supabase/migrations/191_listing_showing_count_trigger.sql` — trigger confirmed, do not re-implement
- `supabase/migrations/035_dealerwyze_saas.sql` — `org_google_tokens` table confirmed exists
- `supabase/migrations/103_oauth_csrf_columns.sql` — `calendar_oauth_csrf` columns confirmed
- `lib/google/calendar.ts` — `createCalendarEvent()`, `getCalendarEvents()`, token lookup pattern confirmed
- `app/api/google/calendar-callback/route.ts` — GCal OAuth callback confirmed implemented
- `app/api/stripe/webhook/route.ts` — dedup pattern (23505), raw body, HMAC pattern confirmed
- `lib/rateLimit/upstash.ts` — `makeLimiter` / `check` export pattern confirmed
- `types/index.ts` — `Showing`, `ShowingStatus`, `ShowingFeedback` types confirmed

### Secondary (MEDIUM confidence — official Cal.com docs)
- [Cal.com Webhooks Docs](https://cal.com/docs/developing/guides/automation/webhooks) — payload structure, `x-cal-signature-256` header, HMAC-SHA256 validation

---

## Metadata

**Confidence breakdown:**
- Existing schema (showings, org_google_tokens): HIGH — read directly from migrations
- showing_count trigger: HIGH — migration 191 confirmed
- GCal integration pattern: HIGH — lib/google/calendar.ts confirmed
- Cal.com HMAC validation: MEDIUM — from official Cal.com docs
- Cal.com payload field names: MEDIUM — from official Cal.com docs (uid, startTime, attendees, metadata)
- Cal.com booking link format: MEDIUM — from official docs + search

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (Cal.com webhook format is stable; GCal API is stable)
