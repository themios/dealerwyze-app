---
phase: 07-listing-intelligence
plan: "03"
subsystem: api
tags: [rentcast, real-estate, listings, cma, mls, vehicles, vertical-guard, cache]

# Dependency graph
requires:
  - phase: 07-01
    provides: vehicles columns import_source, import_raw_json, showing_count, price_change_count, price_change_log added by migrations 189-191
provides:
  - lib/listings/rentcast.ts: fetchPropertyByAddress, fetchCMA, buildFullAddress
  - POST /api/listings/import-mls: MLS# import via RentCast address lookup, immediate DB insert
  - GET /api/listings/[id]/metrics: days_on_market, showing_count, price change data
  - GET /api/listings/[id]/cma: RentCast AVM comparables with 7-day cache
affects:
  - 07-02: shares listings API directory (no file conflicts; parallel execution)
  - Phase 10 (Listing Video): listing records created here are the source
  - Future UI: import-mls returns id for redirect to /vehicles/{id}

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vertical guard: requireProfile() → fetch org.vertical → 403 if not real_estate"
    - "RentCast key guard at call time (not module load) to keep build clean without key"
    - "RE placeholder values: year=0, make='RE', model=address_line1.slice(0,100)"
    - "7-day CMA cache in market_data_json + market_checked_at (same as dealer market-check)"
    - "MLS import saves immediately (no preview): returns 201 + {id, ...fields} for UI redirect"
    - "503 with clear message when RENTCAST_API_KEY absent"

key-files:
  created:
    - lib/listings/rentcast.ts
    - app/api/listings/import-mls/route.ts
    - app/api/listings/[id]/metrics/route.ts
    - app/api/listings/[id]/cma/route.ts
  modified: []

key-decisions:
  - "RentCast lookup is best-effort in import-mls: API error (not missing key) does not block the insert"
  - "import_source set to 'mls_import' (not 'mls') for clarity on source distinction"
  - "CMA cache check: serves cache if market_data_json present AND age < 168h — no content inspection required"

patterns-established:
  - "Vertical guard pattern: fetch org from organizations table, compare .vertical to 'real_estate'"
  - "RE NOT NULL placeholders: year=0, make='RE', model=address for all insert paths"
  - "RENTCAST_API_KEY: validate inside each exported function, never at module load"

# Metrics
duration: 25min
completed: 2026-05-28
---

# Phase 7 Plan 03: RentCast API Wrapper + MLS Import, Metrics, and CMA Routes Summary

**RentCast wrapper (fetchPropertyByAddress, fetchCMA, buildFullAddress) plus LIST-03/04/05 API routes for MLS# import with immediate DB save, listing performance metrics, and 7-day cached CMA via RentCast AVM**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-28T00:00:00Z
- **Completed:** 2026-05-28T00:25:00Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments

- Built `lib/listings/rentcast.ts` with full TypeScript types; RENTCAST_API_KEY guard at call time keeps build clean
- POST /api/listings/import-mls: Zod-validated, merges RentCast property data, inserts vehicles row with RE placeholders immediately, returns 201 + {id, ...fields}
- GET /api/listings/[id]/metrics: reads denormalized showing_count and price change columns, calculates days_on_market live
- GET /api/listings/[id]/cma: RentCast AVM with 7-day cache; 422 if address incomplete, 503 if key absent, 502 on RentCast error

## Task Commits

1. **Task 1: Build lib/listings/rentcast.ts** - `b722e5b` (feat)
2. **Task 2: Build import-mls, metrics, and cma routes** - `e525876` (feat)

**Plan metadata:** (next commit)

## Files Created/Modified

- `lib/listings/rentcast.ts` - RentCast API wrapper with fetchPropertyByAddress, fetchCMA, buildFullAddress
- `app/api/listings/import-mls/route.ts` - POST endpoint, Zod validation, immediate vehicles insert (LIST-03)
- `app/api/listings/[id]/metrics/route.ts` - GET endpoint for listing performance metrics (LIST-04)
- `app/api/listings/[id]/cma/route.ts` - GET endpoint for RentCast CMA with 7-day cache (LIST-05)

## Decisions Made

- RentCast address lookup is best-effort in import-mls: API errors (not key absence) do not block the insert — we log and proceed with agent-provided fields only. Key absence returns 503.
- `import_source` set to `'mls_import'` rather than `'mls'` to distinguish from a potential future direct MLS feed.
- CMA cache served if data present and age < 168h — no content inspection needed (unlike the dealer market-check which checks for the AI report field).

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed unused catch variable in cma route**

- **Found during:** Task 2 (cma route lint)
- **Issue:** `catch (err)` in `buildFullAddress` try/catch was flagged as unused variable by eslint (max-warnings=0)
- **Fix:** Changed to `catch {` (bare catch, valid TS/ESNext)
- **Files modified:** `app/api/listings/[id]/cma/route.ts`
- **Verification:** `npx eslint app/api/listings/ lib/listings/ --max-warnings=0` — 0 problems
- **Committed in:** e525876 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (lint error, Rule 1)
**Impact on plan:** Trivial syntax fix required by project's zero-warnings lint gate. No scope change.

## Issues Encountered

None — build ran clean on first pass after lint fix.

## User Setup Required

None - no external service configuration required beyond RENTCAST_API_KEY (already documented in `.env.example` from plan 07-01).

## Next Phase Readiness

- All three LIST-03/04/05 routes are operational and build/lint clean
- import-mls returns `{id, ...fields}` with 201; UI can redirect to `/vehicles/{id}`
- CMA route ready for frontend integration; cache works without any additional setup
- Plan 07-02 (URL import + photo scan) runs in parallel — no conflicts with files in this plan
- Phase 10 (Listing Video) can reference listing records created via this import path

---
*Phase: 07-listing-intelligence*
*Completed: 2026-05-28*
