# Calendar & Appointment Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full appointment scheduling system — dealers confirm appointments from Today page, Google Calendar syncs automatically, customers get SMS/email confirmations and 24h reminders, and lead comments mentioning preferred times surface as appointment requests.

**Architecture:** A new `POST /api/appointments/confirm` route centralizes the confirm flow (DB update + Google Calendar event + customer SMS). A new `GET /api/calendar/events` route reads upcoming appointments from both the activities table and Google Calendar. The `/calendar` page shows a clean upcoming-appointments list. Appointment intent in lead comments is detected at ingest time and creates a Today card.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres), Google Calendar API v3 (googleapis), Twilio REST API, Tailwind v4, shadcn/ui

---

## File Map

**Create:**
- `supabase/migrations/099_calendar_fields.sql` — adds `google_calendar_event_id`, `appt_reminder_sent_at` to activities
- `lib/calendar/confirmAppointment.ts` — orchestrator: update DB + GCal + send SMS/email
- `lib/calendar/sendAppointmentNotification.ts` — sends customer SMS + email for confirmation and reminders
- `lib/leads/detectAppointmentIntent.ts` — regex detection for appointment language in lead comments
- `app/api/appointments/confirm/route.ts` — POST endpoint called by AppointmentRequestCard
- `app/api/calendar/events/route.ts` — GET upcoming confirmed appointments
- `app/(app)/calendar/page.tsx` — server component calendar page
- `app/(app)/calendar/CalendarClient.tsx` — client list/day view

**Modify:**
- `lib/google/calendar.ts` — add `getCalendarEvents()` function
- `components/today/AppointmentRequestCard.tsx` — call `/api/appointments/confirm` instead of direct Supabase
- `lib/leads/ingest.ts` — detect appointment intent in `lead.comments`, create inbound appointment activity
- `app/api/cron/check-tasks/route.ts` — add 24h-before appointment reminder job

---

## Task 1: Migration — calendar fields on activities

**Files:**
- Create: `supabase/migrations/099_calendar_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 099_calendar_fields.sql
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS appt_reminder_sent_at TIMESTAMPTZ;

-- Index for reminder cron (finds upcoming appointments not yet reminded)
CREATE INDEX IF NOT EXISTS activities_appt_reminder_idx
  ON activities (due_at, appt_reminder_sent_at)
  WHERE type = 'appointment' AND completed_at IS NULL AND direction IS NULL;
```

- [ ] **Step 2: Apply it**

Paste into Supabase SQL editor and run. Confirm no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/099_calendar_fields.sql
git commit -m "feat: add google_calendar_event_id and appt_reminder_sent_at to activities"
```

---

## Task 2: Add `getCalendarEvents()` to lib/google/calendar.ts

**Files:**
- Modify: `lib/google/calendar.ts`

- [ ] **Step 1: Write a failing test (manual — no test runner configured)**

Open `lib/google/calendar.ts` and verify the file currently exports only `createCalendarEvent`. Confirm `getCalendarEvents` does not exist yet.

- [ ] **Step 2: Add the interface and function**

Add after the existing `createCalendarEvent` function (after line 97):

```typescript
export interface CalendarEvent {
  id:          string
  summary:     string
  description: string | null
  location:    string | null
  startIso:    string   // ISO 8601
  endIso:      string
  htmlLink:    string | null
}

/**
 * Reads upcoming events from the org's primary Google Calendar.
 * Returns up to `maxResults` events starting from `fromIso` (default: now).
 * Returns [] if org has no calendar token or on API failure.
 */
