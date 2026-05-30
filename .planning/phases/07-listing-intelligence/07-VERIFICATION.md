---
phase: 07-listing-intelligence
verified: 2026-05-28T00:00:00Z
status: passed
score: 12/12 must-haves verified
gaps: []
human_verification:
  - test: "Paste a Zillow URL into the Import Listing panel on the RE /vehicles/new page"
    expected: "Fields pre-fill in the form (address, beds, baths, sqft, price) after ~20s Apify cold start"
    why_human: "Apify actor call requires live token and real network round-trip; cannot verify structurally"
  - test: "Confirm Import Listing panel is absent on dealer /vehicles/new page"
    expected: "Only the dealer vehicle form renders — no Import Listing accordion"
    why_human: "Vertical gate is runtime (useVertical hook reads org context); structural code is correct but UI state cannot be verified without a session"
---

# Phase 7: Listing Intelligence Verification Report

**Phase Goal:** Agent can import a listing from any source with AI assistance
**Verified:** 2026-05-28
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Agent can import a Zillow or Redfin listing from a URL | VERIFIED | `apifyScrape.ts` (185 lines) calls ApifyClient with Zillow/Redfin actor IDs; `import-url/route.ts` calls `scrapeListingUrl()` and returns prefill payload without DB write |
| 2 | Agent can paste listing text (Realtor.com) and extract fields | VERIFIED | `parseListingText.ts` (92 lines) calls Claude Haiku; `import-text/route.ts` wired to it with vertical guard |
| 3 | Agent can upload a listing photo/flyer and extract fields | VERIFIED | `parseListingPhoto.ts` (95 lines) calls Claude Vision (`claude-opus-4-5`); `scan-photo/route.ts` wired to it with billing gate |
| 4 | Agent can import via MLS# and have the record created immediately | VERIFIED | `import-mls/route.ts` calls `fetchPropertyByAddress()`, inserts to `vehicles` with `year=0, make='RE'`, returns new row |
| 5 | RE listing detail page shows performance metrics | VERIFIED | `ListingPerformanceCard.tsx` (272 lines) fetches `/api/listings/[id]/metrics` and renders `days_on_market`, `showing_count`, `price_change_count` |
| 6 | RE listing detail page shows CMA with 7-day cache | VERIFIED | `ListingPerformanceCard.tsx` fetches `/api/listings/[id]/cma`; CMA route caches in `market_data_json` with 168-hour TTL check |
| 7 | Import Listing panel appears only for RE vertical | VERIFIED | `NewPageInner()` in `vehicles/new/page.tsx` returns `<NewListingForm />` when `vertical === 'real_estate'` else `<NewVehicleForm />`; dealer form has no import panel |
| 8 | Dealer form is unchanged | VERIFIED | `NewVehicleForm` is a separate component with its own VIN/year/make/model fields; no cross-contamination |
| 9 | Price change log tracks only RE rows | VERIFIED | `app/api/vehicles/[id]/route.ts` guards price change tracking behind `currentVehicle.make === 'RE'` check |
| 10 | Schema migrations deployed for RE listing columns | VERIFIED | Migrations 189, 190, 191 exist in `supabase/migrations/` |
| 11 | New env vars documented and validated | VERIFIED | `APIFY_API_TOKEN` and `RENTCAST_API_KEY` present in both `lib/env/validate.ts` (lines 40-41) and `.env.example` (lines 187-188) |
| 12 | All API routes have auth gate | VERIFIED | All five routes (`import-url`, `scan-photo`, `import-text`, `import-mls`, `[id]/metrics`, `[id]/cma`) call `requireProfile()` first; all have RE vertical guard |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/listings/apifyScrape.ts` | Apify actor calls for Zillow/Redfin | VERIFIED | 185 lines; exports `scrapeListingUrl()`; uses `ApifyClient` with per-domain actor IDs |
| `lib/listings/parseListingPhoto.ts` | Claude Vision extraction | VERIFIED | 95 lines; calls `client.messages.create()` with image content block; model `claude-opus-4-5` |
| `lib/listings/parseListingText.ts` | Claude Haiku text extraction | VERIFIED | 92 lines; calls `client.messages.create()` with structured prompt; model `claude-haiku-4-5-20251001` |
| `lib/listings/rentcast.ts` | `fetchPropertyByAddress` and `fetchCMA` | VERIFIED | 168 lines; both functions exported; `fetchCMA` accepts property attributes |
| `app/api/listings/import-url/route.ts` | POST, requireProfile, no DB write | VERIFIED | Calls `scrapeListingUrl()`, returns prefill JSON; Realtor.com rejected with guidance |
| `app/api/listings/scan-photo/route.ts` | POST, requireProfile, billing gate | VERIFIED | Calls `parseListingPhoto()`; billing gate via `assertCanUseFeature('ai_scan')` |
| `app/api/listings/import-text/route.ts` | POST, requireProfile, no DB write | VERIFIED | Calls `parseListingText()`, returns prefill JSON |
| `app/api/listings/import-mls/route.ts` | POST, requireProfile, inserts vehicles | VERIFIED | Zod schema validation; inserts with `year=0, make='RE'`; RentCast best-effort |
| `app/api/listings/[id]/metrics/route.ts` | GET, requireProfile, RE vertical | VERIFIED | Returns `days_on_market`, `showing_count`, `price_change_count`, `price_change_log` |
| `app/api/listings/[id]/cma/route.ts` | GET, requireProfile, 7-day cache | VERIFIED | `CACHE_TTL_HOURS = 168`; reads/writes `market_data_json` + `market_checked_at` |
| `app/(app)/vehicles/new/page.tsx` | RE gets NewListingForm, dealer gets NewVehicleForm | VERIFIED | `useVertical()` hook gates the conditional; Import Listing panel inside `NewListingForm` only |
| `components/vehicle/ListingPerformanceCard.tsx` | Renders metrics + CMA for RE | VERIFIED | 272 lines; fetches both APIs; renders days on market, showings, price changes, comps |
| `supabase/migrations/189_listing_import_tracking.sql` | Migration exists | VERIFIED | File present |
| `supabase/migrations/190_listing_status_re.sql` | Migration exists | VERIFIED | File present |
| `supabase/migrations/191_listing_showing_count_trigger.sql` | Migration exists | VERIFIED | File present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `NewListingForm` | `/api/listings/import-url` | `fetch` in `handleUrlImport()` | WIRED | Response merged into form state via `mergeImportFields()` |
| `NewListingForm` | `/api/listings/import-text` | `fetch` in `handleTextExtract()` | WIRED | Response merged into form state |
| `NewListingForm` | `/api/listings/scan-photo` | `fetch` in `handlePhotoSelect()` | WIRED | Response merged into form state |
| `NewListingForm` | `/api/listings/import-mls` | `fetch` in `handleMlsImport()` | WIRED | Redirects to `/vehicles/${data.id}` after create |
| `import-url/route.ts` | `lib/listings/apifyScrape.ts` | `scrapeListingUrl()` import | WIRED | Direct import + await call |
| `scan-photo/route.ts` | `lib/listings/parseListingPhoto.ts` | `parseListingPhoto()` import | WIRED | Direct import + await call |
| `import-text/route.ts` | `lib/listings/parseListingText.ts` | `parseListingText()` import | WIRED | Direct import + await call |
| `import-mls/route.ts` | `lib/listings/rentcast.ts` | `fetchPropertyByAddress()` import | WIRED | Direct import + await call; failure is non-blocking |
| `cma/route.ts` | `lib/listings/rentcast.ts` | `fetchCMA()` import | WIRED | Direct import + await call; result cached to vehicles row |
| `ListingPerformanceCard` | `/api/listings/[id]/metrics` | `fetch` in component | WIRED | Line 77 |
| `ListingPerformanceCard` | `/api/listings/[id]/cma` | `fetch` in component | WIRED | Line 151 |
| `vehicles/[id]/page.tsx` | `ListingPerformanceCard` | import + conditional render | WIRED | Rendered only when `isRe === true` (line 291-293) |

### Anti-Patterns Found

None that block the goal. No placeholder returns, empty handlers, or TODO markers found in verified files.

### Human Verification Required

#### 1. Zillow URL Import End-to-End

**Test:** Log in as an RE org user, navigate to /vehicles/new, open the Import Listing panel, paste a live Zillow URL and click Import.
**Expected:** After ~20-30 seconds, address/beds/baths/sqft/price fields pre-fill. A success message appears.
**Why human:** Apify actor requires a live APIFY_API_TOKEN and network call; structural wiring is verified but functional execution cannot be confirmed without a live credential.

#### 2. Import Listing Panel Absent on Dealer Side

**Test:** Log in as a dealer org user, navigate to /vehicles/new.
**Expected:** The form shows VIN, year, make, model fields. No "Import Listing" accordion appears.
**Why human:** Vertical gate depends on `useVertical()` hook reading live org context at runtime; structural branching is correct but runtime behavior requires a session.

### Gaps Summary

No gaps. All 12 must-haves are structurally verified. The two human verification items are advisory (confirm live API and UI rendering) — they do not indicate code defects.

---

_Verified: 2026-05-28_
_Verifier: Claude (gsd-verifier)_
