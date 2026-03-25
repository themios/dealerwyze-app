# Autoresponder Implementation Plan (Email + SMS Per Contact)

## Goal
Make autoresponder highly visible and controllable on each contact, with campaign selection, start date/time, automatic stop on customer response, opt-out compliance, and easy restart.

## Current State (Already in Code)
- Sequence model exists: `sequences`, `sequence_steps`, `customer_sequences`, and queued `activities`.
- Enrollment endpoint exists: `POST /api/customer-sequences` (supports `start_immediately`).
- Sequence status endpoint exists: `PATCH /api/customer-sequences/[id]` (`active/paused/cancelled/completed`).
- Sequence runner exists in cron: `app/api/cron/check-tasks/route.ts`.
- STOP/unsubscribe handling exists (SMS via Twilio, email unsubscribe link).
- UI sheet exists for enrollment (`components/sequences/EnrollSheet.tsx`) but is not wired into contact detail.

## Key Gaps
1. No obvious per-contact autoresponder controls on lead/contact page.
2. No unified per-contact view showing both channels (email + SMS) side-by-side.
3. Enrollment API currently returns one enrollment (`limit(1)`), not channel-aware status for both channels.
4. Start date/time selection is not implemented (only immediate vs scheduled template timing).
5. Auto-stop behavior is inconsistent across inbound paths and doesn’t always update `customer_sequences` status clearly.
6. “Customer replied, take over” operator notification is not consistently generated.
7. Restart flow exists partially (resume/re-enroll), but not explicit in contact UI.

## Product Requirements
- Each contact has an obvious **Autoresponder** section with separate Email and SMS controls.
- User can pick a predesigned campaign per channel and select start date/time.
- Ship default starter campaigns so feature is usable on day 1 without setup.
- Autoresponder stops ONLY when: (1) customer responds via the system (inbound SMS/email captured), or (2) rep manually flips it off.
- Rep manual flip-off: offer both **Pause** (resume same campaign later) and **Cancel** (done; restart picks a new campaign — useful for re-engagement).
- User is notified when autoresponder stops due to customer reply so they can take over.
- User can restart with same or different campaign later.
- STOP/UNSUBSCRIBE must stop campaign and prevent further sends until re-opt-in.
- All autoresponder messages (sent and received) are saved in the customer's activity timeline, clearly labeled with the campaign step name so automated messages are distinguishable from manual rep messages.
- Customer record is the audit trail — no separate audit log needed.

## Proposed UX
## 1) Contact Detail: New “Autoresponder” Card
- Location: near primary actions on `customers/[id]`.
- Two rows:
  - `Email Autoresponder`
  - `SMS Autoresponder`
- Each row shows:
  - Status badge (`Not Active`, `Scheduled`, `Active`, `Paused`, `Stopped: Replied`, `Stopped: Unsubscribed`, `Completed`)
  - Campaign name
  - Next send time
  - Primary action button (`Start`, `Pause`, `Resume`, `Restart`, `Stop`)

## 2) Start Flow (per channel)
- Click `Start` opens campaign picker sheet/modal:
  - List campaigns for selected channel.
  - Step preview with intervals and message templates.
  - Start options:
    - `Start now`
    - `Start at date/time` (timezone-aware)
- Confirm action creates enrollment + queued steps.

## 3) Response Takeover UX
- On inbound response while sequence is active:
  - Sequence auto-stops.
  - Create visible signal for user:
    - high-priority task: `Customer replied - take over conversation` (linked to contact)
    - status chip in autoresponder card: `Stopped: Replied`

## 4) Restart UX
- If stopped due to reply/unsub/manual stop:
  - `Restart` prompts campaign selection + start date/time again.
  - Honor unsubscribed flags (block start until opt-in).

## Data Model Changes
## 1) `customer_sequences` enhancements
Add fields:
- `channel text check (channel in ('email','sms'))` (snapshot from `sequences.channel`)
- `start_at timestamptz null` (requested start)
- `stop_reason text null` (e.g. `replied`, `unsubscribed`, `manual`, `completed`)
- `stopped_at timestamptz null`
- `last_step_sent_at timestamptz null` (optional, for operator visibility)

## 2) Constraints / indexes
- Partial uniqueness to prevent multiple concurrent enrollments per customer/channel:
  - one row where `status in ('active','paused')` per `(customer_id, channel)`.
- Index for channel-scoped dashboard queries:
  - `(org_id, customer_id, channel, status)`.

## API Changes
## 1) `GET /api/customer-sequences`
- Return channel-aware summary for a contact (both channels), not a single `limit(1)` enrollment.
- Suggested response shape:
  - `{ email: EnrollmentStatus | null, sms: EnrollmentStatus | null }`

## 2) `POST /api/customer-sequences`
- Inputs:
  - `customer_id`
  - `sequence_id`
  - `start_mode: 'now' | 'scheduled'`
  - `start_at?: ISO string`
- Behavior:
  - Validate channel opt-in (`unsubscribe_email` / `unsubscribe_sms`).
  - Cancel/close existing active enrollment for same channel (or reject with explicit conflict).
  - Queue steps based on selected start mode/time.