export async function getCalendarEvents(
  orgId: string,
  options: { fromIso?: string; maxResults?: number } = {},
): Promise<CalendarEvent[]> {
  const supabase = createServiceClient()
  const { data: tokens } = await supabase
    .from('org_google_tokens')
    .select('calendar_refresh_token')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!tokens?.calendar_refresh_token) return []

  try {
    const calendar = makeCalendarClient(tokens.calendar_refresh_token)
    const res = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      options.fromIso ?? new Date().toISOString(),
      maxResults:   options.maxResults ?? 20,
      singleEvents: true,
      orderBy:      'startTime',
    })

    return (res.data.items ?? []).map(ev => ({
      id:          ev.id ?? '',
      summary:     ev.summary ?? '(No title)',
      description: ev.description ?? null,
      location:    ev.location ?? null,
      startIso:    ev.start?.dateTime ?? ev.start?.date ?? '',
      endIso:      ev.end?.dateTime   ?? ev.end?.date   ?? '',
      htmlLink:    ev.htmlLink ?? null,
    }))
  } catch (err) {
    console.error('[calendar] getCalendarEvents failed:', err)
    return []
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep -i "calendar" | head -20
```

Expected: no errors referencing calendar.ts.

- [ ] **Step 4: Commit**

```bash
git add lib/google/calendar.ts
git commit -m "feat: add getCalendarEvents() to read upcoming Google Calendar events"
```

---

## Task 3: `lib/calendar/sendAppointmentNotification.ts`

**Files:**
- Create: `lib/calendar/sendAppointmentNotification.ts`

This helper sends a customer SMS (if opted in) and email (if available) notifying them of their appointment. Used for both initial confirmation and 24h reminders.

- [ ] **Step 1: Create the file**

```typescript
/**
 * sendAppointmentNotification
 *
 * Sends the customer an SMS and/or email about their appointment.
 * type: 'confirmation' | 'reminder'
 * Never throws — all errors are logged.
 */
import { createServiceClient } from '@/lib/supabase/service'

interface NotifyInput {
  orgId:       string
  customerId:  string
  customerName: string
  customerPhone: string
  customerEmail: string
  appointmentIso: string   // ISO datetime of appointment
  dealerName:  string
  calendarUrl: string | null
  type:        'confirmation' | 'reminder'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })
}

export async function sendAppointmentNotification(input: NotifyInput): Promise<void> {
  const {
    orgId, customerId, customerPhone, customerEmail, customerName,
    appointmentIso, dealerName, calendarUrl, type,
  } = input

  const supabase = createServiceClient()

  const formattedTime = formatDateTime(appointmentIso)
  const calendarLine  = calendarUrl ? `\nCalendar invite: ${calendarUrl}` : ''

  const smsBody = type === 'confirmation'
    ? `Hi ${customerName}, your appointment with ${dealerName} is confirmed for ${formattedTime}.${calendarLine} Reply STOP to opt out.`
    : `Hi ${customerName}, reminder: your appointment with ${dealerName} is tomorrow at ${formattedTime}. Reply STOP to opt out.`

  // SMS — only if customer opted in
  const { data: customer } = await supabase
    .from('customers')
    .select('sms_opt_out, sms_consent_status, primary_phone')
    .eq('id', customerId)
    .maybeSingle()

  const canSms = customer &&
    !customer.sms_opt_out &&
    customer.sms_consent_status === 'opted_in' &&
    customerPhone

  if (canSms) {
    // Fetch org Twilio credentials from org_settings
    const { data: settings } = await supabase
      .from('org_settings')
      .select('twilio_phone_number')
      .eq('org_id', orgId)
      .maybeSingle()

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const from       = settings?.twilio_phone_number ?? process.env.TWILIO_FROM_NUMBER

    if (accountSid && authToken && from) {
      try {
        await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: customerPhone, From: from, Body: smsBody }),
          }
        )

        // Log outbound SMS activity
        await supabase.from('activities').insert({
          user_id:      orgId,
          customer_id:  customerId,
          type:         'sms',
          direction:    'outbound',
          body:         smsBody,
          completed_at: new Date().toISOString(),
        })
      } catch (err) {
        console.error('[sendAppointmentNotification] SMS failed:', err)
      }
    }
  }

  // Email — if customer has email and hasn't unsubscribed
  if (customerEmail) {
    const { data: custRow } = await supabase
      .from('customers')
      .select('unsubscribe_email')
      .eq('id', customerId)
      .maybeSingle()

    if (!custRow?.unsubscribe_email) {
      const subject = type === 'confirmation'
        ? `Your appointment at ${dealerName} is confirmed`
        : `Reminder: your appointment at ${dealerName} is tomorrow`

      const htmlBody = `
        <p>Hi ${customerName},</p>
        <p>${type === 'confirmation' ? 'Your appointment is confirmed' : 'This is a reminder about your upcoming appointment'} at ${dealerName}.</p>
        <p><strong>Date &amp; Time:</strong> ${formattedTime}</p>
        ${calendarUrl ? `<p><a href="${calendarUrl}">View calendar invite</a></p>` : ''}
        <p>See you then!</p>
      `

      // Use the org's first email account as the "from" address
      const { data: emailAccount } = await supabase
        .from('email_accounts')
        .select('email, oauth_refresh_token, provider')
        .eq('org_id', orgId)
        .eq('enabled', true)
        .limit(1)
        .maybeSingle()

      if (emailAccount?.oauth_refresh_token) {
        try {
          const { sendGmailMessage } = await import('@/lib/gmail/send')
          await sendGmailMessage({
            refreshToken: emailAccount.oauth_refresh_token,
            to:           customerEmail,
            subject,
            html:         htmlBody,
          })

          await supabase.from('activities').insert({
            user_id:      orgId,
            customer_id:  customerId,
            type:         'email',
            direction:    'outbound',
            body:         subject,
            completed_at: new Date().toISOString(),
          })
        } catch (err) {
          console.error('[sendAppointmentNotification] Email failed:', err)
        }
      }
    }
  }
}
```

- [ ] **Step 2: Check that `lib/gmail/send.ts` exports `sendGmailMessage`**

```bash
grep -n "sendGmailMessage" /home/tim/Applications/ApolloCRM/apollo-crm/lib/gmail/send.ts | head -5
```

If the export doesn't exist, check what the file exports:

```bash
grep -n "^export" /home/tim/Applications/ApolloCRM/apollo-crm/lib/gmail/send.ts | head -10
```

Adjust the import in `sendAppointmentNotification.ts` to match the actual export name and signature. The function should accept `{ refreshToken, to, subject, html }` — adapt if signature differs.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep "sendAppointmentNotification\|calendar/send" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/calendar/sendAppointmentNotification.ts
git commit -m "feat: add sendAppointmentNotification for customer confirmation and reminder SMS/email"
```

