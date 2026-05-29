---
phase: 08-showings
plan: "02"
subsystem: api
tags: [showings, google-calendar, supabase, zod, rls, real-estate]

requires:
  - phase: 08-01
    provides: migration 192 (showings cal_booking_uid/gcal_event_id/cal_link columns), updateCalendarEvent() in lib/google/calendar.ts

provides:
  - POST /api/showings — creates showing with org/agent scoping, GCal best-effort
  - GET /api/showings?listing_id=X — lists showings for a listing, org-scoped
  - PATCH /api/showings/[id] — updates status/scheduled_at/feedback_notes, GCal update best-effort
  - DELETE /api/showings/[id] — hard delete, GCal cancel best-effort, trigger decrements showing_count

affects:
  - 08-03 (Cal.com webhook — inserts into same showings table)
  - 08-05 (Showings UI — reads from GET /api/showings)

tech-stack:
  added: []
  patterns:
    - own-or-404 pattern (fetch before mutate with org_id guard, return 404 not 403)
    - GCal best-effort pattern (try/catch wrapper, never blocks primary response)
    - feedback_json merge pattern (spread existing, overwrite notes key only)
    - DB trigger ownership (showing_count never touched in route code)

key-files:
  created:
    - app/api/showings/route.ts
    - app/api/showings/[id]/route.ts
  modified: []

key-decisions:
  - "GCal sync fires after DB insert/update/delete succeeds — never before, never blocking"
  - "own-or-404 on all mutations: fetch with eq('org_id') before mutate, return 404 if missing"
  - "feedback_json.notes written via spread merge to preserve other feedback keys (interest_level, objections, etc.)"
  - "Hard delete on DELETE (no soft-cancel flag) — trigger handles showing_count, GCal cancel before delete"

patterns-established:
  - "GCal best-effort: always in try/catch after DB write; log error, continue"
  - "org_id always from profile.org_id — never from request body or params"
  - "Zod safeParse at boundary; return 400 with generic message on failure"
  - "own-or-404: maybeSingle() + null check; prefer 404 over 403 for ownership"

duration: 12min
completed: 2026-05-28
---

# Phase 8 Plan 02: Showings CRUD API Summary

**Full showing lifecycle API (create/list/update/delete) with org-scoped RLS and best-effort Google Calendar sync on all write operations**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-28T~08:00Z
- **Completed:** 2026-05-28
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- POST /api/showings: Zod-validated create with listing ownership check, GCal event creation best-effort, gcal_event_id stored on success
- GET /api/showings?listing_id=X: org-scoped list with contact + agent joins, ordered by scheduled_at desc, limit 200
- PATCH /api/showings/[id]: own-or-404 guard, updates status/scheduled_at/feedback_json.notes with merge semantics; GCal update or cancel based on status
- DELETE /api/showings/[id]: GCal cancel before hard delete; DB trigger fires automatically for showing_count — never touched in route code

## Task Commits

1. **Task 1: POST /api/showings + GET /api/showings** - `870b459` (feat)
2. **Task 2: PATCH + DELETE /api/showings/[id]** - `c332769` (feat)

## Files Created

- `app/api/showings/route.ts` — GET (list by listing_id) + POST (create showing) handlers
- `app/api/showings/[id]/route.ts` — PATCH (status/reschedule/feedback) + DELETE handlers

## Decisions Made

- Hard delete chosen for DELETE (no soft-cancel flag) — the DB trigger on DELETE handles showing_count decrement; GCal cancel fires before the delete so gcal_event_id is still available
- feedback_json notes written as spread merge (`{ ...existing, notes: value }`) to preserve any other keys the Cal.com webhook (Plan 03) might write
- GCal sync positioned after DB write completes, wrapped in try/catch — ensures showing is always saved even if Google Calendar API is unavailable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript check passed clean on first run (exit code 0).

## User Setup Required

None - no new environment variables. GCal uses existing `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` + per-org `org_google_tokens.calendar_refresh_token`.

## Next Phase Readiness

- All four CRUD endpoints are live and org-scoped
- Plan 03 (Cal.com webhook) can insert directly into `showings` with `cal_booking_uid` set
- Plan 05 (Showings UI) can read from `GET /api/showings?listing_id=X` and PATCH status/feedback
- No blockers

---
*Phase: 08-showings*
*Completed: 2026-05-28*
