---
phase: 08-showings
plan: "05"
subsystem: ui
tags: [showings, real-estate, react, supabase, tailwind, cal-com]

requires:
  - phase: 08-02
    provides: POST/GET/PATCH/DELETE /api/showings CRUD API with org-scoped RLS

provides:
  - ShowingTimeline client component — fetch list, status update, schedule form, Cal.com link
  - app/(app)/listings/[id]/page.tsx — RE-only agent listing detail page mounting ShowingTimeline
  - Cal.com self-serve booking link render (calcom_username + calcom_event_slug from org_settings)

affects:
  - 08-06 (any future showings follow-on — ShowingTimeline is the primary showing UI)
  - Phase 9 (Transactions) — listing detail page is foundation for transaction section

tech-stack:
  added: []
  patterns:
    - RE vertical gate in server component via organizations.vertical check before rendering
    - Server-side calcom prop injection — org_settings fetched server-side, passed as props (never client-supplied)
    - useCallback fetchShowings pattern — re-used after every mutation for consistency
    - Optimistic status update with post-fetch refresh (not pure optimistic to stay in sync)
    - Inline feedback note editor per-row with keyed state maps

key-files:
  created:
    - app/(app)/listings/[id]/ShowingTimeline.tsx
    - app/(app)/listings/[id]/page.tsx
  modified: []

key-decisions:
  - "select('*') + explicit cast for vehicles query — Supabase type inference fails on string-concatenated select lists for RE-specific columns"
  - "Two new files in app/(app)/listings/[id]/ — dedicated RE agent listing page separate from vehicles/[id] which serves both verticals"
  - "Cal.com link composed server-side from org_settings; passed as read-only props to client component"

patterns-established:
  - "RE vertical gate: fetch organizations.vertical in server component, notFound() if not real_estate"
  - "Cal.com link format: https://cal.com/{username}/{slug}?metadata[orgId]=X&metadata[listingId]=Y"
  - "feedback_json.notes updated via PATCH /api/showings/[id] with feedback_notes key (API merges into JSONB)"

duration: 15min
completed: 2026-05-28
---

# Phase 8 Plan 05: Showings UI Summary

**ShowingTimeline client component + RE-only listing detail page covering full showing CRUD UI: list, status update, schedule new showing, feedback notes, and Cal.com self-serve booking link**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-28
- **Completed:** 2026-05-28
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- ShowingTimeline.tsx: fetches showings on mount, renders chronological list with formatted date/time, color-coded status badges, buyer name, and agent name
- Per-row status change buttons (PATCH /api/showings/[id]) for all status transitions (scheduled / completed / cancelled / no-show)
- Schedule form: date + time fields with future-date validation, POST to /api/showings with notes
- Inline feedback note editor per showing row, PATCH feedback_notes to /api/showings/[id]
- Cal.com booking link section renders only when calcom_username + calcom_event_slug are both set; includes copy-to-clipboard button
- Empty state, error state with retry, loading state all handled
- Listing detail page (app/(app)/listings/[id]/page.tsx): RE vertical gate, org_settings calcom props fetched server-side, listing details rendered before ShowingTimeline

## Task Commits

1. **Task 1: ShowingTimeline component** - `6fee8f8` (feat)
2. **Task 2: Listing detail page with ShowingTimeline** - `68ea8cb` (feat)

## Files Created

- `app/(app)/listings/[id]/ShowingTimeline.tsx` — Full showing management UI: list, status controls, schedule form, feedback notes, Cal.com link
- `app/(app)/listings/[id]/page.tsx` — RE-only server component listing detail page with ShowingTimeline mounted

## Decisions Made

- Used `select('*')` with explicit TypeScript cast for vehicles query — Supabase's type inference produces `GenericStringError` on concatenated select strings containing RE-specific column names. The cast is safe because migration 180 confirms these columns exist.
- Created dedicated `app/(app)/listings/[id]/` directory rather than modifying `app/(app)/vehicles/[id]/page.tsx` — keeps RE agent listing page separate; vehicles page already handles both verticals with `isRe` detection.
- Cal.com link fetched server-side from org_settings and passed as read-only props — org identity is always derived from `requireProfile()`, never from client.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed GenericStringError from Supabase type inference**

- **Found during:** Task 2 (listing detail page)
- **Issue:** Supabase type inference returned `GenericStringError` when using string-concatenated select lists for columns not in the generated DB types (RE-specific: address_line1, city, sqft, etc.)
- **Fix:** Changed to `select('*')` + explicit TypeScript interface cast for listing query result
- **Files modified:** app/(app)/listings/[id]/page.tsx
- **Verification:** `npx tsc --noEmit` exit code 0
- **Committed in:** 68ea8cb

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for TypeScript clean build. No scope creep.

## Issues Encountered

None beyond the Supabase type inference issue documented above.

## User Setup Required

None — all functionality uses existing API routes and org_settings columns added in migration 192.

To use the Cal.com booking link, agents must set `calcom_username` and `calcom_event_slug` in their org_settings (via the settings UI or direct DB update).

## Next Phase Readiness

- Full showing CRUD UI is live on the listing detail page
- SHOW-01 (schedule), SHOW-02 (view list), SHOW-03 (status update), SHOW-04 (feedback notes), SHOW-06 (Cal.com link) all covered
- Phase 9 (Transactions) can use the same listing detail page structure as a foundation for a transaction section
- No blockers

---
*Phase: 08-showings*
*Completed: 2026-05-28*