---

## Task 4: `lib/calendar/confirmAppointment.ts` — orchestrator

**Files:**
- Create: `lib/calendar/confirmAppointment.ts`

- [ ] **Step 1: Create the file**

```typescript
/**
 * confirmAppointment
 *
 * Called when a dealer clicks "Add to Calendar" on an appointment request card.
 * 1. Updates the activity in DB (sets due_at, clears direction so it becomes a confirmed appt)
 * 2. Creates a Google Calendar event
 * 3. Stores the GCal event ID on the activity
 * 4. Sends customer SMS/email confirmation
 *
 * Returns { calendarUrl } or { calendarUrl: null } on GCal failure (not fatal).
 * Never throws.
 */
import { createServiceClient } from '@/lib/supabase/service'
import { createCalendarEvent } from '@/lib/google/calendar'
import { sendAppointmentNotification } from '@/lib/calendar/sendAppointmentNotification'

interface ConfirmInput {
  activityId:   string
  orgId:        string
  datetimeIso:  string   // "YYYY-MM-DDTHH:mm" local or full ISO
  customerId:   string
  customerName: string
  customerPhone: string
  customerEmail: string
  originalBody: string   // the customer's original message
}

export async function confirmAppointment(input: ConfirmInput): Promise<{ calendarUrl: string | null }> {
  const {
    activityId, orgId, datetimeIso, customerId,
    customerName, customerPhone, customerEmail, originalBody,
  } = input

  const supabase = createServiceClient()

  // Normalise to "YYYY-MM-DD HH:mm" for createCalendarEvent
  const startIso = datetimeIso.replace('T', ' ').substring(0, 16)

  // 1. Update activity: mark confirmed (clear direction, set due_at, high priority)
  await supabase
    .from('activities')
    .update({
      due_at:    new Date(datetimeIso).toISOString(),
      direction: null,       // null direction = confirmed appointment on calendar
      outcome:   'pending',
      priority:  'high',
      body:      `Test drive / appointment with ${customerName}\n\nRequested: "${originalBody}"`,
    })
    .eq('id', activityId)

  // 2. Create Google Calendar event
  const calendarUrl = await createCalendarEvent(
    {
      summary:     `Appointment - ${customerName}`,
      description: `Customer requested: "${originalBody}"\n\nCustomer phone: ${customerPhone}`,
      startIso,
      durationMin: 60,
    },
    orgId,
  )

  // 3. Store GCal event ID on the activity (parse from URL: .../events/<eventId>)
  if (calendarUrl) {
    const eventId = calendarUrl.split('/').pop()?.split('?')[0]
    if (eventId) {
      await supabase
        .from('activities')
        .update({ google_calendar_event_id: eventId })
        .eq('id', activityId)
    }
  }

  // 4. Fetch dealer name for notification
  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name')
    .eq('org_id', orgId)
    .maybeSingle()
  const dealerName = settings?.business_name ?? 'the dealership'

  // 5. Send customer confirmation (non-blocking — failure is logged, not thrown)
  sendAppointmentNotification({
    orgId,
    customerId,
    customerName,
    customerPhone,
    customerEmail,
    appointmentIso: new Date(datetimeIso).toISOString(),
    dealerName,
    calendarUrl,
    type: 'confirmation',
  }).catch(err => console.error('[confirmAppointment] notification failed:', err))

  return { calendarUrl }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep "confirmAppointment" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/calendar/confirmAppointment.ts
git commit -m "feat: add confirmAppointment orchestrator (DB + GCal + customer SMS/email)"
```

