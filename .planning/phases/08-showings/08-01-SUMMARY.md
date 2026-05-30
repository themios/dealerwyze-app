---
phase: 08-showings
plan: "01"
subsystem: database, api, infra
tags: [supabase, migrations, google-calendar, cal.com, upstash, rate-limiting, env]

# Dependency graph
requires:
  - phase: 07-listing-intelligence
    provides: showings table established in migration 180; org_settings and org_google_tokens exist
provides:
  - Migration 192: cal_booking_uid (UNIQUE), gcal_event_id, cal_link on showings; calcom_username, calcom_event_slug on org_settings
  - updateCalendarEvent() exported from lib/google/calendar.ts
  - calWebhookLimiter exported from lib/rateLimit/upstash.ts
  - CALCOM_WEBHOOK_SECRET documented in lib/env/validate.ts (OPTIONAL_RE_SHOWINGS) and .env.example
affects: [08-02, 08-03, 08-04, 08-05, 08-06, 08-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - updateCalendarEvent follows same token-lookup pattern as createCalendarEvent (org_google_tokens lookup → makeCalendarClient)
    - Best-effort calendar operations never throw; return { ok: boolean } so callers can degrade gracefully
    - calWebhookLimiter follows same IP-based limiter pattern as bookingLimiter

key-files:
  created:
    - supabase/migrations/192_showings_cal_gcal_columns.sql
  modified:
    - lib/google/calendar.ts
    - lib/rateLimit/upstash.ts
    - lib/env/validate.ts
    - .env.example

key-decisions:
  - "CALCOM_WEBHOOK_SECRET is optional (not REQUIRED): absent secret → 400 on every webhook request (safe), no startup crash"
  - "showing_count not touched: trigger in migration 191 owns it entirely"
  - "updateCalendarEvent is best-effort (never throws) to match createCalendarEvent pattern"

patterns-established:
  - "Calendar mutations: always look up org_google_tokens by org_id, never env var fallback"
  - "Webhook rate limiters: IP-keyed, 100/min for Cal.com webhooks"
  - "Optional env var groups: OPTIONAL_RE_SHOWINGS array in validate.ts mirrors OPTIONAL_RE_LISTING"

# Metrics
duration: 15min
completed: 2026-05-28
---

# Phase 8 Plan 01: Showings Foundation Summary

**Cal.com + GCal columns on showings/org_settings via migration 192, updateCalendarEvent() in calendar lib, and calWebhookLimiter in upstash — zero type errors**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-28T00:00:00Z
- **Completed:** 2026-05-28
- **Tasks:** 3
- **Files modified:** 4 (+ 1 created)

## Accomplishments
- Migration 192 adds 3 columns to showings (cal_booking_uid UNIQUE, gcal_event_id, cal_link) and 2 to org_settings (calcom_username, calcom_event_slug) with partial indexes — fully additive, showing_count untouched
- updateCalendarEvent() appended to lib/google/calendar.ts: patches event fields or deletes (cancelled: true), same token-lookup pattern as createCalendarEvent(), best-effort { ok: boolean }
- calWebhookLimiter (100/min per IP) added to upstash.ts; CALCOM_WEBHOOK_SECRET documented as optional in validate.ts and .env.example

## Task Commits

1. **Task 1: Migration 192** - `b6fc9bc` (chore)
2. **Task 2: updateCalendarEvent + calWebhookLimiter** - `79d52d5` (feat)
3. **Task 3: CALCOM_WEBHOOK_SECRET documentation** - `29ac503` (chore)

## Files Created/Modified
- `supabase/migrations/192_showings_cal_gcal_columns.sql` - Additive migration: 3 showings columns + 2 org_settings columns + 2 partial indexes
- `lib/google/calendar.ts` - Added updateCalendarEvent() after getCalendarEvents()
- `lib/rateLimit/upstash.ts` - Added _calWebhookLimiter and calWebhookLimiter export
- `lib/env/validate.ts` - Exported OPTIONAL_RE_SHOWINGS with CALCOM_WEBHOOK_SECRET
- `.env.example` - RE Showings section with CALCOM_WEBHOOK_SECRET

## Decisions Made
- CALCOM_WEBHOOK_SECRET kept optional (not REQUIRED): if absent, webhook route returns 400 on every request (signature mismatch), which is safe — no startup crash and no silent data writes
- showing_count not touched: migration 191 trigger owns it; any touch would break the trigger contract
- updateCalendarEvent mirrors createCalendarEvent's best-effort, never-throws pattern for consistency across the calendar lib

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

To use Cal.com self-serve booking (SHOW-07):
1. Add `CALCOM_WEBHOOK_SECRET` to Vercel env vars (get from Cal.com > Webhooks > [your webhook] > Signing Secret)
2. Run migration 192 against production: `supabase db push` or apply via Supabase dashboard SQL editor

## Next Phase Readiness
- All Phase 8 plans can proceed: columns exist, GCal lib can update/cancel, rate limiter is ready, env var is documented
- Migration 192 must be applied to staging/production before any showing create/update routes are deployed

---
*Phase: 08-showings*
*Completed: 2026-05-28*
