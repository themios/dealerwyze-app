---
phase: 07-listing-intelligence
plan: "02"
subsystem: api
tags: [apify, anthropic, claude-vision, claude-haiku, real-estate, listing-import, vertical-guard]

# Dependency graph
requires:
  - phase: 07-01
    provides: vehicles table RE columns (import_source, import_raw_json, import_url, etc.), APIFY_API_TOKEN and RENTCAST_API_KEY env vars registered

provides:
  - lib/listings/apifyScrape.ts — scrapeListingUrl wrapping Apify for Zillow and Redfin
  - lib/listings/parseListingPhoto.ts — parseListingPhoto using Claude Vision RE prompt
  - lib/listings/parseListingText.ts — parseListingText using Claude Haiku RE text prompt
  - POST /api/listings/import-url — URL-based import (LIST-01)
  - POST /api/listings/scan-photo — photo/flyer scan (LIST-02)
  - POST /api/listings/import-text — paste-text import (LIST-01 Realtor.com fallback)

affects:
  - 07-04: listing confirmation form UI consumes these extraction endpoints
  - 07-03: import-url and import-text patterns established here

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Vertical guard pattern (organizations.vertical === 'real_estate') reused across all three routes
    - Extraction-only API pattern: routes return prefill fields; saving deferred to confirmation form
    - Graceful 503 degradation when optional env var (APIFY_API_TOKEN) is absent
    - User-friendly error re-throw from lib layer (no stack traces in responses)

key-files:
  created:
    - lib/listings/apifyScrape.ts
    - lib/listings/parseListingPhoto.ts
    - lib/listings/parseListingText.ts
    - app/api/listings/import-url/route.ts
    - app/api/listings/scan-photo/route.ts
    - app/api/listings/import-text/route.ts
  modified: []

key-decisions:
  - "Realtor.com URLs return 400 with explicit paste-text guidance — not a silent reject"
  - "photo_url excluded from prefill payload — photos handled via vehicle_photos upload"
  - "import-text has no billing gate — Claude Haiku cost is negligible"
  - "scan-photo reuses assertCanUseFeature('ai_scan') billing gate from dealer scan-image route"
  - "apifyScrape throws user-friendly error on actor failure; route maps to 503 for missing token"

patterns-established:
  - "Vertical guard: query organizations.vertical, return 403 if not real_estate — before any external call"
  - "requireProfile() first, then createClient() for org-scoped queries — never createServiceClient()"
  - "Lib functions validate inputs and throw descriptive errors; routes catch and map to HTTP status codes"
  - "RE rows: year=0, make='RE', model=address preserved — these extraction routes do not touch vehicles table"

# Metrics
duration: 25min
completed: 2026-05-28
---

# Phase 07 Plan 02: Listing Intelligence Extraction Layer Summary

**Three AI-backed extraction routes (Zillow/Redfin URL via Apify, listing flyer via Claude Vision, paste-text via Claude Haiku) returning prefill fields for the RE listing confirmation form — no DB writes**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-28
- **Completed:** 2026-05-28
- **Tasks:** 3
- **Files created:** 6

## Accomplishments

- Built `scrapeListingUrl` wrapping Apify actors for Zillow (ENK9p4RZHg0iVso52) and Redfin (ecomscrape~redfin) with full field mapping to vehicles RE columns
- Built `parseListingPhoto` using claude-opus-4-5 Vision prompt for listing flyers, with 5MB cap and MIME validation
- Built `parseListingText` using claude-haiku-4-5 for pasted Realtor.com text with 10k char truncation and 50 char minimum
- All three API routes enforce vertical guard (403 for non-RE orgs), return extraction-only payloads, and include user-actionable error messages
- Realtor.com URL returns 400 with explicit paste-text guidance; missing APIFY_API_TOKEN returns 503 (not 500 crash)

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/listings/apifyScrape.ts and parseListingPhoto.ts** - `4ee0454` (feat)
2. **Task 2: import-url and scan-photo routes (LIST-01, LIST-02)** - `520957b` (feat)
3. **Task 3: parseListingText lib and import-text route** - `0621828` (feat)

## Files Created/Modified

- `lib/listings/apifyScrape.ts` - Apify actor wrapper; Zillow/Redfin field mapping to vehicles columns; user-friendly error on failure
- `lib/listings/parseListingPhoto.ts` - Claude Vision RE prompt; 5MB size cap; mime type validation
- `lib/listings/parseListingText.ts` - Claude Haiku RE text prompt; 10k char truncation; 50 char minimum
- `app/api/listings/import-url/route.ts` - POST LIST-01; vertical guard; Realtor.com 400 with guidance; Apify call; 60s maxDuration
- `app/api/listings/scan-photo/route.ts` - POST LIST-02; vertical guard; ai_scan billing gate; Claude Vision extraction
- `app/api/listings/import-text/route.ts` - POST LIST-01 fallback; vertical guard; text length validation; Haiku extraction

## Decisions Made

- Realtor.com URLs explicitly rejected with actionable guidance (not silently ignored) — agents need to know what to do next
- photo_url excluded from prefill payload per plan constraint — photos managed via vehicle_photos upload
- No billing gate on import-text — Claude Haiku cost is negligible at scale
- apifyScrape re-throws with user-friendly message only; route maps missing-token to 503 (graceful degradation)

## Deviations from Plan

**1. [Rule 3 - Blocking] Fixed ApifyClient import**

- **Found during:** Task 1 (apifyScrape.ts type check)
- **Issue:** Plan scaffolded `import ApifyClient from 'apify-client'` but the package only has named exports — TypeScript error TS2351 "not constructable"
- **Fix:** Changed to `import { ApifyClient } from 'apify-client'`
- **Files modified:** `lib/listings/apifyScrape.ts`
- **Verification:** `npx tsc --noEmit` clean after fix
- **Committed in:** `4ee0454` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Import fix required for compilation. No scope creep.

## Issues Encountered

None beyond the ApifyClient import fix above.

## Next Phase Readiness

- All three extraction routes are live and type-clean
- Plan 07-03 (RentCast MLS lookup and CMA) extends the same `/api/listings/` directory
- Plan 07-04 (listing confirmation form UI) can now wire to these endpoints for prefill
- APIFY_API_TOKEN still needs to be obtained and set in Vercel before import-url is functional in staging

---
*Phase: 07-listing-intelligence*
*Completed: 2026-05-28*