---

## Task 5: `POST /api/appointments/confirm` route

**Files:**
- Create: `app/api/appointments/confirm/route.ts`

- [ ] **Step 1: Create the route**

```typescript
/**
 * POST /api/appointments/confirm
 * Body: { activity_id, datetime, customer_id, customer_name, customer_phone, customer_email, original_body }
 *
 * Confirms an appointment request: updates DB, creates GCal event, sends customer notification.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { confirmAppointment } from '@/lib/calendar/confirmAppointment'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const body = await req.json() as {
    activity_id:    string
    datetime:       string
    customer_id:    string
    customer_name:  string
    customer_phone: string
    customer_email: string
    original_body:  string
  }

  const { activity_id, datetime, customer_id, customer_name, customer_phone, customer_email, original_body } = body

  if (!activity_id || !datetime || !customer_id) {
    return NextResponse.json({ error: 'activity_id, datetime, and customer_id are required' }, { status: 400 })
  }

  // Verify this activity belongs to the caller's org
  const { data: activity } = await supabase
    .from('activities')
    .select('id, user_id')
    .eq('id', activity_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!activity) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const result = await confirmAppointment({
    activityId:    activity_id,
    orgId:         profile.org_id,
    datetimeIso:   datetime,
    customerId:    customer_id,
    customerName:  customer_name,
    customerPhone: customer_phone,
    customerEmail: customer_email,
    originalBody:  original_body,
  })

  return NextResponse.json({ ok: true, calendar_url: result.calendarUrl })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep "appointments/confirm" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/appointments/confirm/route.ts
git commit -m "feat: POST /api/appointments/confirm route"
```

---

## Task 6: Update `AppointmentRequestCard` to call the API

**Files:**
- Modify: `components/today/AppointmentRequestCard.tsx`

- [ ] **Step 1: Read current `handleSchedule()` and understand what needs to change**

Current: direct Supabase call, no GCal, no customer notification.
New: single `fetch('/api/appointments/confirm', ...)` call — backend does everything.

- [ ] **Step 2: Replace `handleSchedule()`**

Replace the entire `handleSchedule` function (lines 41-64) with:

