---
phase: 08-showings
plan: "04"
subsystem: cron, notifications
tags: [cron, email, resend, showings, idempotent, reminders]

# Dependency graph
requires:
  - phase: 08-showings/08-01
    provides: showings table with reminder_sent_at column (migration 192 amendment)
provides:
  - lib/cron/jobs/showingReminders.ts: runShowingReminders() — email reminders to agents 22-26h before showings
  - app/api/cron/check-tasks/route.ts: showingReminders job registered
  - reminder_sent_at column on showings (appended to migration 192)
affects: [08-05, 08-06, 08-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Agent email resolved via supabase.auth.admin.getUserById(agent_id) — same pattern as dealerFollowUps/reFollowUps
    - reminder_sent_at IS NULL guard for idempotency — same pattern as appt_reminder_sent_at on activities
    - cron job passes supabase from caller (createServiceClient) — consistent with all other jobs

key-files:
  created:
    - lib/cron/jobs/showingReminders.ts
  modified:
    - app/api/cron/check-tasks/route.ts
    - supabase/migrations/192_showings_cal_gcal_columns.sql

key-decisions:
  - "SMS omitted: twilio_agent_phone column does not exist on org_settings; email-only path per plan fallback rule"
  - "Agent email from supabase.auth.admin.getUserById — not stored on profiles table"
  - "reminder_sent_at appended to migration 192 (not yet applied) rather than creating 192b"
  - "Partial index on (scheduled_at) WHERE reminder_sent_at IS NULL AND status='scheduled' for cron query performance"

# Metrics
duration: 20min
completed: 2026-05-28
---

# Phase 8 Plan 04: Showing Reminders Cron Job Summary

**runShowingReminders() cron job — emails agents 22-26h before scheduled showings, deduped via reminder_sent_at stamp, registered in check-tasks infrastructure**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-05-28
- **Tasks:** 2/2
- **Files modified:** 2 (+ 1 migration amended, 1 created)

## What Was Built

Task 1 appended `reminder_sent_at TIMESTAMPTZ` to migration 192 (not yet applied to prod) along with a partial index for cron query performance. Task 2 created `lib/cron/jobs/showingReminders.ts` and registered it in the check-tasks route.

The job:
- Queries `showings` with `status='scheduled'`, `reminder_sent_at IS NULL`, `scheduled_at` in 22-26h window
- Resolves agent display name from `profiles` and email from `supabase.auth.admin.getUserById(agent_id)`
- Sends email via `sendNotificationEmail` (Resend) — silent no-op if RESEND_API_KEY absent
- Stamps `reminder_sent_at` after send to prevent double-fire on cron re-runs
- Limit 500 rows per run
- Errors logged with structured context (no stack traces)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SMS block removed — twilio_agent_phone column does not exist**

- **Found during:** Task 2 research
- **Issue:** Plan referenced `org_settings.twilio_agent_phone` but that column does not exist in any migration. No phone field exists on `profiles` either.
- **Fix:** Per plan's fallback instruction ("If `twilio_agent_phone` doesn't exist in org_settings, omit the SMS block and send email only"), SMS block was removed entirely.
- **Files modified:** lib/cron/jobs/showingReminders.ts

**2. [Rule 1 - Bug] Agent email lookup corrected — profiles has no email column**

- **Found during:** Task 2 research
- **Issue:** Plan template used `profiles(id, full_name, email)` in the select join, but `profiles` has no `email` column and no `full_name` column (it's `display_name`).
- **Fix:** Agent email resolved via `supabase.auth.admin.getUserById(agent_id)` — same pattern used by `reFollowUps.ts` and `dealerFollowUps.ts`.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| SMS omitted (email-only) | `twilio_agent_phone` column absent from org_settings; plan explicitly allows email-only fallback |
| Auth admin lookup for agent email | `profiles` stores only `display_name` and `role`; email lives in Supabase Auth user record |
| reminder_sent_at appended to migration 192 | Migration not yet applied; amendment is cleaner than a separate 192b migration |

## Next Phase Readiness

- Plan 08-05 (Cal.com embed UI) is unblocked
- showing_count was not touched (trigger in migration 191 owns it)
- `npx tsc --noEmit` clean for new files; pre-existing errors in listings/[id]/page.tsx are Phase 7 carryover
