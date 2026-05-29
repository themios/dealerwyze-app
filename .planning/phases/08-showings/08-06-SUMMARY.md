---
phase: 08-showings
plan: "06"
subsystem: ui
tags: [showings, real-estate, react, supabase, tailwind, next-js]

requires:
  - phase: 08-02
    provides: PATCH /api/showings/[id] for status updates from dashboard
  - phase: 08-05
    provides: ShowingTimeline patterns (vertical gate, status badge classes, status update flow)

provides:
  - GET /api/showings/upcoming — cross-listing upcoming showings for org, next 30 days, limit 500
  - app/(app)/showings/page.tsx — RE-only server component dashboard with ShowingsDashboard client island
  - ShowingsDashboard client island — status filter (all/scheduled/completed/cancelled/no_show), status update per row
  - DesktopSidebar Showings link — visible only when vertical === 'real_estate'

affects:
  - Phase 9 (Transactions) — /showings established as a working RE-only page pattern

tech-stack:
  added: []
  patterns:
    - Server component + client island pattern (server fetches DB directly, passes props to client for interactivity)
    - RE vertical gate: notFound() when org.vertical !== 'real_estate' (404 not 403)
    - org_id always from requireProfile() — never request-supplied
    - Date range cap: 30 days ahead, .limit(500) for unbounded safety

key-files:
  created:
    - app/api/showings/upcoming/route.ts
    - app/(app)/showings/ShowingsDashboard.tsx
    - app/(app)/showings/page.tsx
  modified:
    - components/layout/DesktopSidebar.tsx

key-decisions:
  - "Server component fetches DB directly (no HTTP round-trip to /api/showings/upcoming) — server pages should not call their own API routes"
  - "Client island handles filter + status updates; avoids full page re-render on every status change"
  - "notFound() for non-real_estate orgs — 404 is correct (do not disclose page existence to dealer orgs)"
  - "Date range capped at 30 days, limit 500 — enterprise constraint for unbounded query safety"
  - "Showings nav item injected into DealerSidebar only when vertical === 'real_estate' (runtime check, no separate component)"

patterns-established:
  - "RE-only page gate: fetch organizations.vertical in server component; notFound() if not real_estate"
  - "Cross-listing fetch pattern: eq('org_id') + gte('scheduled_at', now) + lte('scheduled_at', cutoff) + limit(500)"
  - "Client island status filter: filter state is client-only; data comes from server on initial render"

duration: 18min
completed: 2026-05-28
---

# Phase 8 Plan 06: Showings Dashboard Summary

**Cross-listing upcoming showings dashboard (GET /api/showings/upcoming + /showings page) with RE vertical gate, status filter, and inline status updates — covering SHOW-05 and completing Phase 8**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-28T~21:00Z
- **Completed:** 2026-05-28
- **Tasks:** 2
- **Files created:** 3, modified: 1

## Accomplishments

- GET /api/showings/upcoming: org-scoped, next 30 days, limit 500, joined listing address + contact + agent, ordered ascending
- /showings server page: RE vertical gate via notFound(), direct DB query (no self-HTTP-call), data passed to client island
- ShowingsDashboard client island: 5-way status filter pill bar, count badge, status update via PATCH /api/showings/[id], listing address linked to /listings/[id], empty state with helpful message
- DesktopSidebar: Showings nav item added; only rendered when vertical === 'real_estate'
- All gates: npx tsc --noEmit clean, npm run build exit 0, 384 tests pass

## Task Commits

1. **Task 1: GET /api/showings/upcoming** - `eb60231` (feat)
2. **Task 2: /showings dashboard page + sidebar nav** - `b7768b8` (feat)

## Files Created/Modified

- `app/api/showings/upcoming/route.ts` — GET handler: org-scoped, 30-day cap, limit 500, listing address + contact + agent joins
- `app/(app)/showings/ShowingsDashboard.tsx` — Client island: status filter, status update buttons, listing address links
- `app/(app)/showings/page.tsx` — Server component: RE vertical gate, direct DB fetch, renders ShowingsDashboard
- `components/layout/DesktopSidebar.tsx` — Added CalendarDays import; RE-only Showings nav item in DealerSidebar

## Decisions Made

- Server component queries DB directly rather than calling `/api/showings/upcoming` — API routes are for client-side fetch; server components can query Supabase directly and avoid the extra HTTP hop.
- `notFound()` for non-real_estate orgs (not redirect) — consistent with listing detail page pattern; 404 avoids disclosing page existence to dealer orgs.
- Client island handles all interactivity (filter + status updates) while server component owns initial data fetch — clean split: server for auth + data, client for UX state.
- `showing_count` never touched in any of these routes — trigger ownership respected throughout.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript check passed clean on first attempt. Build clean on first attempt.

## User Setup Required

None. No new environment variables. All functionality uses existing PATCH /api/showings/[id] route and Supabase RLS.

## Next Phase Readiness

- All 6 SHOW requirements are now covered: SHOW-01 through SHOW-06 (SHOW-05 = this plan)
- Phase 8 (Showings) is complete — all 8 plans done
- Phase 9 (Transactions & Commissions) is next — pre-build: broker interviews required before TXN-05/06
- /showings page pattern (server component + client island + RE gate) can be reused for future RE-only pages

---
*Phase: 08-showings*
*Completed: 2026-05-28*