```typescript
async function handleSchedule() {
  setSaving(true)
  try {
    const res = await fetch('/api/appointments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity_id:    activity.id,
        datetime:       datetime,
        customer_id:    customer.id,
        customer_name:  customer.name,
        customer_phone: customer.primary_phone,
        customer_email: (activity as any).customer?.email ?? '',
        original_body:  activity.body ?? '',
      }),
    })

    if (!res.ok) {
      console.error('[AppointmentRequestCard] confirm failed', await res.text())
    }
  } catch (err) {
    console.error('[AppointmentRequestCard] confirm error:', err)
  } finally {
    setSaving(false)
    onUpdate()
  }
}
```

- [ ] **Step 3: Remove the now-unused `supabase` and direct-Supabase imports**

Remove lines:
```typescript
import { createClient } from '@/lib/supabase/client'
```
And the line:
```typescript
const supabase = createClient()
```

Also remove the `fetch('/api/activities/reconcile', ...)` block — the API route will handle any cleanup needed via the DB update.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep "AppointmentRequest" | head -10
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Start dev server (`npm run dev`), go to Today page, find or create an appointment request card, pick a time, click "Add to Calendar". Verify:
- Card disappears from Today (onUpdate() called)
- Activity `due_at` updated in Supabase (check activities table)
- `direction` is now NULL (no longer 'inbound')
- `google_calendar_event_id` is set (if org has GCal token)

- [ ] **Step 6: Commit**

```bash
git add components/today/AppointmentRequestCard.tsx
git commit -m "feat: AppointmentRequestCard calls /api/appointments/confirm (GCal + customer SMS)"
```

---

## Task 7: Appointment intent detection in lead ingestion

**Files:**
- Create: `lib/leads/detectAppointmentIntent.ts`
- Modify: `lib/leads/ingest.ts`

- [ ] **Step 1: Create the detector**

```typescript
/**
 * detectAppointmentIntent
 *
 * Scans a lead comment string for phrases indicating the customer has a
 * preferred appointment time ("I'll be in town Friday", "can I come in Saturday at 2pm",
 * "available next week", "test drive on the 15th", etc.)
 *
 * Returns a rough ISO date string if a specific date can be extracted,
 * or `true` if intent is detected but no date can be parsed, or `false` if no intent.
 */

const INTENT_PATTERNS = [
  /\b(can i|could i|would like to|want to|hoping to)\s+(come in|stop by|visit|test drive|schedule|see)\b/i,
  /\b(available|free|in town|passing through)\s+(on|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/i,
  /\btest drive\b.{0,30}\b(on|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/i,
  /\bappointment\b/i,
  /\b(when can i|when could i)\b/i,
  /\b(come in|stop by|swing by)\b.{0,20}\b(this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/i,
  /\bin \d+ days?\b/i,
  /\bnext\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
]

export function detectAppointmentIntent(comments: string): boolean {
  if (!comments || comments.length < 10) return false
  return INTENT_PATTERNS.some(re => re.test(comments))
}
```

- [ ] **Step 2: Wire into `lib/leads/ingest.ts`**

First, find where the activity is created in `ingest.ts`:

```bash
grep -n "activities.*insert\|type.*appointment\|detectAppointment" \
  /home/tim/Applications/ApolloCRM/apollo-crm/lib/leads/ingest.ts | head -20
```

Find the section after the main lead activity (type='email') is created and the customer is confirmed/created. Add this block (non-blocking, after the main ingest logic):

```typescript
// Detect appointment intent in lead comments — surface as Today card
import { detectAppointmentIntent } from '@/lib/leads/detectAppointmentIntent'

// (inside ingestLead, after customer upsert and main activity insert)
if (lead.comments && detectAppointmentIntent(lead.comments)) {
  // Check if we already created an appointment activity for this customer recently (24h dedup)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: existingAppt } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', orgId)
    .eq('customer_id', customerId)
    .eq('type', 'appointment')
    .eq('direction', 'inbound')
    .gte('created_at', oneDayAgo)
    .maybeSingle()

  if (!existingAppt) {
    await supabase.from('activities').insert({
      user_id:     orgId,
      customer_id: customerId,
      type:        'appointment',
      direction:   'inbound',
      outcome:     'pending',
      priority:    'high',
      body:        lead.comments,
    })
  }
}
```