## 3) `PATCH /api/customer-sequences/[id]`
- Keep `pause/resume/cancel/complete`.
- Add `restart` workflow option (or perform restart via new `POST`).
- Ensure status transitions set `stop_reason/stopped_at` consistently.

## 4) Inbound handlers (consistency pass)
Update all inbound sources to stop active sequences consistently:
- Twilio inbound SMS route
- Email reply ingestion (`pollReplies` / Gmail poll path)
- Any manual “Replied” action in UI

On stop due to response:
- Update `customer_sequences.status = 'paused'` (recommended for restart) with `stop_reason='replied'`.
- Complete pending queued sequence activities.
- Create “take over” task if one does not already exist.

On stop due to unsubscribe:
- Update `customer_sequences.status = 'cancelled'`, `stop_reason='unsubscribed'`.
- Complete pending sequence activities as cancelled/unsubscribed.

## Scheduling Rules
- `start_at` anchors schedule.
- For each step:
  - `due_at = start_at + day_offset + send_hour` logic (timezone-aware).
- If `start_mode='now'` and first step offset allows immediate send, queue first step at `now`.
- Use org timezone consistently for all date/time displays and calculations.

## Compliance Rules
- Block enrollment if channel unsubscribed.
- STOP/UNSUBSCRIBE immediately halts pending steps for relevant channel.
- Re-enable only after explicit opt-in (`START` / manual consent update).

## Operator Notification Rules
On inbound response with active sequence:
- Create one actionable task (deduped) for assigned user/admin fallback:
  - `task_type='lead_followup'`
  - title: `Customer replied - take over`
  - linked customer id
  - due now/high priority
- Keep timeline entry for traceability (`Sequence auto-stopped: customer replied`).

## Implementation Phases
1. **Phase 1: Foundation + API contract** ✅ (2026-03-15)
- Migration 073: channel, start_at, stop_reason, stopped_at, last_step_sent_at columns + partial unique index + backfill.
- GET returns `{ email: EnrollmentEntry | null, sms: EnrollmentEntry | null }` with next_step_due.
- POST accepts `start_at`, stores channel snapshot, cancels conflicting active enrollment, anchors step due_at to start_at, adds step_label to activity body JSON.
- PATCH records stop_reason + stopped_at on cancel/pause/complete; clears them on resume.

2. **Phase 2: Contact UI (obvious controls)** ✅ (2026-03-15)
- `components/sequences/AutoresponderCard.tsx` — Email + SMS rows, status badges, Start/Pause/Resume/Cancel/Restart buttons, next-step due time, replied alert.
- `EnrollSheet` updated: "Start Now" + "Schedule" with date/time picker; passes start_at to POST.
- `CustomerDetailClient` renders AutoresponderCard after primary actions, passes unsubscribe flags.

3. **Phase 3: Auto-stop consistency + notifications** ✅ (2026-03-15)
- `lib/sequences/stopSequenceOnReply.ts` — shared helper: pauses enrollment (stop_reason='replied'), cancels pending steps, creates deduped takeover task.
- `lib/sequences/cancelSequenceOnUnsubscribe.ts` — sets status=cancelled, stop_reason='unsubscribed'.
- Twilio inbound: normal reply → stopSequenceOnReply (channel=sms); STOP keyword → cancelSequenceOnUnsubscribe.
- pollReplies Gmail + IMAP paths: call stopSequenceOnReply (channel=email) after recording inbound activity.
- check-tasks Job 11: call stopSequenceOnReply when reply detected before sending next step.

4. **Phase 4: Restart + QA hardening** ✅ (2026-03-15)
- ActivityTimeline: Bot icon + step label badge for automated messages; `[Auto: stepLabel]` prefix on sent activity body.
- sendSequenceEmail: accepts stepLabel, prefixes logged activity body for timeline display.
- check-tasks Job 11: parses step_label + customer_name from body JSON and passes to sendSequenceEmail.
- Starter campaigns: POST /api/sequences/seed-starters creates 3 campaigns (5-step email, 3-step SMS, 3-step re-engagement).
- SequencesClient: "Load starter campaigns" button in empty state.

## Acceptance Criteria
- Contact page shows clear autoresponder controls for both Email and SMS.
- User can start campaign with selected start date/time.
- Pending sequence steps are created correctly per schedule.
- Any inbound customer reply stops active campaign and creates takeover signal.
- STOP/UNSUBSCRIBE prevents further automated messages for that channel.
- User can restart campaign later (when compliant to do so).
- Timeline reflects all campaign state changes and sends.

## Test Plan (Minimum)
- Start email campaign now; verify queued steps and status.
- Start SMS campaign scheduled; verify first due timestamp.
- Receive inbound SMS reply; verify auto-stop + takeover task.
- Receive inbound email reply; verify auto-stop + takeover task.
- Trigger STOP; verify unsubscribe flag + sequence cancellation.
- Try restarting while unsubscribed; verify blocked with clear error.
- Re-opt-in then restart; verify success.
- Verify multi-tenant/org isolation on all reads/writes.

## Rollout Notes
- Feature flag recommended (`NEXT_PUBLIC_AUTORESPONDER_V2`) for gradual rollout.
- Backfill migration required to populate `customer_sequences.channel` from `sequences.channel`.
- Add one-time script to normalize stale enrollments (active with no pending steps).