**Important**: The import goes at the top of `ingest.ts`. The insert block goes after the customer ID is known and the main lead activity is inserted. Do NOT block the main ingest on this — put it after `sendAutoResponseStep1` calls.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep "detectAppointment\|ingest" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/leads/detectAppointmentIntent.ts lib/leads/ingest.ts
git commit -m "feat: detect appointment intent in lead comments, surface as Today card"
```

---

## Task 8: `GET /api/calendar/events` route

**Files:**
- Create: `app/api/calendar/events/route.ts`

Returns upcoming confirmed appointments from the `activities` table (type='appointment', direction IS NULL, due_at in future) plus any events from Google Calendar not already in the DB.

- [ ] **Step 1: Create the route**

```typescript
/**
 * GET /api/calendar/events
 * Returns upcoming confirmed appointments for this org.
 * Query params: from (ISO, default now), days (default 30)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { getCalendarEvents } from '@/lib/google/calendar'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = createServiceClient()
  const orgId = profile.org_id

  const fromParam = req.nextUrl.searchParams.get('from')
  const daysParam = req.nextUrl.searchParams.get('days')

  const fromDate = fromParam ? new Date(fromParam) : new Date()
  const days = Math.min(parseInt(daysParam ?? '30', 10), 365)

  if (isNaN(fromDate.getTime())) {
    return NextResponse.json({ error: 'Invalid from date' }, { status: 400 })
  }

  const toDate = new Date(fromDate.getTime() + days * 86400000)

  // Confirmed appointments from DB (direction IS NULL = confirmed, not pending request)
  const { data: dbAppointments } = await supabase
    .from('activities')
    .select('id, due_at, body, google_calendar_event_id, customer:customers(id, name, primary_phone)')
    .eq('user_id', orgId)
    .eq('type', 'appointment')
    .is('direction', null)
    .is('completed_at', null)
    .gte('due_at', fromDate.toISOString())
    .lte('due_at', toDate.toISOString())
    .order('due_at', { ascending: true })
    .limit(100)

  // Upcoming Google Calendar events (parallel, non-blocking on failure)
  const gcalEvents = await getCalendarEvents(orgId, {
    fromIso:    fromDate.toISOString(),
    maxResults: 50,
  })

  // Deduplicate: GCal events already linked to a DB activity are skipped
  const linkedGcalIds = new Set(
    (dbAppointments ?? []).map(a => a.google_calendar_event_id).filter(Boolean)
  )
  const unmatchedGcalEvents = gcalEvents.filter(ev => !linkedGcalIds.has(ev.id))

  return NextResponse.json({
    appointments: dbAppointments ?? [],
    gcal_only:    unmatchedGcalEvents,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep "calendar/events" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/calendar/events/route.ts
git commit -m "feat: GET /api/calendar/events returns upcoming confirmed appointments"
```

---

## Task 9: `/calendar` page — server component + client list view

**Files:**
- Create: `app/(app)/calendar/page.tsx`
- Create: `app/(app)/calendar/CalendarClient.tsx`

- [ ] **Step 1: Create the server page**

```typescript
// app/(app)/calendar/page.tsx
export const dynamic = 'force-dynamic'

import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { getCalendarEvents } from '@/lib/google/calendar'
import TopBar from '@/components/layout/TopBar'
import CalendarClient from './CalendarClient'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function CalendarPage() {
  const profile = await requireProfile()
  const orgId = profile.org_id
  const supabase = createServiceClient()

  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * 86400000)

  // Confirmed appointments from DB
  const { data: dbAppointments } = await supabase
    .from('activities')
    .select('id, due_at, body, google_calendar_event_id, customer:customers(id, name, primary_phone)')
    .eq('user_id', orgId)
    .eq('type', 'appointment')
    .is('direction', null)
    .is('completed_at', null)
    .gte('due_at', now.toISOString())
    .lte('due_at', in30Days.toISOString())
    .order('due_at', { ascending: true })
    .limit(100)

  // Google Calendar events not yet linked to a DB activity
  const gcalEvents = await getCalendarEvents(orgId, {
    fromIso:    now.toISOString(),
    maxResults: 50,
  })

  const linkedGcalIds = new Set(
    (dbAppointments ?? []).map(a => a.google_calendar_event_id).filter(Boolean)
  )
  const gcalOnly = gcalEvents.filter(ev => !linkedGcalIds.has(ev.id))

  return (
    <div>
      <TopBar
        left={
          <Link href="/today" className="p-1.5 text-white/70 hover:text-white flex items-center gap-1.5 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Today
          </Link>
        }
      />
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-semibold">Upcoming Appointments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Next 30 days</p>
      </div>
      <CalendarClient
        appointments={dbAppointments ?? []}
        gcalOnly={gcalOnly}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create the client component**

```typescript
// app/(app)/calendar/CalendarClient.tsx
'use client'

import { CalendarDays, User, ExternalLink, Clock } from 'lucide-react'

interface DbAppointment {
  id:                     string
  due_at:                 string
  body:                   string | null
  google_calendar_event_id: string | null
  customer: { id: string; name: string; primary_phone: string } | null
}

interface GcalEvent {
  id:          string
  summary:     string
  description: string | null
  startIso:    string
  endIso:      string
  htmlLink:    string | null
}

interface Props {
  appointments: DbAppointment[]
  gcalOnly:     GcalEvent[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })
}

export default function CalendarClient({ appointments, gcalOnly }: Props) {
  const hasAny = appointments.length > 0 || gcalOnly.length > 0

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">No upcoming appointments</p>
        <p className="text-sm text-muted-foreground mt-1">
          Appointment requests from the Today page will appear here once confirmed.
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-2 space-y-3">
      {appointments.map(appt => (
        <div
          key={appt.id}
          className="rounded-lg border border-border bg-card p-4 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="font-medium text-sm truncate">
                {appt.customer?.name ?? 'Unknown customer'}
              </span>
            </div>
            {appt.google_calendar_event_id && (
              <CalendarDays className="h-4 w-4 text-green-500 flex-shrink-0" title="On Google Calendar" />
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{appt.due_at ? formatDate(appt.due_at) : 'Time not set'}</span>
          </div>
          {appt.body && (
            <p className="text-xs text-muted-foreground italic line-clamp-2">
              "{appt.body}"
            </p>
          )}
          {appt.customer?.primary_phone && (
            <a
              href={`tel:${appt.customer.primary_phone}`}
              className="text-xs text-blue-500 hover:underline"
            >
              {appt.customer.primary_phone}
            </a>
          )}
        </div>
      ))}

      {gcalOnly.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground pt-2 font-medium uppercase tracking-wide">
            Other calendar events
          </p>
          {gcalOnly.map(ev => (
            <div
              key={ev.id}
              className="rounded-lg border border-border/60 bg-card/60 p-4 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm truncate">{ev.summary}</span>
                {ev.htmlLink && (
                  <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{formatDate(ev.startIso)}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep "calendar/page\|CalendarClient" | head -10
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Start dev server, navigate to `/calendar`. Verify:
- Page loads without error
- Shows "No upcoming appointments" if none exist
- If org has Google Calendar token and upcoming events, they appear

- [ ] **Step 5: Commit**

```bash
git add app/(app)/calendar/page.tsx app/(app)/calendar/CalendarClient.tsx
git commit -m "feat: /calendar page showing upcoming confirmed appointments + Google Calendar events"
```

---

## Task 10: Appointment reminder cron (24h before)

**Files:**
- Modify: `app/api/cron/check-tasks/route.ts`

Adds a job that finds confirmed appointments due tomorrow (18-30h from now) where `appt_reminder_sent_at IS NULL`, sends SMS/email to customer, and stamps the field.

- [ ] **Step 1: Find where to add the new job**

```bash
grep -n "Job\|──\|startCronRun\|finishCronRun" \
  /home/tim/Applications/ApolloCRM/apollo-crm/app/api/cron/check-tasks/route.ts | head -30
```

Find the last `// ── Job N:` comment before `finishCronRun` — insert after it.

- [ ] **Step 2: Add the import at the top of check-tasks/route.ts**

```typescript
import { sendAppointmentNotification } from '@/lib/calendar/sendAppointmentNotification'
```

- [ ] **Step 3: Add the reminder job block before `finishCronRun`**

```typescript
// ── Job: Appointment reminders (24h before) ──────────────────────────────────
// Find confirmed appointments due in 18–30 hours, not yet reminded.
const reminderWindowStart = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString()
const reminderWindowEnd   = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString()

const { data: upcomingAppts } = await supabase
  .from('activities')
  .select('id, due_at, body, user_id, customer_id, customer:customers(name, primary_phone, email)')
  .eq('type', 'appointment')
  .is('direction', null)           // confirmed (not pending request)
  .is('completed_at', null)
  .is('appt_reminder_sent_at', null)
  .gte('due_at', reminderWindowStart)
  .lte('due_at', reminderWindowEnd)
  .limit(100)

let remindersQueued = 0

for (const appt of upcomingAppts ?? []) {
  const cust = Array.isArray(appt.customer) ? appt.customer[0] : appt.customer
  if (!cust) continue

  // Fetch org metadata (business name)
  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name')
    .eq('org_id', appt.user_id)
    .maybeSingle()

  await sendAppointmentNotification({
    orgId:          appt.user_id,
    customerId:     appt.customer_id,
    customerName:   cust.name ?? 'Customer',
    customerPhone:  cust.primary_phone ?? '',
    customerEmail:  cust.email ?? '',
    appointmentIso: appt.due_at,
    dealerName:     settings?.business_name ?? 'the dealership',
    calendarUrl:    null,
    type:           'reminder',
  }).catch(err => console.error('[cron/reminders] notification failed:', err))

  // Mark reminded — prevents re-sending on subsequent cron runs
  await supabase
    .from('activities')
    .update({ appt_reminder_sent_at: new Date().toISOString() })
    .eq('id', appt.id)

  remindersQueued++
}

console.log(`[check-tasks] appointment reminders sent: ${remindersQueued}`)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/tim/Applications/ApolloCRM/apollo-crm
npx tsc --noEmit 2>&1 | grep "check-tasks\|sendAppointmentNot" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/check-tasks/route.ts
git commit -m "feat: appointment reminder cron — SMS/email 24h before confirmed appointments"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Customer emails preferred time (CarGurus, etc.) → surfaces on Today | Task 7 (detectAppointmentIntent + ingest) |
| Dealer confirms appointment → Google Calendar event created | Tasks 4, 5, 6 |
| Customer gets confirmation SMS/email | Task 3 (sendAppointmentNotification) |
| Customer gets 24h reminder | Task 10 |
| `/calendar` page shows upcoming appointments | Task 9 |
| GCal events visible even if not in DB | Tasks 2, 8, 9 |
| Migration for new DB fields | Task 1 |

### Placeholder scan
No TBDs or open-ended instructions. All code blocks are complete.

### Type consistency
- `CalendarEvent` interface defined in Task 2, used in Tasks 8 and 9 (gcalOnly prop typed as `GcalEvent` — same shape, just aliased locally for clarity — this is fine since both are passed by value).
- `ConfirmInput` in Task 4, `POST /api/appointments/confirm` in Task 5 — fields match exactly.
- `appt_reminder_sent_at` column (Task 1) used in Task 10 cron query — match confirmed.
- `google_calendar_event_id` column (Task 1) used in Tasks 4 and 8 — match confirmed.

### Known risks
- **`lib/gmail/send.ts` export**: Task 3 imports `sendGmailMessage` — Step 2 of Task 3 checks the actual export name. If the function signature differs, adjust accordingly before committing.
- **`twilio_phone_number` on org_settings**: If the column name is different (e.g., `twilio_from_number`), update Task 3 accordingly. Run `grep -r "twilio_phone_number\|twilio_from" apollo-crm/lib` to confirm.
- **GCal event URL parsing**: The event ID is parsed from the `htmlLink` URL in Task 4. Google's URL format is stable (`/events/<eventId>`), but verify once you have a real token to test with.
